<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Spreadsheet;
use PDO;
use RuntimeException;

/**
 * Product + variant Excel import (ECOMMERCE_POS_ADMIN_SPEC.md sections
 * 11, 39). One row per variant; rows sharing the same Product Code (or
 * Product Name, if no code is given) attach as additional variants to one
 * product — the first such row in the file creates it (or, if a product
 * with that code/name already exists, reuses it).
 *
 * preview() and commit() run the identical row-processing logic — the
 * only difference is whether the outer transaction is committed or
 * rolled back at the end. Each row runs inside its own SAVEPOINT so one
 * bad row can be undone without losing the rows already processed before
 * it (MySQL does not require this to continue the transaction after an
 * error — InnoDB's "statement failure doesn't abort the transaction"
 * behavior already provides that — but a row spans several statements,
 * e.g. the product insert then the variant insert can't both be undone
 * without a SAVEPOINT if the second one fails).
 *
 * Update mode: by default a row whose Variant SKU already exists is
 * rejected (safe default — an import can never silently overwrite a
 * variant). Passing $updateExisting = true switches that row to an
 * update of the existing variant instead: price/description/status are
 * replaced outright, but stock is reconciled as a *difference* against
 * the current on-hand quantity (never a raw "set"), and a blank stock
 * cell never touches existing stock — see updateVariant().
 *
 * Images: "Product Images" / "Variant Images" cells hold one or more
 * comma-separated URLs (first = primary/main image). Each URL is
 * downloaded through SafeImageFetcher (SSRF-guarded: public hosts only,
 * no redirects, size-capped, MIME re-sniffed) and then run through the
 * same ImageUploadService used by the manual product-image upload
 * endpoints, so imported images get the identical WebP conversion/resize
 * pipeline — never stored as a raw external URL. A product/variant that
 * already has at least one image is left alone on a repeat import rather
 * than accumulating duplicates.
 *
 * No `Product Line` column — removed per the resolved spec conflict
 * (README.md "Conflicts ... resolved").
 */
final class ProductImportService
{
    public const HEADERS = [
        'Product Name', 'Product Code', 'Category', 'Subcategory', 'Brand',
        'Description', 'Short Description', 'Material', 'Unit', 'HSN Code', 'Tax', 'Tax Type',
        'Manufacturer', 'Manufacturing Date', 'Expiry Date', 'Product Images',
        'Variant SKU', 'Variant Barcode', 'Variant Description', 'Size', 'Color',
        'MRP', 'Selling Price', 'Variant Cost Price', 'Variant Stock', 'Low Stock Threshold',
        'Variant Images', 'Status',
    ];

    private readonly ImageUploadService $uploader;
    private readonly SafeImageFetcher $imageFetcher;

    public function __construct(
        private readonly PDO $pdo,
        private readonly InventoryService $inventory,
        ?ImageUploadService $uploader = null,
        ?SafeImageFetcher $imageFetcher = null,
    ) {
        $this->uploader = $uploader ?? new ImageUploadService();
        $this->imageFetcher = $imageFetcher ?? new SafeImageFetcher();
    }

    /** @return array<string, mixed> */
    public function preview(string $filePath, bool $autoCreateMasters, bool $updateExisting = false): array
    {
        return $this->run($filePath, $autoCreateMasters, $updateExisting, null, false);
    }

    /** @return array<string, mixed> */
    public function commit(string $filePath, bool $autoCreateMasters, int $userId, bool $updateExisting = false): array
    {
        return $this->run($filePath, $autoCreateMasters, $updateExisting, $userId, true);
    }

    /**
     * Downloadable error report (section 39: "Download Error Excel") —
     * the original row data for every failed row, plus why it failed.
     *
     * @param list<array{row: int, status: string, errors: list<string>, raw?: array<string, string>}> $results
     */
    public function errorReport(array $results): string
    {
        $headers = array_merge(['Row', 'Error Reason'], self::HEADERS);
        $rows = [];

        foreach ($results as $result) {
            if ($result['status'] !== 'error') {
                continue;
            }

            $rows[] = array_merge(
                ['Row' => $result['row'], 'Error Reason' => $result['errors'][0] ?? 'Unknown error'],
                $result['raw'] ?? []
            );
        }

        $path = sys_get_temp_dir() . '/product-import-errors-' . bin2hex(random_bytes(6)) . '.xlsx';
        Spreadsheet::writeRows($path, $headers, $rows);

        return $path;
    }

    /** @return array<string, mixed> */
    private function run(string $filePath, bool $autoCreateMasters, bool $updateExisting, ?int $userId, bool $commit): array
    {
        $rows = Spreadsheet::readRows($filePath);

        if ($rows === []) {
            throw new RuntimeException('The file has no data rows');
        }

        // Identifies this exact file's content for stock-diff idempotency
        // (see updateVariant()) — re-submitting the identical file never
        // double-applies a stock difference, but a file with changed
        // numbers always does.
        $fileHash = hash_file('sha256', $filePath) ?: bin2hex(random_bytes(16));

        $this->pdo->beginTransaction();

        $results = [];
        $productIdByGroupKey = [];

        foreach ($rows as $index => $row) {
            $excelRow = $index + 2; // header is row 1
            $this->pdo->exec('SAVEPOINT import_row');

            try {
                [$productId, $variantId] = $this->processRow($row, $autoCreateMasters, $updateExisting, $userId, $fileHash, $productIdByGroupKey);
                $this->pdo->exec('RELEASE SAVEPOINT import_row');
                $results[] = ['row' => $excelRow, 'status' => 'success', 'errors' => [], 'product_id' => $productId, 'variant_id' => $variantId];
            } catch (RuntimeException $e) {
                $this->pdo->exec('ROLLBACK TO SAVEPOINT import_row');
                $results[] = ['row' => $excelRow, 'status' => 'error', 'errors' => [$e->getMessage()], 'raw' => $row];
            }
        }

        $successCount = count(array_filter($results, fn ($r) => $r['status'] === 'success'));
        $failedRows = array_values(array_filter($results, fn ($r) => $r['status'] === 'error'));

        if ($commit) {
            $this->pdo->commit();
        } else {
            $this->pdo->rollBack();
        }

        return [
            'total_rows' => count($rows),
            'successful_rows' => $successCount,
            'failed_rows' => count($failedRows),
            'results' => $results,
            'errors' => array_map(fn ($r) => ['row' => $r['row'], 'reason' => $r['errors'][0]], $failedRows),
        ];
    }

    /**
     * @param array<string, string> $row
     * @param array<string, int> $productIdByGroupKey
     * @return array{0: int, 1: int} [productId, variantId]
     */
    private function processRow(array $row, bool $autoCreateMasters, bool $updateExisting, ?int $userId, string $fileHash, array &$productIdByGroupKey): array
    {
        $productName = trim($row['Product Name'] ?? '');
        $sku = trim($row['Variant SKU'] ?? '');
        $mrp = trim($row['MRP'] ?? '');
        $sellingPrice = trim($row['Selling Price'] ?? '');

        if ($productName === '') {
            throw new RuntimeException('Product Name is required');
        }
        if ($sku === '') {
            throw new RuntimeException('Variant SKU is required');
        }
        if ($mrp === '' || !is_numeric($mrp)) {
            throw new RuntimeException('MRP is required and must be numeric');
        }
        if ($sellingPrice === '' || !is_numeric($sellingPrice)) {
            throw new RuntimeException('Selling Price is required and must be numeric');
        }

        $barcode = trim($row['Variant Barcode'] ?? '') ?: null;

        $productCode = trim($row['Product Code'] ?? '') ?: null;
        $groupKey = $productCode !== null ? 'code:' . mb_strtolower($productCode) : 'name:' . mb_strtolower($productName);

        if (isset($productIdByGroupKey[$groupKey])) {
            $productId = $productIdByGroupKey[$groupKey];
        } else {
            $productId = $this->findExistingProduct($productCode, $productName)
                ?? $this->createProduct($row, $productName, $productCode, $autoCreateMasters);
            $productIdByGroupKey[$groupKey] = $productId;

            $this->maybeImportProductImages(trim($row['Product Images'] ?? ''), $productId);
        }

        $existingVariantId = $this->findVariantBySku($sku);

        if ($existingVariantId !== null) {
            if (!$updateExisting) {
                throw new RuntimeException('SKU already exists');
            }
            $this->assertBarcodeFree($barcode, $existingVariantId);
            $variantId = $this->updateVariant($existingVariantId, $row, $barcode, (float) $mrp, (float) $sellingPrice, $userId, $fileHash);
        } else {
            $this->assertBarcodeFree($barcode, null);
            $variantId = $this->createVariant($row, $productId, $sku, $barcode, (float) $mrp, (float) $sellingPrice, $autoCreateMasters);

            $stockRaw = trim($row['Variant Stock'] ?? '');
            if ($stockRaw !== '' && is_numeric($stockRaw) && (float) $stockRaw > 0 && $userId !== null) {
                $this->inventory->apply(
                    variantId: $variantId,
                    productId: $productId,
                    movementType: 'OPENING_STOCK',
                    onHandDelta: $stockRaw,
                    reservedDelta: '0',
                    referenceType: 'ADJUSTMENT',
                    referenceId: $variantId,
                    referenceItemId: null,
                    channel: 'ADMIN',
                    userId: $userId,
                    idempotencyKey: "import-opening-stock-{$variantId}",
                );
            }

            $lowStock = trim($row['Low Stock Threshold'] ?? '');
            if ($lowStock !== '' && is_numeric($lowStock)) {
                $this->inventory->setLowStockThreshold($variantId, (string) $lowStock);
            }
        }

        return [$productId, $variantId];
    }

    private function findExistingProduct(?string $productCode, string $productName): ?int
    {
        if ($productCode !== null) {
            $stmt = $this->pdo->prepare('SELECT id FROM products WHERE product_code = :code AND deleted_at IS NULL');
            $stmt->execute(['code' => $productCode]);
            $id = $stmt->fetchColumn();
            if ($id !== false) {
                return (int) $id;
            }
        }

        $stmt = $this->pdo->prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(:name) AND deleted_at IS NULL');
        $stmt->execute(['name' => $productName]);
        $id = $stmt->fetchColumn();

        return $id === false ? null : (int) $id;
    }

    private function findVariantBySku(string $sku): ?int
    {
        $stmt = $this->pdo->prepare('SELECT id FROM product_variants WHERE sku = :sku AND deleted_at IS NULL');
        $stmt->execute(['sku' => $sku]);
        $id = $stmt->fetchColumn();

        return $id === false ? null : (int) $id;
    }

    /** @param int|null $excludeVariantId variant allowed to already own this barcode (update mode) */
    private function assertBarcodeFree(?string $barcode, ?int $excludeVariantId): void
    {
        if ($barcode === null) {
            return;
        }

        $sql = 'SELECT 1 FROM product_variants WHERE barcode = :barcode AND deleted_at IS NULL';
        $params = ['barcode' => $barcode];
        if ($excludeVariantId !== null) {
            $sql .= ' AND id != :excluded';
            $params['excluded'] = $excludeVariantId;
        }

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        if ($stmt->fetchColumn() !== false) {
            throw new RuntimeException('Barcode already exists');
        }
    }

    /** @param array<string, string> $row */
    private function createProduct(array $row, string $productName, ?string $productCode, bool $autoCreate): int
    {
        $brandId = $this->resolveOptionalMaster('brands', 'name', 'Brand', trim($row['Brand'] ?? ''), $autoCreate, fn ($name) =>
            $this->pdo->prepare('INSERT INTO brands (name) VALUES (:name)')->execute(['name' => $name])
        );
        $unitId = $this->resolveOptionalMaster('units', 'name', 'Unit', trim($row['Unit'] ?? ''), $autoCreate, fn ($name) =>
            $this->pdo->prepare('INSERT INTO units (name, short_code) VALUES (:name, :code)')
                ->execute(['name' => $name, 'code' => mb_strtoupper(mb_substr($name, 0, 10))])
        );
        $hsnCodeId = $this->resolveHsnCode(trim($row['HSN Code'] ?? ''), $autoCreate);
        $gstRateId = $this->resolveGstRate(trim($row['Tax'] ?? ''), trim($row['Tax Type'] ?? 'EXCLUSIVE'), $autoCreate);

        $this->pdo->prepare(
            'INSERT INTO products (
                name, slug, product_code, brand_id, unit_id, hsn_code_id, gst_rate_id,
                description, short_description, material, manufacturer, manufacturing_date, expiry_date
            ) VALUES (
                :name, :slug, :product_code, :brand_id, :unit_id, :hsn_code_id, :gst_rate_id,
                :description, :short_description, :material, :manufacturer, :manufacturing_date, :expiry_date
            )'
        )->execute([
            'name' => $productName,
            'slug' => $this->uniqueSlug($productName),
            'product_code' => $productCode,
            'brand_id' => $brandId,
            'unit_id' => $unitId,
            'hsn_code_id' => $hsnCodeId,
            'gst_rate_id' => $gstRateId,
            'description' => $row['Description'] ?? null ?: null,
            'short_description' => $row['Short Description'] ?? null ?: null,
            'material' => $row['Material'] ?? null ?: null,
            'manufacturer' => $row['Manufacturer'] ?? null ?: null,
            'manufacturing_date' => $this->parseDate($row['Manufacturing Date'] ?? ''),
            'expiry_date' => $this->parseDate($row['Expiry Date'] ?? ''),
        ]);

        $productId = (int) $this->pdo->lastInsertId();

        $categoryIds = $this->resolveCategories(trim($row['Category'] ?? ''), $autoCreate);
        foreach ($categoryIds as $i => $categoryId) {
            $this->pdo->prepare('INSERT INTO product_categories (product_id, category_id, is_primary) VALUES (:p, :c, :primary)')
                ->execute(['p' => $productId, 'c' => $categoryId, 'primary' => $i === 0 ? 1 : 0]);
        }

        $subcategoryIds = $this->resolveSubcategories(trim($row['Subcategory'] ?? ''), $autoCreate);
        foreach ($subcategoryIds as $subcategoryId) {
            $this->pdo->prepare('INSERT INTO product_subcategories (product_id, subcategory_id) VALUES (:p, :s)')
                ->execute(['p' => $productId, 's' => $subcategoryId]);
        }

        return $productId;
    }

    /** @param array<string, string> $row */
    private function createVariant(
        array $row,
        int $productId,
        string $sku,
        ?string $barcode,
        float $mrp,
        float $sellingPrice,
        bool $autoCreate,
    ): int {
        $costPrice = trim($row['Variant Cost Price'] ?? '');
        $status = trim($row['Status'] ?? 'ACTIVE') ?: 'ACTIVE';

        if (!in_array(mb_strtoupper($status), ['ACTIVE', 'INACTIVE'], true)) {
            throw new RuntimeException("Invalid Status '{$status}' — must be ACTIVE or INACTIVE");
        }

        $this->pdo->prepare(
            'INSERT INTO product_variants (product_id, sku, barcode, mrp, retail_price, purchase_price, variant_description, status)
             VALUES (:product_id, :sku, :barcode, :mrp, :retail_price, :purchase_price, :description, :status)'
        )->execute([
            'product_id' => $productId,
            'sku' => $sku,
            'barcode' => $barcode,
            'mrp' => $mrp,
            'retail_price' => $sellingPrice,
            'purchase_price' => $costPrice !== '' && is_numeric($costPrice) ? $costPrice : null,
            'description' => $row['Variant Description'] ?? null ?: null,
            'status' => mb_strtoupper($status),
        ]);

        $variantId = (int) $this->pdo->lastInsertId();

        foreach (['Size' => trim($row['Size'] ?? ''), 'Color' => trim($row['Color'] ?? '')] as $attributeName => $value) {
            if ($value === '') {
                continue;
            }

            $valueId = $this->resolveAttributeValue($attributeName, $value, $autoCreate);
            $this->pdo->prepare('INSERT INTO product_variant_values (variant_id, attribute_value_id) VALUES (:v, :a)')
                ->execute(['v' => $variantId, 'a' => $valueId]);
        }

        $this->pdo->prepare('INSERT INTO inventory (variant_id, product_id, on_hand, reserved) VALUES (:v, :p, 0, 0)')
            ->execute(['v' => $variantId, 'p' => $productId]);

        $this->maybeImportVariantImages(trim($row['Variant Images'] ?? ''), $variantId);

        return $variantId;
    }

    /**
     * Update path for a row whose SKU already matches an existing
     * variant (only reached when $updateExisting was requested). Price,
     * barcode, description and status are replaced outright; stock is
     * reconciled as a difference against the current on-hand quantity so
     * a blank "Variant Stock" cell never resets existing stock to zero,
     * and re-submitting the identical file never double-applies the
     * difference (idempotency key is derived from the file's own
     * content hash, not just the variant id).
     *
     * @param array<string, string> $row
     */
    private function updateVariant(int $variantId, array $row, ?string $barcode, float $mrp, float $sellingPrice, ?int $userId, string $fileHash): int
    {
        $costPrice = trim($row['Variant Cost Price'] ?? '');
        $statusRaw = trim($row['Status'] ?? '');

        if ($statusRaw !== '' && !in_array(mb_strtoupper($statusRaw), ['ACTIVE', 'INACTIVE'], true)) {
            throw new RuntimeException("Invalid Status '{$statusRaw}' — must be ACTIVE or INACTIVE");
        }

        $productStmt = $this->pdo->prepare('SELECT product_id FROM product_variants WHERE id = :id');
        $productStmt->execute(['id' => $variantId]);
        $productId = (int) $productStmt->fetchColumn();

        $sets = ['mrp = :mrp', 'retail_price = :retail_price'];
        $params = ['mrp' => $mrp, 'retail_price' => $sellingPrice, 'id' => $variantId];

        if ($barcode !== null) {
            $sets[] = 'barcode = :barcode';
            $params['barcode'] = $barcode;
        }
        if ($costPrice !== '' && is_numeric($costPrice)) {
            $sets[] = 'purchase_price = :purchase_price';
            $params['purchase_price'] = $costPrice;
        }
        if (($row['Variant Description'] ?? '') !== '') {
            $sets[] = 'variant_description = :description';
            $params['description'] = $row['Variant Description'];
        }
        if ($statusRaw !== '') {
            $sets[] = 'status = :status';
            $params['status'] = mb_strtoupper($statusRaw);
        }

        $this->pdo->prepare('UPDATE product_variants SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);

        $stockRaw = trim($row['Variant Stock'] ?? '');
        if ($stockRaw !== '' && is_numeric($stockRaw) && $userId !== null) {
            $currentStmt = $this->pdo->prepare('SELECT on_hand FROM inventory WHERE variant_id = :id');
            $currentStmt->execute(['id' => $variantId]);
            $onHand = $currentStmt->fetchColumn();
            $onHand = $onHand === false ? '0' : (string) $onHand;
            $diff = bcsub((string) $stockRaw, $onHand, 3);

            if (bccomp($diff, '0', 3) !== 0) {
                $this->inventory->apply(
                    variantId: $variantId,
                    productId: $productId,
                    movementType: bccomp($diff, '0', 3) > 0 ? 'STOCK_ADJUSTMENT_IN' : 'STOCK_ADJUSTMENT_OUT',
                    onHandDelta: $diff,
                    reservedDelta: '0',
                    referenceType: 'ADJUSTMENT',
                    referenceId: $variantId,
                    referenceItemId: null,
                    channel: 'ADMIN',
                    userId: $userId,
                    idempotencyKey: "import-update-stock-{$variantId}-{$fileHash}",
                    reason: 'Excel import — reconciled to imported stock figure',
                );
            }
        }

        $lowStock = trim($row['Low Stock Threshold'] ?? '');
        if ($lowStock !== '' && is_numeric($lowStock)) {
            $this->inventory->setLowStockThreshold($variantId, (string) $lowStock);
        }

        $this->maybeImportVariantImages(trim($row['Variant Images'] ?? ''), $variantId);

        return $variantId;
    }

    /**
     * Imports a comma-separated list of image URLs for a product, but
     * only the first time — a product that already has at least one
     * image is left untouched so re-running the same (or an updating)
     * import never accumulates duplicate image rows.
     */
    private function maybeImportProductImages(string $csv, int $productId): void
    {
        if ($csv === '') {
            return;
        }

        $countStmt = $this->pdo->prepare('SELECT COUNT(*) FROM product_images WHERE product_id = :id');
        $countStmt->execute(['id' => $productId]);
        if ((int) $countStmt->fetchColumn() > 0) {
            return;
        }

        foreach ($this->splitImageList($csv) as $i => $url) {
            $stored = $this->downloadAndStore($url);
            $this->pdo->prepare(
                'INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary) VALUES (:p, :path, :thumb, :sort, :primary)'
            )->execute([
                'p' => $productId,
                'path' => $stored['path'],
                'thumb' => $stored['thumb_path'],
                'sort' => $i,
                'primary' => $i === 0 ? 1 : 0,
            ]);
        }
    }

    private function maybeImportVariantImages(string $csv, int $variantId): void
    {
        if ($csv === '') {
            return;
        }

        $countStmt = $this->pdo->prepare('SELECT COUNT(*) FROM variant_images WHERE variant_id = :id');
        $countStmt->execute(['id' => $variantId]);
        if ((int) $countStmt->fetchColumn() > 0) {
            return;
        }

        foreach ($this->splitImageList($csv) as $i => $url) {
            $stored = $this->downloadAndStore($url);
            $this->pdo->prepare(
                'INSERT INTO variant_images (variant_id, image_path, thumb_path, sort_order, is_primary) VALUES (:v, :path, :thumb, :sort, :primary)'
            )->execute([
                'v' => $variantId,
                'path' => $stored['path'],
                'thumb' => $stored['thumb_path'],
                'sort' => $i,
                'primary' => $i === 0 ? 1 : 0,
            ]);
        }
    }

    /** @return list<string> */
    private function splitImageList(string $csv): array
    {
        return array_values(array_filter(array_map('trim', explode(',', $csv))));
    }

    /** @return array{path: string, thumb_path: string} */
    private function downloadAndStore(string $url): array
    {
        $fetched = $this->imageFetcher->fetch($url);

        if ($fetched === null) {
            throw new RuntimeException("Could not resolve image (blocked, unreachable, too large, or not a JPG/PNG/WEBP): {$url}");
        }

        try {
            $file = [
                'tmp_name' => $fetched['tmp_path'],
                'size' => $fetched['size'],
                'error' => UPLOAD_ERR_OK,
                'name' => basename((string) (parse_url($url, PHP_URL_PATH) ?: 'image')),
            ];

            return $this->uploader->store($file, 'products');
        } finally {
            @unlink($fetched['tmp_path']);
        }
    }

    /** @param list<string> $names */
    private function resolveCategories(string $value, bool $autoCreate): array
    {
        if ($value === '') {
            throw new RuntimeException('Category is required');
        }

        $ids = [];
        foreach (array_filter(array_map('trim', explode('|', $value))) as $name) {
            $ids[] = $this->resolveRequiredMaster('categories', 'Category', $name, $autoCreate, fn ($n) =>
                $this->pdo->prepare('INSERT INTO categories (name, slug) VALUES (:name, :slug)')
                    ->execute(['name' => $n, 'slug' => $this->slugify($n)])
            );
        }

        return $ids;
    }

    /** @return list<int> */
    private function resolveSubcategories(string $value, bool $autoCreate): array
    {
        if ($value === '') {
            return [];
        }

        $ids = [];
        foreach (array_filter(array_map('trim', explode('|', $value))) as $name) {
            $ids[] = $this->resolveOptionalMaster('subcategories', 'name', 'Subcategory', $name, $autoCreate, fn ($n) =>
                $this->pdo->prepare('INSERT INTO subcategories (name, slug) VALUES (:name, :slug)')
                    ->execute(['name' => $n, 'slug' => $this->slugify($n)])
            );
        }

        return $ids;
    }

    private function resolveAttributeValue(string $attributeName, string $value, bool $autoCreate): int
    {
        $attrStmt = $this->pdo->prepare('SELECT id FROM variant_attributes WHERE LOWER(name) = LOWER(:name)');
        $attrStmt->execute(['name' => $attributeName]);
        $attributeId = $attrStmt->fetchColumn();

        if ($attributeId === false) {
            if (!$autoCreate) {
                throw new RuntimeException("Variant attribute '{$attributeName}' not found");
            }
            $this->pdo->prepare('INSERT INTO variant_attributes (name) VALUES (:name)')->execute(['name' => $attributeName]);
            $attributeId = (int) $this->pdo->lastInsertId();
        }

        $valueStmt = $this->pdo->prepare(
            'SELECT id FROM variant_attribute_values WHERE attribute_id = :attr AND LOWER(value) = LOWER(:value)'
        );
        $valueStmt->execute(['attr' => $attributeId, 'value' => $value]);
        $valueId = $valueStmt->fetchColumn();

        if ($valueId === false) {
            if (!$autoCreate) {
                throw new RuntimeException("Value '{$value}' for attribute '{$attributeName}' not found");
            }
            $this->pdo->prepare('INSERT INTO variant_attribute_values (attribute_id, value) VALUES (:attr, :value)')
                ->execute(['attr' => $attributeId, 'value' => $value]);
            $valueId = (int) $this->pdo->lastInsertId();
        }

        return (int) $valueId;
    }

    private function resolveHsnCode(string $code, bool $autoCreate): ?int
    {
        if ($code === '') {
            return null;
        }

        return $this->resolveOptionalMaster('hsn_codes', 'code', 'HSN Code', $code, $autoCreate, fn ($c) =>
            $this->pdo->prepare('INSERT INTO hsn_codes (code) VALUES (:code)')->execute(['code' => $c])
        );
    }

    private function resolveGstRate(string $percent, string $taxMode, bool $autoCreate): ?int
    {
        if ($percent === '') {
            return null;
        }

        if (!is_numeric($percent)) {
            throw new RuntimeException("Invalid Tax value '{$percent}'");
        }

        $taxMode = mb_strtoupper($taxMode) === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE';

        $stmt = $this->pdo->prepare('SELECT id FROM gst_rates WHERE gst_percent = :percent AND tax_mode = :mode');
        $stmt->execute(['percent' => $percent, 'mode' => $taxMode]);
        $id = $stmt->fetchColumn();

        if ($id !== false) {
            return (int) $id;
        }

        if (!$autoCreate) {
            throw new RuntimeException("GST rate {$percent}% ({$taxMode}) not found");
        }

        $half = (string) ((float) $percent / 2);
        $this->pdo->prepare(
            'INSERT INTO gst_rates (name, gst_percent, cgst_percent, sgst_percent, igst_percent, tax_mode)
             VALUES (:name, :percent, :half, :half2, :percent2, :mode)'
        )->execute([
            'name' => "GST {$percent}%",
            'percent' => $percent,
            'half' => $half,
            'half2' => $half,
            'percent2' => $percent,
            'mode' => $taxMode,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /** @param callable(string): mixed $createFn */
    private function resolveRequiredMaster(string $table, string $label, string $name, bool $autoCreate, callable $createFn): int
    {
        $id = $this->resolveOptionalMaster($table, 'name', $label, $name, $autoCreate, $createFn);

        if ($id === null) {
            throw new RuntimeException("{$label} '{$name}' not found");
        }

        return $id;
    }

    /**
     * $label is the human-readable singular name used in error messages
     * (e.g. "Category" for the `categories` table) — derived once at each
     * call site instead of guessed from the table name, which mangled
     * "categories" into "Categorie" (naive rtrim($table, 's')).
     *
     * @param callable(string): mixed $createFn
     */
    private function resolveOptionalMaster(string $table, string $column, string $label, string $value, bool $autoCreate, callable $createFn): ?int
    {
        if ($value === '') {
            return null;
        }

        $stmt = $this->pdo->prepare("SELECT id FROM {$table} WHERE LOWER({$column}) = LOWER(:value)");
        $stmt->execute(['value' => $value]);
        $id = $stmt->fetchColumn();

        if ($id !== false) {
            return (int) $id;
        }

        if (!$autoCreate) {
            throw new RuntimeException("{$label} '{$value}' not found");
        }

        $createFn($value);

        return (int) $this->pdo->lastInsertId();
    }

    private function parseDate(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        $timestamp = strtotime($value);

        if ($timestamp === false) {
            throw new RuntimeException("Invalid date '{$value}'");
        }

        return date('Y-m-d', $timestamp);
    }

    private function slugify(string $value): string
    {
        $slug = mb_strtolower(trim($value));
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? $slug;

        return trim($slug, '-');
    }

    private function uniqueSlug(string $name): string
    {
        $base = $this->slugify($name);
        $slug = $base;
        $suffix = 1;

        while (true) {
            $stmt = $this->pdo->prepare('SELECT 1 FROM products WHERE slug = :slug');
            $stmt->execute(['slug' => $slug]);

            if ($stmt->fetchColumn() === false) {
                return $slug;
            }

            $slug = "{$base}-{$suffix}";
            $suffix++;
        }
    }
}
