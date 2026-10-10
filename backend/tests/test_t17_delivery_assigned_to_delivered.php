<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/test_guard.php';

use App\Services\DeliveryService;
use App\Services\OrderService;
use App\Services\InventoryService;
use App\Services\CouponService;
use App\Services\InvoiceService;
use App\Services\RefundService;
use App\Tests\TestDbGuard;

echo "=== TASK T17: DELIVERY ASSIGNED TO DELIVERED TEST ===\n";

putenv('APP_ENV=testing');
$_ENV['APP_ENV'] = 'testing';
require_once __DIR__ . '/../config/database.php';

$pdo = db();
TestDbGuard::assertTestDatabase($pdo, __FILE__);
echo "✓ Connected safely to test database: " . $pdo->query('SELECT DATABASE()')->fetchColumn() . "\n";

$inventory = new InventoryService($pdo);
$coupons = new CouponService($pdo);
$refunds = new RefundService($pdo);
$invoices = new InvoiceService($pdo, $inventory, $coupons, $refunds);
$orders = new OrderService($pdo, $inventory, $coupons, $invoices, $refunds);
$deliverySvc = new DeliveryService($pdo);

// 1. Prepare or create a test customer and variant in test DB
$custStmt = $pdo->query("SELECT id FROM customers WHERE status = 'ACTIVE' LIMIT 1");
$customerId = (int) $custStmt->fetchColumn();
if (!$customerId) {
    $pdo->exec("INSERT INTO customers (name, phone, status, customer_type) VALUES ('Delivery Test User', '9999888877', 'ACTIVE', 'NORMAL')");
    $customerId = (int) $pdo->lastInsertId();
}

$varStmt = $pdo->query("SELECT id, product_id, sku, mrp, retail_price FROM product_variants WHERE status = 'ACTIVE' LIMIT 1");
$variant = $varStmt->fetch();
if (!$variant) {
    throw new RuntimeException("No active variant found in test DB");
}

// 2. Create a fresh test order directly in PAID status to create delivery for
$orderNo = 'ORD-T17-' . time() . '-' . random_int(100, 999);
$pdo->beginTransaction();
$insOrder = $pdo->prepare("
    INSERT INTO orders (
        order_no, customer_id, status, payment_status,
        subtotal, coupon_discount_total, referral_discount_total,
        tax_total, shipping_total, grand_total,
        shipping_name, shipping_phone, shipping_line1, shipping_city_district, shipping_state, shipping_pincode,
        created_at
    ) VALUES (
        :order_no, :customer_id, 'CONFIRMED', 'PAID',
        :subtotal, 0, 0, :tax_total, 50.00, :grand_total,
        'Test Customer', '9876543210', '123 Main Road', 'Chennai', 'Tamil Nadu', '600001',
        NOW()
    )
");
$subtotal = (float) $variant['retail_price'];
$taxTotal = round($subtotal * 0.18, 2);
$grandTotal = $subtotal + $taxTotal + 50.00;

$insOrder->execute([
    'order_no' => $orderNo,
    'customer_id' => $customerId,
    'subtotal' => $subtotal,
    'tax_total' => $taxTotal,
    'grand_total' => $grandTotal,
]);
$orderId = (int) $pdo->lastInsertId();

// Insert order item
$insItem = $pdo->prepare("
    INSERT INTO order_items (
        order_id, product_id, variant_id, sku_snapshot,
        product_name_snapshot, variant_label_snapshot,
        quantity, mrp, unit_price, product_discount_amount,
        tax_amount, line_total
    ) VALUES (
        :order_id, :product_id, :variant_id, :sku,
        'Test Delivery Product', 'Default Variant',
        1, :mrp, :unit_price, 0, :tax_amount, :line_total
    )
");
$insItem->execute([
    'order_id' => $orderId,
    'product_id' => $variant['product_id'],
    'variant_id' => $variant['id'],
    'sku' => $variant['sku'],
    'mrp' => $variant['mrp'],
    'unit_price' => $subtotal,
    'tax_amount' => $taxTotal,
    'line_total' => $subtotal + $taxTotal,
]);
$pdo->commit();
echo "✓ Created test paid order #{$orderId} ({$orderNo})\n";

// 3. Create delivery for order
$deliveryId = $deliverySvc->createForOrder($orderId, 'TestExpress Courier', date('Y-m-d', strtotime('+3 days')));
echo "✓ Created delivery #{$deliveryId} with status PENDING\n";

$delRow = $deliverySvc->find($deliveryId);
assert($delRow['status'] === 'PENDING', "Initial status must be PENDING");

// 4. Test Transition: PENDING -> ASSIGNED
echo "-> Testing status update: PENDING -> ASSIGNED\n";
$updated1 = $deliverySvc->updateStatus($deliveryId, 'ASSIGNED', 'ADMIN', 'Assigned to delivery agent', 1);
assert($updated1['status'] === 'ASSIGNED', "Delivery status must be ASSIGNED");

$orderCheck1 = $pdo->prepare("SELECT status FROM orders WHERE id = :id");
$orderCheck1->execute(['id' => $orderId]);
$ordStatus1 = $orderCheck1->fetchColumn();
echo "   Order status after ASSIGNED: {$ordStatus1} (expected: PACKED)\n";
assert($ordStatus1 === 'PACKED', "Order status should map to PACKED");

// 5. Test Transition: ASSIGNED -> PICKED_UP
echo "-> Testing status update: ASSIGNED -> PICKED_UP\n";
$updated2 = $deliverySvc->updateStatus($deliveryId, 'PICKED_UP', 'ADMIN', 'Picked up by courier', 1);
assert($updated2['status'] === 'PICKED_UP', "Delivery status must be PICKED_UP");

$orderCheck1->execute(['id' => $orderId]);
$ordStatus2 = $orderCheck1->fetchColumn();
echo "   Order status after PICKED_UP: {$ordStatus2} (expected: SHIPPED)\n";
assert($ordStatus2 === 'SHIPPED', "Order status should map to SHIPPED");

// 6. Test Transition: PICKED_UP -> OUT_FOR_DELIVERY
echo "-> Testing status update: PICKED_UP -> OUT_FOR_DELIVERY\n";
$updated3 = $deliverySvc->updateStatus($deliveryId, 'OUT_FOR_DELIVERY', 'ADMIN', 'Out for delivery today', 1);
assert($updated3['status'] === 'OUT_FOR_DELIVERY', "Delivery status must be OUT_FOR_DELIVERY");

$orderCheck1->execute(['id' => $orderId]);
$ordStatus3 = $orderCheck1->fetchColumn();
echo "   Order status after OUT_FOR_DELIVERY: {$ordStatus3} (expected: OUT_FOR_DELIVERY)\n";
assert($ordStatus3 === 'OUT_FOR_DELIVERY', "Order status should map to OUT_FOR_DELIVERY");

// 7. CRITICAL TEST: OUT_FOR_DELIVERY -> DELIVERED
// This tests DeliveryService line 157 where OrderService and InvoiceService are instantiated
echo "-> Testing status update: OUT_FOR_DELIVERY -> DELIVERED\n";
try {
    $updated4 = $deliverySvc->updateStatus($deliveryId, 'DELIVERED', 'ADMIN', 'Delivered to customer', 1);
    echo "✓ updateStatus to DELIVERED succeeded without constructor or runtime exception!\n";
} catch (\Throwable $e) {
    echo "❌ FATAL ERROR on updateStatus DELIVERED: " . $e->getMessage() . "\n";
    echo $e->getTraceAsString() . "\n";
    exit(1);
}

assert($updated4['status'] === 'DELIVERED', "Delivery status must be DELIVERED");

// Verify order status
$orderCheck1->execute(['id' => $orderId]);
$ordStatusFinal = $orderCheck1->fetchColumn();
echo "   Order status after DELIVERED: {$ordStatusFinal} (expected: DELIVERED)\n";
assert($ordStatusFinal === 'DELIVERED', "Order status should map to DELIVERED");

// Verify invoice was automatically generated
$invStmt = $pdo->prepare("SELECT id, invoice_no, grand_total, payment_status, status FROM invoices WHERE order_id = :id");
$invStmt->execute(['id' => $orderId]);
$invoice = $invStmt->fetch();
assert(!empty($invoice), "Invoice must be automatically generated upon DELIVERED");
echo "✓ Invoice automatically generated: ID={$invoice['id']}, No={$invoice['invoice_no']}, Total={$invoice['grand_total']}, Status={$invoice['status']}\n";

// Verify invoice items
$invItemsStmt = $pdo->prepare("SELECT COUNT(*) FROM invoice_items WHERE invoice_id = :id");
$invItemsStmt->execute(['id' => $invoice['id']]);
$invItemsCount = (int) $invItemsStmt->fetchColumn();
assert($invItemsCount === 1, "Invoice must contain 1 item");
echo "✓ Invoice items count verified: {$invItemsCount}\n";

// Verify delivery status history
$delHistStmt = $pdo->prepare("SELECT from_status, to_status, note FROM delivery_status_history WHERE delivery_id = :id ORDER BY id ASC");
$delHistStmt->execute(['id' => $deliveryId]);
$delHist = $delHistStmt->fetchAll();
echo "✓ Delivery status history recorded: " . count($delHist) . " entries:\n";
foreach ($delHist as $h) {
    echo "   [{$h['from_status']} -> {$h['to_status']}] {$h['note']}\n";
}

// Verify order status history
$ordHistStmt = $pdo->prepare("SELECT from_status, to_status, note FROM order_status_history WHERE order_id = :id ORDER BY id ASC");
$ordHistStmt->execute(['id' => $orderId]);
$ordHist = $ordHistStmt->fetchAll();
echo "✓ Order status history recorded: " . count($ordHist) . " entries:\n";
foreach ($ordHist as $h) {
    echo "   [{$h['from_status']} -> {$h['to_status']}] {$h['note']}\n";
}

echo "\n============================================================\n";
echo "✓ TASK T17 VERIFICATION COMPLETE: ALL ASSERTIONS PASSED 100%\n";
echo "============================================================\n";
