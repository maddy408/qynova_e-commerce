<?php

declare(strict_types=1);

// T21: Phase 3 — Recent Adjustment Logs server-side search + pagination.
// InventoryService::listAdjustments() used to be a flat, unfiltered
// `LIMIT 200` with no way to search or page further — this verifies the
// new search (adjustment_no / reason / adjusted-by / item product-SKU)
// and page/limit/total metadata.
//
// Usage: php tests/test_t21_inventory_adjustments.php

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/test_guard.php';

use App\Tests\TestDbGuard;

echo "=== TASK T21: INVENTORY ADJUSTMENT LOGS SEARCH/PAGINATION ===\n\n";

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

$inventoryService = new \App\Services\InventoryService($pdo);
$adminUserId = 1;

$variant = $pdo->query('
    SELECT v.id AS variant_id FROM product_variants v
    WHERE v.status = "ACTIVE" AND v.deleted_at IS NULL
    ORDER BY v.id ASC LIMIT 1
')->fetch();
if (!$variant) {
    throw new RuntimeException('No active variant found in test database');
}
$variantId = (int) $variant['variant_id'];
$marker = 'T21-' . bin2hex(random_bytes(4));
$originalOnHand = (string) ($inventoryService->getStock($variantId)['on_hand'] ?? '0');

// Create 3 adjustments with a unique, greppable reason marker.
$createdIds = [];
for ($i = 0; $i < 3; $i++) {
    $stock = $inventoryService->getStock($variantId);
    $currentOnHand = $stock['on_hand'] ?? '0';
    $createdIds[] = $inventoryService->createAdjustment(
        [['variant_id' => $variantId, 'counted_qty' => (string) ((float) $currentOnHand + 1)]],
        "{$marker} count #{$i}",
        $adminUserId
    );
}
echo "✓ Created 3 test adjustments tagged '{$marker}'\n";

// TEST 1: search finds exactly the 3 tagged adjustments, nothing else.
$result = $inventoryService->listAdjustments($marker, 1, 20);
assertCondition($result['total'] === 3, "search='{$marker}' finds exactly 3 adjustments, got {$result['total']}");
assertCondition(count($result['items']) === 3, 'Returned item count matches total (under the page limit)');

// TEST 2: pagination — limit=2 splits the 3 into 2 pages, no overlap/loss.
$page1 = $inventoryService->listAdjustments($marker, 1, 2);
$page2 = $inventoryService->listAdjustments($marker, 2, 2);
assertCondition($page1['total'] === 3 && $page2['total'] === 3, 'total stays 3 across both pages');
assertCondition(count($page1['items']) === 2, 'Page 1 (limit=2) returns 2 items');
assertCondition(count($page2['items']) === 1, 'Page 2 (limit=2) returns the remaining 1 item');
$page1Ids = array_column($page1['items'], 'id');
$page2Ids = array_column($page2['items'], 'id');
assertCondition(count(array_intersect($page1Ids, $page2Ids)) === 0, 'No adjustment appears on both pages');
assertCondition(count(array_unique(array_merge($page1Ids, $page2Ids))) === 3, 'All 3 adjustments are covered exactly once across both pages');

// TEST 3: default call (no args) still works — page=1, limit=20 defaults.
$default = $inventoryService->listAdjustments();
assertCondition($default['page'] === 1 && $default['limit'] === 20, 'Calling with no arguments still defaults to page=1, limit=20');
assertCondition($default['total'] >= 3, 'Unfiltered listing includes at least the 3 test adjustments');

// TEST 4: a reason/adjustment_no/user-name search with no matches returns an empty, well-formed page.
$noMatch = $inventoryService->listAdjustments('no-such-marker-xyz-999', 1, 20);
assertCondition($noMatch['total'] === 0 && $noMatch['items'] === [], 'A non-matching search returns total=0 and an empty items list, not an error');

// TEST 5: item-level search (product SKU) also matches, via the EXISTS subquery.
$sku = $pdo->query("SELECT sku FROM product_variants WHERE id = {$variantId}")->fetchColumn();
$bySku = $inventoryService->listAdjustments((string) $sku, 1, 20);
assertCondition($bySku['total'] >= 3, "Searching by the variant's own SKU ('{$sku}') also matches via its line items, got {$bySku['total']}");

echo "\n--- Cleanup ---\n";
// inventory_movements is append-only (DB trigger blocks DELETE) — the 3
// movement rows this test created are left in place as real history,
// same as any other adjustment would be.
$placeholders = implode(',', $createdIds);
$pdo->exec("DELETE FROM stock_adjustment_items WHERE adjustment_id IN ({$placeholders})");
$pdo->exec("DELETE FROM stock_adjustments WHERE id IN ({$placeholders})");
$pdo->prepare('UPDATE inventory SET on_hand = :on_hand WHERE variant_id = :variant_id')
    ->execute(['on_hand' => $originalOnHand, 'variant_id' => $variantId]);
echo "✓ Cleaned up T21 test adjustment records and restored original on_hand ({$originalOnHand})\n";

echo "\n============================================\n";
echo "RESULT: {$passedCount} / {$totalTests} TESTS PASSED\n";
echo "============================================\n";
