<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * In-app notification history for both staff (`USER`) and `CUSTOMER`
 * recipients, backed by the `notifications` table (migration 0038).
 * Every read/write here is scoped to a single (recipient_type,
 * recipient_id) pair supplied by the CALLER — controllers must derive
 * that pair from the authenticated JWT claims, never from a request body
 * or query string, so one customer/staff member can never read or
 * mark-read another's notifications (see NotificationController).
 *
 * This service only ever persists the in-app record. Push delivery
 * (FcmSenderService) is a separate, best-effort concern — see create()'s
 * docblock.
 */
final class NotificationService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Creates the persistent in-app notification row and returns its id.
     * This is the one durable fact of "this event happened" — callers
     * push to FCM (if configured) as a separate, swallow-errors step
     * afterward, so a push failure can never make an event look like it
     * was never recorded, and a push success is never required for the
     * in-app bell/badge to work.
     *
     * @param array<string, mixed>|null $data
     */
    public function create(
        string $recipientType,
        int $recipientId,
        string $type,
        string $title,
        string $body,
        ?string $referenceType = null,
        ?int $referenceId = null,
        ?array $data = null,
    ): int {
        $this->pdo->prepare(
            'INSERT INTO notifications (recipient_type, recipient_id, type, title, body, reference_type, reference_id, data)
             VALUES (:recipient_type, :recipient_id, :type, :title, :body, :reference_type, :reference_id, :data)'
        )->execute([
            'recipient_type' => $recipientType,
            'recipient_id' => $recipientId,
            'type' => $type,
            'title' => $title,
            'body' => $body,
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
            'data' => $data !== null ? json_encode($data) : null,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * Creates one notification per recipient id — used for "notify every
     * admin with orders.manage", never for broadcasting to unrelated
     * users. Returns the created row ids.
     *
     * @param list<int> $recipientIds
     * @param array<string, mixed>|null $data
     * @return list<int>
     */
    public function createForMany(
        string $recipientType,
        array $recipientIds,
        string $type,
        string $title,
        string $body,
        ?string $referenceType = null,
        ?int $referenceId = null,
        ?array $data = null,
    ): array {
        $ids = [];
        foreach (array_unique($recipientIds) as $recipientId) {
            $ids[] = $this->create($recipientType, (int) $recipientId, $type, $title, $body, $referenceType, $referenceId, $data);
        }

        return $ids;
    }

    /**
     * @return array{items: list<array<string, mixed>>, total: int, unread_count: int}
     */
    public function listForRecipient(string $recipientType, int $recipientId, int $page = 1, int $limit = 20): array
    {
        $page = max(1, $page);
        $limit = max(1, min(100, $limit));
        $offset = ($page - 1) * $limit;

        $totalStmt = $this->pdo->prepare(
            'SELECT COUNT(*) FROM notifications WHERE recipient_type = :type AND recipient_id = :id'
        );
        $totalStmt->execute(['type' => $recipientType, 'id' => $recipientId]);
        $total = (int) $totalStmt->fetchColumn();

        $stmt = $this->pdo->prepare(
            'SELECT id, type, title, body, reference_type, reference_id, data, is_read, read_at, created_at
             FROM notifications
             WHERE recipient_type = :type AND recipient_id = :id
             ORDER BY created_at DESC, id DESC
             LIMIT :limit OFFSET :offset'
        );
        $stmt->bindValue('type', $recipientType);
        $stmt->bindValue('id', $recipientId, PDO::PARAM_INT);
        $stmt->bindValue('limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue('offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $items = array_map(static function (array $row): array {
            $row['is_read'] = (bool) $row['is_read'];
            $row['data'] = $row['data'] !== null ? json_decode((string) $row['data'], true) : null;

            return $row;
        }, $stmt->fetchAll());

        return [
            'items' => $items,
            'total' => $total,
            'unread_count' => $this->unreadCount($recipientType, $recipientId),
        ];
    }

    public function unreadCount(string $recipientType, int $recipientId): int
    {
        $stmt = $this->pdo->prepare(
            'SELECT COUNT(*) FROM notifications WHERE recipient_type = :type AND recipient_id = :id AND is_read = 0'
        );
        $stmt->execute(['type' => $recipientType, 'id' => $recipientId]);

        return (int) $stmt->fetchColumn();
    }

    /**
     * Marks one notification read — but only if it actually belongs to
     * (recipientType, recipientId); the WHERE clause is the
     * authorization check, not just a lookup, so a caller can never
     * flip another recipient's notification by guessing an id.
     */
    public function markRead(string $recipientType, int $recipientId, int $notificationId): void
    {
        $stmt = $this->pdo->prepare(
            "UPDATE notifications SET is_read = 1, read_at = NOW()
             WHERE id = :id AND recipient_type = :type AND recipient_id = :recipient_id AND is_read = 0"
        );
        $stmt->execute(['id' => $notificationId, 'type' => $recipientType, 'recipient_id' => $recipientId]);

        if ($stmt->rowCount() === 0) {
            // Either it doesn't exist, already read, or belongs to someone
            // else — all three are indistinguishable to the caller on
            // purpose (never confirm/deny another recipient's data by id).
            $existsStmt = $this->pdo->prepare('SELECT 1 FROM notifications WHERE id = :id AND recipient_type = :type AND recipient_id = :recipient_id');
            $existsStmt->execute(['id' => $notificationId, 'type' => $recipientType, 'recipient_id' => $recipientId]);
            if ($existsStmt->fetchColumn() === false) {
                throw new RuntimeException('Notification not found');
            }
        }
    }

    public function markAllRead(string $recipientType, int $recipientId): int
    {
        $stmt = $this->pdo->prepare(
            "UPDATE notifications SET is_read = 1, read_at = NOW()
             WHERE recipient_type = :type AND recipient_id = :id AND is_read = 0"
        );
        $stmt->execute(['type' => $recipientType, 'id' => $recipientId]);

        return $stmt->rowCount();
    }
}
