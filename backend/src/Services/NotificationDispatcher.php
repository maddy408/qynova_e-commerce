<?php

declare(strict_types=1);

namespace App\Services;

use PDO;

/**
 * Single entry point business services (OrderService, InventoryService,
 * ...) call to raise a notification — composes NotificationService (the
 * durable in-app record), DeviceTokenService (who to push to) and
 * FcmSenderService (best-effort push) so each business service only
 * takes on ONE new optional dependency instead of three.
 *
 * Every method here persists the in-app record FIRST and unconditionally,
 * then attempts push delivery wrapped in its own try/catch — a push
 * failure (FCM down, no token, not configured) is swallowed and logged,
 * never allowed to propagate into the caller's transaction/response.
 * Callers must only ever invoke this AFTER their own business write has
 * committed (see OrderService's call sites) — never inside the same
 * try/catch as the order mutation itself.
 */
final class NotificationDispatcher
{
    private readonly NotificationService $notifications;
    private readonly DeviceTokenService $deviceTokens;
    private readonly FcmSenderService $fcm;

    public function __construct(
        PDO $pdo,
        ?NotificationService $notifications = null,
        ?DeviceTokenService $deviceTokens = null,
        ?FcmSenderService $fcm = null,
    ) {
        $this->notifications = $notifications ?? new NotificationService($pdo);
        $this->deviceTokens = $deviceTokens ?? new DeviceTokenService($pdo);
        $this->fcm = $fcm ?? new FcmSenderService($this->deviceTokens);
    }

    /** @param array<string, mixed>|null $data */
    public function notify(
        string $recipientType,
        int $recipientId,
        string $type,
        string $title,
        string $body,
        ?string $referenceType = null,
        ?int $referenceId = null,
        ?array $data = null,
    ): int {
        $id = $this->notifications->create($recipientType, $recipientId, $type, $title, $body, $referenceType, $referenceId, $data);

        $this->pushBestEffort($recipientType, $recipientId, $type, $title, $body, $referenceType, $referenceId, $data ?? []);

        return $id;
    }

    /**
     * @param list<int> $recipientIds
     * @param array<string, mixed>|null $data
     * @return list<int>
     */
    public function notifyMany(
        string $recipientType,
        array $recipientIds,
        string $type,
        string $title,
        string $body,
        ?string $referenceType = null,
        ?int $referenceId = null,
        ?array $data = null,
    ): array {
        $ids = $this->notifications->createForMany($recipientType, $recipientIds, $type, $title, $body, $referenceType, $referenceId, $data);

        foreach (array_unique($recipientIds) as $recipientId) {
            $this->pushBestEffort($recipientType, (int) $recipientId, $type, $title, $body, $referenceType, $referenceId, $data ?? []);
        }

        return $ids;
    }

    /** @param array<string, mixed> $data */
    private function pushBestEffort(
        string $recipientType,
        int $recipientId,
        string $type,
        string $title,
        string $body,
        ?string $referenceType,
        ?int $referenceId,
        array $data,
    ): void {
        try {
            if (!$this->fcm->isConfigured()) {
                return;
            }

            $tokens = $this->deviceTokens->activeTokensFor($recipientType, $recipientId);
            if ($tokens === []) {
                return;
            }

            $payload = array_map('strval', $data);
            $payload['type'] = $type;
            if ($referenceType !== null) {
                $payload['reference_type'] = $referenceType;
            }
            if ($referenceId !== null) {
                $payload['reference_id'] = (string) $referenceId;
            }

            $this->fcm->sendToTokens($tokens, $title, $body, $payload);
        } catch (\Throwable $e) {
            error_log('NotificationDispatcher: push delivery failed: ' . $e->getMessage());
        }
    }
}
