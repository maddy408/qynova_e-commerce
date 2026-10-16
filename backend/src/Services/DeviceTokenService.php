<?php

declare(strict_types=1);

namespace App\Services;

use PDO;

/**
 * FCM device token registry, backed by the (pre-existing, previously
 * orphaned) `device_tokens` table. One row per physical token — a token
 * is never duplicated, and re-registering an existing token (same
 * browser profile) just reassigns its owner, which is exactly what
 * should happen on logout+login-as-someone-else on a shared device: the
 * old owner naturally stops receiving pushes on that browser without an
 * explicit "transfer" step, and the UNIQUE KEY on `token` makes a true
 * duplicate row impossible regardless of how many times register() is
 * called for the same token.
 */
final class DeviceTokenService
{
    private const ALLOWED_PLATFORMS = ['WEB', 'ANDROID', 'IOS'];
    private const ALLOWED_OWNER_TYPES = ['USER', 'CUSTOMER'];

    public function __construct(private readonly PDO $pdo)
    {
    }

    public function register(string $ownerType, int $ownerId, string $token, string $platform = 'WEB', ?string $userAgent = null): void
    {
        $ownerType = strtoupper($ownerType);
        $platform = strtoupper($platform);

        if (!in_array($ownerType, self::ALLOWED_OWNER_TYPES, true)) {
            throw new \InvalidArgumentException('Invalid owner_type');
        }
        if (!in_array($platform, self::ALLOWED_PLATFORMS, true)) {
            $platform = 'WEB';
        }

        $this->pdo->prepare(
            'INSERT INTO device_tokens (owner_type, owner_id, token, platform, user_agent, is_active, last_seen_at)
             VALUES (:owner_type, :owner_id, :token, :platform, :user_agent, 1, NOW())
             ON DUPLICATE KEY UPDATE
                owner_type = VALUES(owner_type),
                owner_id = VALUES(owner_id),
                platform = VALUES(platform),
                user_agent = VALUES(user_agent),
                is_active = 1,
                last_seen_at = NOW()'
        )->execute([
            'owner_type' => $ownerType,
            'owner_id' => $ownerId,
            'token' => $token,
            'platform' => $platform,
            'user_agent' => $userAgent !== null ? mb_substr($userAgent, 0, 255) : null,
        ]);
    }

    /**
     * Deactivates (never deletes — keeps the audit trail of what was
     * once registered) a token belonging to this owner. Scoped to the
     * caller's own owner_type/owner_id, same reasoning as
     * NotificationService::markRead() — a request to remove a token
     * that isn't this caller's own silently affects nothing.
     */
    public function remove(string $ownerType, int $ownerId, string $token): void
    {
        $this->pdo->prepare(
            "UPDATE device_tokens SET is_active = 0
             WHERE token = :token AND owner_type = :owner_type AND owner_id = :owner_id"
        )->execute(['token' => $token, 'owner_type' => strtoupper($ownerType), 'owner_id' => $ownerId]);
    }

    /** @return list<string> active tokens for this owner */
    public function activeTokensFor(string $ownerType, int $ownerId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT token FROM device_tokens WHERE owner_type = :owner_type AND owner_id = :owner_id AND is_active = 1'
        );
        $stmt->execute(['owner_type' => strtoupper($ownerType), 'owner_id' => $ownerId]);

        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    /** @return list<array{owner_type: string, owner_id: int, token: string}> every active token for a whole owner_type (e.g. all staff with a given role) */
    public function activeTokensForMany(string $ownerType, array $ownerIds): array
    {
        if ($ownerIds === []) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($ownerIds), '?'));
        $stmt = $this->pdo->prepare(
            "SELECT owner_type, owner_id, token FROM device_tokens
             WHERE owner_type = ? AND owner_id IN ({$placeholders}) AND is_active = 1"
        );
        $stmt->execute([strtoupper($ownerType), ...array_map('intval', $ownerIds)]);

        return $stmt->fetchAll();
    }

    /** Deactivates a token FCM itself reported as invalid/unregistered — called by FcmSenderService, not from any request. */
    public function deactivateToken(string $token): void
    {
        $this->pdo->prepare('UPDATE device_tokens SET is_active = 0 WHERE token = :token')->execute(['token' => $token]);
    }
}
