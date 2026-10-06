<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\SubcategoryService;
use PDO;
use PDOException;
use RuntimeException;

final class SubcategoryController
{
    private readonly SubcategoryService $subcategories;

    public function __construct(private readonly PDO $pdo)
    {
        $this->subcategories = new SubcategoryService($pdo);
    }

    /** Public — the storefront needs this for category/subcategory navigation too. */
    public function index(): void
    {
        Response::json(['subcategories' => $this->subcategories->list()]);
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $body = Request::json();
        $categoryIds = array_map('intval', (array) ($body['category_ids'] ?? []));

        try {
            $id = $this->subcategories->create($body, $categoryIds);
            Response::json(['id' => $id], 201);
        } catch (PDOException $e) {
            // PDOException extends RuntimeException (PHP 8+) — must be
            // caught before the RuntimeException block below, else that
            // block silently swallows it with the wrong status/message.
            if ((int) $e->getCode() === 23000) {
                Response::error('A subcategory with this name already exists', 409);
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

        $body = Request::json();
        $categoryIds = array_key_exists('category_ids', $body) ? array_map('intval', (array) $body['category_ids']) : null;

        try {
            $this->subcategories->update((int) $id, $body, $categoryIds);
            Response::json(['updated' => true]);
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                Response::error('A subcategory with this name already exists', 409);
            }
            throw $e;
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
