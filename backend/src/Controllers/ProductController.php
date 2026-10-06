<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\ProductService;
use PDO;
use RuntimeException;

final class ProductController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function index(): void
    {
        $filters = $_GET;
        Response::json((new ProductService($this->pdo))->list($filters));
    }

    public function show(string $id): void
    {
        $product = (new ProductService($this->pdo))->find((int) $id);

        if ($product === null) {
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
}
