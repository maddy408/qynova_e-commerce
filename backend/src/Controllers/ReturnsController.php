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
        $customerId = !empty($body['customer_id']) ? (int) $body['customer_id'] : null;
        $reason = trim((string) ($body['reason'] ?? 'Customer Return'));
        $notes = trim((string) ($body['notes'] ?? ''));
        $items = (array) ($body['items'] ?? []);

        if (empty($items)) {
            Response::error('At least one return item is required', 422);
        }

        $this->pdo->beginTransaction();

        try {
            $returnNo = 'SRET-' . date('YmdHis') . '-' . random_int(100, 999);
            $totalAmount = 0.0;

            foreach ($items as $item) {
                $qty = (int) ($item['qty'] ?? 0);
                $unitPrice = (float) ($item['unit_price'] ?? 0);
                if ($qty <= 0) continue;
                $totalAmount += ($qty * $unitPrice);
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

            foreach ($items as $item) {
                $variantId = (int) ($item['variant_id'] ?? 0);
                $qty = (float) ($item['qty'] ?? 0);
                $unitPrice = (float) ($item['unit_price'] ?? 0);
                if ($variantId <= 0 || $qty <= 0) continue;

                $itemTotal = $qty * $unitPrice;
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
                "SELECT pri.*, pv.sku, p.name as product_name
                 FROM purchase_return_items pri
                 JOIN product_variants pv ON pv.id = pri.variant_id
                 JOIN products p ON p.id = pv.product_id
                 WHERE pri.return_id = :id"
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
                'purchase_id' => $purchaseId ?: 0,
                'supplier_id' => $supplierId ?: 0,
                'grand_total' => $totalAmount,
                'reason' => $reason,
                'created_by' => $claims['sub'],
            ]);
            $returnId = (int) $this->pdo->lastInsertId();

            $insertItem = $this->pdo->prepare(
                "INSERT INTO purchase_return_items (return_id, variant_id, qty, unit_price, total_amount)
                 VALUES (:return_id, :variant_id, :qty, :unit_price, :total_amount)"
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
