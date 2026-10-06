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

    public function lowStock(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.view');

        Response::json(['items' => (new InventoryService($this->pdo))->lowStock()]);
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
}
