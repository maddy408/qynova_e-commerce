<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\ReportExportService;
use PDO;

final class ReportExportController
{
    private readonly ReportExportService $exporter;

    public function __construct(private readonly PDO $pdo)
    {
        $this->exporter = new ReportExportService($pdo);
    }

    public function exportExcel(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.financial.view');

        $filters = [
            'start_date' => $_GET['start_date'] ?? null,
            'end_date' => $_GET['end_date'] ?? null,
            'channel' => $_GET['channel'] ?? 'ALL',
            'customer_type' => $_GET['customer_type'] ?? 'ALL',
        ];

        Response::file($this->exporter->exportExcel($filters), 'sales-report.xlsx');
    }
}
