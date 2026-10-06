<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\DeliveryService;
use PDO;
use RuntimeException;

final class DeliveryController
{
    private readonly DeliveryService $deliveries;

    public function __construct(private readonly PDO $pdo)
    {
        $this->deliveries = new DeliveryService($pdo);
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        Response::json(['deliveries' => $this->deliveries->list($_GET)]);
    }

    public function show(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $delivery = $this->deliveries->find((int) $id);

        if ($delivery === null) {
            Response::error('Delivery not found', 404);
        }

        Response::json(['delivery' => $delivery]);
    }

    /** Customer-facing order tracking (ECOMMERCE_POS_ADMIN_SPEC.md section 28). */
    public function showForOrder(string $orderId): void
    {
        $claims = JwtAuthMiddleware::authenticate();

        $orderStmt = $this->pdo->prepare('SELECT customer_id FROM orders WHERE id = :id');
        $orderStmt->execute(['id' => $orderId]);
        $customerId = $orderStmt->fetchColumn();

        if ($customerId === false) {
            Response::error('Order not found', 404);
        }

        if ($claims['type'] === 'customer' && (int) $customerId !== (int) $claims['sub']) {
            Response::error('Forbidden', 403);
        } elseif ($claims['type'] === 'staff') {
            PermissionMiddleware::require($claims, 'delivery.manage');
        }

        $delivery = $this->deliveries->findByOrder((int) $orderId);

        if ($delivery === null) {
            Response::error('No delivery created for this order yet', 404);
        }

        Response::json(['delivery' => $delivery]);
    }

    public function store(string $orderId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $body = Request::json();

        try {
            $id = $this->deliveries->createForOrder((int) $orderId, $body['courier'] ?? null, $body['expected_delivery_date'] ?? null);
            Response::json(['delivery' => $this->deliveries->find($id)], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function updateStatus(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $body = Request::json();
        $status = (string) ($body['status'] ?? '');

        try {
            Response::json(['delivery' => $this->deliveries->updateStatus(
                (int) $id,
                $status,
                'ADMIN',
                $body['note'] ?? null,
                (int) $claims['sub'],
            )]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** Mock shipping-provider webhook — no signature verification (no real gateway). */
    public function webhook(): void
    {
        $body = Request::json();
        $awb = (string) ($body['awb'] ?? '');
        $status = (string) ($body['status'] ?? '');

        if ($awb === '' || $status === '') {
            Response::error('awb and status are required', 422);
        }

        try {
            Response::json(['delivery' => $this->deliveries->updateByAwb($awb, $status, $body['note'] ?? null)]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
