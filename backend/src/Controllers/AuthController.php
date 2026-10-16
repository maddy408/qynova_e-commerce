<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Config;
use App\Helpers\JwtHelper;
use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\RefreshTokenService;
use PDO;
use RuntimeException;

/**
 * Staff (ADMIN/CASHIER) login. Google login is an additional option
 * (docs/DOCUMENTATION.md section 5) layered on later — it must never
 * auto-create a staff account, only link to one that already exists.
 *
 * Session design (Phase 1.1 of the admin-pos overhaul): a short-lived
 * JWT access token (15 min default, see JwtHelper/jwt.access_ttl) is
 * returned in the JSON body and sent as `Authorization: Bearer`, same
 * as before. A long-lived refresh token (30 days ADMIN / 7 days CASHIER,
 * see RefreshTokenService) is issued alongside it as an httpOnly Secure
 * cookie, scoped to /api/auth — the frontend never reads or stores it
 * directly, it just gets silently replayed by the browser when calling
 * /api/auth/refresh. Rotated on every use; a revoked token presented
 * again (replay of a stolen cookie) revokes the whole session chain.
 */
final class AuthController
{
    private readonly RefreshTokenService $refreshTokens;
    private const REFRESH_COOKIE = 'admin_pos_refresh_token';

    public function __construct(private readonly PDO $pdo)
    {
        $this->refreshTokens = new RefreshTokenService($pdo);
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
            $this->audit(null, 'LOGIN_FAILED', $email);
            Response::error('Invalid email or password', 401);
        }

        $userId = (int) $user['id'];
        $role = (string) $user['role'];

        $refresh = $this->refreshTokens->issue($userId, $role, Request::userAgent(), Request::clientIp());
        $this->setRefreshCookie($refresh['raw'], $refresh['expires_at']);
        $this->audit($userId, 'LOGIN', $email);

        $permissions = $this->pdo->prepare(
            'SELECT p.code FROM role_permissions rp
             JOIN permissions p ON p.id = rp.permission_id
             JOIN roles r ON r.id = rp.role_id
             WHERE r.code = :role'
        );
        $permissions->execute(['role' => $role]);

        Response::json([
            'token' => $this->issueAccessToken($userId, (string) $user['name'], $role),
            'refresh_token' => $refresh['raw'],
            'user' => [
                'id' => $userId,
                'name' => $user['name'],
                'role' => $role,
                // Needed right after login so the nav can filter by permission
                // before the next /auth/me refresh (see me() below).
                'permissions' => $permissions->fetchAll(PDO::FETCH_COLUMN),
            ],
        ]);
    }

    /**
     * Exchanges the httpOnly refresh cookie for a new access token,
     * rotating the refresh token itself in the same request. The
     * frontend calls this when an API request comes back 401 "Token
     * expired" — see apps/admin-pos/src/api/axiosInstance.ts.
     */
    public function refresh(): void
    {
        $input = Request::json();
        $raw = $_COOKIE[self::REFRESH_COOKIE] ?? ($input['refresh_token'] ?? null);

        if ($raw === null || $raw === '') {
            Response::error('No refresh token', 401);
        }

        try {
            $result = $this->refreshTokens->rotate($raw, Request::userAgent(), Request::clientIp());
        } catch (RuntimeException $e) {
            $this->clearRefreshCookie();
            $this->audit(null, 'REFRESH_FAILURE', $e->getMessage());
            Response::error('Session expired, please log in again', 401, ['reason' => $e->getMessage()]);
        }

        $this->setRefreshCookie($result['raw'], $result['expires_at']);

        $nameStmt = $this->pdo->prepare('SELECT name FROM users WHERE id = :id');
        $nameStmt->execute(['id' => $result['user_id']]);
        $name = (string) $nameStmt->fetchColumn();

        $permissions = $this->pdo->prepare(
            'SELECT p.code FROM role_permissions rp
             JOIN permissions p ON p.id = rp.permission_id
             JOIN roles r ON r.id = rp.role_id
             WHERE r.code = :role'
        );
        $permissions->execute(['role' => $result['role']]);

        Response::json([
            'token' => $this->issueAccessToken($result['user_id'], $name, $result['role']),
            'refresh_token' => $result['raw'],
            'user' => [
                'id' => $result['user_id'],
                'name' => $name,
                'role' => $result['role'],
                'permissions' => $permissions->fetchAll(PDO::FETCH_COLUMN),
            ],
        ]);
    }

    public function logout(): void
    {
        $raw = $_COOKIE[self::REFRESH_COOKIE] ?? null;
        $claims = null;

        // Logout works whether or not the access token is still valid —
        // an expired-access-token browser tab should still be able to
        // revoke its refresh cookie and clear the session.
        $authHeader = Request::bearerToken();
        if ($authHeader !== null) {
            try {
                $claims = JwtHelper::verify($authHeader);
            } catch (\Throwable) {
                // ignore — still proceed to revoke the refresh cookie
            }
        }

        if ($raw !== null && $raw !== '') {
            $this->refreshTokens->revoke($raw, 'LOGOUT');
        }
        $this->clearRefreshCookie();

        if ($claims !== null) {
            $this->audit((int) $claims['sub'], 'LOGOUT', null);
        }

        Response::json(['message' => 'Logged out']);
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

    private function issueAccessToken(int $userId, string $name, string $role): string
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
                // Unique per issuance so two tokens minted in the same
                // second (e.g. login immediately followed by a refresh)
                // are never byte-identical.
                'jti' => bin2hex(random_bytes(8)),
            ],
            (int) Config::get('jwt.access_ttl', 86400)
        );
    }

    private function setRefreshCookie(string $raw, string $expiresAt): void
    {
        setcookie(self::REFRESH_COOKIE, $raw, [
            'expires' => strtotime($expiresAt),
            'path' => '/',
            'secure' => $this->isHttps(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    private function clearRefreshCookie(): void
    {
        setcookie(self::REFRESH_COOKIE, '', [
            'expires' => time() - 3600,
            'path' => '/',
            'secure' => $this->isHttps(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    private function isHttps(): bool
    {
        return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    }

    private function audit(?int $actorId, string $action, ?string $reason): void
    {
        $this->pdo->prepare(
            'INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, reason, ip_address)
             VALUES (:actor_type, :actor_id, :action, :entity_type, :entity_id, :reason, :ip_address)'
        )->execute([
            'actor_type' => $actorId !== null ? 'USER' : 'SYSTEM',
            'actor_id' => $actorId,
            'action' => $action,
            'entity_type' => 'auth_session',
            'entity_id' => $actorId,
            'reason' => $reason,
            'ip_address' => Request::clientIp(),
        ]);
    }
}
