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
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return list<array<string, mixed>> */
    public function listAttributes(): array
    {
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

    public function createAttribute(string $name): int
    {
        $this->pdo->prepare('INSERT INTO variant_attributes (name) VALUES (:name)')->execute(['name' => $name]);

        return (int) $this->pdo->lastInsertId();
    }

    public function createAttributeValue(int $attributeId, string $value, ?string $colorHex = null): int
    {
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
                    product_id, sku, barcode, mrp, retail_price, wholesale_price, customer_price, purchase_price,
                    min_selling_price, discount_percent, discount_amount, manufacturing_date, expiry_date,
                    weight_grams, hsn_code_id, gst_rate_id, variant_description, is_default, status
                ) VALUES (
                    :product_id, :sku, :barcode, :mrp, :retail_price, :wholesale_price, :customer_price, :purchase_price,
                    :min_selling_price, :discount_percent, :discount_amount, :manufacturing_date, :expiry_date,
                    :weight_grams, :hsn_code_id, :gst_rate_id, :variant_description, :is_default, :status
                )'
            );
            $stmt->execute([
                'product_id' => $productId,
                'sku' => $sku,
                'barcode' => $data['barcode'] ?? null,
                'mrp' => $data['mrp'] ?? 0,
                'retail_price' => $data['retail_price'] ?? 0,
                'wholesale_price' => $data['wholesale_price'] ?? null,
                'customer_price' => $data['customer_price'] ?? null,
                'purchase_price' => $data['purchase_price'] ?? null,
                'min_selling_price' => $data['min_selling_price'] ?? null,
                'discount_percent' => $data['discount_percent'] ?? 0,
                'discount_amount' => $data['discount_amount'] ?? 0,
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
            'barcode', 'mrp', 'retail_price', 'wholesale_price', 'customer_price', 'purchase_price',
            'min_selling_price', 'discount_percent', 'discount_amount', 'manufacturing_date', 'expiry_date',
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
