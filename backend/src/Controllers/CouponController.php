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

    /** "For You" — coupons visible to the logged-in customer (section 15). */
    public function availableForCustomer(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);

        Response::json(['coupons' => (new CouponService($this->pdo))->availableForCustomer((int) $claims['sub'])]);
    }
}
