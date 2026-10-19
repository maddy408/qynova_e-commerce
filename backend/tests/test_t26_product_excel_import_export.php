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

// ---------------------------------------------------------------------
// GROUP 14: the same image filename referenced more than once in one
// import (e.g. two variants sharing one photo) is uploaded/converted
// ONCE and reused, not duplicated on disk.
// ---------------------------------------------------------------------
echo "\n-- Duplicate image reference within one import is not re-uploaded --\n";
$dedupZipPath = $tmpDir . '/t26-dedup-' . $uid . '.zip';
$dedupZa = new ZipArchive();
$dedupZa->open($dedupZipPath, ZipArchive::CREATE | ZipArchive::OVERWRITE);
$dedupZa->addFromString('shared.jpg', $pngBytes);
$dedupZa->close();
$dedupImagesDir = $zipExtractor->extract($dedupZipPath);

$dedupProductCode = 'T26-DEDUP-' . $uid;
$dedupRowA = array_merge($baseRow, [
    'Product Name' => 'T26 Dedup Product ' . $uid,
    'Product Code' => $dedupProductCode,
    'Variant SKU' => 'T26-DEDUP-SKU-A-' . $uid,
    'Product Image Path' => 'shared.jpg', // product-level use
    'Variant Image Path' => 'shared.jpg', // AND variant-level use, same file
]);
$dedupRowB = array_merge($baseRow, [
    'Product Name' => 'T26 Dedup Product ' . $uid,
    'Product Code' => $dedupProductCode,
    'Variant SKU' => 'T26-DEDUP-SKU-B-' . $uid,
    'Size' => 'XL', 'Color' => 'Blue',
    'Product Image Path' => '', // product already got its image from row A
    'Variant Image Path' => 'shared.jpg', // same filename again, second variant
]);
$dedupSheetPath = $tmpDir . '/t26-dedup-sheet-' . $uid . '.xlsx';
writeImportSheet($dedupSheetPath, [$dedupRowA, $dedupRowB]);
$dedupResult = $importer->commit($dedupSheetPath, true, $cashierUserId, false, $dedupImagesDir);
assertTest('Dedup import: both rows succeed', $dedupResult['successful_rows'] === 2 && $dedupResult['failed_rows'] === 0, json_encode($dedupResult['errors']));

$dedupProductId = (int) $pdo->query("SELECT id FROM products WHERE product_code = '{$dedupProductCode}'")->fetchColumn();
$dedupVariantAId = (int) $pdo->query("SELECT id FROM product_variants WHERE sku = 'T26-DEDUP-SKU-A-{$uid}'")->fetchColumn();
$dedupVariantBId = (int) $pdo->query("SELECT id FROM product_variants WHERE sku = 'T26-DEDUP-SKU-B-{$uid}'")->fetchColumn();

$dedupProductImage = $pdo->query("SELECT image_path, thumb_path FROM product_images WHERE product_id = {$dedupProductId}")->fetch();
$dedupVariantAImage = $pdo->query("SELECT image_path FROM variant_images WHERE variant_id = {$dedupVariantAId}")->fetchColumn();
$dedupVariantBImage = $pdo->query("SELECT image_path FROM variant_images WHERE variant_id = {$dedupVariantBId}")->fetchColumn();

assertTest('Product image and both variants\' images all point to the SAME stored file (one physical upload, three references)',
    $dedupProductImage !== false && $dedupProductImage['image_path'] === $dedupVariantAImage && $dedupVariantAImage === $dedupVariantBImage,
    json_encode(['product' => $dedupProductImage['image_path'] ?? null, 'variantA' => $dedupVariantAImage, 'variantB' => $dedupVariantBImage]));

$dedupFileCount = count(glob(__DIR__ . "/../public/uploads/products/*.webp") ?: []);
assertTest('Exactly one physical image pair (2 files: main+thumb) exists on disk for this import, not three', $dedupFileCount === 2, (string) $dedupFileCount);

@unlink(__DIR__ . '/../public/' . $dedupProductImage['image_path']);
@unlink(__DIR__ . '/../public/' . $dedupProductImage['thumb_path']);
$zipExtractor->cleanup($dedupImagesDir);
@unlink($dedupSheetPath);
@unlink($dedupZipPath);

// ---------------------------------------------------------------------
// GROUP 15: Selling Price and Variant SKU are optional cells (bug fix —
// previously both were wrongly mandatory for every import row).
// ---------------------------------------------------------------------
echo "\n-- Optional Selling Price / Variant SKU --\n";

// 15a: blank Selling Price on a brand-new variant -> succeeds, retail_price
// defaults to MRP (never 0, never the empty string cast to a float).
$blankPriceRow = array_merge($baseRow, [
    'Product Name' => 'T26 Blank Price ' . $uid,
    'Product Code' => 'T26-BLANKPRICE-' . $uid,
    'Variant SKU' => 'T26-BLANKPRICE-SKU-' . $uid,
    'MRP' => '650', 'Selling Price' => '',
]);
$blankPriceSheetPath = $tmpDir . '/t26-blankprice-' . $uid . '.xlsx';
writeImportSheet($blankPriceSheetPath, [$blankPriceRow]);
$blankPriceResult = $importer->commit($blankPriceSheetPath, true, $cashierUserId);
assertTest('Row with blank Selling Price succeeds (no longer mandatory)', $blankPriceResult['successful_rows'] === 1, json_encode($blankPriceResult['errors']));
$blankPriceRetail = (float) $pdo->query("SELECT retail_price FROM product_variants WHERE sku = 'T26-BLANKPRICE-SKU-{$uid}'")->fetchColumn();
assertTest('Blank Selling Price on a NEW variant defaults to MRP (650), not 0', $blankPriceRetail === 650.0, (string) $blankPriceRetail);
@unlink($blankPriceSheetPath);

// 15b: blank Variant SKU on a brand-new variant -> succeeds, a SKU is
// auto-assigned (Product Code based) instead of being left blank/duplicated.
$blankSkuRow = array_merge($baseRow, [
    'Product Name' => 'T26 Blank Sku ' . $uid,
    'Product Code' => 'T26-BLANKSKU-' . $uid,
    'Variant SKU' => '',
]);
$blankSkuSheetPath = $tmpDir . '/t26-blanksku-' . $uid . '.xlsx';
writeImportSheet($blankSkuSheetPath, [$blankSkuRow]);
$blankSkuResult = $importer->commit($blankSkuSheetPath, true, $cashierUserId);
assertTest('Row with blank Variant SKU succeeds (no longer mandatory)', $blankSkuResult['successful_rows'] === 1, json_encode($blankSkuResult['errors']));
$autoSku = $pdo->query("SELECT sku FROM product_variants WHERE product_id = (SELECT id FROM products WHERE product_code = 'T26-BLANKSKU-{$uid}')")->fetchColumn();
assertTest('An auto-generated SKU was assigned, derived from the Product Code', is_string($autoSku) && str_starts_with(mb_strtoupper($autoSku), mb_strtoupper('T26-BLANKSKU-' . $uid)), (string) $autoSku);
@unlink($blankSkuSheetPath);

// 15c: BOTH Selling Price and Variant SKU blank on one new-product row ->
// succeeds, both safe defaults applied together.
$bothBlankRow = array_merge($baseRow, [
    'Product Name' => 'T26 Both Blank ' . $uid,
    'Product Code' => 'T26-BOTHBLANK-' . $uid,
    'Variant SKU' => '', 'MRP' => '300', 'Selling Price' => '',
]);
$bothBlankSheetPath = $tmpDir . '/t26-bothblank-' . $uid . '.xlsx';
writeImportSheet($bothBlankSheetPath, [$bothBlankRow]);
$bothBlankResult = $importer->commit($bothBlankSheetPath, true, $cashierUserId);
assertTest('Row with BOTH Selling Price and Variant SKU blank succeeds', $bothBlankResult['successful_rows'] === 1, json_encode($bothBlankResult['errors']));
$bothBlankVariant = $pdo->query("SELECT sku, retail_price FROM product_variants WHERE product_id = (SELECT id FROM products WHERE product_code = 'T26-BOTHBLANK-{$uid}')")->fetch();
assertTest('Both defaults applied together (auto SKU + retail_price = MRP 300)', $bothBlankVariant !== false && $bothBlankVariant['sku'] !== '' && (float) $bothBlankVariant['retail_price'] === 300.0, json_encode($bothBlankVariant));
@unlink($bothBlankSheetPath);

// 15d: two rows of the SAME new product both leaving SKU blank -> each
// gets its OWN distinct auto-generated SKU, never a duplicate-key crash.
$dualBlankSkuCode = 'T26-DUALBLANKSKU-' . $uid;
$dualBlankRowA = array_merge($baseRow, [
    'Product Name' => 'T26 Dual Blank Sku ' . $uid, 'Product Code' => $dualBlankSkuCode,
    'Variant SKU' => '', 'Size' => 'L', 'Color' => 'Red',
]);
$dualBlankRowB = array_merge($baseRow, [
    'Product Name' => 'T26 Dual Blank Sku ' . $uid, 'Product Code' => $dualBlankSkuCode,
    'Variant SKU' => '', 'Size' => 'XL', 'Color' => 'Blue',
]);
$dualBlankSheetPath = $tmpDir . '/t26-dualblanksku-' . $uid . '.xlsx';
writeImportSheet($dualBlankSheetPath, [$dualBlankRowA, $dualBlankRowB]);
$dualBlankResult = $importer->commit($dualBlankSheetPath, true, $cashierUserId);
assertTest('Two blank-SKU rows for the same new product both succeed', $dualBlankResult['successful_rows'] === 2 && $dualBlankResult['failed_rows'] === 0, json_encode($dualBlankResult['errors']));
$dualBlankSkus = $pdo->query("SELECT sku FROM product_variants WHERE product_id = (SELECT id FROM products WHERE product_code = '{$dualBlankSkuCode}') ORDER BY id")->fetchAll(PDO::FETCH_COLUMN);
assertTest('The two auto-generated SKUs are distinct (no collision)', count($dualBlankSkus) === 2 && $dualBlankSkus[0] !== $dualBlankSkus[1], json_encode($dualBlankSkus));
@unlink($dualBlankSheetPath);

// 15e: update mode — a blank Selling Price on a row updating an EXISTING
// variant must leave that variant's current price untouched, never reset
// it to MRP (matches the existing "blank cell = no change" convention
// already used for barcode/cost price/description/status/stock).
$updatePriceBeforeRow = array_merge($baseRow, [
    'Product Name' => 'T26 Update Blank Price ' . $uid, 'Product Code' => 'T26-UPDBLANKPRICE-' . $uid,
    'Variant SKU' => 'T26-UPDBLANKPRICE-SKU-' . $uid, 'MRP' => '500', 'Selling Price' => '420',
]);
$updatePriceSheet1 = $tmpDir . '/t26-updblankprice-1-' . $uid . '.xlsx';
writeImportSheet($updatePriceSheet1, [$updatePriceBeforeRow]);
$importer->commit($updatePriceSheet1, true, $cashierUserId);
@unlink($updatePriceSheet1);

$updatePriceAfterRow = array_merge($updatePriceBeforeRow, ['Selling Price' => '', 'Status' => 'ACTIVE']);
$updatePriceSheet2 = $tmpDir . '/t26-updblankprice-2-' . $uid . '.xlsx';
writeImportSheet($updatePriceSheet2, [$updatePriceAfterRow]);
$updatePriceResult = $importer->commit($updatePriceSheet2, true, $cashierUserId, true);
assertTest('Update row with blank Selling Price succeeds', $updatePriceResult['successful_rows'] === 1, json_encode($updatePriceResult['errors']));
$updatePriceRetailAfter = (float) $pdo->query("SELECT retail_price FROM product_variants WHERE sku = 'T26-UPDBLANKPRICE-SKU-{$uid}'")->fetchColumn();
assertTest('Blank Selling Price on an UPDATE row left the existing price (420) untouched, did NOT reset to MRP', $updatePriceRetailAfter === 420.0, (string) $updatePriceRetailAfter);
@unlink($updatePriceSheet2);

// 15f: a Selling Price cell that holds genuine garbage (not blank) is
// still rejected — "optional" must not mean "unvalidated".
$garbagePriceRow = array_merge($baseRow, [
    'Product Name' => 'T26 Garbage Price ' . $uid, 'Product Code' => 'T26-GARBAGEPRICE-' . $uid,
    'Variant SKU' => 'T26-GARBAGEPRICE-SKU-' . $uid, 'Selling Price' => 'not-a-number',
]);
$garbagePriceSheetPath = $tmpDir . '/t26-garbageprice-' . $uid . '.xlsx';
writeImportSheet($garbagePriceSheetPath, [$garbagePriceRow]);
$garbagePriceResult = $importer->preview($garbagePriceSheetPath, true, false);
assertTest('A non-numeric (but non-blank) Selling Price is still rejected', $garbagePriceResult['failed_rows'] === 1 && $garbagePriceResult['errors'][0]['reason'] === 'Selling Price must be numeric', json_encode($garbagePriceResult['errors']));
@unlink($garbagePriceSheetPath);

// ---------------------------------------------------------------------
// GROUP 16: regression — two rows share a Product Code (matched
// case-insensitively) and the FIRST row's product is created but then
// the row fails LATER (a bare image filename with no ZIP attached),
// rolling back that product via the SAVEPOINT. The second row, sharing
// the same product group, must not reuse the now-rolled-back product id
// — it previously crashed with a raw foreign-key SQL error instead of
// either cleanly creating its own product or reporting a row error.
// ---------------------------------------------------------------------
echo "\n-- Regression: stale product-group cache after a mid-row rollback --\n";
$dupCode = 'T26-DUPCODE-' . $uid;
$staleRowA = array_merge($baseRow, [
    'Product Name' => 'T26 Stale Cache A ' . $uid,
    'Product Code' => mb_strtoupper($dupCode), // e.g. "T26-DUPCODE-xxx" uppercase
    'Variant SKU' => 'T26-STALE-SKU-A-' . $uid,
    'Product Image Path' => 'no-zip-attached.jpg', // fails AFTER the product row is created
]);
$staleRowB = array_merge($baseRow, [
    'Product Name' => 'T26 Stale Cache B ' . $uid,
    'Product Code' => mb_strtolower($dupCode), // same code, different case — same group key
    'Variant SKU' => 'T26-STALE-SKU-B-' . $uid,
    'Product Image Path' => '', // no image — this row must succeed cleanly
]);
$staleSheetPath = $tmpDir . '/t26-stalecache-' . $uid . '.xlsx';
writeImportSheet($staleSheetPath, [$staleRowA, $staleRowB]);
$staleResult = $importer->commit($staleSheetPath, true, $cashierUserId, false, null);
assertTest(
    'Row A (image filename, no ZIP) fails cleanly, row B (same product-code group) still succeeds',
    $staleResult['successful_rows'] === 1 && $staleResult['failed_rows'] === 1
        && str_contains($staleResult['errors'][0]['reason'], 'no Product Images ZIP was uploaded'),
    json_encode($staleResult['errors'])
);
$staleVariantB = (int) $pdo->query("SELECT id FROM product_variants WHERE sku = 'T26-STALE-SKU-B-{$uid}'")->fetchColumn();
assertTest('Row B\'s variant was actually created (not a crash)', $staleVariantB > 0, (string) $staleVariantB);
$staleProductBId = (int) $pdo->query("SELECT product_id FROM product_variants WHERE id = {$staleVariantB}")->fetchColumn();
$staleProductCount = (int) $pdo->query("SELECT COUNT(*) FROM products WHERE product_code = '" . mb_strtolower($dupCode) . "' OR product_code = '" . mb_strtoupper($dupCode) . "'")->fetchColumn();
assertTest('Exactly one product row exists for this group (row A\'s was rolled back, row B created its own)', $staleProductCount === 1, (string) $staleProductCount);
assertTest('Row B\'s product has its own id, not a dangling reference to row A\'s rolled-back product', $staleProductBId > 0);
@unlink($staleSheetPath);

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
