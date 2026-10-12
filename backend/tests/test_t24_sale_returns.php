<?php

declare(strict_types=1);

// T24: Phase 6 — ReturnsController::storeSaleReturn() must reference a
// real invoice. Previously invoice_id was optional and ReturnsPage.tsx
// never sent one, so a return's qty/price came straight from a free-text
// form with no link to any actual sale — stock could be credited back
// (and a refund recorded) for units that were never sold.
//
// Usage: php tests/test_t24_sale_returns.php http://127.0.0.1:8091

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/test_guard.php';

use App\Services\InventoryService;
use App\Services\InvoiceService;
use App\Tests\TestDbGuard;

echo "=== TASK T24: SALE RETURNS MUST REFERENCE A REAL INVOICE ===\n\n";

$baseUrl = $argv[1] ?? 'http://127.0.0.1:8091';

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

function httpJson(string $method, string $url, ?array $body, ?string $bearer = null): array
{
    $ch = curl_init($url);
    $headers = ['Content-Type: application/json'];
    if ($bearer !== null) {
        $headers[] = "Authorization: Bearer {$bearer}";
    }
    $opts = [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
    ];
    if ($body !== null) {
        $opts[CURLOPT_POSTFIELDS] = json_encode($body);
    }
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['status' => $status, 'body' => json_decode((string) $raw, true) ?? []];
}

$inventoryService = new InventoryService($pdo);
$invoiceService = new InvoiceService($pdo, $inventoryService);
$adminUserId = 1;

$variants = $pdo->query('
    SELECT v.id, v.sku, v.normal_price, p.name AS product_name
    FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE v.status = "ACTIVE" AND v.normal_price > 0
    ORDER BY v.id ASC LIMIT 2
')->fetchAll(PDO::FETCH_ASSOC);
if (count($variants) < 2) {
    throw new RuntimeException('Need at least 2 active priced variants in test database');
}
[$variantA, $variantB] = $variants;

// Capture original stock so cleanup can restore an exact value rather
// than guess at a relative delta (sale consumption doesn't always
// decrement on_hand in this test DB when no batch record exists).
$originalOnHandA = (float) ($pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variantA['id']}")->fetchColumn() ?: 0);
$originalOnHandB = (float) ($pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variantB['id']}")->fetchColumn() ?: 0);

$custId = $pdo->query('SELECT id FROM customers WHERE deleted_at IS NULL LIMIT 1')->fetchColumn();
if (!$custId) {
    $pdo->prepare('INSERT INTO customers (name, phone, customer_type, created_at, updated_at) VALUES ("T24 Test Customer", "9998887744", "RETAIL", NOW(), NOW())')->execute();
    $custId = (int) $pdo->lastInsertId();
} else {
    $custId = (int) $custId;
}

// A fully-paid invoice with 3 of variant A and 2 of variant B.
$invoiceId = $invoiceService->createPosSale(
    items: [
        ['variant_id' => (int) $variantA['id'], 'quantity' => 3, 'unit_price' => (float) $variantA['normal_price'], 'product_name' => $variantA['product_name']],
        ['variant_id' => (int) $variantB['id'], 'quantity' => 2, 'unit_price' => (float) $variantB['normal_price'], 'product_name' => $variantB['product_name']],
    ],
    customerId: $custId,
    cashierUserId: $adminUserId,
    paymentMethod: 'CASH',
    amountPaid: bcadd(bcmul((string) $variantA['normal_price'], '3', 2), bcmul((string) $variantB['normal_price'], '2', 2), 2),
);
echo "✓ Created fully-paid test invoice id={$invoiceId} (3x variant A, 2x variant B)\n";

$password = 'T24-Test-Pass-1';
$hash = password_hash($password, PASSWORD_BCRYPT);
$adminRoleId = (int) $pdo->query("SELECT id FROM roles WHERE code = 'ADMIN'")->fetchColumn();
$pdo->prepare("DELETE FROM users WHERE email = 't24_admin@test.local'")->execute();
$pdo->prepare(
    "INSERT INTO users (role_id, name, email, password_hash, status) VALUES (:role_id, 'T24 Test User', 't24_admin@test.local', :hash, 'ACTIVE')"
)->execute(['role_id' => $adminRoleId, 'hash' => $hash]);

$ch = curl_init("{$baseUrl}/api/auth/login");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode(['email' => 't24_admin@test.local', 'password' => $password]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
]);
$raw = curl_exec($ch);
$loginStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$bearer = (json_decode((string) $raw, true) ?? [])['token'] ?? null;
assertCondition($loginStatus === 200 && is_string($bearer), 'T24 admin login succeeds, got ' . $loginStatus);

// TEST: no invoice_id at all is rejected.
$noInvoice = httpJson('POST', "{$baseUrl}/api/returns/sales", [
    'customer_id' => $custId,
    'reason' => 'test',
    'items' => [['variant_id' => (int) $variantA['id'], 'qty' => 1, 'unit_price' => 99999]],
], $bearer);
assertCondition($noInvoice['status'] === 422, 'A sale return with no invoice_id is rejected with 422, got ' . $noInvoice['status']);

// TEST: a nonexistent invoice_id is rejected.
$badInvoice = httpJson('POST', "{$baseUrl}/api/returns/sales", [
    'invoice_id' => 999999999,
    'reason' => 'test',
    'items' => [['variant_id' => (int) $variantA['id'], 'qty' => 1, 'unit_price' => 1]],
], $bearer);
assertCondition($badInvoice['status'] === 422, 'A nonexistent invoice_id is rejected with 422, got ' . $badInvoice['status']);

// TEST: a variant that was never on this invoice is rejected.
$otherVariant = $pdo->query("SELECT id FROM product_variants WHERE id NOT IN ({$variantA['id']}, {$variantB['id']}) AND status = 'ACTIVE' LIMIT 1")->fetchColumn();
$wrongVariant = httpJson('POST', "{$baseUrl}/api/returns/sales", [
    'invoice_id' => $invoiceId,
    'reason' => 'test',
    'items' => [['variant_id' => (int) $otherVariant, 'qty' => 1, 'unit_price' => 1]],
], $bearer);
assertCondition($wrongVariant['status'] === 422, "A variant never on invoice #{$invoiceId} is rejected with 422, got {$wrongVariant['status']}");

// TEST: an attempted client-supplied unit_price is ignored — the real
// invoice line price is used instead, so a fabricated high price can't
// inflate the refund.
$stockBeforeA = (float) $pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variantA['id']}")->fetchColumn();
$fakePrice = httpJson('POST', "{$baseUrl}/api/returns/sales", [
    'invoice_id' => $invoiceId,
    'reason' => 'test fake price',
    'items' => [['variant_id' => (int) $variantA['id'], 'qty' => 1, 'unit_price' => 999999]],
], $bearer);
assertCondition($fakePrice['status'] === 200 || $fakePrice['status'] === 201, 'A valid return (qty within what was sold) succeeds, got ' . $fakePrice['status']);
$realUnitPrice = (float) $variantA['normal_price'];
$returnRow = $pdo->query("SELECT total_amount FROM sale_returns WHERE return_no = '{$fakePrice['body']['return_no']}'")->fetch(PDO::FETCH_ASSOC);
assertCondition(abs((float) $returnRow['total_amount'] - $realUnitPrice) < 0.01, "Refund total uses the real invoice unit price (₹{$realUnitPrice}), not the fabricated ₹999999 the client sent, got ₹{$returnRow['total_amount']}");
$stockAfterA = (float) $pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variantA['id']}")->fetchColumn();
assertCondition(abs($stockAfterA - ($stockBeforeA + 1)) < 0.001, 'Stock credited back by exactly 1 unit (the real returned qty)');

// TEST: returning more than was invoiced (3 sold, already returned 1,
// so only 2 remain — attempting 5 more) is rejected.
$overReturn = httpJson('POST', "{$baseUrl}/api/returns/sales", [
    'invoice_id' => $invoiceId,
    'reason' => 'test over-return',
    'items' => [['variant_id' => (int) $variantA['id'], 'qty' => 5, 'unit_price' => 1]],
], $bearer);
assertCondition($overReturn['status'] === 422, "Returning 5 units when only 2 remain returnable is rejected, got {$overReturn['status']}");
$stockAfterOverReturnAttempt = (float) $pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variantA['id']}")->fetchColumn();
assertCondition(abs($stockAfterOverReturnAttempt - $stockAfterA) < 0.001, 'Rejected over-return did not change stock at all');

// TEST: returning exactly the remaining 2 succeeds; a 3rd attempt of
// even 1 more unit is then rejected (cumulative cap across requests).
$exactRemaining = httpJson('POST', "{$baseUrl}/api/returns/sales", [
    'invoice_id' => $invoiceId,
    'reason' => 'test exact remaining',
    'items' => [['variant_id' => (int) $variantA['id'], 'qty' => 2, 'unit_price' => 1]],
], $bearer);
assertCondition($exactRemaining['status'] === 200 || $exactRemaining['status'] === 201, 'Returning exactly the 2 remaining units succeeds, got ' . $exactRemaining['status']);

$nothingLeft = httpJson('POST', "{$baseUrl}/api/returns/sales", [
    'invoice_id' => $invoiceId,
    'reason' => 'test nothing left',
    'items' => [['variant_id' => (int) $variantA['id'], 'qty' => 1, 'unit_price' => 1]],
], $bearer);
assertCondition($nothingLeft['status'] === 422, 'A 4th attempt to return variant A (0 remaining) is rejected — cumulative cap holds across separate requests, got ' . $nothingLeft['status']);

// TEST: refund-vs-amount_paid cap still works for an invoice-linked return.
// Returning all of variant B (2 units) brings cumulative refund near the
// full paid amount; the earlier variant-A returns already used some of
// that headroom, but refund capping is against amount_paid, which was
// paid in full, so this alone should still succeed.
$returnB = httpJson('POST', "{$baseUrl}/api/returns/sales", [
    'invoice_id' => $invoiceId,
    'reason' => 'test variant B return',
    'items' => [['variant_id' => (int) $variantB['id'], 'qty' => 2, 'unit_price' => 1]],
], $bearer);
assertCondition($returnB['status'] === 200 || $returnB['status'] === 201, 'Returning all of variant B succeeds (within amount_paid), got ' . $returnB['status']);

echo "\n--- Cleanup ---\n";
// Scoped to just this test's own returns (via invoice_id), not a broad
// pattern match against every sale return ever made.
$returnIds = $pdo->query("SELECT id, return_no FROM sale_returns WHERE invoice_id = {$invoiceId}")->fetchAll(PDO::FETCH_ASSOC);
foreach ($returnIds as $r) {
    $pdo->prepare('DELETE FROM stock_adjustment_items WHERE adjustment_id IN (SELECT id FROM stock_adjustments WHERE reason = ?)')->execute(["Sale Return: {$r['return_no']}"]);
    $pdo->prepare('DELETE FROM stock_adjustments WHERE reason = ?')->execute(["Sale Return: {$r['return_no']}"]);
    $pdo->prepare('DELETE FROM sale_return_items WHERE return_id = ?')->execute([$r['id']]);
}
$pdo->prepare('DELETE FROM sale_returns WHERE invoice_id = ?')->execute([$invoiceId]);
$pdo->prepare('DELETE FROM invoice_payment_lines WHERE payment_id IN (SELECT id FROM invoice_payments WHERE invoice_id = ?)')->execute([$invoiceId]);
$pdo->prepare('DELETE FROM invoice_payments WHERE invoice_id = ?')->execute([$invoiceId]);
$pdo->prepare('DELETE FROM invoice_items WHERE invoice_id = ?')->execute([$invoiceId]);
$pdo->prepare('DELETE FROM invoices WHERE id = ?')->execute([$invoiceId]);
$pdo->prepare("DELETE FROM users WHERE email = 't24_admin@test.local'")->execute();
// Restore stock to its exact pre-test value (absolute, not a relative
// delta — the sale's own consumption doesn't reliably decrement on_hand
// in this test DB, so a relative undo could over- or under-correct).
$pdo->prepare('UPDATE inventory SET on_hand = ? WHERE variant_id = ?')->execute([$originalOnHandA, (int) $variantA['id']]);
$pdo->prepare('UPDATE inventory SET on_hand = ? WHERE variant_id = ?')->execute([$originalOnHandB, (int) $variantB['id']]);
echo "✓ Cleaned up T24 test invoice, returns, adjustments, and test user; stock restored\n";

echo "\n============================================\n";
echo "RESULT: {$passedCount} / {$totalTests} TESTS PASSED\n";
echo "============================================\n";
