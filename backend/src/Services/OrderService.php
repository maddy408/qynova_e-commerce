<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Checkout and order lifecycle (docs/DOCUMENTATION.md sections 13, 20;
 * ECOMMERCE_POS_ADMIN_SPEC.md sections 18-20, 36-38). Backend recomputes
 * every money value from product_variants/coupons/referral_rewards —
 * the frontend only ever sends variant_id + quantity (+ an optional
 * coupon code), never a price or a total (docs section 23).
 *
 * Partial cancellation with coupon re-validation (docs section 9) is not
 * built yet — cancel() here only supports cancelling the whole order. See
 * database/README.md.
 */
final class OrderService
{
    private const FLAT_SHIPPING = '50.00';
    private const FREE_SHIPPING_ABOVE = '500.00';
    private const RESERVATION_MINUTES = 20;

    public function __construct(
        private readonly PDO $pdo,
        private readonly InventoryService $inventory,
        private readonly CouponService $coupons,
        private readonly InvoiceService $invoices,
        private readonly RefundService $refunds,
    ) {
    }

    /**
     * @param list<array{variant_id: int, quantity: int}> $items
     * @return array<string, mixed>
     */
    public function preview(int $customerId, array $items, ?string $couponCode): array
    {
        $customerType = $this->customerType($customerId);
        $lines = $this->priceLines($items, $customerType);

        return $this->computeTotals($customerId, $lines, $couponCode);
    }

    /**
     * @param list<array{variant_id: int, quantity: int}> $items
     * @return array<string, mixed>
     */
    public function checkout(int $customerId, array $items, array $address, ?string $couponCode): array
    {
        if ($items === []) {
            throw new RuntimeException('Cart is empty');
        }

        foreach (['name', 'phone', 'line1', 'city_district', 'state', 'pincode'] as $field) {
            if (trim((string) ($address[$field] ?? '')) === '') {
                throw new RuntimeException("Address field '{$field}' is required");
            }
        }

        $customerType = $this->customerType($customerId);
        $lines = $this->priceLines($items, $customerType);

        foreach ($lines as $line) {
            if (!$line['is_active'] || !$line['is_ecommerce_enabled']) {
                throw new RuntimeException("{$line['product_name']} is not available for purchase");
            }

            if (bccomp((string) $line['quantity'], $line['available'], 3) > 0) {
                throw new RuntimeException("Only {$line['available']} of {$line['product_name']} left in stock");
            }
        }

        $totals = $this->computeTotals($customerId, $lines, $couponCode);

        if (isset($totals['coupon_error']) && $couponCode !== null) {
            throw new RuntimeException($totals['coupon_error']);
        }

        $this->pdo->beginTransaction();

        try {
            $orderNo = $this->generateOrderNumber();

            $this->pdo->prepare(
                "INSERT INTO orders (
                    order_no, customer_id, status, payment_status, subtotal, product_discount_total,
                    coupon_id, coupon_code, coupon_discount_total, referral_reward_id, referral_discount_total,
                    tax_total, shipping_total, grand_total,
                    shipping_name, shipping_phone, shipping_line1, shipping_line2,
                    shipping_city_district, shipping_state, shipping_pincode
                ) VALUES (
                    :order_no, :customer_id, 'PENDING', 'PENDING', :subtotal, :product_discount_total,
                    :coupon_id, :coupon_code, :coupon_discount_total, :referral_reward_id, :referral_discount_total,
                    :tax_total, :shipping_total, :grand_total,
                    :shipping_name, :shipping_phone, :shipping_line1, :shipping_line2,
                    :shipping_city_district, :shipping_state, :shipping_pincode
                )"
            )->execute([
                'order_no' => $orderNo,
                'customer_id' => $customerId,
                'subtotal' => $totals['subtotal'],
                'product_discount_total' => $totals['product_discount_total'],
                'coupon_id' => $totals['coupon_id'] ?? null,
                'coupon_code' => $totals['coupon_id'] !== null ? strtoupper((string) $couponCode) : null,
                'coupon_discount_total' => $totals['coupon_discount'],
                'referral_reward_id' => $totals['referral_reward_id'] ?? null,
                'referral_discount_total' => $totals['referral_discount'],
                'tax_total' => $totals['tax_total'],
                'shipping_total' => $totals['shipping_total'],
                'grand_total' => $totals['grand_total'],
                'shipping_name' => $address['name'],
                'shipping_phone' => $address['phone'],
                'shipping_line1' => $address['line1'],
                'shipping_line2' => $address['line2'] ?? null,
                'shipping_city_district' => $address['city_district'],
                'shipping_state' => $address['state'],
                'shipping_pincode' => $address['pincode'],
            ]);

            $orderId = (int) $this->pdo->lastInsertId();

            foreach ($totals['lines'] as $line) {
                $this->pdo->prepare(
                    'INSERT INTO order_items (
                        order_id, product_id, variant_id, product_name_snapshot, variant_label_snapshot,
                        sku_snapshot, quantity, mrp, unit_price, product_discount_amount, tax_amount, line_total
                    ) VALUES (
                        :order_id, :product_id, :variant_id, :product_name, :variant_label,
                        :sku, :quantity, :mrp, :unit_price, :product_discount, :tax_amount, :line_total
                    )'
                )->execute([
                    'order_id' => $orderId,
                    'product_id' => $line['product_id'],
                    'variant_id' => $line['variant_id'],
                    'product_name' => $line['product_name'],
                    'variant_label' => $line['variant_label'],
                    'sku' => $line['sku'],
                    'quantity' => $line['quantity'],
                    'mrp' => $line['mrp'],
                    'unit_price' => $line['unit_price'],
                    'product_discount' => $line['product_discount_amount'],
                    'tax_amount' => $line['tax_amount'],
                    'line_total' => $line['line_total'],
                ]);
                $orderItemId = (int) $this->pdo->lastInsertId();

                foreach (['coupon' => $line['coupon_discount_allocated'] ?? '0.00', 'referral' => $line['referral_discount_allocated'] ?? '0.00'] as $type => $amount) {
                    if (bccomp($amount, '0', 2) > 0) {
                        $this->pdo->prepare(
                            'INSERT INTO order_item_discounts (order_item_id, discount_type, amount) VALUES (:item_id, :type, :amount)'
                        )->execute(['item_id' => $orderItemId, 'type' => strtoupper($type), 'amount' => $amount]);
                    }
                }

                $this->inventory->apply(
                    variantId: $line['variant_id'],
                    productId: $line['product_id'],
                    movementType: 'ORDER_RESERVE',
                    onHandDelta: '0',
                    reservedDelta: (string) $line['quantity'],
                    referenceType: 'ORDER',
                    referenceId: $orderId,
                    referenceItemId: $orderItemId,
                    channel: 'ECOMMERCE',
                    userId: null,
                    idempotencyKey: "order-reserve-{$orderId}-{$line['variant_id']}",
                );

                $this->pdo->prepare(
                    "INSERT INTO stock_reservations (order_id, variant_id, quantity, status, expires_at)
                     VALUES (:order_id, :variant_id, :quantity, 'ACTIVE', DATE_ADD(NOW(), INTERVAL :minutes MINUTE))"
                )->execute([
                    'order_id' => $orderId,
                    'variant_id' => $line['variant_id'],
                    'quantity' => $line['quantity'],
                    'minutes' => self::RESERVATION_MINUTES,
                ]);
            }

            if (isset($totals['coupon_id'])) {
                $this->coupons->recordUsage($totals['coupon_id'], $customerId, $orderId, $totals['coupon_discount']);
            }

            if (isset($totals['referral_reward_id'])) {
                $this->pdo->prepare(
                    "UPDATE referral_rewards SET status = 'APPLIED', applied_order_id = :order_id WHERE id = :id"
                )->execute(['order_id' => $orderId, 'id' => $totals['referral_reward_id']]);
            }

            $this->logStatus($orderId, null, 'PENDING', null, 'SYSTEM', 'Order created at checkout');

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return $this->find($orderId) ?? throw new RuntimeException('Order created but could not be reloaded');
    }

    /**
     * Mock payment success (no real gateway integration yet — see
     * docs/DOCUMENTATION.md section 14 for the intended Razorpay flow).
     */
    public function confirmPayment(int $orderId): array
    {
        $order = $this->find($orderId);

        if ($order === null) {
            throw new RuntimeException('Order not found');
        }

        if ($order['payment_status'] !== 'PENDING') {
            throw new RuntimeException('Order payment is not pending');
        }

        $this->pdo->beginTransaction();

        try {
            foreach ($order['items'] as $item) {
                $this->inventory->apply(
                    variantId: $item['variant_id'],
                    productId: $item['product_id'],
                    movementType: 'ORDER_CONFIRM',
                    onHandDelta: '-' . $item['quantity'],
                    reservedDelta: '-' . $item['quantity'],
                    referenceType: 'ORDER',
                    referenceId: $orderId,
                    referenceItemId: $item['id'],
                    channel: 'ECOMMERCE',
                    userId: null,
                    idempotencyKey: "order-confirm-{$orderId}-{$item['variant_id']}",
                );
            }

            $this->pdo->prepare(
                "UPDATE stock_reservations SET status = 'CONSUMED' WHERE order_id = :id AND status = 'ACTIVE'"
            )->execute(['id' => $orderId]);

            $this->pdo->prepare("UPDATE orders SET status = 'CONFIRMED', payment_status = 'PAID' WHERE id = :id")
                ->execute(['id' => $orderId]);

            $this->logStatus($orderId, 'PENDING', 'CONFIRMED', null, 'SYSTEM', 'Payment confirmed');

            $this->invoices->createFromOrder($order);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return $this->find($orderId) ?? throw new RuntimeException('Order not found after confirmation');
    }

    public function cancel(int $orderId, string $reason, ?int $actorUserId): array
    {
        $order = $this->find($orderId);

        if ($order === null) {
            throw new RuntimeException('Order not found');
        }

        if (in_array($order['status'], ['CANCELLED', 'DELIVERED', 'REFUNDED'], true)) {
            throw new RuntimeException("Order is already {$order['status']} and cannot be cancelled");
        }

        $this->pdo->beginTransaction();

        try {
            $wasPaid = $order['payment_status'] === 'PAID';

            foreach ($order['items'] as $item) {
                if ($wasPaid) {
                    $this->inventory->apply(
                        variantId: $item['variant_id'],
                        productId: $item['product_id'],
                        movementType: 'ORDER_CANCEL',
                        onHandDelta: (string) $item['quantity'],
                        reservedDelta: '0',
                        referenceType: 'ORDER',
                        referenceId: $orderId,
                        referenceItemId: $item['id'],
                        channel: 'ADMIN',
                        userId: $actorUserId,
                        idempotencyKey: "order-cancel-{$orderId}-{$item['variant_id']}",
                        reason: $reason,
                    );
                } else {
                    $this->inventory->apply(
                        variantId: $item['variant_id'],
                        productId: $item['product_id'],
                        movementType: 'ORDER_RESERVE_RELEASE',
                        onHandDelta: '0',
                        reservedDelta: '-' . $item['quantity'],
                        referenceType: 'ORDER',
                        referenceId: $orderId,
                        referenceItemId: $item['id'],
                        channel: 'ADMIN',
                        userId: $actorUserId,
                        idempotencyKey: "order-release-{$orderId}-{$item['variant_id']}",
                        reason: $reason,
                    );
                }
            }

            $this->pdo->prepare(
                "UPDATE stock_reservations SET status = 'RELEASED' WHERE order_id = :id AND status = 'ACTIVE'"
            )->execute(['id' => $orderId]);

            if ($order['coupon_id'] !== null) {
                $this->pdo->prepare('DELETE FROM coupon_usages WHERE order_id = :id')->execute(['id' => $orderId]);
            }

            if ($order['referral_reward_id'] !== null) {
                $this->pdo->prepare(
                    "UPDATE referral_rewards SET status = 'ELIGIBLE', applied_order_id = NULL WHERE id = :id"
                )->execute(['id' => $order['referral_reward_id']]);
            }

            $this->pdo->prepare(
                "UPDATE orders SET status = 'CANCELLED', payment_status = IF(payment_status = 'PAID', 'REFUNDED', 'FAILED'),
                        cancelled_at = NOW(), cancellation_reason = :reason
                 WHERE id = :id"
            )->execute(['reason' => $reason, 'id' => $orderId]);

            $this->logStatus($orderId, $order['status'], 'CANCELLED', $actorUserId, $actorUserId === null ? 'CUSTOMER' : 'ADMIN', $reason);

            if ($wasPaid) {
                $this->refunds->createForOrder(
                    orderId: $orderId,
                    customerId: (int) $order['customer_id'],
                    amount: (string) $order['grand_total'],
                    reason: $reason,
                    method: 'RAZORPAY',
                );
            }

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return $this->find($orderId) ?? throw new RuntimeException('Order not found after cancellation');
    }

    public function updateStatus(int $orderId, string $newStatus, ?int $actorUserId, ?string $note): array
    {
        $order = $this->find($orderId);

        if ($order === null) {
            throw new RuntimeException('Order not found');
        }

        if (in_array($order['status'], ['CANCELLED', 'DELIVERED', 'REFUNDED'], true)) {
            throw new RuntimeException("Order is {$order['status']} and its status can no longer be changed here");
        }

        $allowed = ['PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

        if (!in_array($newStatus, $allowed, true)) {
            throw new RuntimeException('Use the dedicated cancel endpoint to cancel an order');
        }

        $this->pdo->prepare('UPDATE orders SET status = :status WHERE id = :id')
            ->execute(['status' => $newStatus, 'id' => $orderId]);

        $this->logStatus($orderId, $order['status'], $newStatus, $actorUserId, 'ADMIN', $note);

        return $this->find($orderId) ?? throw new RuntimeException('Order not found after status update');
    }

    /** @param array<string, mixed> $filters */
    public function list(array $filters): array
    {
        $where = [];
        $params = [];

        if (!empty($filters['customer_id'])) {
            $where[] = 'o.customer_id = :customer_id';
            $params['customer_id'] = (int) $filters['customer_id'];
        }

        if (!empty($filters['status'])) {
            $where[] = 'o.status = :status';
            $params['status'] = $filters['status'];
        }

        if (!empty($filters['payment_status'])) {
            $where[] = 'o.payment_status = :payment_status';
            $params['payment_status'] = $filters['payment_status'];
        }

        if (!empty($filters['search'])) {
            $where[] = '(o.order_no LIKE :search OR c.name LIKE :search2)';
            $params['search'] = '%' . $filters['search'] . '%';
            $params['search2'] = '%' . $filters['search'] . '%';
        }

        $whereSql = $where === [] ? '1=1' : implode(' AND ', $where);

        $stmt = $this->pdo->prepare(
            "SELECT o.id, o.order_no, o.customer_id, c.name AS customer_name, o.status, o.payment_status,
                    o.grand_total, o.created_at
             FROM orders o JOIN customers c ON c.id = o.customer_id
             WHERE {$whereSql} ORDER BY o.created_at DESC LIMIT 200"
        );
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    /** @return array<string, mixed>|null */
    public function find(int $orderId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT o.*, c.name AS customer_name, c.phone AS customer_phone FROM orders o
             JOIN customers c ON c.id = o.customer_id WHERE o.id = :id'
        );
        $stmt->execute(['id' => $orderId]);
        $order = $stmt->fetch();

        if ($order === false) {
            return null;
        }

        $items = $this->pdo->prepare('SELECT * FROM order_items WHERE order_id = :id');
        $items->execute(['id' => $orderId]);
        $order['items'] = $items->fetchAll();

        $history = $this->pdo->prepare('SELECT * FROM order_status_history WHERE order_id = :id ORDER BY created_at');
        $history->execute(['id' => $orderId]);
        $order['status_history'] = $history->fetchAll();

        return $order;
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
                        v.gst_rate_id, g.gst_percent, g.tax_mode, p.name AS product_name, p.is_active,
                        p.is_ecommerce_enabled, i.available,
                        p.brand_id
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
            $productDiscount = bcmul(bcsub((string) $variant['mrp'], $unitPrice, 2), (string) $quantity, 2);

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
                'product_discount_amount' => $productDiscount,
                'tax_amount' => $taxAmount,
                'line_total' => bcadd($lineSubtotal, $taxAmount, 2),
                'is_active' => (bool) $variant['is_active'],
                'is_ecommerce_enabled' => (bool) $variant['is_ecommerce_enabled'],
                'available' => (string) ($variant['available'] ?? '0'),
            ];
        }

        return $lines;
    }

    /**
     * Applies coupon (priority 2) then referral (priority 3) discount on
     * top of product discount, already baked into unit_price (priority 1)
     * — docs/ECOMMERCE_POS_ADMIN_SPEC.md section 38. A coupon's
     * can_combine_with_referral flag controls whether both apply.
     *
     * @param list<array<string, mixed>> $lines
     */
    private function computeTotals(int $customerId, array $lines, ?string $couponCode): array
    {
        $subtotal = array_reduce($lines, fn (string $c, array $l) => bcadd($c, $l['line_subtotal'], 2), '0.00');
        $productDiscountTotal = array_reduce($lines, fn (string $c, array $l) => bcadd($c, $l['product_discount_amount'], 2), '0.00');
        $taxTotal = array_reduce($lines, fn (string $c, array $l) => bcadd($c, $l['tax_amount'], 2), '0.00');
        $shippingTotal = bccomp($subtotal, self::FREE_SHIPPING_ABOVE, 2) >= 0 ? '0.00' : self::FLAT_SHIPPING;

        $couponId = null;
        $couponDiscount = '0.00';
        $couponError = null;
        $canCombineWithReferral = true;

        if ($couponCode !== null && trim($couponCode) !== '') {
            try {
                $items = array_map(fn (array $l) => [
                    'variant_id' => $l['variant_id'],
                    'product_id' => $l['product_id'],
                    'category_ids' => $l['category_ids'],
                    'brand_id' => $l['brand_id'],
                    'quantity' => $l['quantity'],
                    'line_subtotal' => $l['line_subtotal'],
                ], $lines);

                $result = $this->coupons->validate($couponCode, $customerId, $items);
                $couponId = $result['coupon_id'];
                $couponDiscount = $result['discount_amount'];
                $canCombineWithReferral = (bool) $result['coupon']['can_combine_with_referral'];
            } catch (RuntimeException $e) {
                $couponError = $e->getMessage();
            }
        }

        $referralRewardId = null;
        $referralDiscount = '0.00';

        if ($couponId === null || $canCombineWithReferral) {
            $reward = $this->findApplicableReferralReward($customerId);

            if ($reward !== null) {
                $afterCoupon = bcsub($subtotal, $couponDiscount, 2);
                $settings = $this->pdo->query('SELECT * FROM referral_settings WHERE id = 1')->fetch();

                if ($settings['min_order_amount'] === null || bccomp($afterCoupon, (string) $settings['min_order_amount'], 2) >= 0) {
                    $referralDiscount = bcdiv(bcmul($afterCoupon, (string) $reward['discount_percent'], 4), '100', 2);

                    if ($settings['max_discount_amount'] !== null && bccomp($referralDiscount, (string) $settings['max_discount_amount'], 2) > 0) {
                        $referralDiscount = (string) $settings['max_discount_amount'];
                    }

                    $referralRewardId = (int) $reward['id'];
                }
            }
        }

        $totalDiscount = bcadd($couponDiscount, $referralDiscount, 2);
        $allocatedLines = $this->allocateDiscounts($lines, $couponDiscount, $referralDiscount);

        $grandTotal = bcadd(bcadd(bcsub($subtotal, $totalDiscount, 2), $taxTotal, 2), $shippingTotal, 2);

        return [
            'lines' => $allocatedLines,
            'subtotal' => $subtotal,
            'product_discount_total' => $productDiscountTotal,
            'coupon_id' => $couponId,
            'coupon_discount' => $couponDiscount,
            'coupon_error' => $couponError,
            'referral_reward_id' => $referralRewardId,
            'referral_discount' => $referralDiscount,
            'tax_total' => $taxTotal,
            'shipping_total' => $shippingTotal,
            'grand_total' => $grandTotal,
        ];
    }

    /**
     * Allocates coupon/referral discount across lines proportionally to
     * each line's subtotal, the last line absorbing the rounding
     * remainder (docs/DOCUMENTATION.md section 9's allocation rule).
     *
     * @param list<array<string, mixed>> $lines
     * @return list<array<string, mixed>>
     */
    private function allocateDiscounts(array $lines, string $couponDiscount, string $referralDiscount): array
    {
        $subtotal = array_reduce($lines, fn (string $c, array $l) => bcadd($c, $l['line_subtotal'], 2), '0.00');

        if (bccomp($subtotal, '0', 2) === 0) {
            return $lines;
        }

        $remainingCoupon = $couponDiscount;
        $remainingReferral = $referralDiscount;
        $count = count($lines);

        foreach ($lines as $index => &$line) {
            $isLast = $index === $count - 1;
            $share = bcdiv($line['line_subtotal'], $subtotal, 6);

            $line['coupon_discount_allocated'] = $isLast ? $remainingCoupon : bcmul($couponDiscount, $share, 2);
            $line['referral_discount_allocated'] = $isLast ? $remainingReferral : bcmul($referralDiscount, $share, 2);

            $remainingCoupon = bcsub($remainingCoupon, $line['coupon_discount_allocated'], 2);
            $remainingReferral = bcsub($remainingReferral, $line['referral_discount_allocated'], 2);
        }
        unset($line);

        return $lines;
    }

    /** @return array<string, mixed>|null */
    private function findApplicableReferralReward(int $customerId): ?array
    {
        $stmt = $this->pdo->prepare(
            "SELECT * FROM referral_rewards WHERE beneficiary_customer_id = :id AND status = 'ELIGIBLE'
             AND (expires_at IS NULL OR expires_at >= NOW()) ORDER BY id LIMIT 1"
        );
        $stmt->execute(['id' => $customerId]);
        $reward = $stmt->fetch();

        if ($reward !== false) {
            return $reward;
        }

        // FIRST_ORDER-triggered rewards become eligible the moment this is
        // actually the customer's first order.
        $stmt = $this->pdo->prepare(
            "SELECT * FROM referral_rewards WHERE beneficiary_customer_id = :id AND status = 'PENDING'
             AND trigger_event = 'FIRST_ORDER' AND (expires_at IS NULL OR expires_at >= NOW()) ORDER BY id LIMIT 1"
        );
        $stmt->execute(['id' => $customerId]);
        $pending = $stmt->fetch();

        if ($pending === false) {
            return null;
        }

        $orderCount = $this->pdo->prepare("SELECT COUNT(*) FROM orders WHERE customer_id = :id AND status != 'CANCELLED'");
        $orderCount->execute(['id' => $customerId]);

        return (int) $orderCount->fetchColumn() === 0 ? $pending : null;
    }

    private function customerType(int $customerId): string
    {
        $stmt = $this->pdo->prepare('SELECT customer_type FROM customers WHERE id = :id');
        $stmt->execute(['id' => $customerId]);

        return (string) ($stmt->fetchColumn() ?: 'RETAIL');
    }

    private function generateOrderNumber(): string
    {
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $orderNo = 'ORD' . date('Ymd') . strtoupper(substr(bin2hex(random_bytes(3)), 0, 5));

            $stmt = $this->pdo->prepare('SELECT 1 FROM orders WHERE order_no = :order_no');
            $stmt->execute(['order_no' => $orderNo]);

            if ($stmt->fetchColumn() === false) {
                return $orderNo;
            }
        }

        throw new RuntimeException('Could not generate a unique order number, please retry');
    }

    private function logStatus(int $orderId, ?string $from, string $to, ?int $changedBy, string $source, ?string $note): void
    {
        $this->pdo->prepare(
            'INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, source, note)
             VALUES (:order_id, :from_status, :to_status, :changed_by, :source, :note)'
        )->execute([
            'order_id' => $orderId,
            'from_status' => $from,
            'to_status' => $to,
            'changed_by' => $changedBy,
            'source' => $source,
            'note' => $note,
        ]);
    }
}
