<?php

declare(strict_types=1);

require dirname(__DIR__) . '/backend/vendor/autoload.php';
require dirname(__DIR__) . '/backend/config/database.php';

use App\Services\DeliveryService;

$pdo = db();
$dbName = $pdo->query('SELECT DATABASE()')->fetchColumn();
echo "Seeding deliveries into database: {$dbName}\n";

$delCount = (int) $pdo->query('SELECT COUNT(*) FROM deliveries')->fetchColumn();
if ($delCount > 0) {
    echo "Deliveries already exist ({$delCount} deliveries found). Skipping seed.\n";
    exit(0);
}

// 1. Ensure at least one customer exists
$customerStmt = $pdo->query("SELECT id, name, phone FROM customers WHERE status = 'ACTIVE' LIMIT 2");
$customers = $customerStmt->fetchAll();

if (count($customers) === 0) {
    $pdo->exec("INSERT INTO customers (name, phone, email, status, customer_type) VALUES
        ('Aravind Swamy', '9840123456', 'aravind@example.com', 'ACTIVE', 'RETAIL'),
        ('Priya Dharshini', '9840654321', 'priya@example.com', 'ACTIVE', 'RETAIL'),
        ('Mohamed Rizwan', '9840987654', 'rizwan@example.com', 'ACTIVE', 'RETAIL')
    ");
    $customers = $pdo->query("SELECT id, name, phone FROM customers WHERE status = 'ACTIVE' LIMIT 3")->fetchAll();
}

// 2. Fetch some products/variants
$prodStmt = $pdo->query(
    "SELECT p.id AS product_id, p.name AS product_name, pv.id AS variant_id, pv.sku, pv.retail_price, pv.mrp
     FROM products p
     JOIN product_variants pv ON pv.product_id = p.id
     WHERE p.is_active = 1 AND p.deleted_at IS NULL
     LIMIT 5"
);
$products = $prodStmt->fetchAll();
if (count($products) === 0) {
    echo "No active products found to seed orders.\n";
    exit(0);
}

// 3. Ensure drivers exist
$driverStmt = $pdo->query("SELECT id, name, email FROM users WHERE role_id = (SELECT id FROM roles WHERE code = 'DRIVER')");
$drivers = $driverStmt->fetchAll();
$driver1 = $drivers[0] ?? null;
$driver2 = $drivers[1] ?? $driver1;

$deliverySvc = new DeliveryService($pdo);

$demoOrders = [
    [
        'order_no' => 'ORD-2026-1001',
        'customer' => $customers[0],
        'address' => [
            'name' => 'Aravind Swamy',
            'phone' => '9840123456',
            'line1' => 'Flat 4B, Emerald Heights, Anna Nagar',
            'line2' => 'Near Roundtana',
            'city' => 'Chennai',
            'state' => 'Tamil Nadu',
            'pincode' => '600040',
        ],
        'payment_status' => 'PAID',
        'channel' => 'COURIER',
        'courier' => 'Blue Dart Express',
        'awb' => 'BD-8849102941',
        'status' => 'IN_TRANSIT',
        'history' => [
            ['PENDING', 'ASSIGNED', 'Assigned to Blue Dart Express'],
            ['ASSIGNED', 'PICKED_UP', 'Package picked up from Chennai Hub'],
            ['PICKED_UP', 'IN_TRANSIT', 'Shipment in transit via Air Express'],
        ],
        'eta' => date('Y-m-d', strtotime('+1 day')),
    ],
    [
        'order_no' => 'ORD-2026-1002',
        'customer' => $customers[1] ?? $customers[0],
        'address' => [
            'name' => 'Priya Dharshini',
            'phone' => '9840654321',
            'line1' => 'No. 18, 2nd Cross Street, Gandhi Nagar',
            'line2' => 'Adyar',
            'city' => 'Chennai',
            'state' => 'Tamil Nadu',
            'pincode' => '600020',
        ],
        'payment_status' => 'PENDING', // COD
        'channel' => 'OWN_DELIVERY',
        'driver' => $driver1,
        'driver_name' => $driver1['name'] ?? 'Murugan K',
        'driver_phone' => '9940123456',
        'vehicle_no' => 'TN-09-CB-4412',
        'status' => 'OUT_FOR_DELIVERY',
        'history' => [
            ['PENDING', 'ASSIGNED', 'Assigned to Fleet Driver Murugan K'],
            ['ASSIGNED', 'PICKED_UP', 'Picked up from local dispatch store'],
            ['PICKED_UP', 'OUT_FOR_DELIVERY', 'Driver out for delivery in Adyar zone'],
        ],
        'eta' => date('Y-m-d'),
    ],
    [
        'order_no' => 'ORD-2026-1003',
        'customer' => $customers[0],
        'address' => [
            'name' => 'Ramesh Babu',
            'phone' => '9840998877',
            'line1' => '72/3 West Boulevard',
            'line2' => 'Mylapore',
            'city' => 'Chennai',
            'state' => 'Tamil Nadu',
            'pincode' => '600004',
        ],
        'payment_status' => 'PAID',
        'channel' => 'COURIER',
        'courier' => 'Delhivery Logistics',
        'awb' => 'DEL-9918237462',
        'status' => 'DELIVERED',
        'history' => [
            ['PENDING', 'ASSIGNED', 'Booked with Delhivery'],
            ['ASSIGNED', 'PICKED_UP', 'Package collected by Delhivery hub'],
            ['PICKED_UP', 'IN_TRANSIT', 'In transit to Mylapore facility'],
            ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'Out for delivery with courier agent'],
            ['OUT_FOR_DELIVERY', 'DELIVERED', 'Delivered and signed by recipient'],
        ],
        'eta' => date('Y-m-d'),
        'delivered_today' => true,
    ],
    [
        'order_no' => 'ORD-2026-1004',
        'customer' => $customers[1] ?? $customers[0],
        'address' => [
            'name' => 'Sangeetha R',
            'phone' => '9840332211',
            'line1' => 'Block C, Silver Springs, OMR',
            'line2' => 'Sholinganallur',
            'city' => 'Chennai',
            'state' => 'Tamil Nadu',
            'pincode' => '600119',
        ],
        'payment_status' => 'PENDING', // COD
        'channel' => 'OWN_DELIVERY',
        'driver' => $driver2,
        'driver_name' => $driver2['name'] ?? 'Suresh V',
        'driver_phone' => '9940887766',
        'vehicle_no' => 'TN-14-AX-8910',
        'status' => 'ASSIGNED',
        'history' => [
            ['PENDING', 'ASSIGNED', 'Assigned to Fleet Driver Suresh V for morning slot'],
        ],
        'eta' => date('Y-m-d', strtotime('+1 day')),
    ],
    [
        'order_no' => 'ORD-2026-1005',
        'customer' => $customers[0],
        'address' => [
            'name' => 'Kishore Kumar',
            'phone' => '9840445566',
            'line1' => 'Plot 10, Lake View Road',
            'line2' => 'Velachery',
            'city' => 'Chennai',
            'state' => 'Tamil Nadu',
            'pincode' => '600042',
        ],
        'payment_status' => 'PAID',
        'channel' => 'COURIER',
        'courier' => 'DTDC Express',
        'awb' => 'DTDC-7729103945',
        'status' => 'PENDING',
        'history' => [
            ['PENDING', 'PENDING', 'Order packed and manifest generated, awaiting pickup'],
        ],
        'eta' => date('Y-m-d', strtotime('+3 days')),
    ],
    [
        'order_no' => 'ORD-2026-1006',
        'customer' => $customers[1] ?? $customers[0],
        'address' => [
            'name' => 'Deepak Raj',
            'phone' => '9840556677',
            'line1' => '54 Mount Road, Guindy',
            'line2' => 'Opposite Metro Station',
            'city' => 'Chennai',
            'state' => 'Tamil Nadu',
            'pincode' => '600032',
        ],
        'payment_status' => 'PENDING', // COD
        'channel' => 'COURIER',
        'courier' => 'Shadowfax Courier',
        'awb' => 'SF-6618294710',
        'status' => 'FAILED',
        'failure_reason' => 'Customer unavailable at delivery address during 3 attempts',
        'history' => [
            ['PENDING', 'ASSIGNED', 'Assigned to Shadowfax Courier'],
            ['ASSIGNED', 'PICKED_UP', 'Picked up by courier agent'],
            ['PICKED_UP', 'OUT_FOR_DELIVERY', 'Out for delivery'],
            ['OUT_FOR_DELIVERY', 'FAILED', 'Delivery attempt failed: Customer phone switched off'],
        ],
        'eta' => date('Y-m-d', strtotime('-1 day')),
    ],
];

foreach ($demoOrders as $idx => $spec) {
    $item = $products[$idx % count($products)];
    $qty = ($idx % 3) + 1;
    $unitPrice = (float) ($item['retail_price'] ?: $item['price'] ?: 299.00);
    $subtotal = $unitPrice * $qty;
    $grandTotal = $subtotal;

    // Create order
    $pdo->prepare(
        "INSERT INTO orders (
            order_no, customer_id, status, payment_status, subtotal, grand_total,
            shipping_name, shipping_phone, shipping_line1, shipping_line2,
            shipping_city_district, shipping_state, shipping_pincode, placed_at
        ) VALUES (
            :order_no, :cid, 'CONFIRMED', :payment_status, :subtotal, :grand_total,
            :name, :phone, :line1, :line2, :city, :state, :pincode, :placed_at
        )"
    )->execute([
        'order_no' => $spec['order_no'],
        'cid' => $spec['customer']['id'],
        'payment_status' => $spec['payment_status'],
        'subtotal' => $subtotal,
        'grand_total' => $grandTotal,
        'name' => $spec['address']['name'],
        'phone' => $spec['address']['phone'],
        'line1' => $spec['address']['line1'],
        'line2' => $spec['address']['line2'],
        'city' => $spec['address']['city'],
        'state' => $spec['address']['state'],
        'pincode' => $spec['address']['pincode'],
        'placed_at' => date('Y-m-d H:i:s', strtotime('-' . ($idx + 1) . ' days')),
    ]);
    $orderId = (int) $pdo->lastInsertId();

    // Order item
    $pdo->prepare(
        "INSERT INTO order_items (
            order_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total
        ) VALUES (
            :oid, :pid, :vid, :pname, :sku, :qty, :mrp, :unit_price, :line_total
        )"
    )->execute([
        'oid' => $orderId,
        'pid' => $item['product_id'],
        'vid' => $item['variant_id'],
        'pname' => $item['product_name'],
        'sku' => $item['sku'] ?: 'SKU-DEMO-' . $idx,
        'qty' => $qty,
        'mrp' => $unitPrice * 1.2,
        'unit_price' => $unitPrice,
        'line_total' => $subtotal,
    ]);

    // Create delivery
    $codAmount = ($spec['payment_status'] === 'PENDING') ? $grandTotal : 0.00;
    $codStatus = ($spec['payment_status'] === 'PENDING') ? 'PENDING' : 'NOT_APPLICABLE';

    $pdo->prepare(
        "INSERT INTO deliveries (
            order_id, provider, delivery_channel, courier, courier_partner,
            driver_id, driver_name, driver_phone, vehicle_no,
            awb, tracking_url, status, expected_delivery_date,
            package_weight_kg, package_dimensions, package_items_count,
            cod_amount, cod_status, failure_reason,
            delivered_at, created_at, updated_at
        ) VALUES (
            :order_id, 'MOCK', :channel, :courier, :courier_partner,
            :driver_id, :driver_name, :driver_phone, :vehicle_no,
            :awb, :tracking_url, :status, :eta,
            :weight, '22x15x8 cm', :items_count,
            :cod_amount, :cod_status, :failure_reason,
            :delivered_at, :created_at, :updated_at
        )"
    )->execute([
        'order_id' => $orderId,
        'channel' => $spec['channel'],
        'courier' => $spec['courier'] ?? null,
        'courier_partner' => $spec['courier'] ?? null,
        'driver_id' => $spec['driver']['id'] ?? null,
        'driver_name' => $spec['driver_name'] ?? null,
        'driver_phone' => $spec['driver_phone'] ?? null,
        'vehicle_no' => $spec['vehicle_no'] ?? null,
        'awb' => $spec['awb'] ?? ('AWB' . strtoupper(bin2hex(random_bytes(4)))),
        'tracking_url' => 'https://track.example.test/' . ($spec['awb'] ?? 'AWB'),
        'status' => $spec['status'],
        'eta' => $spec['eta'],
        'weight' => 0.5 + ($idx * 0.3),
        'items_count' => $qty,
        'cod_amount' => $codAmount,
        'cod_status' => $codStatus,
        'failure_reason' => $spec['failure_reason'] ?? null,
        'delivered_at' => !empty($spec['delivered_today']) ? date('Y-m-d H:i:s') : null,
        'created_at' => date('Y-m-d H:i:s', strtotime('-' . ($idx + 1) . ' days')),
        'updated_at' => date('Y-m-d H:i:s'),
    ]);
    $deliveryId = (int) $pdo->lastInsertId();

    // Insert history events
    foreach ($spec['history'] as $hIdx => $h) {
        $pdo->prepare(
            "INSERT INTO delivery_status_history (delivery_id, from_status, to_status, source, note, created_at)
             VALUES (:id, :from_status, :to_status, 'ADMIN', :note, :created_at)"
        )->execute([
            'id' => $deliveryId,
            'from_status' => $h[0],
            'to_status' => $h[1],
            'note' => $h[2],
            'created_at' => date('Y-m-d H:i:s', strtotime('-' . ($idx + 1) . ' days +' . ($hIdx * 2) . ' hours')),
        ]);
    }

    echo "Created demo order {$spec['order_no']} -> Delivery #{$deliveryId} ({$spec['status']}, {$spec['channel']})\n";
}

echo "Deliveries seed complete!\n";
