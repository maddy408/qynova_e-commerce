<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\ProductService;
use App\Services\ProductSpecificationService;
use PDO;
use PDOException;
use RuntimeException;

final class ProductController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    private function isStaff(): bool
    {
        $token = Request::bearerToken();
        if ($token === null) {
            return false;
        }
        try {
            $claims = \App\Helpers\JwtHelper::verify($token);
            return isset($claims['role']) && !empty($claims['role']);
        } catch (\Throwable) {
            return false;
        }
    }

    public function index(): void
    {
        $filters = $_GET;
        $isStaff = $this->isStaff();
        if (!$isStaff) {
            $filters['channel'] = 'ecommerce';
            $filters['is_active'] = 1;
        }
        Response::json((new ProductService($this->pdo))->list($filters));
    }

    public function show(string $id): void
    {
        $isStaff = $this->isStaff();
        $product = (new ProductService($this->pdo))->find($id, $isStaff);

        if ($product === null) {
            Response::error('Product not found', 404);
        }

        if (!$isStaff && (empty($product['is_active']) || empty($product['is_ecommerce_enabled']))) {
            Response::error('Product not found', 404);
        }

        Response::json(['product' => $product]);
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        try {
            $id = (new ProductService($this->pdo))->create(Request::json());
            Response::json(['id' => $id], 201);
        } catch (PDOException $e) {
            // PDOException extends RuntimeException (PHP 8+) — this catch
            // must come first, or the block below silently swallows it
            // with the wrong status code and the raw SQL message.
            if ((int) $e->getCode() === 23000) {
                Response::error('A product with this code, slug, or SKU already exists', 409);
            }
            throw $e;
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function update(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        try {
            (new ProductService($this->pdo))->update((int) $id, Request::json());
            Response::json(['updated' => true]);
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                Response::error('A product with this code, slug, or SKU already exists', 409);
            }
            throw $e;
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function destroy(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        (new ProductService($this->pdo))->softDelete((int) $id);
        Response::json(['deleted' => true]);
    }

    public function updateSpecifications(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $body = Request::json();

        try {
            (new ProductSpecificationService($this->pdo))->replaceAll((int) $id, (array) ($body['specifications'] ?? []));
            Response::json(['specifications' => (new ProductSpecificationService($this->pdo))->list((int) $id)]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function getPriceSettings(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $stmt = $this->pdo->query(
            "SELECT v.id AS variant_id, v.product_id, v.sku, v.barcode, p.name AS product_name, u.name AS unit_name,
                    v.mrp, v.retail_price, v.wholesale_price, v.customer_price,
                    (SELECT image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) AS primary_image
             FROM product_variants v
             JOIN products p ON p.id = v.product_id
             LEFT JOIN units u ON u.id = p.unit_id
             WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL
             ORDER BY p.name, v.sku"
        );

        Response::json(['variants' => $stmt->fetchAll()]);
    }

    public function updatePriceSettings(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $body = Request::json();
        $items = (array) ($body['items'] ?? []);

        $stmt = $this->pdo->prepare(
            "UPDATE product_variants SET
             retail_price = :retail_price,
             wholesale_price = :wholesale_price,
             customer_price = :customer_price
             WHERE id = :id"
        );

        foreach ($items as $item) {
            if (!isset($item['variant_id'])) {
                continue;
            }
            $stmt->execute([
                'id' => (int) $item['variant_id'],
                'retail_price' => (float) ($item['retail_price'] ?? 0),
                'wholesale_price' => isset($item['wholesale_price']) && $item['wholesale_price'] !== '' && $item['wholesale_price'] !== null ? (float) $item['wholesale_price'] : null,
                'customer_price' => isset($item['customer_price']) && $item['customer_price'] !== '' && $item['customer_price'] !== null ? (float) $item['customer_price'] : null,
            ]);
        }

        Response::json(['updated' => true]);
    }

    /**
     * Track product view event in customer activity logs and increment view_count (Task T16)
     */
    public function recordView(string $id): void
    {
        $productId = (int) $id;
        if ($productId <= 0) {
            Response::error('Invalid product ID', 400);
        }

        $customerId = null;
        $token = Request::bearerToken();
        if ($token !== null) {
            try {
                $claims = \App\Helpers\JwtHelper::verify($token);
                if (isset($claims['type']) && $claims['type'] === 'customer') {
                    $customerId = (int) $claims['sub'];
                }
            } catch (\Throwable) {
                // Ignore token errors for public view tracking
            }
        }

        $body = Request::json();
        $sessionId = isset($body['session_id']) ? trim((string) $body['session_id']) : null;
        $ip = $_SERVER['REMOTE_ADDR'] ?? null;
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? null;

        try {
            $activityService = new \App\Services\CustomerActivityService($this->pdo);
            $newCount = $activityService->recordProductView($productId, $customerId, $sessionId, $ip, $ua);
            Response::json(['status' => 'success', 'product_id' => $productId, 'view_count' => $newCount]);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 404);
        }
    }

    /**
     * Retrieve recently viewed products for customer, session, or specified product IDs (Task T16)
     */
    public function recentlyViewed(): void
    {
        $customerId = null;
        $token = Request::bearerToken();
        if ($token !== null) {
            try {
                $claims = \App\Helpers\JwtHelper::verify($token);
                if (isset($claims['type']) && $claims['type'] === 'customer') {
                    $customerId = (int) $claims['sub'];
                }
            } catch (\Throwable) {
            }
        }

        $sessionId = isset($_GET['session_id']) ? trim((string) $_GET['session_id']) : null;
        $idsParam = isset($_GET['ids']) ? trim((string) $_GET['ids']) : '';
        $productIds = [];
        if ($idsParam !== '') {
            $productIds = array_map('intval', explode(',', $idsParam));
        }

        $limit = isset($_GET['limit']) ? max(1, min(50, (int) $_GET['limit'])) : 10;

        $activityService = new \App\Services\CustomerActivityService($this->pdo);
        $items = $activityService->getRecentlyViewed($customerId, $sessionId, $productIds, $limit);

        Response::json(['items' => $items, 'total' => count($items)]);
    }
}
