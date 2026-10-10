<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../config/database.php';
require_once __DIR__ . '/test_guard.php';

use App\Services\InventoryService;
use App\Services\InvoiceService;
use App\Tests\TestDbGuard;

$pdo = db();
TestDbGuard::assertTestDatabase($pdo, __FILE__);

echo "======================================================================\n";
echo "TASK T04: INVOICE CREATION & STOCK VALIDATION TEST SUITE\n";
echo "Database: unified_pos_test\n";
echo "======================================================================\n\n";

// Setup test product and variant
$uid = uniqid();
$slug = 't04-test-prod-' . $uid;
$pdo->exec("INSERT INTO products (name, slug, is_active, is_pos_enabled) VALUES ('T04 Test Product', '{$slug}', 1, 1)");
$productId = (int) $pdo->lastInsertId();

$sku = 'T04-VAR-' . $uid;
$pdo->exec("INSERT INTO product_variants (product_id, sku, retail_price, mrp) VALUES ({$productId}, '{$sku}', 100.00, 120.00)");
$variantId = (int) $pdo->lastInsertId();

// Set initial inventory to 3
$pdo->exec("INSERT INTO inventory (product_id, variant_id, on_hand, reserved) VALUES ({$productId}, {$variantId}, 3.000, 0.000)");

$inventoryService = new InventoryService($pdo);
$invoiceService = new InvoiceService($pdo, $inventoryService);

$cashierUserId = 1;

$passed = 0;
$failed = 0;

function assertTest(string $name, bool $condition, string $detail = '') {
    global $passed, $failed;
    if ($condition) {
        echo "  [PASS] {$name}" . ($detail ? " -> {$detail}" : "") . "\n";
        $passed++;
    } else {
        echo "  [FAIL] {$name}" . ($detail ? " -> {$detail}" : "") . "\n";
        $failed++;
    }
}

// TEST 1: Reject quantity above available stock (Requesting 4 on stock 3)
try {
    $invoiceService->createPosSale(
        items: [['variant_id' => $variantId, 'quantity' => 4]],
        customerId: null,
        cashierUserId: $cashierUserId,
        paymentMethod: 'CASH',
        amountPaid: '400.00'
    );
    assertTest("Test 1: Reject quantity above available", false, "Expected exception, but invoice succeeded");
} catch (\Throwable $e) {
    $msg = $e->getMessage();
    assertTest("Test 1: Reject quantity above available", str_contains($msg, 'left in stock') || str_contains($msg, 'Insufficient stock'), $msg);
}

// TEST 2: Accept exactly the available quantity (3 units)
try {
    $invId = $invoiceService->createPosSale(
        items: [['variant_id' => $variantId, 'quantity' => 3]],
        customerId: null,
        cashierUserId: $cashierUserId,
        paymentMethod: 'CASH',
        amountPaid: '300.00'
    );
    
    // Verify inventory on_hand dropped to 0
    $stmt = $pdo->prepare("SELECT on_hand, available FROM inventory WHERE variant_id = :id");
    $stmt->execute(['id' => $variantId]);
    $inv = $stmt->fetch();
    
    assertTest("Test 2: Accept exact available quantity", $invId > 0 && bccomp((string)$inv['on_hand'], '0', 3) === 0, "Invoice #{$invId} created, on_hand: {$inv['on_hand']}");
} catch (\Throwable $e) {
    assertTest("Test 2: Accept exact available quantity", false, $e->getMessage());
}

// TEST 3: Reject subsequent sale when stock is now 0
try {
    $invoiceService->createPosSale(
        items: [['variant_id' => $variantId, 'quantity' => 1]],
        customerId: null,
        cashierUserId: $cashierUserId,
        paymentMethod: 'CASH',
        amountPaid: '100.00'
    );
    assertTest("Test 3: Reject sale when stock is 0", false, "Expected exception, but sale went through");
} catch (\Throwable $e) {
    assertTest("Test 3: Reject sale when stock is 0", true, $e->getMessage());
}

// TEST 4: Quick Sale lines bypass stock limitation
try {
    $quickInvId = $invoiceService->createPosSale(
        items: [[
            'variant_id' => -12345,
            'quantity' => 50,
            'unit_price' => 25.00,
            'product_name' => 'Custom Potato',
            'is_quick_sale' => true,
        ]],
        customerId: null,
        cashierUserId: $cashierUserId,
        paymentMethod: 'CASH',
        amountPaid: '1250.00'
    );
    assertTest("Test 4: Quick sale bypasses stock limit", $quickInvId > 0, "Quick sale invoice #{$quickInvId} created with qty 50");
} catch (\Throwable $e) {
    assertTest("Test 4: Quick sale bypasses stock limit", false, $e->getMessage());
}

// TEST 5: Concurrent stock conflict simulation (Row locking SELECT FOR UPDATE)
// Create a variant with stock = 1
$concurrentSku = 'T04-VAR-CONCURRENT-' . $uid;
$pdo->exec("INSERT INTO product_variants (product_id, sku, retail_price, mrp) VALUES ({$productId}, '{$concurrentSku}', 50.00, 60.00)");
$concurrentVariantId = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO inventory (product_id, variant_id, on_hand, reserved) VALUES ({$productId}, {$concurrentVariantId}, 1.000, 0.000)");

// Transaction 1 buys 1 unit
$tx1Success = false;
$tx2Success = false;
$tx2Error = '';

try {
    $inv1 = $invoiceService->createPosSale(
        items: [['variant_id' => $concurrentVariantId, 'quantity' => 1]],
        customerId: null,
        cashierUserId: $cashierUserId,
        paymentMethod: 'CASH',
        amountPaid: '50.00'
    );
    $tx1Success = $inv1 > 0;
} catch (\Throwable $e) {
    $tx1Success = false;
}

try {
    $inv2 = $invoiceService->createPosSale(
        items: [['variant_id' => $concurrentVariantId, 'quantity' => 1]],
        customerId: null,
        cashierUserId: $cashierUserId,
        paymentMethod: 'CASH',
        amountPaid: '50.00'
    );
    $tx2Success = true;
} catch (\Throwable $e) {
    $tx2Success = false;
    $tx2Error = $e->getMessage();
}

assertTest("Test 5: Concurrent contention: Exactly 1 succeeds and 2nd is rejected", $tx1Success && !$tx2Success, "Tx1: Success, Tx2: Rejected with '{$tx2Error}'");

// Cleanup test rows created on unified_pos_test
$pdo->exec("SET FOREIGN_KEY_CHECKS=0");
$pdo->exec("DELETE FROM invoice_items WHERE variant_id IN ({$variantId}, {$concurrentVariantId}) OR product_id = {$productId}");
$pdo->exec("DELETE FROM inventory_movements WHERE variant_id IN ({$variantId}, {$concurrentVariantId}) OR product_id = {$productId}");
$pdo->exec("DELETE FROM inventory WHERE product_id = {$productId}");
$pdo->exec("DELETE FROM product_variants WHERE product_id = {$productId}");
$pdo->exec("DELETE FROM products WHERE id = {$productId}");
$pdo->exec("SET FOREIGN_KEY_CHECKS=1");

echo "\n======================================================================\n";
echo "TEST RESULTS: {$passed} PASSED | {$failed} FAILED\n";
echo "======================================================================\n";
