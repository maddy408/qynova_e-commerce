<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Production-ready delivery management service.
 * Supports Own Delivery fleet & Courier partner tracking,
 * COD collection & reconciliation, package details,
 * state machine validation, and order synchronization.
 */
final class DeliveryService
{
    /** @var array<string, string|null> */
    public const DELIVERY_TO_ORDER_STATUS = [
        'PENDING' => null,
        'ASSIGNED' => 'PACKED',
        'PICKED_UP' => 'SHIPPED',
        'IN_TRANSIT' => 'SHIPPED',
        'OUT_FOR_DELIVERY' => 'OUT_FOR_DELIVERY',
        'DELIVERED' => 'DELIVERED',
        'FAILED' => null,
        'RETURN_INITIATED' => null,
        'RETURNED' => 'RETURNED',
    ];

    /** @var array<string, list<string>> */
    private const ALLOWED_TRANSITIONS = [
        'PENDING' => ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'FAILED'],
        'ASSIGNED' => ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED'],
        'PICKED_UP' => ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED'],
        'IN_TRANSIT' => ['OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'],
        'OUT_FOR_DELIVERY' => ['DELIVERED', 'FAILED'],
        'FAILED' => ['ASSIGNED', 'OUT_FOR_DELIVERY', 'RETURN_INITIATED'],
        'RETURN_INITIATED' => ['RETURNED'],
        'DELIVERED' => ['RETURN_INITIATED'],
        'RETURNED' => [],
    ];

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Compute data-driven delivery metrics for dashboard cards.
     * Calculated authoritative metrics from DB using local business timezone.
     *
     * @return array{
     *   ready_to_dispatch: array{count: int, amount: float},
     *   in_transit: array{count: int, amount: float},
     *   delivered_today: array{count: int, amount: float},
     *   cod_pending: array{count: int, amount: float}
     * }
     */
    public function summary(): array
    {
        // Ready to dispatch: PENDING or ASSIGNED
        $readyStmt = $this->pdo->query(
            "SELECT COUNT(d.id) AS count, COALESCE(SUM(o.grand_total), 0) AS amount
             FROM deliveries d
             JOIN orders o ON o.id = d.order_id
             WHERE d.status IN ('PENDING', 'ASSIGNED')"
        );
        $ready = $readyStmt->fetch() ?: ['count' => 0, 'amount' => 0];

        // In transit: PICKED_UP, IN_TRANSIT, or OUT_FOR_DELIVERY
        $transitStmt = $this->pdo->query(
            "SELECT COUNT(d.id) AS count, COALESCE(SUM(o.grand_total), 0) AS amount
             FROM deliveries d
             JOIN orders o ON o.id = d.order_id
             WHERE d.status IN ('PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY')"
        );
        $transit = $transitStmt->fetch() ?: ['count' => 0, 'amount' => 0];

        // Delivered today: DELIVERED status updated or delivered_at on current date (Asia/Kolkata)
        $deliveredStmt = $this->pdo->query(
            "SELECT COUNT(d.id) AS count, COALESCE(SUM(o.grand_total), 0) AS amount
             FROM deliveries d
             JOIN orders o ON o.id = d.order_id
             WHERE d.status = 'DELIVERED'
               AND DATE(COALESCE(d.delivered_at, d.updated_at)) = CURRENT_DATE()"
        );
        $delivered = $deliveredStmt->fetch() ?: ['count' => 0, 'amount' => 0];

        // COD pending: deliveries where cod_status is PENDING or order payment_status is PENDING
        $codStmt = $this->pdo->query(
            "SELECT COUNT(d.id) AS count, COALESCE(SUM(IF(d.cod_amount > 0, d.cod_amount, o.grand_total)), 0) AS amount
             FROM deliveries d
             JOIN orders o ON o.id = d.order_id
             WHERE (d.cod_status = 'PENDING' OR (o.payment_status = 'PENDING' AND d.cod_status != 'COLLECTED'))
               AND d.status NOT IN ('CANCELLED', 'RETURNED')"
        );
        $cod = $codStmt->fetch() ?: ['count' => 0, 'amount' => 0];

        return [
            'ready_to_dispatch' => [
                'count' => (int) $ready['count'],
                'amount' => (float) $ready['amount'],
            ],
            'in_transit' => [
                'count' => (int) $transit['count'],
                'amount' => (float) $transit['amount'],
            ],
            'delivered_today' => [
                'count' => (int) $delivered['count'],
                'amount' => (float) $delivered['amount'],
            ],
            'cod_pending' => [
                'count' => (int) $cod['count'],
                'amount' => (float) $cod['amount'],
            ],
        ];
    }

    /**
     * Retrieve eligible orders that do not yet have a delivery.
     *
     * @return list<array<string, mixed>>
     */
    public function getEligibleOrders(?string $search = null): array
    {
        $where = [
            'NOT EXISTS (SELECT 1 FROM deliveries d WHERE d.order_id = o.id)',
            "o.status NOT IN ('CANCELLED', 'RETURN_REQUESTED', 'RETURNED', 'REFUNDED')",
        ];
        $params = [];

        if ($search !== null && trim($search) !== '') {
            $where[] = '(o.order_no LIKE :s1 OR o.shipping_name LIKE :s2 OR o.shipping_phone LIKE :s3)';
            $needle = '%' . trim($search) . '%';
            $params['s1'] = $needle;
            $params['s2'] = $needle;
            $params['s3'] = $needle;
        }

        $whereSql = implode(' AND ', $where);

        $stmt = $this->pdo->prepare(
            "SELECT o.id, o.order_no, o.status, o.payment_status, o.grand_total, o.placed_at,
                    o.shipping_name, o.shipping_phone, o.shipping_line1, o.shipping_line2,
                    o.shipping_city_district, o.shipping_state, o.shipping_pincode,
                    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count,
                    (SELECT oi.product_name_snapshot FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.id ASC LIMIT 1) AS first_item_name
             FROM orders o
             WHERE {$whereSql}
             ORDER BY o.placed_at DESC, o.id DESC
             LIMIT 50"
        );
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    /**
     * List active staff/drivers available for delivery assignment.
     *
     * @return list<array<string, mixed>>
     */
    public function getDrivers(): array
    {
        $stmt = $this->pdo->query(
            "SELECT u.id, u.name, u.email, r.code AS role_code, r.name AS role_name
             FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL
             ORDER BY (r.code = 'DRIVER') DESC, u.name ASC"
        );

        return $stmt->fetchAll();
    }

    /**
     * Create a delivery record for an eligible order.
     * Accepts either legacy ($orderId, $courier, $eta) or array-based data payload.
     *
     * @param string|array<string, mixed>|null $courierOrData
     */
    public function createForOrder(int $orderId, string|array|null $courierOrData = null, ?string $expectedDeliveryDate = null): int
    {
        $data = is_array($courierOrData) ? $courierOrData : [
            'courier' => $courierOrData,
            'expected_delivery_date' => $expectedDeliveryDate,
        ];

        $orderStmt = $this->pdo->prepare('SELECT id, order_no, status, payment_status, grand_total FROM orders WHERE id = :id');
        $orderStmt->execute(['id' => $orderId]);
        $order = $orderStmt->fetch();

        if ($order === false) {
            throw new RuntimeException('Order not found');
        }

        if (in_array($order['status'], ['CANCELLED', 'RETURNED', 'REFUNDED'], true)) {
            throw new RuntimeException('Cannot create delivery for cancelled or refunded order');
        }

        $existing = $this->pdo->prepare('SELECT 1 FROM deliveries WHERE order_id = :id');
        $existing->execute(['id' => $orderId]);

        if ($existing->fetchColumn() !== false) {
            throw new RuntimeException('This order already has a delivery');
        }

        // Count package items
        $itemsStmt = $this->pdo->prepare('SELECT COALESCE(SUM(quantity), 1) FROM order_items WHERE order_id = :id');
        $itemsStmt->execute(['id' => $orderId]);
        $itemsCount = (int) ($itemsStmt->fetchColumn() ?: 1);

        $deliveryChannel = ($data['delivery_channel'] ?? '') === 'OWN_DELIVERY' ? 'OWN_DELIVERY' : 'COURIER';
        $courier = !empty($data['courier_partner']) ? (string) $data['courier_partner'] : ($data['courier'] ?? null);
        $courierPartner = !empty($data['courier_partner']) ? (string) $data['courier_partner'] : ($courier ?? null);

        $driverId = !empty($data['driver_id']) ? (int) $data['driver_id'] : null;
        $driverName = !empty($data['driver_name']) ? trim((string) $data['driver_name']) : null;
        $driverPhone = !empty($data['driver_phone']) ? trim((string) $data['driver_phone']) : null;
        $vehicleNo = !empty($data['vehicle_no']) ? trim((string) $data['vehicle_no']) : null;

        // Auto-fetch driver name/phone if driver_id is provided
        if ($driverId !== null && ($driverName === null || $driverName === '')) {
            $userStmt = $this->pdo->prepare('SELECT name, email FROM users WHERE id = :id');
            $userStmt->execute(['id' => $driverId]);
            $u = $userStmt->fetch();
            if ($u) {
                $driverName = $u['name'];
            }
        }

        $awb = !empty($data['awb']) ? trim((string) $data['awb']) : ('AWB' . strtoupper(bin2hex(random_bytes(5))));
        $trackingUrl = !empty($data['tracking_url']) ? trim((string) $data['tracking_url']) : ('https://track.example.test/' . $awb);
        $eta = $data['expected_delivery_date'] ?? null;
        $notes = $data['delivery_notes'] ?? null;
        $weight = isset($data['package_weight_kg']) ? (float) $data['package_weight_kg'] : 0.50;
        $dimensions = $data['package_dimensions'] ?? null;

        // COD calculation
        $isPaid = ($order['payment_status'] === 'PAID');
        $codAmount = $isPaid ? 0.00 : (float) $order['grand_total'];
        $codStatus = $isPaid ? 'NOT_APPLICABLE' : 'PENDING';

        $initialStatus = $data['status'] ?? 'PENDING';

        $this->pdo->beginTransaction();

        try {
            $stmt = $this->pdo->prepare(
                "INSERT INTO deliveries (
                    order_id, provider, delivery_channel, courier, courier_partner,
                    driver_id, driver_name, driver_phone, vehicle_no,
                    awb, tracking_url, status, expected_delivery_date, delivery_notes,
                    package_weight_kg, package_dimensions, package_items_count,
                    cod_amount, cod_collected_amount, cod_status
                ) VALUES (
                    :order_id, 'MOCK', :channel, :courier, :courier_partner,
                    :driver_id, :driver_name, :driver_phone, :vehicle_no,
                    :awb, :tracking_url, :status, :eta, :notes,
                    :weight, :dimensions, :items_count,
                    :cod_amount, 0.00, :cod_status
                )"
            );
            $stmt->execute([
                'order_id' => $orderId,
                'channel' => $deliveryChannel,
                'courier' => $courier,
                'courier_partner' => $courierPartner,
                'driver_id' => $driverId,
                'driver_name' => $driverName,
                'driver_phone' => $driverPhone,
                'vehicle_no' => $vehicleNo,
                'awb' => $awb,
                'tracking_url' => $trackingUrl,
                'status' => $initialStatus,
                'eta' => $eta,
                'notes' => $notes,
                'weight' => $weight,
                'dimensions' => $dimensions,
                'items_count' => $itemsCount,
                'cod_amount' => $codAmount,
                'cod_status' => $codStatus,
            ]);

            $deliveryId = (int) $this->pdo->lastInsertId();

            $initNote = ($initialStatus === 'ASSIGNED')
                ? ($deliveryChannel === 'OWN_DELIVERY' ? "Shipment assigned to driver: {$driverName}" : "Shipment assigned to courier: {$courier}")
                : 'Shipment created, ready to dispatch';

            $this->pdo->prepare(
                'INSERT INTO delivery_status_history (delivery_id, from_status, to_status, source, note)
                 VALUES (:id, NULL, :status, :source, :note)'
            )->execute([
                'id' => $deliveryId,
                'status' => $initialStatus,
                'source' => 'SYSTEM',
                'note' => $initNote,
            ]);

            // Sync order status if initial status is ASSIGNED -> PACKED
            if ($initialStatus === 'ASSIGNED' && in_array($order['status'], ['PENDING', 'CONFIRMED', 'PROCESSING'], true)) {
                $this->pdo->prepare("UPDATE orders SET status = 'PACKED' WHERE id = :id")->execute(['id' => $orderId]);
                $this->pdo->prepare(
                    "INSERT INTO order_status_history (order_id, from_status, to_status, source, note)
                     VALUES (:order_id, :from_status, 'PACKED', 'SYSTEM', 'Synced from delivery creation: ASSIGNED')"
                )->execute([
                    'order_id' => $orderId,
                    'from_status' => $order['status'],
                ]);
            }

            $this->pdo->commit();

            return $deliveryId;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Update delivery status adhering to state machine transitions.
     *
     * @return array<string, mixed>
     */
    public function updateStatus(
        int $deliveryId,
        string $newStatus,
        string $source,
        ?string $note,
        ?int $actorUserId,
        ?string $failureReason = null,
        ?string $location = null,
    ): array {
        $delivery = $this->find($deliveryId);

        if ($delivery === null) {
            throw new RuntimeException('Delivery not found');
        }

        if (!array_key_exists($newStatus, self::DELIVERY_TO_ORDER_STATUS)) {
            throw new RuntimeException("Invalid delivery status: {$newStatus}");
        }

        if ($delivery['status'] === $newStatus) {
            throw new RuntimeException("Delivery is already {$newStatus}");
        }

        $currentStatus = $delivery['status'];
        $allowed = self::ALLOWED_TRANSITIONS[$currentStatus] ?? [];

        if (!in_array($newStatus, $allowed, true)) {
            throw new RuntimeException("Cannot transition delivery from {$currentStatus} to {$newStatus}");
        }

        if ($newStatus === 'FAILED' && empty($failureReason) && empty($note)) {
            throw new RuntimeException('A failure reason or note is required for failed deliveries');
        }

        $this->pdo->beginTransaction();

        try {
            $now = date('Y-m-d H:i:s');
            $updates = ['status = :status'];
            $params = ['status' => $newStatus, 'id' => $deliveryId];

            if (in_array($newStatus, ['PICKED_UP', 'IN_TRANSIT'], true) && empty($delivery['dispatched_at'])) {
                $updates[] = 'dispatched_at = :dispatched_at';
                $params['dispatched_at'] = $now;
            }

            if ($newStatus === 'DELIVERED') {
                $updates[] = 'delivered_at = :delivered_at';
                $params['delivered_at'] = $now;
            }

            if ($newStatus === 'FAILED') {
                $updates[] = 'failure_reason = :failure_reason';
                $params['failure_reason'] = $failureReason ?: $note;
            }

            if ($newStatus === 'RETURN_INITIATED') {
                $updates[] = 'return_initiated_at = :return_initiated_at';
                $params['return_initiated_at'] = $now;
            }

            if ($newStatus === 'RETURNED') {
                $updates[] = 'returned_at = :returned_at';
                $params['returned_at'] = $now;
            }

            $updateSql = implode(', ', $updates);
            $this->pdo->prepare("UPDATE deliveries SET {$updateSql} WHERE id = :id")->execute($params);

            $this->pdo->prepare(
                'INSERT INTO delivery_status_history (delivery_id, from_status, to_status, source, note, actor_user_id, location)
                 VALUES (:id, :from_status, :to_status, :source, :note, :actor_id, :location)'
            )->execute([
                'id' => $deliveryId,
                'from_status' => $currentStatus,
                'to_status' => $newStatus,
                'source' => $source,
                'note' => $note ?: ($newStatus === 'FAILED' ? $failureReason : null),
                'actor_id' => $actorUserId,
                'location' => $location,
            ]);

            // Sync order status
            $mappedOrderStatus = self::DELIVERY_TO_ORDER_STATUS[$newStatus];

            if ($mappedOrderStatus !== null) {
                $orderStmt = $this->pdo->prepare('SELECT status, payment_status FROM orders WHERE id = :id');
                $orderStmt->execute(['id' => $delivery['order_id']]);
                $orderRow = $orderStmt->fetch();
                $currentOrderStatus = $orderRow ? $orderRow['status'] : null;

                if ($currentOrderStatus !== null && $currentOrderStatus !== $mappedOrderStatus && !in_array($currentOrderStatus, ['CANCELLED'], true)) {
                    $this->pdo->prepare('UPDATE orders SET status = :status WHERE id = :id')
                        ->execute(['status' => $mappedOrderStatus, 'id' => $delivery['order_id']]);

                    $this->pdo->prepare(
                        'INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, source, note)
                         VALUES (:order_id, :from_status, :to_status, :changed_by, :source, :note)'
                    )->execute([
                        'order_id' => $delivery['order_id'],
                        'from_status' => $currentOrderStatus,
                        'to_status' => $mappedOrderStatus,
                        'changed_by' => $actorUserId,
                        'source' => $source === 'ADMIN' ? 'ADMIN' : 'SHIPPING_WEBHOOK',
                        'note' => "Synced from delivery status: {$newStatus}",
                    ]);
                }

                // If marked DELIVERED and prepaid, ensure invoice exists
                if ($mappedOrderStatus === 'DELIVERED') {
                    $invCheck = $this->pdo->prepare('SELECT id FROM invoices WHERE order_id = :id');
                    $invCheck->execute(['id' => $delivery['order_id']]);
                    if (!$invCheck->fetch()) {
                        $inventory = new InventoryService($this->pdo);
                        $coupons = new CouponService($this->pdo);
                        $refunds = new RefundService($this->pdo);
                        $invoiceSvc = new InvoiceService($this->pdo, $inventory, $coupons, $refunds);
                        $orderSvc = new OrderService($this->pdo, $inventory, $coupons, $invoiceSvc, $refunds);
                        $fullOrder = $orderSvc->find($delivery['order_id']);
                        if ($fullOrder) {
                            $invoiceSvc->createFromOrder($fullOrder);
                        }
                    }
                }
            }

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return $this->find($deliveryId) ?? throw new RuntimeException('Delivery not found after update');
    }

    /**
     * Update driver / fleet assignment or courier details for a delivery.
     *
     * @param array<string, mixed> $data
     * @return array<string, mixed>
     */
    public function updateAssignment(int $deliveryId, array $data, ?int $actorUserId): array
    {
        $delivery = $this->find($deliveryId);
        if ($delivery === null) {
            throw new RuntimeException('Delivery not found');
        }

        $channel = ($data['delivery_channel'] ?? $delivery['delivery_channel']) === 'OWN_DELIVERY' ? 'OWN_DELIVERY' : 'COURIER';
        $driverId = isset($data['driver_id']) ? (!empty($data['driver_id']) ? (int) $data['driver_id'] : null) : $delivery['driver_id'];
        $driverName = isset($data['driver_name']) ? trim((string) $data['driver_name']) : $delivery['driver_name'];
        $driverPhone = isset($data['driver_phone']) ? trim((string) $data['driver_phone']) : $delivery['driver_phone'];
        $vehicleNo = isset($data['vehicle_no']) ? trim((string) $data['vehicle_no']) : $delivery['vehicle_no'];

        if ($driverId !== null && empty($driverName)) {
            $uStmt = $this->pdo->prepare('SELECT name FROM users WHERE id = :id');
            $uStmt->execute(['id' => $driverId]);
            $u = $uStmt->fetch();
            if ($u) {
                $driverName = $u['name'];
            }
        }

        $courierPartner = isset($data['courier_partner']) ? trim((string) $data['courier_partner']) : ($data['courier'] ?? $delivery['courier_partner']);
        $courier = $courierPartner ?: $delivery['courier'];
        $awb = isset($data['awb']) && trim((string) $data['awb']) !== '' ? trim((string) $data['awb']) : $delivery['awb'];
        $trackingUrl = isset($data['tracking_url']) && trim((string) $data['tracking_url']) !== '' ? trim((string) $data['tracking_url']) : $delivery['tracking_url'];
        $eta = isset($data['expected_delivery_date']) ? $data['expected_delivery_date'] : $delivery['expected_delivery_date'];
        $notes = isset($data['delivery_notes']) ? $data['delivery_notes'] : $delivery['delivery_notes'];

        $newStatus = $delivery['status'];
        if ($delivery['status'] === 'PENDING') {
            $newStatus = 'ASSIGNED';
        }

        $this->pdo->beginTransaction();

        try {
            $this->pdo->prepare(
                'UPDATE deliveries SET
                    delivery_channel = :channel,
                    driver_id = :driver_id,
                    driver_name = :driver_name,
                    driver_phone = :driver_phone,
                    vehicle_no = :vehicle_no,
                    courier = :courier,
                    courier_partner = :courier_partner,
                    awb = :awb,
                    tracking_url = :tracking_url,
                    expected_delivery_date = :eta,
                    delivery_notes = :notes,
                    status = :status
                 WHERE id = :id'
            )->execute([
                'channel' => $channel,
                'driver_id' => $driverId,
                'driver_name' => $driverName,
                'driver_phone' => $driverPhone,
                'vehicle_no' => $vehicleNo,
                'courier' => $courier,
                'courier_partner' => $courierPartner,
                'awb' => $awb,
                'tracking_url' => $trackingUrl,
                'eta' => $eta,
                'notes' => $notes,
                'status' => $newStatus,
                'id' => $deliveryId,
            ]);

            $assignNote = ($channel === 'OWN_DELIVERY')
                ? "Fleet reassigned to driver: {$driverName} (Vehicle: {$vehicleNo})"
                : "Courier reassigned to: {$courierPartner} (AWB: {$awb})";

            $this->pdo->prepare(
                'INSERT INTO delivery_status_history (delivery_id, from_status, to_status, source, note, actor_user_id)
                 VALUES (:id, :from_status, :to_status, :source, :note, :actor_id)'
            )->execute([
                'id' => $deliveryId,
                'from_status' => $delivery['status'],
                'to_status' => $newStatus,
                'source' => 'ADMIN',
                'note' => $assignNote,
                'actor_id' => $actorUserId,
            ]);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return $this->find($deliveryId) ?? throw new RuntimeException('Delivery not found after assignment update');
    }

    /**
     * Record Cash On Delivery collection.
     * Reconciles COD, records finance transaction, and marks order as PAID.
     *
     * @return array<string, mixed>
     */
    public function collectCod(int $deliveryId, float $amount, ?int $actorUserId, ?string $notes = null): array
    {
        $delivery = $this->find($deliveryId);
        if ($delivery === null) {
            throw new RuntimeException('Delivery not found');
        }

        if ($delivery['cod_status'] === 'COLLECTED' || $delivery['cod_status'] === 'RECONCILED') {
            throw new RuntimeException('COD is already collected for this delivery');
        }

        if ($amount <= 0) {
            throw new RuntimeException('Collected COD amount must be greater than zero');
        }

        $this->pdo->beginTransaction();

        try {
            $now = date('Y-m-d H:i:s');
            $this->pdo->prepare(
                "UPDATE deliveries SET
                    cod_collected_amount = :amount,
                    cod_status = 'COLLECTED',
                    cod_collected_at = :now,
                    cod_collected_by = :actor_id
                 WHERE id = :id"
            )->execute([
                'amount' => $amount,
                'now' => $now,
                'actor_id' => $actorUserId,
                'id' => $deliveryId,
            ]);

            // Update order payment status
            $this->pdo->prepare("UPDATE orders SET payment_status = 'PAID' WHERE id = :id")
                ->execute(['id' => $delivery['order_id']]);

            // Record persistent finance transaction for reconciliation
            $txNo = 'TX-COD-' . $deliveryId . '-' . strtoupper(bin2hex(random_bytes(3)));
            $this->pdo->prepare(
                "INSERT INTO finance_transactions (
                    transaction_no, type, category, amount, payment_method, reference_no, transaction_date, notes, created_by
                ) VALUES (
                    :tx_no, 'INCOME', 'COD_COLLECTION', :amount, 'CASH', :ref_no, CURRENT_DATE(), :notes, :created_by
                )"
            )->execute([
                'tx_no' => $txNo,
                'amount' => $amount,
                'ref_no' => $delivery['order_no'],
                'notes' => $notes ?: "COD collected for Order {$delivery['order_no']} (AWB: {$delivery['awb']})",
                'created_by' => $actorUserId,
            ]);

            // Log event in delivery status history
            $this->pdo->prepare(
                'INSERT INTO delivery_status_history (delivery_id, from_status, to_status, source, note, actor_user_id)
                 VALUES (:id, :from_status, :to_status, :source, :note, :actor_id)'
            )->execute([
                'id' => $deliveryId,
                'from_status' => $delivery['status'],
                'to_status' => $delivery['status'],
                'source' => 'ADMIN',
                'note' => "COD Collected: ₹" . number_format($amount, 2) . ($notes ? " ({$notes})" : ''),
                'actor_id' => $actorUserId,
            ]);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return $this->find($deliveryId) ?? throw new RuntimeException('Delivery not found after COD collection');
    }

    /** Mock webhook entry point. */
    public function updateByAwb(string $awb, string $newStatus, ?string $note): array
    {
        $stmt = $this->pdo->prepare('SELECT id FROM deliveries WHERE awb = :awb');
        $stmt->execute(['awb' => $awb]);
        $deliveryId = $stmt->fetchColumn();

        if ($deliveryId === false) {
            throw new RuntimeException('No delivery found for this AWB');
        }

        return $this->updateStatus((int) $deliveryId, $newStatus, 'SHIPPING_WEBHOOK', $note, null);
    }

    /**
     * List deliveries with advanced server-side filters, search, tabs, and pagination.
     *
     * @param array<string, mixed> $filters
     * @return array{items: list<array<string, mixed>>, total: int, page: int, limit: int, tab_counts: array<string, int>}
     */
    public function list(array $filters): array
    {
        $where = [];
        $params = [];

        // Tab filtering
        $tab = strtolower((string) ($filters['tab'] ?? 'all'));
        if ($tab === 'own_delivery') {
            $where[] = "d.delivery_channel = 'OWN_DELIVERY'";
        } elseif ($tab === 'courier') {
            $where[] = "d.delivery_channel = 'COURIER'";
        } elseif ($tab === 'failed_returns') {
            $where[] = "(d.status IN ('FAILED', 'RETURNED') OR d.return_initiated_at IS NOT NULL)";
        }

        // Channel filter
        if (!empty($filters['delivery_channel'])) {
            $where[] = 'd.delivery_channel = :channel';
            $params['channel'] = $filters['delivery_channel'];
        }

        // Status filter
        if (!empty($filters['status'])) {
            $where[] = 'd.status = :status';
            $params['status'] = $filters['status'];
        }

        // Courier partner filter
        if (!empty($filters['courier_partner'])) {
            $where[] = '(d.courier = :cp OR d.courier_partner = :cp2)';
            $params['cp'] = $filters['courier_partner'];
            $params['cp2'] = $filters['courier_partner'];
        }

        // Driver filter
        if (!empty($filters['driver_id'])) {
            $where[] = 'd.driver_id = :driver_id';
            $params['driver_id'] = (int) $filters['driver_id'];
        }

        // Delivery area filter (city, state, pincode)
        if (!empty($filters['delivery_area'])) {
            $where[] = '(o.shipping_city_district LIKE :area1 OR o.shipping_state LIKE :area2 OR o.shipping_pincode LIKE :area3)';
            $area = '%' . trim((string) $filters['delivery_area']) . '%';
            $params['area1'] = $area;
            $params['area2'] = $area;
            $params['area3'] = $area;
        }

        // Payment status filter
        if (!empty($filters['payment_status'])) {
            $where[] = '(o.payment_status = :pstat OR d.cod_status = :pstat2)';
            $params['pstat'] = $filters['payment_status'];
            $params['pstat2'] = $filters['payment_status'];
        }

        // Date range filter
        if (!empty($filters['date_from'])) {
            $where[] = 'd.created_at >= :date_from';
            $params['date_from'] = $filters['date_from'] . ' 00:00:00';
        }
        if (!empty($filters['date_to'])) {
            $where[] = 'd.created_at <= :date_to';
            $params['date_to'] = $filters['date_to'] . ' 23:59:59';
        }

        // Search filter
        if (!empty($filters['search'])) {
            $where[] = '(o.order_no LIKE :s1 OR o.shipping_name LIKE :s2 OR o.shipping_phone LIKE :s3 OR d.awb LIKE :s4 OR d.courier LIKE :s5 OR d.driver_name LIKE :s6)';
            $needle = '%' . trim((string) $filters['search']) . '%';
            $params['s1'] = $needle;
            $params['s2'] = $needle;
            $params['s3'] = $needle;
            $params['s4'] = $needle;
            $params['s5'] = $needle;
            $params['s6'] = $needle;
        }

        $whereSql = $where === [] ? '1=1' : implode(' AND ', $where);

        $page = max(1, (int) ($filters['page'] ?? 1));
        $limit = min(200, max(1, (int) ($filters['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;

        $countStmt = $this->pdo->prepare(
            "SELECT COUNT(*) FROM deliveries d JOIN orders o ON o.id = d.order_id WHERE {$whereSql}"
        );
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare(
            "SELECT d.*,
                    o.order_no, o.status AS order_status, o.payment_status, o.grand_total, o.placed_at,
                    o.shipping_name AS customer_name, o.shipping_phone AS customer_phone,
                    o.shipping_line1, o.shipping_line2, o.shipping_city_district, o.shipping_state, o.shipping_pincode,
                    (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count,
                    (SELECT oi.product_name_snapshot FROM order_items oi WHERE oi.order_id = o.id ORDER BY oi.id ASC LIMIT 1) AS first_item_name,
                    (SELECT COALESCE(vi.thumb_path, vi.image_path, pi.thumb_path, pi.image_path)
                     FROM order_items oi
                     LEFT JOIN variant_images vi ON vi.variant_id = oi.variant_id AND vi.is_primary = 1
                     LEFT JOIN product_images pi ON pi.product_id = oi.product_id AND pi.is_primary = 1
                     WHERE oi.order_id = o.id ORDER BY oi.id ASC LIMIT 1) AS first_item_image
             FROM deliveries d
             JOIN orders o ON o.id = d.order_id
             WHERE {$whereSql}
             ORDER BY d.created_at DESC, d.id DESC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue(":{$key}", $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $items = $stmt->fetchAll();

        // Calculate dynamic counts for tabs
        $tabCounts = [
            'all' => (int) $this->pdo->query('SELECT COUNT(*) FROM deliveries')->fetchColumn(),
            'own_delivery' => (int) $this->pdo->query("SELECT COUNT(*) FROM deliveries WHERE delivery_channel = 'OWN_DELIVERY'")->fetchColumn(),
            'courier' => (int) $this->pdo->query("SELECT COUNT(*) FROM deliveries WHERE delivery_channel = 'COURIER'")->fetchColumn(),
            'failed_returns' => (int) $this->pdo->query("SELECT COUNT(*) FROM deliveries WHERE status IN ('FAILED', 'RETURNED') OR return_initiated_at IS NOT NULL")->fetchColumn(),
        ];

        return [
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'tab_counts' => $tabCounts,
        ];
    }

    /**
     * Retrieve full delivery details including ordered items, images, and chronological tracking events.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $deliveryId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT d.*,
                    o.order_no, o.status AS order_status, o.payment_status, o.grand_total, o.subtotal,
                    o.product_discount_total, o.coupon_discount_total, o.coupon_code,
                    o.referral_discount_total, o.tax_total, o.shipping_total, o.placed_at,
                    o.shipping_name AS customer_name, o.shipping_phone AS customer_phone,
                    o.shipping_line1, o.shipping_line2, o.shipping_city_district, o.shipping_state, o.shipping_pincode,
                    c.email AS customer_email
             FROM deliveries d
             JOIN orders o ON o.id = d.order_id
             LEFT JOIN customers c ON c.id = o.customer_id
             WHERE d.id = :id'
        );
        $stmt->execute(['id' => $deliveryId]);
        $delivery = $stmt->fetch();

        if ($delivery === false) {
            return null;
        }

        // Ordered items with thumbnails
        $itemsStmt = $this->pdo->prepare(
            'SELECT oi.id, oi.product_id, oi.variant_id, oi.product_name_snapshot,
                    oi.variant_label_snapshot, oi.sku_snapshot, oi.quantity,
                    oi.mrp, oi.unit_price, oi.product_discount_amount, oi.tax_amount, oi.line_total,
                    COALESCE(vi.thumb_path, vi.image_path, pi.thumb_path, pi.image_path) AS image_path
             FROM order_items oi
             LEFT JOIN variant_images vi ON vi.variant_id = oi.variant_id AND vi.is_primary = 1
             LEFT JOIN product_images pi ON pi.product_id = oi.product_id AND pi.is_primary = 1
             WHERE oi.order_id = :order_id
             ORDER BY oi.id ASC'
        );
        $itemsStmt->execute(['order_id' => $delivery['order_id']]);
        $delivery['items'] = $itemsStmt->fetchAll();

        // Chronological status history with actor name
        $historyStmt = $this->pdo->prepare(
            'SELECT h.*, u.name AS actor_name
             FROM delivery_status_history h
             LEFT JOIN users u ON u.id = h.actor_user_id
             WHERE h.delivery_id = :id
             ORDER BY h.created_at ASC, h.id ASC'
        );
        $historyStmt->execute(['id' => $deliveryId]);
        $delivery['history'] = $historyStmt->fetchAll();

        // Harmonize field aliases for customer storefront expectations
        $delivery['courier_name'] = $delivery['courier_partner'] ?: $delivery['courier'];
        $delivery['tracking_number'] = $delivery['awb'];

        return $delivery;
    }

    /** @return array<string, mixed>|null */
    public function findByOrder(int $orderId): ?array
    {
        $stmt = $this->pdo->prepare('SELECT id FROM deliveries WHERE order_id = :id');
        $stmt->execute(['id' => $orderId]);
        $id = $stmt->fetchColumn();

        return $id === false ? null : $this->find((int) $id);
    }
}
