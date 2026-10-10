<?php

declare(strict_types=1);

namespace App\Services;

use DateTimeImmutable;
use DateTimeZone;
use PDO;

final class SalesRankingService
{
    public const DEFAULT_CACHE_TTL_SECONDS = 300; // 5 minutes

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Reads a setting with fallback default.
     */
    public function getSetting(string $key, string $default): string
    {
        try {
            $stmt = $this->pdo->prepare('SELECT setting_value FROM inventory_settings WHERE setting_key = :key');
            $stmt->execute(['key' => $key]);
            $val = $stmt->fetchColumn();
            return ($val !== false && $val !== null && trim((string) $val) !== '') ? (string) $val : $default;
        } catch (\Throwable) {
            return $default;
        }
    }

    /**
     * Resolves the shared sales period days (default 30 days).
     * Checks 'sales_period_days', then fallback 'pos_top_categories_period_days', then 30.
     */
    public function getSharedPeriodDays(): int
    {
        $shared = $this->getSetting('sales_period_days', '');
        if ($shared !== '' && is_numeric($shared) && (int) $shared > 0) {
            return (int) $shared;
        }
        $fallback = $this->getSetting('pos_top_categories_period_days', '30');
        return is_numeric($fallback) && (int) $fallback > 0 ? (int) $fallback : 30;
    }

    /**
     * Resolves the active database name.
     */
    public function getDbName(): string
    {
        try {
            $name = $this->pdo->query('SELECT DATABASE()')->fetchColumn();
            return is_string($name) && $name !== '' ? $name : 'default';
        } catch (\Throwable) {
            return 'default';
        }
    }

    /**
     * Directory path for cross-request persistent file cache, partitioned by database name.
     */
    public static function getCacheDir(?string $dbName = null): string
    {
        $base = dirname(__DIR__, 2) . '/storage/cache';
        $sub = $dbName ? '/' . preg_replace('/[^a-zA-Z0-9_-]/', '', $dbName) : '';
        $dir = $base . $sub;
        if (!is_dir($dir)) {
            @mkdir($dir, 0777, true);
        }
        return $dir;
    }

    /**
     * Clear category and variant sales persistent file cache (for specific db or all).
     */
    public static function clearCache(?string $dbName = null): void
    {
        if ($dbName !== null) {
            $dir = self::getCacheDir($dbName);
            $files = glob($dir . '/*_sales_*.json');
            if ($files) {
                foreach ($files as $f) {
                    @unlink($f);
                }
            }
            return;
        }

        $base = dirname(__DIR__, 2) . '/storage/cache';
        $files = glob($base . '/*_sales_*.json');
        if ($files) {
            foreach ($files as $f) {
                @unlink($f);
            }
        }
        $subDirs = glob($base . '/*', GLOB_ONLYDIR);
        if ($subDirs) {
            foreach ($subDirs as $sd) {
                $subFiles = glob($sd . '/*_sales_*.json');
                if ($subFiles) {
                    foreach ($subFiles as $f) {
                        @unlink($f);
                    }
                }
            }
        }
    }

    /**
     * Computes top-selling categories for POS Sale page with cross-request persistent caching.
     *
     * @return array{
     *   categories: list<array<string, mixed>>,
     *   meta: array{
     *     top_limit: int,
     *     sales_period_days: int,
     *     default_view: string,
     *     default_category_id: int|null,
     *     from_cache?: bool
     *   }
     * }
     */
    public function getPosCategorySales(
        ?int $topLimit = null,
        ?int $periodDays = null,
        ?string $defaultView = null,
        bool $bypassCache = false,
        ?int $overrideTtl = null
    ): array {
        $topLimit = $topLimit ?? (int) $this->getSetting('pos_top_categories_count', '8');
        $periodDays = $periodDays ?? $this->getSharedPeriodDays();
        $defaultView = $defaultView ?? $this->getSetting('pos_default_category_view', 'TOP_CATEGORY');
        $ttl = $overrideTtl ?? (int) $this->getSetting('pos_category_cache_ttl', (string) self::DEFAULT_CACHE_TTL_SECONDS);

        $cacheDir = self::getCacheDir($this->getDbName());
        $cacheKey = "cat_sales_{$periodDays}_{$topLimit}_{$defaultView}";
        $cacheFile = $cacheDir . '/' . $cacheKey . '.json';
        $nowTime = time();

        if (!$bypassCache && file_exists($cacheFile)) {
            $raw = @file_get_contents($cacheFile);
            if ($raw !== false) {
                $cached = @json_decode($raw, true);
                if (is_array($cached) && isset($cached['expires_at'], $cached['data']) && $nowTime < $cached['expires_at']) {
                    $cached['data']['meta']['from_cache'] = true;
                    return $cached['data'];
                }
            }
        }

        $rankedCategories = $this->categorySales($periodDays);

        // Assign rank and is_top flag across all active categories
        $finalCategories = [];
        $rank = 1;
        $defaultCategoryId = null;

        foreach ($rankedCategories as $cat) {
            if (($cat['status'] ?? '') !== 'ACTIVE' || !empty($cat['deleted_at'])) {
                continue;
            }
            $isTop = $rank <= $topLimit;
            $catEntry = [
                'id' => (int) $cat['id'],
                'name' => (string) $cat['name'],
                'slug' => (string) ($cat['slug'] ?? ''),
                'description' => $cat['description'] ?? null,
                'image_path' => $cat['image_path'] ?? null,
                'thumb_path' => $cat['thumb_path'] ?? null,
                'sort_order' => (int) $cat['sort_order'],
                'status' => (string) $cat['status'],
                'sales_units' => round((float) $cat['sales_units'], 3),
                'sales_rank' => $rank,
                'is_top' => $isTop,
            ];

            if ($rank === 1) {
                $defaultCategoryId = $catEntry['id'];
            }

            $finalCategories[] = $catEntry;
            $rank++;
        }

        $result = [
            'categories' => $finalCategories,
            'meta' => [
                'top_limit' => $topLimit,
                'sales_period_days' => $periodDays,
                'default_view' => $defaultView,
                'default_category_id' => $defaultCategoryId,
                'from_cache' => false,
            ],
        ];

        // Save to persistent file cache across requests
        @file_put_contents($cacheFile, json_encode([
            'expires_at' => $nowTime + $ttl,
            'cached_at' => $nowTime,
            'data' => $result,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return $result;
    }

    /**
     * Calculates category sales units for the given period (in Asia/Kolkata timezone).
     * Excludes cancelled and soft-deleted invoices, subtracts returned units.
     * Credits each product's sales to EVERY category mapped in product_categories.
     * Preserves exact decimal quantities (DECIMAL 15,3).
     *
     * @return list<array<string, mixed>>
     */
    public function categorySales(int $periodDays): array
    {
        $tz = new DateTimeZone('Asia/Kolkata');
        $now = new DateTimeImmutable('now', $tz);
        
        $startDate = $now->setTime(0, 0, 0)->modify("-{$periodDays} days");
        $endDate = $now->setTime(23, 59, 59);

        $startUtcStr = $startDate->format('Y-m-d H:i:s');
        $endUtcStr = $endDate->format('Y-m-d H:i:s');

        $sql = "
            SELECT 
                c.id,
                c.name,
                c.slug,
                c.description,
                c.image_path,
                c.thumb_path,
                c.sort_order,
                c.status,
                c.deleted_at,
                ROUND(GREATEST(0, COALESCE(sales.sold_qty, 0) - COALESCE(returns.returned_qty, 0)), 3) AS sales_units
            FROM categories c
            LEFT JOIN (
                SELECT 
                    pc.category_id,
                    SUM(ii.quantity) AS sold_qty
                FROM invoice_items ii
                JOIN invoices inv ON inv.id = ii.invoice_id
                JOIN product_categories pc ON pc.product_id = COALESCE(ii.product_id, (
                    SELECT pv.product_id FROM product_variants pv WHERE pv.id = ii.variant_id LIMIT 1
                ))
                WHERE inv.status != 'CANCELLED'
                  AND inv.deleted_at IS NULL
                  AND inv.created_at >= :start_date
                  AND inv.created_at <= :end_date
                GROUP BY pc.category_id
            ) sales ON sales.category_id = c.id
            LEFT JOIN (
                SELECT 
                    pc.category_id,
                    SUM(sri.qty) AS returned_qty
                FROM sale_return_items sri
                JOIN sale_returns sr ON sr.id = sri.return_id
                JOIN product_variants pv ON pv.id = sri.variant_id
                JOIN product_categories pc ON pc.product_id = pv.product_id
                WHERE sr.refund_status != 'REJECTED'
                  AND sr.created_at >= :ret_start_date
                  AND sr.created_at <= :ret_end_date
                GROUP BY pc.category_id
            ) returns ON returns.category_id = c.id
            WHERE c.deleted_at IS NULL
            ORDER BY 
                sales_units DESC,
                c.sort_order ASC,
                c.name ASC
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            'start_date' => $startUtcStr,
            'end_date' => $endUtcStr,
            'ret_start_date' => $startUtcStr,
            'ret_end_date' => $endUtcStr,
        ]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Gets a map of [variant_id => net_units] for all variants sold within periodDays.
     * Uses persistent file cache in storage/cache/variant_sales_{periodDays}.json.
     *
     * @return array<int, float> Map of variant_id => net_units (only positive net units)
     */
    public function getVariantSalesMap(
        ?int $periodDays = null,
        bool $bypassCache = false,
        ?int $overrideTtl = null
    ): array {
        $periodDays = $periodDays ?? $this->getSharedPeriodDays();
        $ttl = $overrideTtl ?? (int) $this->getSetting('pos_variant_cache_ttl', (string) self::DEFAULT_CACHE_TTL_SECONDS);

        $cacheDir = self::getCacheDir($this->getDbName());
        $cacheFile = $cacheDir . "/variant_sales_{$periodDays}.json";
        $nowTime = time();

        if (!$bypassCache && file_exists($cacheFile)) {
            $raw = @file_get_contents($cacheFile);
            if ($raw !== false) {
                $cached = @json_decode($raw, true);
                if (is_array($cached) && isset($cached['expires_at'], $cached['sales_map']) && $nowTime < $cached['expires_at']) {
                    return $cached['sales_map'];
                }
            }
        }

        $salesMap = $this->computeVariantSalesMap($periodDays);

        @file_put_contents($cacheFile, json_encode([
            'expires_at' => $nowTime + $ttl,
            'cached_at' => $nowTime,
            'period_days' => $periodDays,
            'sales_map' => $salesMap,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return $salesMap;
    }

    /**
     * Computes exact net sold units per variant for the given period.
     * Formula: quantity sold from ACTIVE, non-deleted invoices minus non-REJECTED sale returns.
     *
     * @return array<int, float>
     */
    public function computeVariantSalesMap(int $periodDays): array
    {
        $tz = new DateTimeZone('Asia/Kolkata');
        $now = new DateTimeImmutable('now', $tz);
        
        $startDate = $now->setTime(0, 0, 0)->modify("-{$periodDays} days");
        $endDate = $now->setTime(23, 59, 59);

        $startUtcStr = $startDate->format('Y-m-d H:i:s');
        $endUtcStr = $endDate->format('Y-m-d H:i:s');

        $sql = "
            SELECT 
                ii.variant_id,
                ROUND(GREATEST(0, COALESCE(SUM(ii.quantity), 0) - COALESCE(returns.ret_qty, 0)), 3) AS net_units
            FROM invoice_items ii
            JOIN invoices inv ON inv.id = ii.invoice_id
            LEFT JOIN (
                SELECT sri.variant_id, SUM(sri.qty) AS ret_qty
                FROM sale_return_items sri
                JOIN sale_returns sr ON sr.id = sri.return_id
                WHERE sr.refund_status != 'REJECTED'
                  AND sr.created_at >= :ret_start_date
                  AND sr.created_at <= :ret_end_date
                GROUP BY sri.variant_id
            ) returns ON returns.variant_id = ii.variant_id
            WHERE inv.status != 'CANCELLED'
              AND inv.deleted_at IS NULL
              AND inv.created_at >= :start_date
              AND inv.created_at <= :end_date
            GROUP BY ii.variant_id
            HAVING net_units > 0
        ";

        $stmt = $this->pdo->prepare($sql);
        $stmt->execute([
            'start_date' => $startUtcStr,
            'end_date' => $endUtcStr,
            'ret_start_date' => $startUtcStr,
            'ret_end_date' => $endUtcStr,
        ]);

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $map = [];
        foreach ($rows as $r) {
            $variantId = (int) $r['variant_id'];
            $units = (float) $r['net_units'];
            if ($units > 0) {
                $map[$variantId] = $units;
            }
        }

        return $map;
    }

    /**
     * Filters categories to only those that are active, non-deleted,
     * and contain at least 1 active, POS-enabled product.
     *
     * @param list<array<string, mixed>> $categories
     * @return list<array<string, mixed>>
     */
    private function filterPosEligibleCategories(array $categories): array
    {
        if (empty($categories)) {
            return [];
        }

        $sql = "
            SELECT DISTINCT pc.category_id
            FROM product_categories pc
            JOIN products p ON p.id = pc.product_id
            WHERE p.deleted_at IS NULL
              AND p.is_active = 1
              AND p.is_pos_enabled = 1
        ";
        $eligibleCatIds = $this->pdo->query($sql)->fetchAll(PDO::FETCH_COLUMN);
        $eligibleLookup = array_fill_keys(array_map('intval', $eligibleCatIds), true);

        $filtered = [];
        foreach ($categories as $cat) {
            $catId = (int) $cat['id'];
            if ($cat['status'] === 'ACTIVE' && $cat['deleted_at'] === null && isset($eligibleLookup[$catId])) {
                $filtered[] = $cat;
            }
        }

        return $filtered;
    }
}
