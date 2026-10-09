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

    /** Public — the storefront needs this for category navigation too. */
    public function index(): void
    {
        $status = $_GET['status'] ?? null;
        if (!$this->isStaff()) {
            $status = 'ACTIVE';
        } elseif ($status === null && Request::bearerToken() === null) {
            $status = 'ACTIVE';
        }
        Response::json(['categories' => $this->categories->list($status)]);
    }

    public function show(string $id): void
    {
        $category = $this->categories->find((int) $id);

        if ($category === null || (!$this->isStaff() && ($category['status'] !== 'ACTIVE' || !empty($category['deleted_at'])))) {
            Response::error('Category not found', 404);
        }

        Response::json(['category' => $category]);
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

    public function destroy(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $this->categories->delete((int) $id);
        Response::json(['deleted' => true]);
    }

    public function uploadImage(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        if (!isset($_FILES['file'])) {
            Response::error('A file upload named "file" is required', 422);
        }

        try {
            $path = $this->categories->setImage((int) $id, $_FILES['file']);
            Response::json(['image_path' => $path]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function removeImage(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        try {
            $this->categories->removeImage((int) $id);
            Response::json(['updated' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 404);
        }
    }
}
