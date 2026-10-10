<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

final class CustomerActivityService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Record a customer activity event (product view)
     * and increment product_stats.view_count (Task T16).
     */
    public function recordProductView(
        int $productId,
        ?int $customerId = null,
        ?string $sessionId = null,
        ?string $ipAddress = null,
        ?string $userAgent = null
    ): int {
        // 1. Verify product exists
        $stmt = $this->pdo->prepare("SELECT id FROM products WHERE id = :id AND deleted_at IS NULL");
        $stmt->execute(['id' => $productId]);
        if (!$stmt->fetch()) {
            throw new RuntimeException("Product not found");
        }

        // 2. Insert into customer_activity_logs
        $logStmt = $this->pdo->prepare(
            "INSERT INTO customer_activity_logs (
                customer_id, session_id, activity_type, product_id, ip_address, user_agent, created_at
            ) VALUES (
                :customer_id, :session_id, 'PRODUCT_VIEW', :product_id, :ip_address, :user_agent, NOW()
            )"
        );
        $logStmt->execute([
            'customer_id' => $customerId,
            'session_id' => $sessionId,
            'product_id' => $productId,
            'ip_address' => $ipAddress ? substr($ipAddress, 0, 45) : null,
            'user_agent' => $userAgent ? substr($userAgent, 0, 255) : null,
        ]);

        // 3. Upsert into product_stats
        $statsStmt = $this->pdo->prepare(
            "INSERT INTO product_stats (product_id, units_sold_30d, orders_30d, wishlist_count, view_count, updated_at)
             VALUES (:product_id, 0, 0, 0, 1, NOW())
             ON DUPLICATE KEY UPDATE view_count = view_count + 1, updated_at = NOW()"
        );
        $statsStmt->execute(['product_id' => $productId]);

        // 4. Return current view count
        $countStmt = $this->pdo->prepare("SELECT view_count FROM product_stats WHERE product_id = :id");
        $countStmt->execute(['id' => $productId]);
        return (int) ($countStmt->fetchColumn() ?: 1);
    }

    /**
     * Get recently viewed products for a customer / session or by product IDs (Task T16).
     *
     * @param int|null $customerId
     * @param string|null $sessionId
     * @param list<int> $productIds
     * @param int $limit
     * @return array
     */
    public function getRecentlyViewed(
        ?int $customerId = null,
        ?string $sessionId = null,
        array $productIds = [],
        int $limit = 10
    ): array {
        $resolvedIds = [];

        if (!empty($productIds)) {
            $resolvedIds = array_values(array_filter(array_map('intval', $productIds), fn ($id) => $id > 0));
        }

        if (empty($resolvedIds) && ($customerId !== null || !empty($sessionId))) {
            $sql = "SELECT product_id, MAX(created_at) as last_viewed
                    FROM customer_activity_logs
                    WHERE activity_type = 'PRODUCT_VIEW' ";
            $params = [];
            if ($customerId !== null && !empty($sessionId)) {
                $sql .= "AND (customer_id = :cid OR session_id = :sid) ";
                $params['cid'] = $customerId;
                $params['sid'] = $sessionId;
            } elseif ($customerId !== null) {
                $sql .= "AND customer_id = :cid ";
                $params['cid'] = $customerId;
            } else {
                $sql .= "AND session_id = :sid ";
                $params['sid'] = $sessionId;
            }
            $sql .= "GROUP BY product_id ORDER BY last_viewed DESC LIMIT :lim";
            $stmt = $this->pdo->prepare($sql);
            foreach ($params as $k => $v) {
                $stmt->bindValue($k, $v);
            }
            $stmt->bindValue('lim', $limit, PDO::PARAM_INT);
            $stmt->execute();
            $resolvedIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
        }

        if (empty($resolvedIds)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($resolvedIds), '?'));
        $stmt = $this->pdo->prepare(
            "SELECT p.id, p.name, p.slug, p.product_code, p.is_active, p.is_pos_enabled, p.is_ecommerce_enabled,
                    p.is_featured, p.is_trending, p.is_deal, p.show_discount, p.short_description,
                    b.name AS brand_name,
                    (SELECT image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) AS primary_image,
                    (SELECT MIN(retail_price) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL AND v.status = 'ACTIVE') AS min_price,
                    (SELECT MAX(retail_price) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL AND v.status = 'ACTIVE') AS max_price,
                    (SELECT mrp FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL AND v.status = 'ACTIVE' ORDER BY is_default DESC, id ASC LIMIT 1) AS mrp,
                    (SELECT ps.view_count FROM product_stats ps WHERE ps.product_id = p.id) AS view_count,
                    (SELECT ps.units_sold_30d FROM product_stats ps WHERE ps.product_id = p.id) AS units_sold
             FROM products p
             LEFT JOIN brands b ON b.id = p.brand_id AND b.deleted_at IS NULL
             WHERE p.id IN ($placeholders) AND p.deleted_at IS NULL AND p.is_active = 1
             ORDER BY FIELD(p.id, $placeholders)"
        );

        $bindings = array_merge($resolvedIds, $resolvedIds);
        $stmt->execute($bindings);
        return $stmt->fetchAll();
    }
}
