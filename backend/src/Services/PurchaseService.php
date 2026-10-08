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
    private readonly PaymentService $paymentService;

    public function __construct(
        private readonly PDO $pdo,
        private readonly InventoryService $inventory,
        ?PaymentService $paymentService = null,
    ) {
        $this->paymentService = $paymentService ?? new PaymentService($pdo);
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
     * @param list<array{method: string, amount: string|numeric, reference_no?: string|null}> $paymentLines
     */
    public function createPurchase(
        int $supplierId,
        array $items,
        string $purchaseDate,
        string $amountPaid,
        int $createdByUserId,
        ?string $paymentMethod = null,
        ?string $notes = null,
        array $paymentLines = []
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

        if (bccomp($amountPaid, '0', 2) < 0) {
            throw new RuntimeException('Payment amount cannot be negative');
        }
        if (bccomp($amountPaid, $grandTotal, 2) > 0) {
            throw new RuntimeException('Payment exceeds balance');
        }

        $cleanPaid = bcadd($amountPaid, '0', 2);
        $paymentStatus = PaymentService::derivePaymentStatus($cleanPaid, $grandTotal);
        $balanceAmount = bcsub($grandTotal, $cleanPaid, 2);

        // Validate and parse payment lines if paid amount > 0
        $parsedPayLines = [];
        if (bccomp($cleanPaid, '0', 2) > 0 && $paymentLines !== []) {
            $allowedMethods = ['CASH', 'UPI', 'CARD', 'NETBANKING'];
            $refRequired = ['UPI', 'CARD', 'NETBANKING'];
            $usedMethods = [];
            $linesSum = '0.00';

            foreach ($paymentLines as $pLine) {
                $m = strtoupper(trim((string) ($pLine['method'] ?? '')));
                if ($m === 'CREDIT') {
                    throw new RuntimeException('Credit/Due cannot be used as a payment line method');
                }
                if (!in_array($m, $allowedMethods, true)) {
                    throw new RuntimeException("Invalid payment method: {$m}");
                }
                if (isset($usedMethods[$m])) {
                    throw new RuntimeException("Duplicate payment method {$m} in one payment is not allowed");
                }
                $usedMethods[$m] = true;

                $amtRaw = $pLine['amount'] ?? null;
                if ($amtRaw === null || !is_numeric($amtRaw)) {
                    throw new RuntimeException("Line amount for {$m} must be numeric");
                }
                $amt = bcadd((string) $amtRaw, '0', 2);
                if (bccomp($amt, '0', 2) <= 0) {
                    throw new RuntimeException("Line amount for {$m} must be greater than 0");
                }

                $refNo = isset($pLine['reference_no']) ? trim((string) $pLine['reference_no']) : '';
                if (in_array($m, $refRequired, true) && $refNo === '') {
                    throw new RuntimeException("Reference number is required for {$m}");
                }

                $parsedPayLines[] = [
                    'method' => $m,
                    'amount' => $amt,
                    'reference_no' => $refNo !== '' ? $refNo : null,
                ];
                $linesSum = bcadd($linesSum, $amt, 2);
            }

            if (bccomp($linesSum, $cleanPaid, 2) !== 0) {
                throw new RuntimeException("Sum of payment lines (₹{$linesSum}) must equal paid amount (₹{$cleanPaid})");
            }

            if (count($usedMethods) > 1) {
                $paymentMethod = 'SPLIT';
            } elseif (count($usedMethods) === 1) {
                $paymentMethod = array_key_first($usedMethods);
            }
        }

        $this->pdo->beginTransaction();

        try {
            $purchaseNo = $this->generatePurchaseNumber();

            $this->pdo->prepare(
                "INSERT INTO purchases (
                    purchase_no, supplier_id, status, subtotal, tax_total, grand_total,
                    paid_amount, balance_amount, amount_paid, payment_method, payment_status, purchase_date, notes, created_by
                ) VALUES (
                    :purchase_no, :supplier_id, 'ACTIVE', :subtotal, :tax_total, :grand_total,
                    :paid_amount, :balance_amount, :amount_paid, :payment_method, :payment_status, :purchase_date, :notes, :created_by
                )"
            )->execute([
                'purchase_no' => $purchaseNo,
                'supplier_id' => $supplierId,
                'subtotal' => $subtotal,
                'tax_total' => $taxTotal,
                'grand_total' => $grandTotal,
                'paid_amount' => $cleanPaid,
                'balance_amount' => $balanceAmount,
                'amount_paid' => $cleanPaid,
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

            // If initial payment was made, record in purchase_payments + lines
            if (bccomp($cleanPaid, '0', 2) > 0) {
                $receiptNo = 'REC-PUR-' . $purchaseId . '-INIT';
                $this->pdo->prepare(
                    "INSERT INTO purchase_payments (
                        purchase_id, supplier_id, receipt_no, payment_date, total_amount, notes, status, created_by
                    ) VALUES (
                        :purchase_id, :supplier_id, :receipt_no, :payment_date, :amount, 'Initial payment upon purchase creation', 'ACTIVE', :created_by
                    )"
                )->execute([
                    'purchase_id' => $purchaseId,
                    'supplier_id' => $supplierId,
                    'receipt_no' => $receiptNo,
                    'payment_date' => $purchaseDate,
                    'amount' => $cleanPaid,
                    'created_by' => $createdByUserId,
                ]);

                $paymentId = (int) $this->pdo->lastInsertId();

                if ($parsedPayLines !== []) {
                    $pLineStmt = $this->pdo->prepare(
                        'INSERT INTO purchase_payment_lines (payment_id, payment_method, amount, reference_no)
                         VALUES (:payment_id, :method, :amount, :reference_no)'
                    );
                    foreach ($parsedPayLines as $pLine) {
                        $pLineStmt->execute([
                            'payment_id' => $paymentId,
                            'method' => $pLine['method'],
                            'amount' => $pLine['amount'],
                            'reference_no' => $pLine['reference_no'],
                        ]);
                    }
                } else {
                    $method = in_array($paymentMethod, ['CASH', 'UPI', 'CARD', 'NETBANKING'], true)
                        ? $paymentMethod
                        : 'CASH';

                    $this->pdo->prepare(
                        'INSERT INTO purchase_payment_lines (payment_id, payment_method, amount, reference_no)
                         VALUES (:payment_id, :method, :amount, NULL)'
                    )->execute([
                        'payment_id' => $paymentId,
                        'method' => $method,
                        'amount' => $cleanPaid,
                    ]);
                }
            }

            // Record initial supplier ledger entry
            $this->pdo->prepare(
                "INSERT INTO supplier_ledger (supplier_id, transaction_type, reference_type, reference_id, amount, paid_amount_delta, notes, created_by)
                 VALUES (:supplier_id, 'PURCHASE', 'PURCHASE', :reference_id, :amount, :paid_delta, :notes, :created_by)"
            )->execute([
                'supplier_id' => $supplierId,
                'reference_id' => $purchaseId,
                'amount' => $grandTotal,
                'paid_delta' => $cleanPaid,
                'notes' => "Purchase {$purchaseNo} created",
                'created_by' => $createdByUserId,
            ]);

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

        // Block cancellation if purchase has active payments or paid_amount > 0 (Decision S16 Option 2)
        $activePaymentStmt = $this->pdo->prepare("SELECT COUNT(*) FROM purchase_payments WHERE purchase_id = :id AND status = 'ACTIVE' AND total_amount > 0");
        $activePaymentStmt->execute(['id' => $purchaseId]);
        $hasActivePayments = (int) $activePaymentStmt->fetchColumn() > 0;

        if ($hasActivePayments || bccomp((string) ($purchase['paid_amount'] ?? '0.00'), '0', 2) > 0) {
            throw new RuntimeException('Reverse the payments first, then cancel this purchase.');
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

            // Insert cancellation reversal row in supplier_ledger (Task C3)
            $this->pdo->prepare(
                "INSERT INTO supplier_ledger (
                    supplier_id, transaction_type, reference_type, reference_id, amount, paid_amount_delta, notes, created_by
                ) VALUES (
                    :supplier_id, 'PURCHASE_CANCEL', 'PURCHASE', :reference_id, :amount, '0.00', :notes, :created_by
                )"
            )->execute([
                'supplier_id' => $purchase['supplier_id'],
                'reference_id' => $purchaseId,
                'amount' => '-' . $purchase['grand_total'],
                'notes' => "Purchase {$purchase['purchase_no']} cancelled: {$reason}",
                'created_by' => $cancelledByUserId,
            ]);

            $this->pdo->prepare(
                "INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, reason)
                 VALUES ('USER', :actor, 'PURCHASE_CANCEL', 'purchase', :id, :reason)"
            )->execute(['actor' => $cancelledByUserId, 'id' => $purchaseId, 'reason' => $reason]);

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

            // Insert supplier_ledger row for the return (Task C1)
            $this->pdo->prepare(
                "INSERT INTO supplier_ledger (
                    supplier_id, transaction_type, reference_type, reference_id, amount, paid_amount_delta, notes, created_by
                ) VALUES (
                    :supplier_id, 'PURCHASE_RETURN', 'PURCHASE_RETURN', :reference_id, :amount, 0.00, :notes, :created_by
                )"
            )->execute([
                'supplier_id' => $purchase['supplier_id'],
                'reference_id' => $returnId,
                'amount' => $grandTotal,
                'notes' => "Purchase Return {$returnNo} for purchase {$purchase['purchase_no']}",
                'created_by' => $createdByUserId,
            ]);

            $this->pdo->prepare(
                "INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, reason)
                 VALUES ('USER', :actor, 'PURCHASE_RETURN', 'purchase_return', :id, :reason)"
            )->execute(['actor' => $createdByUserId, 'id' => $returnId, 'reason' => $reason]);

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

        $purchases = $stmt->fetchAll();
        return array_map([self::class, 'decorateFlags'], $purchases);
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

        return self::decorateFlags($purchase);
    }

    /**
     * Computes read-only backend-driven payment action permission flags.
     *
     * @param array<string, mixed> $purchase
     * @return array<string, mixed>
     */
    public static function decorateFlags(array $purchase): array
    {
        $isDeleted = !empty($purchase['deleted_at']);
        $isCancelled = ($purchase['status'] ?? '') === 'CANCELLED';
        $balance = (string) ($purchase['balance_amount'] ?? '0.00');
        $hasBalance = bccomp($balance, '0', 2) > 0;
        $paid = (string) ($purchase['paid_amount'] ?? $purchase['amount_paid'] ?? '0.00');
        $hasPaid = bccomp($paid, '0', 2) > 0;

        if ($isDeleted) {
            $purchase['can_collect_payment'] = false;
            $purchase['can_edit_payment'] = false;
            $purchase['can_cancel'] = false;
            $purchase['disabled_reason'] = 'Purchase is deleted';
            $purchase['cancel_disabled_reason'] = 'Purchase is deleted';
        } elseif ($isCancelled) {
            $purchase['can_collect_payment'] = false;
            $purchase['can_edit_payment'] = false;
            $purchase['can_cancel'] = false;
            $purchase['disabled_reason'] = 'Purchase is cancelled';
            $purchase['cancel_disabled_reason'] = 'Purchase is already cancelled';
        } else {
            $purchase['can_edit_payment'] = true;
            if ($hasBalance) {
                $purchase['can_collect_payment'] = true;
                $purchase['disabled_reason'] = null;
            } else {
                $purchase['can_collect_payment'] = false;
                $purchase['disabled_reason'] = 'Already fully paid';
            }

            if ($hasPaid) {
                $purchase['can_cancel'] = false;
                $purchase['cancel_disabled_reason'] = 'Reverse the payments first, then cancel this purchase.';
            } else {
                $purchase['can_cancel'] = true;
                $purchase['cancel_disabled_reason'] = null;
            }
        }

        return $purchase;
    }

    /**
     * Updates payment details for a purchase using the unified PaymentService.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function updatePayment(int $purchaseId, array $data, int $userId, ?string $clientIp = null): array
    {
        return $this->paymentService->updatePayment($purchaseId, $data, $userId, $clientIp);
    }

    /**
     * Collects a new payment with single or split lines using PaymentService.
     *
     * @param array<string, mixed> $data
     * @return array{purchase: array<string, mixed>, payment: array<string, mixed>}
     */
    public function collectPayment(int $purchaseId, array $data, int $userId, ?string $clientIp = null): array
    {
        return $this->paymentService->collectPayment($purchaseId, $data, $userId, $clientIp);
    }

    /**
     * Reverses a payment using PaymentService.
     *
     * @return array{purchase: array<string, mixed>, reversed_payment_id: int}
     */
    public function reversePayment(int $purchaseId, int $paymentId, string $reason, int $userId, ?string $clientIp = null): array
    {
        return $this->paymentService->reversePayment($purchaseId, $paymentId, $reason, $userId, $clientIp);
    }

    /**
     * Lists payment history for a purchase.
     *
     * @return list<array<string, mixed>>
     */
    public function listPayments(int $purchaseId): array
    {
        return $this->paymentService->listPayments($purchaseId);
    }

    /**
     * Gets supplier outstanding balance using both ledger and entity formulas.
     *
     * @return array{
     *     supplier_id: int,
     *     ledger_outstanding: string,
     *     entity_outstanding: string,
     *     is_reconciled: bool
     * }
     */
    public function getSupplierOutstanding(int $supplierId): array
    {
        return $this->paymentService->getSupplierOutstanding($supplierId);
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
