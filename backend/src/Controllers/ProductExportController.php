<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\ProductExportService;
use PDO;

final class ProductExportController
{
    private readonly ProductExportService $exporter;

    public function __construct(private readonly PDO $pdo)
    {
        $this->exporter = new ProductExportService($pdo);
    }

    /**
     * All/Selected/Filtered/Category-wise/Brand-wise/Active/Inactive
     * (section 12) are all just filter combinations on the same export:
     * ?ids=1,2,3 (Selected), ?category_id=, ?brand_id=, ?is_active=0|1.
     * No filters at all = All Products.
     */
    public function export(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $filters = [
            'ids' => isset($_GET['ids']) ? array_filter(array_map('trim', explode(',', (string) $_GET['ids']))) : null,
            'category_id' => $_GET['category_id'] ?? null,
            'brand_id' => $_GET['brand_id'] ?? null,
            'is_active' => isset($_GET['is_active']) ? (bool) (int) $_GET['is_active'] : null,
        ];

        Response::file($this->exporter->export($filters), 'products-export.xlsx');
    }

    public function exportStockReport(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.view');

        Response::file($this->exporter->exportStockReport(), 'stock-report.xlsx');
    }
}
