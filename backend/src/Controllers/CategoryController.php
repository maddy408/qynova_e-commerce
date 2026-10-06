<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\CategoryService;
use PDO;
use PDOException;
use RuntimeException;

final class CategoryController
{
    private readonly CategoryService $categories;

    public function __construct(private readonly PDO $pdo)
    {
        $this->categories = new CategoryService($pdo);
    }

    /** Public — the storefront needs this for category navigation too. */
    public function index(): void
    {
        Response::json(['categories' => $this->categories->list()]);
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        try {
            $id = $this->categories->create(Request::json());
            Response::json(['id' => $id], 201);
        } catch (PDOException $e) {
            // PDOException extends RuntimeException (PHP 8+) — this catch
            // must come first, or the block below silently swallows it
            // with the wrong status code and the raw SQL message.
            if ((int) $e->getCode() === 23000) {
                Response::error('A category with this name already exists', 409);
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
            $this->categories->update((int) $id, Request::json());
            Response::json(['updated' => true]);
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                Response::error('A category with this name already exists', 409);
            }
            throw $e;
        }
    }
}
