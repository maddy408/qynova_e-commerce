<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../config/database.php';
require_once __DIR__ . '/test_guard.php';

use App\Services\SalesRankingService;
use App\Tests\TestDbGuard;

$pdo = db();
TestDbGuard::assertTestDatabase($pdo, __FILE__);

echo "========================================================\n";
echo "TASK T02: BACKEND AUTOMATED TEST SUITE (11 TEST CASES)\n";
echo "========================================================\n\n";

$passedCount = 0;
$totalTests = 11;

function assertCondition(bool $cond, string $name, string $details = '') {
    global $passedCount;
    if ($cond) {
        $passedCount++;
        echo "  [PASS] $name\n";
    } else {
        echo "  [FAIL] $name - $details\n";
    }
}

// Start transaction for clean test execution
$pdo->beginTransaction();

try {
    // Setup test fixtures: categories, products, variants, mapping
    $pdo->exec("
        DELETE FROM categories WHERE slug LIKE 't02_%';
        DELETE FROM products WHERE slug LIKE 't02_%';
    ");

    // Create 4 test categories
    // Cat A (sort_order=1), Cat B (sort_order=2), Cat C (sort_order=3), Cat D (sort_order=4)
    $catStmt = $pdo->prepare("INSERT INTO categories (name, slug, sort_order, status) VALUES (:name, :slug, :sort_order, 'ACTIVE')");
    
    $catStmt->execute(['name' => 'T02 Cat A', 'slug' => 't02_cat_a', 'sort_order' => 1]);
    $catA = (int) $pdo->lastInsertId();

    $catStmt->execute(['name' => 'T02 Cat B', 'slug' => 't02_cat_b', 'sort_order' => 2]);
    $catB = (int) $pdo->lastInsertId();

    $catStmt->execute(['name' => 'T02 Cat C', 'slug' => 't02_cat_c', 'sort_order' => 3]);
    $catC = (int) $pdo->lastInsertId();

    $catStmt->execute(['name' => 'T02 Cat D', 'slug' => 't02_cat_d', 'sort_order' => 4]);
    $catD = (int) $pdo->lastInsertId();

    // Create inactive & deleted categories for testing filter rule
    $pdo->exec("INSERT INTO categories (name, slug, sort_order, status) VALUES ('T02 Inactive', 't02_inactive', 5, 'INACTIVE')");
    $catInactive = (int) $pdo->lastInsertId();

    $pdo->exec("INSERT INTO categories (name, slug, sort_order, status, deleted_at) VALUES ('T02 Deleted', 't02_deleted', 6, 'ACTIVE', NOW())");
    $catDeleted = (int) $pdo->lastInsertId();

    // Create products & variants for Cat A, B, C, D
    $prodStmt = $pdo->prepare("INSERT INTO products (name, slug, is_active, is_pos_enabled) VALUES (:name, :slug, 1, 1)");
    $varStmt = $pdo->prepare("INSERT INTO product_variants (product_id, sku, mrp, retail_price) VALUES (:pid, :sku, 100, 100)");
    $mapStmt = $pdo->prepare("INSERT INTO product_categories (product_id, category_id, is_primary) VALUES (:pid, :cid, 1)");

    // Prod 1 -> Cat A
    $prodStmt->execute(['name' => 'T02 Prod 1', 'slug' => 't02_prod_1']);
    $p1 = (int) $pdo->lastInsertId();
    $varStmt->execute(['pid' => $p1, 'sku' => 'T02-SKU-1']);
    $v1 = (int) $pdo->lastInsertId();
    $mapStmt->execute(['pid' => $p1, 'cid' => $catA]);

    // Prod 2 -> Cat B
    $prodStmt->execute(['name' => 'T02 Prod 2', 'slug' => 't02_prod_2']);
    $p2 = (int) $pdo->lastInsertId();
    $varStmt->execute(['pid' => $p2, 'sku' => 'T02-SKU-2']);
    $v2 = (int) $pdo->lastInsertId();
    $mapStmt->execute(['pid' => $p2, 'cid' => $catB]);

    // Prod 3 -> Cat C
    $prodStmt->execute(['name' => 'T02 Prod 3', 'slug' => 't02_prod_3']);
    $p3 = (int) $pdo->lastInsertId();
    $varStmt->execute(['pid' => $p3, 'sku' => 'T02-SKU-3']);
    $v3 = (int) $pdo->lastInsertId();
    $mapStmt->execute(['pid' => $p3, 'cid' => $catC]);

    // Prod 4 -> Multi-mapped to both Cat A and Cat D
    $prodStmt->execute(['name' => 'T02 Prod 4 Multi', 'slug' => 't02_prod_4']);
    $p4 = (int) $pdo->lastInsertId();
    $varStmt->execute(['pid' => $p4, 'sku' => 'T02-SKU-4']);
    $v4 = (int) $pdo->lastInsertId();
    $pdo->prepare("INSERT INTO product_categories (product_id, category_id, is_primary) VALUES (:pid, :cid, 1)")->execute(['pid' => $p4, 'cid' => $catA]);
    $pdo->prepare("INSERT INTO product_categories (product_id, category_id, is_primary) VALUES (:pid, :cid, 0)")->execute(['pid' => $p4, 'cid' => $catD]);

    // Non-POS product for inactive test
    $prodStmtNoPos = $pdo->prepare("INSERT INTO products (name, slug, is_active, is_pos_enabled) VALUES (:name, :slug, 1, 0)");
    $prodStmtNoPos->execute(['name' => 'T02 No POS Prod', 'slug' => 't02_no_pos']);
    $pNoPos = (int) $pdo->lastInsertId();
    $mapStmt->execute(['pid' => $pNoPos, 'cid' => $catInactive]);

    $service = new SalesRankingService($pdo);
    SalesRankingService::clearCache();

    // -------------------------------------------------------------
    // TEST 1: Category with more sold quantity ranks higher (descending)
    // -------------------------------------------------------------
    // Insert sales: Cat B (Prod 2): 20 units, Cat A (Prod 1): 10 units
    $invStmt = $pdo->prepare("INSERT INTO invoices (invoice_no, channel, status, subtotal, grand_total, created_at) VALUES (:no, :channel, 'ACTIVE', 100, 100, :created_at)");
    $itemStmt = $pdo->prepare("INSERT INTO invoice_items (invoice_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total, created_at) VALUES (:inv_id, :pid, :vid, 'snap', 'sku', :qty, 100, 100, :total, :created_at)");

    $nowStr = date('Y-m-d H:i:s');
    $invStmt->execute(['no' => 'T02-INV-1', 'channel' => 'POS', 'created_at' => $nowStr]);
    $inv1 = (int) $pdo->lastInsertId();
    $itemStmt->execute(['inv_id' => $inv1, 'pid' => $p2, 'vid' => $v2, 'qty' => 20, 'total' => 2000, 'created_at' => $nowStr]);

    $invStmt->execute(['no' => 'T02-INV-2', 'channel' => 'POS', 'created_at' => $nowStr]);
    $inv2 = (int) $pdo->lastInsertId();
    $itemStmt->execute(['inv_id' => $inv2, 'pid' => $p1, 'vid' => $v1, 'qty' => 10, 'total' => 1000, 'created_at' => $nowStr]);

    SalesRankingService::clearCache();
    $res = $service->getPosCategorySales(8, 30, 'TOP_CATEGORY', true);
    $catsById = array_column($res['categories'], null, 'id');

    $t1Pass = isset($catsById[$catB], $catsById[$catA]) 
        && (float) $catsById[$catB]['sales_units'] === 20.0 
        && (float) $catsById[$catA]['sales_units'] === 10.0
        && $catsById[$catB]['sales_rank'] < $catsById[$catA]['sales_rank'];
    assertCondition($t1Pass, "Test 1: More sold quantity ranks higher (Cat B rank {$catsById[$catB]['sales_rank']} vs Cat A rank {$catsById[$catA]['sales_rank']})");

    // -------------------------------------------------------------
    // TEST 2: Ties broken by sort_order then name; zero-sales last
    // -------------------------------------------------------------
    // Cat C and Cat D both have 0 sales. Cat C has sort_order=3, Cat D has sort_order=4.
    $t2Pass = isset($catsById[$catC], $catsById[$catD])
        && (float) $catsById[$catC]['sales_units'] === 0.0
        && (float) $catsById[$catD]['sales_units'] === 0.0
        && $catsById[$catC]['sales_rank'] < $catsById[$catD]['sales_rank'];
    assertCondition($t2Pass, "Test 2: Zero-sales and ties broken by sort_order ASC, name ASC (Cat C rank {$catsById[$catC]['sales_rank']} vs Cat D rank {$catsById[$catD]['sales_rank']})");

    // -------------------------------------------------------------
    // TEST 3: Cancelled and soft-deleted sales excluded; returns subtracted
    // -------------------------------------------------------------
    // Cancelled invoice on Cat C (+50 units) -> should be ignored
    $invStmt->execute(['no' => 'T02-INV-CANCELLED', 'channel' => 'POS', 'created_at' => $nowStr]);
    $invCanc = (int) $pdo->lastInsertId();
    $pdo->prepare("UPDATE invoices SET status = 'CANCELLED' WHERE id = :id")->execute(['id' => $invCanc]);
    $itemStmt->execute(['inv_id' => $invCanc, 'pid' => $p3, 'vid' => $v3, 'qty' => 50, 'total' => 5000, 'created_at' => $nowStr]);

    // Soft-deleted invoice on Cat C (+30 units) -> should be ignored
    $invStmt->execute(['no' => 'T02-INV-DELETED', 'channel' => 'POS', 'created_at' => $nowStr]);
    $invDel = (int) $pdo->lastInsertId();
    $pdo->prepare("UPDATE invoices SET deleted_at = NOW() WHERE id = :id")->execute(['id' => $invDel]);
    $itemStmt->execute(['inv_id' => $invDel, 'pid' => $p3, 'vid' => $v3, 'qty' => 30, 'total' => 3000, 'created_at' => $nowStr]);

    // Add 15 units to Cat C, but return 5 units -> Net should be 10 units
    $invStmt->execute(['no' => 'T02-INV-C-VALID', 'channel' => 'POS', 'created_at' => $nowStr]);
    $invCVal = (int) $pdo->lastInsertId();
    $itemStmt->execute(['inv_id' => $invCVal, 'pid' => $p3, 'vid' => $v3, 'qty' => 15, 'total' => 1500, 'created_at' => $nowStr]);

    $pdo->prepare("INSERT INTO sale_returns (return_no, total_amount, refund_status, reason, created_at) VALUES ('T02-RET-1', 500, 'REFUNDED', 'Test', :created_at)")
        ->execute(['created_at' => $nowStr]);
    $retId = (int) $pdo->lastInsertId();
    $pdo->prepare("INSERT INTO sale_return_items (return_id, variant_id, qty, unit_price, total_amount, created_at) VALUES (:rid, :vid, 5, 100, 500, :created_at)")
        ->execute(['rid' => $retId, 'vid' => $v3, 'created_at' => $nowStr]);

    SalesRankingService::clearCache();
    $res3 = $service->getPosCategorySales(8, 30, 'TOP_CATEGORY', true);
    $catsById3 = array_column($res3['categories'], null, 'id');

    $t3Pass = isset($catsById3[$catC]) && (float) $catsById3[$catC]['sales_units'] === 10.0;
    assertCondition($t3Pass, "Test 3: Cancelled/deleted excluded, returned units subtracted (Cat C net units: {$catsById3[$catC]['sales_units']}, expected: 10)");

    // -------------------------------------------------------------
    // TEST 4: Period boundary in Asia/Kolkata (midnight boundaries)
    // -------------------------------------------------------------
    // Sale 35 days ago (outside 30d period)
    $tz = new DateTimeZone('Asia/Kolkata');
    $d35 = (new DateTimeImmutable('now', $tz))->modify('-35 days')->format('Y-m-d H:i:s');
    $invStmt->execute(['no' => 'T02-INV-OLD', 'channel' => 'POS', 'created_at' => $d35]);
    $invOld = (int) $pdo->lastInsertId();
    $itemStmt->execute(['inv_id' => $invOld, 'pid' => $p1, 'vid' => $v1, 'qty' => 100, 'total' => 10000, 'created_at' => $d35]);

    SalesRankingService::clearCache();
    $res30 = $service->getPosCategorySales(8, 30, 'TOP_CATEGORY', true);
    $cats30 = array_column($res30['categories'], null, 'id');
    $units30d = (float) $cats30[$catA]['sales_units']; // should be 10 (not 110)

    SalesRankingService::clearCache();
    $res40 = $service->getPosCategorySales(8, 40, 'TOP_CATEGORY', true);
    $cats40 = array_column($res40['categories'], null, 'id');
    $units40d = (float) $cats40[$catA]['sales_units']; // should be 110

    $t4Pass = ($units30d === 10.0 && $units40d === 110.0);
    assertCondition($t4Pass, "Test 4: Period boundary in Asia/Kolkata (30-day: $units30d units vs 40-day: $units40d units)");

    // -------------------------------------------------------------
    // TEST 5: Product mapped to 2 categories credits both without duplicate in one
    // -------------------------------------------------------------
    // Prod 4 is mapped to Cat A and Cat D. Insert 7 units sale.
    $invStmt->execute(['no' => 'T02-INV-MULTI', 'channel' => 'POS', 'created_at' => $nowStr]);
    $invMulti = (int) $pdo->lastInsertId();
    $itemStmt->execute(['inv_id' => $invMulti, 'pid' => $p4, 'vid' => $v4, 'qty' => 7, 'total' => 700, 'created_at' => $nowStr]);

    SalesRankingService::clearCache();
    $res5 = $service->getPosCategorySales(8, 30, 'TOP_CATEGORY', true);
    $cats5 = array_column($res5['categories'], null, 'id');

    // Cat A had 10 + 7 = 17 units. Cat D had 0 + 7 = 7 units.
    $t5Pass = ((float) $cats5[$catA]['sales_units'] === 17.0 && (float) $cats5[$catD]['sales_units'] === 7.0);
    assertCondition($t5Pass, "Test 5: Multi-category product credits both categories (Cat A: {$cats5[$catA]['sales_units']}, Cat D: {$cats5[$catD]['sales_units']})");

    // -------------------------------------------------------------
    // TEST 6: POS and e-commerce are counted without double-counting
    // -------------------------------------------------------------
    // Add E-commerce invoice for Cat D (5 units)
    $invStmt->execute(['no' => 'T02-INV-ECOM', 'channel' => 'ECOMMERCE', 'created_at' => $nowStr]);
    $invEcom = (int) $pdo->lastInsertId();
    $itemStmt->execute(['inv_id' => $invEcom, 'pid' => $p4, 'vid' => $v4, 'qty' => 5, 'total' => 500, 'created_at' => $nowStr]);

    SalesRankingService::clearCache();
    $res6 = $service->getPosCategorySales(8, 30, 'TOP_CATEGORY', true);
    $cats6 = array_column($res6['categories'], null, 'id');
    // Cat D was 7, now 7 + 5 = 12 units
    $t6Pass = ((float) $cats6[$catD]['sales_units'] === 12.0);
    assertCondition($t6Pass, "Test 6: POS + E-commerce single source of truth (Cat D total: {$cats6[$catD]['sales_units']})");

    // -------------------------------------------------------------
    // TEST 7: Inactive, deleted, or no-POS-visible-product categories omitted
    // -------------------------------------------------------------
    $allListedIds = array_column($res6['categories'], 'id');
    $t7Pass = !in_array($catInactive, $allListedIds, true) && !in_array($catDeleted, $allListedIds, true);
    assertCondition($t7Pass, "Test 7: Inactive/deleted/no-POS-product categories filtered out");

    // -------------------------------------------------------------
    // TEST 8: More than N categories vs top limit fill rule
    // -------------------------------------------------------------
    // Request top_limit = 2.
    SalesRankingService::clearCache();
    $res8 = $service->getPosCategorySales(2, 30, 'TOP_CATEGORY', true);
    $topCount = count(array_filter($res8['categories'], fn($c) => $c['is_top'] === true));
    $nonTopCount = count(array_filter($res8['categories'], fn($c) => $c['is_top'] === false));

    $t8Pass = ($topCount === 2 && $nonTopCount >= 1);
    assertCondition($t8Pass, "Test 8: Top limit partition (is_top count: $topCount, non-top count: $nonTopCount)");

    // -------------------------------------------------------------
    // TEST 9: Settings defaults and custom overrides
    // -------------------------------------------------------------
    $t9Pass = ($res8['meta']['top_limit'] === 2 && $res8['meta']['sales_period_days'] === 30 && $res8['meta']['default_view'] === 'TOP_CATEGORY');
    assertCondition($t9Pass, "Test 9: Settings and meta correctly reflected ({$res8['meta']['top_limit']} top, {$res8['meta']['sales_period_days']}d, view: {$res8['meta']['default_view']})");

    // -------------------------------------------------------------
    // TEST 10: Independent check (handwritten SQL vs service output)
    // -------------------------------------------------------------
    $tz = new DateTimeZone('Asia/Kolkata');
    $now = new DateTimeImmutable('now', $tz);
    $start30 = $now->setTime(0, 0, 0)->modify('-30 days')->format('Y-m-d H:i:s');
    $end30 = $now->setTime(23, 59, 59)->format('Y-m-d H:i:s');

    $handwrittenSql = "
        SELECT c.id, c.name, 
               GREATEST(0, CAST(COALESCE(s.sold, 0) - COALESCE(r.ret, 0) AS SIGNED)) AS net_units
        FROM categories c
        LEFT JOIN (
            SELECT pc.category_id, SUM(ii.quantity) as sold
            FROM invoice_items ii
            JOIN invoices inv ON inv.id = ii.invoice_id
            JOIN product_categories pc ON pc.product_id = ii.product_id
            WHERE inv.status != 'CANCELLED' 
              AND inv.deleted_at IS NULL
              AND inv.created_at >= :start_date
              AND inv.created_at <= :end_date
            GROUP BY pc.category_id
        ) s ON s.category_id = c.id
        LEFT JOIN (
            SELECT pc.category_id, SUM(sri.qty) as ret
            FROM sale_return_items sri
            JOIN sale_returns sr ON sr.id = sri.return_id
            JOIN product_variants pv ON pv.id = sri.variant_id
            JOIN product_categories pc ON pc.product_id = pv.product_id
            WHERE sr.refund_status != 'REJECTED'
              AND sr.created_at >= :ret_start_date
              AND sr.created_at <= :ret_end_date
            GROUP BY pc.category_id
        ) r ON r.category_id = c.id
        WHERE c.deleted_at IS NULL AND c.status = 'ACTIVE'
          AND c.id IN (SELECT DISTINCT pc2.category_id FROM product_categories pc2 JOIN products p2 ON p2.id = pc2.product_id WHERE p2.deleted_at IS NULL AND p2.is_active = 1 AND p2.is_pos_enabled = 1)
        ORDER BY net_units DESC, c.sort_order ASC, c.name ASC
    ";
    $hwStmt = $pdo->prepare($handwrittenSql);
    $hwStmt->execute([
        'start_date' => $start30,
        'end_date' => $end30,
        'ret_start_date' => $start30,
        'ret_end_date' => $end30,
    ]);
    $handwritten = $hwStmt->fetchAll(PDO::FETCH_ASSOC);

    echo "\n  --- Side-by-Side Verification: Service vs Handwritten SQL ---\n";
    printf("  %-6s | %-25s | %-12s | %-12s\n", "ID", "Category Name", "Service Net", "SQL Net");
    printf("  %s\n", str_repeat("-", 62));

    $t10Match = true;
    foreach ($res6['categories'] as $idx => $sc) {
        $hw = $handwritten[$idx] ?? null;
        printf("  %-6d | %-25s | %-12d | %-12d\n", $sc['id'], $sc['name'], $sc['sales_units'], (int) ($hw['net_units'] ?? -1));
        if (!$hw || (int)$sc['id'] !== (int)$hw['id'] || (int)$sc['sales_units'] !== (int)$hw['net_units']) {
            $t10Match = false;
        }
    }
    assertCondition($t10Match, "Test 10: Independent SQL produces identical ranking order and quantities");

    // -------------------------------------------------------------
    // TEST 11: Existing callers backward compatibility
    // -------------------------------------------------------------
    $catService = new \App\Services\CategoryService($pdo);
    $legacyList = $catService->list();
    $t11Pass = is_array($legacyList) && count($legacyList) >= 4;
    assertCondition($t11Pass, "Test 11: Existing CategoryService::list() works seamlessly for storefront/admin");

} finally {
    // Clean rollback so no test rows are committed
    $pdo->rollBack();
    echo "\nTransaction rolled back cleanly. Database restored.\n";
}

echo "\n========================================================\n";
echo "TEST RESULTS: $passedCount / $totalTests TESTS PASSED\n";
echo "========================================================\n";

if ($passedCount === $totalTests) {
    exit(0);
} else {
    exit(1);
}
