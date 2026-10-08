<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use PDO;
use RuntimeException;

final class CollectionController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** GET /api/collections/pending - Customer credit balances & unpaid counts */
    public function getPendingCredits(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.sell');

        $stmt = $this->pdo->query(
            "SELECT 
                c.id AS customer_id,
                c.name AS customer_name,
                c.phone,
                c.credit_limit,
                COUNT(i.id) AS unpaid_bills,
                SUM(i.grand_total - i.amount_paid) AS total_due
             FROM customers c
             JOIN invoices i ON i.customer_id = c.id
             WHERE i.status = 'ACTIVE' AND i.payment_status IN ('UNPAID', 'PARTIAL') AND i.deleted_at IS NULL
             GROUP BY c.id, c.name, c.phone, c.credit_limit
             HAVING total_due > 0
             ORDER BY total_due DESC"
        );

        $pending = $stmt->fetchAll();
        $totalPending = array_reduce($pending, fn (float $sum, array $row) => $sum + (float) $row['total_due'], 0.0);

        Response::json([
            'pending' => $pending,
            'total_pending' => $totalPending,
        ]);
    }

    /** GET /api/collections/receipts - Past collection history */
    public function getPastReceipts(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.sell');

        $stmt = $this->pdo->query(
            "SELECT 
                r.id,
                r.receipt_no,
                r.customer_id,
                c.name AS customer_name,
                r.amount,
                r.payment_method,
                u.name AS collected_by,
                r.created_at
             FROM collection_receipts r
             JOIN customers c ON c.id = r.customer_id
             JOIN users u ON u.id = r.collected_by
             ORDER BY r.id DESC"
        );

        $receipts = $stmt->fetchAll();
        $totalCollected = array_reduce($receipts, fn (float $sum, array $row) => $sum + (float) $row['amount'], 0.0);

        Response::json([
            'receipts' => $receipts,
            'total_collected' => $totalCollected,
        ]);
    }

    /** GET /api/collections/customer-unpaid/{customerId} - Get unpaid invoices for modal */
    public function getCustomerUnpaidInvoices(string $customerId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.sell');

        $custStmt = $this->pdo->prepare("SELECT id, name, phone, credit_limit FROM customers WHERE id = :id");
        $custStmt->execute(['id' => (int) $customerId]);
        $customer = $custStmt->fetch();

        if ($customer === false) {
            Response::error('Customer not found', 404);
        }

        $invStmt = $this->pdo->prepare(
            "SELECT id, invoice_no, grand_total, amount_paid, (grand_total - amount_paid) AS pending_amount, created_at
             FROM invoices
             WHERE customer_id = :cid AND status = 'ACTIVE' AND payment_status IN ('UNPAID', 'PARTIAL') AND deleted_at IS NULL
             ORDER BY id ASC"
        );
        $invStmt->execute(['cid' => (int) $customerId]);
        $invoices = $invStmt->fetchAll();

        $totalOutstanding = array_reduce($invoices, fn (float $sum, array $inv) => $sum + (float) $inv['pending_amount'], 0.0);

        Response::json([
            'customer' => $customer,
            'invoices' => $invoices,
            'total_outstanding' => $totalOutstanding,
        ]);
    }

    /** POST /api/collections/pay - Process collection payment */
    public function processPayment(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.sell');

        $body = Request::json();
        $customerId = (int) ($body['customer_id'] ?? 0);
        $payAmount = (float) ($body['amount'] ?? 0);
        $paymentMethod = (string) ($body['payment_method'] ?? 'CASH');
        $mode = (string) ($body['mode'] ?? 'AUTO'); // AUTO or SELECTED_INVOICES
        $selectedInvoiceIds = (array) ($body['invoice_ids'] ?? []);

        if ($customerId <= 0) {
            Response::error('Customer ID is required', 422);
        }

        if ($payAmount <= 0 && $mode === 'AUTO') {
            Response::error('Payment amount must be greater than zero', 422);
        }

        $this->pdo->beginTransaction();

        try {
            // Generate Receipt Number: REC00001
            $maxId = (int) ($this->pdo->query("SELECT COALESCE(MAX(id), 0) FROM collection_receipts")->fetchColumn() ?: 0);
            $receiptNo = 'REC' . str_pad((string) ($maxId + 1), 6, '0', STR_PAD_LEFT);

            // Fetch target unpaid invoices
            if ($mode === 'SELECTED_INVOICES' && !empty($selectedInvoiceIds)) {
                $placeholders = implode(',', array_fill(0, count($selectedInvoiceIds), '?'));
                $stmt = $this->pdo->prepare(
                    "SELECT id, invoice_no, grand_total, amount_paid, (grand_total - amount_paid) AS pending_amount
                     FROM invoices
                     WHERE customer_id = ? AND id IN ($placeholders) AND status = 'ACTIVE' AND payment_status IN ('UNPAID', 'PARTIAL') AND deleted_at IS NULL
                     ORDER BY id ASC"
                );
                $params = array_merge([$customerId], array_map('intval', $selectedInvoiceIds));
                $stmt->execute($params);
                $unpaidInvoices = $stmt->fetchAll();
            } else {
                $stmt = $this->pdo->prepare(
                    "SELECT id, invoice_no, grand_total, amount_paid, (grand_total - amount_paid) AS pending_amount
                     FROM invoices
                     WHERE customer_id = :cid AND status = 'ACTIVE' AND payment_status IN ('UNPAID', 'PARTIAL') AND deleted_at IS NULL
                     ORDER BY id ASC"
                );
                $stmt->execute(['cid' => $customerId]);
                $unpaidInvoices = $stmt->fetchAll();
            }

            if (empty($unpaidInvoices)) {
                throw new RuntimeException('No pending invoices found for this customer');
            }

            // Calculate total payment if SELECTED_INVOICES mode without explicit payAmount
            if ($mode === 'SELECTED_INVOICES' && $payAmount <= 0) {
                $payAmount = array_reduce($unpaidInvoices, fn (float $sum, array $inv) => $sum + (float) $inv['pending_amount'], 0.0);
            }

            // Insert Collection Receipt
            $rcptStmt = $this->pdo->prepare(
                "INSERT INTO collection_receipts (receipt_no, customer_id, amount, payment_method, mode, collected_by)
                 VALUES (:receipt_no, :customer_id, :amount, :payment_method, :mode, :collected_by)"
            );
            $rcptStmt->execute([
                'receipt_no' => $receiptNo,
                'customer_id' => $customerId,
                'amount' => $payAmount,
                'payment_method' => $paymentMethod,
                'mode' => $mode,
                'collected_by' => (int) $claims['sub'],
            ]);
            $receiptId = (int) $this->pdo->lastInsertId();

            $remainingPool = $payAmount;
            $invoicesAffected = 0;

            foreach ($unpaidInvoices as $inv) {
                if ($remainingPool <= 0) {
                    break;
                }

                $invId = (int) $inv['id'];
                $currGrand = (float) $inv['grand_total'];
                $currPaid = (float) $inv['amount_paid'];
                $pending = (float) $inv['pending_amount'];

                $payThisBill = min($remainingPool, $pending);
                $newPaid = $currPaid + $payThisBill;
                $newStatus = ($newPaid >= $currGrand - 0.001) ? 'PAID' : 'PARTIAL';

                // Update Invoice
                $updStmt = $this->pdo->prepare(
                    "UPDATE invoices SET amount_paid = :amount_paid, payment_status = :payment_status WHERE id = :id"
                );
                $updStmt->execute([
                    'amount_paid' => $newPaid,
                    'payment_status' => $newStatus,
                    'id' => $invId,
                ]);

                // Insert Receipt Item
                $itemStmt = $this->pdo->prepare(
                    "INSERT INTO collection_receipt_items (receipt_id, invoice_id, amount_paid, previous_balance, remaining_balance)
                     VALUES (:receipt_id, :invoice_id, :amount_paid, :previous_balance, :remaining_balance)"
                );
                $itemStmt->execute([
                    'receipt_id' => $receiptId,
                    'invoice_id' => $invId,
                    'amount_paid' => $payThisBill,
                    'previous_balance' => $pending,
                    'remaining_balance' => max(0, $pending - $payThisBill),
                ]);

                $remainingPool -= $payThisBill;
                $invoicesAffected++;
            }

            $this->pdo->commit();

            Response::json([
                'success' => true,
                'receipt_no' => $receiptNo,
                'collected_amount' => $payAmount,
                'invoices_affected' => $invoicesAffected,
            ]);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            Response::error($e->getMessage(), 422);
        }
    }
}
