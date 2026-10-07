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
}
