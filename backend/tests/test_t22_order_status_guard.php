<?php

declare(strict_types=1);

// T22: Phase 4 — OrderService::updateStatus() guards (payment-before-
// progress, forward-only transitions), plus OrderService::list() and
// DeliveryService::list() server-side search/pagination (G6).
//
// Usage: php tests/test_t22_order_status_guard.php

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/test_guard.php';

use App\Services\CouponService;
use App\Services\DeliveryService;
use App\Services\InventoryService;
use App\Services\InvoiceService;
use App\Services\OrderService;
use App\Services\RefundService;
use App\Tests\TestDbGuard;

echo "=== TASK T22: ORDER STATUS TRANSITION GUARD + LIST PAGINATION ===\n\n";

putenv('APP_ENV=testing');
$_ENV['APP_ENV'] = 'testing';
$_SERVER['APP_ENV'] = 'testing';
require_once __DIR__ . '/../config/database.php';

$pdo = db();
TestDbGuard::assertTestDatabase($pdo, __FILE__);
echo "✓ Connected safely to test database: " . $pdo->query('SELECT DATABASE()')->fetchColumn() . "\n\n";

$passedCount = 0;
$totalTests = 0;

function assertCondition(bool $cond, string $msg): void
{
    global $passedCount, $totalTests;
    $totalTests++;
    if (!$cond) {
        echo "❌ FAILED: {$msg}\n";
        throw new RuntimeException("Assertion failed: {$msg}");
    }
    $passedCount++;
    echo "✅ PASSED: {$msg}\n";
}

$inventory = new InventoryService($pdo);
$coupons = new CouponService($pdo);
$refunds = new RefundService($pdo);
$invoices = new InvoiceService($pdo, $inventory, $coupons, $refunds);
$orderSvc = new OrderService($pdo, $inventory, $coupons, $invoices, $refunds);
$deliverySvc = new DeliveryService($pdo);

$custStmt = $pdo->query("SELECT id FROM customers WHERE status = 'ACTIVE' LIMIT 1");
$customerId = (int) $custStmt->fetchColumn();
if (!$customerId) {
    $pdo->exec("INSERT INTO customers (name, phone, status, customer_type) VALUES ('T22 Test Customer', '9999777766', 'ACTIVE', 'RETAIL')");
    $customerId = (int) $pdo->lastInsertId();
}

$variant = $pdo->query("SELECT id, product_id, sku, mrp, retail_price FROM product_variants WHERE status = 'ACTIVE' LIMIT 1")->fetch();
if (!$variant) {
    throw new RuntimeException('No active variant found in test database');
}

/** Directly inserts a bare order row for testing, bypassing checkout()'s full pricing pipeline. */
function insertTestOrder(PDO $pdo, int $customerId, array $variant, string $status, string $paymentStatus, string $marker): int
{
    $orderNo = 'ORD-' . $marker . '-' . substr(bin2hex(random_bytes(4)), 0, 8);
    $subtotal = (float) $variant['retail_price'];
    $grandTotal = $subtotal + 50.00;

    $pdo->prepare(
        "INSERT INTO orders (
            order_no, customer_id, status, payment_status,
            subtotal, coupon_discount_total, referral_discount_total,
            tax_total, shipping_total, grand_total,
            shipping_name, shipping_phone, shipping_line1, shipping_city_district, shipping_state, shipping_pincode,
            created_at
        ) VALUES (
            :order_no, :customer_id, :status, :payment_status,
            :subtotal, 0, 0, 0, 50.00, :grand_total,
            'T22 Test', '9999777766', '123 Test Road', 'Chennai', 'Tamil Nadu', '600001',
            NOW()
        )"
    )->execute([
        'order_no' => $orderNo,
        'customer_id' => $customerId,
        'status' => $status,
        'payment_status' => $paymentStatus,
        'subtotal' => $subtotal,
        'grand_total' => $grandTotal,
    ]);
    $orderId = (int) $pdo->lastInsertId();

    $pdo->prepare(
        "INSERT INTO order_items (order_id, product_id, variant_id, sku_snapshot, product_name_snapshot, quantity, mrp, unit_price, line_total)
         VALUES (:order_id, :product_id, :variant_id, :sku, 'T22 Test Item', 1, :mrp, :price, :line_total)"
    )->execute([
        'order_id' => $orderId,
        'product_id' => $variant['product_id'],
        'variant_id' => $variant['id'],
        'sku' => $variant['sku'],
        'mrp' => $variant['mrp'],
        'price' => $variant['retail_price'],
        'line_total' => $variant['retail_price'],
    ]);

    return $orderId;
}

$marker = strtoupper(substr(bin2hex(random_bytes(4)), 0, 6));
$createdOrderIds = [];

echo "--- Part A: payment-before-progress guard ---\n";

$unpaidOrderId = insertTestOrder($pdo, $customerId, $variant, 'PENDING', 'PENDING', "{$marker}A");
$createdOrderIds[] = $unpaidOrderId;

$rejected = false;
try {
    $orderSvc->updateStatus($unpaidOrderId, 'CONFIRMED', 1, 'test attempt');
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'paid')) {
        $rejected = true;
    }
}
assertCondition($rejected, 'Moving an unpaid (payment_status=PENDING) order to CONFIRMED is rejected');

$stillPending = $pdo->query("SELECT status FROM orders WHERE id = {$unpaidOrderId}")->fetchColumn();
assertCondition($stillPending === 'PENDING', 'Rejected attempt left the order status unchanged at PENDING');

$rejectedDelivered = false;
try {
    $orderSvc->updateStatus($unpaidOrderId, 'DELIVERED', 1, 'test attempt - skip straight to delivered');
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'paid')) {
        $rejectedDelivered = true;
    }
}
assertCondition($rejectedDelivered, 'Jumping an unpaid order straight to DELIVERED is also rejected (not just the adjacent-status case)');

echo "\n--- Part B: forward-only transitions ---\n";

$paidOrderId = insertTestOrder($pdo, $customerId, $variant, 'PROCESSING', 'PAID', "{$marker}B");
$createdOrderIds[] = $paidOrderId;

$backwardRejected = false;
try {
    $orderSvc->updateStatus($paidOrderId, 'PENDING', 1, 'test backward move');
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'forward')) {
        $backwardRejected = true;
    }
}
assertCondition($backwardRejected, 'Moving a PROCESSING order backward to PENDING is rejected');

$sameStatusRejected = false;
try {
    $orderSvc->updateStatus($paidOrderId, 'PROCESSING', 1, 'test same-status no-op');
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'forward')) {
        $sameStatusRejected = true;
    }
}
assertCondition($sameStatusRejected, 'Setting the same status again is rejected as a no-op, not silently accepted');

$forwardResult = $orderSvc->updateStatus($paidOrderId, 'PACKED', 1, 'test forward move');
assertCondition($forwardResult['status'] === 'PACKED', "A paid order can move forward PROCESSING -> PACKED, got {$forwardResult['status']}");

echo "\n--- Part C: OrderService::list() / DeliveryService::list() pagination + search ---\n";

$listResult = $orderSvc->list(['search' => $marker, 'page' => 1, 'limit' => 50]);
assertCondition($listResult['total'] === 2, "search='{$marker}' finds exactly the 2 T22 test orders, got {$listResult['total']}");
assertCondition(isset($listResult['page']) && isset($listResult['limit']), 'list() result includes page/limit pagination metadata');

$page1 = $orderSvc->list(['search' => $marker, 'page' => 1, 'limit' => 1]);
$page2 = $orderSvc->list(['search' => $marker, 'page' => 2, 'limit' => 1]);
assertCondition(count($page1['items']) === 1 && count($page2['items']) === 1, 'limit=1 splits the 2 matching orders across 2 pages');
assertCondition($page1['items'][0]['id'] !== $page2['items'][0]['id'], 'The two pages return different orders, not a duplicate');

$deliveryListResult = $deliverySvc->list(['page' => 1, 'limit' => 5]);
assertCondition(isset($deliveryListResult['total']) && isset($deliveryListResult['page']) && isset($deliveryListResult['limit']), 'DeliveryService::list() also returns pagination metadata');

echo "\n--- Cleanup ---\n";
foreach ($createdOrderIds as $oid) {
    $pdo->prepare('DELETE FROM order_status_history WHERE order_id = ?')->execute([$oid]);
    $pdo->prepare('DELETE FROM order_items WHERE order_id = ?')->execute([$oid]);
    $pdo->prepare('DELETE FROM orders WHERE id = ?')->execute([$oid]);
}
echo "✓ Cleaned up T22 test orders\n";

echo "\n============================================\n";
echo "RESULT: {$passedCount} / {$totalTests} TESTS PASSED\n";
echo "============================================\n";
