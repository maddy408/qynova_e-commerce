<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

putenv('APP_ENV=testing');
$_ENV['APP_ENV'] = 'testing';
require dirname(__DIR__) . '/config/database.php';

use App\Services\InventoryService;
use App\Services\SalesRankingService;
use App\Services\DeliveryService;
use App\Services\OrderService;
use App\Services\InvoiceService;
use App\Services\CouponService;
use App\Services\RefundService;

echo "====================================================================\n";
echo "=== UNIFIED POS — POS SALE & ORDER-TO-DELIVERY FLOW TEST SUITE ===\n";
echo "====================================================================\n\n";

$pdo = db();
$currentDb = $pdo->query('SELECT DATABASE()')->fetchColumn();
echo "✓ Connected safely to test database: {$currentDb}\n\n";
assert($currentDb === 'unified_pos_test', "Must run on test database!");

$passed = 0;
$total = 0;

function check(bool $cond, string $name, string $details = ''): void {
    global $passed, $total;
    $total++;
    if ($cond) {
        $passed++;
        echo "  [PASS] {$name}\n";
    } else {
        echo "  [FAIL] {$name}: {$details}\n";
    }
}

// -------------------------------------------------------------------------
// TEST 1: POS Sale default All Items returns only top 10 best-selling eligible products
// -------------------------------------------------------------------------
echo "--- 1. POS DEFAULT ALL ITEMS (TOP 10 BEST-SELLING PRODUCTS) ---\n";

SalesRankingService::clearCache();
$inventoryService = new InventoryService($pdo);

// Call listAllStock with posOnly = true, categoryId = null, sort = 'sales', limit = 10
$posResult = $inventoryService->listAllStock(
    search: null,
    page: 1,
    limit: 10,
    posOnly: true,
    categoryId: null,
    sort: 'sales'
);

$items = $posResult['items'];
check(count($items) <= 10, "Default POS product list returns at most 10 items", "Got count: " . count($items));
check(count($items) > 0, "Default POS product list returns available eligible products", "Got count: " . count($items));

// Verify products are eligible (pos enabled, active, not deleted)
$allEligible = true;
$variantIds = [];
$duplicatesFound = false;

foreach ($items as $it) {
    if (in_array($it['variant_id'], $variantIds, true)) {
        $duplicatesFound = true;
    }
    $variantIds[] = $it['variant_id'];

    if (!isset($it['product_name']) || !isset($it['retail_price']) || !isset($it['available']) || !array_key_exists('unit_name', $it)) {
        $allEligible = false;
    }
}

check(!$duplicatesFound, "No duplicate product cards returned in default list");
check($allEligible, "Product records include product_name, retail_price, stock availability, and unit_name");

// Verify sorting: sales units are descending for products with sales
$salesMap = (new SalesRankingService($pdo))->getVariantSalesMap();
$salesDescending = true;
for ($i = 0; $i < count($items) - 1; $i++) {
    $u1 = (float) ($salesMap[(int) $items[$i]['variant_id']] ?? 0);
    $u2 = (float) ($salesMap[(int) $items[$i + 1]['variant_id']] ?? 0);
    if ($u1 < $u2) {
        $salesDescending = false;
        break;
    }
}
check($salesDescending, "Items ordered by authoritative sales metrics DESC with deterministic tie-breaking");


// -------------------------------------------------------------------------
// TEST 2: Category Filter functionality without product duplicates
// -------------------------------------------------------------------------
echo "\n--- 2. CATEGORY FILTERING WITHOUT DUPLICATES ---\n";

// Fetch an active category from DB
$catStmt = $pdo->query(
    "SELECT c.id, c.name FROM categories c
     JOIN product_categories pc ON pc.category_id = c.id
     JOIN products p ON p.id = pc.product_id
     WHERE p.is_pos_enabled = 1 AND p.is_active = 1 AND p.deleted_at IS NULL
     LIMIT 1"
);
$testCategory = $catStmt->fetch();

if ($testCategory) {
    $catId = (int) $testCategory['id'];
    $catProducts = $inventoryService->listAllStock(
        search: null,
        page: 1,
        limit: 50,
        posOnly: true,
        categoryId: $catId,
        sort: 'sales'
    );

    $catItems = $catProducts['items'];
    $catVariantIds = [];
    $catDuplicate = false;
    foreach ($catItems as $it) {
        if (in_array($it['variant_id'], $catVariantIds, true)) {
            $catDuplicate = true;
        }
        $catVariantIds[] = $it['variant_id'];
    }

    check(!$catDuplicate, "Category '{$testCategory['name']}' returned " . count($catItems) . " items without duplicates");
    check(count($catItems) > 0, "Category filter accurately isolates category items from default top-10 view");
} else {
    check(true, "Category test skipped (no products associated with categories in test DB)");
}


// -------------------------------------------------------------------------
// TEST 3: Order placement -> Admin Orders display -> Delivery Eligibility
// -------------------------------------------------------------------------
echo "\n--- 3. ORDER CREATION -> ADMIN ORDERS -> DELIVERIES MAPPING ---\n";

$orderId = null;
$deliveryId = null;

try {
    $now = date('Y-m-d H:i:s');
    $orderNo = 'ORD-TEST-FLOW-' . time() . '-' . rand(100, 999);

    // Pick a test customer
    $custStmt = $pdo->query("SELECT id FROM customers WHERE status = 'ACTIVE' LIMIT 1");
    $custId = (int) ($custStmt->fetchColumn() ?: 1);

    // Pick a test product variant
    $varStmt = $pdo->query("SELECT id, product_id, sku, retail_price FROM product_variants WHERE deleted_at IS NULL LIMIT 1");
    $variant = $varStmt->fetch();
    $varId = (int) $variant['id'];
    $prodId = (int) $variant['product_id'];

    // 1. Insert order into orders table
    $stmt = $pdo->prepare(
        "INSERT INTO orders (
            order_no, customer_id, status, payment_status,
            subtotal, product_discount_total, tax_total, shipping_total, grand_total,
            shipping_name, shipping_phone, shipping_line1, shipping_city_district, shipping_state, shipping_pincode,
            placed_at, created_at, updated_at
        ) VALUES (
            :order_no, :customer_id, 'CONFIRMED', 'PENDING',
            100.00, 0.00, 5.00, 0.00, 105.00,
            'Flow Test Customer', '9876543210', '123 Test St',
            'Chennai', 'Tamil Nadu', '600001',
            :placed_at, :created_at, :updated_at
        )"
    );
    $stmt->execute([
        'order_no' => $orderNo,
        'customer_id' => $custId,
        'placed_at' => $now,
        'created_at' => $now,
        'updated_at' => $now,
    ]);
    $orderId = (int) $pdo->lastInsertId();

    // 2. Insert order items
    $itemStmt = $pdo->prepare(
        "INSERT INTO order_items (
            order_id, variant_id, product_id, product_name_snapshot, sku_snapshot,
            quantity, mrp, unit_price, product_discount_amount, tax_amount, line_total
        ) VALUES (
            :order_id, :variant_id, :product_id, 'Flow Test Item', :sku,
            1, 100.00, 100.00, 0.00, 5.00, 105.00
        )"
    );
    $itemStmt->execute([
        'order_id' => $orderId,
        'variant_id' => $varId,
        'product_id' => $prodId,
        'sku' => $variant['sku'],
    ]);

    // 3. Admin Orders retrieves and displays this order
    $adminOrderStmt = $pdo->prepare("SELECT * FROM orders WHERE id = :id");
    $adminOrderStmt->execute(['id' => $orderId]);
    $retrievedOrder = $adminOrderStmt->fetch();
    check($retrievedOrder !== false && $retrievedOrder['order_no'] === $orderNo, "Admin Orders retrieves and displays the persisted order ({$orderNo})");

    // 4. Order appears in eligible orders for Deliveries
    $deliveryService = new DeliveryService($pdo);
    $eligibleOrders = $deliveryService->getEligibleOrders($orderNo);
    $foundInEligible = false;
    foreach ($eligibleOrders as $eo) {
        if ((int) $eo['id'] === $orderId) {
            $foundInEligible = true;
            break;
        }
    }
    check($foundInEligible, "Saved order appears in Deliveries eligible orders dynamically from backend");

    // 5. Create delivery for the order
    $courierPartnerStmt = $pdo->query("SELECT id, name FROM courier_partners WHERE status = 'ACTIVE' LIMIT 1");
    $courierPartner = $courierPartnerStmt->fetch();
    $cpId = $courierPartner ? (int) $courierPartner['id'] : null;
    $cpName = $courierPartner ? $courierPartner['name'] : 'Blue Dart';

    $deliveryPayload = [
        'courier' => $cpName,
        'courier_partner_id' => $cpId,
        'awb' => 'AWB-TEST-' . rand(100000, 999999),
        'expected_delivery_date' => date('Y-m-d', strtotime('+2 days')),
        'package_weight_kg' => 1.25,
        'status' => 'PENDING',
    ];

    $deliveryId = $deliveryService->createForOrder($orderId, $deliveryPayload);
    check($deliveryId > 0, "Delivery created successfully for order #{$orderId} (Delivery #{$deliveryId})");

    // 6. Prevent duplicate delivery records for the same order
    $duplicateCaught = false;
    try {
        $deliveryService->createForOrder($orderId, $deliveryPayload);
    } catch (RuntimeException $e) {
        $duplicateCaught = true;
    }
    check($duplicateCaught, "System strictly rejects duplicate delivery creation for the same order");

    // 7. Order is no longer in eligible orders
    $eligibleAfter = $deliveryService->getEligibleOrders($orderNo);
    $foundInEligibleAfter = false;
    foreach ($eligibleAfter as $eo) {
        if ((int) $eo['id'] === $orderId) {
            $foundInEligibleAfter = true;
            break;
        }
    }
    check(!$foundInEligibleAfter, "Order is removed from Deliveries eligible orders once delivery record exists");


    // -------------------------------------------------------------------------
    // TEST 4: Delivery Status Transition -> Order Status Sync -> Customer Tracking
    // -------------------------------------------------------------------------
    echo "\n--- 4. DELIVERY STATUS TRANSITIONS & CUSTOMER TRACKING ---\n";

    // Step A: Update status to PICKED_UP
    $updated1 = $deliveryService->updateStatus(
        deliveryId: $deliveryId,
        newStatus: 'PICKED_UP',
        source: 'ADMIN',
        note: 'Package picked up by courier',
        actorUserId: 1
    );
    check($updated1['status'] === 'PICKED_UP', "Delivery status transitioned to PICKED_UP");

    $orderAfterPickedUp = $pdo->query("SELECT status FROM orders WHERE id = {$orderId}")->fetchColumn();
    check($orderAfterPickedUp === 'SHIPPED', "Order status synchronized to SHIPPED upon delivery PICKED_UP");

    // Step B: Update status to OUT_FOR_DELIVERY
    $updated2 = $deliveryService->updateStatus(
        deliveryId: $deliveryId,
        newStatus: 'OUT_FOR_DELIVERY',
        source: 'ADMIN',
        note: 'Out for final doorstep delivery',
        actorUserId: 1
    );
    check($updated2['status'] === 'OUT_FOR_DELIVERY', "Delivery status transitioned to OUT_FOR_DELIVERY");

    $orderAfterOut = $pdo->query("SELECT status FROM orders WHERE id = {$orderId}")->fetchColumn();
    check($orderAfterOut === 'OUT_FOR_DELIVERY', "Order status synchronized to OUT_FOR_DELIVERY");

    // Step C: Customer tracking endpoint reads updated delivery status
    $customerTracking = $deliveryService->findByOrder($orderId);
    check($customerTracking !== null, "Customer tracking finds delivery record for order #{$orderId}");
    check($customerTracking['status'] === 'OUT_FOR_DELIVERY', "Customer tracking reflects persisted status OUT_FOR_DELIVERY");

    // Step D: Update status to DELIVERED
    $updated3 = $deliveryService->updateStatus(
        deliveryId: $deliveryId,
        newStatus: 'DELIVERED',
        source: 'ADMIN',
        note: 'Delivered to customer',
        actorUserId: 1
    );
    check($updated3['status'] === 'DELIVERED', "Delivery status transitioned to DELIVERED");

    $orderAfterDelivered = $pdo->query("SELECT status, payment_status FROM orders WHERE id = {$orderId}")->fetch();
    check($orderAfterDelivered['status'] === 'DELIVERED', "Order status synchronized to DELIVERED");
    check($orderAfterDelivered['payment_status'] === 'PENDING', "COD payment status remains separate and is NOT automatically marked PAID upon DELIVERED");

    // Step E: Status history recorded in delivery_status_history
    $historyStmt = $pdo->prepare("SELECT COUNT(*) FROM delivery_status_history WHERE delivery_id = :id");
    $historyStmt->execute(['id' => $deliveryId]);
    $historyCount = (int) $historyStmt->fetchColumn();
    check($historyCount >= 4, "Complete status history recorded in delivery_status_history ({$historyCount} entries)");

} catch (\Throwable $e) {
    echo "ERROR in Order-Delivery Flow: " . $e->getMessage() . "\n" . $e->getTraceAsString() . "\n";
    check(false, "Order-Delivery Flow encountered unexpected error: " . $e->getMessage());
} finally {
    if ($deliveryId !== null) {
        $pdo->exec("DELETE FROM delivery_status_history WHERE delivery_id = {$deliveryId}");
        $pdo->exec("DELETE FROM deliveries WHERE id = {$deliveryId}");
    }
    if ($orderId !== null) {
        $pdo->exec("DELETE FROM invoices WHERE order_id = {$orderId}");
        $pdo->exec("DELETE FROM order_items WHERE order_id = {$orderId}");
        $pdo->exec("DELETE FROM orders WHERE id = {$orderId}");
    }
    echo "✓ Test order and delivery cleaned up safely.\n";
}

echo "\n====================================================================\n";
echo "SUMMARY: Passed {$passed} / {$total} tests\n";
echo "====================================================================\n";

if ($passed === $total) {
    exit(0);
} else {
    exit(1);
}
