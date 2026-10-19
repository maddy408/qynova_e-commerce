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
        $startDate = !empty($_GET['start_date']) ? (string) $_GET['start_date'] : null;
        $endDate = !empty($_GET['end_date']) ? (string) $_GET['end_date'] : null;
        Response::json($this->dashboard->summary($startDate, $endDate));
    }

    public function salesChart(): void
    {
        $this->authorize();

        $granularity = (string) ($_GET['period'] ?? 'daily');
        $buckets = max(1, min(365, (int) ($_GET['buckets'] ?? 30)));
        $startDate = !empty($_GET['start_date']) ? (string) $_GET['start_date'] : null;
        $endDate = !empty($_GET['end_date']) ? (string) $_GET['end_date'] : null;

        Response::json(['chart' => $this->dashboard->salesChart($granularity, $buckets, $startDate, $endDate)]);
    }

    public function productAnalytics(): void
    {
        $this->authorize();

        $limit = max(1, min(50, (int) ($_GET['limit'] ?? 10)));
        $startDate = !empty($_GET['start_date']) ? (string) $_GET['start_date'] : null;
        $endDate = !empty($_GET['end_date']) ? (string) $_GET['end_date'] : null;

        Response::json($this->dashboard->productAnalytics($limit, $startDate, $endDate));
    }

    public function customerAnalytics(): void
    {
        $this->authorize();

        $limit = max(1, min(50, (int) ($_GET['limit'] ?? 10)));
        $startDate = !empty($_GET['start_date']) ? (string) $_GET['start_date'] : null;
        $endDate = !empty($_GET['end_date']) ? (string) $_GET['end_date'] : null;

        Response::json($this->dashboard->customerAnalytics($limit, $startDate, $endDate));
    }

    public function recentActivity(): void
    {
        $this->authorize();

        $limit = max(1, min(50, (int) ($_GET['limit'] ?? 10)));
        $startDate = !empty($_GET['start_date']) ? (string) $_GET['start_date'] : null;
        $endDate = !empty($_GET['end_date']) ? (string) $_GET['end_date'] : null;

        Response::json($this->dashboard->recentActivity($limit, $startDate, $endDate));
    }

    private function authorize(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.financial.view');
    }
}
