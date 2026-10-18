<?php

declare(strict_types=1);

require __DIR__ . '/../backend/vendor/autoload.php';
require __DIR__ . '/../backend/config/database.php';

$pdo = db();
echo "Seeding returns in database: " . $pdo->query('SELECT DATABASE()')->fetchColumn() . "\n";

// Ensure ADMIN user exists
$adminId = (int) ($pdo->query("SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE code = 'ADMIN' LIMIT 1) LIMIT 1")->fetchColumn() ?: 1);

// Helper to create or find customer
function getOrCreateCustomer(PDO $pdo, string $name, string $phone): int {
    $stmt = $pdo->prepare("SELECT id FROM customers WHERE phone = :phone LIMIT 1");
    $stmt->execute(['phone' => $phone]);
    $id = $stmt->fetchColumn();
    if ($id) return (int) $id;

    $pdo->prepare("INSERT INTO customers (name, phone, status) VALUES (:name, :phone, 'ACTIVE')")->execute(['name' => $name, 'phone' => $phone]);
    return (int) $pdo->lastInsertId();
}

// Helper to find a product variant
function getVariant(PDO $pdo, int $idx = 0): array {
    $stmt = $pdo->query("SELECT pv.id AS variant_id, pv.product_id, pv.sku, pv.retail_price, p.name AS product_name
                         FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.status = 'ACTIVE' LIMIT 10");
    $all = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $all[$idx % count($all)];
}

$sampleReturns = [
    [
        'rma' => 'RMA-1001',
        'order_no' => 'ORD-1048',
        'customer' => ['name' => 'Maya', 'phone' => '98765 43210', 'addr' => '12, South Street, Tenkasi - 627811'],
        'item' => ['name' => 'Cotton Kurti', 'qty' => 2, 'unit_price' => 450.00, 'img' => '/products/kurti.jpg'],
        'reason' => 'Size issue',
        'return_type' => 'REPLACEMENT',
        'status' => 'PENDING_REVIEW',
        'date' => '2026-10-17 10:24:00',
        'history' => [
            ['from' => null, 'to' => 'PENDING_REVIEW', 'note' => 'Return requested: Size issue (M is too small, need L)', 'at' => '2026-10-17 10:24:00'],
        ],
    ],
    [
        'rma' => 'RMA-1002',
        'order_no' => 'ORD-1047',
        'customer' => ['name' => 'Ravi Kumar', 'phone' => '94433 22111', 'addr' => '45, Anna Salai, Chennai - 600002'],
        'item' => ['name' => 'Running Shoes', 'qty' => 1, 'unit_price' => 1899.00, 'img' => '/products/shoes.jpg'],
        'reason' => 'Damaged item',
        'return_type' => 'REFUND',
        'status' => 'APPROVED',
        'date' => '2026-10-16 16:32:00',
        'history' => [
            ['from' => null, 'to' => 'PENDING_REVIEW', 'note' => 'Return requested: Damaged item (Sole detached)', 'at' => '2026-10-16 16:32:00'],
            ['from' => 'PENDING_REVIEW', 'to' => 'APPROVED', 'note' => 'Return approved by customer support', 'at' => '2026-10-16 17:15:00'],
        ],
    ],
    [
        'rma' => 'RMA-1003',
        'order_no' => 'ORD-1046',
        'customer' => ['name' => 'Priya', 'phone' => '98887 76655', 'addr' => 'No.12, Main Road, Tenkasi - 627811'],
        'item' => ['name' => 'Skin Care Kit', 'qty' => 1, 'unit_price' => 1250.00, 'img' => '/products/skincare.jpg'],
        'reason' => 'Wrong product',
        'return_type' => 'REPLACEMENT',
        'status' => 'PROCESSING',
        'pickup_partner' => 'Bluedart',
        'pickup_tracking_id' => 'BD781240',
        'date' => '2026-10-16 13:15:00',
        'history' => [
            ['from' => null, 'to' => 'PENDING_REVIEW', 'note' => 'Return requested: Wrong product sent', 'at' => '2026-10-16 13:15:00'],
            ['from' => 'PENDING_REVIEW', 'to' => 'APPROVED', 'note' => 'Return request approved', 'at' => '2026-10-16 14:40:00'],
            ['from' => 'APPROVED', 'to' => 'PICKUP_SCHEDULED', 'note' => 'Pickup scheduled with Bluedart (AWB: BD781240)', 'at' => '2026-10-17 10:00:00'],
            ['from' => 'PICKUP_SCHEDULED', 'to' => 'PROCESSING', 'note' => 'Replacement processing at central warehouse', 'at' => '2026-10-17 11:30:00'],
        ],
    ],
    [
        'rma' => 'RMA-1004',
        'order_no' => 'ORD-1045',
        'customer' => ['name' => 'Karthik', 'phone' => '90909 12345', 'addr' => '88, Lake View, Madurai - 625001'],
        'item' => ['name' => 'Backpack', 'qty' => 1, 'unit_price' => 999.00, 'img' => '/products/bag.jpg'],
        'reason' => 'Defective',
        'return_type' => 'REFUND',
        'status' => 'PICKUP_SCHEDULED',
        'pickup_partner' => 'Delhivery Logistics',
        'pickup_tracking_id' => 'DL882194',
        'date' => '2026-10-15 18:40:00',
        'history' => [
            ['from' => null, 'to' => 'PENDING_REVIEW', 'note' => 'Return requested: Defective zipper', 'at' => '2026-10-15 18:40:00'],
            ['from' => 'PENDING_REVIEW', 'to' => 'APPROVED', 'note' => 'Return approved', 'at' => '2026-10-16 09:30:00'],
            ['from' => 'APPROVED', 'to' => 'PICKUP_SCHEDULED', 'note' => 'Reverse pickup scheduled via Delhivery', 'at' => '2026-10-16 11:00:00'],
        ],
    ],
    [
        'rma' => 'RMA-1005',
        'order_no' => 'ORD-1043',
        'customer' => ['name' => 'Meena', 'phone' => '97890 11223', 'addr' => '14, Cross Road, Coimbatore - 641001'],
        'item' => ['name' => 'Western Dress', 'qty' => 1, 'unit_price' => 1499.00, 'img' => '/products/dress.jpg'],
        'reason' => 'Fabric issue',
        'return_type' => 'REPLACEMENT',
        'status' => 'COMPLETED',
        'date' => '2026-10-14 11:20:00',
        'history' => [
            ['from' => null, 'to' => 'PENDING_REVIEW', 'note' => 'Return requested: Fabric color bled', 'at' => '2026-10-14 11:20:00'],
            ['from' => 'PENDING_REVIEW', 'to' => 'APPROVED', 'note' => 'Return approved', 'at' => '2026-10-14 12:00:00'],
            ['from' => 'APPROVED', 'to' => 'ITEM_RECEIVED', 'note' => 'Returned dress received at warehouse', 'at' => '2026-10-15 14:00:00'],
            ['from' => 'ITEM_RECEIVED', 'to' => 'INSPECTION', 'note' => 'Inspection completed: DEFECTIVE', 'at' => '2026-10-15 15:30:00'],
            ['from' => 'INSPECTION', 'to' => 'COMPLETED', 'note' => 'Replacement item delivered to customer', 'at' => '2026-10-16 18:00:00'],
        ],
    ],
    [
        'rma' => 'RMA-1006',
        'order_no' => 'ORD-1040',
        'customer' => ['name' => 'Suresh', 'phone' => '98421 55678', 'addr' => '3/10, Gandhi Road, Salem - 636001'],
        'item' => ['name' => 'T-Shirt', 'qty' => 3, 'unit_price' => 299.00, 'img' => '/products/tshirt.jpg'],
        'reason' => 'Not fitting',
        'return_type' => 'REFUND',
        'status' => 'REJECTED',
        'rejection_reason' => 'Return window expired (ordered > 30 days ago)',
        'date' => '2026-10-13 15:45:00',
        'history' => [
            ['from' => null, 'to' => 'PENDING_REVIEW', 'note' => 'Return requested: Not fitting', 'at' => '2026-10-13 15:45:00'],
            ['from' => 'PENDING_REVIEW', 'to' => 'REJECTED', 'note' => 'Rejected: Return policy window (7 days) expired', 'at' => '2026-10-14 09:10:00'],
        ],
    ],
];

foreach ($sampleReturns as $idx => $sr) {
    // Check if return_no already exists
    $chk = $pdo->prepare("SELECT id FROM sale_returns WHERE return_no = :rno");
    $chk->execute(['rno' => $sr['rma']]);
    if ($chk->fetchColumn()) {
        echo "Skip existing {$sr['rma']}\n";
        continue;
    }

    $cid = getOrCreateCustomer($pdo, $sr['customer']['name'], $sr['customer']['phone']);
    $v = getVariant($pdo, $idx);

    // Create Order if not exists
    $orderStmt = $pdo->prepare("SELECT id FROM orders WHERE order_no = :ono");
    $orderStmt->execute(['ono' => $sr['order_no']]);
    $orderId = $orderStmt->fetchColumn();

    $itemTotal = $sr['item']['qty'] * $sr['item']['unit_price'];

    if (!$orderId) {
        $pdo->prepare(
            "INSERT INTO orders (order_no, customer_id, status, payment_status, subtotal, grand_total, shipping_name, shipping_phone, shipping_line1, shipping_city_district, shipping_state, shipping_pincode, placed_at)
             VALUES (:ono, :cid, 'DELIVERED', 'PAID', :sub, :tot, :name, :phone, :addr, 'Tenkasi', 'Tamil Nadu', '627811', :dt)"
        )->execute([
            'ono' => $sr['order_no'],
            'cid' => $cid,
            'sub' => $itemTotal,
            'tot' => $itemTotal,
            'name' => $sr['customer']['name'],
            'phone' => $sr['customer']['phone'],
            'addr' => $sr['customer']['addr'],
            'dt' => $sr['date'],
        ]);
        $orderId = (int) $pdo->lastInsertId();

        $pdo->prepare(
            "INSERT INTO order_items (order_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total)
             VALUES (:oid, :pid, :vid, :name, :sku, :qty, :mrp, :price, :tot)"
        )->execute([
            'oid' => $orderId,
            'pid' => $v['product_id'],
            'vid' => $v['variant_id'],
            'name' => $sr['item']['name'],
            'sku' => $v['sku'],
            'qty' => $sr['item']['qty'],
            'mrp' => $sr['item']['unit_price'] * 1.2,
            'price' => $sr['item']['unit_price'],
            'tot' => $itemTotal,
        ]);
        $orderItemId = (int) $pdo->lastInsertId();
    } else {
        $orderId = (int) $orderId;
        $orderItemId = (int) $pdo->query("SELECT id FROM order_items WHERE order_id = {$orderId} LIMIT 1")->fetchColumn();
    }

    // Insert sale_returns
    $pdo->prepare(
        "INSERT INTO sale_returns (
            return_no, order_id, customer_id, status, return_type,
            total_amount, refund_amount, refund_status, reason, notes,
            pickup_partner, pickup_tracking_id, rejection_reason, created_by, created_at, updated_at
        ) VALUES (
            :rno, :oid, :cid, :status, :type,
            :tot, :ref_amt, :ref_st, :reason, :notes,
            :pickup_partner, :pickup_tracking_id, :rej_reason, :by, :created_at, :updated_at
        )"
    )->execute([
        'rno' => $sr['rma'],
        'oid' => $orderId,
        'cid' => $cid,
        'status' => $sr['status'],
        'type' => $sr['return_type'],
        'tot' => $itemTotal,
        'ref_amt' => ($sr['return_type'] === 'REFUND') ? $itemTotal : 0.00,
        'ref_st' => ($sr['return_type'] === 'REFUND') ? (($sr['status'] === 'COMPLETED') ? 'REFUNDED' : 'PENDING') : 'NOT_APPLICABLE',
        'reason' => $sr['reason'],
        'notes' => $sr['reason'],
        'pickup_partner' => $sr['pickup_partner'] ?? null,
        'pickup_tracking_id' => $sr['pickup_tracking_id'] ?? null,
        'rej_reason' => $sr['rejection_reason'] ?? null,
        'by' => $adminId,
        'created_at' => $sr['date'],
        'updated_at' => $sr['date'],
    ]);
    $returnId = (int) $pdo->lastInsertId();

    // Insert item
    $pdo->prepare(
        "INSERT INTO sale_return_items (
            return_id, variant_id, order_item_id, product_id, product_name_snapshot,
            sku_snapshot, qty, unit_price, total_amount, created_at
        ) VALUES (
            :rid, :vid, :oiid, :pid, :name,
            :sku, :qty, :price, :tot, :dt
        )"
    )->execute([
        'rid' => $returnId,
        'vid' => $v['variant_id'],
        'oiid' => $orderItemId,
        'pid' => $v['product_id'],
        'name' => $sr['item']['name'],
        'sku' => $v['sku'],
        'qty' => $sr['item']['qty'],
        'price' => $sr['item']['unit_price'],
        'tot' => $itemTotal,
        'dt' => $sr['date'],
    ]);

    // Insert history
    foreach ($sr['history'] as $h) {
        $pdo->prepare(
            "INSERT INTO sale_return_status_history (
                return_id, from_status, to_status, source, note, actor_user_id, created_at
            ) VALUES (
                :rid, :from_st, :to_st, 'ADMIN', :note, :by, :dt
            )"
        )->execute([
            'rid' => $returnId,
            'from_st' => $h['from'],
            'to_st' => $h['to'],
            'note' => $h['note'],
            'by' => $adminId,
            'dt' => $h['at'],
        ]);
    }

    echo "Seeded {$sr['rma']} ({$sr['status']})\n";
}

echo "Returns seeding complete!\n";
