<?php

declare(strict_types=1);

require dirname(__DIR__) . '/backend/vendor/autoload.php';

use Dotenv\Dotenv;
use App\Services\ProductImportService;
use App\Services\InventoryService;
use App\Services\SafeZipExtractor;

$backendDir = dirname(__DIR__) . '/backend';
Dotenv::createImmutable($backendDir)->safeLoad();

require_once $backendDir . '/config/database.php';

$pdo = db();
$dbName = $pdo->query('SELECT DATABASE()')->fetchColumn();
echo "Connected to database: {$dbName}\n";

$excelPath = __DIR__ . '/seed/real-catalog/shopadams-100-products.xlsx';
$zipPath = __DIR__ . '/seed/real-catalog/shopadams-100-product-images.zip';

if (!file_exists($excelPath)) {
    die("Excel file not found at: {$excelPath}\n");
}
if (!file_exists($zipPath)) {
    die("ZIP file not found at: {$zipPath}\n");
}

echo "Extracting product images from ZIP...\n";
$extractor = new SafeZipExtractor();
$imagesDir = $extractor->extract($zipPath);

echo "Running Product Import with auto-create masters...\n";
$importer = new ProductImportService($pdo, new InventoryService($pdo));

try {
    $result = $importer->commit(
        filePath: $excelPath,
        autoCreateMasters: true,
        userId: 1,
        updateExisting: true,
        imagesDir: $imagesDir,
        batchMeta: [
            'name' => '100 Real Grocery Products (Dev Catalog)',
            'excel_filename' => 'shopadams-100-products.xlsx',
            'zip_filename' => 'shopadams-100-product-images.zip',
            'zip_size_bytes' => filesize($zipPath),
        ]
    );

    $extractor->cleanup($imagesDir);

    echo "Import completed successfully!\n";
    echo "  Total Rows:      " . ($result['total_rows'] ?? 0) . "\n";
    echo "  Successful Rows: " . ($result['successful_rows'] ?? 0) . "\n";
    echo "  Failed Rows:     " . ($result['failed_rows'] ?? 0) . "\n";

    if (!empty($result['errors'])) {
        echo "  Errors encountered:\n";
        foreach (array_slice($result['errors'], 0, 10) as $err) {
            echo "    - " . json_encode($err) . "\n";
        }
    }
} catch (Throwable $e) {
    $extractor->cleanup($imagesDir);
    echo "Import failed with exception: " . $e->getMessage() . "\n";
    echo $e->getTraceAsString() . "\n";
    exit(1);
}
