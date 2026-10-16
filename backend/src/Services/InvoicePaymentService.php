<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Invoice payment collection and reversal (Phase 5 — Invoice Amendment),
 * mirroring PaymentService.php's purchase-payment pattern exactly so the
 * two money ledgers stay consistent (G9). invoice_payments/
 * invoice_payment_lines were scaffolded in migration 0033 (Phase 1.1,
 * including the payment_method -> VARCHAR(100) widen for 'SPLIT') and
 * backfilled for pre-existing invoices, but nothing wrote to them going
 * forward until this.
 *
 * This replaces InvoiceController's old update() endpoint, which let
 * amount_paid be set to literally any value via a raw UPDATE — no cap
 * against grand_total, no payment_status recompute, no audit trail.
 * From here on, invoices.amount_paid is a derived value: always
 * SUM(invoice_payments.total_amount) WHERE status = 'ACTIVE', never
 * written directly.
 */
final class InvoicePaymentService
{
    // Mirrors InvoiceService::ALLOWED_POS_PAYMENT_METHODS minus CREDIT,
    // excluded for the same reason PaymentService excludes it from
    // purchase payment lines: credit/due is the absence of a payment,
    // not a payment method.
    private const ALLOWED_METHODS = ['CASH', 'UPI', 'CARD', 'NETBANKING', 'GOOGLE_PAY'];
    private const REFERENCE_REQUIRED_METHODS = ['UPI', 'CARD', 'NETBANKING', 'GOOGLE_PAY'];

    public function __construct(
        private readonly PDO $pdo,
        private readonly InvoiceService $invoices,
    ) {
    }

    /**
     * @param array{
     *     amount: string|numeric,
     *     payment_date?: string,
     *     notes?: string|null,
     *     idempotency_key?: string|null,
     *     lines: list<array{method: string, amount: string|numeric, reference_no?: string|null}>
     * } $data
     * @return array{invoice: array<string, mixed>, payment: array<string, mixed>}
     */
    public function collectPayment(int $invoiceId, array $data, int $userId, ?string $clientIp = null): array
    {
        $idempotencyKey = isset($data['idempotency_key']) && trim((string) $data['idempotency_key']) !== ''
            ? trim((string) $data['idempotency_key'])
            : null;

        if ($idempotencyKey !== null) {
            $stmt = $this->pdo->prepare('SELECT id FROM invoice_payments WHERE idempotency_key = :key');
            $stmt->execute(['key' => $idempotencyKey]);
            $existingPaymentId = $stmt->fetchColumn();
            if ($existingPaymentId !== false) {
                $payment = $this->findPayment((int) $existingPaymentId);
                $invoice = $this->invoices->find($invoiceId);
                if ($payment !== null && $invoice !== null) {
                    return ['invoice' => $invoice, 'payment' => $payment];
                }
            }
        }

        $rawAmount = $data['amount'] ?? null;
        if ($rawAmount === null || !is_numeric($rawAmount)) {
            throw new RuntimeException('Payment amount is required and must be numeric');
        }

        $amount = bcadd((string) $rawAmount, '0', 2);
        if (bccomp($amount, '0', 2) <= 0) {
            throw new RuntimeException('Payment amount must be greater than 0');
        }

        $paymentDate = !empty($data['payment_date']) ? trim((string) $data['payment_date']) : date('Y-m-d');
        $notes = isset($data['notes']) && trim((string) $data['notes']) !== '' ? trim((string) $data['notes']) : null;
        $lines = (array) ($data['lines'] ?? []);

        if ($lines === []) {
            throw new RuntimeException('At least one payment line is required');
        }

        $parsedLines = [];
        $linesSum = '0.00';
        $usedMethods = [];

        foreach ($lines as $line) {
            $method = strtoupper(trim((string) ($line['method'] ?? '')));
            if ($method === 'CREDIT') {
                throw new RuntimeException('Credit/Due cannot be used as a payment line method');
            }
            if (!in_array($method, self::ALLOWED_METHODS, true)) {
                throw new RuntimeException("Invalid payment method: {$method}");
            }

            if (isset($usedMethods[$method])) {
                throw new RuntimeException("Duplicate payment method {$method} in one payment is not allowed");
            }
            $usedMethods[$method] = true;

            $lineAmountRaw = $line['amount'] ?? null;
            if ($lineAmountRaw === null || !is_numeric($lineAmountRaw)) {
                throw new RuntimeException("Line amount for {$method} must be numeric");
            }

            $lineAmount = bcadd((string) $lineAmountRaw, '0', 2);
            if (bccomp($lineAmount, '0', 2) <= 0) {
                throw new RuntimeException("Line amount for {$method} must be greater than 0");
            }

            $referenceNo = isset($line['reference_no']) ? trim((string) $line['reference_no']) : '';
            if (in_array($method, self::REFERENCE_REQUIRED_METHODS, true) && $referenceNo === '') {
                throw new RuntimeException("Reference number is required for {$method}");
            }

            $parsedLines[] = [
                'method' => $method,
                'amount' => $lineAmount,
                'reference_no' => $referenceNo !== '' ? $referenceNo : null,
            ];

            $linesSum = bcadd($linesSum, $lineAmount, 2);
        }

        if (bccomp($linesSum, $amount, 2) !== 0) {
            throw new RuntimeException("Sum of payment lines (₹{$linesSum}) must equal total payment amount (₹{$amount})");
        }

        $this->pdo->beginTransaction();

        try {
            $stmt = $this->pdo->prepare('SELECT * FROM invoices WHERE id = :id FOR UPDATE');
            $stmt->execute(['id' => $invoiceId]);
            $invoice = $stmt->fetch();

            if ($invoice === false || $invoice['deleted_at'] !== null) {
                throw new RuntimeException('Invoice not found');
            }

            if ($invoice['status'] === 'CANCELLED') {
                throw new RuntimeException('Cannot add payment to a cancelled invoice');
            }

            $currentPaid = $this->activePaidTotal($invoiceId);
            $balance = bcsub((string) $invoice['grand_total'], $currentPaid, 2);
            if (bccomp($balance, '0', 2) < 0) {
                $balance = '0.00';
            }

            if (bccomp($amount, $balance, 2) > 0) {
                throw new RuntimeException("Payment (₹{$amount}) exceeds the remaining balance (₹{$balance})");
            }

            $receiptNo = $this->generateReceiptNumber();

            $insertStmt = $this->pdo->prepare(
                'INSERT INTO invoice_payments (
                    invoice_id, customer_id, receipt_no, payment_date, total_amount, notes, status, idempotency_key, created_by
                ) VALUES (
                    :invoice_id, :customer_id, :receipt_no, :payment_date, :total_amount, :notes, \'ACTIVE\', :idempotency_key, :created_by
                )'
            );
            $insertStmt->execute([
                'invoice_id' => $invoiceId,
                'customer_id' => $invoice['customer_id'],
                'receipt_no' => $receiptNo,
                'payment_date' => $paymentDate,
                'total_amount' => $amount,
                'notes' => $notes,
                'idempotency_key' => $idempotencyKey,
                'created_by' => $userId,
            ]);

            $paymentId = (int) $this->pdo->lastInsertId();

            $lineStmt = $this->pdo->prepare(
                'INSERT INTO invoice_payment_lines (payment_id, payment_method, amount, reference_no)
                 VALUES (:payment_id, :method, :amount, :reference_no)'
            );
            foreach ($parsedLines as $line) {
                $lineStmt->execute([
                    'payment_id' => $paymentId,
                    'method' => $line['method'],
                    'amount' => $line['amount'],
                    'reference_no' => $line['reference_no'],
                ]);
            }

            $totals = $this->calculateInvoicePaymentTotals($invoiceId, (string) $invoice['grand_total']);

            $this->pdo->prepare(
                'UPDATE invoices SET amount_paid = :paid, payment_status = :status, payment_method = :method WHERE id = :id'
            )->execute([
                'paid' => $totals['paid_amount'],
                'status' => $totals['payment_status'],
                'method' => $totals['payment_method'],
                'id' => $invoiceId,
            ]);

            $this->pdo->prepare(
                "INSERT INTO audit_logs (
                    actor_type, actor_id, action, entity_type, entity_id, old_value, new_value, reason, ip_address
                ) VALUES (
                    'USER', :actor_id, 'INVOICE_PAYMENT_COLLECT', 'invoice', :entity_id, :old_val, :new_val, :reason, :ip
                )"
            )->execute([
                'actor_id' => $userId,
                'entity_id' => $invoiceId,
                'old_val' => json_encode([
                    'amount_paid' => $invoice['amount_paid'],
                    'payment_status' => $invoice['payment_status'],
                    'payment_method' => $invoice['payment_method'],
                ]),
                'new_val' => json_encode([
                    'amount_paid' => $totals['paid_amount'],
                    'payment_status' => $totals['payment_status'],
                    'payment_method' => $totals['payment_method'],
                    'payment_id' => $paymentId,
                    'receipt_no' => $receiptNo,
                    'amount' => $amount,
                    'lines' => $parsedLines,
                ]),
                'reason' => "Collected payment {$receiptNo} of ₹{$amount}",
                'ip' => $clientIp,
            ]);

            $this->pdo->commit();

            $updatedInvoice = $this->invoices->find($invoiceId) ?? throw new RuntimeException('Invoice not found');
            $payment = $this->findPayment($paymentId) ?? throw new RuntimeException('Payment not found');

            return ['invoice' => $updatedInvoice, 'payment' => $payment];
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** @return array{invoice: array<string, mixed>, reversed_payment_id: int} */
    public function reversePayment(int $invoiceId, int $paymentId, string $reason, int $userId, ?string $clientIp = null): array
    {
        $cleanReason = trim($reason);
        if ($cleanReason === '') {
            throw new RuntimeException('A reversal reason is required');
        }

        $this->pdo->beginTransaction();

        try {
            $stmt = $this->pdo->prepare('SELECT * FROM invoices WHERE id = :id FOR UPDATE');
            $stmt->execute(['id' => $invoiceId]);
            $invoice = $stmt->fetch();

            if ($invoice === false || $invoice['deleted_at'] !== null) {
                throw new RuntimeException('Invoice not found');
            }

            $payStmt = $this->pdo->prepare('SELECT * FROM invoice_payments WHERE id = :id AND invoice_id = :invoice_id FOR UPDATE');
            $payStmt->execute(['id' => $paymentId, 'invoice_id' => $invoiceId]);
            $payment = $payStmt->fetch();

            if ($payment === false) {
                throw new RuntimeException('Payment not found for this invoice');
            }

            if ($payment['status'] === 'REVERSED') {
                throw new RuntimeException('Payment is already reversed');
            }

            $this->pdo->prepare(
                "UPDATE invoice_payments SET status = 'REVERSED', reversed_by = :by, reversed_at = NOW(), reverse_reason = :reason WHERE id = :id"
            )->execute(['by' => $userId, 'reason' => $cleanReason, 'id' => $paymentId]);

            $totals = $this->calculateInvoicePaymentTotals($invoiceId, (string) $invoice['grand_total']);

            $this->pdo->prepare(
                'UPDATE invoices SET amount_paid = :paid, payment_status = :status, payment_method = :method WHERE id = :id'
            )->execute([
                'paid' => $totals['paid_amount'],
                'status' => $totals['payment_status'],
                'method' => $totals['payment_method'],
                'id' => $invoiceId,
            ]);

            $this->pdo->prepare(
                "INSERT INTO audit_logs (
                    actor_type, actor_id, action, entity_type, entity_id, old_value, new_value, reason, ip_address
                ) VALUES (
                    'USER', :actor_id, 'INVOICE_PAYMENT_REVERSE', 'invoice', :entity_id, :old_val, :new_val, :reason, :ip
                )"
            )->execute([
                'actor_id' => $userId,
                'entity_id' => $invoiceId,
                'old_val' => json_encode([
                    'amount_paid' => $invoice['amount_paid'],
                    'payment_status' => $invoice['payment_status'],
                    'payment_method' => $invoice['payment_method'],
                ]),
                'new_val' => json_encode([
                    'amount_paid' => $totals['paid_amount'],
                    'payment_status' => $totals['payment_status'],
                    'payment_method' => $totals['payment_method'],
                    'reversed_payment_id' => $paymentId,
                ]),
                'reason' => "Reversed payment {$payment['receipt_no']} (₹{$payment['total_amount']}): {$cleanReason}",
                'ip' => $clientIp,
            ]);

            $this->pdo->commit();

            $updatedInvoice = $this->invoices->find($invoiceId) ?? throw new RuntimeException('Invoice not found');

            return ['invoice' => $updatedInvoice, 'reversed_payment_id' => $paymentId];
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** @return list<array<string, mixed>> */
    public function listPayments(int $invoiceId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT ip.*, u.name AS created_by_name, ru.name AS reversed_by_name
             FROM invoice_payments ip
             LEFT JOIN users u ON u.id = ip.created_by
             LEFT JOIN users ru ON ru.id = ip.reversed_by
             WHERE ip.invoice_id = :id
             ORDER BY ip.created_at DESC'
        );
        $stmt->execute(['id' => $invoiceId]);
        $payments = $stmt->fetchAll();

        foreach ($payments as &$payment) {
            $lineStmt = $this->pdo->prepare('SELECT * FROM invoice_payment_lines WHERE payment_id = :payment_id ORDER BY id ASC');
            $lineStmt->execute(['payment_id' => $payment['id']]);
            $payment['lines'] = $lineStmt->fetchAll();
        }
        unset($payment);

        return $payments;
    }

    /** @return array<string, mixed>|null */
    public function findPayment(int $paymentId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT ip.*, u.name AS created_by_name, ru.name AS reversed_by_name
             FROM invoice_payments ip
             LEFT JOIN users u ON u.id = ip.created_by
             LEFT JOIN users ru ON ru.id = ip.reversed_by
             WHERE ip.id = :id'
        );
        $stmt->execute(['id' => $paymentId]);
        $payment = $stmt->fetch();

        if ($payment === false) {
            return null;
        }

        $lineStmt = $this->pdo->prepare('SELECT * FROM invoice_payment_lines WHERE payment_id = :payment_id ORDER BY id ASC');
        $lineStmt->execute(['payment_id' => $paymentId]);
        $payment['lines'] = $lineStmt->fetchAll();

        return $payment;
    }

    /**
     * Recomputes amount_paid/payment_status/payment_method from active
     * invoice_payments — the single source of truth from here on.
     *
     * @return array{paid_amount: string, payment_status: string, payment_method: string|null}
     */
    public function calculateInvoicePaymentTotals(int $invoiceId, string $grandTotal): array
    {
        $paidAmount = $this->activePaidTotal($invoiceId);

        // invoices.payment_status uses PARTIAL (not purchases' PARTIALLY_PAID)
        // — matches the label InvoiceService::createPosSale already derives.
        $paymentStatus = bccomp($paidAmount, $grandTotal, 2) >= 0
            ? 'PAID'
            : (bccomp($paidAmount, '0', 2) > 0 ? 'PARTIAL' : 'UNPAID');

        $methodStmt = $this->pdo->prepare(
            "SELECT DISTINCT ipl.payment_method
             FROM invoice_payment_lines ipl
             JOIN invoice_payments ip ON ip.id = ipl.payment_id
             WHERE ip.invoice_id = :id AND ip.status = 'ACTIVE' AND ipl.amount > 0"
        );
        $methodStmt->execute(['id' => $invoiceId]);
        $methods = $methodStmt->fetchAll(PDO::FETCH_COLUMN);

        $paymentMethod = null;
        if (count($methods) === 1) {
            $paymentMethod = $methods[0];
        } elseif (count($methods) > 1) {
            $paymentMethod = 'SPLIT';
        }

        return [
            'paid_amount' => $paidAmount,
            'payment_status' => $paymentStatus,
            'payment_method' => $paymentMethod,
        ];
    }

    private function activePaidTotal(int $invoiceId): string
    {
        $stmt = $this->pdo->prepare(
            "SELECT IFNULL(SUM(total_amount), 0.00) FROM invoice_payments WHERE invoice_id = :id AND status = 'ACTIVE'"
        );
        $stmt->execute(['id' => $invoiceId]);

        return bcadd((string) ($stmt->fetchColumn() ?: '0.00'), '0', 2);
    }

    private function generateReceiptNumber(): string
    {
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $no = 'REC-INV-' . date('Ymd') . '-' . random_int(1000, 9999);

            $stmt = $this->pdo->prepare('SELECT 1 FROM invoice_payments WHERE receipt_no = :no');
            $stmt->execute(['no' => $no]);

            if ($stmt->fetchColumn() === false) {
                return $no;
            }
        }

        throw new RuntimeException('Could not generate a unique payment receipt number, please retry');
    }
}
