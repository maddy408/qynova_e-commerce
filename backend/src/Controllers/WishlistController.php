<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JwtHelper;
use App\Helpers\Request;
use App\Helpers\Response;
use PDO;

final class WishlistController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** Resolve identity: logged-in customer_id or guest session_id */
    private function resolveIdentity(): array
    {
        $customerId = null;
        $token = Request::bearerToken();
        if ($token !== null) {
            try {
                $claims = JwtHelper::verify($token);
                if (($claims['type'] ?? '') === 'customer') {
                    $customerId = (int) $claims['sub'];
                }
            } catch (\Throwable) {
                // Ignore expired or invalid token
            }
        }

        $sessionId = null;
        if ($customerId === null) {
            $sessionId = $_SERVER['HTTP_X_SESSION_ID'] ?? ($_GET['session_id'] ?? null);
            if ($sessionId !== null) {
                $sessionId = substr(trim((string) $sessionId), 0, 64);
            }
        }

        return [$customerId, $sessionId];
    }

    /** GET /api/wishlist - Load customer or guest wishlist */
    public function index(): void
    {
        [$customerId, $sessionId] = $this->resolveIdentity();

        if ($customerId === null && ($sessionId === null || $sessionId === '')) {
            Response::json(['items' => [], 'product_ids' => []]);
            return;
        }

        $where = $customerId !== null ? 'w.customer_id = :id' : 'w.session_id = :id';
        $id = $customerId !== null ? $customerId : $sessionId;

        $stmt = $this->pdo->prepare(
            "SELECT w.id AS wishlist_id, w.product_id, w.created_at,
                    p.name, p.slug, p.product_code, p.is_active, p.is_ecommerce_enabled,
                    b.name AS brand_name,
                    (SELECT image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) AS primary_image,
                    (SELECT MIN(retail_price) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL) AS min_price,
                    (SELECT MAX(retail_price) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL) AS max_price,
                    (SELECT mrp FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL ORDER BY is_default DESC, id ASC LIMIT 1) AS mrp
             FROM wishlist w
             JOIN products p ON p.id = w.product_id
             LEFT JOIN brands b ON b.id = p.brand_id
             WHERE {$where} AND p.deleted_at IS NULL
             ORDER BY w.created_at DESC"
        );
        $stmt->execute(['id' => $id]);
        $items = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $productIds = array_map(fn($item) => (int) $item['product_id'], $items);

        Response::json([
            'items' => $items,
            'product_ids' => $productIds,
        ]);
    }

    /** POST /api/wishlist - Add product to wishlist */
    public function store(): void
    {
        [$customerId, $sessionId] = $this->resolveIdentity();
        $body = Request::json();
        $productId = (int) ($body['product_id'] ?? 0);

        if ($productId <= 0) {
            Response::error('product_id is required', 422);
            return;
        }

        if ($customerId === null && ($sessionId === null || $sessionId === '')) {
            // Generate a session id if none provided
            $sessionId = bin2hex(random_bytes(16));
        }

        if ($customerId !== null) {
            $stmt = $this->pdo->prepare(
                "INSERT INTO wishlist (customer_id, product_id)
                 VALUES (:customer_id, :product_id)
                 ON DUPLICATE KEY UPDATE updated_at = NOW()"
            );
            $stmt->execute(['customer_id' => $customerId, 'product_id' => $productId]);
        } else {
            $stmt = $this->pdo->prepare(
                "INSERT INTO wishlist (session_id, product_id)
                 VALUES (:session_id, :product_id)
                 ON DUPLICATE KEY UPDATE updated_at = NOW()"
            );
            $stmt->execute(['session_id' => $sessionId, 'product_id' => $productId]);
        }

        Response::json([
            'success' => true,
            'session_id' => $sessionId,
            'message' => 'Product saved to wishlist',
        ], 201);
    }

    /** DELETE /api/wishlist/{productId} - Remove product from wishlist */
    public function destroy(string $productId): void
    {
        [$customerId, $sessionId] = $this->resolveIdentity();
        $prodId = (int) $productId;

        if ($customerId !== null) {
            $stmt = $this->pdo->prepare("DELETE FROM wishlist WHERE customer_id = :id AND product_id = :product_id");
            $stmt->execute(['id' => $customerId, 'product_id' => $prodId]);
        } elseif ($sessionId !== null && $sessionId !== '') {
            $stmt = $this->pdo->prepare("DELETE FROM wishlist WHERE session_id = :id AND product_id = :product_id");
            $stmt->execute(['id' => $sessionId, 'product_id' => $prodId]);
        }

        Response::json(['success' => true, 'message' => 'Product removed from wishlist']);
    }

    /** POST /api/wishlist/merge - Merge session wishlist into customer account */
    public function merge(): void
    {
        [$customerId, $sessionId] = $this->resolveIdentity();
        $body = Request::json();
        $incomingSession = $body['session_id'] ?? $sessionId;

        if ($customerId !== null && !empty($incomingSession)) {
            $stmt = $this->pdo->prepare(
                "INSERT IGNORE INTO wishlist (customer_id, product_id)
                 SELECT :customer_id, product_id FROM wishlist WHERE session_id = :session_id"
            );
            $stmt->execute(['customer_id' => $customerId, 'session_id' => $incomingSession]);

            // Clean up session rows
            $this->pdo->prepare("DELETE FROM wishlist WHERE session_id = :session_id")
                ->execute(['session_id' => $incomingSession]);
        }

        Response::json(['success' => true]);
    }
}
