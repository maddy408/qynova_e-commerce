<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\ImageUploadService;
use App\Services\ProductImageService;
use PDO;
use RuntimeException;

final class ProductImageController
{
    private readonly ProductImageService $images;

    public function __construct(private readonly PDO $pdo)
    {
        $this->images = new ProductImageService($pdo, new ImageUploadService());
    }

    public function store(string $productId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        if (!isset($_FILES['file'])) {
            Response::error('A file upload named "file" is required', 422);
        }

        try {
            $id = $this->images->upload((int) $productId, $_FILES['file'], ($_POST['is_primary'] ?? '') === '1');
            Response::json(['id' => $id], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function setPrimary(string $productId, string $imageId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        try {
            $this->images->setPrimary((int) $productId, (int) $imageId);
            Response::json(['updated' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 404);
        }
    }

    public function reorder(string $productId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $ids = array_map('intval', (array) (Request::json()['ordered_ids'] ?? []));
        $this->images->reorder((int) $productId, $ids);
        Response::json(['updated' => true]);
    }

    public function destroy(string $productId, string $imageId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        try {
            $this->images->delete((int) $productId, (int) $imageId);
            Response::json(['deleted' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 404);
        }
    }
}
