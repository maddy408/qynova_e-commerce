<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\CouponService;
use PDO;
use RuntimeException;

final class CouponController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'coupons.manage');

        Response::json(['coupons' => (new CouponService($this->pdo))->list($_GET)]);
    }

    public function show(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'coupons.manage');

        $coupon = (new CouponService($this->pdo))->find((int) $id);

        if ($coupon === null) {
            Response::error('Coupon not found', 404);
        }

        Response::json(['coupon' => $coupon]);
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'coupons.manage');

        try {
            $id = (new CouponService($this->pdo))->create(Request::json());
            Response::json(['id' => $id], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function update(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'coupons.manage');

        (new CouponService($this->pdo))->update((int) $id, Request::json());
        Response::json(['updated' => true]);
    }

    public function destroy(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'coupons.manage');

        try {
            (new CouponService($this->pdo))->delete((int) $id);
            Response::json(['deleted' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** "For You" — coupons visible to customers (both logged-in and guest). */
    public function availableForCustomer(): void
    {
        $customerId = null;
        $token = Request::bearerToken();
        if ($token !== null) {
            try {
                $claims = \App\Helpers\JwtHelper::verify($token);
                if (($claims['type'] ?? '') === 'customer') {
                    $customerId = (int) $claims['sub'];
                }
            } catch (\Throwable) {
                // Ignore invalid token for guest viewing
            }
        }

        $whereCustomer = $customerId !== null
            ? "NOT EXISTS (SELECT 1 FROM coupon_customers cc WHERE cc.coupon_id = c.id) OR EXISTS (SELECT 1 FROM coupon_customers cc WHERE cc.coupon_id = c.id AND cc.customer_id = :customer_id)"
            : "NOT EXISTS (SELECT 1 FROM coupon_customers cc WHERE cc.coupon_id = c.id)";

        $stmt = $this->pdo->prepare(
            "SELECT c.id, c.code, c.name, c.description, c.discount_type, c.discount_value, c.min_order_amount, c.max_discount_amount
             FROM coupons c
             WHERE c.status = 'ACTIVE'
               AND (c.start_at IS NULL OR c.start_at <= NOW())
               AND (c.end_at IS NULL OR c.end_at >= NOW())
               AND ({$whereCustomer})
             ORDER BY c.discount_value DESC
             LIMIT 6"
        );
        $params = $customerId !== null ? ['customer_id' => $customerId] : [];
        $stmt->execute($params);

        Response::json(['coupons' => $stmt->fetchAll()]);
    }

    /** Customer / Storefront coupon validation against live MySQL rules */
    public function validate(): void
    {
        $body = Request::json();
        $code = trim((string) ($body['code'] ?? ''));
        if ($code === '') {
            Response::error('Coupon code is required', 422);
        }

        $customerId = 0;
        $token = Request::bearerToken();
        if ($token !== null) {
            try {
                $claims = \App\Helpers\JwtHelper::verify($token);
                if (($claims['type'] ?? '') === 'customer') {
                    $customerId = (int) $claims['sub'];
                }
            } catch (\Throwable) {
                // Guest validation
            }
        }

        $rawItems = (array) ($body['items'] ?? []);
        $items = [];
        if (!empty($rawItems)) {
            foreach ($rawItems as $it) {
                $pId = (int) ($it['product_id'] ?? 0);
                $pStmt = $this->pdo->prepare('SELECT brand_id FROM products WHERE id = :id');
                $pStmt->execute(['id' => $pId]);
                $brandId = $pStmt->fetchColumn() ?: null;

                $catStmt = $this->pdo->prepare('SELECT category_id FROM product_categories WHERE product_id = :id');
                $catStmt->execute(['id' => $pId]);
                $categoryIds = array_map('intval', $catStmt->fetchAll(PDO::FETCH_COLUMN));

                $unitPrice = (string) ($it['price'] ?? $it['unit_price'] ?? '0');
                $quantity = (int) ($it['quantity'] ?? 1);
                $lineSubtotal = (string) ($it['line_total'] ?? bcmul($unitPrice, (string) $quantity, 2));

                $items[] = [
                    'variant_id' => (int) ($it['variant_id'] ?? 0),
                    'product_id' => $pId,
                    'category_ids' => $categoryIds,
                    'brand_id' => $brandId !== null ? (int) $brandId : null,
                    'quantity' => $quantity,
                    'line_subtotal' => $lineSubtotal,
                ];
            }
        } else {
            $sessionId = Request::header('X-Session-ID');
            $cartService = new \App\Services\CartService($this->pdo);
            $cart = $cartService->getCart($customerId > 0 ? $customerId : null, $sessionId);
            $cartItems = $cart['items'] ?? [];
            foreach ($cartItems as $ci) {
                $pStmt = $this->pdo->prepare('SELECT brand_id FROM products WHERE id = :id');
                $pStmt->execute(['id' => $ci['product_id']]);
                $brandId = $pStmt->fetchColumn() ?: null;

                $catStmt = $this->pdo->prepare('SELECT category_id FROM product_categories WHERE product_id = :id');
                $catStmt->execute(['id' => $ci['product_id']]);
                $categoryIds = array_map('intval', $catStmt->fetchAll(PDO::FETCH_COLUMN));

                $items[] = [
                    'variant_id' => (int) $ci['variant_id'],
                    'product_id' => (int) $ci['product_id'],
                    'category_ids' => $categoryIds,
                    'brand_id' => $brandId !== null ? (int) $brandId : null,
                    'quantity' => (int) $ci['quantity'],
                    'line_subtotal' => (string) $ci['line_total'],
                ];
            }
        }

        try {
            $service = new CouponService($this->pdo);
            $result = $service->validate($code, $customerId, $items);
            Response::json($result);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
