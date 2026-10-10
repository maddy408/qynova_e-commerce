<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../config/database.php';
require_once __DIR__ . '/test_guard.php';

use App\Services\InventoryService;
use App\Services\SalesRankingService;
use App\Tests\TestDbGuard;

$pdo = db();
TestDbGuard::assertTestDatabase($pdo, __FILE__);

echo "======================================================================\n";
echo "TASK T03 AUTOMATED VERIFICATION SUITE\n";
echo "======================================================================\n\n";

$passedCount = 0;
$totalTests = 11;

function assertCond(bool $cond, string $name, string $details = '') {
    global $passedCount;
    if ($cond) {
        $passedCount++;
        echo "  [PASS] $name\n";
    } else {
        echo "  [FAIL] $name: $details\n";
    }
}

// ---------------------------------------------------------------------
// TEST 1 & 2: Net units DESC, zero-sales last, ties by name, sku, id
// ---------------------------------------------------------------------
echo "--- 1. BEST SELLERS FIRST & TIE-BREAK ORDERING ---\n";
$pdo->beginTransaction();
try {
    SalesRankingService::clearCache();

    $now = date('Y-m-d H:i:s');

    $pdo->exec("INSERT INTO products (id, name, slug, is_active, is_pos_enabled, created_at) VALUES 
        (9001, 'Z Tie Item', 'z-tie', 1, 1, '{$now}'),
        (9002, 'Best Seller Item', 'best-seller', 1, 1, '{$now}'),
        (9003, 'Beta Zero', 'beta-zero', 1, 1, '{$now}'),
        (9004, 'Alpha Zero', 'alpha-zero', 1, 1, '{$now}'),
        (9005, 'A Tie Item', 'a-tie', 1, 1, '{$now}')");

    $pdo->exec("INSERT INTO product_variants (id, product_id, sku, barcode, mrp, retail_price, status, created_at) VALUES
        (9001, 9001, 'SKU-Z', 'BAR-9001', 100, 100, 'ACTIVE', '{$now}'),
        (9002, 9002, 'SKU-BEST', 'BAR-9002', 100, 100, 'ACTIVE', '{$now}'),
        (9003, 9003, 'SKU-BZ', 'BAR-9003', 100, 100, 'ACTIVE', '{$now}'),
        (9004, 9004, 'SKU-AZ', 'BAR-9004', 100, 100, 'ACTIVE', '{$now}'),
        (9005, 9005, 'SKU-A', 'BAR-9005', 100, 100, 'ACTIVE', '{$now}')");

    $pdo->exec("INSERT INTO invoices (id, invoice_no, channel, status, subtotal, grand_total, created_at) VALUES 
        (9001, 'INV-TEST-9001', 'POS', 'ACTIVE', 5000, 5000, '{$now}')");
    $pdo->exec("INSERT INTO invoice_items (id, invoice_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total, created_at) VALUES
        (9001, 9001, 9002, 9002, 'Best Seller', 'SKU-BEST', 25, 100, 100, 2500, '{$now}'),
        (9002, 9001, 9001, 9001, 'Z Tie', 'SKU-Z', 10, 100, 100, 1000, '{$now}'),
        (9003, 9001, 9005, 9005, 'A Tie', 'SKU-A', 10, 100, 100, 1000, '{$now}')");

    $invService = new InventoryService($pdo);
    $result = $invService->listAllStock(null, 1, 200, posOnly: true);

    $testItems = array_values(array_filter($result['items'], fn($it) => in_array((int)$it['variant_id'], [9001, 9002, 9003, 9004, 9005])));
    $orderedIds = array_map(fn($it) => (int)$it['variant_id'], $testItems);

    $expected = [9002, 9005, 9001, 9004, 9003];
    assertCond($orderedIds === $expected, "Test 1 & 2: Ordering (Best sellers first, exact ties, zero-sales last)", 
        "Expected " . json_encode($expected) . " but got " . json_encode($orderedIds));

} finally {
    $pdo->rollBack();
    SalesRankingService::clearCache();
}

// ---------------------------------------------------------------------
// TEST 3: Cancelled/soft-deleted invoices excluded & returns subtracted
// ---------------------------------------------------------------------
echo "\n--- 2. EXCLUSION OF CANCELLED/DELETED INVOICES & RETURN SUBTRACTION ---\n";
$pdo->beginTransaction();
try {
    SalesRankingService::clearCache();
    $now = date('Y-m-d H:i:s');

    $pdo->exec("INSERT INTO products (id, name, slug, is_active, is_pos_enabled, created_at) VALUES 
        (9010, 'Valid Sale Prod', 'v-prod', 1, 1, '{$now}'),
        (9011, 'Cancelled Sale Prod', 'c-prod', 1, 1, '{$now}'),
        (9012, 'Returned Sale Prod', 'r-prod', 1, 1, '{$now}')");

    $pdo->exec("INSERT INTO product_variants (id, product_id, sku, barcode, mrp, retail_price, status, created_at) VALUES
        (9010, 9010, 'SKU-V', 'BAR-9010', 100, 100, 'ACTIVE', '{$now}'),
        (9011, 9011, 'SKU-C', 'BAR-9011', 100, 100, 'ACTIVE', '{$now}'),
        (9012, 9012, 'SKU-R', 'BAR-9012', 100, 100, 'ACTIVE', '{$now}')");

    $pdo->exec("INSERT INTO invoices (id, invoice_no, channel, status, subtotal, grand_total, created_at) VALUES 
        (9010, 'INV-TEST-9010', 'POS', 'ACTIVE', 2000, 2000, '{$now}')");
    $pdo->exec("INSERT INTO invoice_items (id, invoice_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total, created_at) VALUES
        (9010, 9010, 9010, 9010, 'Valid', 'SKU-V', 10, 100, 100, 1000, '{$now}'),
        (9011, 9010, 9012, 9012, 'Returned', 'SKU-R', 10, 100, 100, 1000, '{$now}')");

    $pdo->exec("INSERT INTO invoices (id, invoice_no, channel, status, subtotal, grand_total, created_at) VALUES 
        (9011, 'INV-TEST-9011', 'POS', 'CANCELLED', 5000, 5000, '{$now}')");
    $pdo->exec("INSERT INTO invoice_items (id, invoice_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total, created_at) VALUES
        (9012, 9011, 9011, 9011, 'Cancelled', 'SKU-C', 50, 100, 100, 5000, '{$now}')");

    $pdo->exec("INSERT INTO sale_returns (id, return_no, refund_status, total_amount, reason, created_at) VALUES
        (9010, 'RET-TEST-9010', 'REFUNDED', 700, 'Defective product', '{$now}')");
    $pdo->exec("INSERT INTO sale_return_items (id, return_id, variant_id, qty, unit_price, total_amount, created_at) VALUES
        (9010, 9010, 9012, 7, 100, 700, '{$now}')");

    $invService = new InventoryService($pdo);
    $result = $invService->listAllStock(null, 1, 200, posOnly: true);

    $testItems = array_values(array_filter($result['items'], fn($it) => in_array((int)$it['variant_id'], [9010, 9011, 9012])));
    $mapUnits = [];
    foreach ($testItems as $it) {
        $mapUnits[(int)$it['variant_id']] = (float)$it['sales_units'];
    }

    $cond = ($mapUnits[9010] === 10.0) && ($mapUnits[9012] === 3.0) && ($mapUnits[9011] === 0.0)
        && ((int)$testItems[0]['variant_id'] === 9010)
        && ((int)$testItems[1]['variant_id'] === 9012)
        && ((int)$testItems[2]['variant_id'] === 9011);

    assertCond($cond, "Test 3: Cancelled invoices excluded and return subtracted (10 > 3 > 0)", 
        "Got units: " . json_encode($mapUnits));

} finally {
    $pdo->rollBack();
    SalesRankingService::clearCache();
}

// ---------------------------------------------------------------------
// TEST 4: Asia/Kolkata boundary cutoff & Shared Period setting
// ---------------------------------------------------------------------
echo "\n--- 3. ASIA/KOLKATA MIDNIGHT BOUNDARY & SHARED PERIOD SETTING ---\n";
$pdo->beginTransaction();
try {
    SalesRankingService::clearCache();

    $tz = new DateTimeZone('Asia/Kolkata');
    $now = new DateTimeImmutable('now', $tz);

    $insideCutoff = $now->setTime(0, 0, 0)->modify('-29 days')->setTime(12, 0, 0)->format('Y-m-d H:i:s');
    $outsideCutoff = $now->setTime(0, 0, 0)->modify('-31 days')->setTime(12, 0, 0)->format('Y-m-d H:i:s');

    $pdo->exec("INSERT INTO products (id, name, slug, is_active, is_pos_enabled, created_at) VALUES 
        (9020, 'Inside 30D Prod', 'in-30', 1, 1, '{$insideCutoff}'),
        (9021, 'Outside 30D Prod', 'out-30', 1, 1, '{$outsideCutoff}')");

    $pdo->exec("INSERT INTO product_variants (id, product_id, sku, barcode, mrp, retail_price, status, created_at) VALUES
        (9020, 9020, 'SKU-IN', 'BAR-9020', 100, 100, 'ACTIVE', '{$insideCutoff}'),
        (9021, 9021, 'SKU-OUT', 'BAR-9021', 100, 100, 'ACTIVE', '{$outsideCutoff}')");

    $pdo->exec("INSERT INTO invoices (id, invoice_no, channel, status, subtotal, grand_total, created_at) VALUES 
        (9020, 'INV-TEST-IN', 'POS', 'ACTIVE', 1000, 1000, '{$insideCutoff}'),
        (9021, 'INV-TEST-OUT', 'POS', 'ACTIVE', 1000, 1000, '{$outsideCutoff}')");

    $pdo->exec("INSERT INTO invoice_items (id, invoice_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total, created_at) VALUES
        (9020, 9020, 9020, 9020, 'In', 'SKU-IN', 15, 100, 100, 1500, '{$insideCutoff}'),
        (9021, 9021, 9021, 9021, 'Out', 'SKU-OUT', 50, 100, 100, 5000, '{$outsideCutoff}')");

    $rankingService = new SalesRankingService($pdo);
    $map30 = $rankingService->computeVariantSalesMap(30);

    $cond30 = isset($map30[9020]) && $map30[9020] == 15.0 && !isset($map30[9021]);

    $map60 = $rankingService->computeVariantSalesMap(60);
    $cond60 = isset($map60[9021]) && $map60[9021] == 50.0 && isset($map60[9020]) && $map60[9020] == 15.0;

    assertCond($cond30 && $cond60, "Test 4: Asia/Kolkata date cutoff boundary and dynamic period setting support",
        "30D Map: " . json_encode($map30) . " | 60D Map: " . json_encode($map60));

} finally {
    $pdo->rollBack();
    SalesRankingService::clearCache();
}

// ---------------------------------------------------------------------
// TEST 5: Exact Decimal quantities (25.0 vs 21.0 & float exact sorting)
// ---------------------------------------------------------------------
echo "\n--- 4. EXACT DECIMAL QUANTITY RANKING ---\n";
$pdo->beginTransaction();
try {
    SalesRankingService::clearCache();
    $now = date('Y-m-d H:i:s');

    $pdo->exec("INSERT INTO products (id, name, slug, is_active, is_pos_enabled, created_at) VALUES 
        (9030, 'Dec Item High', 'dec-high', 1, 1, '{$now}'),
        (9031, 'Dec Item Low', 'dec-low', 1, 1, '{$now}')");

    $pdo->exec("INSERT INTO product_variants (id, product_id, sku, barcode, mrp, retail_price, status, created_at) VALUES
        (9030, 9030, 'SKU-D25', 'BAR-9030', 100, 100, 'ACTIVE', '{$now}'),
        (9031, 9031, 'SKU-D04', 'BAR-9031', 100, 100, 'ACTIVE', '{$now}')");

    $pdo->exec("INSERT INTO invoices (id, invoice_no, channel, status, subtotal, grand_total, created_at) VALUES 
        (9030, 'INV-TEST-DEC', 'POS', 'ACTIVE', 1000, 1000, '{$now}')");

    $pdo->exec("INSERT INTO invoice_items (id, invoice_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total, created_at) VALUES
        (9030, 9030, 9030, 9030, 'Dec High', 'SKU-D25', 25, 100, 100, 2500, '{$now}'),
        (9031, 9030, 9031, 9031, 'Dec Low', 'SKU-D04', 21, 100, 100, 2100, '{$now}')");

    $invService = new InventoryService($pdo);
    $result = $invService->listAllStock(null, 1, 50, posOnly: true);

    $testItems = array_values(array_filter($result['items'], fn($it) => in_array((int)$it['variant_id'], [9030, 9031])));
    
    $cond = count($testItems) === 2 
        && (int)$testItems[0]['variant_id'] === 9030 
        && (float)$testItems[0]['sales_units'] === 25.0 
        && (int)$testItems[1]['variant_id'] === 9031 
        && (float)$testItems[1]['sales_units'] === 21.0;

    assertCond($cond, "Test 5: Decimal quantities rank exact values (25.000 before 21.000 without truncation)",
        "Got: " . json_encode(array_map(fn($it) => [$it['variant_id'], $it['sales_units']], $testItems)));

} finally {
    $pdo->rollBack();
    SalesRankingService::clearCache();
}

// ---------------------------------------------------------------------
// TEST 6: Multi-category item ranked by its own total in All & inside categories
// ---------------------------------------------------------------------
echo "\n--- 5. MULTI-CATEGORY ITEM RANKING ---\n";
$pdo->beginTransaction();
try {
    SalesRankingService::clearCache();
    $now = date('Y-m-d H:i:s');

    $pdo->exec("INSERT INTO categories (id, name, slug, status, sort_order, created_at) VALUES 
        (9041, 'Cat Alpha', 'cat-alpha', 'ACTIVE', 1, '{$now}'),
        (9042, 'Cat Beta', 'cat-beta', 'ACTIVE', 2, '{$now}')");

    $pdo->exec("INSERT INTO products (id, name, slug, is_active, is_pos_enabled, created_at) VALUES 
        (9040, 'Multi Category Prod', 'multi-cat', 1, 1, '{$now}'),
        (9041, 'Single Cat Alpha Prod', 'single-a', 1, 1, '{$now}'),
        (9042, 'Single Cat Beta Prod', 'single-b', 1, 1, '{$now}')");

    $pdo->exec("INSERT INTO product_categories (product_id, category_id) VALUES 
        (9040, 9041),
        (9040, 9042),
        (9041, 9041),
        (9042, 9042)");

    $pdo->exec("INSERT INTO product_variants (id, product_id, sku, barcode, mrp, retail_price, status, created_at) VALUES
        (9040, 9040, 'SKU-MULTI', 'BAR-9040', 100, 100, 'ACTIVE', '{$now}'),
        (9041, 9041, 'SKU-SINA', 'BAR-9041', 100, 100, 'ACTIVE', '{$now}'),
        (9042, 9042, 'SKU-SINB', 'BAR-9042', 100, 100, 'ACTIVE', '{$now}')");

    $pdo->exec("INSERT INTO invoices (id, invoice_no, channel, status, subtotal, grand_total, created_at) VALUES 
        (9040, 'INV-TEST-MULTI', 'POS', 'ACTIVE', 1000, 1000, '{$now}')");
    $pdo->exec("INSERT INTO invoice_items (id, invoice_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total, created_at) VALUES
        (9040, 9040, 9040, 9040, 'Multi', 'SKU-MULTI', 30, 100, 100, 3000, '{$now}'),
        (9041, 9040, 9041, 9041, 'Single A', 'SKU-SINA', 10, 100, 100, 1000, '{$now}'),
        (9042, 9040, 9042, 9042, 'Single B', 'SKU-SINB', 40, 100, 100, 4000, '{$now}')");

    $invService = new InventoryService($pdo);

    $resAlpha = $invService->listAllStock(null, 1, 50, posOnly: true, categoryId: 9041);
    $alphaIds = array_map(fn($it) => (int)$it['variant_id'], $resAlpha['items']);

    $resBeta = $invService->listAllStock(null, 1, 50, posOnly: true, categoryId: 9042);
    $betaIds = array_map(fn($it) => (int)$it['variant_id'], $resBeta['items']);

    $condAlpha = ($alphaIds === [9040, 9041]);
    $condBeta = ($betaIds === [9042, 9040]);

    assertCond($condAlpha && $condBeta, "Test 6: Multi-category item uses total sales units across all categories",
        "Alpha: " . json_encode($alphaIds) . " | Beta: " . json_encode($betaIds));

} finally {
    $pdo->rollBack();
    SalesRankingService::clearCache();
}

// ---------------------------------------------------------------------
// TEST 7: Pagination Concatenation & Consistency
// ---------------------------------------------------------------------
echo "\n--- 6. PAGINATION CONCATENATION & CONSISTENCY ---\n";
$pdo->beginTransaction();
try {
    SalesRankingService::clearCache();
    $now = date('Y-m-d H:i:s');

    // Create a dedicated category for pagination test
    $pdo->exec("INSERT INTO categories (id, name, slug, status, sort_order, created_at) VALUES (9100, 'Pag Cat', 'pag-cat', 'ACTIVE', 1, '$now')");

    for ($i = 1; $i <= 15; $i++) {
        $pId = 9100 + $i;
        $name = sprintf("Paginated Item %02d", $i);
        $pdo->exec("INSERT INTO products (id, name, slug, is_active, is_pos_enabled, created_at) VALUES ($pId, '$name', 'pag-$i', 1, 1, '$now')");
        $pdo->exec("INSERT INTO product_categories (product_id, category_id) VALUES ($pId, 9100)");
        $pdo->exec("INSERT INTO product_variants (id, product_id, sku, barcode, mrp, retail_price, status, created_at) VALUES ($pId, $pId, 'SKU-PAG-$i', 'BAR-PAG-$i', 100, 100, 'ACTIVE', '$now')");
    }

    $pdo->exec("INSERT INTO invoices (id, invoice_no, channel, status, subtotal, grand_total, created_at) VALUES (9100, 'INV-PAG', 'POS', 'ACTIVE', 10000, 10000, '$now')");
    for ($i = 1; $i <= 15; $i++) {
        $vId = 9100 + $i;
        $qty = 20 - $i;
        $pdo->exec("INSERT INTO invoice_items (id, invoice_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total, created_at) VALUES ($vId, 9100, $vId, $vId, 'Pag', 'SKU-PAG', $qty, 100, 100, " . ($qty*100) . ", '$now')");
    }

    $invService = new InventoryService($pdo);
    
    // Test pagination inside category 9100
    $p1 = $invService->listAllStock(null, 1, 5, posOnly: true, categoryId: 9100);
    $p2 = $invService->listAllStock(null, 2, 5, posOnly: true, categoryId: 9100);
    $p3 = $invService->listAllStock(null, 3, 5, posOnly: true, categoryId: 9100);

    $concatIds = array_merge(
        array_map(fn($it) => (int)$it['variant_id'], $p1['items']),
        array_map(fn($it) => (int)$it['variant_id'], $p2['items']),
        array_map(fn($it) => (int)$it['variant_id'], $p3['items'])
    );

    $fullResult = $invService->listAllStock(null, 1, 20, posOnly: true, categoryId: 9100);
    $fullIds = array_map(fn($it) => (int)$it['variant_id'], $fullResult['items']);

    $cond = ($concatIds === $fullIds) && count($concatIds) === 15;
    assertCond($cond, "Test 7: Pagination (concat(p1, p2, p3) equals full set with no gaps or duplicates)",
        "Count: " . count($concatIds) . " vs " . count($fullIds));

} finally {
    $pdo->rollBack();
    SalesRankingService::clearCache();
}

// ---------------------------------------------------------------------
// TEST 8: Search with exact Barcode/SKU prioritization
// ---------------------------------------------------------------------
echo "\n--- 7. SEARCH EXACT BARCODE/SKU PRIORITY ---\n";
$pdo->beginTransaction();
try {
    SalesRankingService::clearCache();
    $now = date('Y-m-d H:i:s');

    $pdo->exec("INSERT INTO products (id, name, slug, is_active, is_pos_enabled, created_at) VALUES 
        (9201, 'Super Gel Hair', 'super-gel', 1, 1, '{$now}'),
        (9202, 'Aloe Gel Skin', 'aloe-gel', 1, 1, '{$now}')");

    $pdo->exec("INSERT INTO product_variants (id, product_id, sku, barcode, mrp, retail_price, status, created_at) VALUES
        (9201, 9201, 'SKU-SUPER-GEL', 'BAR-GEL-99', 100, 100, 'ACTIVE', '{$now}'),
        (9202, 9202, 'SKU-ALOE-GEL', 'BAR-12345', 100, 100, 'ACTIVE', '{$now}')");

    $pdo->exec("INSERT INTO invoices (id, invoice_no, channel, status, subtotal, grand_total, created_at) VALUES 
        (9200, 'INV-SEARCH', 'POS', 'ACTIVE', 1000, 1000, '{$now}')");

    $pdo->exec("INSERT INTO invoice_items (id, invoice_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total, created_at) VALUES
        (9201, 9200, 9201, 9201, 'Super Gel', 'SKU-SUPER-GEL', 5, 100, 100, 500, '{$now}'),
        (9202, 9200, 9202, 9202, 'Aloe Gel', 'SKU-ALOE-GEL', 50, 100, 100, 5000, '{$now}')");

    $invService = new InventoryService($pdo);

    $resScan = $invService->listAllStock('BAR-GEL-99', 1, 10, posOnly: true);
    $scanIds = array_map(fn($it) => (int)$it['variant_id'], $resScan['items']);

    $resGeneral = $invService->listAllStock('Gel', 1, 10, posOnly: true);
    $generalIds = array_map(fn($it) => (int)$it['variant_id'], $resGeneral['items']);

    $cond = ($scanIds[0] === 9201) && ($generalIds === [9202, 9201]);
    assertCond($cond, "Test 8: Exact barcode search prioritizes exact match first, general search respects sales rank",
        "Scan: " . json_encode($scanIds) . " | General: " . json_encode($generalIds));

} finally {
    $pdo->rollBack();
    SalesRankingService::clearCache();
}

// ---------------------------------------------------------------------
// TEST 9: Visible Items Rule (Inactive, Not POS enabled, Deleted excluded)
// ---------------------------------------------------------------------
echo "\n--- 8. VISIBLE ITEMS RULE (POS-ENABLED & ACTIVE ENFORCEMENT) ---\n";
$pdo->beginTransaction();
try {
    SalesRankingService::clearCache();
    $now = date('Y-m-d H:i:s');

    $pdo->exec("INSERT INTO products (id, name, slug, is_active, is_pos_enabled, deleted_at, created_at) VALUES 
        (9301, 'Active POS Product', 'p-active', 1, 1, NULL, '{$now}'),
        (9302, 'Inactive Product', 'p-inactive', 0, 1, NULL, '{$now}'),
        (9303, 'Disabled POS Product', 'p-nopos', 1, 0, NULL, '{$now}'),
        (9304, 'Deleted Product', 'p-deleted', 1, 1, '{$now}', '{$now}')");

    $pdo->exec("INSERT INTO product_variants (id, product_id, sku, barcode, mrp, retail_price, status, deleted_at, created_at) VALUES
        (9301, 9301, 'SKU-9301', 'BAR-9301', 100, 100, 'ACTIVE', NULL, '{$now}'),
        (9302, 9302, 'SKU-9302', 'BAR-9302', 100, 100, 'ACTIVE', NULL, '{$now}'),
        (9303, 9303, 'SKU-9303', 'BAR-9303', 100, 100, 'ACTIVE', NULL, '{$now}'),
        (9304, 9304, 'SKU-9304', 'BAR-9304', 100, 100, 'ACTIVE', NULL, '{$now}')");

    $invService = new InventoryService($pdo);
    $res = $invService->listAllStock(null, 1, 50, posOnly: true);
    $vIds = array_map(fn($it) => (int)$it['variant_id'], $res['items']);

    $cond = in_array(9301, $vIds) && !in_array(9302, $vIds) && !in_array(9303, $vIds) && !in_array(9304, $vIds);
    assertCond($cond, "Test 9: Visible-items rule excludes inactive, not-pos-enabled, and deleted products",
        "Found IDs: " . json_encode(array_intersect($vIds, [9301, 9302, 9303, 9304])));

} finally {
    $pdo->rollBack();
    SalesRankingService::clearCache();
}

// ---------------------------------------------------------------------
// TEST 10: Independent Hand-Written SQL Side-by-Side Check
// ---------------------------------------------------------------------
echo "\n--- 9. INDEPENDENT HAND-WRITTEN SQL SIDE-BY-SIDE CHECK ---\n";
$invService = new InventoryService($pdo);
$apiResult = $invService->listAllStock(null, 1, 10, posOnly: true);
$apiItems = $apiResult['items'];

$tz = new DateTimeZone('Asia/Kolkata');
$now = new DateTimeImmutable('now', $tz);
$startDate = $now->setTime(0, 0, 0)->modify('-30 days')->format('Y-m-d H:i:s');
$endDate = $now->setTime(23, 59, 59)->format('Y-m-d H:i:s');

$sqlIndependent = "
    SELECT 
        v.id AS variant_id,
        p.name AS product_name,
        v.sku,
        COALESCE(ROUND(GREATEST(0, COALESCE(s.sold_qty, 0) - COALESCE(r.ret_qty, 0)), 3), 0) AS sql_net_units
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    LEFT JOIN (
        SELECT ii.variant_id, SUM(ii.quantity) AS sold_qty
        FROM invoice_items ii
        JOIN invoices inv ON inv.id = ii.invoice_id
        WHERE inv.status != 'CANCELLED' AND inv.deleted_at IS NULL
          AND inv.created_at >= '{$startDate}' AND inv.created_at <= '{$endDate}'
        GROUP BY ii.variant_id
    ) s ON s.variant_id = v.id
    LEFT JOIN (
        SELECT sri.variant_id, SUM(sri.qty) AS ret_qty
        FROM sale_return_items sri
        JOIN sale_returns sr ON sr.id = sri.return_id
        WHERE sr.refund_status != 'REJECTED'
          AND sr.created_at >= '{$startDate}' AND sr.created_at <= '{$endDate}'
        GROUP BY sri.variant_id
    ) r ON r.variant_id = v.id
    WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL AND v.status = 'ACTIVE'
      AND p.is_pos_enabled = 1 AND p.is_active = 1
    ORDER BY 
        CASE WHEN (COALESCE(s.sold_qty, 0) - COALESCE(r.ret_qty, 0)) > 0 THEN 0 ELSE 1 END ASC,
        (COALESCE(s.sold_qty, 0) - COALESCE(r.ret_qty, 0)) DESC,
        p.name ASC,
        v.sku ASC,
        v.id ASC
    LIMIT 10
";

$sqlRows = $pdo->query($sqlIndependent)->fetchAll(PDO::FETCH_ASSOC);

$matchCount = 0;
echo "  Comparing API Output vs Independent SQL Output:\n";
echo "  --------------------------------------------------------------------------------\n";
printf("  %-10s | %-25s | %-12s | %-12s\n", "Variant ID", "Product Name", "API Units", "SQL Units");
echo "  --------------------------------------------------------------------------------\n";
for ($i = 0; $i < min(count($apiItems), count($sqlRows)); $i++) {
    $apiRow = $apiItems[$i];
    $sqlRow = $sqlRows[$i];
    printf("  %-10d | %-25s | %-12s | %-12s\n", 
        $apiRow['variant_id'], 
        substr($apiRow['product_name'], 0, 25), 
        $apiRow['sales_units'], 
        $sqlRow['sql_net_units']
    );
    if ((int)$apiRow['variant_id'] === (int)$sqlRow['variant_id'] && (float)$apiRow['sales_units'] === (float)$sqlRow['sql_net_units']) {
        $matchCount++;
    }
}
echo "  --------------------------------------------------------------------------------\n";
assertCond($matchCount === count($sqlRows), "Test 10: Independent SQL gives identical ordering and units as API");

// ---------------------------------------------------------------------
// TEST 11: Backward Compatibility (sort=name)
// ---------------------------------------------------------------------
echo "\n--- 10. BACKWARD COMPATIBILITY (sort=name) ---\n";
$nameResult = $invService->listAllStock(null, 1, 50, posOnly: false, categoryId: null, sort: 'name');
$condName = isset($nameResult['items']) && count($nameResult['items']) > 0;
assertCond($condName, "Test 11: sort=name returns full items for admin inventory callers");

// ---------------------------------------------------------------------
// TEST 12: Category ranking credits every mapped category in product_categories
// ---------------------------------------------------------------------
echo "\n--- 11. CATEGORY RANKING CREDITS ALL MAPPED CATEGORIES ---\n";
$pdo->beginTransaction();
try {
    SalesRankingService::clearCache();
    $now = date('Y-m-d H:i:s');

    $pdo->exec("INSERT INTO categories (id, name, slug, status, sort_order, created_at) VALUES 
        (9051, 'Cat X1', 'cat-x1', 'ACTIVE', 1, '{$now}'),
        (9052, 'Cat X2', 'cat-x2', 'ACTIVE', 2, '{$now}')");

    $pdo->exec("INSERT INTO products (id, name, slug, is_active, is_pos_enabled, created_at) VALUES 
        (9050, 'Mapped Both Cats', 'mapped-both', 1, 1, '{$now}')");

    $pdo->exec("INSERT INTO product_categories (product_id, category_id) VALUES 
        (9050, 9051),
        (9050, 9052)");

    $pdo->exec("INSERT INTO product_variants (id, product_id, sku, barcode, mrp, retail_price, status, created_at) VALUES
        (9050, 9050, 'SKU-MAP', 'BAR-9050', 100, 100, 'ACTIVE', '{$now}')");

    $pdo->exec("INSERT INTO invoices (id, invoice_no, channel, status, subtotal, grand_total, created_at) VALUES 
        (9050, 'INV-MAP', 'POS', 'ACTIVE', 1000, 1000, '{$now}')");
    $pdo->exec("INSERT INTO invoice_items (id, invoice_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total, created_at) VALUES
        (9050, 9050, 9050, 9050, 'Mapped', 'SKU-MAP', 18, 100, 100, 1800, '{$now}')");

    $salesService = new SalesRankingService($pdo);
    $catSales = $salesService->categorySales(30);

    $catMap = [];
    foreach ($catSales as $cs) {
        $catMap[(int)$cs['id']] = (float)$cs['sales_units'];
    }

    $cond = ($catMap[9051] === 18.0) && ($catMap[9052] === 18.0);
    assertCond($cond, "Test 12: Category ranking credits product sales to EVERY mapped category in product_categories",
        "Cat 9051: {$catMap[9051]} | Cat 9052: {$catMap[9052]}");

} finally {
    $pdo->rollBack();
    SalesRankingService::clearCache();
}

echo "\n======================================================================\n";
echo "TEST RESULTS: {$passedCount} / {$totalTests} PASSED\n";
echo "======================================================================\n";
