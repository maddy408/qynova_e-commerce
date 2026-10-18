<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

putenv('APP_ENV=testing');
$_ENV['APP_ENV'] = 'testing';
require dirname(__DIR__) . '/config/database.php';

use App\Services\DeliveryService;

echo "=== DELIVERIES MANAGEMENT PRODUCTION TEST SUITE ===\n";

$pdo = db();
$currentDb = $pdo->query('SELECT DATABASE()')->fetchColumn();
echo "✓ Connected safely to test database: {$currentDb}\n";
assert($currentDb === 'unified_pos_test', "Must run on test database!");

$deliverySvc = new DeliveryService($pdo);

// 1. Test Summary
echo "-> Testing summary metrics...\n";
$summary = $deliverySvc->summary();
assert(isset($summary['ready_to_dispatch']['count']), "Summary must have ready_to_dispatch count");
assert(isset($summary['in_transit']['count']), "Summary must have in_transit count");
assert(isset($summary['delivered_today']['count']), "Summary must have delivered_today count");
assert(isset($summary['cod_pending']['count']), "Summary must have cod_pending count");
echo "✓ Summary metrics validated: " . json_encode($summary) . "\n";

// 2. Test Drivers List
echo "-> Testing drivers list...\n";
$drivers = $deliverySvc->getDrivers();
assert(is_array($drivers), "Drivers must be an array");
assert(count($drivers) > 0, "At least one driver/staff must exist");
echo "✓ Drivers list verified, found: " . count($drivers) . " driver(s)\n";

// 3. Create test customer and test order
$uid = time() . '-' . rand(100, 999);
$phone = '98' . rand(10000000, 99999999);
$pdo->exec("INSERT INTO customers (name, phone, status, customer_type) VALUES ('Delivery Test Customer', '{$phone}', 'ACTIVE', 'RETAIL')");
$customerId = (int) $pdo->lastInsertId();

// Create prepaid order
$pdo->prepare(
    "INSERT INTO orders (
        order_no, customer_id, status, payment_status, subtotal, grand_total,
        shipping_name, shipping_phone, shipping_line1, shipping_city_district, shipping_state, shipping_pincode
    ) VALUES (
        :order_no, :cid, 'CONFIRMED', 'PAID', 500.00, 500.00,
        'Ravi K', '9876543210', '123 Main Road', 'Chennai', 'Tamil Nadu', '600001'
    )"
)->execute([
    'order_no' => "ORD-DEL-PREPAID-{$uid}",
    'cid' => $customerId,
]);
$prepaidOrderId = (int) $pdo->lastInsertId();

// Create order item
$pdo->prepare(
    "INSERT INTO order_items (
        order_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total
    ) VALUES (
        :oid, 1, 1, 'Organic Cotton T-Shirt', 'SKU-TEE-01', 2, 300.00, 250.00, 500.00
    )"
)->execute(['oid' => $prepaidOrderId]);

// Create COD order
$pdo->prepare(
    "INSERT INTO orders (
        order_no, customer_id, status, payment_status, subtotal, grand_total,
        shipping_name, shipping_phone, shipping_line1, shipping_city_district, shipping_state, shipping_pincode
    ) VALUES (
        :order_no, :cid, 'CONFIRMED', 'PENDING', 750.00, 750.00,
        'Karthik S', '9876543211', '45 Gandhi Street', 'Coimbatore', 'Tamil Nadu', '641001'
    )"
)->execute([
    'order_no' => "ORD-DEL-COD-{$uid}",
    'cid' => $customerId,
]);
$codOrderId = (int) $pdo->lastInsertId();

$pdo->prepare(
    "INSERT INTO order_items (
        order_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total
    ) VALUES (
        :oid, 1, 1, 'Leather Wallet', 'SKU-WAL-01', 1, 999.00, 750.00, 750.00
    )"
)->execute(['oid' => $codOrderId]);

// 4. Test Eligible Orders
echo "-> Testing eligible orders...\n";
$eligible = $deliverySvc->getEligibleOrders();
$foundPrepaid = false;
$foundCod = false;
foreach ($eligible as $eo) {
    if ((int) $eo['id'] === $prepaidOrderId) $foundPrepaid = true;
    if ((int) $eo['id'] === $codOrderId) $foundCod = true;
}
assert($foundPrepaid, "Prepaid order must be eligible for delivery creation");
assert($foundCod, "COD order must be eligible for delivery creation");
echo "✓ Eligible orders verified\n";

// 5. Test Delivery Creation: Courier
echo "-> Testing Courier delivery creation for prepaid order...\n";
$deliveryId1 = $deliverySvc->createForOrder($prepaidOrderId, [
    'delivery_channel' => 'COURIER',
    'courier_partner' => 'Blue Dart Express',
    'awb' => "BD-{$uid}",
    'expected_delivery_date' => date('Y-m-d', strtotime('+2 days')),
    'delivery_notes' => 'Handle with care',
    'package_weight_kg' => 0.85,
    'package_dimensions' => '25x20x5 cm',
]);
assert($deliveryId1 > 0, "Delivery ID must be positive");

$d1 = $deliverySvc->find($deliveryId1);
assert($d1['delivery_channel'] === 'COURIER', "Channel must be COURIER");
assert($d1['courier_partner'] === 'Blue Dart Express', "Courier partner must match");
assert($d1['awb'] === "BD-{$uid}", "AWB must match");
assert($d1['cod_status'] === 'NOT_APPLICABLE', "Prepaid order COD status must be NOT_APPLICABLE");
assert((float) $d1['cod_amount'] === 0.0, "Prepaid order COD amount must be 0");
assert($d1['status'] === 'PENDING', "Status must be PENDING");
assert(count($d1['items']) === 1, "Must contain ordered items");
assert(count($d1['history']) === 1, "Must contain initial tracking event");
echo "✓ Courier delivery created successfully: #{$deliveryId1}\n";

// 6. Test Delivery Creation: Own Delivery for COD order
echo "-> Testing Own Delivery fleet creation for COD order...\n";
$driver = $drivers[0];
$deliveryId2 = $deliverySvc->createForOrder($codOrderId, [
    'delivery_channel' => 'OWN_DELIVERY',
    'driver_id' => $driver['id'],
    'driver_name' => $driver['name'],
    'driver_phone' => '9988776655',
    'vehicle_no' => 'TN-01-AB-1234',
    'expected_delivery_date' => date('Y-m-d', strtotime('+1 day')),
    'package_weight_kg' => 1.20,
]);
assert($deliveryId2 > 0, "Delivery ID must be positive");

$d2 = $deliverySvc->find($deliveryId2);
assert($d2['delivery_channel'] === 'OWN_DELIVERY', "Channel must be OWN_DELIVERY");
assert($d2['driver_name'] === $driver['name'], "Driver name must match");
assert($d2['cod_status'] === 'PENDING', "COD order status must be PENDING");
assert((float) $d2['cod_amount'] === 750.00, "COD amount must be 750.00");
echo "✓ Own fleet delivery created successfully: #{$deliveryId2}\n";

// 7. Test Duplicate Prevention
echo "-> Testing duplicate delivery creation rejection...\n";
try {
    $deliverySvc->createForOrder($prepaidOrderId, ['courier_partner' => 'DTDC']);
    assert(false, "Should have thrown duplicate delivery exception");
} catch (RuntimeException $e) {
    echo "✓ Correctly rejected duplicate delivery: {$e->getMessage()}\n";
}

// 8. Test List Deliveries & Tab Filtering
echo "-> Testing list deliveries with tabs and search...\n";
$listAll = $deliverySvc->list(['tab' => 'all', 'limit' => 10]);
assert($listAll['total'] >= 2, "Total must be at least 2");
assert(isset($listAll['tab_counts']['own_delivery']), "Tab counts must include own_delivery");

$listOwn = $deliverySvc->list(['tab' => 'own_delivery']);
foreach ($listOwn['items'] as $item) {
    assert($item['delivery_channel'] === 'OWN_DELIVERY', "All items in own_delivery tab must be OWN_DELIVERY");
}

$listCourier = $deliverySvc->list(['tab' => 'courier']);
foreach ($listCourier['items'] as $item) {
    assert($item['delivery_channel'] === 'COURIER', "All items in courier tab must be COURIER");
}
echo "✓ List & tab filters verified\n";

// 9. Test State Machine Transitions
echo "-> Testing State Machine transitions...\n";
// D1: PENDING -> ASSIGNED -> PICKED_UP -> OUT_FOR_DELIVERY -> DELIVERED
$up0 = $deliverySvc->updateStatus($deliveryId1, 'ASSIGNED', 'ADMIN', 'Assigned to courier partner', 1);
assert($up0['status'] === 'ASSIGNED', "Status must be ASSIGNED");

$up1 = $deliverySvc->updateStatus($deliveryId1, 'PICKED_UP', 'ADMIN', 'Dispatched from warehouse', 1);
assert($up1['status'] === 'PICKED_UP', "Status must be PICKED_UP");

$up2 = $deliverySvc->updateStatus($deliveryId1, 'OUT_FOR_DELIVERY', 'ADMIN', 'Van out for delivery', 1);
assert($up2['status'] === 'OUT_FOR_DELIVERY', "Status must be OUT_FOR_DELIVERY");

$up3 = $deliverySvc->updateStatus($deliveryId1, 'DELIVERED', 'ADMIN', 'Package handed to customer', 1);
assert($up3['status'] === 'DELIVERED', "Status must be DELIVERED");
assert(!empty($up3['delivered_at']), "delivered_at must be populated");

// Verify invalid transition rejection (DELIVERED -> PICKED_UP)
try {
    $deliverySvc->updateStatus($deliveryId1, 'PICKED_UP', 'ADMIN', 'Invalid', 1);
    assert(false, "Should have rejected illegal transition from DELIVERED to PICKED_UP");
} catch (RuntimeException $e) {
    echo "✓ Correctly rejected invalid state transition: {$e->getMessage()}\n";
}

// 10. Test Failed Delivery & Reason Requirement
echo "-> Testing Failed Delivery transition with reason on D2...\n";
$d2Up1 = $deliverySvc->updateStatus($deliveryId2, 'PICKED_UP', 'ADMIN', 'Driver picked up', 1);
$d2Up2 = $deliverySvc->updateStatus($deliveryId2, 'OUT_FOR_DELIVERY', 'ADMIN', 'Driver out for delivery', 1);

try {
    // Missing reason
    $deliverySvc->updateStatus($deliveryId2, 'FAILED', 'ADMIN', null, 1, null);
    assert(false, "Should have required failure reason");
} catch (RuntimeException $e) {
    echo "✓ Correctly required failure reason: {$e->getMessage()}\n";
}

$d2Failed = $deliverySvc->updateStatus($deliveryId2, 'FAILED', 'ADMIN', 'Customer phone unreachable', 1, 'Customer phone unreachable');
assert($d2Failed['status'] === 'FAILED', "Status must be FAILED");
assert($d2Failed['failure_reason'] === 'Customer phone unreachable', "Failure reason must match");
echo "✓ Failed delivery state handled correctly\n";

// Reattempt delivery
$d2Reattempt = $deliverySvc->updateStatus($deliveryId2, 'OUT_FOR_DELIVERY', 'ADMIN', 'Reattempting delivery', 1);
assert($d2Reattempt['status'] === 'OUT_FOR_DELIVERY', "Status must be OUT_FOR_DELIVERY again");

$d2Delivered = $deliverySvc->updateStatus($deliveryId2, 'DELIVERED', 'ADMIN', 'Delivered upon reattempt', 1);
assert($d2Delivered['status'] === 'DELIVERED', "Status must be DELIVERED");

// 11. Test COD Collection & Financial Reconciliation
echo "-> Testing COD Collection on D2...\n";
assert($d2Delivered['cod_status'] === 'PENDING', "COD status must be PENDING before collection");

$d2Collected = $deliverySvc->collectCod($deliveryId2, 750.00, 1, 'Cash collected by driver');
assert($d2Collected['cod_status'] === 'COLLECTED', "COD status must be COLLECTED");
assert((float) $d2Collected['cod_collected_amount'] === 750.00, "Collected amount must match");

// Verify order is now marked PAID
$codOrderStmt = $pdo->prepare('SELECT payment_status FROM orders WHERE id = :id');
$codOrderStmt->execute(['id' => $codOrderId]);
assert($codOrderStmt->fetchColumn() === 'PAID', "Order payment status must be updated to PAID after COD collection");

// Verify finance transaction was recorded
$ftStmt = $pdo->prepare("SELECT * FROM finance_transactions WHERE reference_no = :ref AND category = 'COD_COLLECTION'");
$ftStmt->execute(['ref' => "ORD-DEL-COD-{$uid}"]);
$ft = $ftStmt->fetch();
assert($ft !== false, "Finance transaction must be created for COD collection");
assert((float) $ft['amount'] === 750.00, "Finance transaction amount must match");
echo "✓ COD Collection recorded and financial ledger reconciled\n";

// 12. Test Customer Tracking Endpoint Data
echo "-> Testing Customer tracking endpoint findByOrder...\n";
$customerDel = $deliverySvc->findByOrder($codOrderId);
assert($customerDel !== null, "Customer delivery must be found");
assert($customerDel['status'] === 'DELIVERED', "Customer sees authoritative status");
assert(count($customerDel['history']) >= 5, "Customer tracking timeline contains full chronological events");
echo "✓ Customer synchronization verified\n";

echo "\n============================================================\n";
echo "✓ ALL DELIVERIES MANAGEMENT BACKEND TESTS PASSED 100%!\n";
echo "============================================================\n";
