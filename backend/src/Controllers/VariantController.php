<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\VariantService;
use PDO;
use RuntimeException;

final class VariantController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function indexAttributes(): void
    {
        Response::json(['attributes' => (new VariantService($this->pdo))->listAttributes()]);
    }

    public function storeAttribute(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $body = Request::json();
        $name = trim((string) ($body['name'] ?? ''));

        if ($name === '') {
            Response::error('name is required', 422);
        }

        $id = (new VariantService($this->pdo))->createAttribute($name);
        Response::json(['id' => $id], 201);
    }

    public function storeAttributeValue(string $attributeId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $body = Request::json();
        $value = trim((string) ($body['value'] ?? ''));

        if ($value === '') {
            Response::error('value is required', 422);
        }

        $id = (new VariantService($this->pdo))->createAttributeValue((int) $attributeId, $value, $body['color_hex'] ?? null);
        Response::json(['id' => $id], 201);
    }

    public function store(string $productId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $body = Request::json();
        $attributeValueIds = array_map('intval', (array) ($body['attribute_value_ids'] ?? []));

        try {
            $id = (new VariantService($this->pdo))->createVariant((int) $productId, $body, $attributeValueIds);
            Response::json(['id' => $id], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function update(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        (new VariantService($this->pdo))->updateVariant((int) $id, Request::json());
        Response::json(['updated' => true]);
    }

    /** POS scan lookup: barcode -> SKU -> product name (docs section 12). */
    public function lookup(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.sell');

        $code = (string) ($_GET['code'] ?? '');

        if ($code === '') {
            Response::error('code is required', 422);
        }

        $result = (new VariantService($this->pdo))->lookup($code);

        if ($result === null) {
            Response::error('Product not found', 404);
        }

        Response::json(['variant' => $result]);
    }
}
