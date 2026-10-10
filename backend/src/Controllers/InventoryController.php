<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\InventoryService;
use PDO;
use RuntimeException;

final class InventoryController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function show(string $variantId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.view');

        $stock = (new InventoryService($this->pdo))->getStock((int) $variantId);

        if ($stock === null) {
            Response::error('No inventory record for this variant', 404);
        }

        Response::json(['inventory' => $stock]);
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.view');

        $search = isset($_GET['search']) ? (string) $_GET['search'] : null;
        $page = (int) ($_GET['page'] ?? 1);
        $limit = (int) ($_GET['limit'] ?? 50);
        $sort = isset($_GET['sort']) ? (string) $_GET['sort'] : 'name';

        Response::json((new InventoryService($this->pdo))->listAllStock($search, $page, $limit, posOnly: false, categoryId: null, sort: $sort));
    }

    /**
     * Product grid for POS billing — same data shape as index() but
     * gated by `pos.sell` instead of `inventory.view`, since a cashier
     * can sell without being able to see the full inventory/stock-
     * adjustment screens.
     */
    public function posIndex(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.sell');

        $search = isset($_GET['search']) ? (string) $_GET['search'] : null;
        $page = (int) ($_GET['page'] ?? 1);
        $limit = (int) ($_GET['limit'] ?? 50);
        $categoryId = (isset($_GET['category_id']) && is_numeric($_GET['category_id'])) ? (int) $_GET['category_id'] : null;
        $sort = isset($_GET['sort']) ? (string) $_GET['sort'] : 'sales';

        Response::json((new InventoryService($this->pdo))->listAllStock($search, $page, $limit, posOnly: true, categoryId: $categoryId, sort: $sort));
    }

    public function lowStock(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.view');

        Response::json(['items' => (new InventoryService($this->pdo))->lowStock()]);
    }

    public function setLowStockThreshold(string $variantId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.adjust');

        $threshold = Request::json()['low_stock_threshold'] ?? null;

        if (!is_numeric($threshold)) {
            Response::error('low_stock_threshold must be a number', 422);
        }

        try {
            (new InventoryService($this->pdo))->setLowStockThreshold((int) $variantId, (string) $threshold);
            Response::json(['updated' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 404);
        }
    }

    public function indexAdjustments(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.view');

        Response::json(['adjustments' => (new InventoryService($this->pdo))->listAdjustments()]);
    }

    public function storeAdjustment(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.adjust');

        $body = Request::json();
        $reason = trim((string) ($body['reason'] ?? ''));
        $items = (array) ($body['items'] ?? []);

        if ($reason === '' || $items === []) {
            Response::error('reason and at least one item are required', 422);
        }

        try {
            $id = (new InventoryService($this->pdo))->createAdjustment($items, $reason, (int) $claims['sub']);
            Response::json(['adjustment_id' => $id], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function saveOpeningStock(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.adjust');

        $body = Request::json();
        $items = (array) ($body['items'] ?? []);

        if ($items === []) {
            Response::error('items list is required', 422);
        }

        try {
            (new InventoryService($this->pdo))->saveOpeningStock($items, (int) $claims['sub']);
            Response::json(['updated' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
