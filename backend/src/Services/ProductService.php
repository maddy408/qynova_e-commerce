<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

final class ProductService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * @param array<string, mixed> $filters
     * @return array{items: list<array<string, mixed>>, total: int, page: int, limit: int}
     */
    public function list(array $filters): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $limit = min(100, max(1, (int) ($filters['limit'] ?? 20)));
        $offset = ($page - 1) * $limit;

        $where = ['p.deleted_at IS NULL'];
        $params = [];

        if (($filters['is_active'] ?? null) !== null) {
            $where[] = 'p.is_active = :is_active';
            $params['is_active'] = (int) (bool) $filters['is_active'];
        }

        if (!empty($filters['category_id'])) {
            $where[] = 'EXISTS (SELECT 1 FROM product_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = p.id AND pc.category_id = :category_id AND c.status = "ACTIVE" AND c.deleted_at IS NULL)';
            $params['category_id'] = (int) $filters['category_id'];
        }

        if (!empty($filters['category_slug'])) {
            $where[] = 'EXISTS (SELECT 1 FROM product_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = p.id AND c.slug = :category_slug AND c.status = "ACTIVE" AND c.deleted_at IS NULL)';
            $params['category_slug'] = (string) $filters['category_slug'];
        }

        if (!empty($filters['subcategory_id'])) {
            $where[] = 'EXISTS (SELECT 1 FROM product_subcategories ps JOIN subcategories s ON s.id = ps.subcategory_id WHERE ps.product_id = p.id AND ps.subcategory_id = :subcategory_id AND s.status = "ACTIVE" AND s.deleted_at IS NULL)';
            $params['subcategory_id'] = (int) $filters['subcategory_id'];
        }

        if (!empty($filters['brand_id'])) {
            $where[] = 'p.brand_id = :brand_id';
            $params['brand_id'] = (int) $filters['brand_id'];
        }

        if (!empty($filters['channel']) && $filters['channel'] === 'pos') {
            $where[] = 'p.is_pos_enabled = 1';
        } elseif (!empty($filters['channel']) && $filters['channel'] === 'ecommerce') {
            $where[] = 'p.is_ecommerce_enabled = 1';
            $where[] = 'p.is_active = 1';
        }

        if (($filters['is_featured'] ?? null) !== null) {
            $where[] = 'p.is_featured = :is_featured';
            $params['is_featured'] = (int) (bool) $filters['is_featured'];
        }

        if (($filters['is_trending'] ?? null) !== null) {
            $where[] = 'p.is_trending = :is_trending';
            $params['is_trending'] = (int) (bool) $filters['is_trending'];
        }

        if (($filters['is_deal'] ?? null) !== null) {
            $where[] = '(p.is_deal = 1 OR p.show_discount = 1)';
        }

        if (!empty($filters['section'])) {
            $section = strtolower(trim((string) $filters['section']));
            if ($section === 'best_sellers' || $section === 'bestsellers') {
                $where[] = '(p.is_best_seller_override = 1 OR p.is_featured = 1)';
            } elseif ($section === 'new_arrivals' || $section === 'newarrivals') {
                $where[] = '(p.is_new_arrival_override = 1 OR p.created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY))';
            } elseif ($section === 'featured') {
                $where[] = 'p.is_featured = 1';
            } elseif ($section === 'trending') {
                $where[] = '(p.is_trending = 1 OR p.is_featured = 1)';
            } elseif ($section === 'deals' || $section === 'flash_deals') {
                $where[] = '(p.is_deal = 1 OR p.show_discount = 1)';
            }
        }

        $variantActiveClause = (!empty($filters['channel']) && $filters['channel'] === 'ecommerce') ? " AND v.status = 'ACTIVE'" : "";

        if (!empty($filters['min_price'])) {
            $where[] = "EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause} AND v.retail_price >= :min_price)";
            $params['min_price'] = (float) $filters['min_price'];
        }

        if (!empty($filters['max_price'])) {
            $where[] = "EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause} AND v.retail_price <= :max_price)";
            $params['max_price'] = (float) $filters['max_price'];
        }

        if (!empty($filters['search'])) {
            $searchTerm = trim((string) $filters['search']);
            $where[] = '(MATCH(p.name, p.tags, p.short_description) AGAINST (:search IN NATURAL LANGUAGE MODE) OR p.name LIKE :search_like OR p.product_code LIKE :search_like)';
            $params['search'] = $searchTerm;
            $params['search_like'] = '%' . $searchTerm . '%';
        }

        $whereSql = implode(' AND ', $where);

        $countStmt = $this->pdo->prepare("SELECT COUNT(*) FROM products p WHERE {$whereSql}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $sort = strtolower(trim((string) ($filters['sort'] ?? '')));
        $orderBy = 'p.created_at DESC';
        if ($sort === 'price_asc' || $sort === 'price_low') {
            $orderBy = "(SELECT MIN(retail_price) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}) ASC";
        } elseif ($sort === 'price_desc' || $sort === 'price_high') {
            $orderBy = "(SELECT MIN(retail_price) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}) DESC";
        } elseif ($sort === 'name_asc') {
            $orderBy = 'p.name ASC';
        } elseif ($sort === 'name_desc') {
            $orderBy = 'p.name DESC';
        } elseif ($sort === 'best_sellers' || $sort === 'bestsellers') {
            $orderBy = 'COALESCE(p.is_best_seller_override, 0) DESC, p.is_featured DESC, p.created_at DESC';
        } elseif ($sort === 'popular') {
            $orderBy = 'p.is_featured DESC, p.is_trending DESC, p.created_at DESC';
        } elseif ($sort === 'newest') {
            $orderBy = 'p.created_at DESC';
        } elseif (!empty($filters['section']) && ($filters['section'] === 'best_sellers' || $filters['section'] === 'bestsellers')) {
            $orderBy = 'COALESCE(p.is_best_seller_override, 0) DESC, p.is_featured DESC, p.created_at DESC';
        }

        $stmt = $this->pdo->prepare(
            "SELECT p.id, p.name, p.slug, p.product_code, p.is_active, p.is_pos_enabled, p.is_ecommerce_enabled,
                    p.is_featured, p.is_trending, p.is_deal, p.show_discount, p.is_best_seller_override, p.is_new_arrival_override,
                    p.short_description, p.created_at, b.name AS brand_name,
                    (SELECT image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) AS primary_image,
                    (SELECT MIN(retail_price) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}) AS min_price,
                    (SELECT MAX(retail_price) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}) AS max_price,
                    (SELECT mrp FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause} ORDER BY is_default DESC, id ASC LIMIT 1) AS mrp,
                    (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}) AS variant_count,
                    -- Section 18 of the merchant's variant-logic spec: the
                    -- product list needs variant-level stock rolled up,
                    -- not a separately-maintained product total.
                    (SELECT COALESCE(SUM(i.available), 0)
                     FROM product_variants v LEFT JOIN inventory i ON i.variant_id = v.id
                     WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}) AS total_stock,
                    (SELECT COUNT(*)
                     FROM product_variants v LEFT JOIN inventory i ON i.variant_id = v.id
                     WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}
                       AND COALESCE(i.available, 0) > 0 AND COALESCE(i.available, 0) <= COALESCE(i.low_stock_threshold, 5)) AS low_stock_variant_count,
                    (SELECT COUNT(*)
                     FROM product_variants v LEFT JOIN inventory i ON i.variant_id = v.id
                     WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}
                       AND COALESCE(i.available, 0) <= 0) AS out_of_stock_variant_count
             FROM products p
             LEFT JOIN brands b ON b.id = p.brand_id AND b.deleted_at IS NULL
             WHERE {$whereSql}
             ORDER BY {$orderBy}
             LIMIT :limit OFFSET :offset"
        );

        foreach ($params as $key => $value) {
            $stmt->bindValue(":{$key}", $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $items = $stmt->fetchAll();
        $totalPages = $limit > 0 ? (int) ceil($total / $limit) : 1;
        $pagination = [
            'page' => $page,
            'limit' => $limit,
            'total' => $total,
            'totalPages' => $totalPages,
            'hasNextPage' => $page < $totalPages,
            'hasPreviousPage' => $page > 1,
        ];

        return [
            'items' => $items,
            'data' => $items,
            'total' => $total,
            'page' => $page,
            'limit' => $limit,
            'pagination' => $pagination,
        ];
    }

    /** @return array<string, mixed>|null */
    public function find(int $id, bool $isStaff = true): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT p.*, b.name AS brand_name, u.name AS unit_name, u.short_code AS unit_short_code,
                    h.code AS hsn_code, g.gst_percent
             FROM products p
             LEFT JOIN brands b ON b.id = p.brand_id AND b.deleted_at IS NULL
             LEFT JOIN units u ON u.id = p.unit_id
             LEFT JOIN hsn_codes h ON h.id = p.hsn_code_id
             LEFT JOIN gst_rates g ON g.id = p.gst_rate_id
             WHERE p.id = :id AND p.deleted_at IS NULL'
        );
        $stmt->execute(['id' => $id]);
        $product = $stmt->fetch();

        if ($product === false) {
            return null;
        }

        $product['bullet_points'] = $product['bullet_points'] !== null ? json_decode((string) $product['bullet_points'], true) : [];

        $images = $this->pdo->prepare('SELECT * FROM product_images WHERE product_id = :id ORDER BY sort_order');
        $images->execute(['id' => $id]);
        $product['images'] = $images->fetchAll();

        $specifications = $this->pdo->prepare('SELECT * FROM product_specifications WHERE product_id = :id ORDER BY sort_order');
        $specifications->execute(['id' => $id]);
        $product['specifications'] = $specifications->fetchAll();

        $catSql = 'SELECT c.id, c.name, pc.is_primary FROM product_categories pc
             JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = :id';
        if (!$isStaff) {
            $catSql .= ' AND c.status = "ACTIVE" AND c.deleted_at IS NULL';
        }
        $categories = $this->pdo->prepare($catSql);
        $categories->execute(['id' => $id]);
        $product['categories'] = $categories->fetchAll();

        $subSql = 'SELECT s.id, s.name FROM product_subcategories ps
             JOIN subcategories s ON s.id = ps.subcategory_id WHERE ps.product_id = :id';
        if (!$isStaff) {
            $subSql .= ' AND s.status = "ACTIVE" AND s.deleted_at IS NULL';
        }
        $subcategories = $this->pdo->prepare($subSql);
        $subcategories->execute(['id' => $id]);
        $product['subcategories'] = $subcategories->fetchAll();

        $varSql = 'SELECT v.*, i.on_hand, i.reserved, i.available, COALESCE(i.low_stock_threshold, 5) AS low_stock_threshold
             FROM product_variants v LEFT JOIN inventory i ON i.variant_id = v.id
             WHERE v.product_id = :id AND v.deleted_at IS NULL';
        if (!$isStaff) {
            $varSql .= ' AND v.status = "ACTIVE"';
        }
        $varSql .= ' ORDER BY v.is_default DESC, v.id';
        $variants = $this->pdo->prepare($varSql);
        $variants->execute(['id' => $id]);
        $variantRows = $variants->fetchAll();

        foreach ($variantRows as &$variant) {
            $values = $this->pdo->prepare(
                'SELECT va.id AS attribute_id, va.name AS attribute_name, vav.id AS value_id, vav.value, vav.color_hex
                 FROM product_variant_values pvv
                 JOIN variant_attribute_values vav ON vav.id = pvv.attribute_value_id
                 JOIN variant_attributes va ON va.id = vav.attribute_id
                 WHERE pvv.variant_id = :variant_id'
            );
            $values->execute(['variant_id' => $variant['id']]);
            $variant['attribute_values'] = $values->fetchAll();

            $variantImages = $this->pdo->prepare('SELECT * FROM variant_images WHERE variant_id = :variant_id ORDER BY sort_order');
            $variantImages->execute(['variant_id' => $variant['id']]);
            $variant['images'] = $variantImages->fetchAll();
        }
        unset($variant);

        $product['variants'] = $variantRows;

        return $product;
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        $name = trim((string) ($data['name'] ?? ''));

        if ($name === '') {
            throw new RuntimeException('Product name is required');
        }

        $slug = $this->uniqueSlug($this->slugify($data['slug'] ?? $name));

        $stmt = $this->pdo->prepare(
            'INSERT INTO products (
                name, slug, product_code, brand_id, unit_id, hsn_code_id, gst_rate_id,
                short_description, description, bullet_points, tags, material,
                length_cm, width_cm, height_cm, weight_grams, manufacturer, country_of_origin,
                meta_title, meta_description, seo_keywords,
                expiry_applicable, warranty_applicable, warranty_period, warranty_unit, warranty_description,
                returnable, return_window_days, replacement_available, refund_available,
                shipping_required, cod_available,
                is_active, is_pos_enabled, is_ecommerce_enabled, is_featured, is_trending, is_deal, show_discount
            ) VALUES (
                :name, :slug, :product_code, :brand_id, :unit_id, :hsn_code_id, :gst_rate_id,
                :short_description, :description, :bullet_points, :tags, :material,
                :length_cm, :width_cm, :height_cm, :weight_grams, :manufacturer, :country_of_origin,
                :meta_title, :meta_description, :seo_keywords,
                :expiry_applicable, :warranty_applicable, :warranty_period, :warranty_unit, :warranty_description,
                :returnable, :return_window_days, :replacement_available, :refund_available,
                :shipping_required, :cod_available,
                :is_active, :is_pos_enabled, :is_ecommerce_enabled, :is_featured, :is_trending, :is_deal, :show_discount
            )'
        );
        $stmt->execute([
            'name' => $name,
            'slug' => $slug,
            'product_code' => $data['product_code'] ?? null,
            'brand_id' => $data['brand_id'] ?? null,
            'unit_id' => $data['unit_id'] ?? null,
            'hsn_code_id' => $data['hsn_code_id'] ?? null,
            'gst_rate_id' => $data['gst_rate_id'] ?? null,
            'short_description' => $data['short_description'] ?? null,
            'description' => $data['description'] ?? null,
            'bullet_points' => $this->encodeBulletPoints($data['bullet_points'] ?? null),
            'tags' => $data['tags'] ?? null,
            'material' => $data['material'] ?? null,
            'length_cm' => $data['length_cm'] ?? null,
            'width_cm' => $data['width_cm'] ?? null,
            'height_cm' => $data['height_cm'] ?? null,
            'weight_grams' => $data['weight_grams'] ?? null,
            'manufacturer' => $data['manufacturer'] ?? null,
            'country_of_origin' => $data['country_of_origin'] ?? null,
            'meta_title' => $data['meta_title'] ?? null,
            'meta_description' => $data['meta_description'] ?? null,
            'seo_keywords' => $data['seo_keywords'] ?? null,
            'expiry_applicable' => (int) (bool) ($data['expiry_applicable'] ?? false),
            'warranty_applicable' => (int) (bool) ($data['warranty_applicable'] ?? false),
            'warranty_period' => $data['warranty_period'] ?? null,
            'warranty_unit' => $data['warranty_unit'] ?? null,
            'warranty_description' => $data['warranty_description'] ?? null,
            'returnable' => (int) (bool) ($data['returnable'] ?? true),
            'return_window_days' => $data['return_window_days'] ?? null,
            'replacement_available' => (int) (bool) ($data['replacement_available'] ?? false),
            'refund_available' => (int) (bool) ($data['refund_available'] ?? true),
            'shipping_required' => (int) (bool) ($data['shipping_required'] ?? true),
            'cod_available' => (int) (bool) ($data['cod_available'] ?? true),
            'is_active' => (int) (bool) ($data['is_active'] ?? true),
            'is_pos_enabled' => (int) (bool) ($data['is_pos_enabled'] ?? true),
            'is_ecommerce_enabled' => (int) (bool) ($data['is_ecommerce_enabled'] ?? true),
            'is_featured' => (int) (bool) ($data['is_featured'] ?? false),
            'is_trending' => (int) (bool) ($data['is_trending'] ?? false),
            'is_deal' => (int) (bool) ($data['is_deal'] ?? false),
            'show_discount' => (int) (bool) ($data['show_discount'] ?? true),
        ]);

        $productId = (int) $this->pdo->lastInsertId();

        $this->syncCategories($productId, (array) ($data['category_ids'] ?? []), $data['primary_category_id'] ?? null);
        $this->syncSubcategories($productId, (array) ($data['subcategory_ids'] ?? []));

        return $productId;
    }

    /** @param list<string>|null $bulletPoints */
    private function encodeBulletPoints(?array $bulletPoints): ?string
    {
        if ($bulletPoints === null) {
            return null;
        }

        $clean = array_values(array_filter(array_map('trim', $bulletPoints), fn ($b) => $b !== ''));

        return $clean === [] ? null : json_encode($clean);
    }

    /** @param array<string, mixed> $data */
    public function update(int $id, array $data): void
    {
        $existing = $this->find($id);

        if ($existing === null) {
            throw new RuntimeException('Product not found');
        }

        $fields = [
            'name', 'product_code', 'brand_id', 'unit_id', 'hsn_code_id', 'gst_rate_id',
            'short_description', 'description', 'tags', 'material',
            'length_cm', 'width_cm', 'height_cm', 'weight_grams', 'manufacturer', 'country_of_origin',
            'meta_title', 'meta_description', 'seo_keywords',
            'expiry_applicable', 'warranty_applicable', 'warranty_period', 'warranty_unit', 'warranty_description',
            'returnable', 'return_window_days', 'replacement_available', 'refund_available',
            'shipping_required', 'cod_available',
            'is_active', 'is_pos_enabled', 'is_ecommerce_enabled', 'is_featured', 'is_trending', 'is_deal', 'show_discount',
        ];
        $boolFields = [
            'expiry_applicable', 'warranty_applicable', 'returnable', 'replacement_available', 'refund_available',
            'shipping_required', 'cod_available',
            'is_active', 'is_pos_enabled', 'is_ecommerce_enabled', 'is_featured', 'is_trending', 'is_deal', 'show_discount',
        ];

        $sets = [];
        $params = ['id' => $id];

        if (array_key_exists('bullet_points', $data)) {
            $sets[] = 'bullet_points = :bullet_points';
            $params['bullet_points'] = $this->encodeBulletPoints($data['bullet_points']);
        }

        foreach ($fields as $field) {
            if (array_key_exists($field, $data)) {
                $sets[] = "{$field} = :{$field}";
                $params[$field] = in_array($field, $boolFields, true) ? (int) (bool) $data[$field] : $data[$field];
            }
        }

        if ($sets !== []) {
            $sql = 'UPDATE products SET ' . implode(', ', $sets) . ' WHERE id = :id';
            $this->pdo->prepare($sql)->execute($params);
        }

        if (array_key_exists('category_ids', $data)) {
            $this->syncCategories($id, (array) $data['category_ids'], $data['primary_category_id'] ?? null);
        }

        if (array_key_exists('subcategory_ids', $data)) {
            $this->syncSubcategories($id, (array) $data['subcategory_ids']);
        }
    }

    public function softDelete(int $id): void
    {
        $this->pdo->prepare('UPDATE products SET deleted_at = NOW() WHERE id = :id')->execute(['id' => $id]);
    }

    /** @param list<int> $categoryIds */
    private function syncCategories(int $productId, array $categoryIds, ?int $primaryCategoryId): void
    {
        $this->pdo->prepare('DELETE FROM product_categories WHERE product_id = :id')->execute(['id' => $productId]);

        foreach ($categoryIds as $categoryId) {
            $this->pdo->prepare(
                'INSERT INTO product_categories (product_id, category_id, is_primary) VALUES (:p, :c, :primary)'
            )->execute([
                'p' => $productId,
                'c' => (int) $categoryId,
                'primary' => (int) ((int) $categoryId === (int) $primaryCategoryId),
            ]);
        }
    }

    /** @param list<int> $subcategoryIds */
    private function syncSubcategories(int $productId, array $subcategoryIds): void
    {
        $this->pdo->prepare('DELETE FROM product_subcategories WHERE product_id = :id')->execute(['id' => $productId]);

        foreach ($subcategoryIds as $subcategoryId) {
            $this->pdo->prepare(
                'INSERT INTO product_subcategories (product_id, subcategory_id) VALUES (:p, :s)'
            )->execute(['p' => $productId, 's' => (int) $subcategoryId]);
        }
    }

    private function slugify(string $value): string
    {
        $slug = strtolower(trim($value));
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? $slug;

        return trim($slug, '-');
    }

    private function uniqueSlug(string $base): string
    {
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
