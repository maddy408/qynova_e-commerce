<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\HomeSectionService;
use PDO;
use RuntimeException;

final class HomeSectionController
{
    private readonly HomeSectionService $sections;

    public function __construct(private readonly PDO $pdo)
    {
        $this->sections = new HomeSectionService($pdo);
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        Response::json(['sections' => $this->sections->list()]);
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        try {
            $id = $this->sections->create(Request::json());
            Response::json(['id' => $id], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function update(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        try {
            $this->sections->update((int) $id, Request::json());
            Response::json(['updated' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function destroy(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        try {
            $this->sections->delete((int) $id);
            Response::json(['deleted' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 404);
        }
    }

    public function reorder(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        $ids = array_map('intval', (array) (Request::json()['ordered_ids'] ?? []));
        $this->sections->reorder($ids);
        Response::json(['updated' => true]);
    }
}
