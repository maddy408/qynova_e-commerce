<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\RefundService;
use PDO;
use RuntimeException;

final class RefundController
{
    private readonly RefundService $refunds;

    public function __construct(private readonly PDO $pdo)
    {
        $this->refunds = new RefundService($pdo);
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        Response::json(['refunds' => $this->refunds->list($_GET)]);
    }

    public function show(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $refund = $this->refunds->find((int) $id);

        if ($refund === null) {
            Response::error('Refund not found', 404);
        }

        Response::json(['refund' => $refund]);
    }

    public function process(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $body = Request::json();
        $forceFailure = (bool) ($body['force_failure'] ?? false);

        try {
            Response::json(['refund' => $this->refunds->process(
                (int) $id,
                (int) $claims['sub'],
                $forceFailure,
                $body['failure_reason'] ?? null,
            )]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function cancel(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $body = Request::json();
        $reason = trim((string) ($body['reason'] ?? ''));

        if ($reason === '') {
            Response::error('A reason is required', 422);
        }

        try {
            Response::json(['refund' => $this->refunds->cancel((int) $id, $reason)]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** Refund report (ECOMMERCE_POS_ADMIN_SPEC.md sections 23-24, 42). */
    public function summary(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'reports.financial.view');

        Response::json(['summary' => $this->refunds->summary()]);
    }
}
