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
                    product_id, sku, barcode, mrp, retail_price, wholesale_price, purchase_price,
                    min_selling_price, weight_grams, hsn_code_id, gst_rate_id, variant_description,
                    is_default, status
                ) VALUES (
                    :product_id, :sku, :barcode, :mrp, :retail_price, :wholesale_price, :purchase_price,
                    :min_selling_price, :weight_grams, :hsn_code_id, :gst_rate_id, :variant_description,
                    :is_default, :status
                )'
            );
            $stmt->execute([
                'product_id' => $productId,
                'sku' => $sku,
                'barcode' => $data['barcode'] ?? null,
                'mrp' => $data['mrp'] ?? 0,
                'retail_price' => $data['retail_price'] ?? 0,
                'wholesale_price' => $data['wholesale_price'] ?? null,
                'purchase_price' => $data['purchase_price'] ?? null,
                'min_selling_price' => $data['min_selling_price'] ?? null,
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

            $this->pdo->prepare(
                'INSERT INTO inventory (variant_id, product_id, on_hand, reserved) VALUES (:variant_id, :product_id, 0, 0)'
            )->execute(['variant_id' => $variantId, 'product_id' => $productId]);

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
            'barcode', 'mrp', 'retail_price', 'wholesale_price', 'purchase_price',
            'min_selling_price', 'weight_grams', 'hsn_code_id', 'gst_rate_id',
            'variant_description', 'is_default', 'status',
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
}
