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
        $variantActiveClause = (!empty($filters['channel']) && $filters['channel'] === 'ecommerce') ? " AND v.status = 'ACTIVE' AND (v.expiry_date IS NULL OR v.expiry_date >= CURRENT_DATE())" : "";

        [$where, $params] = $this->buildFilterConditions($filters);
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
        } elseif ($sort === 'popular' || $sort === 'popular_sale') {
            $orderBy = 'COALESCE((SELECT ps.units_sold_30d FROM product_stats ps WHERE ps.product_id = p.id), 0) DESC, p.is_featured DESC, p.id DESC';
        } elseif ($sort === 'newest') {
            $orderBy = 'p.created_at DESC';
        } elseif ($sort === 'rating') {
            $orderBy = "(SELECT AVG(cr.rating) FROM customer_reviews cr WHERE cr.product_id = p.id AND cr.status = 'APPROVED' AND cr.deleted_at IS NULL) DESC";
        } elseif ($sort === 'discount') {
            $orderBy = "(
                SELECT (v.mrp - v.retail_price) / NULLIF(v.mrp, 0)
                FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}
                ORDER BY is_default DESC, id ASC LIMIT 1
            ) DESC";
        } elseif (!empty($filters['section']) && ($filters['section'] === 'best_sellers' || $filters['section'] === 'bestsellers')) {
            $orderBy = 'COALESCE(p.is_best_seller_override, 0) DESC, p.is_featured DESC, p.created_at DESC';
        } elseif (!empty($filters['section']) && in_array(strtolower((string) $filters['section']), ['popular_sale', 'popular'], true)) {
            $orderBy = 'COALESCE((SELECT ps.units_sold_30d FROM product_stats ps WHERE ps.product_id = p.id), 0) DESC, p.is_featured DESC, p.id DESC';
        }

        $stmt = $this->pdo->prepare(
            "SELECT p.id, p.name, p.slug, p.product_code, p.is_active, p.is_pos_enabled, p.is_ecommerce_enabled,
                    p.is_featured, p.is_trending, p.is_deal, p.show_discount, p.is_best_seller_override, p.is_new_arrival_override,
                    p.short_description, p.created_at, p.brand_id, p.unit_id, p.country_of_origin, b.name AS brand_name,
                    (SELECT image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) AS primary_image,
                    (SELECT MIN(retail_price) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}) AS min_price,
                    (SELECT MAX(retail_price) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}) AS max_price,
                    (SELECT mrp FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause} ORDER BY is_default DESC, id ASC LIMIT 1) AS mrp,
                    (SELECT COUNT(*) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}) AS variant_count,
                    (SELECT COALESCE(ps.units_sold_30d, 0) FROM product_stats ps WHERE ps.product_id = p.id) AS units_sold,
                    (SELECT COALESCE(ps.view_count, 0) FROM product_stats ps WHERE ps.product_id = p.id) AS view_count,
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
                       AND COALESCE(i.available, 0) <= 0) AS out_of_stock_variant_count,
                    (SELECT ROUND(AVG(cr.rating), 1) FROM customer_reviews cr WHERE cr.product_id = p.id AND cr.status = 'APPROVED' AND cr.deleted_at IS NULL) AS avg_rating,
                    (SELECT COUNT(*) FROM customer_reviews cr WHERE cr.product_id = p.id AND cr.status = 'APPROVED' AND cr.deleted_at IS NULL) AS review_count
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

    /**
     * Shared by list() (builds every condition) and facets() (builds
     * every condition EXCEPT one group, so a facet group can report
     * counts as if its own selection weren't applied yet — standard
     * faceted-search behavior, letting a customer pick several Colors
     * instead of the list collapsing to just the one already chosen).
     *
     * $excludeKey is either a plain group name ('brand', 'price',
     * 'rating', 'discount', 'stock', 'new_arrival', 'country') or
     * 'attr:<Attribute Name>' / 'spec:<Spec Name>' for one dynamic facet.
     *
     * @param array<string, mixed> $filters
     * @return array{0: list<string>, 1: array<string, mixed>}
     */
    private function buildFilterConditions(array $filters, string $excludeKey = ''): array
    {
        $where = ['p.deleted_at IS NULL'];
        $params = [];

        if (($filters['is_active'] ?? null) !== null) {
            $where[] = 'p.is_active = :is_active';
            $params['is_active'] = (int) (bool) $filters['is_active'];
        }

        if ($excludeKey !== 'category') {
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
        }

        if ($excludeKey !== 'brand' && !empty($filters['brand_id'])) {
            $brandIds = array_filter(array_map('intval', explode(',', (string) $filters['brand_id'])));
            if ($brandIds !== []) {
                $placeholders = [];
                foreach ($brandIds as $i => $id) {
                    $key = "brand_id_{$i}";
                    $placeholders[] = ":{$key}";
                    $params[$key] = $id;
                }
                $where[] = 'p.brand_id IN (' . implode(',', $placeholders) . ')';
            }
        }

        if (!empty($filters['channel']) && $filters['channel'] === 'pos') {
            $where[] = 'p.is_pos_enabled = 1';
        } elseif (!empty($filters['channel']) && $filters['channel'] === 'ecommerce') {
            $where[] = 'p.is_ecommerce_enabled = 1';
            $where[] = 'p.is_active = 1';
            $where[] = '(p.expiry_date IS NULL OR p.expiry_date >= CURRENT_DATE())';
            $where[] = "EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL AND v.status = 'ACTIVE' AND (v.expiry_date IS NULL OR v.expiry_date >= CURRENT_DATE()))";
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
            $where[] = 'p.is_deal = :is_deal';
            $params['is_deal'] = (int) (bool) $filters['is_deal'];
        }

        if (!empty($filters['section'])) {
            $section = strtolower(trim((string) $filters['section']));
            if ($section === 'best_sellers' || $section === 'bestsellers') {
                $where[] = 'p.is_best_seller_override = 1';
            } elseif ($section === 'new_arrivals' || $section === 'newarrivals') {
                $where[] = 'p.is_new_arrival_override = 1';
            } elseif ($section === 'featured') {
                $where[] = 'p.is_featured = 1';
            } elseif ($section === 'trending') {
                $where[] = 'p.is_trending = 1';
            } elseif ($section === 'deals' || $section === 'flash_deals') {
                $where[] = 'p.is_deal = 1';
            } elseif ($section === 'popular_sale' || $section === 'popular') {
                // T15: Popular sale section calculated from order sales data
            }
        }

        if ($excludeKey !== 'offer' && (!empty($filters['offer_id']) || !empty($filters['top_offer_id']))) {
            $offerId = (int) (!empty($filters['offer_id']) ? $filters['offer_id'] : $filters['top_offer_id']);
            $where[] = 'EXISTS (SELECT 1 FROM top_offer_products top WHERE top.top_offer_id = :offer_id AND top.product_id = p.id)';
            $params['offer_id'] = $offerId;
        }

        // "Offers" facet (spec section "Offers (Special Price, Buy More
        // Save More, Combo offers) based on what the backend supports")
        // — only Special Price (the existing is_deal flag) has real,
        // queryable backing data today; the other two aren't modeled
        // anywhere in the schema, so exposing them as filters would be
        // either a no-op or silently wrong. offer=special_price is the
        // one honest mapping.
        if ($excludeKey !== 'offer' && !empty($filters['offer']) && strtolower((string) $filters['offer']) === 'special_price') {
            $where[] = 'p.is_deal = 1';
        }

        $variantActiveClause = (!empty($filters['channel']) && $filters['channel'] === 'ecommerce') ? " AND v.status = 'ACTIVE' AND (v.expiry_date IS NULL OR v.expiry_date >= CURRENT_DATE())" : "";

        if ($excludeKey !== 'price') {
            if (!empty($filters['min_price'])) {
                $where[] = "EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause} AND v.retail_price >= :min_price)";
                $params['min_price'] = (float) $filters['min_price'];
            }

            if (!empty($filters['max_price'])) {
                $where[] = "EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause} AND v.retail_price <= :max_price)";
                $params['max_price'] = (float) $filters['max_price'];
            }
        }

        if ($excludeKey !== 'rating' && !empty($filters['rating_min'])) {
            $where[] = "(SELECT AVG(cr.rating) FROM customer_reviews cr WHERE cr.product_id = p.id AND cr.status = 'APPROVED' AND cr.deleted_at IS NULL) >= :rating_min";
            $params['rating_min'] = (float) $filters['rating_min'];
        }

        if ($excludeKey !== 'discount' && !empty($filters['discount_min'])) {
            $where[] = "EXISTS (
                SELECT 1 FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}
                AND v.mrp > 0 AND ((v.mrp - v.retail_price) / v.mrp) * 100 >= :discount_min
            )";
            $params['discount_min'] = (float) $filters['discount_min'];
        }

        // Availability: hides out-of-stock by default, same as every
        // storefront listing already implicitly assumed — an explicit
        // in_stock=0 (the sidebar's "Include out of stock" toggle) turns
        // this condition off entirely rather than inverting it.
        if ($excludeKey !== 'stock' && (($filters['in_stock'] ?? '1') !== '0' && ($filters['in_stock'] ?? true) !== false)) {
            $where[] = "EXISTS (
                SELECT 1 FROM product_variants v LEFT JOIN inventory i ON i.variant_id = v.id
                WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause} AND COALESCE(i.available, 0) > 0
            )";
        }

        if ($excludeKey !== 'new_arrival' && !empty($filters['new_arrival'])) {
            $where[] = 'p.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
        }

        if ($excludeKey !== 'country' && !empty($filters['country_of_origin'])) {
            $countries = array_filter(array_map('trim', explode(',', (string) $filters['country_of_origin'])));
            if ($countries !== []) {
                $placeholders = [];
                foreach (array_values($countries) as $i => $country) {
                    $key = "country_{$i}";
                    $placeholders[] = ":{$key}";
                    $params[$key] = $country;
                }
                $where[] = 'p.country_of_origin IN (' . implode(',', $placeholders) . ')';
            }
        }

        // Dynamic variant-attribute facets: attr[Color]=Red,Blue means
        // "any variant of this product has a Color value of Red OR Blue"
        // — ANDed across different attribute names (Color AND Size),
        // ORed within one name's own selected values.
        foreach ((array) ($filters['attr'] ?? []) as $attrName => $rawValues) {
            if ($excludeKey === "attr:{$attrName}") {
                continue;
            }
            $values = array_filter(array_map('trim', explode(',', (string) $rawValues)));
            if ($values === []) {
                continue;
            }
            $placeholders = [];
            foreach (array_values($values) as $i => $value) {
                $key = 'attrval_' . preg_replace('/[^a-zA-Z0-9]/', '', $attrName) . "_{$i}";
                $placeholders[] = ":{$key}";
                $params[$key] = $value;
            }
            $nameKey = 'attrname_' . preg_replace('/[^a-zA-Z0-9]/', '', (string) $attrName);
            $params[$nameKey] = (string) $attrName;
            $where[] = "EXISTS (
                SELECT 1 FROM product_variants v
                JOIN product_variant_values pvv ON pvv.variant_id = v.id
                JOIN variant_attribute_values vav ON vav.id = pvv.attribute_value_id
                JOIN variant_attributes va ON va.id = vav.attribute_id
                WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}
                  AND va.name = :{$nameKey} AND vav.value IN (" . implode(',', $placeholders) . ")
            )";
        }

        // Dynamic product-spec facets: spec[Gender]=Men,Women.
        foreach ((array) ($filters['spec'] ?? []) as $specName => $rawValues) {
            if ($excludeKey === "spec:{$specName}") {
                continue;
            }
            $values = array_filter(array_map('trim', explode(',', (string) $rawValues)));
            if ($values === []) {
                continue;
            }
            $placeholders = [];
            foreach (array_values($values) as $i => $value) {
                $key = 'specval_' . preg_replace('/[^a-zA-Z0-9]/', '', (string) $specName) . "_{$i}";
                $placeholders[] = ":{$key}";
                $params[$key] = $value;
            }
            $nameKey = 'specname_' . preg_replace('/[^a-zA-Z0-9]/', '', (string) $specName);
            $params[$nameKey] = (string) $specName;
            $where[] = "EXISTS (
                SELECT 1 FROM product_specifications psf
                WHERE psf.product_id = p.id AND psf.name = :{$nameKey} AND psf.value IN (" . implode(',', $placeholders) . ")
            )";
        }

        if (!empty($filters['search'])) {
            $searchTerm = trim((string) $filters['search']);
            $needle = '%' . $searchTerm . '%';
            $where[] = '(
                p.name LIKE :search_like
                OR p.product_code LIKE :search_like
                OR p.tags LIKE :search_like
                OR p.short_description LIKE :search_like
                OR EXISTS (
                    SELECT 1 FROM product_categories pc
                    JOIN categories c ON c.id = pc.category_id
                    WHERE pc.product_id = p.id AND c.name LIKE :search_like AND c.status = "ACTIVE" AND c.deleted_at IS NULL
                )
                OR EXISTS (
                    SELECT 1 FROM product_subcategories ps
                    JOIN subcategories s ON s.id = ps.subcategory_id
                    WHERE ps.product_id = p.id AND s.name LIKE :search_like AND s.status = "ACTIVE" AND s.deleted_at IS NULL
                )
            )';
            $params['search_like'] = $needle;
        }

        return [$where, $params];
    }

    /**
     * Facets for the current filtered result set — each group is
     * computed against every OTHER active filter (its own selection
     * excluded, see buildFilterConditions()) so picking one value in a
     * group never collapses that same group's other options to zero.
     * One bounded query per facet group/dynamic attribute-or-spec name
     * actually present in the current results — not a per-product query,
     * so this stays flat regardless of how many products match.
     *
     * @param array<string, mixed> $filters
     * @return array<string, mixed>
     */
    public function facets(array $filters): array
    {
        $variantActiveClause = (!empty($filters['channel']) && $filters['channel'] === 'ecommerce') ? " AND v.status = 'ACTIVE' AND (v.expiry_date IS NULL OR v.expiry_date >= CURRENT_DATE())" : "";

        $run = function (string $sql, array $params): array {
            $stmt = $this->pdo->prepare($sql);
            foreach ($params as $key => $value) {
                $stmt->bindValue(":{$key}", $value);
            }
            $stmt->execute();
            return $stmt->fetchAll();
        };

        // Brands
        [$where, $params] = $this->buildFilterConditions($filters, 'brand');
        $whereSql = implode(' AND ', $where);
        $brands = $run(
            "SELECT p.brand_id AS id, b.name, COUNT(DISTINCT p.id) AS count
             FROM products p JOIN brands b ON b.id = p.brand_id AND b.deleted_at IS NULL
             WHERE {$whereSql} AND p.brand_id IS NOT NULL
             GROUP BY p.brand_id, b.name ORDER BY count DESC",
            $params
        );

        // Price bounds (min/max of the current result set, ignoring the
        // price filter itself, so the slider's own range doesn't shrink
        // every time the admin — sorry, the customer — adjusts it)
        [$where, $params] = $this->buildFilterConditions($filters, 'price');
        $whereSql = implode(' AND ', $where);
        $priceBounds = $run(
            "SELECT MIN(v.retail_price) AS min_price, MAX(v.retail_price) AS max_price
             FROM products p JOIN product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}
             WHERE {$whereSql}",
            $params
        );

        // Rating buckets (4+, 3+, 2+, 1+)
        [$where, $params] = $this->buildFilterConditions($filters, 'rating');
        $whereSql = implode(' AND ', $where);
        $ratingRows = $run(
            "SELECT ROUND(avg_rating.rating) AS bucket, COUNT(*) AS count FROM (
                SELECT p.id, (SELECT AVG(cr.rating) FROM customer_reviews cr WHERE cr.product_id = p.id AND cr.status = 'APPROVED' AND cr.deleted_at IS NULL) AS rating
                FROM products p WHERE {$whereSql}
             ) avg_rating WHERE avg_rating.rating IS NOT NULL GROUP BY bucket",
            $params
        );
        $ratingBuckets = [];
        foreach ([4, 3, 2, 1] as $threshold) {
            $count = 0;
            foreach ($ratingRows as $row) {
                if ((float) $row['bucket'] >= $threshold) {
                    $count += (int) $row['count'];
                }
            }
            $ratingBuckets[] = ['min_rating' => $threshold, 'count' => $count];
        }

        // Discount buckets (10/20/30/40/50 % or more)
        [$where, $params] = $this->buildFilterConditions($filters, 'discount');
        $whereSql = implode(' AND ', $where);
        $discountRows = $run(
            "SELECT best.pct AS pct, COUNT(*) AS count FROM (
                SELECT p.id, (
                    SELECT MAX((v.mrp - v.retail_price) / NULLIF(v.mrp, 0)) * 100
                    FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}
                ) AS pct
                FROM products p WHERE {$whereSql}
             ) best WHERE best.pct IS NOT NULL GROUP BY pct",
            $params
        );
        $discountBuckets = [];
        foreach ([10, 20, 30, 40, 50] as $threshold) {
            $count = 0;
            foreach ($discountRows as $row) {
                if ((float) $row['pct'] >= $threshold) {
                    $count += (int) $row['count'];
                }
            }
            $discountBuckets[] = ['min_discount' => $threshold, 'count' => $count];
        }

        // Countries of origin
        [$where, $params] = $this->buildFilterConditions($filters, 'country');
        $whereSql = implode(' AND ', $where);
        $countries = $run(
            "SELECT p.country_of_origin AS name, COUNT(*) AS count
             FROM products p WHERE {$whereSql} AND p.country_of_origin IS NOT NULL AND p.country_of_origin != ''
             GROUP BY p.country_of_origin ORDER BY count DESC",
            $params
        );

        // Dynamic variant-attribute facets — only for attribute names
        // that actually have at least one value among the CURRENTLY
        // filtered products' variants (per the task: "show only groups
        // that have values for the current category").
        [$baseWhere, $baseParams] = $this->buildFilterConditions($filters);
        $baseWhereSql = implode(' AND ', $baseWhere);
        $presentAttrNames = $run(
            "SELECT DISTINCT va.name
             FROM products p
             JOIN product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}
             JOIN product_variant_values pvv ON pvv.variant_id = v.id
             JOIN variant_attribute_values vav ON vav.id = pvv.attribute_value_id
             JOIN variant_attributes va ON va.id = vav.attribute_id
             WHERE {$baseWhereSql}",
            $baseParams
        );

        $attributeFacets = [];
        foreach ($presentAttrNames as $row) {
            $attrName = (string) $row['name'];
            [$where, $params] = $this->buildFilterConditions($filters, "attr:{$attrName}");
            $whereSql = implode(' AND ', $where);
            $params['facet_attr_name'] = $attrName;
            $values = $run(
                "SELECT vav.value, vav.color_hex, COUNT(DISTINCT p.id) AS count
                 FROM products p
                 JOIN product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL{$variantActiveClause}
                 JOIN product_variant_values pvv ON pvv.variant_id = v.id
                 JOIN variant_attribute_values vav ON vav.id = pvv.attribute_value_id
                 JOIN variant_attributes va ON va.id = vav.attribute_id
                 WHERE {$whereSql} AND va.name = :facet_attr_name
                 GROUP BY vav.value, vav.color_hex ORDER BY count DESC",
                $params
            );
            $attributeFacets[] = ['name' => $attrName, 'values' => $values];
        }

        // Dynamic product-spec facets — same "only if present" rule.
        $presentSpecNames = $run(
            "SELECT DISTINCT psf.name FROM products p JOIN product_specifications psf ON psf.product_id = p.id WHERE {$baseWhereSql}",
            $baseParams
        );

        $specFacets = [];
        foreach ($presentSpecNames as $row) {
            $specName = (string) $row['name'];
            [$where, $params] = $this->buildFilterConditions($filters, "spec:{$specName}");
            $whereSql = implode(' AND ', $where);
            $params['facet_spec_name'] = $specName;
            $values = $run(
                "SELECT psf.value, COUNT(DISTINCT p.id) AS count
                 FROM products p JOIN product_specifications psf ON psf.product_id = p.id
                 WHERE {$whereSql} AND psf.name = :facet_spec_name
                 GROUP BY psf.value ORDER BY count DESC",
                $params
            );
            $specFacets[] = ['name' => $specName, 'values' => $values];
        }

        return [
            'brands' => $brands,
            'price' => $priceBounds[0] ?? ['min_price' => null, 'max_price' => null],
            'rating_buckets' => $ratingBuckets,
            'discount_buckets' => $discountBuckets,
            'countries' => $countries,
            'attributes' => $attributeFacets,
            'specs' => $specFacets,
        ];
    }

    /** @return array<string, mixed>|null */
    public function find(int|string $id, bool $isStaff = true): ?array
    {
        $isNumeric = is_numeric($id);
        $whereClause = $isNumeric ? 'p.id = :id' : 'p.slug = :id';

        $stmt = $this->pdo->prepare(
            "SELECT p.*, b.name AS brand_name, u.name AS unit_name, u.short_code AS unit_short_code,
                    h.code AS hsn_code, g.gst_percent
             FROM products p
             LEFT JOIN brands b ON b.id = p.brand_id AND b.deleted_at IS NULL
             LEFT JOIN units u ON u.id = p.unit_id
             LEFT JOIN hsn_codes h ON h.id = p.hsn_code_id
             LEFT JOIN gst_rates g ON g.id = p.gst_rate_id
             WHERE {$whereClause} AND p.deleted_at IS NULL"
        );
        $stmt->execute(['id' => $isNumeric ? (int) $id : (string) $id]);
        $product = $stmt->fetch();

        if ($product === false) {
            return null;
        }

        if (!$isStaff) {
            if (!empty($product['expiry_date']) && strtotime((string) $product['expiry_date']) < strtotime(date('Y-m-d'))) {
                return null;
            }
        }

        $realId = (int) $product['id'];

        $product['bullet_points'] = $product['bullet_points'] !== null ? json_decode((string) $product['bullet_points'], true) : [];

        $images = $this->pdo->prepare('SELECT * FROM product_images WHERE product_id = :id ORDER BY sort_order');
        $images->execute(['id' => $realId]);
        $product['images'] = $images->fetchAll();

        $specifications = $this->pdo->prepare('SELECT * FROM product_specifications WHERE product_id = :id ORDER BY sort_order');
        $specifications->execute(['id' => $realId]);
        $product['specifications'] = $specifications->fetchAll();

        $catSql = 'SELECT c.id, c.name, c.slug, pc.is_primary FROM product_categories pc
             JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = :id';
        if (!$isStaff) {
            $catSql .= ' AND c.status = "ACTIVE" AND c.deleted_at IS NULL';
        }
        $categories = $this->pdo->prepare($catSql);
        $categories->execute(['id' => $realId]);
        $product['categories'] = $categories->fetchAll();

        $subSql = 'SELECT s.id, s.name, s.slug FROM product_subcategories ps
             JOIN subcategories s ON s.id = ps.subcategory_id WHERE ps.product_id = :id';
        if (!$isStaff) {
            $subSql .= ' AND s.status = "ACTIVE" AND s.deleted_at IS NULL';
        }
        $subcategories = $this->pdo->prepare($subSql);
        $subcategories->execute(['id' => $realId]);
        $product['subcategories'] = $subcategories->fetchAll();

        $varSql = 'SELECT v.*, i.on_hand, i.reserved, i.available, COALESCE(i.low_stock_threshold, 5) AS low_stock_threshold
             FROM product_variants v LEFT JOIN inventory i ON i.variant_id = v.id
             WHERE v.product_id = :id AND v.deleted_at IS NULL';
        if (!$isStaff) {
            $varSql .= ' AND v.status = "ACTIVE" AND (v.expiry_date IS NULL OR v.expiry_date >= CURRENT_DATE())';
        }
        $varSql .= ' ORDER BY v.is_default DESC, v.id';
        $variants = $this->pdo->prepare($varSql);
        $variants->execute(['id' => $realId]);
        $variantRows = $variants->fetchAll();

        foreach ($variantRows as &$variant) {
            $values = $this->pdo->prepare(
                'SELECT va.id AS attribute_id, va.name AS attribute_name, vav.id AS value_id, vav.value, vav.color_hex
                 FROM product_variant_values pvv
                 LEFT JOIN variant_attribute_values vav ON vav.id = pvv.attribute_value_id
                 LEFT JOIN variant_attributes va ON va.id = vav.attribute_id
                 WHERE pvv.variant_id = :variant_id'
            );
            $values->execute(['variant_id' => $variant['id']]);
            $variant['attribute_values'] = $values->fetchAll();

            $variantImages = $this->pdo->prepare('SELECT * FROM variant_images WHERE variant_id = :variant_id ORDER BY sort_order');
            $variantImages->execute(['variant_id' => $variant['id']]);
            $variant['images'] = $variantImages->fetchAll();

            if (!$isStaff) {
                unset(
                    $variant['purchase_price'],
                    $variant['cost_price'],
                    $variant['wholesale_price'],
                    $variant['min_selling_price']
                );
            }
        }
        unset($variant);

        $prices = array_filter(array_column($variantRows, 'retail_price'), fn($p) => $p !== null && $p !== '');
        $product['min_price'] = !empty($prices) ? min($prices) : null;
        $product['max_price'] = !empty($prices) ? max($prices) : null;
        $product['variants'] = $variantRows;

        $reviewsStmt = $this->pdo->prepare(
            'SELECT id, product_id, customer_id, customer_name, customer_avatar,
                    rating, title, comment, is_verified_purchase, helpful_count,
                    created_at
             FROM customer_reviews
             WHERE product_id = :id AND status = "APPROVED" AND deleted_at IS NULL
             ORDER BY created_at DESC'
        );
        $reviewsStmt->execute(['id' => $realId]);
        $reviews = $reviewsStmt->fetchAll();

        $totalReviews = count($reviews);
        $avgRating = 0.0;
        $ratingCounts = [5 => 0, 4 => 0, 3 => 0, 2 => 0, 1 => 0];

        if ($totalReviews > 0) {
            $sum = 0;
            foreach ($reviews as $rev) {
                $r = max(1, min(5, (int) $rev['rating']));
                $ratingCounts[$r]++;
                $sum += $r;
            }
            $avgRating = round($sum / $totalReviews, 1);
        }

        $product['reviews'] = $reviews;
        $product['review_summary'] = [
            'total_reviews' => $totalReviews,
            'average_rating' => $avgRating,
            'rating_breakdown' => $ratingCounts,
        ];

        return $product;
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        $name = trim((string) ($data['name'] ?? ''));

        if ($name === '') {
            throw new RuntimeException('Product name is required');
        }

        $returnable = (bool) ($data['returnable'] ?? true);
        $returnWindowDays = array_key_exists('return_window_days', $data) && $data['return_window_days'] !== null && $data['return_window_days'] !== ''
            ? $data['return_window_days']
            : ($returnable ? 7 : null);

        $this->assertValidReturnWindow(
            returnable: $returnable,
            returnWindowDays: $returnWindowDays,
        );

        $slug = $this->uniqueSlug($this->slugify($data['slug'] ?? $name));

        $stmt = $this->pdo->prepare(
            'INSERT INTO products (
                name, slug, product_code, brand_id, unit_id, hsn_code_id, gst_rate_id,
                short_description, description, bullet_points, tags, material,
                length_cm, width_cm, height_cm, weight_grams, manufacturer, country_of_origin,
                meta_title, meta_description, seo_keywords,
                expiry_applicable, warranty_applicable, warranty_period, warranty_unit, warranty_description,
                returnable, return_window_days, return_policy_description, replacement_available, refund_available,
                shipping_required, cod_available,
                is_active, is_pos_enabled, is_ecommerce_enabled, is_featured, is_trending, is_deal, show_discount
            ) VALUES (
                :name, :slug, :product_code, :brand_id, :unit_id, :hsn_code_id, :gst_rate_id,
                :short_description, :description, :bullet_points, :tags, :material,
                :length_cm, :width_cm, :height_cm, :weight_grams, :manufacturer, :country_of_origin,
                :meta_title, :meta_description, :seo_keywords,
                :expiry_applicable, :warranty_applicable, :warranty_period, :warranty_unit, :warranty_description,
                :returnable, :return_window_days, :return_policy_description, :replacement_available, :refund_available,
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
            'returnable' => (int) $returnable,
            'return_window_days' => $returnWindowDays,
            'return_policy_description' => $data['return_policy_description'] ?? null,
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

    /**
     * returnable/return_window_days drive customer-facing return
     * eligibility (ReturnService::eligibilityForOrder()) — a blank/zero
     * window on a "returnable" product would silently make it
     * unreturnable in practice, which is a confusing admin mistake to
     * ship rather than reject outright.
     */
    private function assertValidReturnWindow(bool $returnable, mixed $returnWindowDays): void
    {
        if ($returnWindowDays !== null && $returnWindowDays !== '') {
            if (!is_numeric($returnWindowDays) || (int) $returnWindowDays < 0 || (string) (int) $returnWindowDays !== (string) $returnWindowDays) {
                throw new RuntimeException('Return Window (Days) must be a non-negative whole number');
            }
        }

        if ($returnable && (int) ($returnWindowDays ?: 0) <= 0) {
            throw new RuntimeException('Return Window (Days) must be a positive number when the product is returnable');
        }
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

        $this->assertValidReturnWindow(
            returnable: (bool) (array_key_exists('returnable', $data) ? $data['returnable'] : $existing['returnable']),
            returnWindowDays: array_key_exists('return_window_days', $data) ? $data['return_window_days'] : $existing['return_window_days'],
        );

        $fields = [
            'name', 'product_code', 'brand_id', 'unit_id', 'hsn_code_id', 'gst_rate_id',
            'short_description', 'description', 'tags', 'material',
            'length_cm', 'width_cm', 'height_cm', 'weight_grams', 'manufacturer', 'country_of_origin',
            'meta_title', 'meta_description', 'seo_keywords',
            'expiry_applicable', 'expiry_date', 'warranty_applicable', 'warranty_period', 'warranty_unit', 'warranty_description',
            'returnable', 'return_window_days', 'return_policy_description', 'replacement_available', 'refund_available',
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
