<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\CouponService;
use App\Services\InventoryService;
use App\Services\InvoiceService;
use App\Services\OrderService;
use PDO;
use RuntimeException;

final class OrderController
{
    private readonly OrderService $orders;

    public function __construct(private readonly PDO $pdo)
    {
        $inventory = new InventoryService($pdo);
        $this->orders = new OrderService($pdo, $inventory, new CouponService($pdo), new InvoiceService($pdo, $inventory));
    }

    public function preview(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);

        $body = Request::json();

        try {
            Response::json($this->orders->preview((int) $claims['sub'], (array) ($body['items'] ?? []), $body['coupon_code'] ?? null));
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function checkout(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);

        $body = Request::json();

        try {
            $order = $this->orders->checkout(
                (int) $claims['sub'],
                (array) ($body['items'] ?? []),
                (array) ($body['address'] ?? []),
                $body['coupon_code'] ?? null,
            );
            Response::json(['order' => $order], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** Admin order list (ECOMMERCE_POS_ADMIN_SPEC.md section 18). */
    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        Response::json(['orders' => $this->orders->list($_GET)]);
    }

    /** Customer's own order history (docs section 7, spec2 section 28). */
    public function myOrders(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);

        Response::json(['orders' => $this->orders->list(['customer_id' => $claims['sub']])]);
    }

    public function show(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $order = $this->orders->find((int) $id);

        if ($order === null) {
            Response::error('Order not found', 404);
        }

        if ($claims['type'] === 'customer' && (int) $order['customer_id'] !== (int) $claims['sub']) {
            Response::error('Forbidden', 403);
        } elseif ($claims['type'] === 'staff') {
            PermissionMiddleware::require($claims, 'orders.manage');
        }

        Response::json(['order' => $order]);
    }

    public function confirmPayment(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $order = $this->orders->find((int) $id);

        if ($order === null) {
            Response::error('Order not found', 404);
        }

        if ($claims['type'] === 'customer' && (int) $order['customer_id'] !== (int) $claims['sub']) {
            Response::error('Forbidden', 403);
        }

        try {
            Response::json(['order' => $this->orders->confirmPayment((int) $id)]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function cancel(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $order = $this->orders->find((int) $id);

        if ($order === null) {
            Response::error('Order not found', 404);
        }

        $isOwner = $claims['type'] === 'customer' && (int) $order['customer_id'] === (int) $claims['sub'];

        if (!$isOwner && $claims['type'] === 'staff') {
            PermissionMiddleware::require($claims, 'orders.manage');
        } elseif (!$isOwner) {
            Response::error('Forbidden', 403);
        }

        $body = Request::json();
        $reason = trim((string) ($body['reason'] ?? 'Cancelled by ' . ($claims['type'] === 'customer' ? 'customer' : 'admin')));
        $actorUserId = $claims['type'] === 'staff' ? (int) $claims['sub'] : null;

        try {
            Response::json(['order' => $this->orders->cancel((int) $id, $reason, $actorUserId)]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function updateStatus(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $body = Request::json();
        $status = (string) ($body['status'] ?? '');

        try {
            Response::json(['order' => $this->orders->updateStatus((int) $id, $status, (int) $claims['sub'], $body['note'] ?? null)]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
