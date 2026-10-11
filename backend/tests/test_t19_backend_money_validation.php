<?php

declare(strict_types=1);

// T19: Phase 1.3 Fix A + Fix B — server-side money validation.
//
// Fix A: InvoiceService::createPosSale must reject an amount_paid that
// exceeds the server-computed grand_total, and must reject a negative
// amount_paid, instead of trusting whatever the client sends.
//
// Fix B: CollectionController::processPayment must reject a payment amount
// that exceeds the real outstanding balance of the target invoices,
// instead of recording a receipt for more than what actually got applied.
//
// Fix A is tested via direct PHP calls (like test_t05). Fix B needs a real
// HTTP request (CollectionController reads php://input), so it runs
// against a locally running backend — start one before running this, e.g.
// `php -S 127.0.0.1:8091 -t public public/index.php` from backend/, with
// APP_ENV=testing so it loads .env.test.
//
// Usage: php tests/test_t19_backend_money_validation.php http://127.0.0.1:8091

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/test_guard.php';

use App\Tests\TestDbGuard;

echo "=== TASK T19: BACKEND MONEY VALIDATION TESTS ===\n\n";

$baseUrl = $argv[1] ?? 'http://127.0.0.1:8091';

putenv('APP_ENV=testing');
$_ENV['APP_ENV'] = 'testing';
$_SERVER['APP_ENV'] = 'testing';
require_once __DIR__ . '/../config/database.php';

$pdo = db();
TestDbGuard::assertTestDatabase($pdo, __FILE__);
echo "✓ Connected safely to test database: " . $pdo->query('SELECT DATABASE()')->fetchColumn() . "\n\n";

$inventoryService = new \App\Services\InventoryService($pdo);
$invoiceService = new \App\Services\InvoiceService($pdo, $inventoryService);

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

// Find an active product variant with available stock to use for tests.
$variant = $pdo->query('
    SELECT v.id as variant_id, v.product_id, p.name as product_name, v.normal_price, i.available
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    JOIN inventory i ON i.variant_id = v.id
    WHERE v.status = "ACTIVE" AND i.available >= 10
    ORDER BY v.id ASC
    LIMIT 1
')->fetch();
if (!$variant) {
    throw new RuntimeException('No active variant with stock found in test database');
}
$vId = (int) $variant['variant_id'];
$pName = (string) $variant['product_name'];
$price = (string) $variant['normal_price'];

$adminUserId = 1;

// Dedicated test customer for T19.
$pdo->prepare("DELETE FROM customers WHERE phone = '9998887771'")->execute();
$pdo->prepare('INSERT INTO customers (name, phone, customer_type, created_at, updated_at) VALUES ("T19 Test Customer A", "9998887771", "RETAIL", NOW(), NOW())')->execute();
$custId = (int) $pdo->lastInsertId();

// Fix B gets its OWN customer: CollectionController::processPayment's AUTO
// mode sweeps every unpaid invoice for a customer_id, so Fix A's leftover
// UNPAID invoice (the non-numeric amount_paid test) would otherwise be
// swept into Fix B's outstanding-balance total and throw off the numbers.
$pdo->prepare('INSERT INTO customers (name, phone, customer_type, created_at, updated_at) VALUES ("T19 Test Customer B", "9998887772", "RETAIL", NOW(), NOW())')->execute();
$custIdB = (int) $pdo->lastInsertId();

echo "--- Fix A: InvoiceService::createPosSale amount_paid validation ---\n";

// TEST A1: amount_paid greater than grand_total is rejected.
$overpayRejected = false;
try {
    $invoiceService->createPosSale(
        items: [['variant_id' => $vId, 'quantity' => 1, 'unit_price' => (float) $price, 'product_name' => $pName]],
        customerId: $custId,
        cashierUserId: $adminUserId,
        paymentMethod: 'CASH',
        amountPaid: (string) ((float) $price + 500),
    );
} catch (\RuntimeException $e) {
    if (str_contains($e->getMessage(), 'cannot exceed the invoice total')) {
        $overpayRejected = true;
    }
}
assertCondition($overpayRejected, 'amount_paid greater than grand_total is rejected with a clear error');

// TEST A2: negative amount_paid is rejected.
$negativeRejected = false;
try {
    $invoiceService->createPosSale(
        items: [['variant_id' => $vId, 'quantity' => 1, 'unit_price' => (float) $price, 'product_name' => $pName]],
        customerId: $custId,
        cashierUserId: $adminUserId,
        paymentMethod: 'CASH',
        amountPaid: '-10.00',
    );
} catch (\RuntimeException $e) {
    if (str_contains($e->getMessage(), 'cannot be negative')) {
        $negativeRejected = true;
    }
}
assertCondition($negativeRejected, 'negative amount_paid is rejected with a clear error');

// TEST A3: amount_paid exactly equal to grand_total still succeeds (regression).
$exactInvId = $invoiceService->createPosSale(
    items: [['variant_id' => $vId, 'quantity' => 1, 'unit_price' => (float) $price, 'product_name' => $pName]],
    customerId: $custId,
    cashierUserId: $adminUserId,
    paymentMethod: 'CASH',
    amountPaid: $price,
);
$exactSaved = $pdo->query("SELECT payment_status, amount_paid FROM invoices WHERE id = {$exactInvId}")->fetch();
assertCondition($exactSaved['payment_status'] === 'PAID', 'amount_paid exactly equal to grand_total still creates a PAID invoice');

// TEST A4: non-numeric amount_paid is treated as 0, not a crash.
$garbageInvId = $invoiceService->createPosSale(
    items: [['variant_id' => $vId, 'quantity' => 1, 'unit_price' => (float) $price, 'product_name' => $pName]],
    customerId: $custId,
    cashierUserId: $adminUserId,
    paymentMethod: 'CREDIT',
    amountPaid: 'not-a-number',
);
$garbageSaved = $pdo->query("SELECT payment_status, amount_paid FROM invoices WHERE id = {$garbageInvId}")->fetch();
assertCondition((float) $garbageSaved['amount_paid'] === 0.0 && $garbageSaved['payment_status'] === 'UNPAID', 'non-numeric amount_paid is treated as 0.00 (UNPAID), not a crash');

echo "\n--- Fix B: CollectionController::processPayment overpayment validation ---\n";

/** Minimal curl JSON POST helper. */
function httpPostJson(string $url, array $body, ?string $bearer = null): array
{
    $ch = curl_init($url);
    $headers = ['Content-Type: application/json'];
    if ($bearer !== null) {
        $headers[] = "Authorization: Bearer {$bearer}";
    }
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($body),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
    ]);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['status' => $status, 'body' => json_decode((string) $raw, true) ?? []];
}

// Create a dedicated ADMIN test user (has pos.sell permission) for the HTTP calls.
$password = 'T19-Test-Pass-1';
$hash = password_hash($password, PASSWORD_BCRYPT);
$adminRoleId = (int) $pdo->query("SELECT id FROM roles WHERE code = 'ADMIN'")->fetchColumn();
assert($adminRoleId > 0, 'ADMIN role must exist');
$pdo->prepare("DELETE FROM users WHERE email = 't19_admin@test.local'")->execute();
$pdo->prepare(
    "INSERT INTO users (role_id, name, email, password_hash, status) VALUES (:role_id, 'T19 Test User', 't19_admin@test.local', :hash, 'ACTIVE')"
)->execute(['role_id' => $adminRoleId, 'hash' => $hash]);

$login = httpPostJson("{$baseUrl}/api/auth/login", ['email' => 't19_admin@test.local', 'password' => $password]);
assert($login['status'] === 200, 'T19 admin login should succeed, got ' . $login['status'] . ' ' . json_encode($login['body']));
$bearer = $login['body']['token'] ?? null;
assert(is_string($bearer) && $bearer !== '', 'Login must return a bearer token');
echo "✓ Logged in as T19 test admin\n";

// Create two CREDIT (unpaid) invoices for this customer via the already-fixed
// service, giving us a known, precise outstanding balance to test against.
$creditInv1 = $invoiceService->createPosSale(
    items: [['variant_id' => $vId, 'quantity' => 1, 'unit_price' => (float) $price, 'product_name' => $pName]],
    customerId: $custIdB,
    cashierUserId: $adminUserId,
    paymentMethod: 'CREDIT',
    amountPaid: '0.00',
);
$creditInv2 = $invoiceService->createPosSale(
    items: [['variant_id' => $vId, 'quantity' => 1, 'unit_price' => (float) $price, 'product_name' => $pName]],
    customerId: $custIdB,
    cashierUserId: $adminUserId,
    paymentMethod: 'CREDIT',
    amountPaid: '0.00',
);
$totalOutstanding = (float) $pdo->query(
    "SELECT SUM(grand_total - amount_paid) FROM invoices WHERE id IN ({$creditInv1}, {$creditInv2})"
)->fetchColumn();
assertCondition($totalOutstanding > 0, "Two CREDIT invoices created with total outstanding of {$totalOutstanding}");

$receiptCountBefore = (int) $pdo->query('SELECT COUNT(*) FROM collection_receipts')->fetchColumn();

// TEST B1: paying more than the real outstanding balance is rejected, and
// no receipt is recorded for the rejected attempt.
$overpay = httpPostJson("{$baseUrl}/api/collections/pay", [
    'customer_id' => $custIdB,
    'amount' => $totalOutstanding + 1000,
    'payment_method' => 'CASH',
    'mode' => 'AUTO',
], $bearer);
assertCondition($overpay['status'] === 422, 'Overpayment beyond outstanding balance is rejected with HTTP 422, got ' . $overpay['status']);
assertCondition(
    isset($overpay['body']['error']) && str_contains($overpay['body']['error'], 'exceeds the total outstanding balance'),
    'Overpayment rejection message names the outstanding-balance mismatch'
);
$receiptCountAfterReject = (int) $pdo->query('SELECT COUNT(*) FROM collection_receipts')->fetchColumn();
assertCondition($receiptCountAfterReject === $receiptCountBefore, 'Rejected overpayment did not create a collection_receipts row');
$inv1AfterReject = $pdo->query("SELECT amount_paid FROM invoices WHERE id = {$creditInv1}")->fetch();
assertCondition((float) $inv1AfterReject['amount_paid'] === 0.0, 'Rejected overpayment left the invoice amount_paid untouched');

// TEST B2: paying exactly the outstanding balance succeeds and the receipt
// amount equals what was actually applied.
$exactPay = httpPostJson("{$baseUrl}/api/collections/pay", [
    'customer_id' => $custIdB,
    'amount' => $totalOutstanding,
    'payment_method' => 'CASH',
    'mode' => 'AUTO',
], $bearer);
assertCondition($exactPay['status'] === 200, 'Exact-balance payment succeeds, got ' . $exactPay['status'] . ' ' . json_encode($exactPay['body']));
assertCondition(
    abs(((float) ($exactPay['body']['collected_amount'] ?? -1)) - $totalOutstanding) < 0.01,
    'Receipt collected_amount equals the real outstanding balance that was applied'
);
$inv1After = $pdo->query("SELECT payment_status FROM invoices WHERE id = {$creditInv1}")->fetch();
$inv2After = $pdo->query("SELECT payment_status FROM invoices WHERE id = {$creditInv2}")->fetch();
assertCondition($inv1After['payment_status'] === 'PAID' && $inv2After['payment_status'] === 'PAID', 'Both invoices are fully PAID after the exact-balance payment');

$receiptRow = $pdo->query('SELECT amount FROM collection_receipts ORDER BY id DESC LIMIT 1')->fetch();
assertCondition(abs((float) $receiptRow['amount'] - $totalOutstanding) < 0.01, 'collection_receipts.amount matches the applied total exactly (G9 reconciliation)');

echo "\n--- Cleanup ---\n";
foreach ([$custId, $custIdB] as $cid) {
    $pdo->prepare('DELETE FROM collection_receipt_items WHERE invoice_id IN (SELECT id FROM invoices WHERE customer_id = ?)')->execute([$cid]);
    $pdo->prepare('DELETE FROM collection_receipts WHERE customer_id = ?')->execute([$cid]);
    $pdo->prepare('DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE customer_id = ?)')->execute([$cid]);
    $pdo->prepare('DELETE FROM invoices WHERE customer_id = ?')->execute([$cid]);
    $pdo->prepare('DELETE FROM customers WHERE id = ?')->execute([$cid]);
}
$pdo->prepare("DELETE FROM users WHERE email = 't19_admin@test.local'")->execute();
echo "✓ Cleaned up T19 test customers, invoices, receipts, and test user\n";

echo "\n============================================\n";
echo "RESULT: {$passedCount} / {$totalTests} TESTS PASSED\n";
echo "============================================\n";
