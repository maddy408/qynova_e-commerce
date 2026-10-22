<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Variant attributes/values are admin-managed masters; each variant picks
 * one value per attribute (ECOMMERCE_POS_ADMIN_SPEC.md section 6).
 * Duplicate attribute-combinations within one product are rejected here —
 * the schema can't express that constraint portably (see migration
 * 0006_variants.sql).
 */
final class VariantService
{
    public const DEFAULT_ATTRIBUTES = [
        'Color' => [
            ['name' => 'Red', 'hex' => '#FF0000'],
            ['name' => 'Dark Red', 'hex' => '#8B0000'],
            ['name' => 'Crimson', 'hex' => '#DC143C'],
            ['name' => 'Maroon', 'hex' => '#800000'],
            ['name' => 'Burgundy', 'hex' => '#800020'],
            ['name' => 'Coral', 'hex' => '#FF7F50'],
            ['name' => 'Pink', 'hex' => '#FFC0CB'],
            ['name' => 'Hot Pink', 'hex' => '#FF69B4'],
            ['name' => 'Rose', 'hex' => '#FF007F'],
            ['name' => 'Rose Gold', 'hex' => '#B76E79'],
            ['name' => 'Magenta', 'hex' => '#FF00FF'],
            ['name' => 'Fuchsia', 'hex' => '#FF00FF'],
            ['name' => 'Purple', 'hex' => '#800080'],
            ['name' => 'Violet', 'hex' => '#8A2BE2'],
            ['name' => 'Indigo', 'hex' => '#4B0082'],
            ['name' => 'Lavender', 'hex' => '#E6E6FA'],
            ['name' => 'Plum', 'hex' => '#DDA0DD'],
            ['name' => 'Navy', 'hex' => '#000080'],
            ['name' => 'Dark Blue', 'hex' => '#00008B'],
            ['name' => 'Royal Blue', 'hex' => '#4169E1'],
            ['name' => 'Blue', 'hex' => '#0000FF'],
            ['name' => 'Sky Blue', 'hex' => '#87CEEB'],
            ['name' => 'Cyan', 'hex' => '#00FFFF'],
            ['name' => 'Teal', 'hex' => '#008080'],
            ['name' => 'Turquoise', 'hex' => '#40E0D0'],
            ['name' => 'Mint', 'hex' => '#98FF98'],
            ['name' => 'Emerald', 'hex' => '#50C878'],
            ['name' => 'Dark Green', 'hex' => '#006400'],
            ['name' => 'Green', 'hex' => '#008000'],
            ['name' => 'Olive', 'hex' => '#808000'],
            ['name' => 'Lime', 'hex' => '#00FF00'],
            ['name' => 'Yellow', 'hex' => '#FFFF00'],
            ['name' => 'Gold', 'hex' => '#FFD700'],
            ['name' => 'Amber', 'hex' => '#FFBF00'],
            ['name' => 'Mustard', 'hex' => '#FFDB58'],
            ['name' => 'Orange', 'hex' => '#FFA500'],
            ['name' => 'Peach', 'hex' => '#FFDAB9'],
            ['name' => 'Beige', 'hex' => '#F5F5DC'],
            ['name' => 'Khaki', 'hex' => '#F0E68C'],
            ['name' => 'Tan', 'hex' => '#D2B48C'],
            ['name' => 'Brown', 'hex' => '#A52A2A'],
            ['name' => 'Dark Brown', 'hex' => '#654321'],
            ['name' => 'Chocolate', 'hex' => '#7B3F00'],
            ['name' => 'White', 'hex' => '#FFFFFF'],
            ['name' => 'Off-White', 'hex' => '#FAFAFA'],
            ['name' => 'Silver', 'hex' => '#C0C0C0'],
            ['name' => 'Grey', 'hex' => '#808080'],
            ['name' => 'Light Grey', 'hex' => '#D3D3D3'],
            ['name' => 'Charcoal', 'hex' => '#36454F'],
            ['name' => 'Black', 'hex' => '#000000'],
            ['name' => 'Multi-color', 'hex' => '#FF5722'],
            ['name' => 'Transparent', 'hex' => '#E0E0E0'],
        ],
        'Size' => ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Free Size', 'Standard'],
        'Weight' => ['50g', '100g', '250g', '500g', '1kg', '2kg', '5kg', '10kg', '25kg'],
        'Volume' => ['50ml', '100ml', '200ml', '250ml', '500ml', '750ml', '1L', '2L', '5L'],
        'Pack Size' => ['Pack of 1', 'Pack of 2', 'Pack of 3', 'Pack of 4', 'Pack of 6', 'Pack of 10', 'Pack of 12', 'Pack of 24'],
        'Quantity / Count' => ['1 pc', '6 pcs', '12 pcs', '24 pcs', '50 pcs', '100 pcs', '500 pcs'],
        'Flavor' => ['Vanilla', 'Chocolate', 'Strawberry', 'Mango', 'Butterscotch', 'Pineapple', 'Elaichi', 'Kesar', 'Cardamom', 'Mint', 'Chocolate Fudge', 'Pista', 'Blackcurrant'],
        'Taste' => ['Regular', 'Spicy', 'Extra Spicy', 'Salted', 'Masala', 'Sweet', 'Tangy', 'Peri Peri', 'Chilli Garlic'],
        'Type' => ['Full Cream', 'Toned', 'Double Toned', 'Skimmed', 'Whole', 'Cow Milk', 'Buffalo Milk'],
        'Form' => ['Powder', 'Liquid', 'Paste', 'Granules', 'Solid', 'Gel', 'Spray', 'Tablet', 'Capsule'],
        'Packaging Type' => ['Pouch', 'Bottle', 'Box', 'Jar', 'Can', 'Tin', 'Packet', 'Tetra Pack', 'Bucket', 'Tray'],
        'Grade' => ['Premium', 'Standard', 'Economy', 'Super Fine', 'Export Quality', 'Grade A', 'Grade B'],
        'Material / Ingredient Type' => ['Whole Wheat', 'Multigrain', 'Organic', 'Maida', 'Rice Flour', 'Rava', 'Besan', 'Oats'],
        'Scent / Fragrance' => ['Rose', 'Lemon', 'Lavender', 'Jasmine', 'Sandalwood', 'Neem', 'Herbal', 'Citrus', 'Lavender & Chamomile'],
        'Age Group' => ['Baby', 'Kids', 'Teen', 'Adult', 'Senior', 'All Ages'],
        'Diet Type' => ['Regular', 'Sugar Free', 'Gluten Free', 'Organic', 'Vegan', 'Keto', 'High Protein', 'Zero Fat'],
        'Strength' => ['Mild', 'Medium', 'Strong', 'Extra Strong'],
        'Combo / Bundle' => ['Single', 'Combo of 2', 'Combo of 3', 'Combo of 4', 'Family Pack', 'Mega Saver Pack', 'Starter Kit'],
    ];

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Auto-seed default rich variant attributes into the database if missing.
     * This guarantees that when backend code is pushed/pulled to any machine,
     * all standard variant types and options immediately work without requiring
     * developers or production admins to run manual seed scripts.
     */
    public function ensureDefaultAttributes(): void
    {
        try {
            $count = (int) $this->pdo->query("SELECT COUNT(*) FROM variant_attributes WHERE status = 'ACTIVE'")->fetchColumn();
            if ($count >= count(self::DEFAULT_ATTRIBUTES)) {
                return;
            }

            $findAttr = $this->pdo->prepare("SELECT id FROM variant_attributes WHERE name = :name");
            $insertAttr = $this->pdo->prepare("INSERT INTO variant_attributes (name, sort_order, status) VALUES (:name, :sort, 'ACTIVE')");
            $insertVal = $this->pdo->prepare("
                INSERT INTO variant_attribute_values (attribute_id, value, color_hex, sort_order, status)
                VALUES (:attr_id, :val, :hex, :sort, 'ACTIVE')
                ON DUPLICATE KEY UPDATE color_hex = VALUES(color_hex)
            ");

            $sort = 1;
            foreach (self::DEFAULT_ATTRIBUTES as $attrName => $values) {
                $findAttr->execute(['name' => $attrName]);
                $attrId = $findAttr->fetchColumn();

                if (!$attrId) {
                    $insertAttr->execute(['name' => $attrName, 'sort' => $sort++]);
                    $attrId = (int) $this->pdo->lastInsertId();
                } else {
                    $attrId = (int) $attrId;
                }

                $valSort = 1;
                foreach ($values as $val) {
                    if (is_array($val)) {
                        $valueStr = (string) $val['name'];
                        $hexStr = (string) $val['hex'];
                    } else {
                        $valueStr = (string) $val;
                        $hexStr = null;
                    }

                    $insertVal->execute([
                        'attr_id' => $attrId,
                        'val' => $valueStr,
                        'hex' => $hexStr,
                        'sort' => $valSort++,
                    ]);
                }
            }
        } catch (\Throwable $e) {
            error_log('VariantService::ensureDefaultAttributes error: ' . $e->getMessage());
        }
    }

    /** @return list<array<string, mixed>> */
    public function listAttributes(): array
    {
        // Automatically ensure default attributes exist in the DB
        $this->ensureDefaultAttributes();

        $attributes = $this->pdo->query(
            "SELECT * FROM variant_attributes WHERE status = 'ACTIVE' ORDER BY sort_order, name"
        )->fetchAll();

        foreach ($attributes as &$attribute) {
            $values = $this->pdo->prepare(
                "SELECT * FROM variant_attribute_values WHERE attribute_id = :id AND status = 'ACTIVE' ORDER BY sort_order, value"
            );
            $values->execute(['id' => $attribute['id']]);
            $attribute['values'] = $values->fetchAll();
        }
        unset($attribute);

        return $attributes;
    }

    public function createAttribute(string $name, string $inputType = 'select', ?string $unitOptions = null): int
    {
        if (!in_array($inputType, ['color', 'select', 'number_with_unit', 'text'], true)) {
            $inputType = 'select';
        }

        $this->pdo->prepare(
            'INSERT INTO variant_attributes (name, input_type, unit_options) VALUES (:name, :input_type, :unit_options)'
        )->execute(['name' => $name, 'input_type' => $inputType, 'unit_options' => $unitOptions]);

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * $value is the final display string stored against the variant
     * (e.g. "500 g" for a number_with_unit attribute) — the admin UI is
     * responsible for combining an entered amount + chosen unit before
     * calling this, since variant_attribute_values only ever stores one
     * plain string per option, same as every other attribute type.
     */
    public function createAttributeValue(int $attributeId, string $value, ?string $colorHex = null): int
    {
        $existing = $this->pdo->prepare(
            'SELECT id FROM variant_attribute_values WHERE attribute_id = :attribute_id AND value = :value'
        );
        $existing->execute(['attribute_id' => $attributeId, 'value' => $value]);
        $existingId = $existing->fetchColumn();

        if ($existingId !== false) {
            throw new RuntimeException("'{$value}' already exists for this attribute");
        }

        $this->pdo->prepare(
            'INSERT INTO variant_attribute_values (attribute_id, value, color_hex) VALUES (:attribute_id, :value, :color_hex)'
        )->execute(['attribute_id' => $attributeId, 'value' => $value, 'color_hex' => $colorHex]);

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * @param array<string, mixed> $data
     * @param list<int> $attributeValueIds
     */
    public function createVariant(int $productId, array $data, array $attributeValueIds): int
    {
        $sku = trim((string) ($data['sku'] ?? ''));

        if ($sku === '') {
            throw new RuntimeException('SKU is required');
        }

        $this->assertNoDuplicateCombination($productId, $attributeValueIds, null);

        $this->pdo->beginTransaction();

        try {
            $stmt = $this->pdo->prepare(
                'INSERT INTO product_variants (
                    product_id, sku, barcode, mrp, normal_price, retail_price, wholesale_price, customer_price, purchase_price,
                    min_selling_price, manufacturing_date, expiry_date,
                    weight_grams, hsn_code_id, gst_rate_id, variant_description, is_default, status
                ) VALUES (
                    :product_id, :sku, :barcode, :mrp, :normal_price, :retail_price, :wholesale_price, :customer_price, :purchase_price,
                    :min_selling_price, :manufacturing_date, :expiry_date,
                    :weight_grams, :hsn_code_id, :gst_rate_id, :variant_description, :is_default, :status
                )'
            );
            $stmt->execute([
                'product_id' => $productId,
                'sku' => $sku,
                'barcode' => $data['barcode'] ?? null,
                'mrp' => $data['mrp'] ?? 0,
                'normal_price' => $data['normal_price'] ?? $data['retail_price'] ?? 0,
                'retail_price' => $data['retail_price'] ?? 0,
                'wholesale_price' => $data['wholesale_price'] ?? null,
                'customer_price' => $data['customer_price'] ?? null,
                'purchase_price' => $data['purchase_price'] ?? null,
                'min_selling_price' => $data['min_selling_price'] ?? null,
                'manufacturing_date' => $data['manufacturing_date'] ?? null,
                'expiry_date' => $data['expiry_date'] ?? null,
                'weight_grams' => $data['weight_grams'] ?? null,
                'hsn_code_id' => $data['hsn_code_id'] ?? null,
                'gst_rate_id' => $data['gst_rate_id'] ?? null,
                'variant_description' => $data['variant_description'] ?? null,
                'is_default' => (int) (bool) ($data['is_default'] ?? false),
                'status' => $data['status'] ?? 'ACTIVE',
            ]);

            $variantId = (int) $this->pdo->lastInsertId();

            foreach ($attributeValueIds as $valueId) {
                $this->pdo->prepare(
                    'INSERT INTO product_variant_values (variant_id, attribute_value_id) VALUES (:variant_id, :value_id)'
                )->execute(['variant_id' => $variantId, 'value_id' => $valueId]);
            }

            $openingStock = (float) ($data['opening_stock'] ?? 0);
            $this->pdo->prepare(
                'INSERT INTO inventory (variant_id, product_id, on_hand, reserved) VALUES (:variant_id, :product_id, :on_hand, 0)'
            )->execute(['variant_id' => $variantId, 'product_id' => $productId, 'on_hand' => $openingStock]);

            if ($openingStock > 0) {
                (new BatchService($this->pdo))->createOpeningBatch(
                    variantId: $variantId,
                    qty: $openingStock,
                    cost: (float) ($data['purchase_price'] ?? 0),
                    selling: (float) ($data['retail_price'] ?? 0),
                    mrp: (float) ($data['mrp'] ?? 0),
                    mfgDate: $data['manufacturing_date'] ?? null,
                    expDate: $data['expiry_date'] ?? null,
                    batchNo: $data['batch_no'] ?? null
                );
            }

            $this->pdo->commit();

            return $variantId;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** @param array<string, mixed> $data */
    public function updateVariant(int $variantId, array $data): void
    {
        $fields = [
            'barcode', 'mrp', 'normal_price', 'retail_price', 'wholesale_price', 'customer_price', 'purchase_price',
            'min_selling_price', 'manufacturing_date', 'expiry_date',
            'weight_grams', 'hsn_code_id', 'gst_rate_id', 'variant_description', 'is_default', 'status',
        ];

        $sets = [];
        $params = ['id' => $variantId];

        foreach ($fields as $field) {
            if (array_key_exists($field, $data)) {
                $sets[] = "{$field} = :{$field}";
                $params[$field] = $field === 'is_default' ? (int) (bool) $data[$field] : $data[$field];
            }
        }

        if ($sets === []) {
            return;
        }

        $this->pdo->prepare('UPDATE product_variants SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
    }

    /**
     * Auto-generates every combination across the given attribute value
     * groups (one inner array per attribute, e.g. Color=[1,2],
     * Size=[5,6] -> 4 variants) instead of making the admin create each
     * one by hand. An auto-built SKU is assigned; price/stock default to
     * zero/blank for the admin to fill in after. A combination that
     * already exists on this product is skipped, not an error — so
     * re-running the generator after adding one more attribute value is
     * safe and only adds what's new.
     *
     * @param list<list<int>> $attributeValueGroups
     * @param array<string, mixed> $defaults
     * @return array{created: list<int>, skipped: list<string>}
     */
    public function generateCombinations(int $productId, array $attributeValueGroups, array $defaults): array
    {
        $attributeValueGroups = array_values(array_filter($attributeValueGroups, fn ($g) => $g !== []));

        if ($attributeValueGroups === []) {
            throw new RuntimeException('Select at least one value for at least one attribute');
        }

        $productStmt = $this->pdo->prepare('SELECT product_code, name FROM products WHERE id = :id AND deleted_at IS NULL');
        $productStmt->execute(['id' => $productId]);
        $product = $productStmt->fetch();

        if ($product === false) {
            throw new RuntimeException('Product not found');
        }

        $skuBase = $product['product_code'] !== null && $product['product_code'] !== ''
            ? mb_strtoupper((string) $product['product_code'])
            : $this->skuSlug((string) $product['name']);

        $created = [];
        $skipped = [];

        foreach ($this->cartesianProduct($attributeValueGroups) as $combination) {
            $labels = array_map(function (int $valueId): string {
                $stmt = $this->pdo->prepare('SELECT value FROM variant_attribute_values WHERE id = :id');
                $stmt->execute(['id' => $valueId]);
                $value = (string) ($stmt->fetchColumn() ?: '');

                return mb_strtoupper(mb_substr(preg_replace('/[^A-Za-z0-9]/', '', $value) ?? $value, 0, 3));
            }, $combination);

            try {
                $sku = $this->uniqueSku($skuBase . '-' . implode('-', $labels));
                $created[] = $this->createVariant($productId, array_merge($defaults, ['sku' => $sku]), $combination);
            } catch (RuntimeException $e) {
                $skipped[] = implode('/', $labels) . ': ' . $e->getMessage();
            }
        }

        return ['created' => $created, 'skipped' => $skipped];
    }

    /** Scan lookup order: barcode, SKU, then product name (docs section 12). */
    public function lookup(string $code): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT v.*, p.name AS product_name, i.on_hand, i.reserved, i.available
             FROM product_variants v
             JOIN products p ON p.id = v.product_id
             LEFT JOIN inventory i ON i.variant_id = v.id
             WHERE v.deleted_at IS NULL AND (v.barcode = :code1 OR v.sku = :code2)
             ORDER BY (v.barcode = :code3) DESC
             LIMIT 1'
        );
        $stmt->execute(['code1' => $code, 'code2' => $code, 'code3' => $code]);
        $row = $stmt->fetch();

        if ($row !== false) {
            return $row;
        }

        $stmt = $this->pdo->prepare(
            'SELECT v.*, p.name AS product_name, i.on_hand, i.reserved, i.available
             FROM product_variants v
             JOIN products p ON p.id = v.product_id
             LEFT JOIN inventory i ON i.variant_id = v.id
             WHERE v.deleted_at IS NULL AND p.name LIKE :name
             LIMIT 1'
        );
        $stmt->execute(['name' => '%' . $code . '%']);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /** @param list<int> $attributeValueIds */
    private function assertNoDuplicateCombination(int $productId, array $attributeValueIds, ?int $excludeVariantId): void
    {
        if ($attributeValueIds === []) {
            return;
        }

        sort($attributeValueIds);
        $placeholders = implode(',', array_fill(0, count($attributeValueIds), '?'));

        $sql = "SELECT pvv.variant_id
                FROM product_variant_values pvv
                JOIN product_variants v ON v.id = pvv.variant_id
                WHERE v.product_id = ? AND v.deleted_at IS NULL AND pvv.attribute_value_id IN ({$placeholders})
                GROUP BY pvv.variant_id
                HAVING COUNT(*) = ?";

        $params = array_merge([$productId], $attributeValueIds, [count($attributeValueIds)]);
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $candidateVariantId) {
            if ((int) $candidateVariantId !== $excludeVariantId) {
                $total = $this->pdo->prepare('SELECT COUNT(*) FROM product_variant_values WHERE variant_id = ?');
                $total->execute([$candidateVariantId]);

                if ((int) $total->fetchColumn() === count($attributeValueIds)) {
                    throw new RuntimeException('A variant with this exact attribute combination already exists for this product');
                }
            }
        }
    }

    /**
     * @param list<list<int>> $groups
     * @return list<list<int>>
     */
    private function cartesianProduct(array $groups): array
    {
        $result = [[]];

        foreach ($groups as $group) {
            $next = [];
            foreach ($result as $combination) {
                foreach ($group as $value) {
                    $next[] = [...$combination, $value];
                }
            }
            $result = $next;
        }

        return $result;
    }

    private function uniqueSku(string $base): string
    {
        $sku = $base;
        $suffix = 1;

        while (true) {
            $stmt = $this->pdo->prepare('SELECT 1 FROM product_variants WHERE sku = :sku');
            $stmt->execute(['sku' => $sku]);

            if ($stmt->fetchColumn() === false) {
                return $sku;
            }

            $sku = "{$base}-{$suffix}";
            $suffix++;
        }
    }

    private function skuSlug(string $name): string
    {
        $clean = mb_strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $name) ?? '');

        return $clean !== '' ? mb_substr($clean, 0, 6) : 'PROD';
    }
}
