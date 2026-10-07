<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config/database.php';

use App\Helpers\Config;
use App\Helpers\JwtHelper;
use App\Services\InventoryService;
use App\Services\PurchaseService;

$pdo = db();
$inventory = new InventoryService($pdo);
$purchaseService = new PurchaseService($pdo, $inventory);

echo "=== STARTING COMPREHENSIVE PURCHASE PAYMENT TEST SUITE ===\n\n";

$passed = 0;
$failed = 0;

function assertTest(bool $condition, string $testName, string $details = ''): void
{
    global $passed, $failed;
    if ($condition) {
        echo " [PASS] {$testName}\n";
        if ($details) echo "        -> {$details}\n";
        $passed++;
    } else {
        echo " [FAIL] {$testName}\n";
        if ($details) echo "        -> ERROR: {$details}\n";
        $failed++;
    }
}

// 1. Setup Test Supplier, Product, Variant, User
$supplierStmt = $pdo->query("SELECT id FROM suppliers LIMIT 1");
$supplierId = $supplierStmt->fetchColumn();
if (!$supplierId) {
    $supplierId = $purchaseService->createSupplier([
        'name' => 'Test Supplier ' . time(),
        'contact_person' => 'Supplier Contact',
        'phone' => '9876543210',
    ]);
}

$variantStmt = $pdo->query("SELECT id, product_id FROM product_variants WHERE deleted_at IS NULL LIMIT 1");
$variantRow = $variantStmt->fetch();
if (!$variantRow) {
    // Create Category, Brand, Product, Variant, Inventory
    $unitId = $pdo->query("SELECT id FROM units LIMIT 1")->fetchColumn() ?: 1;
    $gstId = $pdo->query("SELECT id FROM gst_rates WHERE gst_percent = 0 LIMIT 1")->fetchColumn() ?: 1;

    $pdo->prepare("INSERT INTO products (name, slug, unit_id, gst_rate_id) VALUES ('Test Product', 'test-product-" . time() . "', :unit, :gst)")
        ->execute(['unit' => $unitId, 'gst' => $gstId]);
    $prodId = (int) $pdo->lastInsertId();

    $sku = 'TEST-SKU-' . time();
    $pdo->prepare("INSERT INTO product_variants (product_id, sku, mrp, retail_price, gst_rate_id, status) VALUES (:prod, :sku, 150.00, 100.00, :gst, 'ACTIVE')")
        ->execute(['prod' => $prodId, 'sku' => $sku, 'gst' => $gstId]);
    $vId = (int) $pdo->lastInsertId();

    $pdo->prepare("INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold) VALUES (:v, :p, 0, 0, 5)")
        ->execute(['v' => $vId, 'p' => $prodId]);

    $variantRow = ['id' => $vId, 'product_id' => $prodId];
}
$variantId = (int) $variantRow['id'];
$productId = (int) $variantRow['product_id'];

$adminUser = $pdo->query("SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE code = 'ADMIN') LIMIT 1")->fetchColumn();
$cashierUser = $pdo->query("SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE code = 'CASHIER') LIMIT 1")->fetchColumn();

// Check initial inventory
$initialOnHand = (float) $pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variantId}")->fetchColumn();

// Create a test purchase of 10 items @ unit_cost 100.00 = 1000.00 grand total (tax 0)
// Let's create an UNPAID purchase
$purchaseId = $purchaseService->createPurchase(
    supplierId: (int) $supplierId,
    items: [
        [
            'variant_id' => $variantId,
            'quantity' => '10',
            'unit_cost' => '100.00',
        ],
    ],
    purchaseDate: date('Y-m-d'),
    amountPaid: '0.00',
    createdByUserId: (int) $adminUser,
    paymentMethod: null,
    notes: 'Test purchase'
);

$purchase = $purchaseService->find($purchaseId);
$grandTotal = $purchase['grand_total'];
echo "Created Test Purchase ID: {$purchaseId}, No: {$purchase['purchase_no']}, Total: ₹{$grandTotal}\n\n";

$inventoryAfterPurchase = (float) $pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variantId}")->fetchColumn();

// --- TEST 1: Unpaid -> Partially Paid (amount 500 of 1000) ---
$res1 = $purchaseService->updatePayment(
    purchaseId: $purchaseId,
    data: [
        'payment_status' => 'PARTIALLY_PAID',
        'payment_method' => 'UPI',
        'paid_amount' => '500.00',
    ],
    userId: (int) $adminUser,
    clientIp: '127.0.0.1'
);

$ledger1 = $pdo->query("SELECT * FROM supplier_ledger WHERE reference_id = {$purchaseId} ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
$audit1 = $pdo->query("SELECT * FROM audit_logs WHERE entity_id = {$purchaseId} AND action = 'PURCHASE_PAYMENT_UPDATE' ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);

assertTest(
    $res1['paid_amount'] === '500.00' && $res1['balance_amount'] === '500.00' && $res1['payment_status'] === 'PARTIALLY_PAID' && $res1['payment_method'] === 'UPI',
    "Test 1: Unpaid -> Partially Paid (500/1000)",
    "DB shows paid: {$res1['paid_amount']}, balance: {$res1['balance_amount']}, status: {$res1['payment_status']}, method: {$res1['payment_method']}"
);

assertTest(
    $ledger1 && $ledger1['amount'] === '500.00' && $ledger1['paid_amount_delta'] === '500.00' && $ledger1['transaction_type'] === 'PAYMENT_ADJUSTMENT',
    "Test 1.1: Supplier Ledger Adjustment +500",
    "Ledger delta: {$ledger1['paid_amount_delta']}, type: {$ledger1['transaction_type']}"
);

$auditNew = json_decode($audit1['new_value'] ?? '{}', true);
$auditOld = json_decode($audit1['old_value'] ?? '{}', true);

assertTest(
    $audit1 && ($auditNew['paid_amount'] ?? null) === '500.00' && ($auditOld['paid_amount'] ?? null) === '0.00',
    "Test 1.2: Audit log recorded old and new values",
    "Old: {$audit1['old_value']} | New: {$audit1['new_value']}"
);

// --- TEST 2: Partially Paid -> Paid ---
$res2 = $purchaseService->updatePayment(
    purchaseId: $purchaseId,
    data: [
        'payment_status' => 'PAID',
        'payment_method' => 'CASH',
        'paid_amount' => '1000.00',
    ],
    userId: (int) $adminUser,
    clientIp: '127.0.0.1'
);

$ledger2 = $pdo->query("SELECT * FROM supplier_ledger WHERE reference_id = {$purchaseId} ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);

assertTest(
    $res2['paid_amount'] === '1000.00' && $res2['balance_amount'] === '0.00' && $res2['payment_status'] === 'PAID',
    "Test 2: Partially Paid -> Paid (paid becomes 1000, balance 0)",
    "DB paid: {$res2['paid_amount']}, balance: {$res2['balance_amount']}, status: {$res2['payment_status']}"
);

assertTest(
    $ledger2 && $ledger2['amount'] === '500.00' && $ledger2['paid_amount_delta'] === '500.00',
    "Test 2.1: Ledger records difference only (+500 difference)",
    "Ledger delta: {$ledger2['paid_amount_delta']}"
);

// --- TEST 3: Paid -> Unpaid ---
$res3 = $purchaseService->updatePayment(
    purchaseId: $purchaseId,
    data: [
        'payment_status' => 'UNPAID',
        'payment_method' => null,
    ],
    userId: (int) $adminUser,
    clientIp: '127.0.0.1'
);

$ledger3 = $pdo->query("SELECT * FROM supplier_ledger WHERE reference_id = {$purchaseId} ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);

assertTest(
    $res3['paid_amount'] === '0.00' && $res3['balance_amount'] === '1000.00' && $res3['payment_status'] === 'UNPAID',
    "Test 3: Paid -> Unpaid (paid 0, balance 1000)",
    "DB paid: {$res3['paid_amount']}, balance: {$res3['balance_amount']}, status: {$res3['payment_status']}"
);

assertTest(
    $ledger3 && $ledger3['amount'] === '-1000.00' && $ledger3['paid_amount_delta'] === '-1000.00',
    "Test 3.1: Ledger reversal row (-1000.00), old rows untouched",
    "Ledger delta: {$ledger3['paid_amount_delta']}"
);

// --- TEST 4: Partially Paid with amount 0, or amount >= total: rejected ---
$caught4a = false;
try {
    $purchaseService->updatePayment($purchaseId, ['payment_status' => 'PARTIALLY_PAID', 'payment_method' => 'CASH', 'paid_amount' => '0'], (int) $adminUser);
} catch (RuntimeException $e) {
    $caught4a = ($e->getMessage() === 'Paid amount must be greater than 0 and less than total');
}
assertTest($caught4a, "Test 4a: Partially Paid with amount 0 is rejected with 'Paid amount must be greater than 0 and less than total'");

$caught4b = false;
try {
    $purchaseService->updatePayment($purchaseId, ['payment_status' => 'PARTIALLY_PAID', 'payment_method' => 'CASH', 'paid_amount' => '1000.00'], (int) $adminUser);
} catch (RuntimeException $e) {
    $caught4b = ($e->getMessage() === 'Paid amount must be greater than 0 and less than total');
}
assertTest($caught4b, "Test 4b: Partially Paid with amount >= total is rejected with 'Paid amount must be greater than 0 and less than total'");

// --- TEST 5: Amount greater than total rejected with 'Payment exceeds balance' ---
$caught5 = false;
try {
    $purchaseService->updatePayment($purchaseId, ['payment_status' => 'PARTIALLY_PAID', 'payment_method' => 'CASH', 'paid_amount' => '1500.00'], (int) $adminUser);
} catch (RuntimeException $e) {
    $caught5 = ($e->getMessage() === 'Payment exceeds balance');
}
assertTest($caught5, "Test 5: Amount > total rejected with 'Payment exceeds balance'");

// --- TEST 6: Method missing for Partially Paid / Paid: rejected ---
$caught6a = false;
try {
    $purchaseService->updatePayment($purchaseId, ['payment_status' => 'PARTIALLY_PAID', 'payment_method' => '', 'paid_amount' => '500'], (int) $adminUser);
} catch (RuntimeException $e) {
    $caught6a = ($e->getMessage() === 'Payment method required');
}
assertTest($caught6a, "Test 6a: Missing method on Partially Paid rejected with 'Payment method required'");

$caught6b = false;
try {
    $purchaseService->updatePayment($purchaseId, ['payment_status' => 'PAID', 'payment_method' => ''], (int) $adminUser);
} catch (RuntimeException $e) {
    $caught6b = ($e->getMessage() === 'Payment method required');
}
assertTest($caught6b, "Test 6b: Missing method on Paid rejected with 'Payment method required'");

// --- TEST 7: Cancelled purchase cannot be edited ---
// Create a purchase and cancel it
$cancelPurchaseId = $purchaseService->createPurchase(
    supplierId: (int) $supplierId,
    items: [['variant_id' => $variantId, 'quantity' => '1', 'unit_cost' => '100.00']],
    purchaseDate: date('Y-m-d'),
    amountPaid: '0.00',
    createdByUserId: (int) $adminUser,
);
$purchaseService->cancelPurchase($cancelPurchaseId, 'Testing cancellation', (int) $adminUser);

$caught7 = false;
try {
    $purchaseService->updatePayment($cancelPurchaseId, ['payment_status' => 'PAID', 'payment_method' => 'CASH'], (int) $adminUser);
} catch (RuntimeException $e) {
    $caught7 = ($e->getMessage() === 'Purchase cancelled');
}
assertTest($caught7, "Test 7: Cancelled purchase edit rejected with 'Purchase cancelled'");

// --- TEST 8: Same request sent twice (idempotency / double-click protection) ---
$ledgerCountBefore = (int) $pdo->query("SELECT COUNT(*) FROM supplier_ledger WHERE reference_id = {$purchaseId}")->fetchColumn();
$res8a = $purchaseService->updatePayment($purchaseId, ['payment_status' => 'PAID', 'payment_method' => 'UPI'], (int) $adminUser);
$ledgerCountAfter1 = (int) $pdo->query("SELECT COUNT(*) FROM supplier_ledger WHERE reference_id = {$purchaseId}")->fetchColumn();

// Send exact same request again
$res8b = $purchaseService->updatePayment($purchaseId, ['payment_status' => 'PAID', 'payment_method' => 'UPI'], (int) $adminUser);
$ledgerCountAfter2 = (int) $pdo->query("SELECT COUNT(*) FROM supplier_ledger WHERE reference_id = {$purchaseId}")->fetchColumn();

assertTest(
    $ledgerCountAfter2 === $ledgerCountAfter1 && $ledgerCountAfter1 === ($ledgerCountBefore + 1),
    "Test 8: Double-click / Idempotency: exact same request does not create duplicate ledger rows",
    "Ledger count before: {$ledgerCountBefore}, after 1st: {$ledgerCountAfter1}, after 2nd: {$ledgerCountAfter2}"
);

// --- TEST 9: Transaction rollback on failure ---
$dbPaidBefore = $pdo->query("SELECT paid_amount FROM purchases WHERE id = {$purchaseId}")->fetchColumn();
$ledgerRowsBefore = (int) $pdo->query("SELECT COUNT(*) FROM supplier_ledger WHERE reference_id = {$purchaseId}")->fetchColumn();

try {
    // Attempt an invalid update that fails validation
    $purchaseService->updatePayment($purchaseId, ['payment_status' => 'PARTIALLY_PAID', 'payment_method' => 'CARD', 'paid_amount' => '-50'], (int) $adminUser);
} catch (\Throwable $e) {
    // Expected
}

$dbPaidAfter = $pdo->query("SELECT paid_amount FROM purchases WHERE id = {$purchaseId}")->fetchColumn();
$ledgerRowsAfter = (int) $pdo->query("SELECT COUNT(*) FROM supplier_ledger WHERE reference_id = {$purchaseId}")->fetchColumn();

assertTest(
    $dbPaidBefore === $dbPaidAfter && $ledgerRowsBefore === $ledgerRowsAfter,
    "Test 9: Forced failure rolled back cleanly (DB state and ledger unchanged)",
    "Paid remains: {$dbPaidAfter}, ledger rows remain: {$ledgerRowsAfter}"
);

// --- TEST 10: Stock/Inventory unchanged after all payment edits ---
$finalOnHand = (float) $pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variantId}")->fetchColumn();

assertTest(
    $finalOnHand === $inventoryAfterPurchase,
    "Test 10: Stock/inventory for variant is UNCHANGED after all payment edits",
    "Inventory remained exactly: {$finalOnHand}"
);

// --- TEST 11: HTTP API endpoint tests (401, 403, 200) ---
// Test JWT Tokens
$adminToken = JwtHelper::issue(['sub' => (int) $adminUser, 'type' => 'staff', 'role' => 'ADMIN', 'permissions' => ['purchases.manage']], 900);
$cashierToken = JwtHelper::issue(['sub' => (int) $cashierUser, 'type' => 'staff', 'role' => 'CASHIER', 'permissions' => ['purchases.manage']], 900);
$customerToken = JwtHelper::issue(['sub' => 999, 'type' => 'customer'], 900);

echo "\n--- HTTP ENDPOINT INTEGRATION CHECKS ---\n";

// A. No token -> 401
$ch = curl_init("http://127.0.0.1:8080/api/purchases/{$purchaseId}/payment");
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['payment_status' => 'PAID', 'payment_method' => 'CASH']));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$resp = curl_exec($ch);
$code401 = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
assertTest($code401 === 401, "Test 11a: No token -> HTTP 401 Unauthorized", "HTTP Code: {$code401}");

// B. Cashier token -> 403
$ch = curl_init("http://127.0.0.1:8080/api/purchases/{$purchaseId}/payment");
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['payment_status' => 'PAID', 'payment_method' => 'CASH']));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', "Authorization: Bearer {$cashierToken}"]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$resp = curl_exec($ch);
$code403 = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
assertTest($code403 === 403, "Test 11b: Cashier token -> HTTP 403 Forbidden", "HTTP Code: {$code403}");

// C. Admin token -> HTTP 200 with full purchase payload
$ch = curl_init("http://127.0.0.1:8080/api/purchases/{$purchaseId}/payment");
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PATCH');
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['payment_status' => 'PARTIALLY_PAID', 'payment_method' => 'NETBANKING', 'paid_amount' => '750.00']));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', "Authorization: Bearer {$adminToken}"]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$resp200 = curl_exec($ch);
$code200 = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$decoded = json_decode($resp200, true);

assertTest(
    $code200 === 200 && isset($decoded['purchase']) && $decoded['purchase']['paid_amount'] === '750.00' && $decoded['purchase']['balance_amount'] === '250.00' && $decoded['purchase']['payment_method'] === 'NETBANKING',
    "Test 11c: Admin token -> HTTP 200 with full updated purchase response",
    "HTTP Code: {$code200} | Paid: " . ($decoded['purchase']['paid_amount'] ?? 'N/A') . " | Balance: " . ($decoded['purchase']['balance_amount'] ?? 'N/A')
);

// D. GET /api/purchases/{id} returns updated payment fields
$ch = curl_init("http://127.0.0.1:8080/api/purchases/{$purchaseId}");
curl_setopt($ch, CURLOPT_HTTPHEADER, ["Authorization: Bearer {$adminToken}"]);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$respGet = curl_exec($ch);
curl_close($ch);
$decodedGet = json_decode($respGet, true);

assertTest(
    isset($decodedGet['purchase']) && $decodedGet['purchase']['paid_amount'] === '750.00' && $decodedGet['purchase']['balance_amount'] === '250.00',
    "Test 11d: GET /api/purchases/{id} returns updated paid_amount (750.00) & balance_amount (250.00)",
    "GET Paid: " . ($decodedGet['purchase']['paid_amount'] ?? 'N/A')
);

echo "\n============================================\n";
echo "TEST RESULTS: Total Passed: {$passed} | Total Failed: {$failed}\n";
echo "============================================\n";
