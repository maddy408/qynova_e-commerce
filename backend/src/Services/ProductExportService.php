<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Spreadsheet;
use PDO;

/**
 * Product + variant Excel export (ECOMMERCE_POS_ADMIN_SPEC.md section
 * 12). One row per variant, using the same column schema as
 * ProductImportService::HEADERS — an exported file can be re-imported
 * (pass update_existing=1 on the import call to update rather than
 * reject the already-existing SKUs).
 */
final class ProductExportService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @param array<string, mixed> $filters */
    public function export(array $filters): string
    {
        $where = ['p.deleted_at IS NULL'];
        $params = [];

        if (!empty($filters['ids'])) {
            $ids = array_map('intval', (array) $filters['ids']);
            $placeholders = implode(',', array_fill(0, count($ids), '?'));
            $where[] = "p.id IN ({$placeholders})";
            $params = array_merge($params, $ids);
        }

        if (!empty($filters['category_id'])) {
            $where[] = 'EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = ?)';
            $params[] = (int) $filters['category_id'];
        }

        if (!empty($filters['brand_id'])) {
            $where[] = 'p.brand_id = ?';
            $params[] = (int) $filters['brand_id'];
        }

        if (array_key_exists('is_active', $filters) && $filters['is_active'] !== null) {
            $where[] = 'p.is_active = ?';
            $params[] = (int) (bool) $filters['is_active'];
        }

        $whereSql = implode(' AND ', $where);

        $stmt = $this->pdo->prepare(
            "SELECT
                p.name AS product_name, p.product_code, p.description, p.short_description,
                p.material, p.manufacturer, p.manufacturing_date, p.expiry_date,
                p.returnable, p.return_window_days,
                b.name AS brand_name, u.name AS unit_name, h.code AS hsn_code,
                g.gst_percent, g.tax_mode,
                v.sku, v.barcode, v.variant_description, v.mrp, v.retail_price, v.purchase_price, v.status,
                i.on_hand, i.low_stock_threshold,
                (SELECT GROUP_CONCAT(c.name SEPARATOR '|')
                 FROM product_categories pc JOIN categories c ON c.id = pc.category_id
                 WHERE pc.product_id = p.id ORDER BY pc.is_primary DESC) AS categories,
                (SELECT GROUP_CONCAT(s.name SEPARATOR '|')
                 FROM product_subcategories ps JOIN subcategories s ON s.id = ps.subcategory_id
                 WHERE ps.product_id = p.id) AS subcategories,
                (SELECT vav.value FROM product_variant_values pvv
                 JOIN variant_attribute_values vav ON vav.id = pvv.attribute_value_id
                 JOIN variant_attributes va ON va.id = vav.attribute_id
                 WHERE pvv.variant_id = v.id AND va.name = 'Size' LIMIT 1) AS size_value,
                (SELECT vav.value FROM product_variant_values pvv
                 JOIN variant_attribute_values vav ON vav.id = pvv.attribute_value_id
                 JOIN variant_attributes va ON va.id = vav.attribute_id
                 WHERE pvv.variant_id = v.id AND va.name = 'Color' LIMIT 1) AS color_value,
                (SELECT GROUP_CONCAT(pi.image_path ORDER BY pi.is_primary DESC, pi.sort_order SEPARATOR ', ')
                 FROM product_images pi WHERE pi.product_id = p.id) AS product_images,
                (SELECT GROUP_CONCAT(vi.image_path ORDER BY vi.is_primary DESC, vi.sort_order SEPARATOR ', ')
                 FROM variant_images vi WHERE vi.variant_id = v.id) AS variant_images
             FROM products p
             JOIN product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL
             LEFT JOIN brands b ON b.id = p.brand_id
             LEFT JOIN units u ON u.id = p.unit_id
             LEFT JOIN hsn_codes h ON h.id = p.hsn_code_id
             LEFT JOIN gst_rates g ON g.id = p.gst_rate_id
             LEFT JOIN inventory i ON i.variant_id = v.id
             WHERE {$whereSql}
             ORDER BY p.id, v.id"
        );
        $stmt->execute($params);

        $rows = [];
        foreach ($stmt->fetchAll() as $r) {
            $rows[] = [
                'Product Name' => $r['product_name'],
                'Product Code' => $r['product_code'],
                'Category' => $r['categories'],
                'Subcategory' => $r['subcategories'],
                'Brand' => $r['brand_name'],
                'Description' => $r['description'],
                'Short Description' => $r['short_description'],
                'Material' => $r['material'],
                'Unit' => $r['unit_name'],
                'HSN Code' => $r['hsn_code'],
                'Tax' => $r['gst_percent'],
                'Tax Type' => $r['tax_mode'],
                'Manufacturer' => $r['manufacturer'],
                'Manufacturing Date' => $r['manufacturing_date'],
                'Expiry Date' => $r['expiry_date'],
                'Return Eligible' => ((int) $r['returnable']) === 1 ? 'Yes' : 'No',
                'Return Window (Days)' => $r['return_window_days'],
                'Product Image Path' => $r['product_images'],
                'Variant SKU' => $r['sku'],
                'Variant Barcode' => $r['barcode'],
                'Variant Description' => $r['variant_description'],
                'Size' => $r['size_value'],
                'Color' => $r['color_value'],
                'MRP' => $r['mrp'],
                'Selling Price' => $r['retail_price'],
                'Variant Cost Price' => $r['purchase_price'],
                'Opening Stock' => $r['on_hand'],
                'Low Stock Threshold' => $r['low_stock_threshold'],
                'Variant Image Path' => $r['variant_images'],
                'Status' => $r['status'],
            ];
        }

        $path = sys_get_temp_dir() . '/product-export-' . bin2hex(random_bytes(6)) . '.xlsx';
        Spreadsheet::writeRows($path, ProductImportService::HEADERS, $rows);

        return $path;
    }

    /** Stock Report export option (section 12): current stock per variant. */
    public function exportStockReport(): string
    {
        $rows = $this->pdo->query(
            "SELECT p.name AS product_name, v.sku, v.barcode, i.on_hand, i.reserved, i.available, i.low_stock_threshold
             FROM inventory i
             JOIN product_variants v ON v.id = i.variant_id
             JOIN products p ON p.id = i.product_id
             WHERE p.deleted_at IS NULL
             ORDER BY p.name, v.sku"
        )->fetchAll();

        $headers = ['Product Name', 'SKU', 'Barcode', 'On Hand', 'Reserved', 'Available', 'Low Stock Threshold'];
        $mapped = array_map(fn ($r) => [
            'Product Name' => $r['product_name'],
            'SKU' => $r['sku'],
            'Barcode' => $r['barcode'],
            'On Hand' => $r['on_hand'],
            'Reserved' => $r['reserved'],
            'Available' => $r['available'],
            'Low Stock Threshold' => $r['low_stock_threshold'],
        ], $rows);

        $path = sys_get_temp_dir() . '/stock-report-' . bin2hex(random_bytes(6)) . '.xlsx';
        Spreadsheet::writeRows($path, $headers, $mapped);

        return $path;
    }

    public function sampleTemplate(): string
    {
        $exampleRow = [
            'Product Name' => 'Classic T-Shirt',
            'Product Code' => 'TSH',
            'Category' => 'Toys|Gift Items',
            'Subcategory' => 'Kids',
            'Brand' => 'Acme',
            'Description' => 'Premium cotton casual T-shirt',
            'Short Description' => 'Casual T-shirt',
            'Material' => 'Cotton',
            'Unit' => 'Pieces',
            'HSN Code' => '6109',
            'Tax' => '5',
            'Tax Type' => 'EXCLUSIVE',
            'Manufacturer' => 'Acme Textiles',
            'Manufacturing Date' => '2026-01-01',
            'Expiry Date' => '',
            'Return Eligible' => 'Yes',
            'Return Window (Days)' => '7',
            'Product Image Path' => 'tshirt-front.jpg, tshirt-back.jpg',
            'Variant SKU' => 'TSH-L-BLU',
            'Variant Barcode' => '8901234567',
            'Variant Description' => 'Blue, size L',
            'Size' => 'L',
            'Color' => 'Blue',
            'MRP' => '849',
            'Selling Price' => '799',
            'Variant Cost Price' => '500',
            'Opening Stock' => '20',
            'Low Stock Threshold' => '5',
            'Variant Image Path' => 'tshirt-l-blue-1.jpg, tshirt-l-blue-2.jpg',
            'Status' => 'ACTIVE',
        ];
        $secondRow = array_merge($exampleRow, [
            'Variant SKU' => 'TSH-XL-ORG',
            'Variant Barcode' => '8901234568',
            'Variant Description' => 'Orange, size XL',
            'Size' => 'XL',
            'Color' => 'Orange',
            'MRP' => '849',
            'Selling Price' => '799',
            'Opening Stock' => '15',
            'Product Image Path' => '', // only the product's FIRST row needs the Product Image Path cell filled in
            'Variant Image Path' => 'tshirt-xl-orange-1.jpg',
        ]);

        $instructions = [
            'HOW TO USE THIS TEMPLATE',
            '',
            'One row = one variant. Two or more rows with the same Product Code (or the same Product Name if Product Code is blank) become variants of ONE product — see the two example rows on the Products sheet.',
            '',
            'MANDATORY COLUMNS: Product Name, MRP. Category is mandatory the first time a product is created.',
            '',
            'Variant SKU: optional. Leave blank and the importer assigns one automatically (Product Code or a short code from the Product Name, plus Size/Color if given). To UPDATE an existing variant you must enter its real SKU — a blank SKU always creates a new variant.',
            '',
            'Selling Price: optional. Leave blank on a new variant and it defaults to the MRP (no discount). Leave blank on a row updating an existing variant (Update existing products/variants ticked) and that variant\'s current Selling Price is left untouched.',
            '',
            'Return Eligible / Return Window (Days): optional, product-level (only read from the FIRST row of a product, same as Product Image Path). Return Eligible is Yes or No (blank defaults to Yes). Return Window (Days) is how many days after DELIVERY a customer may request a return — it only takes effect once both are set (Return Eligible = Yes and a positive Return Window), so leaving either blank keeps the product not yet offering returns rather than guessing a window for you.',
            '',
            'Category / Subcategory: separate multiple values with a pipe character, e.g.  Toys|Gift Items . Unknown names are rejected unless you tick "Auto-create missing categories/brands/etc." when importing.',
            '',
            'Tax: enter the GST percentage only, e.g. 5 or 18. Tax Type is EXCLUSIVE (tax added on top of Selling Price, the normal case) or INCLUSIVE (tax already included in Selling Price).',
            '',
            'Product Image Path / Variant Image Path: THIS is the column where the image\'s file path/filename goes — one or more, separated by commas. The FIRST one becomes the main/primary image. Only fill in Product Image Path on the FIRST row of a product — repeating it on every variant row is harmless but unnecessary. Each entry must be plain JPG, PNG or WEBP, 5MB or smaller; anything else fails that row with a clear reason.',
            '',
            'TWO WAYS to fill in Product Image Path / Variant Image Path — pick whichever matches what you have:',
            '  (1) A FILENAME, e.g.  tshirt-front.jpg  — as in the example rows. When importing, also attach a "Product Images ZIP" containing the actual image files (an /images/ folder inside it, or the files directly at the root — both work). The importer matches by filename ONLY, ignoring any folders inside the ZIP, case-insensitively — if two files in the ZIP share the same name, the last one wins, so keep names unique. This is the option to use when your photos are just files on your own computer.',
            '  (2) A full http(s):// URL, e.g.  https://example.test/images/tshirt-front.jpg  — used as-is, downloaded directly, no ZIP needed.',
            '',
            'A row is rejected (with a clear reason, never silently skipped) if its image is a filename but no images ZIP was attached, or if that filename is not found inside the ZIP, or if a URL cannot be downloaded.',
            '',
            'Opening Stock: the quantity to set as this variant\'s stock. Leave blank to not touch stock at all (safe for re-exporting and re-importing without changing quantities).',
            '',
            'Low Stock Threshold: optional; the quantity below which this variant is flagged low-stock in the admin panel. Leave blank to keep the existing/default threshold.',
            '',
            'Status: ACTIVE or INACTIVE.',
            '',
            'RE-IMPORTING AN EXPORTED FILE: by default, a row whose Variant SKU already exists is rejected (so nothing is overwritten by accident). Tick "Update existing products/variants" when importing to instead update price, description, status and stock (stock is reconciled as a difference, never reset to zero by a blank cell) for SKUs that already exist.',
        ];

        $path = sys_get_temp_dir() . '/product-import-template-' . bin2hex(random_bytes(6)) . '.xlsx';
        Spreadsheet::writeRowsWithInstructions($path, ProductImportService::HEADERS, [$exampleRow, $secondRow], $instructions);

        return $path;
    }
}
