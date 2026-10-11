<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Refresh-token issuance, rotation, and reuse detection (Phase 1.1 of the
 * admin-pos overhaul — see docs/audit or the overhaul plan for context).
 *
 * The raw token is only ever seen once, in the Set-Cookie response — only
 * its SHA-256 hash is stored. Rotation-on-use with a `replaced_by_id`
 * chain means a token can be used exactly once to get a new one; if a
 * *revoked* token is presented again (the classic signal of a stolen
 * cookie being replayed after the legitimate client already rotated
 * past it), the entire chain for that user is revoked as a security
 * response rather than silently rejecting just the one request.
 */
final class RefreshTokenService
{
    private const ADMIN_TTL_SECONDS = 2592000; // 30 days
    private const CASHIER_TTL_SECONDS = 604800; // 7 days

    public function __construct(private readonly PDO $pdo)
    {
    }

    public static function ttlForRole(string $role): int
    {
        return $role === 'ADMIN' ? self::ADMIN_TTL_SECONDS : self::CASHIER_TTL_SECONDS;
    }

    /** @return array{raw: string, expires_at: string} */
    public function issue(int $userId, string $role, ?string $userAgent = null, ?string $ip = null): array
    {
        $raw = bin2hex(random_bytes(32));
        $hash = hash('sha256', $raw);
        $expiresAt = date('Y-m-d H:i:s', time() + self::ttlForRole($role));

        $this->pdo->prepare(
            'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
             VALUES (:user_id, :token_hash, :expires_at, :user_agent, :ip_address)'
        )->execute([
            'user_id' => $userId,
            'token_hash' => $hash,
            'expires_at' => $expiresAt,
            'user_agent' => $userAgent !== null ? substr($userAgent, 0, 255) : null,
            'ip_address' => $ip,
        ]);

        return ['raw' => $raw, 'expires_at' => $expiresAt];
    }

    /**
     * Validates and rotates a refresh token in one step. On success, the
     * presented token is revoked (reason ROTATED) and a new one is issued
     * and returned alongside the user's current id/role (re-read from
     * `users`, not trusted from the old token, in case role changed).
     *
     * @return array{raw: string, expires_at: string, user_id: int, role: string}
     * @throws RuntimeException 'expired', 'invalid', or 'reuse_detected' as the message
     */
    public function rotate(string $rawToken, ?string $userAgent = null, ?string $ip = null): array
    {
        $hash = hash('sha256', $rawToken);

        $stmt = $this->pdo->prepare('SELECT * FROM refresh_tokens WHERE token_hash = :hash');
        $stmt->execute(['hash' => $hash]);
        $row = $stmt->fetch();

        if ($row === false) {
            throw new RuntimeException('invalid');
        }

        if ($row['revoked_at'] !== null) {
            // Reuse of an already-rotated-away token: revoke the whole
            // chain for this user and force a full re-login.
            $this->revokeAllForUser((int) $row['user_id'], 'REUSE_DETECTED');
            throw new RuntimeException('reuse_detected');
        }

        if (strtotime((string) $row['expires_at']) < time()) {
            $this->pdo->prepare("UPDATE refresh_tokens SET revoked_at = NOW(), revoke_reason = 'EXPIRED' WHERE id = :id")
                ->execute(['id' => $row['id']]);
            throw new RuntimeException('expired');
        }

        $userStmt = $this->pdo->prepare(
            "SELECT u.id, r.code AS role FROM users u JOIN roles r ON r.id = u.role_id
             WHERE u.id = :id AND u.status = 'ACTIVE' AND u.deleted_at IS NULL"
        );
        $userStmt->execute(['id' => $row['user_id']]);
        $user = $userStmt->fetch();

        if ($user === false) {
            $this->pdo->prepare("UPDATE refresh_tokens SET revoked_at = NOW(), revoke_reason = 'USER_INACTIVE' WHERE id = :id")
                ->execute(['id' => $row['id']]);
            throw new RuntimeException('invalid');
        }

        $this->pdo->beginTransaction();
        try {
            $next = $this->issue((int) $user['id'], (string) $user['role'], $userAgent, $ip);

            $nextId = (int) $this->pdo->lastInsertId();
            $this->pdo->prepare(
                "UPDATE refresh_tokens SET revoked_at = NOW(), revoke_reason = 'ROTATED', replaced_by_id = :next_id WHERE id = :id"
            )->execute(['next_id' => $nextId, 'id' => $row['id']]);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return [
            'raw' => $next['raw'],
            'expires_at' => $next['expires_at'],
            'user_id' => (int) $user['id'],
            'role' => (string) $user['role'],
        ];
    }

    public function revoke(string $rawToken, string $reason = 'LOGOUT'): void
    {
        $hash = hash('sha256', $rawToken);
        $this->pdo->prepare(
            'UPDATE refresh_tokens SET revoked_at = NOW(), revoke_reason = :reason WHERE token_hash = :hash AND revoked_at IS NULL'
        )->execute(['reason' => $reason, 'hash' => $hash]);
    }

    public function revokeAllForUser(int $userId, string $reason): void
    {
        $this->pdo->prepare(
            'UPDATE refresh_tokens SET revoked_at = NOW(), revoke_reason = :reason WHERE user_id = :user_id AND revoked_at IS NULL'
        )->execute(['reason' => $reason, 'user_id' => $userId]);
    }
}
