<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Purchase / GRN flow (docs/DOCUMENTATION.md section 11): Supplier ->
 * Purchase -> Purchase Items -> GST/Amount Calculation -> Inventory
 * Increase -> Supplier Payable -> Purchase Complete.
 */
final class PurchaseService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly InventoryService $inventory,
    ) {
    }

    /** @param array<string, mixed> $data */
    public function createSupplier(array $data): int
    {
        $name = trim((string) ($data['name'] ?? ''));

        if ($name === '') {
            throw new RuntimeException('Supplier name is required');
        }

        $this->pdo->prepare(
            'INSERT INTO suppliers (name, contact_person, phone, email, address, gstin)
             VALUES (:name, :contact_person, :phone, :email, :address, :gstin)'
        )->execute([
            'name' => $name,
            'contact_person' => $data['contact_person'] ?? null,
            'phone' => $data['phone'] ?? null,
            'email' => $data['email'] ?? null,
            'address' => $data['address'] ?? null,
            'gstin' => $data['gstin'] ?? null,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /** @return array{items: list<array<string, mixed>>, total: int, page: int, limit: int} */
    public function listSuppliers(?string $search, ?string $status, int $page, int $limit): array
    {
        $page = max(1, $page);
        $limit = min(200, max(1, $limit));
        $offset = ($page - 1) * $limit;

        $where = ['deleted_at IS NULL'];
        $params = [];

        if ($status !== null && $status !== '' && in_array($status, ['ACTIVE', 'INACTIVE'], true)) {
            $where[] = 'status = :status';
            $params['status'] = $status;
        }

        if ($search !== null && trim($search) !== '') {
            $where[] = '(name LIKE :search1 OR phone LIKE :search2 OR gstin LIKE :search3)';
            $needle = '%' . trim($search) . '%';
            $params['search1'] = $needle;
            $params['search2'] = $needle;
            $params['search3'] = $needle;
        }

        $whereSql = implode(' AND ', $where);

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM suppliers WHERE {$whereSql}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare("SELECT * FROM suppliers WHERE {$whereSql} ORDER BY name LIMIT :limit OFFSET :offset");
        foreach ($params as $key => $value) {
            $stmt->bindValue(":{$key}", $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return ['items' => $stmt->fetchAll(), 'total' => $total, 'page' => $page, 'limit' => $limit];
    }

    public function findSupplier(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM suppliers WHERE id = :id AND deleted_at IS NULL');
        $stmt->execute(['id' => $id]);

        return $stmt->fetch() ?: null;
    }

    /** @param array<string, mixed> $data */
    public function updateSupplier(int $id, array $data): void
    {
        if ($this->findSupplier($id) === null) {
            throw new RuntimeException('Supplier not found');
        }

        $fields = ['name', 'contact_person', 'phone', 'email', 'address', 'gstin', 'status'];
        $sets = [];
        $params = ['id' => $id];

        foreach ($fields as $field) {
            if (array_key_exists($field, $data)) {
                if ($field === 'name' && trim((string) $data['name']) === '') {
                    throw new RuntimeException('Supplier name is required');
                }
                $sets[] = "{$field} = :{$field}";
                $params[$field] = $data[$field];
            }
        }

        if ($sets === []) {
            return;
        }

        $this->pdo->prepare('UPDATE suppliers SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
    }

    /**
     * Soft delete, same as every other catalog/master record in this app —
     * purchases.supplier_id keeps pointing at the row, so historical GRNs
     * and payables stay intact; the supplier just disappears from pickers.
     */
    public function deleteSupplier(int $id): void
    {
        if ($this->findSupplier($id) === null) {
            throw new RuntimeException('Supplier not found');
        }

        $this->pdo->prepare("UPDATE suppliers SET deleted_at = NOW(), status = 'INACTIVE' WHERE id = :id")->execute(['id' => $id]);
    }

    /**
     * @param list<array{variant_id: int, quantity: string, unit_cost: string, mrp?: string, discount_amount?: string}> $items
     */
    public function createPurchase(
        int $supplierId,
        array $items,
        string $purchaseDate,
        string $amountPaid,
        int $createdByUserId,
        ?string $paymentMethod = null,
        ?string $notes = null
    ): int {
        if ($items === []) {
            throw new RuntimeException('At least one item is required');
        }

        $lines = [];

        foreach ($items as $item) {
            $stmt = $this->pdo->prepare(
                'SELECT v.id AS variant_id, v.product_id, v.sku, g.gst_percent
                 FROM product_variants v LEFT JOIN gst_rates g ON g.id = v.gst_rate_id
                 WHERE v.id = :id AND v.deleted_at IS NULL'
            );
            $stmt->execute(['id' => $item['variant_id']]);
            $variant = $stmt->fetch();

            if ($variant === false) {
                throw new RuntimeException("Variant {$item['variant_id']} not found");
            }

            $quantity = (string) $item['quantity'];
            $unitCost = (string) $item['unit_cost'];
            $discountAmount = (string) ($item['discount_amount'] ?? '0');
            $mrp = isset($item['mrp']) && $item['mrp'] !== '' ? (string) $item['mrp'] : null;
            $grossLineSubtotal = bcmul($unitCost, $quantity, 2);
            $lineSubtotal = bcsub($grossLineSubtotal, $discountAmount, 2);

            if (bccomp($lineSubtotal, '0', 2) < 0) {
                throw new RuntimeException("Discount cannot exceed the line total for {$variant['sku']}");
            }

            $taxAmount = bcdiv(bcmul($lineSubtotal, (string) ($variant['gst_percent'] ?? '0'), 4), '100', 2);

            $lines[] = [
                'variant_id' => (int) $variant['variant_id'],
                'product_id' => (int) $variant['product_id'],
                'sku' => $variant['sku'],
                'quantity' => $quantity,
                'unit_cost' => $unitCost,
                'mrp' => $mrp,
                'discount_amount' => $discountAmount,
                'tax_amount' => $taxAmount,
                'line_total' => bcadd($lineSubtotal, $taxAmount, 2),
            ];
        }

        $subtotal = array_reduce(
            $lines,
            fn (string $c, array $l) => bcadd($c, bcsub(bcmul($l['unit_cost'], $l['quantity'], 2), $l['discount_amount'], 2), 2),
            '0.00',
        );
        $taxTotal = array_reduce($lines, fn (string $c, array $l) => bcadd($c, $l['tax_amount'], 2), '0.00');
        $grandTotal = bcadd($subtotal, $taxTotal, 2);
        $paymentStatus = bccomp($amountPaid, $grandTotal, 2) >= 0 ? 'PAID' : (bccomp($amountPaid, '0', 2) > 0 ? 'PARTIAL' : 'UNPAID');

        $this->pdo->beginTransaction();

        try {
            $purchaseNo = $this->generatePurchaseNumber();

            $this->pdo->prepare(
                "INSERT INTO purchases (
                    purchase_no, supplier_id, status, subtotal, tax_total, grand_total,
                    amount_paid, payment_method, payment_status, purchase_date, notes, created_by
                ) VALUES (
                    :purchase_no, :supplier_id, 'ACTIVE', :subtotal, :tax_total, :grand_total,
                    :amount_paid, :payment_method, :payment_status, :purchase_date, :notes, :created_by
                )"
            )->execute([
                'purchase_no' => $purchaseNo,
                'supplier_id' => $supplierId,
                'subtotal' => $subtotal,
                'tax_total' => $taxTotal,
                'grand_total' => $grandTotal,
                'amount_paid' => $amountPaid,
                'payment_method' => $paymentMethod,
                'payment_status' => $paymentStatus,
                'purchase_date' => $purchaseDate,
                'notes' => $notes,
                'created_by' => $createdByUserId,
            ]);

            $purchaseId = (int) $this->pdo->lastInsertId();

            foreach ($lines as $line) {
                $this->pdo->prepare(
                    'INSERT INTO purchase_items (purchase_id, product_id, variant_id, sku_snapshot, quantity, unit_cost, mrp, discount_amount, tax_amount, line_total)
                     VALUES (:purchase_id, :product_id, :variant_id, :sku, :quantity, :unit_cost, :mrp, :discount_amount, :tax_amount, :line_total)'
                )->execute([
                    'purchase_id' => $purchaseId,
                    'product_id' => $line['product_id'],
                    'variant_id' => $line['variant_id'],
                    'sku' => $line['sku'],
                    'quantity' => $line['quantity'],
                    'unit_cost' => $line['unit_cost'],
                    'mrp' => $line['mrp'],
                    'discount_amount' => $line['discount_amount'],
                    'tax_amount' => $line['tax_amount'],
                    'line_total' => $line['line_total'],
                ]);

                $this->inventory->apply(
                    variantId: $line['variant_id'],
                    productId: $line['product_id'],
                    movementType: 'PURCHASE',
                    onHandDelta: $line['quantity'],
                    reservedDelta: '0',
                    referenceType: 'PURCHASE',
                    referenceId: $purchaseId,
                    referenceItemId: null,
                    channel: 'ADMIN',
                    userId: $createdByUserId,
                    idempotencyKey: "purchase-{$purchaseId}-{$line['variant_id']}",
                    unitCost: $line['unit_cost'],
                );
            }

            $this->pdo->prepare(
                "INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id)
                 VALUES ('USER', :actor, 'PURCHASE', 'purchase', :id)"
            )->execute(['actor' => $createdByUserId, 'id' => $purchaseId]);

            $this->pdo->commit();

            return $purchaseId;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** Cancels the whole purchase, reversing all stock it added. */
    public function cancelPurchase(int $purchaseId, string $reason, int $cancelledByUserId): array
    {
        $purchase = $this->find($purchaseId);

        if ($purchase === null) {
            throw new RuntimeException('Purchase not found');
        }

        if ($purchase['status'] === 'CANCELLED') {
            throw new RuntimeException('Purchase is already cancelled');
        }

        $this->pdo->beginTransaction();

        try {
            foreach ($purchase['items'] as $item) {
                $remaining = bcsub((string) $item['quantity'], (string) $item['returned_quantity'], 3);

                if (bccomp($remaining, '0', 3) > 0) {
                    $this->inventory->apply(
                        variantId: (int) $item['variant_id'],
                        productId: (int) $item['product_id'],
                        movementType: 'PURCHASE_RETURN',
                        onHandDelta: '-' . $remaining,
                        reservedDelta: '0',
                        referenceType: 'PURCHASE',
                        referenceId: $purchaseId,
                        referenceItemId: (int) $item['id'],
                        channel: 'ADMIN',
                        userId: $cancelledByUserId,
                        idempotencyKey: "purchase-cancel-{$purchaseId}-{$item['variant_id']}",
                        reason: $reason,
                    );
                }
            }

            $this->pdo->prepare(
                "UPDATE purchases SET status = 'CANCELLED', cancelled_at = NOW(), cancelled_by = :by, cancellation_reason = :reason
                 WHERE id = :id"
            )->execute(['by' => $cancelledByUserId, 'reason' => $reason, 'id' => $purchaseId]);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return $this->find($purchaseId) ?? throw new RuntimeException('Purchase not found after cancellation');
    }

    /**
     * Partial purchase return — e.g. damaged goods sent back to the
     * supplier. Validates returned quantity against what's left to return.
     *
     * @param list<array{purchase_item_id: int, quantity: string}> $items
     */
    public function createReturn(int $purchaseId, array $items, string $reason, int $createdByUserId): int
    {
        $purchase = $this->find($purchaseId);

        if ($purchase === null) {
            throw new RuntimeException('Purchase not found');
        }

        if ($purchase['status'] === 'CANCELLED') {
            throw new RuntimeException('Cannot return items from a cancelled purchase');
        }

        $itemsById = [];
        foreach ($purchase['items'] as $item) {
            $itemsById[(int) $item['id']] = $item;
        }

        $this->pdo->beginTransaction();

        try {
            $returnNo = 'PR-' . date('Ymd') . '-' . random_int(1000, 9999);
            $grandTotal = '0.00';

            $this->pdo->prepare(
                "INSERT INTO purchase_returns (purchase_return_no, purchase_id, supplier_id, reason, grand_total, created_by)
                 VALUES (:no, :purchase_id, :supplier_id, :reason, 0, :created_by)"
            )->execute([
                'no' => $returnNo,
                'purchase_id' => $purchaseId,
                'supplier_id' => $purchase['supplier_id'],
                'reason' => $reason,
                'created_by' => $createdByUserId,
            ]);
            $returnId = (int) $this->pdo->lastInsertId();

            foreach ($items as $item) {
                $purchaseItemId = (int) $item['purchase_item_id'];
                $purchaseItem = $itemsById[$purchaseItemId] ?? null;

                if ($purchaseItem === null) {
                    throw new RuntimeException("Purchase item {$purchaseItemId} does not belong to this purchase");
                }

                $quantity = (string) $item['quantity'];
                $alreadyReturned = (string) $purchaseItem['returned_quantity'];
                $maxReturnable = bcsub((string) $purchaseItem['quantity'], $alreadyReturned, 3);

                if (bccomp($quantity, $maxReturnable, 3) > 0) {
                    throw new RuntimeException("Cannot return {$quantity} of {$purchaseItem['sku_snapshot']} — only {$maxReturnable} eligible");
                }

                $lineTotal = bcmul($quantity, (string) $purchaseItem['unit_cost'], 2);
                $grandTotal = bcadd($grandTotal, $lineTotal, 2);

                $this->pdo->prepare(
                    'INSERT INTO purchase_return_items (purchase_return_id, purchase_item_id, variant_id, quantity, unit_cost, line_total)
                     VALUES (:return_id, :item_id, :variant_id, :quantity, :unit_cost, :line_total)'
                )->execute([
                    'return_id' => $returnId,
                    'item_id' => $purchaseItemId,
                    'variant_id' => $purchaseItem['variant_id'],
                    'quantity' => $quantity,
                    'unit_cost' => $purchaseItem['unit_cost'],
                    'line_total' => $lineTotal,
                ]);

                $this->pdo->prepare(
                    'UPDATE purchase_items SET returned_quantity = returned_quantity + :qty WHERE id = :id'
                )->execute(['qty' => $quantity, 'id' => $purchaseItemId]);

                $this->inventory->apply(
                    variantId: (int) $purchaseItem['variant_id'],
                    productId: (int) $purchaseItem['product_id'],
                    movementType: 'PURCHASE_RETURN',
                    onHandDelta: '-' . $quantity,
                    reservedDelta: '0',
                    referenceType: 'PURCHASE_RETURN',
                    referenceId: $returnId,
                    referenceItemId: $purchaseItemId,
                    channel: 'ADMIN',
                    userId: $createdByUserId,
                    idempotencyKey: "purchase-return-{$returnId}-{$purchaseItemId}",
                    reason: $reason,
                );
            }

            $this->pdo->prepare('UPDATE purchase_returns SET grand_total = :total WHERE id = :id')
                ->execute(['total' => $grandTotal, 'id' => $returnId]);

            $this->pdo->commit();

            return $returnId;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** @param array<string, mixed> $filters */
    public function list(array $filters): array
    {
        $where = [];
        $params = [];

        if (!empty($filters['supplier_id'])) {
            $where[] = 'supplier_id = :supplier_id';
            $params['supplier_id'] = (int) $filters['supplier_id'];
        }

        if (!empty($filters['status'])) {
            $where[] = 'status = :status';
            $params['status'] = $filters['status'];
        }

        $whereSql = $where === [] ? '1=1' : implode(' AND ', $where);

        $stmt = $this->pdo->prepare(
            "SELECT p.*, s.name AS supplier_name FROM purchases p
             JOIN suppliers s ON s.id = p.supplier_id
             WHERE {$whereSql} ORDER BY p.created_at DESC LIMIT 200"
        );
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    /** @return array<string, mixed>|null */
    public function find(int $purchaseId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT p.*, s.name AS supplier_name FROM purchases p JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = :id'
        );
        $stmt->execute(['id' => $purchaseId]);
        $purchase = $stmt->fetch();

        if ($purchase === false) {
            return null;
        }

        $items = $this->pdo->prepare('SELECT * FROM purchase_items WHERE purchase_id = :id');
        $items->execute(['id' => $purchaseId]);
        $purchase['items'] = $items->fetchAll();

        $returns = $this->pdo->prepare('SELECT * FROM purchase_returns WHERE purchase_id = :id ORDER BY created_at DESC');
        $returns->execute(['id' => $purchaseId]);
        $purchase['returns'] = $returns->fetchAll();

        return $purchase;
    }

    private function generatePurchaseNumber(): string
    {
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $no = 'PUR-' . date('Ymd') . '-' . random_int(1000, 9999);

            $stmt = $this->pdo->prepare('SELECT 1 FROM purchases WHERE purchase_no = :no');
            $stmt->execute(['no' => $no]);

            if ($stmt->fetchColumn() === false) {
                return $no;
            }
        }

        throw new RuntimeException('Could not generate a unique purchase number, please retry');
    }
}
