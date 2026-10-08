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

    /** Customer-facing pincode serviceability check. */
    public function checkPincode(): void
    {
        $pincode = trim((string) ($_GET['pincode'] ?? ''));
        $productId = isset($_GET['product_id']) ? (int) $_GET['product_id'] : null;

        if (!preg_match('/^[1-9][0-9]{5}$/', $pincode)) {
            Response::json([
                'serviceable' => false,
                'status' => 'INVALID',
                'message' => 'Please enter a valid 6-digit Indian PIN code.',
            ], 400);
            return;
        }

        $codAvailable = true;
        $shippingRequired = true;

        if ($productId !== null && $productId > 0) {
            $stmt = $this->pdo->prepare('SELECT cod_available, shipping_required FROM products WHERE id = :id AND deleted_at IS NULL');
            $stmt->execute(['id' => $productId]);
            $prod = $stmt->fetch();
            if ($prod !== false) {
                $codAvailable = (bool) $prod['cod_available'];
                $shippingRequired = (bool) $prod['shipping_required'];
            }
        }

        $firstDigit = (int) $pincode[0];
        $days = match ($firstDigit) {
            1, 2, 5, 6 => '1–2 business days (Express Courier)',
            3, 4 => '2–3 business days (Standard Courier)',
            default => '3–4 business days (National Network)',
        };

        Response::json([
            'serviceable' => true,
            'status' => 'AVAILABLE',
            'pincode' => $pincode,
            'estimated_delivery' => $days,
            'cod_available' => $codAvailable,
            'shipping_required' => $shippingRequired,
            'delivery_charge' => 'Free on orders above ₹499 (Flat ₹49 below ₹499)',
            'message' => "Delivery available to {$pincode}. Estimated delivery within {$days}.",
        ]);
    }
}

