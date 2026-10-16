<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Services\NotificationService;
use PDO;
use RuntimeException;

/**
 * Serves both staff (admin-pos) and customer (storefront) notification
 * feeds through the same four endpoints — the recipient is always
 * derived from the caller's own JWT claims (never a request parameter),
 * so one authenticated identity can only ever see or modify its own
 * notifications. See NotificationService for the actual authorization
 * checks (the WHERE clauses, not just this derivation).
 */
final class NotificationController
{
    private readonly NotificationService $notifications;

    public function __construct(private readonly PDO $pdo)
    {
        $this->notifications = new NotificationService($pdo);
    }

    public function index(): void
    {
        [$recipientType, $recipientId] = $this->currentRecipient();

        $page = max(1, (int) ($_GET['page'] ?? 1));
        $limit = max(1, min(100, (int) ($_GET['limit'] ?? 20)));

        $isRead = null;
        if (isset($_GET['is_read'])) {
            $val = filter_var($_GET['is_read'], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);
            if ($val !== null) {
                $isRead = $val;
            }
        } elseif (isset($_GET['status'])) {
            if ($_GET['status'] === 'unread') {
                $isRead = false;
            } elseif ($_GET['status'] === 'read') {
                $isRead = true;
            }
        } elseif (isset($_GET['unread_only']) && filter_var($_GET['unread_only'], FILTER_VALIDATE_BOOLEAN)) {
            $isRead = false;
        }

        Response::json($this->notifications->listForRecipient($recipientType, $recipientId, $page, $limit, $isRead));
    }

    public function unreadCount(): void
    {
        [$recipientType, $recipientId] = $this->currentRecipient();

        Response::json(['unread_count' => $this->notifications->unreadCount($recipientType, $recipientId)]);
    }

    public function markRead(string $id): void
    {
        [$recipientType, $recipientId] = $this->currentRecipient();

        try {
            $this->notifications->markRead($recipientType, $recipientId, (int) $id);
            Response::json(['ok' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 404);
        }
    }

    public function markUnread(string $id): void
    {
        [$recipientType, $recipientId] = $this->currentRecipient();

        try {
            $this->notifications->markUnread($recipientType, $recipientId, (int) $id);
            Response::json(['ok' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 404);
        }
    }

    public function markAllRead(): void
    {
        [$recipientType, $recipientId] = $this->currentRecipient();

        $count = $this->notifications->markAllRead($recipientType, $recipientId);
        Response::json(['ok' => true, 'marked' => $count]);
    }

    public function destroy(string $id): void
    {
        [$recipientType, $recipientId] = $this->currentRecipient();

        try {
            $this->notifications->destroy($recipientType, $recipientId, (int) $id);
            Response::json(['ok' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 404);
        }
    }

    /** @return array{0: string, 1: int} [recipient_type, recipient_id] */
    private function currentRecipient(): array
    {
        $claims = JwtAuthMiddleware::authenticate();
        $type = ($claims['type'] ?? null) === 'customer' ? 'CUSTOMER' : 'USER';

        if ($type === 'USER' && ($claims['type'] ?? null) !== 'staff') {
            Response::error('Forbidden', 403);
        }

        return [$type, (int) $claims['sub']];
    }
}
