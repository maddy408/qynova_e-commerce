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
echo "TASK T03 HIGH-VOLUME ITEM LISTING BENCHMARK (5,000 Products / 100,000 Items)\n";
echo "======================================================================\n\n";

$pdo->beginTransaction();
try {
    SalesRankingService::clearCache();

    echo "1. Seeding 20 categories, 5,000 products, 5,000 variants, 20,000 invoices, 100,000 invoice_items...\n";
    $startSeed = microtime(true);

    $now = date('Y-m-d H:i:s');

    // 20 categories
    $catSql = "INSERT INTO categories (id, name, slug, status, sort_order, created_at) VALUES ";
    $catValues = [];
    for ($i = 1; $i <= 20; $i++) {
        $cId = 8000 + $i;
        $catValues[] = "($cId, 'Bench Cat $i', 'bench-cat-$i', 'ACTIVE', $i, '$now')";
    }
    $pdo->exec($catSql . implode(',', $catValues));

    // 5,000 products & variants
    $batchSize = 1000;
    for ($b = 0; $b < 5; $b++) {
        $pSql = "INSERT INTO products (id, name, slug, is_active, is_pos_enabled, created_at) VALUES ";
        $vSql = "INSERT INTO product_variants (id, product_id, sku, barcode, mrp, retail_price, status, created_at) VALUES ";
        $pcSql = "INSERT INTO product_categories (product_id, category_id, is_primary) VALUES ";

        $pVals = [];
        $vVals = [];
        $pcVals = [];

        for ($i = 1; $i <= $batchSize; $i++) {
            $num = $b * $batchSize + $i;
            $pId = 8000 + $num;
            $catId = 8000 + (($num % 20) + 1);
            $name = sprintf("Bench Product %04d", $num);
            $sku = sprintf("BENCH-SKU-%04d", $num);
            $barcode = sprintf("BAR-%05d", $num);

            $pVals[] = "($pId, '$name', 'bench-p-$num', 1, 1, '$now')";
            $vVals[] = "($pId, $pId, '$sku', '$barcode', 100, 100, 'ACTIVE', '$now')";
            $pcVals[] = "($pId, $catId, 1)";
        }

        $pdo->exec($pSql . implode(',', $pVals));
        $pdo->exec($vSql . implode(',', $vVals));
        $pdo->exec($pcSql . implode(',', $pcVals));
    }

    // 20,000 invoices and 100,000 invoice_items
    $invBatch = 2000;
    for ($b = 0; $b < 10; $b++) {
        $invSql = "INSERT INTO invoices (id, invoice_no, channel, status, subtotal, grand_total, created_at) VALUES ";
        $itemSql = "INSERT INTO invoice_items (id, invoice_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total, created_at) VALUES ";

        $invVals = [];
        $itemVals = [];

        for ($i = 1; $i <= $invBatch; $i++) {
            $invNum = $b * $invBatch + $i;
            $invId = 80000 + $invNum;
            $invVals[] = "($invId, 'INV-BENCH-$invNum', 'POS', 'ACTIVE', 500, 500, '$now')";

            for ($k = 1; $k <= 5; $k++) {
                $itemId = ($invNum - 1) * 5 + $k;
                $vId = 8000 + (($itemId % 5000) + 1);
                $qty = ($itemId % 10) + 1;
                $itemVals[] = "($itemId, $invId, $vId, $vId, 'Snap', 'SKU', $qty, 100, 100, " . ($qty*100) . ", '$now')";
            }
        }

        $pdo->exec($invSql . implode(',', $invVals));
        $pdo->exec($itemSql . implode(',', $itemVals));
    }

    $seedDuration = round(microtime(true) - $startSeed, 2);
    echo "  Seeding completed in {$seedDuration} seconds.\n\n";

    $invService = new InventoryService($pdo);

    // 2. Cold Request Benchmark (No cache file)
    SalesRankingService::clearCache();
    echo "2. Measuring Cold Request (uncached computation over 100,000 items)...\n";
    $startCold = microtime(true);
    $coldResult = $invService->listAllStock(null, 1, 50, posOnly: true);
    $coldTimeMs = round((microtime(true) - $startCold) * 1000, 2);
    echo "  Cold Request Time (Page 1 of 50 items): {$coldTimeMs} ms\n";
    echo "  Total items returned in total count: {$coldResult['total']}\n\n";

    // 3. Warm Request Benchmark (With persistent file cache)
    echo "3. Measuring Warm Request (cached ranking map)...\n";
    $startWarm = microtime(true);
    $warmResult = $invService->listAllStock(null, 1, 50, posOnly: true);
    $warmTimeMs = round((microtime(true) - $startWarm) * 1000, 2);
    echo "  Warm Request Time (Page 1 of 50 items): {$warmTimeMs} ms\n";

    // Page 2 warm request
    $startWarm2 = microtime(true);
    $warmResult2 = $invService->listAllStock(null, 2, 50, posOnly: true);
    $warmTimeMs2 = round((microtime(true) - $startWarm2) * 1000, 2);
    echo "  Warm Request Time (Page 2 of 50 items): {$warmTimeMs2} ms\n";

    // Category filtered warm request
    $startWarmCat = microtime(true);
    $warmCatResult = $invService->listAllStock(null, 1, 50, posOnly: true, categoryId: 8001);
    $warmCatTimeMs = round((microtime(true) - $startWarmCat) * 1000, 2);
    echo "  Warm Request Time (Category Filtered): {$warmCatTimeMs} ms (Total in cat: {$warmCatResult['total']})\n\n";

    // 4. EXPLAIN Plan for the Uncached Variant Aggregation Query
    echo "4. EXPLAIN Plan for Variant Sales Aggregation Query:\n";
    $explainSql = "
        EXPLAIN
        SELECT 
            ii.variant_id,
            ROUND(GREATEST(0, COALESCE(SUM(ii.quantity), 0) - COALESCE(returns.ret_qty, 0)), 3) AS net_units
        FROM invoice_items ii
        JOIN invoices inv ON inv.id = ii.invoice_id
        LEFT JOIN (
            SELECT sri.variant_id, SUM(sri.qty) AS ret_qty
            FROM sale_return_items sri
            JOIN sale_returns sr ON sr.id = sri.return_id
            WHERE sr.refund_status != 'REJECTED'
            GROUP BY sri.variant_id
        ) returns ON returns.variant_id = ii.variant_id
        WHERE inv.status != 'CANCELLED'
          AND inv.deleted_at IS NULL
        GROUP BY ii.variant_id
        HAVING net_units > 0
    ";
    $explainRows = $pdo->query($explainSql)->fetchAll(PDO::FETCH_ASSOC);
    foreach ($explainRows as $row) {
        printf("  Table: %-15s | Type: %-8s | Key: %-25s | Rows: %-8s | Extra: %s\n", 
            $row['table'] ?? '', 
            $row['type'] ?? '', 
            $row['key'] ?? 'NULL', 
            $row['rows'] ?? '', 
            $row['Extra'] ?? ''
        );
    }

    echo "\n5. Top 5 Ranked Products in Volume Dataset:\n";
    foreach (array_slice($warmResult['items'], 0, 5) as $idx => $item) {
        $rank = $idx + 1;
        echo "  #$rank: {$item['product_name']} ({$item['sku']}) - {$item['sales_units']} units\n";
    }

} finally {
    $pdo->rollBack();
    SalesRankingService::clearCache();
    echo "\nVolume benchmark transaction rolled back cleanly. Dev DB intact.\n";
}
