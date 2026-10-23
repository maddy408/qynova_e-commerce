<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Config;
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

    /**
     * Fulfillment pipeline order, used by updateStatus() to reject
     * backward moves and to gate anything past PENDING on payment
     * actually being captured. Mirrors FORWARD_STATUSES in
     * OrderDetailPage.tsx and DELIVERY_TO_ORDER_STATUS's targets in
     * DeliveryService.php.
     */
    private const STATUS_RANK = [
        'PENDING' => 0,
        'CONFIRMED' => 1,
        'PROCESSING' => 2,
        'PACKED' => 3,
        'SHIPPED' => 4,
        'OUT_FOR_DELIVERY' => 5,
        'DELIVERED' => 6,
    ];

    private readonly NotificationDispatcher $notifications;
    private readonly DeliveryCalculationService $deliveryCalc;
    private readonly WhatsAppService $whatsApp;

    public function __construct(
        private readonly PDO $pdo,
        private readonly InventoryService $inventory,
        private readonly CouponService $coupons,
        private readonly InvoiceService $invoices,
        private readonly RefundService $refunds,
        ?NotificationDispatcher $notifications = null,
        ?DeliveryCalculationService $deliveryCalc = null,
        ?WhatsAppService $whatsApp = null,
    ) {
        $this->notifications = $notifications ?? new NotificationDispatcher($pdo);
        $this->deliveryCalc = $deliveryCalc ?? new DeliveryCalculationService($pdo, new PincodeGeocodingService($pdo));
        $this->whatsApp = $whatsApp ?? new WhatsAppService($pdo);
    }

    /**
     * Staff who should hear about new orders / customer-initiated
     * cancellations: the ADMIN role (bypasses permission checks
     * everywhere else in this app, same rule here) plus anyone whose
     * role explicitly holds `orders.manage` — mirrors exactly what
     * PermissionMiddleware::require('orders.manage') itself allows, so
     * "who gets notified" never drifts from "who is allowed to act on
     * it". Inactive/soft-deleted staff are excluded.
     *
     * @return list<int>
     */
    private function orderManagerUserIds(): array
    {
        return $this->pdo->query(
            "SELECT DISTINCT u.id FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL
               AND (
                    r.code = 'ADMIN'
                    OR EXISTS (
                        SELECT 1 FROM role_permissions rp
                        JOIN permissions p ON p.id = rp.permission_id
                        WHERE rp.role_id = r.id AND p.code = 'orders.manage'
                    )
               )"
        )->fetchAll(PDO::FETCH_COLUMN);
    }

    /** Human-readable fulfillment message per status, for the customer-facing notification body. */
    private function statusNotificationCopy(string $status): ?array
    {
        return match ($status) {
            'CONFIRMED' => ['type' => 'ORDER_CONFIRMED', 'title' => 'Order Confirmed', 'body' => 'has been confirmed and is being prepared.'],
            'PROCESSING' => ['type' => 'ORDER_PROCESSING', 'title' => 'Order is being processed', 'body' => 'is now being processed.'],
            'PACKED' => ['type' => 'ORDER_PACKED', 'title' => 'Order packed', 'body' => 'has been packed and will ship soon.'],
            'SHIPPED' => ['type' => 'ORDER_SHIPPED', 'title' => 'Order shipped', 'body' => 'has shipped.'],
            'OUT_FOR_DELIVERY' => ['type' => 'ORDER_OUT_FOR_DELIVERY', 'title' => 'Out for delivery', 'body' => 'is out for delivery.'],
            'DELIVERED' => ['type' => 'ORDER_DELIVERED', 'title' => 'Order delivered', 'body' => 'has been delivered. Thank you for shopping with us!'],
            'OUT_OF_STOCK' => ['type' => 'ORDER_OUT_OF_STOCK', 'title' => 'Item Out of Stock', 'body' => 'contains items that are currently out of stock. Our team will contact you shortly.'],
            'CANCELLED' => ['type' => 'ORDER_CANCELLED', 'title' => 'Order Cancelled', 'body' => 'has been cancelled.'],
            default => null,
        };
    }

    /**
     * @param list<array{variant_id: int, quantity: int}> $items
     * @return array<string, mixed>
     */
    public function preview(int $customerId, array $items, ?string $couponCode, ?string $pincode = null): array
    {
        $customerType = $this->customerType($customerId);
        $lines = $this->priceLines($items, $customerType);

        return $this->computeTotals($customerId, $lines, $couponCode, $pincode);
    }

    /**
     * @param list<array{variant_id: int, quantity: int}> $items
     * @return array<string, mixed>
     */
    public function checkout(int $customerId, array $items, array $address, ?string $couponCode = null, string $paymentMethod = 'COD'): array
    {
        if ($items === []) {
            throw new RuntimeException('Cart is empty');
        }

        $normalizedMethod = strtoupper(trim($paymentMethod));
        if (!in_array($normalizedMethod, ['COD', 'ONLINE', 'RAZORPAY', 'CARD', 'UPI', 'BANK_TRANSFER'], true)) {
            $normalizedMethod = 'COD';
        }

        if (empty($address['line1'])) {
            $address['line1'] = $address['address_line_1'] ?? $address['streetAddress'] ?? '';
        }
        if (empty($address['city_district'])) {
            $address['city_district'] = $address['city'] ?? '';
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

        $totals = $this->computeTotals($customerId, $lines, $couponCode, $address['pincode']);

        if (isset($totals['coupon_error']) && $couponCode !== null) {
            throw new RuntimeException($totals['coupon_error']);
        }

        $this->pdo->beginTransaction();

        try {
            $orderNo = $this->generateOrderNumber();

            $this->pdo->prepare(
                "INSERT INTO orders (
                    order_no, customer_id, status, payment_status, payment_method, subtotal, product_discount_total,
                    coupon_id, coupon_code, coupon_discount_total, referral_reward_id, referral_discount_total,
                    tax_total, shipping_total, grand_total,
                    shipping_name, shipping_phone, shipping_line1, shipping_line2,
                    shipping_city_district, shipping_state, shipping_pincode,
                    delivery_type, delivery_distance_km, delivery_days, delivery_geocode_source, is_first_order_delivery
                ) VALUES (
                    :order_no, :customer_id, 'PENDING', 'PENDING', :payment_method, :subtotal, :product_discount_total,
                    :coupon_id, :coupon_code, :coupon_discount_total, :referral_reward_id, :referral_discount_total,
                    :tax_total, :shipping_total, :grand_total,
                    :shipping_name, :shipping_phone, :shipping_line1, :shipping_line2,
                    :shipping_city_district, :shipping_state, :shipping_pincode,
                    :delivery_type, :delivery_distance_km, :delivery_days, :delivery_geocode_source, :is_first_order_delivery
                )"
            )->execute([
                'order_no' => $orderNo,
                'customer_id' => $customerId,
                'payment_method' => $normalizedMethod,
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
                'delivery_type' => $totals['delivery_type'],
                'delivery_distance_km' => $totals['delivery_distance_km'],
                'delivery_days' => $totals['delivery_days'],
                'delivery_geocode_source' => $totals['delivery_geocode_source'],
                'is_first_order_delivery' => (int) $totals['is_first_order_delivery'],
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

            // Clear cart items and mark active cart as CONVERTED in the same transaction
            $cartStmt = $this->pdo->prepare("SELECT id FROM carts WHERE customer_id = :customer_id AND status = 'ACTIVE'");
            $cartStmt->execute(['customer_id' => $customerId]);
            $activeCartId = $cartStmt->fetchColumn();
            if ($activeCartId) {
                $this->pdo->prepare('DELETE FROM cart_items WHERE cart_id = :cart_id')->execute(['cart_id' => $activeCartId]);
                $this->pdo->prepare("UPDATE carts SET status = 'CONVERTED' WHERE id = :cart_id")->execute(['cart_id' => $activeCartId]);
            }

            $this->logStatus($orderId, null, 'PENDING', null, 'SYSTEM', 'Order created at checkout');

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $newOrder = $this->find($orderId) ?? throw new RuntimeException('Order created but could not be reloaded');

        // Fired AFTER commit(), outside the transaction and outside any
        // try/catch that could roll back the order itself — a push/DB
        // failure here must never undo an order the customer was already
        // told succeeded (see NotificationDispatcher's docblock).
        $this->notifications->notifyMany(
            recipientType: 'USER',
            recipientIds: $this->orderManagerUserIds(),
            type: 'NEW_ORDER',
            title: 'New order received',
            body: "Order #{$orderNo} for ₹{$totals['grand_total']} was just placed.",
            referenceType: 'ORDER',
            referenceId: $orderId,
            data: ['order_id' => $orderId, 'order_no' => $orderNo],
        );

        return $newOrder;
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

        $confirmed = $this->find($orderId) ?? throw new RuntimeException('Order not found after confirmation');

        $this->notifications->notify(
            recipientType: 'CUSTOMER',
            recipientId: (int) $order['customer_id'],
            type: 'ORDER_CONFIRMED',
            title: 'Order confirmed',
            body: "Your order #{$order['order_no']} is confirmed and payment was received.",
            referenceType: 'ORDER',
            referenceId: $orderId,
            data: ['order_id' => $orderId, 'order_no' => $order['order_no']],
        );

        return $confirmed;
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

        $cancelled = $this->find($orderId) ?? throw new RuntimeException('Order not found after cancellation');

        if ($actorUserId === null) {
            // Customer cancelled their own order — tell the people who can act on it.
            $this->notifications->notifyMany(
                recipientType: 'USER',
                recipientIds: $this->orderManagerUserIds(),
                type: 'ORDER_CANCELLED',
                title: 'Order cancelled by customer',
                body: "Order #{$order['order_no']} was cancelled by the customer." . ($wasPaid ? ' A refund has been initiated.' : ''),
                referenceType: 'ORDER',
                referenceId: $orderId,
                data: ['order_id' => $orderId, 'order_no' => $order['order_no']],
            );
        } else {
            // Staff cancelled it on the customer's behalf — tell the customer.
            $this->notifications->notify(
                recipientType: 'CUSTOMER',
                recipientId: (int) $order['customer_id'],
                type: 'ORDER_CANCELLED',
                title: 'Order cancelled',
                body: "Your order #{$order['order_no']} has been cancelled." . ($wasPaid ? ' A refund has been initiated.' : ''),
                referenceType: 'ORDER',
                referenceId: $orderId,
                data: ['order_id' => $orderId, 'order_no' => $order['order_no']],
            );
        }

        return $cancelled;
    }

    public function updateStatus(int $orderId, string $newStatus, ?int $actorUserId, ?string $note): array
    {
        $order = $this->find($orderId);

        if ($order === null) {
            throw new RuntimeException('Order not found');
        }

        $validStatuses = [
            'PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED',
            'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'OUT_OF_STOCK',
            'RETURN_REQUESTED', 'RETURNED', 'REFUNDED'
        ];

        if (!in_array($newStatus, $validStatuses, true)) {
            throw new RuntimeException("Invalid status: {$newStatus}");
        }

        if ($newStatus === 'CANCELLED') {
            $this->pdo->prepare('UPDATE orders SET status = :status, cancelled_at = NOW(), cancellation_reason = :reason WHERE id = :id')
                ->execute(['status' => 'CANCELLED', 'reason' => $note ?: 'Cancelled by store admin', 'id' => $orderId]);
        } elseif ($newStatus === 'OUT_OF_STOCK') {
            $this->pdo->prepare('UPDATE orders SET status = :status, cancellation_reason = :reason WHERE id = :id')
                ->execute(['status' => 'OUT_OF_STOCK', 'reason' => $note ?: 'Items currently out of stock', 'id' => $orderId]);
        } else {
            $this->pdo->prepare('UPDATE orders SET status = :status WHERE id = :id')
                ->execute(['status' => $newStatus, 'id' => $orderId]);
        }

        $this->logStatus($orderId, $order['status'], $newStatus, $actorUserId, 'ADMIN', $note);

        if ($newStatus === 'DELIVERED') {
            $invCheck = $this->pdo->prepare('SELECT id FROM invoices WHERE order_id = :id');
            $invCheck->execute(['id' => $orderId]);
            if (!$invCheck->fetch()) {
                $fullOrder = $this->find($orderId);
                if ($fullOrder) {
                    $this->invoices->createFromOrder($fullOrder);
                }
            }
        }

        $updated = $this->find($orderId) ?? throw new RuntimeException('Order not found after status update');

        $copy = $this->statusNotificationCopy($newStatus);
        if ($copy !== null) {
            $this->notifications->notify(
                recipientType: 'CUSTOMER',
                recipientId: (int) $order['customer_id'],
                type: $copy['type'],
                title: $copy['title'],
                body: "Your order #{$order['order_no']} {$copy['body']}",
                referenceType: 'ORDER',
                referenceId: $orderId,
                data: ['order_id' => $orderId, 'order_no' => $order['order_no'], 'status' => $newStatus],
            );
        }

        return $updated;
    }

    /**
     * Admin saves a post-office tracking ID for a beyond-radius
     * (delivery_type = INDIA_POST) order. Always persists the tracking
     * fields first, then attempts a WhatsApp send or generates WhatsApp Web /
     * click-to-chat links for 1-click manual sending.
     *
     * @return array{order: array<string, mixed>, whatsapp_sent: bool, whatsapp_configured: bool, whatsapp_web_url: string, whatsapp_click_to_chat_url: string, recipient_phone: string}
     */
    public function updateDeliveryTracking(int $orderId, string $trackingId, string $courierName, ?string $status, ?string $customPhone = null): array
    {
        $order = $this->find($orderId);

        if ($order === null) {
            throw new RuntimeException('Order not found');
        }

        $trackingId = trim($trackingId);
        $courierName = trim($courierName) ?: 'India Post';

        if ($trackingId === '') {
            throw new RuntimeException('Tracking ID is required');
        }

        $this->pdo->prepare(
            'UPDATE orders SET delivery_tracking_id = :tracking_id, delivery_tracking_courier = :courier,
                delivery_tracking_status = :status WHERE id = :id'
        )->execute([
            'tracking_id' => $trackingId,
            'courier' => $courierName,
            'status' => $status !== null ? trim($status) : null,
            'id' => $orderId,
        ]);

        $recipientPhone = trim((string) ($customPhone ?: $order['shipping_phone'] ?: $order['customer_phone'] ?: ''));
        $customerName = (string) ($order['shipping_name'] ?: $order['customer_name'] ?: 'Customer');

        $result = $this->whatsApp->sendTrackingUpdate($orderId, $recipientPhone, (string) $order['order_no'], $trackingId, $courierName);

        if ($result['sent']) {
            $this->pdo->prepare('UPDATE orders SET delivery_whatsapp_sent_at = NOW() WHERE id = :id')->execute(['id' => $orderId]);
        }

        $webUrl = $this->whatsApp->webUrl($recipientPhone, (string) $order['order_no'], $trackingId, $courierName, $customerName, $status);
        $clickToChatUrl = $this->whatsApp->clickToChatUrl($recipientPhone, (string) $order['order_no'], $trackingId, $courierName, $customerName, $status);

        return [
            'order' => $this->find($orderId) ?? throw new RuntimeException('Order not found after tracking update'),
            'recipient_phone' => $recipientPhone,
            'whatsapp_sent' => $result['sent'],
            'whatsapp_configured' => $result['configured'],
            'whatsapp_web_url' => $webUrl,
            'whatsapp_click_to_chat_url' => $clickToChatUrl,
        ];
    }

    /**
     * Mark delivery tracking WhatsApp notification as sent (when admin sends via WhatsApp Web).
     */
    public function markDeliveryTrackingWhatsAppSent(int $orderId, ?string $customPhone = null): array
    {
        $order = $this->find($orderId);

        if ($order === null) {
            throw new RuntimeException('Order not found');
        }

        $recipientPhone = trim((string) ($customPhone ?: $order['shipping_phone'] ?: $order['customer_phone'] ?: ''));
        $trackingId = (string) ($order['delivery_tracking_id'] ?? '');
        $courierName = (string) ($order['delivery_tracking_courier'] ?? 'India Post');
        $status = $order['delivery_tracking_status'] ?? null;

        $this->pdo->prepare('UPDATE orders SET delivery_whatsapp_sent_at = NOW() WHERE id = :id')->execute(['id' => $orderId]);

        $this->whatsApp->logManualSent($orderId, $recipientPhone, (string) $order['order_no'], $trackingId, $courierName, $status);

        return [
            'order' => $this->find($orderId) ?? throw new RuntimeException('Order not found'),
            'whatsapp_sent' => true,
        ];
    }

    /**
     * G6: server-side search + pagination. Previously a flat, unfiltered
     * LIMIT 200 with no page/limit params read at all — OrdersPage.tsx
     * had no way to reach anything past the 200 most recent orders, and
     * its status dropdown was the only filter despite `search` already
     * being supported here and simply never wired up.
     *
     * @param array<string, mixed> $filters
     * @return array{items: list<array<string, mixed>>, total: int, page: int, limit: int}
     */
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

        $page = max(1, (int) ($filters['page'] ?? 1));
        $limit = min(200, max(1, (int) ($filters['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;

        $countStmt = $this->pdo->prepare(
            "SELECT COUNT(*) FROM orders o JOIN customers c ON c.id = o.customer_id WHERE {$whereSql}"
        );
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare(
            "SELECT o.id, o.order_no, o.customer_id, c.name AS customer_name, o.status, o.payment_status,
                    o.payment_method, o.grand_total, o.created_at
             FROM orders o JOIN customers c ON c.id = o.customer_id
             WHERE {$whereSql} ORDER BY o.created_at DESC, o.id DESC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue(":{$key}", $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return ['items' => $stmt->fetchAll(), 'total' => $total, 'page' => $page, 'limit' => $limit];
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

        $recipientPhone = trim((string) ($order['shipping_phone'] ?: $order['customer_phone'] ?: ''));
        $order['recipient_phone'] = $recipientPhone;

        $trackingId = trim((string) ($order['delivery_tracking_id'] ?? ''));
        if ($trackingId !== '') {
            $customerName = (string) ($order['shipping_name'] ?: $order['customer_name'] ?: 'Customer');
            $courierName = (string) ($order['delivery_tracking_courier'] ?: 'India Post');
            $status = $order['delivery_tracking_status'] ?? null;
            $order['whatsapp_web_url'] = $this->whatsApp->webUrl($recipientPhone, (string) $order['order_no'], $trackingId, $courierName, $customerName, $status);
            $order['whatsapp_click_to_chat_url'] = $this->whatsApp->clickToChatUrl($recipientPhone, (string) $order['order_no'], $trackingId, $courierName, $customerName, $status);
        } else {
            $order['whatsapp_web_url'] = null;
            $order['whatsapp_click_to_chat_url'] = null;
        }

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
                        p.brand_id, COALESCE(v.weight_grams, p.weight_grams) AS weight_grams
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
                'tax_mode' => $variant['tax_mode'] ?? 'EXCLUSIVE',
                'line_total' => ($variant['tax_mode'] ?? 'EXCLUSIVE') === 'EXCLUSIVE' ? bcadd($lineSubtotal, $taxAmount, 2) : $lineSubtotal,
                'is_active' => (bool) $variant['is_active'],
                'is_ecommerce_enabled' => (bool) $variant['is_ecommerce_enabled'],
                'available' => (string) ($variant['available'] ?? '0'),
                'weight_grams' => $variant['weight_grams'] !== null ? (float) $variant['weight_grams'] : 0.0,
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
    private function computeTotals(int $customerId, array $lines, ?string $couponCode, ?string $pincode = null): array
    {
        $subtotal = array_reduce($lines, fn (string $c, array $l) => bcadd($c, $l['line_subtotal'], 2), '0.00');
        $productDiscountTotal = array_reduce($lines, fn (string $c, array $l) => bcadd($c, $l['product_discount_amount'], 2), '0.00');
        $taxTotal = array_reduce($lines, fn (string $c, array $l) => bcadd($c, $l['tax_amount'], 2), '0.00');

        // Delivery Management (distance/weight-based) replaces the flat
        // delivery_settings rate whenever a pincode is available and the
        // shop's own lat/lng are configured — falls back to the old flat
        // calc otherwise (unconfigured SHOP_LAT/LNG, no pincode yet at
        // preview time, or an unresolvable pincode) so checkout never
        // breaks over a delivery-estimation failure.
        $deliveryQuote = null;
        if ($pincode !== null && trim($pincode) !== '' && Config::get('shop.lat') !== null && Config::get('shop.lng') !== null) {
            try {
                $deliveryItems = array_map(fn (array $l) => [
                    'weight_kg' => $l['weight_grams'] / 1000,
                    'qty' => $l['quantity'],
                ], $lines);
                $deliveryQuote = $this->deliveryCalc->quoteForOrder($pincode, $customerId, $deliveryItems);
            } catch (RuntimeException) {
                $deliveryQuote = null; // invalid pincode format etc. — fall back to flat shipping below
            }
        }

        if ($deliveryQuote !== null) {
            $shippingTotal = number_format($deliveryQuote['delivery_charge'], 2, '.', '');
        } else {
            $delSettings = $this->pdo->query("SELECT * FROM delivery_settings WHERE is_active = 1 ORDER BY id ASC LIMIT 1")->fetch();
            $flatShipping = $delSettings ? (string) ($delSettings['delivery_charge'] ?? self::FLAT_SHIPPING) : self::FLAT_SHIPPING;
            $freeShippingAbove = $delSettings ? (string) ($delSettings['free_delivery_threshold'] ?? self::FREE_SHIPPING_ABOVE) : self::FREE_SHIPPING_ABOVE;

            $shippingTotal = bccomp($subtotal, $freeShippingAbove, 2) >= 0 ? '0.00' : $flatShipping;
        }

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

        $exclusiveTaxTotal = array_reduce($lines, function (string $c, array $l) {
            return ($l['tax_mode'] ?? 'EXCLUSIVE') === 'EXCLUSIVE' ? bcadd($c, $l['tax_amount'], 2) : $c;
        }, '0.00');

        $grandTotal = bcadd(bcadd(bcsub($subtotal, $totalDiscount, 2), $exclusiveTaxTotal, 2), $shippingTotal, 2);

        return [
            'lines' => $allocatedLines,
            'subtotal' => $subtotal,
            'product_discount_total' => $productDiscountTotal,
            'coupon_id' => $couponId,
            'coupon_discount' => $couponDiscount,
            'coupon_error' => $couponError,
            'referral_reward_id' => $referralRewardId,
            'referral_discount' => $referralDiscount,
            'tax_total' => $exclusiveTaxTotal,
            'shipping_total' => $shippingTotal,
            'grand_total' => $grandTotal,
            'delivery_type' => $deliveryQuote['delivery_type'] ?? null,
            'delivery_distance_km' => $deliveryQuote['distance_km'] ?? null,
            'delivery_days' => $deliveryQuote['delivery_days'] ?? null,
            'delivery_geocode_source' => $deliveryQuote['geocode_source'] ?? null,
            'is_first_order_delivery' => $deliveryQuote['is_first_order'] ?? false,
            'delivery_breakdown' => $deliveryQuote['breakdown'] ?? null,
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
