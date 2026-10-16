<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Admin -> all-customers broadcast push notifications. Deliberately
 * synchronous: this project has no background job queue anywhere in its
 * architecture, and introducing one just for this one feature would be
 * exactly the "duplicate architecture" the brief warns against — so a
 * broadcast is sent within the triggering HTTP request, kept fast via
 * FcmSenderService::sendBatch()'s bounded parallelism rather than one
 * blocking request per device. For a customer base large enough that
 * this stops being fast enough, the honest fix is a real queue — not
 * something to fake here.
 *
 * Reuses the existing notification architecture end to end:
 * NotificationService for the in-app record (one row per recipient,
 * same shape every other notification type already uses),
 * DeviceTokenService for token lookup, FcmSenderService for delivery.
 * The only new storage is broadcast_campaigns — an audit/result record
 * that has no equivalent anywhere else in the schema.
 */
final class BroadcastService
{
    private const MIN_SECONDS_BETWEEN_CAMPAIGNS = 10;

    public function __construct(
        private readonly PDO $pdo,
        private readonly NotificationService $notifications,
        private readonly DeviceTokenService $deviceTokens,
        private readonly FcmSenderService $fcm,
    ) {
    }

    /**
     * @return array{
     *   campaign_id: int, status: string, recipient_customer_count: int,
     *   token_count: int, success_count: int, failure_count: int,
     *   message: string, duplicate: bool
     * }
     */
    public function send(
        string $title,
        string $body,
        int $sentByUserId,
        ?string $idempotencyKey,
        string $type = 'OFFER',
        ?array $data = null,
    ): array
    {
        $title = trim($title);
        $body = trim($body);

        if ($title === '') {
            throw new RuntimeException('Title is required');
        }
        if (mb_strlen($title) > 255) {
            throw new RuntimeException('Title must be 255 characters or fewer');
        }
        if ($body === '') {
            throw new RuntimeException('Message is required');
        }
        if (mb_strlen($body) > 500) {
            throw new RuntimeException('Message must be 500 characters or fewer');
        }

        // Idempotency: the SAME client-generated key (one per compose
        // session, regenerated after each send — see the frontend) maps
        // to at most one campaign. A retried/double-submitted request
        // with the same key returns the original result instead of
        // sending a second time.
        if ($idempotencyKey !== null && $idempotencyKey !== '') {
            $existing = $this->findByIdempotencyKey($idempotencyKey);
            if ($existing !== null) {
                $existing['duplicate'] = true;
                $existing['message'] = 'This notification was already sent — showing the original result.';

                return $existing;
            }
        }

        $this->assertNotRateLimited($sentByUserId);

        // Eligible = customer accounts only, active, not soft-deleted —
        // never a role/status rule the frontend could influence. Staff/
        // admin/cashier accounts live in `users`, a completely separate
        // table, so there is no risk of a non-customer ever being
        // selected here.
        $customerIds = $this->pdo->query(
            "SELECT id FROM customers WHERE status = 'ACTIVE' AND deleted_at IS NULL"
        )->fetchAll(PDO::FETCH_COLUMN);
        $customerIds = array_map('intval', $customerIds);

        $campaignId = $this->createCampaign($title, $body, $sentByUserId, $idempotencyKey, count($customerIds));

        if ($customerIds === []) {
            $this->completeCampaign($campaignId, 0, 0, 0);

            return [
                'campaign_id' => $campaignId,
                'status' => 'COMPLETED',
                'recipient_customer_count' => 0,
                'token_count' => 0,
                'success_count' => 0,
                'failure_count' => 0,
                'message' => 'No eligible customer devices are registered for push notifications.',
                'duplicate' => false,
            ];
        }

        $normalizedType = trim(strtoupper($type));
        if ($normalizedType === '') {
            $normalizedType = 'OFFER';
        }

        // In-app record first, for every eligible customer, regardless of
        // whether they have a push token — this is what their own
        // notification bell shows, independent of push delivery (see
        // NotificationService::create()'s docblock on that separation).
        $this->notifications->createForMany(
            recipientType: 'CUSTOMER',
            recipientIds: $customerIds,
            type: $normalizedType,
            title: $title,
            body: $body,
            referenceType: 'BROADCAST_CAMPAIGN',
            referenceId: $campaignId,
            data: $data,
        );

        $tokenRows = $this->deviceTokens->activeTokensForMany('CUSTOMER', $customerIds);
        $tokens = array_values(array_unique(array_column($tokenRows, 'token')));

        $result = ['attempted' => 0, 'sent' => 0];
        if ($tokens !== [] && $this->fcm->isConfigured()) {
            $fcmData = array_merge([
                'type' => $normalizedType,
                'campaign_id' => (string) $campaignId,
                'click_action' => $data['url'] ?? '/',
            ], $data ?? []);
            $result = $this->fcm->sendBatch($tokens, $title, $body, $fcmData);
        }

        $failureCount = $result['attempted'] - $result['sent'];
        $this->completeCampaign($campaignId, count($tokens), $result['sent'], $failureCount);

        $message = $this->resultMessage(count($tokens), $result['sent'], $failureCount, $this->fcm->isConfigured());

        return [
            'campaign_id' => $campaignId,
            'status' => 'COMPLETED',
            'recipient_customer_count' => count($customerIds),
            'token_count' => count($tokens),
            'success_count' => $result['sent'],
            'failure_count' => $failureCount,
            'message' => $message,
            'duplicate' => false,
        ];
    }

    /**
     * Programmatic push notification dispatch to active customers or targeted customer IDs
     * for newly created offers and coupons. Bypasses manual rate limits and never throws,
     * ensuring business operations always succeed even if push delivery encounters an error.
     *
     * @param list<int> $targetCustomerIds
     * @param array<string, mixed>|null $data
     * @return array{
     *   campaign_id: int, status: string, recipient_customer_count: int,
     *   token_count: int, success_count: int, failure_count: int
     * }
     */
    public function sendToCustomers(
        string $title,
        string $body,
        int $sentByUserId,
        array $targetCustomerIds = [],
        string $type = 'OFFER',
        ?array $data = null,
        ?string $referenceType = null,
        ?int $referenceId = null,
    ): array {
        $title = trim($title);
        $body = trim($body);

        if ($title === '' || $body === '') {
            return [
                'campaign_id' => 0,
                'status' => 'SKIPPED',
                'recipient_customer_count' => 0,
                'token_count' => 0,
                'success_count' => 0,
                'failure_count' => 0,
            ];
        }

        if (mb_strlen($title) > 255) {
            $title = mb_substr($title, 0, 252) . '...';
        }
        if (mb_strlen($body) > 500) {
            $body = mb_substr($body, 0, 497) . '...';
        }

        try {
            // 1. Resolve eligible customers
            if ($targetCustomerIds !== []) {
                $placeholders = implode(',', array_fill(0, count($targetCustomerIds), '?'));
                $stmt = $this->pdo->prepare(
                    "SELECT id FROM customers WHERE status = 'ACTIVE' AND deleted_at IS NULL AND id IN ({$placeholders})"
                );
                $stmt->execute(array_values($targetCustomerIds));
                $customerIds = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
            } else {
                $customerIds = $this->pdo->query(
                    "SELECT id FROM customers WHERE status = 'ACTIVE' AND deleted_at IS NULL"
                )->fetchAll(PDO::FETCH_COLUMN);
                $customerIds = array_map('intval', $customerIds);
            }

            $campaignId = $this->createCampaign($title, $body, $sentByUserId, null, count($customerIds));

            if ($customerIds === []) {
                $this->completeCampaign($campaignId, 0, 0, 0);

                return [
                    'campaign_id' => $campaignId,
                    'status' => 'COMPLETED',
                    'recipient_customer_count' => 0,
                    'token_count' => 0,
                    'success_count' => 0,
                    'failure_count' => 0,
                ];
            }

            $normalizedType = trim(strtoupper($type));
            if ($normalizedType === '') {
                $normalizedType = 'OFFER';
            }

            // 2. Persist in-app notification row for all recipients
            $this->notifications->createForMany(
                recipientType: 'CUSTOMER',
                recipientIds: $customerIds,
                type: $normalizedType,
                title: $title,
                body: $body,
                referenceType: $referenceType ?: 'BROADCAST_CAMPAIGN',
                referenceId: $referenceId ?: $campaignId,
                data: $data,
            );

            // 3. Fetch active device tokens
            $tokenRows = $this->deviceTokens->activeTokensForMany('CUSTOMER', $customerIds);
            $tokens = array_values(array_unique(array_column($tokenRows, 'token')));

            // 4. Send FCM push batch
            $result = ['attempted' => 0, 'sent' => 0];
            if ($tokens !== [] && $this->fcm->isConfigured()) {
                $fcmData = array_merge([
                    'type' => $normalizedType,
                    'campaign_id' => (string) $campaignId,
                    'click_action' => $data['click_action'] ?? $data['url'] ?? '/',
                ], $data ?? []);
                $result = $this->fcm->sendBatch($tokens, $title, $body, $fcmData);
            }

            $failureCount = $result['attempted'] - $result['sent'];
            $this->completeCampaign($campaignId, count($tokens), $result['sent'], $failureCount);

            return [
                'campaign_id' => $campaignId,
                'status' => 'COMPLETED',
                'recipient_customer_count' => count($customerIds),
                'token_count' => count($tokens),
                'success_count' => $result['sent'],
                'failure_count' => $failureCount,
            ];
        } catch (\Throwable $e) {
            error_log('BroadcastService::sendToCustomers error: ' . $e->getMessage());

            return [
                'campaign_id' => 0,
                'status' => 'FAILED',
                'recipient_customer_count' => 0,
                'token_count' => 0,
                'success_count' => 0,
                'failure_count' => 0,
            ];
        }
    }

    private function resultMessage(int $tokenCount, int $sent, int $failed, bool $fcmConfigured): string
    {
        if ($tokenCount === 0) {
            return 'No eligible customer devices are registered for push notifications. The notification was still saved to each customer\'s account.';
        }

        if (!$fcmConfigured) {
            return "Notification saved for {$tokenCount} registered device(s), but push delivery is not configured on this server yet (no Firebase service-account credentials) — nothing was actually pushed.";
        }

        if ($failed === 0) {
            return "Notification campaign processed successfully. {$sent} of {$tokenCount} device(s) accepted the push.";
        }

        if ($sent === 0) {
            return "Notification campaign failed to deliver to any of the {$tokenCount} registered device(s). The notification was still saved to each customer's account.";
        }

        return "Notification campaign processed with partial success: {$sent} of {$tokenCount} device(s) accepted the push, {$failed} failed.";
    }

    private function assertNotRateLimited(int $sentByUserId): void
    {
        $stmt = $this->pdo->prepare(
            'SELECT TIMESTAMPDIFF(SECOND, created_at, NOW()) AS seconds_since
             FROM broadcast_campaigns
             WHERE sent_by_user_id = :user_id
             ORDER BY id DESC LIMIT 1'
        );
        $stmt->execute(['user_id' => $sentByUserId]);
        $secondsSince = $stmt->fetchColumn();

        if ($secondsSince === false || $secondsSince === null) {
            return;
        }

        $secondsSince = (int) $secondsSince;
        if ($secondsSince >= 0 && $secondsSince < self::MIN_SECONDS_BETWEEN_CAMPAIGNS) {
            $wait = self::MIN_SECONDS_BETWEEN_CAMPAIGNS - $secondsSince;
            throw new RuntimeException("Please wait {$wait} more second(s) before sending another broadcast notification.");
        }
    }

    /** @return array<string, mixed>|null */
    private function findByIdempotencyKey(string $key): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM broadcast_campaigns WHERE idempotency_key = :key');
        $stmt->execute(['key' => $key]);
        $row = $stmt->fetch();

        if ($row === false) {
            return null;
        }

        return [
            'campaign_id' => (int) $row['id'],
            'status' => $row['status'],
            'recipient_customer_count' => (int) $row['recipient_customer_count'],
            'token_count' => (int) $row['token_count'],
            'success_count' => (int) $row['success_count'],
            'failure_count' => (int) $row['failure_count'],
        ];
    }

    private function createCampaign(string $title, string $body, int $sentByUserId, ?string $idempotencyKey, int $recipientCount): int
    {
        $this->pdo->prepare(
            'INSERT INTO broadcast_campaigns (title, body, sent_by_user_id, idempotency_key, recipient_customer_count, status)
             VALUES (:title, :body, :user_id, :idempotency_key, :recipient_count, \'PROCESSING\')'
        )->execute([
            'title' => $title,
            'body' => $body,
            'user_id' => $sentByUserId,
            'idempotency_key' => $idempotencyKey !== '' ? $idempotencyKey : null,
            'recipient_count' => $recipientCount,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    private function completeCampaign(int $campaignId, int $tokenCount, int $successCount, int $failureCount): void
    {
        $this->pdo->prepare(
            "UPDATE broadcast_campaigns
             SET token_count = :token_count, success_count = :success_count, failure_count = :failure_count,
                 status = 'COMPLETED', completed_at = NOW()
             WHERE id = :id"
        )->execute([
            'token_count' => $tokenCount,
            'success_count' => $successCount,
            'failure_count' => $failureCount,
            'id' => $campaignId,
        ]);
    }

    /** @return array{items: list<array<string, mixed>>, total: int} recent campaigns, newest first — for the admin page's history list */
    public function listCampaigns(int $page = 1, int $limit = 20): array
    {
        $page = max(1, $page);
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        $total = (int) $this->pdo->query('SELECT COUNT(*) FROM broadcast_campaigns')->fetchColumn();

        $stmt = $this->pdo->prepare(
            'SELECT c.id, c.title, c.body, c.recipient_customer_count, c.token_count, c.success_count, c.failure_count,
                    c.status, c.created_at, c.completed_at, u.name AS sent_by_name
             FROM broadcast_campaigns c
             LEFT JOIN users u ON u.id = c.sent_by_user_id
             ORDER BY c.id DESC
             LIMIT :limit OFFSET :offset'
        );
        $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue('offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return ['items' => $stmt->fetchAll(), 'total' => $total];
    }
}
