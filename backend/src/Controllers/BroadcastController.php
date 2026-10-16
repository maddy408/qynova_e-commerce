<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\BroadcastService;
use App\Services\DeviceTokenService;
use App\Services\FcmSenderService;
use App\Services\NotificationService;
use PDO;
use RuntimeException;

/**
 * Admin -> all-customers broadcast push notifications
 * (Products Catalog's sibling feature for Marketing: "send a custom
 * title+message to every eligible customer"). Every write here requires
 * 'notifications.broadcast' — ADMIN role bypasses that check the same
 * way it bypasses every other permission in this app (see
 * PermissionMiddleware), everyone else needs it explicitly granted.
 */
final class BroadcastController
{
    private readonly BroadcastService $broadcasts;

    public function __construct(private readonly PDO $pdo)
    {
        $notifications = new NotificationService($pdo);
        $deviceTokens = new DeviceTokenService($pdo);
        $fcm = new FcmSenderService($deviceTokens);
        $this->broadcasts = new BroadcastService($pdo, $notifications, $deviceTokens, $fcm);
    }

    public function send(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'notifications.broadcast');

        $body = Request::json();
        $title = (string) ($body['title'] ?? '');
        $message = (string) ($body['message'] ?? $body['body'] ?? '');
        $type = (string) ($body['type'] ?? 'OFFER');
        $idempotencyKey = isset($body['idempotency_key']) ? (string) $body['idempotency_key'] : null;

        $data = isset($body['data']) && is_array($body['data']) ? $body['data'] : [];
        if (isset($body['url']) && is_string($body['url']) && trim($body['url']) !== '') {
            $data['url'] = trim($body['url']);
        }

        try {
            $result = $this->broadcasts->send($title, $message, (int) $claims['sub'], $idempotencyKey, $type, $data);
            Response::json($result);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function history(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'notifications.broadcast');

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int) ($_GET['limit'] ?? 20)));

        Response::json($this->broadcasts->listCampaigns($page, $limit));
    }
}
