<?php

declare(strict_types=1);

// T20: Phase 2 — ProductCreatePage pricing-column fix + the 3 new Price
// Adjustment pages' backing endpoint (PUT /variants/{id}/price).
//
// Part A verifies, at the VariantService level (like test_t05/t19), that
// a variant created with the NEW payload shape ProductCreatePage.tsx now
// sends — explicit normal_price plus a distinct retail_price — actually
// lands in the columns PricingService.php reads, instead of the old bug
// where the UI's "Retail Price" field silently ended up in customer_price
// (a column only read for the rare CUSTOMER_WISE type).
//
// Part B is an HTTP integration test (needs a real request: the
// controller reads php://input) against the new single-field,
// single-row price endpoint and its price_history audit trail (G12).
//
// Usage: php tests/test_t20_price_adjustment.php http://127.0.0.1:8091

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/test_guard.php';

use App\Tests\TestDbGuard;

echo "=== TASK T20: PRICE ADJUSTMENT / PRICING-COLUMN TESTS ===\n\n";

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

echo "--- Part A: ProductCreatePage's corrected pricing-column mapping ---\n";

$variantService = new \App\Services\VariantService($pdo);

$pdo->prepare("DELETE FROM products WHERE product_code = 'T20-TEST-PROD'")->execute();
$pdo->prepare(
    "INSERT INTO products (name, slug, product_code, is_active, created_at, updated_at)
     VALUES ('T20 Test Product', 't20-test-product', 'T20-TEST-PROD', 1, NOW(), NOW())"
)->execute();
$productId = (int) $pdo->lastInsertId();
$pdo->prepare('INSERT INTO product_categories (product_id, category_id) SELECT ?, id FROM categories LIMIT 1')->execute([$productId]);

// Mirrors exactly what ProductCreatePage.tsx's SIMPLE branch now sends:
// normal_price = Selling Price, retail_price = the distinct Retail Price
// override, customer_price omitted entirely (no field for it at creation).
$variantId = $variantService->createVariant($productId, [
    'sku' => 'T20-SIMPLE-1',
    'mrp' => '200.00',
    'normal_price' => '150.00',
    'retail_price' => '140.00',
    'wholesale_price' => '120.00',
], []);

$saved = $pdo->query("SELECT normal_price, retail_price, wholesale_price, customer_price FROM product_variants WHERE id = {$variantId}")->fetch();
assertCondition((float) $saved['normal_price'] === 150.0, 'normal_price stores the "Selling Price" value');
assertCondition((float) $saved['retail_price'] === 140.0, 'retail_price stores the distinct "Retail Price" override, not customer_price');
assertCondition($saved['customer_price'] === null, 'customer_price is left unset at creation (no field for it; the old bug stashed Retail Price here)');

$retailCharged = \App\Services\PricingService::resolveUnitPrice($saved, 'RETAIL');
assertCondition($retailCharged === '140.00', "A RETAIL-type customer (the default for every walk-in sale) is charged the distinct Retail Price 140.00, got {$retailCharged}");

// Regression: when the admin leaves "Retail Price" blank, retail_price
// must fall back to the Selling Price (column is NOT NULL) — same
// behavior the old code already had for this common case.
$variantId2 = $variantService->createVariant($productId, [
    'sku' => 'T20-SIMPLE-2',
    'mrp' => '200.00',
    'normal_price' => '150.00',
    'retail_price' => '150.00', // ProductCreatePage sends retailPrice||sellingPrice
], []);
$saved2 = $pdo->query("SELECT normal_price, retail_price FROM product_variants WHERE id = {$variantId2}")->fetch();
assertCondition((float) $saved2['retail_price'] === 150.0, 'Leaving "Retail Price" blank still charges the Selling Price (no silent zero)');

echo "\n--- Part B: PUT /variants/{id}/price (RowEditable backing endpoint) ---\n";

function httpPutJson(string $url, array $body, ?string $bearer = null): array
{
    $ch = curl_init($url);
    $headers = ['Content-Type: application/json'];
    if ($bearer !== null) {
        $headers[] = "Authorization: Bearer {$bearer}";
    }
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST => 'PUT',
        CURLOPT_POSTFIELDS => json_encode($body),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
    ]);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['status' => $status, 'body' => json_decode((string) $raw, true) ?? []];
}

function httpGetJson(string $url, ?string $bearer = null): array
{
    $ch = curl_init($url);
    $headers = [];
    if ($bearer !== null) {
        $headers[] = "Authorization: Bearer {$bearer}";
    }
    curl_setopt_array($ch, [CURLOPT_HTTPHEADER => $headers, CURLOPT_RETURNTRANSFER => true]);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['status' => $status, 'body' => json_decode((string) $raw, true) ?? []];
}

$password = 'T20-Test-Pass-1';
$hash = password_hash($password, PASSWORD_BCRYPT);
$adminRoleId = (int) $pdo->query("SELECT id FROM roles WHERE code = 'ADMIN'")->fetchColumn();
$pdo->prepare("DELETE FROM users WHERE email = 't20_admin@test.local'")->execute();
$pdo->prepare(
    "INSERT INTO users (role_id, name, email, password_hash, status) VALUES (:role_id, 'T20 Test User', 't20_admin@test.local', :hash, 'ACTIVE')"
)->execute(['role_id' => $adminRoleId, 'hash' => $hash]);

$ch = curl_init("{$baseUrl}/api/auth/login");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode(['email' => 't20_admin@test.local', 'password' => $password]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
]);
$raw = curl_exec($ch);
$loginStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
$loginBody = json_decode((string) $raw, true) ?? [];
assertCondition($loginStatus === 200, 'T20 admin login succeeds, got ' . $loginStatus);
$bearer = $loginBody['token'] ?? null;
assertCondition(is_string($bearer) && $bearer !== '', 'Login returns a bearer token');

$historyCountBefore = (int) $pdo->query("SELECT COUNT(*) FROM price_history WHERE variant_id = {$variantId}")->fetchColumn();

// TEST B1: valid RETAIL price update.
$resp = httpPutJson("{$baseUrl}/api/variants/{$variantId}/price", ['price_type' => 'RETAIL', 'value' => '175.50'], $bearer);
assertCondition($resp['status'] === 200, 'Valid RETAIL price update returns 200, got ' . $resp['status'] . ' ' . json_encode($resp['body']));
$row = $pdo->query("SELECT retail_price FROM product_variants WHERE id = {$variantId}")->fetch();
assertCondition((float) $row['retail_price'] === 175.5, 'retail_price column actually updated to 175.50');

$history = $pdo->query("SELECT * FROM price_history WHERE variant_id = {$variantId} ORDER BY id DESC LIMIT 1")->fetch();
assertCondition($history !== false && $history['price_type'] === 'RETAIL', 'price_history row written with price_type=RETAIL (G12 audit trail)');
assertCondition((float) $history['old_price'] === 140.0 && (float) $history['new_price'] === 175.5, "price_history records old_price=140.00 -> new_price=175.50, got {$history['old_price']} -> {$history['new_price']}");
assertCondition($history['changed_by'] !== null, 'price_history records who made the change');

// TEST B2: WHOLESALE and CUSTOMER tiers write to their own columns, independently.
httpPutJson("{$baseUrl}/api/variants/{$variantId}/price", ['price_type' => 'WHOLESALE', 'value' => '130.00'], $bearer);
httpPutJson("{$baseUrl}/api/variants/{$variantId}/price", ['price_type' => 'CUSTOMER', 'value' => '160.00'], $bearer);
$row2 = $pdo->query("SELECT retail_price, wholesale_price, customer_price FROM product_variants WHERE id = {$variantId}")->fetch();
assertCondition((float) $row2['retail_price'] === 175.5, 'RETAIL tier update did not get clobbered by the WHOLESALE/CUSTOMER updates');
assertCondition((float) $row2['wholesale_price'] === 130.0, 'WHOLESALE tier updated independently');
assertCondition((float) $row2['customer_price'] === 160.0, 'CUSTOMER tier updated independently');

$historyCountAfter = (int) $pdo->query("SELECT COUNT(*) FROM price_history WHERE variant_id = {$variantId}")->fetchColumn();
assertCondition($historyCountAfter === $historyCountBefore + 3, 'Exactly 3 price_history rows written for the 3 edits (one per save, matching RowEditable one-row-one-save)');

// TEST B3: validation — negative value rejected.
$negResp = httpPutJson("{$baseUrl}/api/variants/{$variantId}/price", ['price_type' => 'RETAIL', 'value' => '-5'], $bearer);
assertCondition($negResp['status'] === 422, 'Negative price value rejected with 422, got ' . $negResp['status']);

// TEST B4: validation — non-numeric value rejected.
$nanResp = httpPutJson("{$baseUrl}/api/variants/{$variantId}/price", ['price_type' => 'RETAIL', 'value' => 'abc'], $bearer);
assertCondition($nanResp['status'] === 422, 'Non-numeric price value rejected with 422, got ' . $nanResp['status']);

// TEST B5: validation — invalid price_type rejected.
$badTypeResp = httpPutJson("{$baseUrl}/api/variants/{$variantId}/price", ['price_type' => 'BOGUS', 'value' => '10'], $bearer);
assertCondition($badTypeResp['status'] === 422, 'Invalid price_type rejected with 422, got ' . $badTypeResp['status']);

// TEST B6: missing variant returns 404, not a 500.
$missingResp = httpPutJson("{$baseUrl}/api/variants/999999999/price", ['price_type' => 'RETAIL', 'value' => '10'], $bearer);
assertCondition($missingResp['status'] === 404, 'Nonexistent variant returns 404, got ' . $missingResp['status']);

echo "\n--- Part C: GET /products/price-settings includes normal_price + search/pagination ---\n";

$listResp = httpGetJson("{$baseUrl}/api/products/price-settings?search=T20-SIMPLE&limit=50", $bearer);
assertCondition($listResp['status'] === 200, 'price-settings list succeeds, got ' . $listResp['status']);
$variantsOut = $listResp['body']['variants'] ?? [];
assertCondition(isset($listResp['body']['total']) && isset($listResp['body']['page']) && isset($listResp['body']['limit']), 'Response includes total/page/limit pagination metadata (G6)');
assertCondition(count($variantsOut) === 2, 'search=T20-SIMPLE filters down to exactly the 2 T20 test variants, got ' . count($variantsOut));
$hasNormalPrice = isset($variantsOut[0]['normal_price']);
assertCondition($hasNormalPrice, 'Each row includes normal_price (previously missing, so the "Base Selling Price" column had nothing to show)');

echo "\n--- Cleanup ---\n";
$pdo->prepare("DELETE FROM price_history WHERE variant_id IN ({$variantId}, {$variantId2})")->execute();
$pdo->prepare("DELETE FROM inventory WHERE variant_id IN ({$variantId}, {$variantId2})")->execute();
$pdo->prepare("DELETE FROM product_variants WHERE id IN ({$variantId}, {$variantId2})")->execute();
$pdo->prepare('DELETE FROM product_categories WHERE product_id = ?')->execute([$productId]);
$pdo->prepare('DELETE FROM products WHERE id = ?')->execute([$productId]);
$pdo->prepare("DELETE FROM users WHERE email = 't20_admin@test.local'")->execute();
echo "✓ Cleaned up T20 test product, variants, price_history rows, and test user\n";

echo "\n============================================\n";
echo "RESULT: {$passedCount} / {$totalTests} TESTS PASSED\n";
echo "============================================\n";
