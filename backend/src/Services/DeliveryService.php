<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Delivery management (ECOMMERCE_POS_ADMIN_SPEC.md sections 21-22).
 * Provider integration is always MOCK — see
 * docs/DOCUMENTATION.md section 15's ShippingProviderInterface design,
 * which this intentionally simplifies (no real Shiprocket adapter yet).
 *
 * Order <-> delivery synchronization: a delivery status change updates
 * the parent order's status through DELIVERY_TO_ORDER_STATUS whenever
 * that status maps to something, logging to both delivery_status_history
 * and order_status_history in the same transaction.
 */
final class DeliveryService
{
    /** @var array<string, string|null> */
    private const DELIVERY_TO_ORDER_STATUS = [
        'PENDING' => null,
        'ASSIGNED' => 'PACKED',
        'PICKED_UP' => 'SHIPPED',
        'IN_TRANSIT' => 'SHIPPED',
        'OUT_FOR_DELIVERY' => 'OUT_FOR_DELIVERY',
        'DELIVERED' => 'DELIVERED',
        'FAILED' => null,
        'RETURNED' => 'RETURNED',
    ];

    public function __construct(private readonly PDO $pdo)
    {
    }

    public function createForOrder(int $orderId, ?string $courier, ?string $expectedDeliveryDate): int
    {
        $orderStmt = $this->pdo->prepare('SELECT status, payment_status FROM orders WHERE id = :id');
        $orderStmt->execute(['id' => $orderId]);
        $order = $orderStmt->fetch();

        if ($order === false) {
            throw new RuntimeException('Order not found');
        }

        if ($order['payment_status'] !== 'PAID') {
            throw new RuntimeException('A delivery can only be created for a paid order');
        }

        $existing = $this->pdo->prepare('SELECT 1 FROM deliveries WHERE order_id = :id');
        $existing->execute(['id' => $orderId]);

        if ($existing->fetchColumn() !== false) {
            throw new RuntimeException('This order already has a delivery');
        }

        $this->pdo->beginTransaction();

        try {
            $awb = 'MOCKAWB' . strtoupper(bin2hex(random_bytes(5)));

            $this->pdo->prepare(
                "INSERT INTO deliveries (order_id, provider, courier, awb, tracking_url, status, expected_delivery_date)
                 VALUES (:order_id, 'MOCK', :courier, :awb, :tracking_url, 'PENDING', :eta)"
            )->execute([
                'order_id' => $orderId,
                'courier' => $courier,
                'awb' => $awb,
                'tracking_url' => 'https://track.example.test/' . $awb,
                'eta' => $expectedDeliveryDate,
            ]);

            $deliveryId = (int) $this->pdo->lastInsertId();

            $this->pdo->prepare(
                "INSERT INTO delivery_status_history (delivery_id, from_status, to_status, source, note)
                 VALUES (:id, NULL, 'PENDING', 'SYSTEM', 'Shipment created')"
            )->execute(['id' => $deliveryId]);

            $this->pdo->commit();

            return $deliveryId;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    public function updateStatus(int $deliveryId, string $newStatus, string $source, ?string $note, ?int $actorUserId): array
    {
        $delivery = $this->find($deliveryId);

        if ($delivery === null) {
            throw new RuntimeException('Delivery not found');
        }

        if (!array_key_exists($newStatus, self::DELIVERY_TO_ORDER_STATUS)) {
            throw new RuntimeException('Invalid delivery status');
        }

        if ($delivery['status'] === 'DELIVERED') {
            throw new RuntimeException('Delivery already completed — status cannot change further');
        }

        if ($delivery['status'] === $newStatus) {
            throw new RuntimeException("Delivery is already {$newStatus}");
        }

        $this->pdo->beginTransaction();

        try {
            $this->pdo->prepare('UPDATE deliveries SET status = :status WHERE id = :id')
                ->execute(['status' => $newStatus, 'id' => $deliveryId]);

            $this->pdo->prepare(
                'INSERT INTO delivery_status_history (delivery_id, from_status, to_status, source, note)
                 VALUES (:id, :from_status, :to_status, :source, :note)'
            )->execute([
                'id' => $deliveryId,
                'from_status' => $delivery['status'],
                'to_status' => $newStatus,
                'source' => $source,
                'note' => $note,
            ]);

            $mappedOrderStatus = self::DELIVERY_TO_ORDER_STATUS[$newStatus];

            if ($mappedOrderStatus !== null) {
                $orderStmt = $this->pdo->prepare('SELECT status FROM orders WHERE id = :id');
                $orderStmt->execute(['id' => $delivery['order_id']]);
                $currentOrderStatus = $orderStmt->fetchColumn();

                if ($currentOrderStatus !== $mappedOrderStatus && !in_array($currentOrderStatus, ['CANCELLED', 'DELIVERED'], true)) {
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

                if ($mappedOrderStatus === 'DELIVERED') {
                    $invCheck = $this->pdo->prepare('SELECT id FROM invoices WHERE order_id = :id');
                    $invCheck->execute(['id' => $delivery['order_id']]);
                    if (!$invCheck->fetch()) {
                        // Same dependency wiring as OrderController — OrderService
                        // and InvoiceService both take several collaborators, none
                        // of which are optional.
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

    /** Mock webhook entry point (docs section 15: "Update via webhook endpoint plus a polling cron as backup"). */
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

    /** @param array<string, mixed> $filters */
    public function list(array $filters): array
    {
        $where = [];
        $params = [];

        if (!empty($filters['status'])) {
            $where[] = 'd.status = :status';
            $params['status'] = $filters['status'];
        }

        $whereSql = $where === [] ? '1=1' : implode(' AND ', $where);

        $stmt = $this->pdo->prepare(
            "SELECT d.*, o.order_no, o.shipping_name AS customer_name, o.shipping_phone AS customer_phone,
                    o.shipping_line1, o.shipping_line2, o.shipping_city_district, o.shipping_state, o.shipping_pincode
             FROM deliveries d JOIN orders o ON o.id = d.order_id
             WHERE {$whereSql} ORDER BY d.created_at DESC LIMIT 200"
        );
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    /** @return array<string, mixed>|null */
    public function find(int $deliveryId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT d.*, o.order_no, o.shipping_name AS customer_name, o.shipping_phone AS customer_phone,
                    o.shipping_line1, o.shipping_line2, o.shipping_city_district, o.shipping_state, o.shipping_pincode
             FROM deliveries d JOIN orders o ON o.id = d.order_id WHERE d.id = :id'
        );
        $stmt->execute(['id' => $deliveryId]);
        $delivery = $stmt->fetch();

        if ($delivery === false) {
            return null;
        }

        $history = $this->pdo->prepare('SELECT * FROM delivery_status_history WHERE delivery_id = :id ORDER BY created_at');
        $history->execute(['id' => $deliveryId]);
        $delivery['history'] = $history->fetchAll();

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
