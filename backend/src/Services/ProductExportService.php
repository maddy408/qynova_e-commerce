<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Spreadsheet;
use PDO;

/**
 * Product + variant Excel export (ECOMMERCE_POS_ADMIN_SPEC.md section
 * 12). One row per variant, using the same column schema as
 * ProductImportService::HEADERS — an exported file can be re-imported.
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
                b.name AS brand_name, u.name AS unit_name, h.code AS hsn_code,
                g.gst_percent, g.tax_mode,
                v.sku, v.barcode, v.variant_description, v.mrp, v.retail_price, v.purchase_price, v.status,
                i.on_hand,
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
                (SELECT image_path FROM variant_images vi WHERE vi.variant_id = v.id ORDER BY is_primary DESC LIMIT 1) AS image_url
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
                'Variant SKU' => $r['sku'],
                'Variant Barcode' => $r['barcode'],
                'Variant Description' => $r['variant_description'],
                'Size' => $r['size_value'],
                'Color' => $r['color_value'],
                'MRP' => $r['mrp'],
                'Selling Price' => $r['retail_price'],
                'Variant Cost Price' => $r['purchase_price'],
                'Variant Stock' => $r['on_hand'],
                'Image URL' => $r['image_url'],
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
            'Variant SKU' => 'TSH-L-BLU',
            'Variant Barcode' => '8901234567',
            'Variant Description' => 'Blue, size L',
            'Size' => 'L',
            'Color' => 'Blue',
            'MRP' => '849',
            'Selling Price' => '799',
            'Variant Cost Price' => '500',
            'Variant Stock' => '20',
            'Image URL' => 'https://example.test/images/tsh-l-blue.jpg',
            'Status' => 'ACTIVE',
        ];

        $path = sys_get_temp_dir() . '/product-import-template-' . bin2hex(random_bytes(6)) . '.xlsx';
        Spreadsheet::writeRows($path, ProductImportService::HEADERS, [$exampleRow]);

        return $path;
    }
}
