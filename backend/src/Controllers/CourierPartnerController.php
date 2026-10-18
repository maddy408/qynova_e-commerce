<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\CourierPartnerService;
use PDO;
use Throwable;

final class CourierPartnerController
{
    private readonly CourierPartnerService $service;

    public function __construct(private readonly PDO $pdo)
    {
        $this->service = new CourierPartnerService($pdo);
    }

    /** GET /api/courier-partners/summary */
    public function summary(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        Response::json(['summary' => $this->service->summary()]);
    }

    /** GET /api/courier-partners */
    public function list(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $filters = [
            'search' => Request::query('search', ''),
            'status' => Request::query('status', ''),
            'service_type' => Request::query('service_type', ''),
            'page' => (int) Request::query('page', 1),
            'limit' => (int) Request::query('limit', 10),
        ];

        Response::json($this->service->list($filters));
    }

    /** GET /api/courier-partners/{id} */
    public function show(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $partner = $this->service->find((int) $id);
        if (!$partner) {
            Response::error('Courier partner not found', 404);
            return;
        }

        Response::json(['partner' => $partner]);
    }

    /** POST /api/courier-partners */
    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $body = Request::json();
        $actorUserId = (int) $claims['sub'];

        try {
            $id = $this->service->create($body, $actorUserId);
            $partner = $this->service->find($id);
            Response::json(['partner' => $partner], 201);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** PUT /api/courier-partners/{id} */
    public function update(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $body = Request::json();
        $actorUserId = (int) $claims['sub'];

        try {
            $updated = $this->service->update((int) $id, $body, $actorUserId);
            Response::json(['partner' => $updated]);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** PUT /api/courier-partners/{id}/status */
    public function toggleStatus(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $body = Request::json();
        $status = strtoupper(trim((string) ($body['status'] ?? '')));

        if (!in_array($status, ['ACTIVE', 'PENDING', 'INACTIVE'], true)) {
            Response::error('Invalid status', 422);
            return;
        }

        try {
            $updated = $this->service->toggleStatus((int) $id, $status);
            Response::json(['partner' => $updated]);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/courier-partners/{id}/test-connection */
    public function testConnection(string|int $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        try {
            $res = $this->service->testConnection((int) $id);
            Response::json($res);
        } catch (Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
