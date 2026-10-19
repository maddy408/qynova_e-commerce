<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use PDO;

final class SettingsController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** GET /api/settings/store - Public store settings */
    public function getStoreSettings(): void
    {
        $stmt = $this->pdo->query("SELECT * FROM store_settings WHERE is_active = 1 ORDER BY id ASC LIMIT 1");
        $settings = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$settings) {
            $settings = [
                'store_name' => 'Supermarket',
                'tagline' => 'Online Supermarket Store',
                'description' => 'Your trusted neighborhood supermarket.',
                'phone' => '',
                'whatsapp_number' => '',
                'email' => '',
                'address' => '',
                'city' => '',
                'state' => '',
                'pincode' => '',
                'support_hours' => '',
                'facebook_url' => null,
                'instagram_url' => null,
                'youtube_url' => null,
                'website_url' => null,
                'copyright_text' => 'All rights reserved.',
                'is_active' => 1,
            ];
        }

        Response::json(['settings' => $settings]);
    }

    /** GET /api/settings/delivery - Public delivery charges & free delivery threshold */
    public function getDeliverySettings(): void
    {
        $stmt = $this->pdo->query("SELECT * FROM delivery_settings WHERE is_active = 1 ORDER BY id ASC LIMIT 1");
        $settings = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$settings) {
            $settings = [
                'minimum_order_amount' => '0.00',
                'delivery_charge' => '49.00',
                'free_delivery_threshold' => '499.00',
                'delivery_discount' => '0.00',
                'estimated_delivery_text' => '2–4 Business Days',
                'express_delivery_text' => '1–2 Business Days',
                'is_active' => 1,
            ];
        }

        Response::json(['delivery_settings' => $settings]);
    }

    /** GET /api/pages - Public active pages/policies list */
    public function getPages(): void
    {
        $stmt = $this->pdo->query("SELECT id, slug, title, page_type, updated_at FROM pages WHERE is_active = 1 ORDER BY id ASC");
        Response::json(['pages' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    /** GET /api/pages/{slug} - Public single page/policy */
    public function getPage(string $slug): void
    {
        $stmt = $this->pdo->prepare("SELECT * FROM pages WHERE slug = :slug AND is_active = 1 LIMIT 1");
        $stmt->execute(['slug' => $slug]);
        $page = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$page) {
            Response::error('Page not found', 404);
            return;
        }

        Response::json(['page' => $page]);
    }

    /** GET /api/offers - Active promotions, offers & coupons from database */
    public function getOffers(): void
    {
        $stmt = $this->pdo->query(
            "SELECT * FROM offers
             WHERE is_active = 1
               AND (start_datetime IS NULL OR start_datetime <= NOW())
               AND (end_datetime IS NULL OR end_datetime >= NOW())
             ORDER BY id DESC"
        );
        $offers = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $couponStmt = $this->pdo->query(
            "SELECT id, code, name, description, discount_type, discount_value, min_order_amount, max_discount_amount
             FROM coupons
             WHERE status = 'ACTIVE'
               AND (start_at IS NULL OR start_at <= NOW())
               AND (end_at IS NULL OR end_at >= NOW())
             ORDER BY id DESC"
        );
        $coupons = $couponStmt->fetchAll(PDO::FETCH_ASSOC);

        Response::json([
            'offers' => $offers,
            'coupons' => $coupons,
        ]);
    }

    /** GET /api/offers/flash-deal - Current active flash deal with real end_datetime */
    public function getFlashDeal(): void
    {
        $stmt = $this->pdo->query(
            "SELECT * FROM offers
             WHERE is_active = 1
               AND offer_type = 'FLASH_DEAL'
               AND start_datetime <= NOW()
               AND end_datetime >= NOW()
             ORDER BY id DESC
             LIMIT 1"
        );
        $deal = $stmt->fetch(PDO::FETCH_ASSOC);

        Response::json(['flash_deal' => $deal ?: null]);
    }

    /** GET /api/settings/notifications - Fetch notification thresholds, daily limits & Redis/FCM status */
    public function getNotificationSettings(): void
    {
        $claims = \App\Middleware\JwtAuthMiddleware::authenticate();

        $notifications = new \App\Services\NotificationService($this->pdo);
        $deviceTokens = new \App\Services\DeviceTokenService($this->pdo);
        $fcm = new \App\Services\FcmSenderService($deviceTokens);
        $broadcastService = new \App\Services\BroadcastService($this->pdo, $notifications, $deviceTokens, $fcm);
        $priceDropService = new \App\Services\PriceDropNotificationService($this->pdo, $broadcastService);
        $redis = new \App\Services\RedisQueueService();

        $settings = $priceDropService->getSettings();
        $redisStats = $redis->getStats();
        $fcmConfigured = $fcm->isConfigured();

        Response::json([
            'settings' => $settings,
            'redis' => $redisStats,
            'fcm' => [
                'configured' => $fcmConfigured,
                'enabled' => \App\Helpers\Config::get('fcm.enabled', false),
                'project_id' => \App\Helpers\Config::get('fcm.project_id', ''),
            ],
        ]);
    }

    /** PUT /api/settings/notifications - Update discount thresholds and daily notification limits */
    public function updateNotificationSettings(): void
    {
        $claims = \App\Middleware\JwtAuthMiddleware::authenticate();
        \App\Middleware\PermissionMiddleware::require($claims, 'settings.manage');

        $input = \App\Helpers\Request::json();

        $notifications = new \App\Services\NotificationService($this->pdo);
        $deviceTokens = new \App\Services\DeviceTokenService($this->pdo);
        $fcm = new \App\Services\FcmSenderService($deviceTokens);
        $broadcastService = new \App\Services\BroadcastService($this->pdo, $notifications, $deviceTokens, $fcm);
        $priceDropService = new \App\Services\PriceDropNotificationService($this->pdo, $broadcastService);

        $priceDropService->updateSettings($input);

        Response::json([
            'updated' => true,
            'settings' => $priceDropService->getSettings(),
            'message' => 'Notification threshold and daily discount limits updated successfully',
        ]);
    }

    /** POST /api/settings/notifications/test-redis - Test Redis connection and push capability */
    public function testRedisConnection(): void
    {
        $claims = \App\Middleware\JwtAuthMiddleware::authenticate();
        \App\Middleware\PermissionMiddleware::require($claims, 'settings.manage');

        $redis = new \App\Services\RedisQueueService();
        $stats = $redis->getStats();

        Response::json([
            'success' => $stats['connected'],
            'redis' => $stats,
            'message' => $stats['connected']
                ? "Successfully connected to Redis server ({$stats['host']}:{$stats['port']}) via {$stats['driver']}."
                : "Unable to connect to Redis server at {$stats['host']}:{$stats['port']}. Failover synchronous dispatch is active.",
        ]);
    }
}
