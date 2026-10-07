<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Invoice numbering and lifecycle (docs/DOCUMENTATION.md section 16).
 * Deleted invoice numbers are reused — lowest gap first. Cancelled
 * invoice numbers are never reused; cancelling an invoice therefore
 * blocks deleting it (see cancel()/softDelete()), because deletion is
 * what frees a number for reuse.
 */
final class InvoiceService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly InventoryService $inventory,
        private readonly ?CouponService $coupons = null,
        private readonly ?RefundService $refunds = null,
    ) {
    }

    /**
     * Builds an invoice from an already-paid order. Must run inside the
     * caller's transaction (called from OrderService::confirmPayment) —
     * it does not begin/commit its own.
     */
    public function createFromOrder(array $order): int
    {
        $invoiceId = $this->insertWithRetry(function (string $invoiceNo) use ($order) {
            $stmt = $this->pdo->prepare(
                "INSERT INTO invoices (
                    invoice_no, channel, order_id, customer_id, subtotal, discount_total,
                    tax_total, shipping_total, grand_total, amount_paid, payment_status, status
                ) VALUES (
                    :invoice_no, 'ECOMMERCE', :order_id, :customer_id, :subtotal, :discount_total,
                    :tax_total, :shipping_total, :grand_total, :amount_paid, 'PAID', 'ACTIVE'
                )"
            );
            $stmt->execute([
                'invoice_no' => $invoiceNo,
                'order_id' => $order['id'],
                'customer_id' => $order['customer_id'],
                'subtotal' => $order['subtotal'],
                'discount_total' => bcadd((string) $order['coupon_discount_total'], (string) $order['referral_discount_total'], 2),
                'tax_total' => $order['tax_total'],
                'shipping_total' => $order['shipping_total'],
                'grand_total' => $order['grand_total'],
                'amount_paid' => $order['grand_total'],
            ]);

            return (int) $this->pdo->lastInsertId();
        });

        foreach ($order['items'] as $item) {
            $this->pdo->prepare(
                'INSERT INTO invoice_items (
                    invoice_id, product_id, variant_id, product_name_snapshot, variant_label_snapshot,
                    sku_snapshot, quantity, mrp, unit_price, discount_amount, tax_amount, line_total
                ) VALUES (
                    :invoice_id, :product_id, :variant_id, :product_name, :variant_label,
                    :sku, :quantity, :mrp, :unit_price, :discount, :tax_amount, :line_total
                )'
            )->execute([
                'invoice_id' => $invoiceId,
                'product_id' => $item['product_id'],
                'variant_id' => $item['variant_id'],
                'product_name' => $item['product_name_snapshot'],
                'variant_label' => $item['variant_label_snapshot'],
                'sku' => $item['sku_snapshot'],
                'quantity' => $item['quantity'],
                'mrp' => $item['mrp'],
                'unit_price' => $item['unit_price'],
                'discount' => $item['product_discount_amount'],
                'tax_amount' => $item['tax_amount'],
                'line_total' => $item['line_total'],
            ]);
        }

        return $invoiceId;
    }

    /**
     * POS billing (docs/DOCUMENTATION.md section 12). Deducts stock
     * immediately — POS has no reservation phase, it's a completed
     * in-person sale. Runs its own transaction (top-level entry point).
     *
     * @param list<array{variant_id: int, quantity: int}> $items
     */
    public function createPosSale(
        array $items,
        ?int $customerId,
        int $cashierUserId,
        string $paymentMethod,
        string $amountPaid,
        ?string $couponCode = null,
    ): int {
        if ($items === []) {
            throw new RuntimeException('At least one item is required');
        }

        $customerType = 'RETAIL';
        if ($customerId !== null) {
            $stmt = $this->pdo->prepare('SELECT customer_type FROM customers WHERE id = :id');
            $stmt->execute(['id' => $customerId]);
            $customerType = (string) ($stmt->fetchColumn() ?: 'RETAIL');
        }

        $lines = $this->priceLines($items, $customerType);

        foreach ($lines as $line) {
            if (bccomp((string) $line['quantity'], $line['available'], 3) > 0) {
                throw new RuntimeException("Only {$line['available']} of {$line['product_name']} left in stock");
            }
        }

        $subtotal = array_reduce($lines, fn (string $c, array $l) => bcadd($c, $l['line_subtotal'], 2), '0.00');
        $taxTotal = array_reduce($lines, fn (string $c, array $l) => bcadd($c, $l['tax_amount'], 2), '0.00');

        $couponId = null;
        $couponDiscount = '0.00';

        if ($couponCode !== null && trim($couponCode) !== '' && $this->coupons !== null) {
            if ($customerId === null) {
                throw new RuntimeException('A customer must be selected to apply a coupon');
            }

            $couponItems = array_map(fn (array $l) => [
                'variant_id' => $l['variant_id'],
                'product_id' => $l['product_id'],
                'category_ids' => $l['category_ids'],
                'brand_id' => $l['brand_id'],
                'quantity' => $l['quantity'],
                'line_subtotal' => $l['line_subtotal'],
            ], $lines);

            $result = $this->coupons->validate($couponCode, $customerId, $couponItems);
            $couponId = $result['coupon_id'];
            $couponDiscount = $result['discount_amount'];
        }

        $grandTotal = bcadd(bcsub($subtotal, $couponDiscount, 2), $taxTotal, 2);
        $paymentStatus = bccomp($amountPaid, $grandTotal, 2) >= 0 ? 'PAID' : (bccomp($amountPaid, '0', 2) > 0 ? 'PARTIAL' : 'UNPAID');

        $this->pdo->beginTransaction();

        try {
            $invoiceId = $this->insertWithRetry(function (string $invoiceNo) use (
                $customerId, $cashierUserId, $subtotal, $couponDiscount, $taxTotal, $grandTotal, $amountPaid, $paymentMethod, $paymentStatus
            ) {
                $stmt = $this->pdo->prepare(
                    "INSERT INTO invoices (
                        invoice_no, channel, customer_id, cashier_user_id, subtotal, discount_total,
                        tax_total, shipping_total, grand_total, payment_method, amount_paid, payment_status, status
                    ) VALUES (
                        :invoice_no, 'POS', :customer_id, :cashier_user_id, :subtotal, :discount_total,
                        :tax_total, 0, :grand_total, :payment_method, :amount_paid, :payment_status, 'ACTIVE'
                    )"
                );
                $stmt->execute([
                    'invoice_no' => $invoiceNo,
                    'customer_id' => $customerId,
                    'cashier_user_id' => $cashierUserId,
                    'subtotal' => $subtotal,
                    'discount_total' => $couponDiscount,
                    'tax_total' => $taxTotal,
                    'grand_total' => $grandTotal,
                    'payment_method' => $paymentMethod,
                    'amount_paid' => $amountPaid,
                    'payment_status' => $paymentStatus,
                ]);

                return (int) $this->pdo->lastInsertId();
            });

            $lineCount = count($lines);
            $remainingDiscount = $couponDiscount;

            foreach ($lines as $index => $line) {
                $share = bccomp($subtotal, '0', 2) === 0 ? '0' : bcdiv($line['line_subtotal'], $subtotal, 6);
                $allocated = $index === $lineCount - 1 ? $remainingDiscount : bcmul($couponDiscount, $share, 2);
                $remainingDiscount = bcsub($remainingDiscount, $allocated, 2);

                $this->pdo->prepare(
                    'INSERT INTO invoice_items (
                        invoice_id, product_id, variant_id, product_name_snapshot, variant_label_snapshot,
                        sku_snapshot, quantity, mrp, unit_price, discount_amount, tax_amount, line_total
                    ) VALUES (
                        :invoice_id, :product_id, :variant_id, :product_name, :variant_label,
                        :sku, :quantity, :mrp, :unit_price, :discount, :tax_amount, :line_total
                    )'
                )->execute([
                    'invoice_id' => $invoiceId,
                    'product_id' => $line['product_id'],
                    'variant_id' => $line['variant_id'],
                    'product_name' => $line['product_name'],
                    'variant_label' => $line['variant_label'],
                    'sku' => $line['sku'],
                    'quantity' => $line['quantity'],
                    'mrp' => $line['mrp'],
                    'unit_price' => $line['unit_price'],
                    'discount' => $allocated,
                    'tax_amount' => $line['tax_amount'],
                    'line_total' => bcsub(bcadd($line['line_subtotal'], $line['tax_amount'], 2), $allocated, 2),
                ]);

                $this->inventory->apply(
                    variantId: $line['variant_id'],
                    productId: $line['product_id'],
                    movementType: 'SALE',
                    onHandDelta: '-' . $line['quantity'],
                    reservedDelta: '0',
                    referenceType: 'INVOICE',
                    referenceId: $invoiceId,
                    referenceItemId: null,
                    channel: 'POS',
                    userId: $cashierUserId,
                    idempotencyKey: "invoice-sale-{$invoiceId}-{$line['variant_id']}",
                );
            }

            if ($couponId !== null && $customerId !== null) {
                $this->coupons->recordUsage($couponId, $customerId, null, $couponDiscount);
            }

            $this->pdo->commit();

            return $invoiceId;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function cancel(int $invoiceId, string $reason, int $cancelledByUserId): array
    {
        $invoice = $this->find($invoiceId);

        if ($invoice === null) {
            throw new RuntimeException('Invoice not found');
        }

        if ($invoice['status'] === 'CANCELLED') {
            throw new RuntimeException('Invoice is already cancelled');
        }

        if ($invoice['deleted_at'] !== null) {
            throw new RuntimeException('Invoice is deleted');
        }

        $this->pdo->beginTransaction();

        try {
            foreach ($invoice['items'] as $item) {
                $this->inventory->apply(
                    variantId: (int) $item['variant_id'],
                    productId: (int) $item['product_id'],
                    movementType: 'INVOICE_CANCEL',
                    onHandDelta: (string) $item['quantity'],
                    reservedDelta: '0',
                    referenceType: 'INVOICE',
                    referenceId: $invoiceId,
                    referenceItemId: (int) $item['id'],
                    channel: 'ADMIN',
                    userId: $cancelledByUserId,
                    idempotencyKey: "invoice-cancel-{$invoiceId}-{$item['variant_id']}",
                    reason: $reason,
                );
            }

            $this->pdo->prepare(
                "UPDATE invoices SET status = 'CANCELLED', cancelled_at = NOW(), cancelled_by = :by, cancellation_reason = :reason
                 WHERE id = :id"
            )->execute(['by' => $cancelledByUserId, 'reason' => $reason, 'id' => $invoiceId]);

            $this->pdo->prepare(
                "INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, reason)
                 VALUES ('USER', :actor, 'CANCEL_INVOICE', 'invoice', :id, :reason)"
            )->execute(['actor' => $cancelledByUserId, 'id' => $invoiceId, 'reason' => $reason]);

            if (in_array($invoice['payment_status'], ['PAID', 'PARTIAL'], true) && $this->refunds !== null) {
                $this->refunds->createForInvoice(
                    invoiceId: $invoiceId,
                    customerId: $invoice['customer_id'] !== null ? (int) $invoice['customer_id'] : null,
                    amount: (string) $invoice['amount_paid'],
                    reason: $reason,
                    method: $invoice['payment_method'] ?? 'CASH',
                );
            }

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return $this->find($invoiceId) ?? throw new RuntimeException('Invoice not found after cancellation');
    }

    /** Soft delete — blocked on a cancelled invoice (see class docblock). */
    public function softDelete(int $invoiceId, int $deletedByUserId): void
    {
        $invoice = $this->find($invoiceId);

        if ($invoice === null) {
            throw new RuntimeException('Invoice not found');
        }

        if ($invoice['deleted_at'] !== null) {
            throw new RuntimeException('Invoice is already deleted');
        }

        if ($invoice['status'] === 'CANCELLED') {
            throw new RuntimeException('A cancelled invoice cannot be deleted — its number must never be reused');
        }

        $this->pdo->prepare('UPDATE invoices SET deleted_at = NOW(), deleted_by = :by WHERE id = :id')
            ->execute(['by' => $deletedByUserId, 'id' => $invoiceId]);

        $this->pdo->prepare(
            "INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id)
             VALUES ('USER', :actor, 'DELETE_INVOICE', 'invoice', :id)"
        )->execute(['actor' => $deletedByUserId, 'id' => $invoiceId]);
    }

    /** @param array<string, mixed> $filters */
    public function list(array $filters): array
    {
        // Every column here must be qualified with i. — this now joins
        // customers and users, both of which also have a deleted_at
        // column, so a bare `deleted_at` is ambiguous to MySQL.
        $where = ['i.deleted_at IS NULL'];
        $params = [];

        if (!empty($filters['include_deleted'])) {
            $where = [];
        }

        if (!empty($filters['channel'])) {
            $where[] = 'i.channel = :channel';
            $params['channel'] = $filters['channel'];
        }

        if (!empty($filters['customer_id'])) {
            $where[] = 'i.customer_id = :customer_id';
            $params['customer_id'] = (int) $filters['customer_id'];
        }

        if (!empty($filters['status'])) {
            $where[] = 'i.status = :status';
            $params['status'] = $filters['status'];
        }

        $whereSql = $where === [] ? '1=1' : implode(' AND ', $where);

        $stmt = $this->pdo->prepare(
            "SELECT i.*, c.name AS customer_name, c.phone AS customer_phone, u.name AS cashier_name
             FROM invoices i
             LEFT JOIN customers c ON c.id = i.customer_id
             LEFT JOIN users u ON u.id = i.cashier_user_id
             WHERE {$whereSql} ORDER BY i.created_at DESC LIMIT 200"
        );
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    /** @return array<string, mixed>|null */
    public function find(int $invoiceId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT i.*, c.name AS customer_name, c.phone AS customer_phone, u.name AS cashier_name
             FROM invoices i
             LEFT JOIN customers c ON c.id = i.customer_id
             LEFT JOIN users u ON u.id = i.cashier_user_id
             WHERE i.id = :id'
        );
        $stmt->execute(['id' => $invoiceId]);
        $invoice = $stmt->fetch();

        if ($invoice === false) {
            return null;
        }

        $items = $this->pdo->prepare('SELECT * FROM invoice_items WHERE invoice_id = :id');
        $items->execute(['id' => $invoiceId]);
        $invoice['items'] = $items->fetchAll();

        return $invoice;
    }

    /**
     * Inserts a row using the lowest reusable (deleted, not cancelled)
     * invoice number, retrying on a UNIQUE-key race against another
     * concurrent checkout picking the same gap.
     */
    private function insertWithRetry(callable $insert): int
    {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $invoiceNo = $this->nextInvoiceNumber();

            try {
                return $insert($invoiceNo);
            } catch (\PDOException $e) {
                if ((int) $e->getCode() === 23000 && $attempt < 4) {
                    continue;
                }
                throw $e;
            }
        }

        throw new RuntimeException('Could not allocate an invoice number, please retry');
    }

    /**
     * Lowest gap first: a number is reusable once no *currently active*
     * invoice holds it — checked against active_invoice_no, never the
     * raw invoice_no column, which still reads 'INV-2' on an old deleted
     * row forever even after that number has already been reused by a
     * different row. (That was the original bug here: querying
     * invoice_no instead of active_invoice_no kept re-offering an
     * already-reused number as if it were still free.)
     */
    private function nextInvoiceNumber(): string
    {
        $max = (int) $this->pdo->query(
            "SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_no, 5) AS UNSIGNED)), 0) FROM invoices"
        )->fetchColumn();

        $used = [];
        $stmt = $this->pdo->query('SELECT active_invoice_no FROM invoices WHERE active_invoice_no IS NOT NULL');
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $activeNo) {
            $used[(int) substr((string) $activeNo, 4)] = true;
        }

        for ($n = 1; $n <= $max; $n++) {
            if (!isset($used[$n])) {
                return 'INV-' . $n;
            }
        }

        return 'INV-' . ($max + 1);
    }

    /**
     * @param list<array{variant_id: int, quantity: int}> $items
     * @return list<array<string, mixed>>
     */
    private function priceLines(array $items, string $customerType): array
    {
        $lines = [];

        foreach ($items as $item) {
            $stmt = $this->pdo->prepare(
                'SELECT v.id AS variant_id, v.product_id, v.sku, v.mrp, v.retail_price, v.wholesale_price,
                        g.gst_percent, g.tax_mode, p.name AS product_name, p.brand_id, i.available
                 FROM product_variants v
                 JOIN products p ON p.id = v.product_id
                 LEFT JOIN gst_rates g ON g.id = v.gst_rate_id
                 LEFT JOIN inventory i ON i.variant_id = v.id
                 WHERE v.id = :variant_id AND v.deleted_at IS NULL'
            );
            $stmt->execute(['variant_id' => $item['variant_id']]);
            $variant = $stmt->fetch();

            if ($variant === false) {
                throw new RuntimeException("Variant {$item['variant_id']} not found");
            }

            $quantity = (int) $item['quantity'];
            $unitPrice = PricingService::resolveUnitPrice($variant, $customerType);
            $lineSubtotal = bcmul($unitPrice, (string) $quantity, 2);

            $gstPercent = (string) ($variant['gst_percent'] ?? '0');
            if ($variant['tax_mode'] === 'INCLUSIVE') {
                $taxAmount = bcsub($lineSubtotal, bcdiv(bcmul($lineSubtotal, '100', 4), bcadd('100', $gstPercent, 4), 2), 2);
            } else {
                $taxAmount = bcdiv(bcmul($lineSubtotal, $gstPercent, 4), '100', 2);
            }

            $categoryStmt = $this->pdo->prepare('SELECT category_id FROM product_categories WHERE product_id = :id');
            $categoryStmt->execute(['id' => $variant['product_id']]);

            $attrStmt = $this->pdo->prepare(
                "SELECT GROUP_CONCAT(CONCAT(va.name, ': ', vav.value) SEPARATOR ', ') AS label
                 FROM product_variant_values pvv
                 JOIN variant_attribute_values vav ON vav.id = pvv.attribute_value_id
                 JOIN variant_attributes va ON va.id = vav.attribute_id
                 WHERE pvv.variant_id = :id"
            );
            $attrStmt->execute(['id' => $variant['variant_id']]);

            $lines[] = [
                'variant_id' => (int) $variant['variant_id'],
                'product_id' => (int) $variant['product_id'],
                'brand_id' => $variant['brand_id'] !== null ? (int) $variant['brand_id'] : null,
                'category_ids' => array_map('intval', $categoryStmt->fetchAll(PDO::FETCH_COLUMN)),
                'product_name' => $variant['product_name'],
                'variant_label' => $attrStmt->fetchColumn() ?: null,
                'sku' => $variant['sku'],
                'quantity' => $quantity,
                'mrp' => $variant['mrp'],
                'unit_price' => $unitPrice,
                'line_subtotal' => $lineSubtotal,
                'tax_amount' => $taxAmount,
                'available' => (string) ($variant['available'] ?? '0'),
            ];
        }

        return $lines;
    }
}
