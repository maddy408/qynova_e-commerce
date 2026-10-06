<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\BannerService;
use App\Services\ImageUploadService;
use PDO;
use RuntimeException;

final class BannerController
{
    private readonly BannerService $banners;

    public function __construct(private readonly PDO $pdo)
    {
        $this->banners = new BannerService($pdo, new ImageUploadService());
    }

    /** Public — storefront home/category pages render banners by position. */
    public function index(): void
    {
        Response::json(['banners' => $this->banners->list($_GET['position'] ?? null)]);
    }

    /** Public, same reasoning as index(). */
    public function show(string $id): void
    {
        $banner = $this->banners->find((int) $id);
        if ($banner === null) {
            Response::error('Banner not found', 404);
        }

        Response::json(['banner' => $banner]);
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        try {
            $id = $this->banners->create(Request::json());
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
            $this->banners->update((int) $id, Request::json());
            Response::json(['updated' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function uploadDesktopImage(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        if (!isset($_FILES['file'])) {
            Response::error('A file upload named "file" is required', 422);
        }

        try {
            $path = $this->banners->uploadDesktopImage((int) $id, $_FILES['file']);
            Response::json(['image_desktop_path' => $path]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function uploadMobileImage(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        if (!isset($_FILES['file'])) {
            Response::error('A file upload named "file" is required', 422);
        }

        try {
            $path = $this->banners->uploadMobileImage((int) $id, $_FILES['file']);
            Response::json(['image_mobile_path' => $path]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function destroy(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        try {
            $this->banners->delete((int) $id);
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
        $this->banners->reorder($ids);
        Response::json(['updated' => true]);
    }

    public function addItem(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        $data = Request::json();

        try {
            $itemId = $this->banners->addItem((int) $id, (int) ($data['product_id'] ?? 0), $data['offer_text'] ?? null);
            Response::json(['id' => $itemId], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function removeItem(string $id, string $itemId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'banners.manage');

        try {
            $this->banners->removeItem((int) $id, (int) $itemId);
            Response::json(['deleted' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 404);
        }
    }
}
