<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use PDO;
use Exception;

final class ReturnsController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function indexSaleReturns(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $stmt = $this->pdo->query(
            "SELECT sr.*, c.name as customer_name, c.phone as customer_phone, u.name as created_by_name
             FROM sale_returns sr
             LEFT JOIN customers c ON c.id = sr.customer_id
             LEFT JOIN users u ON u.id = sr.created_by
             ORDER BY sr.created_at DESC"
        );
        $returns = $stmt->fetchAll();

        foreach ($returns as &$ret) {
            $itemStmt = $this->pdo->prepare(
                "SELECT sri.*, pv.sku, p.name as product_name
                 FROM sale_return_items sri
                 JOIN product_variants pv ON pv.id = sri.variant_id
                 JOIN products p ON p.id = pv.product_id
                 WHERE sri.return_id = :id"
            );
            $itemStmt->execute(['id' => $ret['id']]);
            $ret['items'] = $itemStmt->fetchAll();
        }
        unset($ret);

        Response::json(['sale_returns' => $returns]);
    }

    public function storeSaleReturn(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.returns.process');

        $body = Request::json();
        $orderId = !empty($body['order_id']) ? (int) $body['order_id'] : null;
        $invoiceId = !empty($body['invoice_id']) ? (int) $body['invoice_id'] : (!empty($body['order_id']) ? (int) $body['order_id'] : null);
        $customerId = !empty($body['customer_id']) ? (int) $body['customer_id'] : null;
        $reason = trim((string) ($body['reason'] ?? 'Customer Return'));
        $notes = trim((string) ($body['notes'] ?? ''));
        $items = (array) ($body['items'] ?? []);

        if (empty($items)) {
            Response::error('At least one return item is required', 422);
        }

        // If an invoice is referenced, fetch invoice details and items for allocation-aware refund
        $invoice = null;
        $invoiceItemsMap = [];
        if ($invoiceId !== null) {
            $stmtInv = $this->pdo->prepare('SELECT id, grand_total, amount_paid, bill_discount_amount FROM invoices WHERE id = :id');
            $stmtInv->execute(['id' => $invoiceId]);
            $invoice = $stmtInv->fetch(PDO::FETCH_ASSOC);

            if ($invoice) {
                $stmtInvItems = $this->pdo->prepare('SELECT id, variant_id, quantity, unit_price, discount_amount, bill_discount_amount, tax_amount, line_total FROM invoice_items WHERE invoice_id = :id');
                $stmtInvItems->execute(['id' => $invoiceId]);
                foreach ($stmtInvItems->fetchAll(PDO::FETCH_ASSOC) as $ii) {
                    $invoiceItemsMap[(int) $ii['variant_id']] = $ii;
                }
            }
        }

        $this->pdo->beginTransaction();

        try {
            $returnNo = 'SRET-' . date('YmdHis') . '-' . random_int(100, 999);
            $totalAmount = 0.0;
            $processedItems = [];

            foreach ($items as $item) {
                $variantId = (int) ($item['variant_id'] ?? 0);
                $qty = (int) ($item['qty'] ?? 0);
                $unitPrice = (float) ($item['unit_price'] ?? 0);
                if ($variantId <= 0 || $qty <= 0) continue;

                // If invoice exists, use the net discounted rate for the item
                if ($invoice && isset($invoiceItemsMap[$variantId])) {
                    $invItem = $invoiceItemsMap[$variantId];
                    $invQty = (int) $invItem['quantity'];
                    if ($invQty > 0) {
                        $effectiveNetUnitPrice = (float) $invItem['line_total'] / $invQty;
                        // Never refund more than the discounted line unit value
                        $unitPrice = min($unitPrice > 0 ? $unitPrice : $effectiveNetUnitPrice, $effectiveNetUnitPrice);
                    }
                }

                $itemTotal = round($qty * $unitPrice, 2);
                $totalAmount += $itemTotal;
                $processedItems[] = [
                    'variant_id' => $variantId,
                    'qty' => $qty,
                    'unit_price' => $unitPrice,
                    'item_total' => $itemTotal,
                ];
            }

            // Ensure cumulative refunds for this invoice do not exceed amount paid
            if ($invoice) {
                $stmtPastRefunds = $this->pdo->prepare('SELECT COALESCE(SUM(total_amount), 0) FROM sale_returns WHERE order_id = :inv_id');
                $stmtPastRefunds->execute(['inv_id' => $invoiceId]);
                $pastRefundTotal = (float) $stmtPastRefunds->fetchColumn();
                $maxRefundAllowed = (float) $invoice['amount_paid'];

                if (($pastRefundTotal + $totalAmount) > ($maxRefundAllowed + 0.001)) {
                    $this->pdo->rollBack();
                    Response::error("Total refund cannot exceed paid amount of Rs. " . number_format($maxRefundAllowed, 2), 422);
                    return;
                }
            }

            $stmt = $this->pdo->prepare(
                "INSERT INTO sale_returns (return_no, order_id, customer_id, total_amount, refund_status, reason, notes, created_by)
                 VALUES (:return_no, :order_id, :customer_id, :total_amount, 'REFUNDED', :reason, :notes, :created_by)"
            );
            $stmt->execute([
                'return_no' => $returnNo,
                'order_id' => $orderId,
                'customer_id' => $customerId,
                'total_amount' => $totalAmount,
                'reason' => $reason,
                'notes' => $notes ?: null,
                'created_by' => $claims['sub'],
            ]);
            $returnId = (int) $this->pdo->lastInsertId();

            $insertItem = $this->pdo->prepare(
                "INSERT INTO sale_return_items (return_id, variant_id, qty, unit_price, total_amount)
                 VALUES (:return_id, :variant_id, :qty, :unit_price, :total_amount)"
            );

            // Record stock adjustment to add items back into inventory
            $adjNo = 'ADJ-SR-' . date('YmdHis') . '-' . random_int(100, 999);
            $this->pdo->prepare(
                "INSERT INTO stock_adjustments (adjustment_no, reason, status, created_by)
                 VALUES (:no, :reason, 'APPROVED', :created_by)"
            )->execute(['no' => $adjNo, 'reason' => 'Sale Return: ' . $returnNo, 'created_by' => $claims['sub']]);
            $adjId = (int) $this->pdo->lastInsertId();

            $adjItemStmt = $this->pdo->prepare(
                "INSERT INTO stock_adjustment_items (adjustment_id, variant_id, system_qty, counted_qty)
                 VALUES (:adj_id, :variant_id, :sys_qty, :count_qty)"
            );

            foreach ($processedItems as $pItem) {
                $variantId = $pItem['variant_id'];
                $qty = $pItem['qty'];
                $unitPrice = $pItem['unit_price'];
                $itemTotal = $pItem['item_total'];

                $insertItem->execute([
                    'return_id' => $returnId,
                    'variant_id' => $variantId,
                    'qty' => $qty,
                    'unit_price' => $unitPrice,
                    'total_amount' => $itemTotal,
                ]);

                // Current stock on hand
                $stockStmt = $this->pdo->prepare("SELECT on_hand FROM inventory WHERE variant_id = :id");
                $stockStmt->execute(['id' => $variantId]);
                $currentOnHand = (float) ($stockStmt->fetchColumn() ?: 0);
                $newOnHand = $currentOnHand + $qty;

                // Update inventory
                $this->pdo->prepare(
                    "INSERT INTO inventory (variant_id, product_id, on_hand)
                     SELECT :variant_id, product_id, :on_hand FROM product_variants WHERE id = :v_id2
                     ON DUPLICATE KEY UPDATE on_hand = VALUES(on_hand)"
                )->execute(['variant_id' => $variantId, 'on_hand' => $newOnHand, 'v_id2' => $variantId]);

                $adjItemStmt->execute([
                    'adj_id' => $adjId,
                    'variant_id' => $variantId,
                    'sys_qty' => $currentOnHand,
                    'count_qty' => $newOnHand,
                ]);
            }

            $this->pdo->commit();
            Response::json(['id' => $returnId, 'return_no' => $returnNo], 201);
        } catch (Exception $e) {
            $this->pdo->rollBack();
            Response::error($e->getMessage(), 500);
        }
    }

    public function indexPurchaseReturns(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'purchases.manage');

        $stmt = $this->pdo->query(
            "SELECT pr.*, pr.purchase_return_no AS return_no, pr.grand_total AS total_amount, s.name AS supplier_name, s.contact_person AS supplier_contact, u.name AS created_by_name
             FROM purchase_returns pr
             LEFT JOIN suppliers s ON s.id = pr.supplier_id
             LEFT JOIN users u ON u.id = pr.created_by
             ORDER BY pr.created_at DESC"
        );
        $returns = $stmt->fetchAll();

        foreach ($returns as &$ret) {
            $itemStmt = $this->pdo->prepare(
                "SELECT pri.*, pri.quantity AS qty, pri.unit_cost AS unit_price, pri.line_total AS total_amount, pv.sku, p.name as product_name
                 FROM purchase_return_items pri
                 JOIN product_variants pv ON pv.id = pri.variant_id
                 JOIN products p ON p.id = pv.product_id
                 WHERE pri.purchase_return_id = :id"
            );
            $itemStmt->execute(['id' => $ret['id']]);
            $ret['items'] = $itemStmt->fetchAll();
        }
        unset($ret);

        Response::json(['purchase_returns' => $returns]);
    }

    public function storePurchaseReturn(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.returns.process');

        $body = Request::json();
        $purchaseId = !empty($body['purchase_id']) ? (int) $body['purchase_id'] : null;
        $supplierId = !empty($body['supplier_id']) ? (int) $body['supplier_id'] : null;
        $reason = trim((string) ($body['reason'] ?? 'Supplier Return'));
        $notes = trim((string) ($body['notes'] ?? ''));
        $items = (array) ($body['items'] ?? []);

        if (empty($items)) {
            Response::error('At least one return item is required', 422);
        }

        $this->pdo->beginTransaction();

        try {
            $returnNo = 'PRET-' . date('YmdHis') . '-' . random_int(100, 999);
            $totalAmount = 0.0;

            foreach ($items as $item) {
                $qty = (int) ($item['qty'] ?? 0);
                $unitPrice = (float) ($item['unit_price'] ?? 0);
                if ($qty <= 0) continue;
                $totalAmount += ($qty * $unitPrice);
            }

            $stmt = $this->pdo->prepare(
                "INSERT INTO purchase_returns (purchase_return_no, purchase_id, supplier_id, grand_total, reason, created_by)
                 VALUES (:return_no, :purchase_id, :supplier_id, :grand_total, :reason, :created_by)"
            );
            $stmt->execute([
                'return_no' => $returnNo,
                'purchase_id' => $purchaseId,
                'supplier_id' => $supplierId,
                'grand_total' => $totalAmount,
                'reason' => $reason,
                'created_by' => $claims['sub'],
            ]);
            $returnId = (int) $this->pdo->lastInsertId();

            $insertItem = $this->pdo->prepare(
                "INSERT INTO purchase_return_items (purchase_return_id, purchase_item_id, variant_id, quantity, unit_cost, line_total)
                 VALUES (:purchase_return_id, :purchase_item_id, :variant_id, :quantity, :unit_cost, :line_total)"
            );

            // Record stock adjustment to deduct items from inventory
            $adjNo = 'ADJ-PR-' . date('YmdHis') . '-' . random_int(100, 999);
            $this->pdo->prepare(
                "INSERT INTO stock_adjustments (adjustment_no, reason, status, created_by)
                 VALUES (:no, :reason, 'APPROVED', :created_by)"
            )->execute(['no' => $adjNo, 'reason' => 'Purchase Return: ' . $returnNo, 'created_by' => $claims['sub']]);
            $adjId = (int) $this->pdo->lastInsertId();

            $adjItemStmt = $this->pdo->prepare(
                "INSERT INTO stock_adjustment_items (adjustment_id, variant_id, system_qty, counted_qty)
                 VALUES (:adj_id, :variant_id, :sys_qty, :count_qty)"
            );

            foreach ($items as $item) {
                $variantId = (int) ($item['variant_id'] ?? 0);
                $qty = (float) ($item['qty'] ?? 0);
                $unitPrice = (float) ($item['unit_price'] ?? 0);
                if ($variantId <= 0 || $qty <= 0) continue;

                $itemTotal = $qty * $unitPrice;
                $insertItem->execute([
                    'purchase_return_id' => $returnId,
                    'purchase_item_id' => null,
                    'variant_id' => $variantId,
                    'quantity' => $qty,
                    'unit_cost' => $unitPrice,
                    'line_total' => $itemTotal,
                ]);

                // Current stock on hand
                $stockStmt = $this->pdo->prepare("SELECT on_hand FROM inventory WHERE variant_id = :id");
                $stockStmt->execute(['id' => $variantId]);
                $currentOnHand = (float) ($stockStmt->fetchColumn() ?: 0);
                $newOnHand = max(0, $currentOnHand - $qty);

                // Update inventory
                $this->pdo->prepare(
                    "INSERT INTO inventory (variant_id, product_id, on_hand)
                     SELECT :variant_id, product_id, :on_hand FROM product_variants WHERE id = :v_id2
                     ON DUPLICATE KEY UPDATE on_hand = VALUES(on_hand)"
                )->execute(['variant_id' => $variantId, 'on_hand' => $newOnHand, 'v_id2' => $variantId]);

                $adjItemStmt->execute([
                    'adj_id' => $adjId,
                    'variant_id' => $variantId,
                    'sys_qty' => $currentOnHand,
                    'count_qty' => $newOnHand,
                ]);
            }

            $this->pdo->commit();
            Response::json(['id' => $returnId, 'return_no' => $returnNo], 201);
        } catch (Exception $e) {
            $this->pdo->rollBack();
            Response::error($e->getMessage(), 500);
        }
    }
}
