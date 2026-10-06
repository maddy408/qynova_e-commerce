<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Config;
use App\Helpers\JwtHelper;
use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use PDO;

/**
 * Staff (ADMIN/CASHIER) login. Google login is an additional option
 * (docs/DOCUMENTATION.md section 5) layered on later — it must never
 * auto-create a staff account, only link to one that already exists.
 */
final class AuthController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function login(): void
    {
        $body = Request::json();
        $email = trim((string) ($body['email'] ?? ''));
        $password = (string) ($body['password'] ?? '');

        if ($email === '' || $password === '') {
            Response::error('email and password are required', 422);
        }

        $stmt = $this->pdo->prepare(
            "SELECT u.id, u.name, u.password_hash, r.code AS role
             FROM users u JOIN roles r ON r.id = u.role_id
             WHERE u.email = :email AND u.status = 'ACTIVE' AND u.deleted_at IS NULL"
        );
        $stmt->execute(['email' => $email]);
        $user = $stmt->fetch();

        if ($user === false || $user['password_hash'] === null || !password_verify($password, $user['password_hash'])) {
            Response::error('Invalid email or password', 401);
        }

        Response::json([
            'token' => $this->issueToken((int) $user['id'], $user['name'], $user['role']),
            'user' => ['id' => (int) $user['id'], 'name' => $user['name'], 'role' => $user['role']],
        ]);
    }

    public function me(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireRole($claims, 'ADMIN', 'CASHIER');

        Response::json([
            'user' => [
                'id' => $claims['sub'],
                'name' => $claims['name'] ?? null,
                'role' => $claims['role'] ?? null,
                'permissions' => $claims['permissions'] ?? [],
            ],
        ]);
    }

    private function issueToken(int $userId, string $name, string $role): string
    {
        $permissions = $this->pdo->prepare(
            'SELECT p.code FROM role_permissions rp
             JOIN permissions p ON p.id = rp.permission_id
             JOIN roles r ON r.id = rp.role_id
             WHERE r.code = :role'
        );
        $permissions->execute(['role' => $role]);

        return JwtHelper::issue(
            [
                'sub' => $userId,
                'type' => 'staff',
                'name' => $name,
                'role' => $role,
                'permissions' => $permissions->fetchAll(PDO::FETCH_COLUMN),
            ],
            (int) Config::get('jwt.access_ttl', 900)
        );
    }
}
