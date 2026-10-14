<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\InventoryService;
use App\Services\ProductExportService;
use App\Services\ProductImportService;
use App\Services\SafeZipExtractor;
use PDO;
use RuntimeException;

final class ProductImportController
{
    private readonly ProductImportService $importer;
    private readonly SafeZipExtractor $zipExtractor;

    public function __construct(private readonly PDO $pdo)
    {
        $this->importer = new ProductImportService($pdo, new InventoryService($pdo));
        $this->zipExtractor = new SafeZipExtractor();
    }

    public function template(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        Response::file((new ProductExportService($this->pdo))->sampleTemplate(), 'product-import-template.xlsx');
    }

    public function preview(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $path = $this->uploadedFilePath();
        $autoCreate = ($_POST['auto_create_masters'] ?? '') === '1';
        $updateExisting = ($_POST['update_existing'] ?? '') === '1';
        $imagesDir = $this->extractImagesZipIfPresent();

        try {
            Response::json($this->importer->preview($path, $autoCreate, $updateExisting, $imagesDir));
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        } finally {
            @unlink($path);
            if ($imagesDir !== null) {
                $this->zipExtractor->cleanup($imagesDir);
            }
        }
    }

    public function commit(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $path = $this->uploadedFilePath();
        $autoCreate = ($_POST['auto_create_masters'] ?? '') === '1';
        $updateExisting = ($_POST['update_existing'] ?? '') === '1';
        $imagesDir = $this->extractImagesZipIfPresent();

        try {
            Response::json($this->importer->commit($path, $autoCreate, (int) $claims['sub'], $updateExisting, $imagesDir));
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        } finally {
            @unlink($path);
            if ($imagesDir !== null) {
                $this->zipExtractor->cleanup($imagesDir);
            }
        }
    }

    /** Re-runs preview (read-only — no DB writes survive) to build a downloadable error report from the same file. */
    public function errorReport(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $path = $this->uploadedFilePath();
        $autoCreate = ($_POST['auto_create_masters'] ?? '') === '1';
        $updateExisting = ($_POST['update_existing'] ?? '') === '1';
        $imagesDir = $this->extractImagesZipIfPresent();

        try {
            $result = $this->importer->preview($path, $autoCreate, $updateExisting, $imagesDir);
            Response::file($this->importer->errorReport($result['results']), 'product-import-errors.xlsx');
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        } finally {
            @unlink($path);
            if ($imagesDir !== null) {
                $this->zipExtractor->cleanup($imagesDir);
            }
        }
    }

    private function uploadedFilePath(): string
    {
        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            Response::error('A file upload named "file" is required', 422);
        }

        return $_FILES['file']['tmp_name'];
    }

    /**
     * "images_zip" is optional — only present when the admin attached a
     * ZIP of image files alongside the Excel file (the Excel columns
     * then hold plain filenames instead of http(s) URLs). Returns null
     * when none was uploaded, which ProductImportService treats as
     * "filename-style image cells are not resolvable right now".
     */
    private function extractImagesZipIfPresent(): ?string
    {
        if (!isset($_FILES['images_zip']) || $_FILES['images_zip']['error'] !== UPLOAD_ERR_OK) {
            return null;
        }

        try {
            return $this->zipExtractor->extract($_FILES['images_zip']['tmp_name']);
        } catch (RuntimeException $e) {
            Response::error('Images ZIP: ' . $e->getMessage(), 422);
        }
    }
}
