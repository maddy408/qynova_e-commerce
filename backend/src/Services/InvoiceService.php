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

    public const ALLOWED_POS_PAYMENT_METHODS = [
        'CASH',
        'UPI',
        'CARD',
        'NETBANKING',
        'CREDIT',
        'GOOGLE_PAY',
    ];

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
        ?string $priceType = null,
        ?string $discountType = null,
        string|float|int $discountValue = 0
    ): int {
        if ($items === []) {
            throw new RuntimeException('At least one item is required');
        }

        $normalizedMethod = strtoupper(trim($paymentMethod));
        if (!in_array($normalizedMethod, self::ALLOWED_POS_PAYMENT_METHODS, true)) {
            throw new RuntimeException("Invalid payment method '{$paymentMethod}'");
        }

        if ($normalizedMethod === 'CREDIT' && $customerId === null) {
            throw new RuntimeException('Credit payment is only allowed for registered customers');
        }

        $customerType = 'RETAIL';
        if ($customerId !== null) {
            $stmt = $this->pdo->prepare('SELECT customer_type FROM customers WHERE id = :id');
            $stmt->execute(['id' => $customerId]);
            $customerType = (string) ($stmt->fetchColumn() ?: 'RETAIL');
        }

        $effectivePriceType = $priceType ?: $customerType;
        $lines = $this->priceLines($items, $effectivePriceType);

        foreach ($lines as $line) {
            if (bccomp((string) $line['quantity'], $line['available'], 3) > 0) {
                throw new RuntimeException("Only {$line['available']} of {$line['product_name']} left in stock");
            }
        }

        $subtotal = array_reduce($lines, fn (string $c, array $l) => bcadd($c, $l['line_subtotal'], 2), '0.00');

        // Bill Discount Validation & Calculation
        $normalizedDiscountType = null;
        if ($discountType !== null && trim((string) $discountType) !== '') {
            $normalizedDiscountType = strtoupper(trim((string) $discountType));
            if (!in_array($normalizedDiscountType, ['PERCENT', 'AMOUNT'], true)) {
                throw new RuntimeException("Invalid discount type '{$discountType}'");
            }
        }

        $discountValueStr = trim((string) $discountValue);
        if ($discountValueStr === '') {
            $discountValueStr = '0';
        }

        if (!is_numeric($discountValueStr)) {
            throw new RuntimeException('Discount value must be numeric');
        }

        if (bccomp($discountValueStr, '0', 4) < 0) {
            throw new RuntimeException('Discount value cannot be negative');
        }

        if (str_contains($discountValueStr, '.')) {
            $parts = explode('.', $discountValueStr);
            if (isset($parts[1]) && strlen($parts[1]) > 2) {
                throw new RuntimeException('Discount value cannot have more than 2 decimal places');
            }
        }

        $billDiscountAmount = '0.00';
        if ($normalizedDiscountType === 'PERCENT') {
            if (bccomp($discountValueStr, '100', 2) > 0) {
                throw new RuntimeException('Discount percentage cannot exceed 100%');
            }
            $rawPercentDiscount = bcdiv(bcmul($subtotal, $discountValueStr, 6), '100', 4);
            $billDiscountAmount = number_format((float) $rawPercentDiscount, 2, '.', '');
        } elseif ($normalizedDiscountType === 'AMOUNT') {
            if (bccomp($discountValueStr, $subtotal, 2) > 0) {
                throw new RuntimeException('Discount amount cannot exceed subtotal');
            }
            $billDiscountAmount = bcadd($discountValueStr, '0', 2);
        }

        // Cashier role max discount check
        $stmtUserRole = $this->pdo->prepare('SELECT r.code FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = :id LIMIT 1');
        $stmtUserRole->execute(['id' => $cashierUserId]);
        $userRole = strtoupper((string) ($stmtUserRole->fetchColumn() ?: 'CASHIER'));

        if ($userRole === 'CASHIER' && bccomp($subtotal, '0', 2) > 0 && bccomp($billDiscountAmount, '0', 2) > 0) {
            $maxDiscountPercent = (float) $this->getSetting('pos_cashier_max_discount_percent', '100');
            $effectivePercent = (float) bcdiv(bcmul($billDiscountAmount, '100', 4), $subtotal, 2);
            if ($effectivePercent > $maxDiscountPercent) {
                throw new RuntimeException("Discount exceeds cashier maximum allowed limit of {$maxDiscountPercent}%");
            }
        }

        // Coupon + Bill Discount conflict check
        if ($couponCode !== null && trim($couponCode) !== '' && bccomp($billDiscountAmount, '0', 2) > 0) {
            $allowWithCoupon = (bool) (int) $this->getSetting('pos_allow_bill_discount_with_coupon', '0');
            if (!$allowWithCoupon) {
                throw new RuntimeException('Cannot combine bill discount with coupon');
            }
        }

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

        // Proportional line allocation of Bill Discount and Tax computation on discounted value
        $lineCount = count($lines);
        $remainingBillDiscount = $billDiscountAmount;
        $taxTotal = '0.00';
        $grandTotal = '0.00';
        $allocatedLines = [];

        foreach ($lines as $index => $line) {
            $lineSub = $line['line_subtotal'];
            $allocated = '0.00';

            if (bccomp($billDiscountAmount, '0', 2) > 0 && bccomp($subtotal, '0', 2) > 0) {
                if ($index === $lineCount - 1) {
                    $allocated = $remainingBillDiscount;
                } else {
                    $share = bcdiv($lineSub, $subtotal, 10);
                    $rawAlloc = bcmul($billDiscountAmount, $share, 4);
                    $allocated = number_format((float) $rawAlloc, 2, '.', '');
                    if (bccomp($allocated, $remainingBillDiscount, 2) > 0) {
                        $allocated = $remainingBillDiscount;
                    }
                }
                $remainingBillDiscount = bcsub($remainingBillDiscount, $allocated, 2);
            }

            $discountedLineSub = bcsub($lineSub, $allocated, 2);
            if (bccomp($discountedLineSub, '0', 2) < 0) {
                $discountedLineSub = '0.00';
            }

            $gstPercent = (string) ($line['gst_percent'] ?? '0');
            $taxMode = (string) ($line['tax_mode'] ?? 'EXCLUSIVE');

            if ($taxMode === 'INCLUSIVE') {
                $rawBase = bcdiv(bcmul($discountedLineSub, '100', 6), bcadd('100', $gstPercent, 6), 4);
                $rawTax = bcsub($discountedLineSub, $rawBase, 4);
                $lineTax = number_format((float) $rawTax, 2, '.', '');
                $lineTotal = $discountedLineSub;
            } else {
                $rawTax = bcdiv(bcmul($discountedLineSub, $gstPercent, 6), '100', 4);
                $lineTax = number_format((float) $rawTax, 2, '.', '');
                $lineTotal = bcadd($discountedLineSub, $lineTax, 2);
            }

            $taxTotal = bcadd($taxTotal, $lineTax, 2);
            $grandTotal = bcadd($grandTotal, $lineTotal, 2);

            $allocatedLines[] = array_merge($line, [
                'allocated_bill_discount' => $allocated,
                'discounted_line_subtotal' => $discountedLineSub,
                'tax_amount' => $lineTax,
                'line_total' => $lineTotal,
            ]);
        }

        if (bccomp($couponDiscount, '0', 2) > 0) {
            $grandTotal = bcsub($grandTotal, $couponDiscount, 2);
            if (bccomp($grandTotal, '0', 2) < 0) {
                $grandTotal = '0.00';
            }
        }

        $discountTotal = bcadd($billDiscountAmount, $couponDiscount, 2);
        $paymentStatus = bccomp($amountPaid, $grandTotal, 2) >= 0 ? 'PAID' : (bccomp($amountPaid, '0', 2) > 0 ? 'PARTIAL' : 'UNPAID');

        $this->pdo->beginTransaction();

        try {
            $invoiceId = $this->insertWithRetry(function (string $invoiceNo) use (
                $customerId, $cashierUserId, $effectivePriceType, $subtotal, $discountTotal,
                $normalizedDiscountType, $discountValueStr, $billDiscountAmount,
                $taxTotal, $grandTotal, $amountPaid, $normalizedMethod, $paymentStatus
            ) {
                $stmt = $this->pdo->prepare(
                    "INSERT INTO invoices (
                        invoice_no, channel, customer_id, cashier_user_id, customer_type, subtotal, discount_total,
                        bill_discount_type, bill_discount_value, bill_discount_amount,
                        tax_total, shipping_total, grand_total, payment_method, amount_paid, payment_status, status
                    ) VALUES (
                        :invoice_no, 'POS', :customer_id, :cashier_user_id, :customer_type, :subtotal, :discount_total,
                        :bill_discount_type, :bill_discount_value, :bill_discount_amount,
                        :tax_total, 0, :grand_total, :payment_method, :amount_paid, :payment_status, 'ACTIVE'
                    )"
                );
                $stmt->execute([
                    'invoice_no' => $invoiceNo,
                    'customer_id' => $customerId,
                    'cashier_user_id' => $cashierUserId,
                    'customer_type' => in_array(strtoupper($effectivePriceType), ['NORMAL', 'RETAIL', 'WHOLESALE'], true) ? strtoupper($effectivePriceType) : 'NORMAL',
                    'subtotal' => $subtotal,
                    'discount_total' => $discountTotal,
                    'bill_discount_type' => $normalizedDiscountType,
                    'bill_discount_value' => $discountValueStr,
                    'bill_discount_amount' => $billDiscountAmount,
                    'tax_total' => $taxTotal,
                    'grand_total' => $grandTotal,
                    'payment_method' => $normalizedMethod,
                    'amount_paid' => $amountPaid,
                    'payment_status' => $paymentStatus,
                ]);

                return (int) $this->pdo->lastInsertId();
            });

            foreach ($allocatedLines as $line) {
                $this->pdo->prepare(
                    'INSERT INTO invoice_items (
                        invoice_id, product_id, variant_id, product_name_snapshot, variant_label_snapshot,
                        sku_snapshot, quantity, mrp, unit_price, discount_amount, bill_discount_amount, tax_amount, line_total
                    ) VALUES (
                        :invoice_id, :product_id, :variant_id, :product_name, :variant_label,
                        :sku, :quantity, :mrp, :unit_price, :discount, :bill_discount_amount, :tax_amount, :line_total
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
                    'discount' => $line['allocated_bill_discount'],
                    'bill_discount_amount' => $line['allocated_bill_discount'],
                    'tax_amount' => $line['tax_amount'],
                    'line_total' => $line['line_total'],
                ]);

                if (!empty($line['variant_id']) && (int) $line['variant_id'] > 0) {
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

                    try {
                        (new BatchService($this->pdo))->consumeStock(
                            variantId: $line['variant_id'],
                            qtyToConsume: (float) $line['quantity'],
                            referenceType: 'INVOICE',
                            referenceId: $invoiceId,
                            remarks: "POS Invoice #{$invoiceId}"
                        );
                    } catch (\Throwable $ex) {
                        error_log("Batch consumption warning: " . $ex->getMessage());
                    }
                }
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

        if (!empty($filters['customer_type'])) {
            $where[] = 'i.customer_type = :customer_type';
            $params['customer_type'] = strtoupper($filters['customer_type']);
        }

        if (!empty($filters['date_from'])) {
            $where[] = 'DATE(i.created_at) >= :date_from';
            $params['date_from'] = $filters['date_from'];
        }

        if (!empty($filters['date_to'])) {
            $where[] = 'DATE(i.created_at) <= :date_to';
            $params['date_to'] = $filters['date_to'];
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

        $items = $this->pdo->prepare(
            'SELECT ii.*, h.code AS hsn_code, u.name AS unit_name, g.gst_percent, g.tax_mode
             FROM invoice_items ii
             LEFT JOIN products p ON p.id = ii.product_id
             LEFT JOIN hsn_codes h ON h.id = p.hsn_code_id
             LEFT JOIN units u ON u.id = p.unit_id
             LEFT JOIN product_variants v ON v.id = ii.variant_id
             LEFT JOIN gst_rates g ON g.id = v.gst_rate_id
             WHERE ii.invoice_id = :id'
        );
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
     * @param list<array{variant_id: int, quantity: int, unit_price?: float|string}> $items
     * @return list<array<string, mixed>>
     */
    private function priceLines(array $items, string $customerType): array
    {
        $lines = [];

        foreach ($items as $item) {
            if ((int) ($item['variant_id'] ?? 0) <= 0 || !empty($item['is_quick_sale'])) {
                $quantity = (int) ($item['quantity'] ?? 1);
                $unitPrice = (string) (float) ($item['unit_price'] ?? 0);
                $lineSubtotal = bcmul($unitPrice, (string) $quantity, 2);
                $lines[] = [
                    'variant_id' => null,
                    'product_id' => null,
                    'brand_id' => null,
                    'category_ids' => [],
                    'product_name' => (string) ($item['product_name'] ?? 'Quick Sale Item'),
                    'variant_label' => 'Quick Sale',
                    'sku' => 'QUICK-SALE',
                    'quantity' => $quantity,
                    'mrp' => $unitPrice,
                    'unit_price' => $unitPrice,
                    'line_subtotal' => $lineSubtotal,
                    'tax_amount' => '0.00',
                    'available' => '999999',
                ];
                continue;
            }

            $stmt = $this->pdo->prepare(
                'SELECT v.id AS variant_id, v.product_id, v.sku, v.mrp, v.retail_price, v.wholesale_price, v.customer_price,
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

            if (isset($item['unit_price']) && is_numeric($item['unit_price']) && (float) $item['unit_price'] > 0) {
                $unitPrice = (string) (float) $item['unit_price'];
            } else {
                $unitPrice = PricingService::resolveUnitPrice($variant, $customerType);
            }
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

    private function getSetting(string $key, string $default): string
    {
        try {
            $stmt = $this->pdo->prepare('SELECT setting_value FROM app_settings WHERE setting_key = :k LIMIT 1');
            $stmt->execute(['k' => $key]);
            $val = $stmt->fetchColumn();
            return $val !== false ? (string) $val : $default;
        } catch (\Throwable) {
            return $default;
        }
    }
}
