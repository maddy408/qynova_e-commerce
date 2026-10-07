<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\HoldBillService;
use PDO;
use RuntimeException;

final class HoldBillController
{
    private readonly HoldBillService $service;

    public function __construct(private readonly PDO $pdo)
    {
        $this->service = new HoldBillService($pdo);
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.sell');

        Response::json(['hold_bills' => $this->service->list()]);
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.sell');

        $body = Request::json();

        try {
            $bill = $this->service->save($body, (int) $claims['sub']);
            Response::json(['hold_bill' => $bill], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function destroy(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.sell');

        $this->service->delete((int) $id);
        Response::json(['deleted' => true]);
    }
}
