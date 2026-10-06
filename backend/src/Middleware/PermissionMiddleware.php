<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Helpers\Response;

/**
 * Backend-enforced permissions — hiding buttons in React is never enough
 * (docs/DOCUMENTATION.md section 3 and ECOMMERCE_POS_ADMIN_SPEC.md section 31).
 */
final class PermissionMiddleware
{
    /** @param array<string, mixed> $claims */
    public static function require(array $claims, string $permissionCode): void
    {
        if (($claims['type'] ?? null) !== 'staff') {
            Response::error('Forbidden', 403);
        }

        $permissions = (array) ($claims['permissions'] ?? []);

        if (!in_array($permissionCode, $permissions, true)) {
            Response::error('Forbidden', 403);
        }
    }

    /** @param array<string, mixed> $claims */
    public static function requireCustomer(array $claims): void
    {
        if (($claims['type'] ?? null) !== 'customer') {
            Response::error('Forbidden', 403);
        }
    }

    /** @param array<string, mixed> $claims */
    public static function requireRole(array $claims, string ...$roles): void
    {
        if (($claims['type'] ?? null) !== 'staff' || !in_array($claims['role'] ?? null, $roles, true)) {
            Response::error('Forbidden', 403);
        }
    }
}
