<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\DashboardService;
use PDO;

final class DashboardController
{
    private readonly DashboardService $dashboard;

    public function __construct(private readonly PDO $pdo)
    {
        $this->dashboard = new DashboardService($pdo);
    }

    public function summary(): void
    {
        $this->authorize();
        Response::json($this->dashboard->summary());
    }

    public function salesChart(): void
    {
        $this->authorize();

        $granularity = (string) ($_GET['period'] ?? 'daily');
        $buckets = max(1, min(365, (int) ($_GET['buckets'] ?? 30)));

        Response::json(['chart' => $this->dashboard->salesChart($granularity, $buckets)]);
    }

    public function productAnalytics(): void
    {
        $this->authorize();

        $limit = max(1, min(50, (int) ($_GET['limit'] ?? 10)));
        Response::json($this->dashboard->productAnalytics($limit));
    }

    public function customerAnalytics(): void
    {
        $this->authorize();

        $limit = max(1, min(50, (int) ($_GET['limit'] ?? 10)));
        Response::json($this->dashboard->customerAnalytics($limit));
    }

    public function recentActivity(): void
    {
        $this->authorize();

        $limit = max(1, min(50, (int) ($_GET['limit'] ?? 10)));
        Response::json($this->dashboard->recentActivity($limit));
    }

    private function authorize(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.financial.view');
    }
}
