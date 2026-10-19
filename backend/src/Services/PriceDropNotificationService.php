<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use Throwable;

/**
 * Handles automated price drop detection and customer push notification dispatch.
 * Enforces configured minimum discount threshold percentage and daily push limits.
 */
class PriceDropNotificationService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly BroadcastService $broadcastService,
    ) {
    }

    /**
     * Check if a price drop qualifies for customer push notification and dispatch it.
     *
     * @return array{
     *   triggered: bool,
     *   reason: string,
     *   discount_percent?: float,
     *   campaign_id?: int
     * }
     */
    public function handlePriceDrop(
        int $variantId,
        float $oldPrice,
        float $newPrice,
        int $changedByUserId,
    ): array {
        // Must be an actual price reduction
        if ($oldPrice <= 0 || $newPrice >= $oldPrice) {
            return [
                'triggered' => false,
                'reason' => 'Price did not decrease or old price was zero.',
            ];
        }

        // Check if price drop notifications are enabled
        $enabled = $this->getSetting('notification_price_drop_enabled', '1');
        if ($enabled !== '1') {
            return [
                'triggered' => false,
                'reason' => 'Price drop notifications are disabled in settings.',
            ];
        }

        $discountPercent = round((($oldPrice - $newPrice) / $oldPrice) * 100, 1);
        $threshold = (float) $this->getSetting('notification_discount_threshold_percent', '10.0');

        if ($discountPercent < $threshold) {
            return [
                'triggered' => false,
                'discount_percent' => $discountPercent,
                'reason' => "Discount of {$discountPercent}% is below the configured threshold of {$threshold}%.",
            ];
        }

        // Enforce daily discount notification limit
        $dailyLimit = (int) $this->getSetting('notification_daily_discount_limit', '5');
        $sentToday = $this->getSentNotificationsCountToday();

        if ($sentToday >= $dailyLimit) {
            return [
                'triggered' => false,
                'discount_percent' => $discountPercent,
                'reason' => "Daily discount notification limit ({$dailyLimit}) reached ({$sentToday} already sent today).",
            ];
        }

        // Fetch product & variant metadata
        $stmt = $this->pdo->prepare(
            "SELECT p.id AS product_id, p.name AS product_name, p.slug AS product_slug,
                    v.sku, v.retail_price, v.mrp
             FROM product_variants v
             JOIN products p ON p.id = v.product_id
             WHERE v.id = :id AND v.deleted_at IS NULL"
        );
        $stmt->execute(['id' => $variantId]);
        $info = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$info) {
            return [
                'triggered' => false,
                'reason' => 'Variant or product not found.',
            ];
        }

        $productName = (string) $info['product_name'];
        $productId = (int) $info['product_id'];
        $slug = (string) $info['product_slug'];

        $title = "🔥 Price Drop: {$productName} ({$discountPercent}% OFF!)";
        $body = "Great news! {$productName} price dropped from ₹" . number_format($oldPrice, 2) . " to just ₹" . number_format($newPrice, 2) . ". Grab it while stocks last!";

        try {
            $campaignResult = $this->broadcastService->sendToCustomers(
                title: $title,
                body: $body,
                sentByUserId: $changedByUserId,
                targetCustomerIds: [], // all active customers
                type: 'PRICE_DROP',
                data: [
                    'type' => 'PRICE_DROP',
                    'product_id' => (string) $productId,
                    'variant_id' => (string) $variantId,
                    'old_price' => (string) $oldPrice,
                    'new_price' => (string) $newPrice,
                    'discount_percent' => (string) $discountPercent,
                    'url' => "/product/{$slug}",
                    'click_action' => "/product/{$slug}",
                ],
                referenceType: 'PRODUCT',
                referenceId: $productId,
            );

            return [
                'triggered' => true,
                'discount_percent' => $discountPercent,
                'campaign_id' => $campaignResult['campaign_id'],
                'reason' => "Notification successfully dispatched ({$discountPercent}% drop meets {$threshold}% threshold).",
            ];
        } catch (Throwable $e) {
            error_log('[PriceDropNotificationService] Dispatch error: ' . $e->getMessage());
            return [
                'triggered' => false,
                'discount_percent' => $discountPercent,
                'reason' => 'Failed to dispatch push notification: ' . $e->getMessage(),
            ];
        }
    }

    /**
     * Check if a new coupon qualifies under the discount threshold and daily limit.
     */
    public function shouldNotifyNewCoupon(string $discountType, float $discountVal, ?float $minOrderAmount): bool
    {
        $enabled = $this->getSetting('notification_coupon_enabled', '1');
        if ($enabled !== '1') {
            return false;
        }

        $threshold = (float) $this->getSetting('notification_discount_threshold_percent', '10.0');

        $effectivePercent = $discountVal;
        if ($discountType === 'FIXED' && $minOrderAmount && $minOrderAmount > 0) {
            $effectivePercent = round(($discountVal / $minOrderAmount) * 100, 1);
        }

        if ($effectivePercent < $threshold) {
            return false;
        }

        $dailyLimit = (int) $this->getSetting('notification_daily_discount_limit', '5');
        $sentToday = $this->getSentNotificationsCountToday();

        return $sentToday < $dailyLimit;
    }

    public function getSentNotificationsCountToday(): int
    {
        try {
            $stmt = $this->pdo->query(
                "SELECT COUNT(*) FROM broadcast_campaigns 
                 WHERE DATE(created_at) = CURRENT_DATE()
                   AND (title LIKE '%Price Drop%' OR title LIKE '%Coupon%' OR title LIKE '%Off%' OR title LIKE '%Discount%')"
            );
            return (int) $stmt->fetchColumn();
        } catch (Throwable $e) {
            return 0;
        }
    }

    public function getSettings(): array
    {
        return [
            'threshold_percent' => (float) $this->getSetting('notification_discount_threshold_percent', '10.0'),
            'daily_limit' => (int) $this->getSetting('notification_daily_discount_limit', '5'),
            'price_drop_enabled' => $this->getSetting('notification_price_drop_enabled', '1') === '1',
            'coupon_enabled' => $this->getSetting('notification_coupon_enabled', '1') === '1',
            'redis_enabled' => $this->getSetting('notification_redis_enabled', '1') === '1',
            'sent_today' => $this->getSentNotificationsCountToday(),
        ];
    }

    public function updateSettings(array $input): void
    {
        if (isset($input['threshold_percent'])) {
            $val = max(1.0, min(99.0, (float) $input['threshold_percent']));
            $this->setSetting('notification_discount_threshold_percent', (string) $val);
        }

        if (isset($input['daily_limit'])) {
            $val = max(1, min(100, (int) $input['daily_limit']));
            $this->setSetting('notification_daily_discount_limit', (string) $val);
        }

        if (isset($input['price_drop_enabled'])) {
            $this->setSetting('notification_price_drop_enabled', !empty($input['price_drop_enabled']) ? '1' : '0');
        }

        if (isset($input['coupon_enabled'])) {
            $this->setSetting('notification_coupon_enabled', !empty($input['coupon_enabled']) ? '1' : '0');
        }

        if (isset($input['redis_enabled'])) {
            $this->setSetting('notification_redis_enabled', !empty($input['redis_enabled']) ? '1' : '0');
        }
    }

    private function getSetting(string $key, string $default): string
    {
        try {
            $stmt = $this->pdo->prepare("SELECT setting_value FROM app_settings WHERE setting_key = :k LIMIT 1");
            $stmt->execute(['k' => $key]);
            $val = $stmt->fetchColumn();
            return $val !== false ? (string) $val : $default;
        } catch (Throwable $e) {
            return $default;
        }
    }

    private function setSetting(string $key, string $value): void
    {
        $stmt = $this->pdo->prepare(
            "INSERT INTO app_settings (setting_key, setting_value) 
             VALUES (:k, :v) 
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()"
        );
        $stmt->execute(['k' => $key, 'v' => $value]);
    }
}
