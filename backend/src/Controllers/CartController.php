<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\CartService;
use PDO;
use RuntimeException;

final class CartController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function show(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);

        Response::json((new CartService($this->pdo))->getCart((int) $claims['sub']));
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);

        $body = Request::json();

        try {
            (new CartService($this->pdo))->addItem((int) $claims['sub'], (int) ($body['variant_id'] ?? 0), (int) ($body['quantity'] ?? 1));
            Response::json((new CartService($this->pdo))->getCart((int) $claims['sub']), 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function update(string $cartItemId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);

        $body = Request::json();

        try {
            (new CartService($this->pdo))->updateItemQuantity((int) $claims['sub'], (int) $cartItemId, (int) ($body['quantity'] ?? 1));
            Response::json((new CartService($this->pdo))->getCart((int) $claims['sub']));
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function destroy(string $cartItemId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);

        (new CartService($this->pdo))->removeItem((int) $claims['sub'], (int) $cartItemId);
        Response::json((new CartService($this->pdo))->getCart((int) $claims['sub']));
    }
}
