<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\ProductImportBatchService;
use App\Services\SafeZipExtractor;
use PDO;
use RuntimeException;

/** Product import history: /api/product-imports ... */
final class ProductImportBatchController
{
    private readonly ProductImportBatchService $batches;

    public function __construct(private readonly PDO $pdo)
    {
        $this->batches = new ProductImportBatchService($pdo);
    }

    public function index(): void
    {
        $this->authorize();
        Response::json(['data' => $this->batches->list((int) (Request::query('limit') ?? 50))]);
    }

    public function show(string $id): void
    {
        $this->authorize();
        $this->run(fn () => $this->batches->get((int) $id), 404);
    }

    /** PATCH {name?, note?} */
    public function update(string $id): void
    {
        $this->authorize();
        $body = Request::json();
        $this->run(function () use ($id, $body) {
            $this->batches->update(
                (int) $id,
                array_key_exists('name', $body) ? (string) $body['name'] : null,
                array_key_exists('note', $body) ? (string) ($body['note'] ?? '') : null,
            );

            return $this->batches->get((int) $id);
        });
    }

    /** Deletes the images this import added (products stay) and the history entry. */
    public function destroy(string $id): void
    {
        $this->authorize();
        $this->allowLongRun();
        $this->run(fn () => $this->batches->delete((int) $id));
    }

    /** POST multipart images_zip — swap the import's images for those in a new ZIP. */
    public function replaceZip(string $id): void
    {
        $this->authorize();
        $this->allowLongRun();

        if (!isset($_FILES['images_zip']) || $_FILES['images_zip']['error'] !== UPLOAD_ERR_OK) {
            Response::error('A ZIP upload named "images_zip" is required', 422);
        }

        $extractor = new SafeZipExtractor();
        $dir = null;
        try {
            $dir = $extractor->extract($_FILES['images_zip']['tmp_name']);
            $result = $this->batches->replaceZip((int) $id, $dir, (string) $_FILES['images_zip']['name'], (int) $_FILES['images_zip']['size']);
            Response::json($result + ['import' => $this->batches->get((int) $id)]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        } finally {
            if ($dir !== null) {
                $extractor->cleanup($dir);
            }
        }
    }

    /** POST multipart file — replace one image of the import. */
    public function replaceImage(string $id, string $type, string $imageId): void
    {
        $this->authorize();
        if (!isset($_FILES['file'])) {
            Response::error('A file upload named "file" is required', 422);
        }
        $this->run(fn () => $this->batches->replaceImage((int) $id, $type, (int) $imageId, $_FILES['file']));
    }

    public function removeImage(string $id, string $type, string $imageId): void
    {
        $this->authorize();
        $this->run(function () use ($id, $type, $imageId) {
            $this->batches->removeImage((int) $id, $type, (int) $imageId);

            return ['deleted' => true];
        });
    }

    private function authorize(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');
    }

    private function run(callable $fn, int $errorStatus = 422): never
    {
        try {
            Response::json($fn());
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), $e->getMessage() === 'Import not found' ? 404 : $errorStatus);
        }
    }

    private function allowLongRun(): void
    {
        @set_time_limit(0);
        @ini_set('memory_limit', '512M');
        ignore_user_abort(true);
    }
}
