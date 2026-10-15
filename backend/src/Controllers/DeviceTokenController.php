<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Services\DeviceTokenService;
use PDO;

/**
 * FCM device token registration for the authenticated caller only — the
 * owner (type + id) always comes from the caller's own JWT claims, never
 * from the request body, so a token can never be registered against (or
 * removed from) an account other than the one actually making the call.
 */
final class DeviceTokenController
{
    private readonly DeviceTokenService $deviceTokens;

    public function __construct(private readonly PDO $pdo)
    {
        $this->deviceTokens = new DeviceTokenService($pdo);
    }

    public function register(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $body = Request::json();

        $token = trim((string) ($body['token'] ?? ''));
        if ($token === '') {
            Response::error('token is required', 422);
        }
        if (mb_strlen($token) > 512) {
            Response::error('token is too long', 422);
        }

        $platform = strtoupper((string) ($body['platform'] ?? 'WEB'));
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;

        [$ownerType, $ownerId] = $this->currentOwner($claims);

        $this->deviceTokens->register($ownerType, $ownerId, $token, $platform, $userAgent);

        Response::json(['ok' => true]);
    }

    public function remove(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $body = Request::json();

        $token = trim((string) ($body['token'] ?? ''));
        if ($token === '') {
            Response::error('token is required', 422);
        }

        [$ownerType, $ownerId] = $this->currentOwner($claims);

        $this->deviceTokens->remove($ownerType, $ownerId, $token);

        Response::json(['ok' => true]);
    }

    /** @param array<string, mixed> $claims @return array{0: string, 1: int} */
    private function currentOwner(array $claims): array
    {
        $type = ($claims['type'] ?? null) === 'customer' ? 'CUSTOMER' : 'USER';

        if ($type === 'USER' && ($claims['type'] ?? null) !== 'staff') {
            Response::error('Forbidden', 403);
        }

        return [$type, (int) $claims['sub']];
    }
}
