<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Production-ready Returns Management Service.
 * Supports Return creation, approval/rejection, pickup tracking,
 * item receipt, condition inspection, inventory restocking,
 * refund processing, state machine transitions, and customer tracking synchronization.
 */
final class ReturnService
{
    /** @var array<string, list<string>> */
    public const ALLOWED_TRANSITIONS = [
        'PENDING_REVIEW' => ['APPROVED', 'REJECTED'],
        'APPROVED' => ['PICKUP_SCHEDULED', 'ITEM_RECEIVED', 'PROCESSING', 'REJECTED'],
        'PICKUP_SCHEDULED' => ['ITEM_RECEIVED', 'PROCESSING', 'REJECTED'],
        'ITEM_RECEIVED' => ['INSPECTION'],
        'INSPECTION' => ['PROCESSING', 'COMPLETED'],
        'PROCESSING' => ['COMPLETED'],
        'REJECTED' => ['PENDING_REVIEW'], // Allowed re-evaluation on customer appeal
        'COMPLETED' => [],
    ];

    /** @var array<string, string|null> */
    public const RETURN_TO_ORDER_STATUS = [
        'PENDING_REVIEW' => 'RETURN_REQUESTED',
        'APPROVED' => 'RETURN_REQUESTED',
        'PICKUP_SCHEDULED' => 'RETURN_REQUESTED',
        'ITEM_RECEIVED' => 'RETURN_REQUESTED',
        'INSPECTION' => 'RETURN_REQUESTED',
        'PROCESSING' => 'RETURN_REQUESTED',
        'COMPLETED' => 'RETURNED',
        'REJECTED' => null,
    ];

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Compute authoritative summary cards metrics:
     * 1. Total Return Requests (all count, today count)
     * 2. Pending Review (count, today count)
     * 3. Approved & Processing (count, today count)
     * 4. Completed (count, today count)
     *
     * @return array{
     *   total_requests: array{count: int, today: int},
     *   pending_review: array{count: int, today: int},
     *   approved_processing: array{count: int, today: int},
     *   completed: array{count: int, today: int}
     * }
     */
    public function summary(): array
    {
        // 1. Total return requests
        $totalStmt = $this->pdo->query(
            "SELECT 
                COUNT(*) AS total_count,
                COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS today_count
             FROM sale_returns"
        );
        $totalRow = $totalStmt->fetch(PDO::FETCH_ASSOC) ?: ['total_count' => 0, 'today_count' => 0];

        // 2. Pending Review
        $pendingStmt = $this->pdo->query(
            "SELECT 
                COUNT(*) AS total_count,
                COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS today_count
             FROM sale_returns
             WHERE status = 'PENDING_REVIEW'"
        );
        $pendingRow = $pendingStmt->fetch(PDO::FETCH_ASSOC) ?: ['total_count' => 0, 'today_count' => 0];

        // 3. Approved & Processing
        $approvedStmt = $this->pdo->query(
            "SELECT 
                COUNT(*) AS total_count,
                COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS today_count
             FROM sale_returns
             WHERE status IN ('APPROVED', 'PROCESSING', 'PICKUP_SCHEDULED', 'ITEM_RECEIVED', 'INSPECTION')"
        );
        $approvedRow = $approvedStmt->fetch(PDO::FETCH_ASSOC) ?: ['total_count' => 0, 'today_count' => 0];

        // 4. Completed
        $completedStmt = $this->pdo->query(
            "SELECT 
                COUNT(*) AS total_count,
                COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END), 0) AS today_count
             FROM sale_returns
             WHERE status = 'COMPLETED'"
        );
        $completedRow = $completedStmt->fetch(PDO::FETCH_ASSOC) ?: ['total_count' => 0, 'today_count' => 0];

        return [
            'total_requests' => [
                'count' => (int) $totalRow['total_count'],
                'today' => (int) $totalRow['today_count'],
            ],
            'pending_review' => [
                'count' => (int) $pendingRow['total_count'],
                'today' => (int) $pendingRow['today_count'],
            ],
            'approved_processing' => [
                'count' => (int) $approvedRow['total_count'],
                'today' => (int) $approvedRow['today_count'],
            ],
            'completed' => [
                'count' => (int) $completedRow['total_count'],
                'today' => (int) $completedRow['today_count'],
            ],
        ];
    }

    /**
     * List returns with server-side filters, pagination, and dynamic tab counts.
     *
     * @param array<string, mixed> $filters
     * @return array{
     *   items: list<array<string, mixed>>,
     *   total: int,
     *   page: int,
     *   limit: int,
     *   tab_counts: array<string, int>
     * }
     */
    public function list(array $filters = []): array
    {
        $tab = strtolower(trim((string) ($filters['tab'] ?? 'all')));
        $search = trim((string) ($filters['search'] ?? ''));
        $status = trim((string) ($filters['status'] ?? ''));
        $reason = trim((string) ($filters['reason'] ?? ''));
        $dateFrom = trim((string) ($filters['date_from'] ?? ''));
        $dateTo = trim((string) ($filters['date_to'] ?? ''));
        $page = max(1, (int) ($filters['page'] ?? 1));
        $limit = max(1, min(100, (int) ($filters['limit'] ?? 10)));
        $offset = ($page - 1) * $limit;

        // Base where clauses
        $conditions = [];
        $params = [];

        // Tab views
        if ($tab === 'pending_review') {
            $conditions[] = "sr.status = 'PENDING_REVIEW'";
        } elseif ($tab === 'approved') {
            $conditions[] = "sr.status IN ('APPROVED', 'PROCESSING', 'PICKUP_SCHEDULED', 'ITEM_RECEIVED', 'INSPECTION')";
        } elseif ($tab === 'completed') {
            $conditions[] = "sr.status = 'COMPLETED'";
        } elseif ($tab === 'rejected') {
            $conditions[] = "sr.status = 'REJECTED'";
        }

        if ($status !== '' && $status !== 'ALL') {
            $conditions[] = "sr.status = :status_filter";
            $params['status_filter'] = $status;
        }

        if ($reason !== '' && $reason !== 'ALL') {
            $conditions[] = "sr.reason = :reason_filter";
            $params['reason_filter'] = $reason;
        }

        if ($dateFrom !== '') {
            $conditions[] = "DATE(sr.created_at) >= :date_from";
            $params['date_from'] = $dateFrom;
        }

        if ($dateTo !== '') {
            $conditions[] = "DATE(sr.created_at) <= :date_to";
            $params['date_to'] = $dateTo;
        }

        if ($search !== '') {
            $conditions[] = "(
                sr.return_no LIKE :q_ret_no OR
                o.order_no LIKE :q_order_no OR
                c.name LIKE :q_cname OR
                c.phone LIKE :q_cphone OR
                EXISTS (
                    SELECT 1 FROM sale_return_items sri_s
                    WHERE sri_s.return_id = sr.id AND sri_s.product_name_snapshot LIKE :q_pname
                )
            )";
            $params['q_ret_no'] = "%{$search}%";
            $params['q_order_no'] = "%{$search}%";
            $params['q_cname'] = "%{$search}%";
            $params['q_cphone'] = "%{$search}%";
            $params['q_pname'] = "%{$search}%";
        }

        $whereSql = $conditions ? ('WHERE ' . implode(' AND ', $conditions)) : '';

        // Count total matching
        $countStmt = $this->pdo->prepare(
            "SELECT COUNT(DISTINCT sr.id)
             FROM sale_returns sr
             LEFT JOIN orders o ON o.id = sr.order_id
             LEFT JOIN customers c ON c.id = sr.customer_id
             {$whereSql}"
        );
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        // Retrieve items with first product thumbnail & count
        $selectSql = "
            SELECT 
                sr.*,
                o.order_no,
                o.status AS order_status,
                o.payment_status AS order_payment_status,
                o.grand_total AS order_grand_total,
                o.shipping_name,
                o.shipping_phone,
                o.shipping_line1,
                o.shipping_line2,
                o.shipping_city_district,
                o.shipping_state,
                o.shipping_pincode,
                c.name AS customer_name,
                c.phone AS customer_phone,
                c.email AS customer_email,
                u.name AS created_by_name,
                (SELECT COUNT(*) FROM sale_return_items sri WHERE sri.return_id = sr.id) AS items_count,
                (SELECT SUM(qty) FROM sale_return_items sri WHERE sri.return_id = sr.id) AS total_returned_qty,
                (SELECT sri.product_name_snapshot FROM sale_return_items sri WHERE sri.return_id = sr.id ORDER BY sri.id ASC LIMIT 1) AS first_item_name,
                (SELECT sri.qty FROM sale_return_items sri WHERE sri.return_id = sr.id ORDER BY sri.id ASC LIMIT 1) AS first_item_qty,
                (SELECT sri.image_path FROM sale_return_items sri WHERE sri.return_id = sr.id ORDER BY sri.id ASC LIMIT 1) AS first_item_image
            FROM sale_returns sr
            LEFT JOIN orders o ON o.id = sr.order_id
            LEFT JOIN customers c ON c.id = sr.customer_id
            LEFT JOIN users u ON u.id = sr.created_by
            {$whereSql}
            ORDER BY sr.created_at DESC
            LIMIT :limit OFFSET :offset
        ";

        $stmt = $this->pdo->prepare($selectSql);
        foreach ($params as $k => $v) {
            $stmt->bindValue($k, $v);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch items for each return row
        foreach ($items as &$item) {
            $itemStmt = $this->pdo->prepare(
                "SELECT 
                    sri.*,
                    pv.sku,
                    pv.retail_price,
                    p.name AS product_name
                 FROM sale_return_items sri
                 JOIN product_variants pv ON pv.id = sri.variant_id
                 JOIN products p ON p.id = pv.product_id
                 WHERE sri.return_id = :ret_id
                 ORDER BY sri.id ASC"
            );
            $itemStmt->execute(['ret_id' => $item['id']]);
            $item['items'] = $itemStmt->fetchAll(PDO::FETCH_ASSOC);
        }
        unset($item);

        // Compute dynamic tab counters
        $tabCountsStmt = $this->pdo->query(
            "SELECT 
                COUNT(*) AS count_all,
                SUM(CASE WHEN status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) AS count_pending_review,
                SUM(CASE WHEN status IN ('APPROVED', 'PROCESSING', 'PICKUP_SCHEDULED', 'ITEM_RECEIVED', 'INSPECTION') THEN 1 ELSE 0 END) AS count_approved,
                SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS count_completed,
                SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) AS count_rejected
             FROM sale_returns"
        );
        $tc = $tabCountsStmt->fetch(PDO::FETCH_ASSOC) ?: [];

        return [
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'tab_counts' => [
                'all' => (int) ($tc['count_all'] ?? 0),
                'pending_review' => (int) ($tc['count_pending_review'] ?? 0),
                'approved' => (int) ($tc['count_approved'] ?? 0),
                'completed' => (int) ($tc['count_completed'] ?? 0),
                'rejected' => (int) ($tc['count_rejected'] ?? 0),
            ],
        ];
    }

    /**
     * Find single return by ID with complete details, product images,
     * address, refund status, and chronological vertical status tracking history.
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            "SELECT 
                sr.*,
                o.order_no,
                o.status AS order_status,
                o.payment_status AS order_payment_status,
                o.grand_total AS order_grand_total,
                o.placed_at AS order_placed_at,
                o.shipping_name,
                o.shipping_phone,
                o.shipping_line1,
                o.shipping_line2,
                o.shipping_city_district,
                o.shipping_state,
                o.shipping_pincode,
                c.name AS customer_name,
                c.phone AS customer_phone,
                c.email AS customer_email,
                u.name AS created_by_name,
                insp_u.name AS inspected_by_name,
                ref_u.name AS refunded_by_name,
                rej_u.name AS rejected_by_name
             FROM sale_returns sr
             LEFT JOIN orders o ON o.id = sr.order_id
             LEFT JOIN customers c ON c.id = sr.customer_id
             LEFT JOIN users u ON u.id = sr.created_by
             LEFT JOIN users insp_u ON insp_u.id = sr.inspected_by
             LEFT JOIN users ref_u ON ref_u.id = sr.refunded_by
             LEFT JOIN users rej_u ON rej_u.id = sr.rejected_by
             WHERE sr.id = :id"
        );
        $stmt->execute(['id' => $id]);
        $return = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$return) {
            return null;
        }

        // Fetch detailed items
        $itemStmt = $this->pdo->prepare(
            "SELECT 
                sri.*,
                pv.sku,
                pv.retail_price,
                pv.wholesale_price,
                pv.weight_grams,
                p.name AS product_name
             FROM sale_return_items sri
             JOIN product_variants pv ON pv.id = sri.variant_id
             JOIN products p ON p.id = pv.product_id
             WHERE sri.return_id = :ret_id
             ORDER BY sri.id ASC"
        );
        $itemStmt->execute(['ret_id' => $id]);
        $return['items'] = $itemStmt->fetchAll(PDO::FETCH_ASSOC);

        // Fetch chronological tracking history
        $histStmt = $this->pdo->prepare(
            "SELECT 
                h.*,
                u.name AS actor_user_name,
                c.name AS actor_customer_name
             FROM sale_return_status_history h
             LEFT JOIN users u ON u.id = h.actor_user_id
             LEFT JOIN customers c ON c.id = h.actor_customer_id
             WHERE h.return_id = :ret_id
             ORDER BY h.created_at ASC, h.id ASC"
        );
        $histStmt->execute(['ret_id' => $id]);
        $return['history'] = $histStmt->fetchAll(PDO::FETCH_ASSOC);

        return $return;
    }

    /**
     * Retrieve eligible orders for return creation.
     * Orders that are delivered or shipped, with eligible returnable items.
     *
     * @return list<array<string, mixed>>
     */
    public function getEligibleOrders(?string $search = null): array
    {
        $where = "WHERE o.status IN ('DELIVERED', 'RETURN_REQUESTED', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'OUT_FOR_DELIVERY')";
        $params = [];

        if ($search !== null && trim($search) !== '') {
            $q = '%' . trim($search) . '%';
            $where .= " AND (o.order_no LIKE :q1 OR c.name LIKE :q2 OR c.phone LIKE :q3)";
            $params['q1'] = $q;
            $params['q2'] = $q;
            $params['q3'] = $q;
        }

        $sql = "
            SELECT 
                o.id,
                o.order_no,
                o.customer_id,
                o.status,
                o.payment_status,
                o.subtotal,
                o.grand_total,
                o.placed_at,
                o.shipping_name,
                o.shipping_phone,
                o.shipping_line1,
                o.shipping_city_district,
                o.shipping_state,
                o.shipping_pincode,
                c.name AS customer_name,
                c.phone AS customer_phone,
                (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS items_count
            FROM orders o
            LEFT JOIN customers c ON c.id = o.customer_id
            {$where}
            ORDER BY o.placed_at DESC
            LIMIT 50
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $orders = $stmt->fetchAll(PDO::FETCH_ASSOC);

        foreach ($orders as &$order) {
            $itemStmt = $this->pdo->prepare(
                "SELECT 
                    oi.id AS order_item_id,
                    oi.order_id,
                    oi.product_id,
                    oi.variant_id,
                    oi.product_name_snapshot,
                    oi.variant_label_snapshot,
                    oi.sku_snapshot,
                    oi.quantity,
                    oi.unit_price,
                    oi.line_total,
                    COALESCE(
                        (SELECT vi.image_path FROM variant_images vi WHERE vi.variant_id = oi.variant_id AND vi.is_primary = 1 LIMIT 1),
                        (SELECT vi.image_path FROM variant_images vi WHERE vi.variant_id = oi.variant_id LIMIT 1),
                        (SELECT pi.image_path FROM product_images pi WHERE pi.product_id = oi.product_id AND pi.is_primary = 1 LIMIT 1),
                        (SELECT pi.image_path FROM product_images pi WHERE pi.product_id = oi.product_id LIMIT 1)
                    ) AS image_path,
                    COALESCE(
                        (SELECT SUM(sri.qty)
                         FROM sale_return_items sri
                         JOIN sale_returns sr ON sr.id = sri.return_id
                         WHERE sr.order_id = oi.order_id AND sri.order_item_id = oi.id AND sr.status != 'REJECTED'),
                        0
                    ) AS returned_qty
                 FROM order_items oi
                 WHERE oi.order_id = :order_id"
            );
            $itemStmt->execute(['order_id' => $order['id']]);
            $rawItems = $itemStmt->fetchAll(PDO::FETCH_ASSOC);

            $eligibleItems = [];
            foreach ($rawItems as $ri) {
                $rem = (int) $ri['quantity'] - (int) $ri['returned_qty'];
                $ri['remaining_qty'] = max(0, $rem);
                $eligibleItems[] = $ri;
            }
            $order['items'] = $eligibleItems;
        }
        unset($order);

        return $orders;
    }

    /**
     * Create a database-driven return request for an eligible order.
     * Enforces item eligibility, quantity caps, RMA generation, initial tracking history,
     * and transactional consistency.
     *
     * @param array<string, mixed> $data
     * @return int Created return ID
     */
    public function createReturn(array $data, ?int $createdByUserId = null, ?int $customerId = null): int
    {
        $orderId = !empty($data['order_id']) ? (int) $data['order_id'] : null;
        $reason = trim((string) ($data['reason'] ?? ''));
        $returnType = strtoupper(trim((string) ($data['return_type'] ?? 'REFUND')));
        $notes = trim((string) ($data['notes'] ?? ''));
        $items = (array) ($data['items'] ?? []);

        if ($orderId === null) {
            throw new RuntimeException('Order ID is required to create a return request');
        }

        if ($reason === '') {
            throw new RuntimeException('A return reason is required');
        }

        if (!in_array($returnType, ['REFUND', 'REPLACEMENT'], true)) {
            $returnType = 'REFUND';
        }

        if (empty($items)) {
            throw new RuntimeException('At least one item must be selected for return');
        }

        // Fetch order
        $orderStmt = $this->pdo->prepare('SELECT * FROM orders WHERE id = :id');
        $orderStmt->execute(['id' => $orderId]);
        $order = $orderStmt->fetch(PDO::FETCH_ASSOC);

        if (!$order) {
            throw new RuntimeException("Order #{$orderId} not found");
        }

        // Customer authorization validation: if customerId is passed, must match order.customer_id
        if ($customerId !== null && (int) $order['customer_id'] !== $customerId) {
            throw new RuntimeException('Unauthorized: You cannot request a return for this order');
        }

        $orderCustomerId = (int) $order['customer_id'];

        // Fetch original order items
        $oiStmt = $this->pdo->prepare('SELECT * FROM order_items WHERE order_id = :order_id');
        $oiStmt->execute(['order_id' => $orderId]);
        $orderItemsMap = [];
        foreach ($oiStmt->fetchAll(PDO::FETCH_ASSOC) as $oi) {
            $orderItemsMap[(int) $oi['id']] = $oi;
        }

        // Fetch previously returned quantities for items of this order (excluding REJECTED)
        $pastRetStmt = $this->pdo->prepare(
            "SELECT sri.order_item_id, COALESCE(SUM(sri.qty), 0) AS total_returned
             FROM sale_return_items sri
             JOIN sale_returns sr ON sr.id = sri.return_id
             WHERE sr.order_id = :order_id AND sr.status != 'REJECTED'
             GROUP BY sri.order_item_id"
        );
        $pastRetStmt->execute(['order_id' => $orderId]);
        $pastReturned = array_column($pastRetStmt->fetchAll(PDO::FETCH_ASSOC), 'total_returned', 'order_item_id');

        $this->pdo->beginTransaction();

        try {
            $totalAmount = 0.0;
            $processedItems = [];

            foreach ($items as $item) {
                $orderItemId = (int) ($item['order_item_id'] ?? 0);
                $qty = (int) ($item['qty'] ?? 0);

                if ($orderItemId <= 0 || $qty <= 0) {
                    continue;
                }

                if (!isset($orderItemsMap[$orderItemId])) {
                    throw new RuntimeException("Item #{$orderItemId} does not belong to order #{$order['order_no']}");
                }

                $origItem = $orderItemsMap[$orderItemId];
                $origQty = (int) $origItem['quantity'];
                $alreadyReturned = (int) ($pastReturned[$orderItemId] ?? 0);
                $remaining = $origQty - $alreadyReturned;

                if ($qty > $remaining) {
                    throw new RuntimeException(
                        "Cannot return {$qty} units of '{$origItem['product_name_snapshot']}' — only {$remaining} remain returnable"
                    );
                }

                $unitPrice = (float) $origItem['unit_price'];
                $lineTotal = round($qty * $unitPrice, 2);
                $totalAmount += $lineTotal;

                // Lookup image if available
                $imgStmt = $this->pdo->prepare(
                    "SELECT image_path FROM product_images WHERE product_id = :p_id AND is_primary = 1 LIMIT 1"
                );
                $imgStmt->execute(['p_id' => $origItem['product_id']]);
                $imgPath = $imgStmt->fetchColumn() ?: null;

                $processedItems[] = [
                    'order_item_id' => $orderItemId,
                    'variant_id' => (int) $origItem['variant_id'],
                    'product_id' => (int) $origItem['product_id'],
                    'product_name_snapshot' => $origItem['product_name_snapshot'],
                    'variant_label_snapshot' => $origItem['variant_label_snapshot'],
                    'sku_snapshot' => $origItem['sku_snapshot'],
                    'image_path' => $imgPath,
                    'qty' => $qty,
                    'unit_price' => $unitPrice,
                    'total_amount' => $lineTotal,
                ];
            }

            if (empty($processedItems)) {
                throw new RuntimeException('No valid return items provided');
            }

            // Generate RMA number: RMA-1001 or sequential based on max existing id
            $maxIdStmt = $this->pdo->query('SELECT MAX(id) FROM sale_returns');
            $nextSeq = ((int) $maxIdStmt->fetchColumn()) + 1001;
            $returnNo = 'RMA-' . $nextSeq;

            // Insert sale_returns
            $insertRet = $this->pdo->prepare(
                "INSERT INTO sale_returns (
                    return_no, order_id, customer_id, status, return_type,
                    total_amount, refund_amount, refund_status, reason, notes, created_by
                ) VALUES (
                    :return_no, :order_id, :customer_id, 'PENDING_REVIEW', :return_type,
                    :total_amount, :refund_amount, :refund_status, :reason, :notes, :created_by
                )"
            );

            $refundStatus = ($returnType === 'REFUND') ? 'PENDING' : 'NOT_APPLICABLE';

            $insertRet->execute([
                'return_no' => $returnNo,
                'order_id' => $orderId,
                'customer_id' => $orderCustomerId,
                'return_type' => $returnType,
                'total_amount' => $totalAmount,
                'refund_amount' => $totalAmount,
                'refund_status' => $refundStatus,
                'reason' => $reason,
                'notes' => $notes ?: null,
                'created_by' => $createdByUserId,
            ]);

            $returnId = (int) $this->pdo->lastInsertId();

            // Insert sale_return_items
            $insertItem = $this->pdo->prepare(
                "INSERT INTO sale_return_items (
                    return_id, variant_id, order_item_id, product_id,
                    product_name_snapshot, variant_label_snapshot, sku_snapshot,
                    image_path, qty, unit_price, total_amount, `condition`
                ) VALUES (
                    :return_id, :variant_id, :order_item_id, :product_id,
                    :product_name_snapshot, :variant_label_snapshot, :sku_snapshot,
                    :image_path, :qty, :unit_price, :total_amount, 'PENDING'
                )"
            );

            foreach ($processedItems as $pi) {
                $insertItem->execute([
                    'return_id' => $returnId,
                    'variant_id' => $pi['variant_id'],
                    'order_item_id' => $pi['order_item_id'],
                    'product_id' => $pi['product_id'],
                    'product_name_snapshot' => $pi['product_name_snapshot'],
                    'variant_label_snapshot' => $pi['variant_label_snapshot'],
                    'sku_snapshot' => $pi['sku_snapshot'],
                    'image_path' => $pi['image_path'],
                    'qty' => $pi['qty'],
                    'unit_price' => $pi['unit_price'],
                    'total_amount' => $pi['total_amount'],
                ]);
            }

            // Log initial tracking event
            $this->pdo->prepare(
                "INSERT INTO sale_return_status_history (
                    return_id, from_status, to_status, source, note, actor_user_id, actor_customer_id
                ) VALUES (
                    :ret_id, NULL, 'PENDING_REVIEW', :source, :note, :actor_user_id, :actor_customer_id
                )"
            )->execute([
                'ret_id' => $returnId,
                'source' => $createdByUserId ? 'ADMIN' : 'CUSTOMER',
                'note' => "Return request submitted: {$reason}",
                'actor_user_id' => $createdByUserId,
                'actor_customer_id' => $customerId,
            ]);

            // Sync order status if order was DELIVERED
            if ($order['status'] === 'DELIVERED') {
                $this->pdo->prepare("UPDATE orders SET status = 'RETURN_REQUESTED' WHERE id = :id")->execute(['id' => $orderId]);
                $this->pdo->prepare(
                    "INSERT INTO order_status_history (order_id, from_status, to_status, source, note)
                     VALUES (:order_id, 'DELIVERED', 'RETURN_REQUESTED', 'SYSTEM', :note)"
                )->execute([
                    'order_id' => $orderId,
                    'note' => "Return requested: {$returnNo} ({$reason})",
                ]);
            }

            $this->pdo->commit();

            return $returnId;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Update return status adhering to strict state machine transitions.
     * Handles inventory restocking when inspected as RESELLABLE,
     * logs status history, and updates order status.
     *
     * @param array<string, mixed> $extra
     * @return array<string, mixed> Authoritative updated return
     */
    public function updateStatus(
        int $returnId,
        string $newStatus,
        ?string $note = null,
        ?int $actorUserId = null,
        array $extra = []
    ): array {
        $return = $this->find($returnId);

        if ($return === null) {
            throw new RuntimeException('Return request not found');
        }

        if (!array_key_exists($newStatus, self::RETURN_TO_ORDER_STATUS)) {
            throw new RuntimeException("Invalid return status: {$newStatus}");
        }

        if ($return['status'] === $newStatus) {
            throw new RuntimeException("Return is already in {$newStatus} status");
        }

        $currentStatus = $return['status'];
        $allowed = self::ALLOWED_TRANSITIONS[$currentStatus] ?? [];

        if (!in_array($newStatus, $allowed, true)) {
            throw new RuntimeException("Cannot transition return from {$currentStatus} to {$newStatus}");
        }

        // Additional validation by status
        if ($newStatus === 'REJECTED') {
            $rejectionReason = trim((string) ($extra['rejection_reason'] ?? $note ?? ''));
            if ($rejectionReason === '') {
                throw new RuntimeException('A rejection reason is required to reject a return');
            }
        }

        $this->pdo->beginTransaction();

        try {
            $now = date('Y-m-d H:i:s');
            $updates = ['status = :status'];
            $params = ['status' => $newStatus, 'id' => $returnId];

            if ($newStatus === 'APPROVED') {
                // If not already approved
            }

            if ($newStatus === 'REJECTED') {
                $updates[] = 'rejection_reason = :rejection_reason';
                $updates[] = 'rejected_by = :rejected_by';
                $updates[] = 'rejected_at = :rejected_at';
                $updates[] = "refund_status = 'REJECTED'";
                $params['rejection_reason'] = $extra['rejection_reason'] ?? $note;
                $params['rejected_by'] = $actorUserId;
                $params['rejected_at'] = $now;
            }

            if ($newStatus === 'PICKUP_SCHEDULED') {
                if (!empty($extra['pickup_partner'])) {
                    $updates[] = 'pickup_partner = :pickup_partner';
                    $params['pickup_partner'] = trim((string) $extra['pickup_partner']);
                }
                if (!empty($extra['pickup_tracking_id'])) {
                    $updates[] = 'pickup_tracking_id = :pickup_tracking_id';
                    $params['pickup_tracking_id'] = trim((string) $extra['pickup_tracking_id']);
                }
                $updates[] = 'pickup_scheduled_at = :pickup_scheduled_at';
                $params['pickup_scheduled_at'] = $now;
                $updates[] = "pickup_status = 'SCHEDULED'";
            }

            if ($newStatus === 'ITEM_RECEIVED') {
                $updates[] = 'pickup_completed_at = :pickup_completed_at';
                $params['pickup_completed_at'] = $now;
                $updates[] = "pickup_status = 'RECEIVED'";
            }

            if ($newStatus === 'INSPECTION') {
                $condition = strtoupper(trim((string) ($extra['condition'] ?? 'RESELLABLE')));
                if (!in_array($condition, ['RESELLABLE', 'DAMAGED', 'DEFECTIVE', 'QUARANTINED'], true)) {
                    $condition = 'RESELLABLE';
                }
                $updates[] = 'inspection_condition = :condition';
                $updates[] = 'inspected_by = :inspected_by';
                $updates[] = 'inspected_at = :inspected_at';
                $params['condition'] = $condition;
                $params['inspected_by'] = $actorUserId;
                $params['inspected_at'] = $now;

                if (!empty($extra['inspection_notes'])) {
                    $updates[] = 'inspection_notes = :inspection_notes';
                    $params['inspection_notes'] = trim((string) $extra['inspection_notes']);
                }

                // If inspected as RESELLABLE and stock not already credited, restock to inventory
                if ($condition === 'RESELLABLE' && (int) $return['stock_credited'] === 0) {
                    $adjNo = 'ADJ-RET-' . date('YmdHis') . '-' . random_int(100, 999);
                    $this->pdo->prepare(
                        "INSERT INTO stock_adjustments (adjustment_no, reason, status, created_by)
                         VALUES (:no, :reason, 'APPROVED', :created_by)"
                    )->execute([
                        'no' => $adjNo,
                        'reason' => "Return restock: {$return['return_no']}",
                        'created_by' => $actorUserId,
                    ]);
                    $adjId = (int) $this->pdo->lastInsertId();

                    $adjItemStmt = $this->pdo->prepare(
                        "INSERT INTO stock_adjustment_items (adjustment_id, variant_id, system_qty, counted_qty)
                         VALUES (:adj_id, :variant_id, :sys_qty, :count_qty)"
                    );

                    foreach ($return['items'] as $item) {
                        $variantId = (int) $item['variant_id'];
                        $qty = (int) $item['qty'];

                        $stockStmt = $this->pdo->prepare("SELECT on_hand FROM inventory WHERE variant_id = :vid");
                        $stockStmt->execute(['vid' => $variantId]);
                        $currentStock = (float) ($stockStmt->fetchColumn() ?: 0);
                        $newStock = $currentStock + $qty;

                        $this->pdo->prepare(
                            "INSERT INTO inventory (variant_id, product_id, on_hand)
                             SELECT :v_id, product_id, :on_hand FROM product_variants WHERE id = :v_id2
                             ON DUPLICATE KEY UPDATE on_hand = VALUES(on_hand)"
                        )->execute(['v_id' => $variantId, 'on_hand' => $newStock, 'v_id2' => $variantId]);

                        $adjItemStmt->execute([
                            'adj_id' => $adjId,
                            'variant_id' => $variantId,
                            'sys_qty' => $currentStock,
                            'count_qty' => $newStock,
                        ]);
                    }

                    $updates[] = 'stock_credited = 1';
                    $updates[] = 'stock_adjustment_id = :adj_id';
                    $params['adj_id'] = $adjId;
                }
            }

            if ($newStatus === 'COMPLETED') {
                $updates[] = 'completed_at = :completed_at';
                $params['completed_at'] = $now;

                // Sync order status
                if ($return['order_id']) {
                    $orderStatus = self::RETURN_TO_ORDER_STATUS['COMPLETED'];
                    $this->pdo->prepare("UPDATE orders SET status = :st WHERE id = :oid")->execute([
                        'st' => $orderStatus,
                        'oid' => $return['order_id'],
                    ]);

                    $this->pdo->prepare(
                        "INSERT INTO order_status_history (order_id, from_status, to_status, source, note)
                         VALUES (:order_id, :from_st, :to_st, 'SYSTEM', :note)"
                    )->execute([
                        'order_id' => $return['order_id'],
                        'from_st' => $return['order_status'] ?? 'RETURN_REQUESTED',
                        'to_st' => $orderStatus,
                        'note' => "Synced from return completion: {$return['return_no']}",
                    ]);
                }
            }

            // Execute sale_returns update
            $sql = 'UPDATE sale_returns SET ' . implode(', ', $updates) . ' WHERE id = :id';
            $this->pdo->prepare($sql)->execute($params);

            // Log status history
            $histNote = $note ?? match ($newStatus) {
                'APPROVED' => 'Return request approved by admin',
                'REJECTED' => 'Return request rejected: ' . ($extra['rejection_reason'] ?? 'Condition not met'),
                'PICKUP_SCHEDULED' => 'Pickup scheduled with ' . ($extra['pickup_partner'] ?? 'carrier'),
                'ITEM_RECEIVED' => 'Returned items received at fulfillment center',
                'INSPECTION' => 'Inspection completed: ' . ($extra['condition'] ?? 'RESELLABLE'),
                'PROCESSING' => 'Return processing initiated (' . $return['return_type'] . ')',
                'COMPLETED' => 'Return completed successfully',
                default => "Status updated to {$newStatus}",
            };

            $this->pdo->prepare(
                "INSERT INTO sale_return_status_history (
                    return_id, from_status, to_status, source, note, actor_user_id
                ) VALUES (
                    :ret_id, :from_status, :to_status, 'ADMIN', :note, :actor_user_id
                )"
            )->execute([
                'ret_id' => $returnId,
                'from_status' => $currentStatus,
                'to_status' => $newStatus,
                'note' => $histNote,
                'actor_user_id' => $actorUserId,
            ]);

            $this->pdo->commit();

            return $this->find($returnId) ?? throw new RuntimeException('Return not found after status update');
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Process refund for an approved/completed return.
     * Records financial ledger entry, updates refund status, and reconciles payment.
     *
     * @return array<string, mixed>
     */
    public function processRefund(int $returnId, int $actorUserId, string $method = 'ORIGINAL'): array
    {
        $return = $this->find($returnId);

        if (!$return) {
            throw new RuntimeException('Return request not found');
        }

        if ($return['return_type'] !== 'REFUND') {
            throw new RuntimeException('This return was registered for replacement, not refund');
        }

        if ($return['refund_status'] === 'REFUNDED') {
            throw new RuntimeException('Refund has already been completed for this return');
        }

        if ($return['status'] === 'REJECTED') {
            throw new RuntimeException('Cannot refund a rejected return');
        }

        $refundAmount = (float) $return['refund_amount'];
        if ($refundAmount <= 0) {
            $refundAmount = (float) $return['total_amount'];
        }

        $this->pdo->beginTransaction();

        try {
            $now = date('Y-m-d H:i:s');
            $txNo = 'TX-REF-' . $returnId . '-' . substr(bin2hex(random_bytes(4)), 0, 8);

            // Record financial expense transaction
            $this->pdo->prepare(
                "INSERT INTO finance_transactions (
                    transaction_no, type, category, amount, payment_method, reference_no, transaction_date, notes, created_by
                ) VALUES (
                    :no, 'EXPENSE', 'Customer Return Refund', :amount, :method, :ref, CURDATE(), :notes, :by
                )"
            )->execute([
                'no' => $txNo,
                'amount' => $refundAmount,
                'method' => $method,
                'ref' => $return['return_no'],
                'notes' => "Refund for Return {$return['return_no']} (Order {$return['order_no']})",
                'by' => $actorUserId,
            ]);

            // Update sale_returns refund tracking
            $this->pdo->prepare(
                "UPDATE sale_returns 
                 SET refund_status = 'REFUNDED',
                     refund_amount = :amt,
                     refunded_at = :now,
                     refunded_by = :by
                 WHERE id = :id"
            )->execute([
                'amt' => $refundAmount,
                'now' => $now,
                'by' => $actorUserId,
                'id' => $returnId,
            ]);

            // If order exists, update payment status if entire order refunded
            if ($return['order_id']) {
                $orderTotal = (float) $return['order_grand_total'];
                $newPayStatus = ($refundAmount >= ($orderTotal - 0.01)) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
                $this->pdo->prepare("UPDATE orders SET payment_status = :st WHERE id = :id")->execute([
                    'st' => $newPayStatus,
                    'id' => $return['order_id'],
                ]);
            }

            // Log status history
            $this->pdo->prepare(
                "INSERT INTO sale_return_status_history (
                    return_id, from_status, to_status, source, note, actor_user_id
                ) VALUES (
                    :ret_id, :from_st, :to_st, 'ADMIN', :note, :by
                )"
            )->execute([
                'ret_id' => $returnId,
                'from_st' => $return['status'],
                'to_st' => $return['status'],
                'note' => "Refund of Rs. " . number_format($refundAmount, 2) . " processed ({$txNo})",
                'by' => $actorUserId,
            ]);

            $this->pdo->commit();

            return $this->find($returnId) ?? throw new RuntimeException('Return not found after refund');
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /**
     * Find latest return by Order ID for customer order tracking.
     *
     * @return array<string, mixed>|null
     */
    public function findByOrder(int $orderId): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id FROM sale_returns WHERE order_id = :order_id ORDER BY created_at DESC LIMIT 1'
        );
        $stmt->execute(['order_id' => $orderId]);
        $id = $stmt->fetchColumn();

        if (!$id) {
            return null;
        }

        return $this->find((int) $id);
    }
}
