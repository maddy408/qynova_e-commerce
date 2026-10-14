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
use App\Services\SafeZipExtractor;
use App\Tests\TestDbGuard;

$pdo = db();
TestDbGuard::assertTestDatabase($pdo, __FILE__);

function countUploadedProductFiles(): int
{
    return count(glob(__DIR__ . '/../public/uploads/products/*.webp') ?: []);
}

// Captured before any work starts so the very last assertion in this
// file can catch ANY net-new file left behind by the whole suite — a
// single authoritative orphan check instead of trusting every
// individual group's own manual @unlink() calls to be complete.
$initialUploadedFileCount = countUploadedProductFiles();

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
    'Product Image Path' => '',
    'Variant SKU' => 'T26-SKU-A-' . $uid,
    'Variant Barcode' => '',
    'Variant Description' => '', 'Size' => 'L', 'Color' => 'Red',
    'MRP' => '500', 'Selling Price' => '450', 'Variant Cost Price' => '300',
    'Opening Stock' => '20', 'Low Stock Threshold' => '4',
    'Variant Image Path' => '', 'Status' => 'ACTIVE',
];
$row2 = array_merge($baseRow, [
    'Variant SKU' => 'T26-SKU-B-' . $uid,
    'Size' => 'XL', 'Color' => 'Blue',
    'MRP' => '520', 'Selling Price' => '470', 'Opening Stock' => '10', 'Low Stock Threshold' => '3',
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
echo "\n-- Import with Product Image Path / Variant Image Path (live network) --\n";
$imageProductCode = 'T26-IMG-' . $uid;
$imageRow = array_merge($baseRow, [
    'Product Name' => 'T26 Image Test Product ' . $uid,
    'Product Code' => $imageProductCode,
    'Variant SKU' => 'T26-IMG-SKU-' . $uid,
    'Product Image Path' => 'https://httpbin.org/image/jpeg, https://httpbin.org/image/png',
    'Variant Image Path' => 'https://httpbin.org/image/webp',
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
$newSkuRow = array_merge($baseRow, ['Variant SKU' => 'T26-PREVIEW-ONLY-' . $uid, 'Product Code' => $productCode, 'Opening Stock' => '5']);
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
    'Opening Stock' => '35',       // 20 -> 35, expect a +15 diff movement, not a reset
    'Low Stock Threshold' => '8',
    'Status' => 'ACTIVE',
]);
$updateRow2 = array_merge($row2, [
    'Opening Stock' => '',         // BLANK — must NOT touch variant B's stock
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
assertTest('Variant B stock untouched by a blank Opening Stock cell (still ' . $stockBBefore . ')', $stockBAfter === $stockBBefore, "{$stockBBefore} -> {$stockBAfter}");

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

// ---------------------------------------------------------------------
// GROUP 11: re-importing a file after its product/variant was soft-
// deleted — regression for a real bug found in production use: the
// product_code/sku/barcode unique keys are plain (not partial) indexes,
// so a soft-deleted row still occupies them; findExistingProduct()/
// findVariantBySku()/assertBarcodeFree() used to filter on
// "deleted_at IS NULL", so they'd miss the soft-deleted row and the
// subsequent raw INSERT would crash with an uncaught
// "Duplicate entry ... for key uq_products_product_code" SQL error
// instead of a clean, actionable row error.
// ---------------------------------------------------------------------
echo "\n-- Re-import after soft-delete (regression) --\n";
$sdCode = 'T26-SD-' . $uid;
$sdSku = 'T26-SD-SKU-' . $uid;
$sdRow = array_merge($baseRow, [
    'Product Name' => 'T26 Soft Delete Product ' . $uid,
    'Product Code' => $sdCode,
    'Variant SKU' => $sdSku,
    'Variant Barcode' => 'T26-SD-BARCODE-' . $uid,
    'Opening Stock' => '7',
]);
$sdSheetPath = $tmpDir . '/t26-softdelete-' . $uid . '.xlsx';
writeImportSheet($sdSheetPath, [$sdRow]);
$sdResult1 = $importer->commit($sdSheetPath, true, $cashierUserId);
assertTest('Soft-delete regression: initial import succeeds', $sdResult1['successful_rows'] === 1, json_encode($sdResult1['errors']));

$sdProductId = (int) $pdo->query("SELECT id FROM products WHERE product_code = '{$sdCode}'")->fetchColumn();
$sdVariantId = (int) $pdo->query("SELECT id FROM product_variants WHERE sku = '{$sdSku}'")->fetchColumn();

// Soft-delete both, exactly as the admin UI's "Delete Product" would.
$pdo->exec("UPDATE products SET deleted_at = NOW() WHERE id = {$sdProductId}");
$pdo->exec("UPDATE product_variants SET deleted_at = NOW() WHERE id = {$sdVariantId}");

// Re-importing the identical file WITHOUT update_existing must fail
// cleanly (not crash) — the code/SKU truly already exist, deleted or not.
$sdResult2 = $importer->preview($sdSheetPath, true, false);
assertTest('Re-import after soft-delete, update_existing=false: rejected with a clean row error (not a raw SQL crash)',
    $sdResult2['failed_rows'] === 1 && str_contains($sdResult2['errors'][0]['reason'], 'SKU already exists'),
    json_encode($sdResult2['errors']));

// With update_existing=true, the product AND the variant must be
// reactivated and reused, not left broken and not duplicated.
$sdResult3 = $importer->commit($sdSheetPath, true, $cashierUserId, true);
assertTest('Re-import after soft-delete, update_existing=true: succeeds', $sdResult3['successful_rows'] === 1, json_encode($sdResult3['errors']));

$sdProductDeletedAt = $pdo->query("SELECT deleted_at FROM products WHERE id = {$sdProductId}")->fetchColumn();
assertTest('Soft-deleted product was reactivated (deleted_at cleared)', $sdProductDeletedAt === null);
$sdVariantDeletedAt = $pdo->query("SELECT deleted_at FROM product_variants WHERE id = {$sdVariantId}")->fetchColumn();
assertTest('Soft-deleted variant was reactivated (deleted_at cleared)', $sdVariantDeletedAt === null);
$sdProductCount = (int) $pdo->query("SELECT COUNT(*) FROM products WHERE product_code = '{$sdCode}'")->fetchColumn();
assertTest('No duplicate product row was created for the same code', $sdProductCount === 1, (string) $sdProductCount);
$sdVariantCount = (int) $pdo->query("SELECT COUNT(*) FROM product_variants WHERE sku = '{$sdSku}'")->fetchColumn();
assertTest('No duplicate variant row was created for the same SKU', $sdVariantCount === 1, (string) $sdVariantCount);

// A barcode held by a soft-deleted DIFFERENT variant must still be
// reported as a clean conflict, not silently reused and not a crash.
$otherSdSku = 'T26-SD-OTHER-SKU-' . $uid;
$pdo->exec("INSERT INTO products (name, slug, product_code) VALUES ('T26 SD Other', 't26-sd-other-{$uid}', NULL)");
$otherProductId = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO product_variants (product_id, sku, barcode, mrp, retail_price, deleted_at) VALUES ({$otherProductId}, '{$otherSdSku}', 'T26-SD-CONFLICT-BARCODE-{$uid}', 100, 90, NOW())");
$conflictRow = array_merge($baseRow, [
    'Product Name' => 'T26 Barcode Conflict Product ' . $uid,
    'Product Code' => 'T26-SD-CONFLICT-' . $uid,
    'Variant SKU' => 'T26-SD-CONFLICT-SKU-' . $uid,
    'Variant Barcode' => "T26-SD-CONFLICT-BARCODE-{$uid}",
]);
$conflictSheetPath = $tmpDir . '/t26-barcode-conflict-' . $uid . '.xlsx';
writeImportSheet($conflictSheetPath, [$conflictRow]);
$conflictResult = $importer->preview($conflictSheetPath, true, false);
assertTest('A barcode held by an unrelated soft-deleted variant is still reported as a clean conflict, not a crash',
    $conflictResult['failed_rows'] === 1 && str_contains($conflictResult['errors'][0]['reason'], 'Barcode already exists'),
    json_encode($conflictResult['errors']));
@unlink($conflictSheetPath);
@unlink($sdSheetPath);

// ---------------------------------------------------------------------
// GROUP 12: filename + ZIP image resolution (no network dependency —
// a tiny real PNG is generated in-memory via GD)
// ---------------------------------------------------------------------
echo "\n-- Filename + images ZIP --\n";

function makeTinyPng(): string
{
    $img = imagecreatetruecolor(2, 2);
    imagefill($img, 0, 0, imagecolorallocate($img, 200, 50, 50));
    ob_start();
    imagepng($img);
    $bytes = ob_get_clean();
    imagedestroy($img);
    return (string) $bytes;
}

$zipExtractor = new SafeZipExtractor();
$pngBytes = makeTinyPng();

// 12a: SafeZipExtractor itself — flat extraction, zip-slip resistance, non-image skip
$zipPath = $tmpDir . '/t26-images-' . $uid . '.zip';
$za = new ZipArchive();
$za->open($zipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
$za->addFromString('front.jpg', $pngBytes);
$za->addFromString('subfolder/back.jpg', $pngBytes); // nested path — must still resolve by basename only
$za->addFromString('../../etc/evil.jpg', $pngBytes); // zip-slip attempt — must land harmlessly as "evil.jpg", never escape
$za->addFromString('readme.txt', 'not an image');     // non-image — must be skipped, not fail the whole zip
$za->close();

$extractedDir = $zipExtractor->extract($zipPath);
assertTest('front.jpg extracted at the flat destination root', is_file($extractedDir . '/front.jpg'));
assertTest('Nested subfolder/back.jpg is flattened to just back.jpg', is_file($extractedDir . '/back.jpg'));
assertTest('Zip-slip entry landed harmlessly as evil.jpg inside the dest dir, not outside it', is_file($extractedDir . '/evil.jpg') && !is_file('/etc/evil.jpg'));
assertTest('Non-image entry (readme.txt) was skipped', !is_file($extractedDir . '/readme.txt'));
$zipExtractor->cleanup($extractedDir);
assertTest('cleanup() removes the extraction directory', !is_dir($extractedDir));

// 12b: end-to-end import using filename-only image cells + a real images zip
$zipPath2 = $tmpDir . '/t26-images-2-' . $uid . '.zip';
$za2 = new ZipArchive();
$za2->open($zipPath2, ZipArchive::CREATE | ZipArchive::OVERWRITE);
$za2->addFromString('zip-main.jpg', $pngBytes);
$za2->addFromString('zip-variant.jpg', $pngBytes);
$za2->close();
$zipImagesDir = $zipExtractor->extract($zipPath2);

$zipProductCode = 'T26-ZIP-' . $uid;
$zipRow = array_merge($baseRow, [
    'Product Name' => 'T26 Zip Image Product ' . $uid,
    'Product Code' => $zipProductCode,
    'Variant SKU' => 'T26-ZIP-SKU-' . $uid,
    'Product Image Path' => 'zip-main.jpg',
    'Variant Image Path' => 'zip-variant.jpg',
]);
$zipSheetPath = $tmpDir . '/t26-zip-import-' . $uid . '.xlsx';
writeImportSheet($zipSheetPath, [$zipRow]);
$zipImportResult = $importer->commit($zipSheetPath, true, $cashierUserId, false, $zipImagesDir);
assertTest('Import with filename-only image cells + images ZIP succeeds', $zipImportResult['successful_rows'] === 1, json_encode($zipImportResult['errors']));

$zipVariantId = (int) $pdo->query("SELECT id FROM product_variants WHERE sku = 'T26-ZIP-SKU-{$uid}'")->fetchColumn();
$zipProductId = (int) $pdo->query("SELECT product_id FROM product_variants WHERE id = {$zipVariantId}")->fetchColumn();
$zipProductImage = $pdo->query("SELECT image_path, thumb_path FROM product_images WHERE product_id = {$zipProductId}")->fetch();
$zipVariantImage = $pdo->query("SELECT image_path, thumb_path FROM variant_images WHERE variant_id = {$zipVariantId}")->fetch();
assertTest('Product image resolved from the ZIP and converted to local WebP', $zipProductImage !== false && str_ends_with($zipProductImage['image_path'], '.webp'), json_encode($zipProductImage));
assertTest('Variant image resolved from the ZIP and converted to local WebP', $zipVariantImage !== false && str_ends_with($zipVariantImage['image_path'], '.webp'), json_encode($zipVariantImage));

@unlink(__DIR__ . '/../public/' . $zipProductImage['image_path']);
@unlink(__DIR__ . '/../public/' . $zipProductImage['thumb_path']);
@unlink(__DIR__ . '/../public/' . $zipVariantImage['image_path']);
@unlink(__DIR__ . '/../public/' . $zipVariantImage['thumb_path']);
$zipExtractor->cleanup($zipImagesDir);
@unlink($zipSheetPath);
@unlink($zipPath2);

// 12c: filename cell but NO images zip uploaded -> clean error, not a crash
$noZipRow = array_merge($baseRow, [
    'Product Name' => 'T26 No Zip Product ' . $uid,
    'Product Code' => 'T26-NOZIP-' . $uid,
    'Variant SKU' => 'T26-NOZIP-SKU-' . $uid,
    'Product Image Path' => 'some-file.jpg',
]);
$noZipSheetPath = $tmpDir . '/t26-nozip-' . $uid . '.xlsx';
writeImportSheet($noZipSheetPath, [$noZipRow]);
$noZipResult = $importer->preview($noZipSheetPath, true, false, null);
assertTest('Filename image cell with no images ZIP attached fails cleanly with the spec-exact message',
    $noZipResult['failed_rows'] === 1 && $noZipResult['errors'][0]['reason'] === 'Product image filenames are present in Excel, but no Product Images ZIP was uploaded.',
    json_encode($noZipResult['errors']));
@unlink($noZipSheetPath);

// 12d: filename cell referencing a file NOT present in the (otherwise valid) zip
$zipImagesDir2 = $zipExtractor->extract($zipPath);
$missingRow = array_merge($baseRow, [
    'Product Name' => 'T26 Missing In Zip Product ' . $uid,
    'Product Code' => 'T26-MISSING-' . $uid,
    'Variant SKU' => 'T26-MISSING-SKU-' . $uid,
    'Product Image Path' => 'does-not-exist-in-zip.jpg',
]);
$missingSheetPath = $tmpDir . '/t26-missing-' . $uid . '.xlsx';
writeImportSheet($missingSheetPath, [$missingRow]);
$missingResult = $importer->preview($missingSheetPath, true, false, $zipImagesDir2);
assertTest('Filename not present inside an otherwise-valid ZIP fails cleanly, naming the file',
    $missingResult['failed_rows'] === 1 && str_contains($missingResult['errors'][0]['reason'], 'was not found inside the uploaded images ZIP'),
    json_encode($missingResult['errors']));
$zipExtractor->cleanup($zipImagesDir2);
@unlink($missingSheetPath);
@unlink($zipPath);

// ---------------------------------------------------------------------
// GROUP 13: preview never persists real files; image_summary aggregate;
// orphan cleanup when a row fails AFTER its image was already written;
// case-insensitive zip filename matching.
// ---------------------------------------------------------------------
echo "\n-- Preview never writes real files / image_summary / orphan cleanup / case-insensitive match --\n";

// 13a: preview with a real image URL must not write anything to disk
$previewImgRow = array_merge($baseRow, [
    'Product Name' => 'T26 Preview No Write ' . $uid,
    'Product Code' => 'T26-PREVIEWIMG-' . $uid,
    'Variant SKU' => 'T26-PREVIEWIMG-SKU-' . $uid,
    'Product Image Path' => 'https://httpbin.org/image/jpeg',
]);
$previewImgSheetPath = $tmpDir . '/t26-previewimg-' . $uid . '.xlsx';
writeImportSheet($previewImgSheetPath, [$previewImgRow]);
$beforeCount = countUploadedProductFiles();
$previewImgResult = $importer->preview($previewImgSheetPath, true, false);
$afterCount = countUploadedProductFiles();
if ($previewImgResult['successful_rows'] === 1) {
    assertTest('Preview with an image URL validates successfully but writes NO file to disk', $afterCount === $beforeCount, "{$beforeCount} -> {$afterCount}");
} else {
    echo "  [SKIP] Preview-no-write check row failed (" . ($previewImgResult['errors'][0]['reason'] ?? 'unknown') . ") — likely no outbound network right now.\n";
}
assertTest('image_summary key is present on a preview() result', array_key_exists('image_summary', $previewImgResult));
@unlink($previewImgSheetPath);

// 13b: image_summary found/missing aggregate across a mixed file (one resolvable, one missing)
$mixedZipPath = $tmpDir . '/t26-mixed-' . $uid . '.zip';
$mixedZa = new ZipArchive();
$mixedZa->open($mixedZipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
$mixedZa->addFromString('present-image.jpg', $pngBytes);
$mixedZa->close();
$mixedImagesDir = $zipExtractor->extract($mixedZipPath);

$foundRow = array_merge($baseRow, [
    'Product Name' => 'T26 Mixed Found ' . $uid,
    'Product Code' => 'T26-MIXED-FOUND-' . $uid,
    'Variant SKU' => 'T26-MIXED-FOUND-SKU-' . $uid,
    'Product Image Path' => 'present-image.jpg',
]);
$missingRow2 = array_merge($baseRow, [
    'Product Name' => 'T26 Mixed Missing ' . $uid,
    'Product Code' => 'T26-MIXED-MISSING-' . $uid,
    'Variant SKU' => 'T26-MIXED-MISSING-SKU-' . $uid,
    'Product Image Path' => 'absent-image.jpg',
]);
$mixedSheetPath = $tmpDir . '/t26-mixed-sheet-' . $uid . '.xlsx';
writeImportSheet($mixedSheetPath, [$foundRow, $missingRow2]);
$mixedResult = $importer->preview($mixedSheetPath, true, false, $mixedImagesDir);
assertTest('Mixed file: one row succeeds, one fails on the missing image', $mixedResult['successful_rows'] === 1 && $mixedResult['failed_rows'] === 1, json_encode($mixedResult));
assertTest('image_summary.product_images_found contains the resolvable filename', in_array('present-image.jpg', $mixedResult['image_summary']['product_images_found'], true), json_encode($mixedResult['image_summary']));
assertTest('image_summary.product_images_missing contains the unresolvable filename', in_array('absent-image.jpg', $mixedResult['image_summary']['product_images_missing'], true), json_encode($mixedResult['image_summary']));
// This was preview() (dry run) — nothing should have been persisted at
// all (no DB row, no file), consistent with 13a above; nothing to clean.
$foundProductId = (int) $pdo->query("SELECT id FROM products WHERE product_code = 'T26-MIXED-FOUND-{$uid}'")->fetchColumn();
assertTest('preview() left no product row behind either (whole transaction rolled back)', $foundProductId === 0);
$zipExtractor->cleanup($mixedImagesDir);
@unlink($mixedSheetPath);
@unlink($mixedZipPath);

// 13c: a row whose image IS written, but a LATER field in the same row
// then fails (negative Low Stock Threshold) — the already-written image
// file must be deleted, not left orphaned, when the row rolls back.
$orphanZipPath = $tmpDir . '/t26-orphan-' . $uid . '.zip';
$orphanZa = new ZipArchive();
$orphanZa->open($orphanZipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
$orphanZa->addFromString('orphan-test.jpg', $pngBytes);
$orphanZa->close();
$orphanImagesDir = $zipExtractor->extract($orphanZipPath);

$orphanRow = array_merge($baseRow, [
    'Product Name' => 'T26 Orphan Cleanup ' . $uid,
    'Product Code' => 'T26-ORPHAN-' . $uid,
    'Variant SKU' => 'T26-ORPHAN-SKU-' . $uid,
    'Variant Image Path' => 'orphan-test.jpg', // written by createVariant()'s maybeImportVariantImages, the LAST step inside createVariant
    'Low Stock Threshold' => '-5', // processRow applies this AFTER createVariant() returns -> throws -> row rolls back
]);
$orphanSheetPath = $tmpDir . '/t26-orphan-sheet-' . $uid . '.xlsx';
// Written directly via PhpSpreadsheet (bypassing Spreadsheet::writeRows'
// formula-injection guard) so the cell holds a genuine numeric -5, the
// same as a real Excel file typed by a human — the guard's own
// leading-apostrophe rule would otherwise turn "-5" into "'-5" here,
// which is no longer is_numeric() and would silently skip the
// threshold update this test exists to trigger.
$orphanWorkbook = new \PhpOffice\PhpSpreadsheet\Spreadsheet();
$orphanSheet = $orphanWorkbook->getActiveSheet();
foreach (ProductImportService::HEADERS as $colIndex => $header) {
    $orphanSheet->setCellValue(\PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($colIndex + 1) . '1', $header);
    $orphanSheet->setCellValue(\PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex($colIndex + 1) . '2', $orphanRow[$header] ?? '');
}
(new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($orphanWorkbook))->save($orphanSheetPath);
$beforeOrphanCount = countUploadedProductFiles();
$orphanResult = $importer->commit($orphanSheetPath, true, $cashierUserId, false, $orphanImagesDir);
$afterOrphanCount = countUploadedProductFiles();
assertTest('Row with a negative Low Stock Threshold (applied after the image write) fails', $orphanResult['failed_rows'] === 1 && str_contains($orphanResult['errors'][0]['reason'], 'negative'), json_encode($orphanResult['errors']));
assertTest('The image written earlier in that same failed row was cleaned up — no orphan left on disk', $afterOrphanCount === $beforeOrphanCount, "{$beforeOrphanCount} -> {$afterOrphanCount}");
$orphanVariantExists = (int) $pdo->query("SELECT COUNT(*) FROM product_variants WHERE sku = 'T26-ORPHAN-SKU-{$uid}'")->fetchColumn();
assertTest('The variant row itself was also rolled back (SAVEPOINT), not just the image', $orphanVariantExists === 0, (string) $orphanVariantExists);
$zipExtractor->cleanup($orphanImagesDir);
@unlink($orphanSheetPath);
@unlink($orphanZipPath);

// 13d: case-insensitive filename matching, extension/case preserved from the real file on disk
$caseZipPath = $tmpDir . '/t26-case-' . $uid . '.zip';
$caseZa = new ZipArchive();
$caseZa->open($caseZipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
$caseZa->addFromString('Front.JPG', $pngBytes); // stored with mixed case + uppercase extension
$caseZa->close();
$caseImagesDir = $zipExtractor->extract($caseZipPath);

$caseRow = array_merge($baseRow, [
    'Product Name' => 'T26 Case Insensitive ' . $uid,
    'Product Code' => 'T26-CASE-' . $uid,
    'Variant SKU' => 'T26-CASE-SKU-' . $uid,
    'Product Image Path' => 'front.jpg', // lowercase in Excel — must still match "Front.JPG" in the zip
]);
$caseSheetPath = $tmpDir . '/t26-case-sheet-' . $uid . '.xlsx';
writeImportSheet($caseSheetPath, [$caseRow]);
$caseResult = $importer->commit($caseSheetPath, true, $cashierUserId, false, $caseImagesDir);
assertTest('Lowercase Excel filename matches a differently-cased file in the ZIP', $caseResult['successful_rows'] === 1, json_encode($caseResult['errors']));
$caseProductId = (int) $pdo->query("SELECT id FROM products WHERE product_code = 'T26-CASE-{$uid}'")->fetchColumn();
$caseImage = $pdo->query("SELECT image_path, thumb_path FROM product_images WHERE product_id = {$caseProductId}")->fetch();
assertTest('Case-insensitively matched image was stored as local WebP', $caseImage !== false && str_ends_with($caseImage['image_path'], '.webp'), json_encode($caseImage));
if ($caseImage !== false) {
    @unlink(__DIR__ . '/../public/' . $caseImage['image_path']);
    @unlink(__DIR__ . '/../public/' . $caseImage['thumb_path']);
}
$zipExtractor->cleanup($caseImagesDir);
@unlink($caseSheetPath);
@unlink($caseZipPath);

// Authoritative, whole-suite orphan check — every group above cleans up
// after itself individually, but this is the one check that actually
// catches a leak regardless of which group's manual cleanup was wrong.
assertTest(
    'The entire suite left no net-new uploaded image files behind',
    countUploadedProductFiles() === $initialUploadedFileCount,
    "{$initialUploadedFileCount} -> " . countUploadedProductFiles()
);

echo "\n======================================================================\n";
echo "RESULTS: {$passed} passed, {$failed} failed\n";
echo "======================================================================\n";

exit($failed > 0 ? 1 : 0);
