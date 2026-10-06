<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Refund management (ECOMMERCE_POS_ADMIN_SPEC.md section 23). A refund
 * is requested the moment a paid order/invoice is cancelled
 * (createForOrder/createForInvoice, called from within that cancellation's
 * own transaction — these never begin/commit their own, same convention
 * as CouponService::recordUsage). Processing it (actually moving money)
 * is a separate, explicit step — process() — mirroring a real gateway's
 * async refund flow even though there's no real gateway wired up yet.
 */
final class RefundService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function createForOrder(int $orderId, int $customerId, string $amount, string $reason, string $method): int
    {
        return $this->create(['order_id' => $orderId, 'invoice_id' => null], $customerId, $amount, $reason, $method);
    }

    public function createForInvoice(int $invoiceId, ?int $customerId, string $amount, string $reason, string $method): int
    {
        return $this->create(['order_id' => null, 'invoice_id' => $invoiceId], $customerId, $amount, $reason, $method);
    }

    /** @param array{order_id: int|null, invoice_id: int|null} $source */
    private function create(array $source, ?int $customerId, string $amount, string $reason, string $method): int
    {
        if (bccomp($amount, '0', 2) <= 0) {
            throw new RuntimeException('Refund amount must be greater than zero');
        }

        $refundNo = 'REF-' . date('Ymd') . '-' . random_int(1000, 9999);

        $this->pdo->prepare(
            "INSERT INTO refunds (refund_no, order_id, invoice_id, customer_id, amount, reason, method, status)
             VALUES (:no, :order_id, :invoice_id, :customer_id, :amount, :reason, :method, 'PENDING')"
        )->execute([
            'no' => $refundNo,
            'order_id' => $source['order_id'],
            'invoice_id' => $source['invoice_id'],
            'customer_id' => $customerId,
            'amount' => $amount,
            'reason' => $reason,
            'method' => $method,
        ]);

        $refundId = (int) $this->pdo->lastInsertId();

        $this->pdo->prepare(
            "INSERT INTO refund_transactions (refund_id, from_status, to_status) VALUES (:id, NULL, 'PENDING')"
        )->execute(['id' => $refundId]);

        return $refundId;
    }

    /**
     * Processes a pending/failed refund (top-level entry point — begins
     * its own transaction). Mocked: always succeeds unless the caller
     * explicitly forces a failure, since there's no real gateway.
     */
    public function process(int $refundId, int $processedByUserId, bool $forceFailure = false, ?string $failureReason = null): array
    {
        $refund = $this->find($refundId);

        if ($refund === null) {
            throw new RuntimeException('Refund not found');
        }

        if (!in_array($refund['status'], ['PENDING', 'FAILED'], true)) {
            throw new RuntimeException("Refund is {$refund['status']} and cannot be processed again");
        }

        $this->pdo->beginTransaction();

        try {
            $fromStatus = $refund['status'];
            $toStatus = $forceFailure ? 'FAILED' : 'COMPLETED';
            $gatewayRefundId = $forceFailure ? null : 'MOCK-' . strtoupper(bin2hex(random_bytes(6)));

            $this->pdo->prepare(
                'UPDATE refunds SET status = :status, processed_at = NOW(), processed_by = :by, gateway_refund_id = :gw
                 WHERE id = :id'
            )->execute([
                'status' => $toStatus,
                'by' => $processedByUserId,
                'gw' => $gatewayRefundId,
                'id' => $refundId,
            ]);

            $this->pdo->prepare(
                'INSERT INTO refund_transactions (refund_id, from_status, to_status, gateway_response)
                 VALUES (:id, :from_status, :to_status, :response)'
            )->execute([
                'id' => $refundId,
                'from_status' => $fromStatus,
                'to_status' => $toStatus,
                'response' => $forceFailure
                    ? json_encode(['error' => $failureReason ?? 'Simulated failure'])
                    : json_encode(['gateway_refund_id' => $gatewayRefundId]),
            ]);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return $this->find($refundId) ?? throw new RuntimeException('Refund not found after processing');
    }

    public function cancel(int $refundId, string $reason): array
    {
        $refund = $this->find($refundId);

        if ($refund === null) {
            throw new RuntimeException('Refund not found');
        }

        if ($refund['status'] !== 'PENDING') {
            throw new RuntimeException('Only a pending refund can be cancelled');
        }

        $this->pdo->beginTransaction();

        try {
            $this->pdo->prepare("UPDATE refunds SET status = 'CANCELLED' WHERE id = :id")->execute(['id' => $refundId]);

            $this->pdo->prepare(
                "INSERT INTO refund_transactions (refund_id, from_status, to_status, gateway_response)
                 VALUES (:id, 'PENDING', 'CANCELLED', :response)"
            )->execute(['id' => $refundId, 'response' => json_encode(['reason' => $reason])]);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        return $this->find($refundId) ?? throw new RuntimeException('Refund not found after cancellation');
    }

    /** @param array<string, mixed> $filters */
    public function list(array $filters): array
    {
        $where = [];
        $params = [];

        if (!empty($filters['status'])) {
            $where[] = 'status = :status';
            $params['status'] = $filters['status'];
        }

        if (!empty($filters['customer_id'])) {
            $where[] = 'customer_id = :customer_id';
            $params['customer_id'] = (int) $filters['customer_id'];
        }

        $whereSql = $where === [] ? '1=1' : implode(' AND ', $where);

        $stmt = $this->pdo->prepare("SELECT * FROM refunds WHERE {$whereSql} ORDER BY requested_at DESC LIMIT 200");
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    /** @return array<string, mixed>|null */
    public function find(int $refundId): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM refunds WHERE id = :id');
        $stmt->execute(['id' => $refundId]);
        $refund = $stmt->fetch();

        if ($refund === false) {
            return null;
        }

        $events = $this->pdo->prepare('SELECT * FROM refund_transactions WHERE refund_id = :id ORDER BY created_at');
        $events->execute(['id' => $refundId]);
        $refund['transactions'] = $events->fetchAll();

        return $refund;
    }

    /** Dashboard/report summary (section 23/42: Total/Pending/Completed refund amounts). */
    public function summary(): array
    {
        return $this->pdo->query(
            "SELECT
                COUNT(*) AS total_refunds,
                COALESCE(SUM(amount), 0) AS total_refund_amount,
                COALESCE(SUM(CASE WHEN status = 'PENDING' THEN amount ELSE 0 END), 0) AS pending_refund_amount,
                COALESCE(SUM(status = 'PENDING'), 0) AS pending_count,
                COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN amount ELSE 0 END), 0) AS completed_refund_amount,
                COALESCE(SUM(status = 'COMPLETED'), 0) AS completed_count,
                COALESCE(SUM(status = 'FAILED'), 0) AS failed_count
             FROM refunds"
        )->fetch();
    }
}
