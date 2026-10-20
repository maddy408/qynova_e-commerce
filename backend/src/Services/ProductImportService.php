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
 * Images: "Product Image Path" / "Variant Image Path" cells hold one or more
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
 *
 * Variant SKU and Selling Price are both optional cells — see
 * generateVariantSku() for what a blank SKU becomes and
 * createVariant()/updateVariant() for what a blank Selling Price becomes.
 * Product Name, MRP, Category and (when auto-create is off) every other
 * master-data lookup remain required exactly as before.
 */
final class ProductImportService
{
    public const HEADERS = [
        'Product Name', 'Product Code', 'Category', 'Subcategory', 'Brand',
        'Description', 'Short Description', 'Material', 'Unit', 'HSN Code', 'Tax', 'Tax Type',
        'Manufacturer', 'Manufacturing Date', 'Expiry Date',
        'Return Eligible', 'Return Window (Days)', 'Product Image Path',
        'Variant SKU', 'Variant Barcode', 'Variant Description', 'Size', 'Color',
        'MRP', 'Selling Price', 'Variant Cost Price', 'Opening Stock', 'Low Stock Threshold',
        'Variant Image Path', 'Status',
    ];

    private readonly ImageUploadService $uploader;
    private readonly SafeImageFetcher $imageFetcher;

    /** @var list<string> relative paths written during the row currently being processed — see run() */
    private array $pendingUploadedFiles = [];

    /** @var list<string> cache keys (see downloadAndStore()) first populated during the row currently being processed */
    private array $pendingCacheKeys = [];

    /**
     * Set to the $productIdByGroupKey key (see run()/processRow()) when
     * the row currently being processed is the one that just created a
     * NEW product and cached its id under that key — null when the row
     * instead reused an entry an earlier, already-succeeded row put
     * there. If this row then fails LATER (e.g. its image step), the
     * SAVEPOINT rollback in run() undoes the product INSERT itself, but
     * $productIdByGroupKey is a plain in-memory array the database
     * rollback knows nothing about — without this, a later row sharing
     * the same product group (same Product Code, matched case-
     * insensitively) would keep reusing that now-dangling id and crash
     * with a raw foreign-key SQL error instead of a clean row error.
     */
    private ?string $pendingNewGroupKey = null;

    /**
     * Same image token (URL or filename) referenced more than once across
     * the file — e.g. the same photo used as both a product's main image
     * and reused on a second variant row — is fetched/converted/stored
     * only ONCE; every later occurrence reuses this cached result instead
     * of uploading a duplicate physical file. Scoped to one run() call
     * (reset there), not across separate requests.
     *
     * @var array<string, array{path: string, thumb_path: string}>
     */
    private array $imageCache = [];

    /** Import-history batch the current commit() writes images into (null during preview). */
    private ?int $batchId = null;

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
    public function preview(string $filePath, bool $autoCreateMasters, bool $updateExisting = false, ?string $imagesDir = null): array
    {
        return $this->run($filePath, $autoCreateMasters, $updateExisting, null, false, $imagesDir);
    }

    /** @return array<string, mixed> */
    /**
     * @param array{name?: string, excel_filename?: string, zip_filename?: ?string, zip_size_bytes?: ?int} $batchMeta
     *        recorded in the import history (product_import_batches)
     */
    public function commit(string $filePath, bool $autoCreateMasters, int $userId, bool $updateExisting = false, ?string $imagesDir = null, array $batchMeta = []): array
    {
        $excel = $batchMeta['excel_filename'] ?? null;
        $zip = $batchMeta['zip_filename'] ?? null;
        $name = trim((string) ($batchMeta['name'] ?? '')) ?: (($zip ?: $excel ?: 'Product import') . ' - ' . date('d M Y, h:i A'));
        $this->pdo->prepare(
            'INSERT INTO product_import_batches (name, excel_filename, zip_filename, zip_size_bytes, created_by) VALUES (:n, :e, :z, :s, :u)'
        )->execute(['n' => mb_substr($name, 0, 190), 'e' => $excel, 'z' => $zip, 's' => $batchMeta['zip_size_bytes'] ?? null, 'u' => $userId]);
        $this->batchId = (int) $this->pdo->lastInsertId();

        try {
            $result = $this->run($filePath, $autoCreateMasters, $updateExisting, $userId, true, $imagesDir);
        } catch (\Throwable $e) {
            $this->pdo->prepare('DELETE FROM product_import_batches WHERE id = :id')->execute(['id' => $this->batchId]);
            $this->batchId = null;
            throw $e;
        }

        $this->pdo->prepare('UPDATE product_import_batches SET total_rows = :t, successful_rows = :ok, failed_rows = :f WHERE id = :id')
            ->execute(['t' => $result['total_rows'], 'ok' => $result['successful_rows'], 'f' => $result['failed_rows'], 'id' => $this->batchId]);
        $result['import_batch_id'] = $this->batchId;
        $this->batchId = null;

        return $result;
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
    private function run(string $filePath, bool $autoCreateMasters, bool $updateExisting, ?int $userId, bool $commit, ?string $imagesDir = null): array
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
        $imageStats = [
            'product_images_found' => [],
            'product_images_missing' => [],
            'variant_images_found' => [],
            'variant_images_missing' => [],
        ];

        // preview() ($commit=false) must never leave a real file behind —
        // images are only ever validated there, never persisted (see
        // downloadAndStore()'s $persist parameter) — so this tracking is
        // only consulted in commit mode, where a row that writes an image
        // and then fails LATER in that same row (a later statement throws)
        // must not leave an orphaned file on disk even though its DB rows
        // were rolled back by the SAVEPOINT below. $imageCache persists for
        // the WHOLE file (not reset per row) — that's what lets a filename
        // referenced by more than one row reuse one stored file instead of
        // uploading a duplicate; $pendingCacheKeys tracks only the entries
        // THIS row added, so a row that fails after creating a fresh cache
        // entry un-caches it too (its file is being deleted right below),
        // while an entry reused from an earlier, already-succeeded row is
        // never touched by a later row's failure.
        $this->pendingUploadedFiles = [];
        $this->pendingCacheKeys = [];
        $this->imageCache = [];

        foreach ($rows as $index => $row) {
            $excelRow = $index + 2; // header is row 1
            $this->pdo->exec('SAVEPOINT import_row');
            $this->pendingUploadedFiles = [];
            $this->pendingCacheKeys = [];
            $this->pendingNewGroupKey = null;

            try {
                [$productId, $variantId] = $this->processRow($row, $autoCreateMasters, $updateExisting, $userId, $fileHash, $imagesDir, $commit, $imageStats, $productIdByGroupKey);
                $this->pdo->exec('RELEASE SAVEPOINT import_row');
                $results[] = ['row' => $excelRow, 'status' => 'success', 'errors' => [], 'product_id' => $productId, 'variant_id' => $variantId];
            } catch (RuntimeException $e) {
                $this->pdo->exec('ROLLBACK TO SAVEPOINT import_row');
                foreach ($this->pendingUploadedFiles as $uploadedPath) {
                    $this->uploader->delete($uploadedPath);
                }
                foreach ($this->pendingCacheKeys as $cacheKey) {
                    unset($this->imageCache[$cacheKey]);
                }
                if ($this->pendingNewGroupKey !== null) {
                    unset($productIdByGroupKey[$this->pendingNewGroupKey]);
                }
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
            'image_summary' => [
                'product_images_found' => array_values(array_unique($imageStats['product_images_found'])),
                'product_images_missing' => array_values(array_unique($imageStats['product_images_missing'])),
                'variant_images_found' => array_values(array_unique($imageStats['variant_images_found'])),
                'variant_images_missing' => array_values(array_unique($imageStats['variant_images_missing'])),
            ],
        ];
    }

    /**
     * @param array<string, string> $row
     * @param array<string, int> $productIdByGroupKey
     * @return array{0: int, 1: int} [productId, variantId]
     */
    private function processRow(array $row, bool $autoCreateMasters, bool $updateExisting, ?int $userId, string $fileHash, ?string $imagesDir, bool $persistImages, array &$imageStats, array &$productIdByGroupKey): array
    {
        $productName = trim($row['Product Name'] ?? '');
        $sku = trim($row['Variant SKU'] ?? '');
        $mrp = trim($row['MRP'] ?? '');
        $sellingPrice = trim($row['Selling Price'] ?? '');

        if ($productName === '') {
            throw new RuntimeException('Product Name is required');
        }
        if ($mrp === '' || !is_numeric($mrp)) {
            throw new RuntimeException('MRP is required and must be numeric');
        }
        // Selling Price is optional (see class docblock) — but a cell that
        // DOES hold something must still be a real number, otherwise it
        // would silently cast to 0/NaN-ish garbage below instead of being
        // reported as the bad input it is.
        if ($sellingPrice !== '' && !is_numeric($sellingPrice)) {
            throw new RuntimeException('Selling Price must be numeric');
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
            $this->pendingNewGroupKey = $groupKey;

            $this->maybeImportProductImages(trim($row['Product Image Path'] ?? ''), $productId, $imagesDir, $persistImages, $imageStats);
        }

        // Variant SKU is optional (see class docblock) — a blank cell gets
        // a system-assigned SKU using the SAME scheme VariantService's own
        // "generate combinations" admin feature already uses (product
        // code/name slug + short attribute tokens, de-duplicated), rather
        // than inventing an unrelated numbering scheme of our own.
        if ($sku === '') {
            $sku = $this->generateVariantSku($productCode, $productName, trim($row['Size'] ?? ''), trim($row['Color'] ?? ''));
        }

        // null (not 0) means "not entered" — createVariant()/updateVariant()
        // decide what that means for the retail_price column themselves:
        // a brand new variant needs SOME value (the column is NOT NULL), so
        // it falls back to the MRP (no discount); an UPDATE of an existing
        // variant leaves its current price untouched instead, matching how
        // every other optional column here (barcode, cost price, status,
        // description) already treats a blank cell as "no change".
        $sellingPriceValue = $sellingPrice !== '' ? (float) $sellingPrice : null;

        $existingVariantId = $this->findVariantBySku($sku);

        if ($existingVariantId !== null) {
            if (!$updateExisting) {
                throw new RuntimeException('SKU already exists');
            }
            $this->assertBarcodeFree($barcode, $existingVariantId);
            $variantId = $this->updateVariant($existingVariantId, $row, $barcode, (float) $mrp, $sellingPriceValue, $userId, $fileHash, $imagesDir, $persistImages, $imageStats);
        } else {
            $this->assertBarcodeFree($barcode, null);
            $variantId = $this->createVariant($row, $productId, $sku, $barcode, (float) $mrp, $sellingPriceValue, $autoCreateMasters, $imagesDir, $persistImages, $imageStats);

            $stockRaw = trim($row['Opening Stock'] ?? '');
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

    /**
     * product_code carries a plain (not partial/filtered) UNIQUE KEY at
     * the database level, so a *soft-deleted* product still occupies its
     * code — looking this up with "AND deleted_at IS NULL" would miss it
     * and then createProduct()'s INSERT would crash with a raw duplicate-
     * key SQL error instead of a clean row error. So the code lookup
     * ignores deleted_at entirely and reactivates (clears deleted_at) a
     * soft-deleted match — re-importing the same file after deleting its
     * product must recreate/reuse it, not hard-fail forever. The Name
     * fallback stays restricted to active rows: name isn't a unique
     * constraint, so blindly resurrecting an unrelated deleted product by
     * name match would be more surprising than helpful.
     */
    private function findExistingProduct(?string $productCode, string $productName): ?int
    {
        if ($productCode !== null) {
            $stmt = $this->pdo->prepare('SELECT id, deleted_at FROM products WHERE product_code = :code');
            $stmt->execute(['code' => $productCode]);
            $row = $stmt->fetch();
            if ($row !== false) {
                if ($row['deleted_at'] !== null) {
                    $this->pdo->prepare('UPDATE products SET deleted_at = NULL WHERE id = :id')->execute(['id' => $row['id']]);
                }
                return (int) $row['id'];
            }
        }

        $stmt = $this->pdo->prepare('SELECT id FROM products WHERE LOWER(name) = LOWER(:name) AND deleted_at IS NULL');
        $stmt->execute(['name' => $productName]);
        $id = $stmt->fetchColumn();

        return $id === false ? null : (int) $id;
    }

    /**
     * sku also carries a plain UNIQUE KEY, so — same reasoning as
     * findExistingProduct() above — a soft-deleted variant must still be
     * found here. Whether it's then actually reused is gated by
     * $updateExisting in processRow() exactly like an active match: a
     * caller not asking for update mode still gets a clean "SKU already
     * exists" rejection rather than resurrecting deleted data by
     * surprise; updateVariant() clears deleted_at when it is reused.
     */
    private function findVariantBySku(string $sku): ?int
    {
        $stmt = $this->pdo->prepare('SELECT id FROM product_variants WHERE sku = :sku');
        $stmt->execute(['sku' => $sku]);
        $id = $stmt->fetchColumn();

        return $id === false ? null : (int) $id;
    }

    /**
     * product_variants.sku is NOT NULL + UNIQUE, so a blank Variant SKU
     * cell can't be stored as-is. The admin panel already has exactly one
     * place that auto-builds a SKU when the user doesn't type one —
     * VariantService::generateCombinations()'s "Product Code (or a slug of
     * the product name) + short attribute tokens, de-duplicated with a
     * numeric suffix" scheme — so this reuses that same scheme rather than
     * inventing a different one. Checked against both already-committed
     * variants and any earlier row in this same import batch (findVariantBySku()
     * sees this transaction's own uncommitted inserts), so two blank-SKU
     * rows in one file never collide with each other either.
     */
    private function generateVariantSku(?string $productCode, string $productName, string $size, string $color): string
    {
        $base = $productCode !== null && $productCode !== ''
            ? mb_strtoupper($productCode)
            : $this->skuToken($productName, 6);

        foreach ([$size, $color] as $attributeValue) {
            if ($attributeValue !== '') {
                $base .= '-' . $this->skuToken($attributeValue, 3);
            }
        }

        $sku = $base;
        $suffix = 1;
        while ($this->findVariantBySku($sku) !== null) {
            $sku = "{$base}-{$suffix}";
            $suffix++;
        }

        return $sku;
    }

    private function skuToken(string $value, int $length): string
    {
        $clean = mb_strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $value) ?? '');

        return $clean !== '' ? mb_substr($clean, 0, $length) : 'PROD';
    }

    /**
     * barcode is likewise a plain UNIQUE KEY — checked regardless of
     * deleted_at for the same reason, but (unlike sku/product_code)
     * never auto-reactivates anything: a barcode collision found on a
     * *different* variant than the one being processed is a genuine
     * conflict to ask the admin about, not an identity to resurrect.
     *
     * @param int|null $excludeVariantId variant allowed to already own this barcode (update mode)
     */
    private function assertBarcodeFree(?string $barcode, ?int $excludeVariantId): void
    {
        if ($barcode === null) {
            return;
        }

        $sql = 'SELECT 1 FROM product_variants WHERE barcode = :barcode';
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
        [$returnable, $returnWindowDays] = $this->resolveReturnPolicy($row);

        $this->pdo->prepare(
            'INSERT INTO products (
                name, slug, product_code, brand_id, unit_id, hsn_code_id, gst_rate_id,
                description, short_description, material, manufacturer, manufacturing_date, expiry_date,
                returnable, return_window_days
            ) VALUES (
                :name, :slug, :product_code, :brand_id, :unit_id, :hsn_code_id, :gst_rate_id,
                :description, :short_description, :material, :manufacturer, :manufacturing_date, :expiry_date,
                :returnable, :return_window_days
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
            'returnable' => $returnable,
            'return_window_days' => $returnWindowDays,
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

    /**
     * "Return Eligible" / "Return Window (Days)" are product-level, read
     * only on the first row of a product (same convention as "Product
     * Image Path" — see class docblock). Both are new, optional columns —
     * a blank cell (the overwhelmingly common case for every pre-existing
     * template/export, since this import had no such columns before)
     * must import cleanly with no error, so unlike
     * ProductService::assertValidReturnWindow() (used by the manual admin
     * form, which has an explicit "Returnable" checkbox right next to the
     * window field) this does NOT require a window just because
     * "Return Eligible" defaults to Yes. A blank window on a returnable
     * product simply leaves the product not yet actually offering returns
     * — ReturnService::eligibilityForOrder() already requires a positive
     * window before a return is ever offered to a customer — rather than
     * breaking the import. A value that IS present must still be sane.
     *
     * @param array<string, string> $row
     * @return array{0: int, 1: int|null}
     */
    private function resolveReturnPolicy(array $row): array
    {
        $eligibleRaw = mb_strtoupper(trim($row['Return Eligible'] ?? ''));
        $returnable = match ($eligibleRaw) {
            'NO', 'N', 'FALSE', '0' => false,
            default => true, // blank, 'YES', or anything else — matches the column's own schema default
        };

        $windowRaw = trim($row['Return Window (Days)'] ?? '');

        if ($windowRaw !== '' && (!is_numeric($windowRaw) || (int) $windowRaw < 0 || str_contains($windowRaw, '.'))) {
            throw new RuntimeException('Return Window (Days) must be a non-negative whole number');
        }

        return [(int) $returnable, $windowRaw !== '' ? (int) $windowRaw : null];
    }

    /** @param array<string, string> $row */
    private function createVariant(
        array $row,
        int $productId,
        string $sku,
        ?string $barcode,
        float $mrp,
        ?float $sellingPrice,
        bool $autoCreate,
        ?string $imagesDir,
        bool $persistImages,
        array &$imageStats,
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
            // retail_price is NOT NULL in the schema — a brand new variant
            // with no Selling Price entered gets the MRP (i.e. no discount),
            // never a silent 0.
            'retail_price' => $sellingPrice ?? $mrp,
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

        $this->maybeImportVariantImages(trim($row['Variant Image Path'] ?? ''), $variantId, $imagesDir, $persistImages, $imageStats);

        return $variantId;
    }

    /**
     * Update path for a row whose SKU already matches an existing
     * variant (only reached when $updateExisting was requested). Price,
     * barcode, description and status are replaced outright; stock is
     * reconciled as a difference against the current on-hand quantity so
     * a blank "Opening Stock" cell never resets existing stock to zero,
     * and re-submitting the identical file never double-applies the
     * difference (idempotency key is derived from the file's own
     * content hash, not just the variant id).
     *
     * @param array<string, string> $row
     */
    private function updateVariant(int $variantId, array $row, ?string $barcode, float $mrp, ?float $sellingPrice, ?int $userId, string $fileHash, ?string $imagesDir, bool $persistImages, array &$imageStats): int
    {
        $costPrice = trim($row['Variant Cost Price'] ?? '');
        $statusRaw = trim($row['Status'] ?? '');

        if ($statusRaw !== '' && !in_array(mb_strtoupper($statusRaw), ['ACTIVE', 'INACTIVE'], true)) {
            throw new RuntimeException("Invalid Status '{$statusRaw}' — must be ACTIVE or INACTIVE");
        }

        $productStmt = $this->pdo->prepare('SELECT product_id FROM product_variants WHERE id = :id');
        $productStmt->execute(['id' => $variantId]);
        $productId = (int) $productStmt->fetchColumn();

        // deleted_at = NULL unconditionally: a harmless no-op for an
        // already-active variant, and the reactivation for one that
        // findVariantBySku() matched while soft-deleted (see its
        // docblock) — otherwise a resurrected row would still be
        // invisible everywhere a listing filters on deleted_at.
        $sets = ['mrp = :mrp', 'deleted_at = NULL'];
        $params = ['mrp' => $mrp, 'id' => $variantId];

        // A blank Selling Price cell on an update row means "leave it
        // alone" — exactly like a blank barcode/cost price/description/
        // status below — never a silent reset of an existing price to MRP.
        if ($sellingPrice !== null) {
            $sets[] = 'retail_price = :retail_price';
            $params['retail_price'] = $sellingPrice;
        }

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

        $stockRaw = trim($row['Opening Stock'] ?? '');
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

        $this->maybeImportVariantImages(trim($row['Variant Image Path'] ?? ''), $variantId, $imagesDir, $persistImages, $imageStats);

        return $variantId;
    }

    /**
     * Imports a comma-separated list of images for a product, but only
     * the first time — a product that already has at least one image is
     * left untouched (before any download/zip-lookup even happens) so
     * re-running the same (or an updating) import never re-downloads,
     * re-converts, or orphans files nothing will reference. Each token is
     * either an http(s) URL (downloaded via SafeImageFetcher) or a plain
     * filename resolved against $imagesDir (the extracted "images.zip"
     * uploaded alongside the Excel file) — see downloadAndStore().
     *
     * @param array{product_images_found: list<string>, product_images_missing: list<string>, variant_images_found: list<string>, variant_images_missing: list<string>} $imageStats
     */
    private function maybeImportProductImages(string $csv, int $productId, ?string $imagesDir, bool $persist, array &$imageStats): void
    {
        if ($csv === '') {
            return;
        }

        if (!$this->looksLikeUrlList($csv) && $imagesDir === null) {
            throw new RuntimeException('Product image filenames are present in Excel, but no Product Images ZIP was uploaded.');
        }

        // Checked unconditionally (preview AND commit) and returns BEFORE
        // any network/disk work: a product that already has images is a
        // DB fact unaffected by $persist, and neither preview nor commit
        // would ever touch these images — skipping the loop entirely here
        // (not just the DB insert at the bottom of it) is what prevents a
        // repeat import from wastefully re-downloading/re-converting and
        // orphaning files nothing will ever reference.
        $countStmt = $this->pdo->prepare('SELECT COUNT(*) FROM product_images WHERE product_id = :id');
        $countStmt->execute(['id' => $productId]);
        if ((int) $countStmt->fetchColumn() > 0) {
            return;
        }

        foreach ($this->splitImageList($csv) as $i => $token) {
            $stored = $this->downloadAndStore($token, $imagesDir, $persist, $imageStats, 'product_images');

            if (!$persist || $stored === null) {
                continue; // preview — validated only, nothing to insert
            }

            $this->pdo->prepare(
                'INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary, import_batch_id, source_filename) VALUES (:p, :path, :thumb, :sort, :primary, :batch, :src)'
            )->execute([
                'p' => $productId,
                'path' => $stored['path'],
                'thumb' => $stored['thumb_path'],
                'sort' => $i,
                'primary' => $i === 0 ? 1 : 0,
                'batch' => $this->batchId,
                'src' => mb_substr($token, 0, 255),
            ]);
            // downloadAndStore() itself tracks pendingUploadedFiles — only
            // for a fresh store, never for a cache hit (see its docblock),
            // so a row reusing an earlier row's shared image can't have
            // that shared file deleted out from under it if THIS row fails.
        }
    }

    /** @param array{product_images_found: list<string>, product_images_missing: list<string>, variant_images_found: list<string>, variant_images_missing: list<string>} $imageStats */
    private function maybeImportVariantImages(string $csv, int $variantId, ?string $imagesDir, bool $persist, array &$imageStats): void
    {
        if ($csv === '') {
            return;
        }

        if (!$this->looksLikeUrlList($csv) && $imagesDir === null) {
            throw new RuntimeException('Variant image filenames are present in Excel, but no Product Images ZIP was uploaded.');
        }

        // See the matching comment in maybeImportProductImages() — same
        // reasoning, applied to variant_images.
        $countStmt = $this->pdo->prepare('SELECT COUNT(*) FROM variant_images WHERE variant_id = :id');
        $countStmt->execute(['id' => $variantId]);
        if ((int) $countStmt->fetchColumn() > 0) {
            return;
        }

        foreach ($this->splitImageList($csv) as $i => $token) {
            $stored = $this->downloadAndStore($token, $imagesDir, $persist, $imageStats, 'variant_images');

            if (!$persist || $stored === null) {
                continue;
            }

            $this->pdo->prepare(
                'INSERT INTO variant_images (variant_id, image_path, thumb_path, sort_order, is_primary, import_batch_id, source_filename) VALUES (:v, :path, :thumb, :sort, :primary, :batch, :src)'
            )->execute([
                'v' => $variantId,
                'path' => $stored['path'],
                'thumb' => $stored['thumb_path'],
                'sort' => $i,
                'primary' => $i === 0 ? 1 : 0,
                'batch' => $this->batchId,
                'src' => mb_substr($token, 0, 255),
            ]);
            // See the matching comment in maybeImportProductImages().
        }
    }

    /** @return list<string> */
    private function splitImageList(string $csv): array
    {
        return array_values(array_filter(array_map('trim', explode(',', $csv))));
    }

    /** True only when EVERY token in the cell is an http(s) URL — a mixed cell is treated as filename-style for the "no ZIP uploaded" check. */
    private function looksLikeUrlList(string $csv): bool
    {
        foreach ($this->splitImageList($csv) as $token) {
            if (!preg_match('#^https?://#i', $token)) {
                return false;
            }
        }

        return true;
    }

    /**
     * $token is either an http(s) URL — downloaded through the
     * SSRF-guarded SafeImageFetcher — or a plain filename resolved
     * case-insensitively against $imagesDir (the extracted contents of
     * an "images.zip" uploaded alongside the Excel file; see
     * SafeZipExtractor) while preserving that file's actual on-disk
     * name/extension. Either way, when $persist is true the resulting
     * local file is run through the same ImageUploadService the manual
     * upload endpoints use, so an imported image gets the identical WebP
     * conversion — never a raw URL string, never an arbitrary server
     * path (only basename() is ever used against $imagesDir, so a cell
     * cannot reach outside it).
     *
     * When $persist is false (preview — a dry run must never write a
     * real file, see run()), the token is still fully validated
     * (downloaded / located + MIME-sniffed) but nothing is written to
     * permanent storage and null is returned. Either way, the token is
     * recorded into $imageStats as found or missing.
     *
     * @param array{product_images_found: list<string>, product_images_missing: list<string>, variant_images_found: list<string>, variant_images_missing: list<string>} $imageStats
     * @return array{path: string, thumb_path: string}|null
     */
    private function downloadAndStore(string $token, ?string $imagesDir, bool $persist, array &$imageStats, string $statsPrefix): ?array
    {
        $isUrl = (bool) preg_match('#^https?://#i', $token);
        $foundKey = $statsPrefix . '_found';
        $missingKey = $statsPrefix . '_missing';

        // Same token already stored earlier in this same file (e.g. one
        // photo reused across two variants) — reuse that result instead
        // of fetching/converting/uploading it a second time. Only a real,
        // already-committed store is ever reused — a pending one from a
        // row that's still mid-processing is never observed here, since
        // PHP runs this single-threaded and a row either finishes (cache
        // entry stays) or throws (see run(), which un-caches it) before
        // any other row's downloadAndStore() call can run.
        $cacheKey = ($isUrl ? 'url:' : 'file:') . mb_strtolower($token) . '|' . ($imagesDir ?? '');
        if ($persist && isset($this->imageCache[$cacheKey])) {
            $imageStats[$foundKey][] = $token;

            return $this->imageCache[$cacheKey];
        }

        if ($isUrl) {
            $fetched = $this->imageFetcher->fetch($token);
            if ($fetched === null) {
                $imageStats[$missingKey][] = $token;
                throw new RuntimeException("Could not resolve image (blocked, unreachable, too large, or not a JPG/PNG/WEBP): {$token}");
            }
            $imageStats[$foundKey][] = $token;
            $tmpPath = $fetched['tmp_path'];
            $size = $fetched['size'];
            $originalName = basename((string) (parse_url($token, PHP_URL_PATH) ?: 'image'));
        } else {
            // $imagesDir === null was already turned into the clearer
            // "no Product Images ZIP was uploaded" row error one level up
            // (maybeImportProductImages/maybeImportVariantImages), so
            // reaching here with $imagesDir === null cannot happen.
            $candidate = $this->resolveZipFilename((string) $imagesDir, $token);

            if ($candidate === null) {
                $imageStats[$missingKey][] = $token;
                throw new RuntimeException("Image file '{$token}' was not found inside the uploaded images ZIP");
            }

            $imageStats[$foundKey][] = $token;
            $tmpPath = $candidate;
            $size = (int) filesize($candidate);
            $originalName = basename($candidate); // the real on-disk name/extension, not necessarily the Excel cell's own casing
        }

        if (!$persist) {
            if ($isUrl) {
                @unlink($tmpPath);
            }
            return null;
        }

        try {
            $file = [
                'tmp_name' => $tmpPath,
                'size' => $size,
                'error' => UPLOAD_ERR_OK,
                'name' => $originalName,
            ];

            $stored = $this->uploader->store($file, 'products');
            $this->imageCache[$cacheKey] = $stored;
            $this->pendingCacheKeys[] = $cacheKey;
            $this->pendingUploadedFiles[] = $stored['path'];
            $this->pendingUploadedFiles[] = $stored['thumb_path'];

            return $stored;
        } finally {
            if ($isUrl) {
                @unlink($tmpPath); // only the downloaded temp copy — a zip-extracted file is cleaned up once for the whole request by the controller
            }
        }
    }

    /**
     * Resolves $token against the flat images directory extracted from
     * the uploaded ZIP (see SafeZipExtractor — entries are always
     * flattened to their own basename there). Tries an exact match
     * first, then falls back to a case-insensitive scan so "Front.JPG"
     * in Excel matches a zip entry saved as "front.jpg" — the real
     * on-disk filename (and its real extension/case) is what's
     * returned, never the Excel cell's own spelling.
     */
    private function resolveZipFilename(string $imagesDir, string $token): ?string
    {
        // Excel cell may hold a full Windows path (C:\Photos\shirt.jpg) or a
        // folder path (shirts/front.jpg) - only the file name is matched.
        $wanted = basename(str_replace('\\', '/', $token)); // defensively re-applied even though $token is an Excel cell, not a zip entry
        $exact = $imagesDir . '/' . $wanted;

        if (is_file($exact)) {
            return $exact;
        }

        $entries = @scandir($imagesDir);
        if ($entries === false) {
            return null;
        }

        foreach ($entries as $entry) {
            if ($entry !== '.' && $entry !== '..' && strcasecmp($entry, $wanted) === 0) {
                return $imagesDir . '/' . $entry;
            }
        }

        return null;
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
