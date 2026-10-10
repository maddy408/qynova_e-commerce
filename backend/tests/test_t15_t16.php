<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

putenv('DB_NAME=unified_pos_test');
$_ENV['DB_NAME'] = 'unified_pos_test';

require __DIR__ . '/../config/database.php';
require __DIR__ . '/test_guard.php';

use App\Services\ProductService;
use App\Services\CustomerActivityService;
use App\Services\DashboardService;
use App\Tests\TestDbGuard;

$pdo = db();
TestDbGuard::assertTestDatabase($pdo, __FILE__);

echo "Running T15 and T16 verification on " . $pdo->query("SELECT DATABASE()")->fetchColumn() . "...\n";

// 1. Verify T15: Popular Sale list
$productService = new ProductService($pdo);
$popular = $productService->list(['section' => 'popular_sale', 'limit' => 5]);
if (!isset($popular['items']) || !is_array($popular['items'])) {
    throw new RuntimeException("T15 Failed: list with section=popular_sale did not return items");
}
echo "[PASS] T15: ProductService list with section=popular_sale returned " . count($popular['items']) . " products.\n";

// 2. Verify T16: View tracking & activity logs
$activityService = new CustomerActivityService($pdo);
$stmt = $pdo->query("SELECT id FROM products WHERE deleted_at IS NULL LIMIT 1");
$pid = (int) $stmt->fetchColumn();

if ($pid > 0) {
    $initialViews = (int) $pdo->query("SELECT view_count FROM product_stats WHERE product_id = $pid")->fetchColumn();
    $newViews = $activityService->recordProductView($pid, null, 'test_session_verify');
    if ($newViews !== ($initialViews + 1)) {
        throw new RuntimeException("T16 Failed: expected view_count " . ($initialViews + 1) . ", got $newViews");
    }
    echo "[PASS] T16: View recorded and product_stats.view_count incremented to $newViews.\n";

    // 3. Verify T16: getRecentlyViewed
    $recents = $activityService->getRecentlyViewed(null, 'test_session_verify');
    if (empty($recents) || (int)$recents[0]['id'] !== $pid) {
        throw new RuntimeException("T16 Failed: recently viewed does not include viewed product #$pid");
    }
    echo "[PASS] T16: Recently viewed list retrieved for session with " . count($recents) . " items.\n";
}

// 4. Verify Admin Dashboard Analytics
$dashboardService = new DashboardService($pdo);
$analytics = $dashboardService->productAnalytics(5);
if (!isset($analytics['most_viewed_products']) || !isset($analytics['top_selling_products'])) {
    throw new RuntimeException("Dashboard Analytics missing expected keys");
}
echo "[PASS] Admin Dashboard: top_selling_products (" . count($analytics['top_selling_products']) . ") and most_viewed_products (" . count($analytics['most_viewed_products']) . ") verified.\n";

echo "\nAll T15 and T16 automated assertions passed!\n";
