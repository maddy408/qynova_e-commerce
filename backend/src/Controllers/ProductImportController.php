<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\InventoryService;
use App\Services\ProductExportService;
use App\Services\ProductImportService;
use PDO;
use RuntimeException;

final class ProductImportController
{
    private readonly ProductImportService $importer;

    public function __construct(private readonly PDO $pdo)
    {
        $this->importer = new ProductImportService($pdo, new InventoryService($pdo));
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

        try {
            Response::json($this->importer->preview($path, $autoCreate));
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        } finally {
            @unlink($path);
        }
    }

    public function commit(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $path = $this->uploadedFilePath();
        $autoCreate = ($_POST['auto_create_masters'] ?? '') === '1';

        try {
            Response::json($this->importer->commit($path, $autoCreate, (int) $claims['sub']));
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        } finally {
            @unlink($path);
        }
    }

    /** Re-runs preview (read-only — no DB writes survive) to build a downloadable error report from the same file. */
    public function errorReport(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $path = $this->uploadedFilePath();
        $autoCreate = ($_POST['auto_create_masters'] ?? '') === '1';

        try {
            $result = $this->importer->preview($path, $autoCreate);
            Response::file($this->importer->errorReport($result['results']), 'product-import-errors.xlsx');
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        } finally {
            @unlink($path);
        }
    }

    private function uploadedFilePath(): string
    {
        if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            Response::error('A file upload named "file" is required', 422);
        }

        return $_FILES['file']['tmp_name'];
    }
}
