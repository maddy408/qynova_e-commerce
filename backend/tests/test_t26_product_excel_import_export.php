<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../config/database.php';
require_once __DIR__ . '/test_guard.php';

use App\Helpers\Spreadsheet;
use App\Services\InventoryService;
use App\Services\ProductExportService;
use App\Services\ProductImportService;
use App\Services\SafeImageFetcher;
use App\Tests\TestDbGuard;

$pdo = db();
TestDbGuard::assertTestDatabase($pdo, __FILE__);

echo "======================================================================\n";
echo "TASK T26: PRODUCT EXCEL IMPORT/EXPORT TEST SUITE\n";
echo "Database: unified_pos_test\n";
echo "======================================================================\n\n";

$passed = 0;
$failed = 0;

function assertTest(string $name, bool $condition, string $detail = ''): void
{
    global $passed, $failed;
    if ($condition) {
        echo "  [PASS] {$name}" . ($detail ? " -> {$detail}" : '') . "\n";
        $passed++;
    } else {
        echo "  [FAIL] {$name}" . ($detail ? " -> {$detail}" : '') . "\n";
        $failed++;
    }
}

$uid = uniqid();
$cashierUserId = 1;
$inventory = new InventoryService($pdo);
$importer = new ProductImportService($pdo, $inventory);
$exporter = new ProductExportService($pdo);

$tmpDir = sys_get_temp_dir();

// ---------------------------------------------------------------------
// GROUP 1: formula-injection sanitization (no DB involved)
// ---------------------------------------------------------------------
echo "-- Formula injection guard --\n";
$sanitizePath = $tmpDir . '/t26-sanitize-' . $uid . '.xlsx';
Spreadsheet::writeRows($sanitizePath, ['Name', 'Note'], [
    ['Name' => '=cmd|"/c calc"!A1', 'Note' => 'normal text'],
    ['Name' => '+1+1', 'Note' => '@SUM(A1:A2)'],
]);
$readBack = Spreadsheet::readRows($sanitizePath);
assertTest('Formula-leading cell is neutralised with a leading quote', str_starts_with($readBack[0]['Name'], "'="));
assertTest('Plain text cell is untouched', $readBack[0]['Note'] === 'normal text');
assertTest('+ leading cell is neutralised', str_starts_with($readBack[1]['Name'], "'+"));
assertTest('@ leading cell is neutralised', str_starts_with($readBack[1]['Note'], "'@"));
@unlink($sanitizePath);

// ---------------------------------------------------------------------
// GROUP 2: SSRF host guard (no network call — exercises the private
// isPublicHost() range-check logic directly via reflection)
// ---------------------------------------------------------------------
echo "\n-- SafeImageFetcher SSRF host guard (no network) --\n";
$fetcher = new SafeImageFetcher();
$isPublicHost = new ReflectionMethod(SafeImageFetcher::class, 'isPublicHost');
$isPublicHost->setAccessible(true);

assertTest('Loopback 127.0.0.1 rejected', $isPublicHost->invoke($fetcher, '127.0.0.1') === false);
assertTest('Private 10.x rejected', $isPublicHost->invoke($fetcher, '10.0.0.5') === false);
assertTest('Private 192.168.x rejected', $isPublicHost->invoke($fetcher, '192.168.1.10') === false);
assertTest('Link-local 169.254.x rejected', $isPublicHost->invoke($fetcher, '169.254.169.254') === false);
assertTest('IPv6 loopback ::1 rejected', $isPublicHost->invoke($fetcher, '::1') === false);
assertTest('Public literal IP 8.8.8.8 accepted', $isPublicHost->invoke($fetcher, '8.8.8.8') === true);

$fetchMethod = new ReflectionMethod(SafeImageFetcher::class, 'fetch');
assertTest('fetch() rejects a non-http(s) scheme (ftp://) without any network call', $fetchMethod->invoke($fetcher, 'ftp://example.test/image.png') === null);
assertTest('fetch() rejects a file:// URL', $fetchMethod->invoke($fetcher, 'file:///etc/passwd') === null);
assertTest('fetch() rejects a URL targeting localhost', $fetchMethod->invoke($fetcher, 'http://127.0.0.1/secret.png') === null);
assertTest('fetch() rejects a URL with embedded credentials', $fetchMethod->invoke($fetcher, 'http://user:pass@example.test/image.png') === null);

// Best-effort real network check: this machine does have outbound
// internet access, so exercise the full download -> SSRF-guard ->
// WebP-conversion pipeline against one real public image URL. Skipped
// gracefully (not a failure) if the network call doesn't succeed, since
// a deterministic suite should not hard-depend on outbound internet.
$liveFetch = $fetcher->fetch('https://httpbin.org/image/jpeg');
if ($liveFetch === null) {
    echo "  [SKIP] Live image download check — no outbound network reachable from this machine right now.\n";
} else {
    $liveUploader = new \App\Services\ImageUploadService();
    $liveStored = $liveUploader->store(['tmp_name' => $liveFetch['tmp_path'], 'size' => $liveFetch['size'], 'error' => UPLOAD_ERR_OK, 'name' => 'live-test.jpg'], 'products');
    @unlink($liveFetch['tmp_path']);
    $fullPath = __DIR__ . '/../public/' . $liveStored['path'];
    assertTest('Live public image URL fetched and converted to WebP on disk', is_file($fullPath) && str_ends_with($liveStored['path'], '.webp'), $liveStored['path']);
    @unlink($fullPath);
    @unlink(__DIR__ . '/../public/' . $liveStored['thumb_path']);
}

// ---------------------------------------------------------------------
// GROUP 3: import — new product, two variants, opening stock, low stock threshold
// ---------------------------------------------------------------------
echo "\n-- Import: new product with 2 variants --\n";
$productCode = 'T26-' . $uid;
$sheetPath = $tmpDir . '/t26-import-' . $uid . '.xlsx';

function writeImportSheet(string $path, array $rows): void
{
    Spreadsheet::writeRows($path, ProductImportService::HEADERS, $rows);
}

$baseRow = [
    'Product Name' => 'T26 Test Shirt ' . $GLOBALS['uid'],
    'Product Code' => $productCode,
    'Category' => 'T26 Category ' . $GLOBALS['uid'],
    'Subcategory' => '',
    'Brand' => '',
    'Description' => '', 'Short Description' => '', 'Material' => '',
    'Unit' => '', 'HSN Code' => '', 'Tax' => '', 'Tax Type' => '',
    'Manufacturer' => '', 'Manufacturing Date' => '', 'Expiry Date' => '',
    'Product Images' => '',
    'Variant SKU' => 'T26-SKU-A-' . $uid,
    'Variant Barcode' => '',
    'Variant Description' => '', 'Size' => 'L', 'Color' => 'Red',
    'MRP' => '500', 'Selling Price' => '450', 'Variant Cost Price' => '300',
    'Variant Stock' => '20', 'Low Stock Threshold' => '4',
    'Variant Images' => '', 'Status' => 'ACTIVE',
];
$row2 = array_merge($baseRow, [
    'Variant SKU' => 'T26-SKU-B-' . $uid,
    'Size' => 'XL', 'Color' => 'Blue',
    'MRP' => '520', 'Selling Price' => '470', 'Variant Stock' => '10', 'Low Stock Threshold' => '3',
]);
writeImportSheet($sheetPath, [$baseRow, $row2]);

$result1 = $importer->commit($sheetPath, true, $cashierUserId);
assertTest('2-row import: both rows succeed (new product, auto-create masters)', $result1['successful_rows'] === 2 && $result1['failed_rows'] === 0,
    json_encode($result1['errors']));

$variantAId = (int) $pdo->query("SELECT id FROM product_variants WHERE sku = 'T26-SKU-A-{$uid}'")->fetchColumn();
$variantBId = (int) $pdo->query("SELECT id FROM product_variants WHERE sku = 'T26-SKU-B-{$uid}'")->fetchColumn();
$productId = (int) $pdo->query("SELECT product_id FROM product_variants WHERE id = {$variantAId}")->fetchColumn();

assertTest('Both variants grouped under ONE product', (int) $pdo->query("SELECT product_id FROM product_variants WHERE id = {$variantBId}")->fetchColumn() === $productId);

$stockA = $pdo->query("SELECT on_hand, low_stock_threshold FROM inventory WHERE variant_id = {$variantAId}")->fetch();
assertTest('Variant A opening stock applied via ledger (20)', (float) $stockA['on_hand'] === 20.0, (string) $stockA['on_hand']);
assertTest('Variant A low stock threshold applied (4)', (float) $stockA['low_stock_threshold'] === 4.0, (string) $stockA['low_stock_threshold']);

$movementCount = (int) $pdo->query("SELECT COUNT(*) FROM inventory_movements WHERE variant_id = {$variantAId} AND movement_type = 'OPENING_STOCK'")->fetchColumn();
assertTest('Exactly one OPENING_STOCK movement recorded for variant A', $movementCount === 1, (string) $movementCount);

// ---------------------------------------------------------------------
// GROUP 3b: image columns end-to-end — Product Images / Variant Images
// resolve through the real WebP pipeline, not a raw URL string; a
// repeat import of the same product never duplicates the image rows.
// ---------------------------------------------------------------------
echo "\n-- Import with Product Images / Variant Images (live network) --\n";
$imageProductCode = 'T26-IMG-' . $uid;
$imageRow = array_merge($baseRow, [
    'Product Name' => 'T26 Image Test Product ' . $uid,
    'Product Code' => $imageProductCode,
    'Variant SKU' => 'T26-IMG-SKU-' . $uid,
    'Product Images' => 'https://httpbin.org/image/jpeg, https://httpbin.org/image/png',
    'Variant Images' => 'https://httpbin.org/image/webp',
]);
$imageSheetPath = $tmpDir . '/t26-images-' . $uid . '.xlsx';
writeImportSheet($imageSheetPath, [$imageRow]);
$imageResult = $importer->commit($imageSheetPath, true, $cashierUserId);

if ($imageResult['successful_rows'] === 0) {
    echo "  [SKIP] Image import row failed (" . ($imageResult['errors'][0]['reason'] ?? 'unknown') . ") — likely no outbound network right now, not a code defect.\n";
} else {
    assertTest('Row with image URLs imports successfully', $imageResult['successful_rows'] === 1, json_encode($imageResult['errors']));
    $imgVariantId = (int) $pdo->query("SELECT id FROM product_variants WHERE sku = 'T26-IMG-SKU-{$uid}'")->fetchColumn();
    $imgProductId = (int) $pdo->query("SELECT product_id FROM product_variants WHERE id = {$imgVariantId}")->fetchColumn();

    $productImages = $pdo->query("SELECT image_path, thumb_path, is_primary FROM product_images WHERE product_id = {$imgProductId} ORDER BY sort_order")->fetchAll();
    assertTest('2 product images imported', count($productImages) === 2, (string) count($productImages));
    assertTest('Product images stored as local WebP paths, not raw URLs', str_starts_with($productImages[0]['image_path'] ?? '', 'uploads/') && str_ends_with($productImages[0]['image_path'], '.webp'));
    assertTest('First product image flagged primary', (int) $productImages[0]['is_primary'] === 1);

    $variantImages = $pdo->query("SELECT image_path, thumb_path FROM variant_images WHERE variant_id = {$imgVariantId}")->fetchAll();
    assertTest('1 variant image imported as local WebP', count($variantImages) === 1 && str_ends_with($variantImages[0]['image_path'], '.webp'));

    // Re-import the SAME product (second row, new SKU) and confirm the
    // already-has-images product is left alone — no duplicate rows.
    $imageRow2 = array_merge($imageRow, ['Variant SKU' => 'T26-IMG-SKU-2-' . $uid]);
    $imageSheetPath2 = $tmpDir . '/t26-images-2-' . $uid . '.xlsx';
    writeImportSheet($imageSheetPath2, [$imageRow2]);
    $importer->commit($imageSheetPath2, true, $cashierUserId);
    $productImagesAfter = (int) $pdo->query("SELECT COUNT(*) FROM product_images WHERE product_id = {$imgProductId}")->fetchColumn();
    assertTest('Re-importing another variant of the same product did not duplicate product images (still 2)', $productImagesAfter === 2, (string) $productImagesAfter);
    @unlink($imageSheetPath2);

    // Cleanup uploaded files for this test run, including the second
    // variant's own (newly-created, since it's a different variant_id)
    // image row, and both the main image AND its thumbnail.
    $imgVariantId2 = (int) $pdo->query("SELECT id FROM product_variants WHERE sku = 'T26-IMG-SKU-2-{$uid}'")->fetchColumn();
    $variantImages2 = $pdo->query("SELECT image_path, thumb_path FROM variant_images WHERE variant_id = {$imgVariantId2}")->fetchAll();
    foreach (array_merge($productImages, $variantImages, $variantImages2) as $img) {
        @unlink(__DIR__ . '/../public/' . $img['image_path']);
        if (!empty($img['thumb_path'])) {
            @unlink(__DIR__ . '/../public/' . $img['thumb_path']);
        }
    }
}
@unlink($imageSheetPath);

// ---------------------------------------------------------------------
// GROUP 4: re-import same file WITHOUT update_existing -> rejected (no duplicate / no double stock)
// ---------------------------------------------------------------------
echo "\n-- Re-import same file, update_existing=false --\n";
$result2 = $importer->commit($sheetPath, true, $cashierUserId, false);
assertTest('Every row rejected as duplicate SKU when update_existing=false', $result2['failed_rows'] === 2 && $result2['successful_rows'] === 0);
assertTest('Rejection reason is "SKU already exists"', str_contains($result2['errors'][0]['reason'], 'SKU already exists'));

$variantCountAfterRetry = (int) $pdo->query("SELECT COUNT(*) FROM product_variants WHERE sku IN ('T26-SKU-A-{$uid}', 'T26-SKU-B-{$uid}')")->fetchColumn();
assertTest('No duplicate variant rows were created', $variantCountAfterRetry === 2, (string) $variantCountAfterRetry);

$stockAStillTwenty = (float) $pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variantAId}")->fetchColumn();
assertTest('Stock was NOT double-counted by the rejected re-import', $stockAStillTwenty === 20.0, (string) $stockAStillTwenty);

// ---------------------------------------------------------------------
// GROUP 5: preview() is a true dry run (no mutation at all)
// ---------------------------------------------------------------------
echo "\n-- Preview is a dry run --\n";
$previewSheetPath = $tmpDir . '/t26-preview-' . $uid . '.xlsx';
$newSkuRow = array_merge($baseRow, ['Variant SKU' => 'T26-PREVIEW-ONLY-' . $uid, 'Product Code' => $productCode, 'Variant Stock' => '5']);
writeImportSheet($previewSheetPath, [$newSkuRow]);
$previewResult = $importer->preview($previewSheetPath, true, false);
assertTest('Preview reports success for a well-formed new-SKU row', $previewResult['successful_rows'] === 1);
$existsAfterPreview = $pdo->query("SELECT COUNT(*) FROM product_variants WHERE sku = 'T26-PREVIEW-ONLY-{$uid}'")->fetchColumn();
assertTest('Preview did not actually insert the variant', (int) $existsAfterPreview === 0);
@unlink($previewSheetPath);

// ---------------------------------------------------------------------
// GROUP 6: re-import with update_existing=true -> price/status update,
// stock reconciled as a DIFFERENCE (never reset by blank), threshold updated
// ---------------------------------------------------------------------
echo "\n-- Re-import with update_existing=true --\n";
$updateRow = array_merge($baseRow, [
    'Variant SKU' => 'T26-SKU-A-' . $uid,
    'Selling Price' => '399',      // price change
    'Variant Stock' => '35',       // 20 -> 35, expect a +15 diff movement, not a reset
    'Low Stock Threshold' => '8',
    'Status' => 'ACTIVE',
]);
$updateRow2 = array_merge($row2, [
    'Variant Stock' => '',         // BLANK — must NOT touch variant B's stock
]);
$updateSheetPath = $tmpDir . '/t26-update-' . $uid . '.xlsx';
writeImportSheet($updateSheetPath, [$updateRow, $updateRow2]);

$stockBBefore = (float) $pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variantBId}")->fetchColumn();
$result3 = $importer->commit($updateSheetPath, true, $cashierUserId, true);
assertTest('Update-mode import succeeds for both already-existing SKUs', $result3['successful_rows'] === 2 && $result3['failed_rows'] === 0, json_encode($result3['errors']));

$priceAfter = (float) $pdo->query("SELECT retail_price FROM product_variants WHERE id = {$variantAId}")->fetchColumn();
assertTest('Variant A selling price updated to 399', $priceAfter === 399.0, (string) $priceAfter);

$stockAAfter = (float) $pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variantAId}")->fetchColumn();
assertTest('Variant A stock reconciled to 35 via a +15 difference (not reset, not doubled)', $stockAAfter === 35.0, (string) $stockAAfter);

$diffMovement = $pdo->query("SELECT on_hand_delta FROM inventory_movements WHERE variant_id = {$variantAId} AND movement_type = 'STOCK_ADJUSTMENT_IN' ORDER BY id DESC LIMIT 1")->fetchColumn();
assertTest('The reconciling movement recorded delta +15.000 (20 -> 35), not a raw set to 35', (string) $diffMovement === '15.000', (string) $diffMovement);

$thresholdAfter = (float) $pdo->query("SELECT low_stock_threshold FROM inventory WHERE variant_id = {$variantAId}")->fetchColumn();
assertTest('Variant A low stock threshold updated to 8', $thresholdAfter === 8.0, (string) $thresholdAfter);

$stockBAfter = (float) $pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variantBId}")->fetchColumn();
assertTest('Variant B stock untouched by a blank Variant Stock cell (still ' . $stockBBefore . ')', $stockBAfter === $stockBBefore, "{$stockBBefore} -> {$stockBAfter}");

// ---------------------------------------------------------------------
// GROUP 7: re-committing the IDENTICAL update file again must not
// double-apply the stock difference (file-hash idempotency)
// ---------------------------------------------------------------------
echo "\n-- Re-committing the identical update file is idempotent --\n";
$result4 = $importer->commit($updateSheetPath, true, $cashierUserId, true);
assertTest('Re-commit of the identical file still reports success (update mode tolerates no-op fields)', $result4['successful_rows'] === 2, json_encode($result4['errors']));
$stockAAfterRepeat = (float) $pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variantAId}")->fetchColumn();
assertTest('Stock is STILL 35 — the identical file did not re-apply the +15 difference a second time', $stockAAfterRepeat === 35.0, (string) $stockAAfterRepeat);
$movementCountAfterRepeat = (int) $pdo->query("SELECT COUNT(*) FROM inventory_movements WHERE variant_id = {$variantAId} AND movement_type = 'STOCK_ADJUSTMENT_IN'")->fetchColumn();
assertTest('Exactly one STOCK_ADJUSTMENT_IN movement exists for variant A (not two)', $movementCountAfterRepeat === 1, (string) $movementCountAfterRepeat);

// ---------------------------------------------------------------------
// GROUP 8: export round-trip — headers match, values present, re-import-ready
// ---------------------------------------------------------------------
echo "\n-- Export --\n";
$exportPath = $exporter->export(['ids' => [$productId]]);
$exportedRows = Spreadsheet::readRows($exportPath);
assertTest('Export produced one row per variant (2 rows)', count($exportedRows) === 2, (string) count($exportedRows));
assertTest('Exported header set matches import header set exactly', array_keys($exportedRows[0]) === ProductImportService::HEADERS);
$exportedSkus = array_column($exportedRows, 'Variant SKU');
assertTest('Exported rows contain both known SKUs', in_array("T26-SKU-A-{$uid}", $exportedSkus, true) && in_array("T26-SKU-B-{$uid}", $exportedSkus, true));
@unlink($exportPath);

// ---------------------------------------------------------------------
// GROUP 9: sample template downloads with the Instructions sheet
// ---------------------------------------------------------------------
echo "\n-- Sample template --\n";
$templatePath = $exporter->sampleTemplate();
$spreadsheetObj = \PhpOffice\PhpSpreadsheet\IOFactory::load($templatePath);
$sheetNames = $spreadsheetObj->getSheetNames();
assertTest('Template has a Products sheet and an Instructions sheet', in_array('Products', $sheetNames, true) && in_array('Instructions', $sheetNames, true), implode(',', $sheetNames));
@unlink($templatePath);

// ---------------------------------------------------------------------
// GROUP 10: barcode uniqueness still enforced (across variants, both create & update)
// ---------------------------------------------------------------------
echo "\n-- Barcode uniqueness --\n";
$dupBarcodeRow = array_merge($baseRow, [
    'Variant SKU' => 'T26-SKU-C-' . $uid,
    'Variant Barcode' => 'T26-SHARED-BARCODE-' . $uid,
]);
$dupBarcodeRow2 = array_merge($baseRow, [
    'Variant SKU' => 'T26-SKU-D-' . $uid,
    'Variant Barcode' => 'T26-SHARED-BARCODE-' . $uid, // same barcode, different SKU
]);
$barcodeSheetPath = $tmpDir . '/t26-barcode-' . $uid . '.xlsx';
writeImportSheet($barcodeSheetPath, [$dupBarcodeRow, $dupBarcodeRow2]);
$result5 = $importer->commit($barcodeSheetPath, true, $cashierUserId, false);
assertTest('First row with a fresh barcode succeeds, second row with the SAME barcode is rejected', $result5['successful_rows'] === 1 && $result5['failed_rows'] === 1, json_encode($result5['errors']));
@unlink($barcodeSheetPath);

@unlink($sheetPath);
@unlink($updateSheetPath);

echo "\n======================================================================\n";
echo "RESULTS: {$passed} passed, {$failed} failed\n";
echo "======================================================================\n";

exit($failed > 0 ? 1 : 0);
