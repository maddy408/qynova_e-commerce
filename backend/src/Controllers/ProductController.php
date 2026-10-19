<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\BroadcastService;
use App\Services\DeviceTokenService;
use App\Services\FcmSenderService;
use App\Services\NotificationService;
use App\Services\PriceDropNotificationService;
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

        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : '';
        $page = max(1, (int) ($_GET['page'] ?? 1));
        // Default kept generous (not the usual 20-50 list-page size): the
        // pre-existing Settings "prices" tab fetches this endpoint with no
        // page/limit at all and expects every variant back, so an
        // aggressive default would silently truncate it. The new Price
        // Adjustment pages pass an explicit, smaller limit.
        $limit = min(500, max(1, (int) ($_GET['limit'] ?? 500)));
        $offset = ($page - 1) * $limit;

        $where = ["v.deleted_at IS NULL", "p.deleted_at IS NULL"];
        $params = [];
        if ($search !== '') {
            $where[] = '(p.name LIKE :search1 OR v.sku LIKE :search2 OR v.barcode LIKE :search3)';
            $needle = '%' . $search . '%';
            $params['search1'] = $needle;
            $params['search2'] = $needle;
            $params['search3'] = $needle;
        }
        $whereSql = implode(' AND ', $where);

        $countStmt = $this->pdo->prepare(
            "SELECT COUNT(*) FROM product_variants v JOIN products p ON p.id = v.product_id WHERE {$whereSql}"
        );
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare(
            "SELECT v.id AS variant_id, v.product_id, v.sku, v.barcode, p.name AS product_name, u.name AS unit_name,
                    v.mrp, v.normal_price, v.retail_price, v.wholesale_price, v.customer_price,
                    (SELECT image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) AS primary_image
             FROM product_variants v
             JOIN products p ON p.id = v.product_id
             LEFT JOIN units u ON u.id = p.unit_id
             WHERE {$whereSql}
             ORDER BY p.name, v.sku
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue(":{$key}", $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        Response::json(['variants' => $stmt->fetchAll(), 'total' => $total, 'page' => $page, 'limit' => $limit]);
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

        $notifications = new NotificationService($this->pdo);
        $deviceTokens = new DeviceTokenService($this->pdo);
        $fcm = new FcmSenderService($deviceTokens);
        $broadcastService = new BroadcastService($this->pdo, $notifications, $deviceTokens, $fcm);
        $priceDropService = new PriceDropNotificationService($this->pdo, $broadcastService);

        foreach ($items as $item) {
            if (!isset($item['variant_id'])) {
                continue;
            }
            $vId = (int) $item['variant_id'];
            $newRetail = (float) ($item['retail_price'] ?? 0);

            // Fetch current retail price to detect drops
            $oldRetail = null;
            try {
                $cur = $this->pdo->prepare("SELECT retail_price FROM product_variants WHERE id = :id");
                $cur->execute(['id' => $vId]);
                $r = $cur->fetchColumn();
                if ($r !== false) {
                    $oldRetail = (float) $r;
                }
            } catch (\Throwable $e) {}

            $stmt->execute([
                'id' => $vId,
                'retail_price' => $newRetail,
                'wholesale_price' => isset($item['wholesale_price']) && $item['wholesale_price'] !== '' && $item['wholesale_price'] !== null ? (float) $item['wholesale_price'] : null,
                'customer_price' => isset($item['customer_price']) && $item['customer_price'] !== '' && $item['customer_price'] !== null ? (float) $item['customer_price'] : null,
            ]);

            // If retail price dropped, trigger automated push notification (subject to threshold & daily limit)
            if ($oldRetail !== null && $newRetail < $oldRetail) {
                try {
                    $priceDropService->handlePriceDrop(
                        variantId: $vId,
                        oldPrice: $oldRetail,
                        newPrice: $newRetail,
                        changedByUserId: (int) ($claims['sub'] ?? 1),
                    );
                } catch (\Throwable $ne) {
                    error_log('updatePriceSettings: price drop notification failed: ' . $ne->getMessage());
                }
            }
        }

        Response::json(['updated' => true]);
    }

    /**
     * PUT /api/products/variants/{id}/price — single-tier, single-row price
     * edit backing the 3 Price Adjustment pages (RowEditable: one save =
     * one row, one field). Unlike updatePriceSettings() above, this logs
     * every change to price_history (G12) so price edits are auditable,
     * and validates the new value instead of letting a bad request hit
     * the DB's CHECK constraint as an ugly 500.
     */
    public function updateVariantPrice(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $variantId = (int) $id;
        $body = Request::json();
        $priceType = (string) ($body['price_type'] ?? '');
        $column = match ($priceType) {
            'RETAIL' => 'retail_price',
            'WHOLESALE' => 'wholesale_price',
            'CUSTOMER' => 'customer_price',
            default => null,
        };

        if ($column === null) {
            Response::error('price_type must be one of RETAIL, WHOLESALE, or CUSTOMER', 422);
        }

        $rawValue = $body['value'] ?? null;
        if ($rawValue === null || $rawValue === '' || !is_numeric($rawValue)) {
            Response::error('A numeric price value is required', 422);
        }

        $newValue = round((float) $rawValue, 2);
        if ($newValue < 0) {
            Response::error('Price cannot be negative', 422);
        }

        $this->pdo->beginTransaction();
        try {
            $current = $this->pdo->prepare(
                "SELECT {$column} AS old_value FROM product_variants WHERE id = :id AND deleted_at IS NULL FOR UPDATE"
            );
            $current->execute(['id' => $variantId]);
            $row = $current->fetch();

            if ($row === false) {
                throw new RuntimeException('Variant not found');
            }

            $oldValue = $row['old_value'];

            // RETAIL is the only tier stored NOT NULL (schema default from
            // creation); WHOLESALE/CUSTOMER stay nullable so "not set" is
            // distinguishable from "deliberately zero".
            $updateStmt = $this->pdo->prepare(
                "UPDATE product_variants SET {$column} = :value WHERE id = :id"
            );
            $updateStmt->execute(['value' => $newValue, 'id' => $variantId]);

            $this->pdo->prepare(
                'INSERT INTO price_history (variant_id, customer_id, price_type, old_price, new_price, changed_by, changed_at)
                 VALUES (:variant_id, NULL, :price_type, :old_price, :new_price, :changed_by, NOW())'
            )->execute([
                'variant_id' => $variantId,
                'price_type' => $priceType,
                'old_price' => $oldValue,
                'new_price' => $newValue,
                'changed_by' => (int) $claims['sub'],
            ]);

            $this->pdo->commit();

            // Automated price drop push notification via Firebase and Redis queue
            $priceDropDispatched = false;
            $priceDropReason = null;
            if ($priceType === 'RETAIL' && $oldValue !== null && $newValue < (float) $oldValue) {
                try {
                    $notifications = new NotificationService($this->pdo);
                    $deviceTokens = new DeviceTokenService($this->pdo);
                    $fcm = new FcmSenderService($deviceTokens);
                    $broadcastService = new BroadcastService($this->pdo, $notifications, $deviceTokens, $fcm);
                    $priceDropService = new PriceDropNotificationService($this->pdo, $broadcastService);

                    $pdRes = $priceDropService->handlePriceDrop(
                        variantId: $variantId,
                        oldPrice: (float) $oldValue,
                        newPrice: $newValue,
                        changedByUserId: (int) $claims['sub'],
                    );
                    $priceDropDispatched = $pdRes['triggered'];
                    $priceDropReason = $pdRes['reason'];
                } catch (\Throwable $ne) {
                    error_log('ProductController updateVariantPrice: price drop notification error: ' . $ne->getMessage());
                }
            }

            Response::json([
                'variant_id' => $variantId,
                'price_type' => $priceType,
                'old_price' => $oldValue,
                'new_price' => (string) $newValue,
                'price_drop_notification' => [
                    'dispatched' => $priceDropDispatched,
                    'reason' => $priceDropReason,
                ],
            ]);
        } catch (RuntimeException $e) {
            $this->pdo->rollBack();
            Response::error($e->getMessage(), 404);
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
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
