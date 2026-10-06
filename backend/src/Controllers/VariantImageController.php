<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\ImageUploadService;
use App\Services\VariantImageService;
use PDO;
use RuntimeException;

final class VariantImageController
{
    private readonly VariantImageService $images;

    public function __construct(private readonly PDO $pdo)
    {
        $this->images = new VariantImageService($pdo, new ImageUploadService());
    }

    public function store(string $variantId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        if (!isset($_FILES['file'])) {
            Response::error('A file upload named "file" is required', 422);
        }

        try {
            $id = $this->images->upload((int) $variantId, $_FILES['file'], ($_POST['is_primary'] ?? '') === '1');
            Response::json(['id' => $id], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function setPrimary(string $variantId, string $imageId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        try {
            $this->images->setPrimary((int) $variantId, (int) $imageId);
            Response::json(['updated' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 404);
        }
    }

    public function reorder(string $variantId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $ids = array_map('intval', (array) (Request::json()['ordered_ids'] ?? []));
        $this->images->reorder((int) $variantId, $ids);
        Response::json(['updated' => true]);
    }

    public function destroy(string $variantId, string $imageId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        try {
            $this->images->delete((int) $variantId, (int) $imageId);
            Response::json(['deleted' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 404);
        }
    }
}
