<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * The one door onto stock (docs/DOCUMENTATION.md section 11). Every
 * change goes through apply(): locks the variant's inventory row,
 * validates, updates the cache row, and writes an immutable ledger row —
 * all inside the caller's transaction. Never touch `inventory` directly
 * from anywhere else.
 */
final class InventoryService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Must be called inside an open transaction (the caller owns
     * BEGIN/COMMIT/ROLLBACK, since a movement is always part of a larger
     * business change — a sale, a purchase, an adjustment).
     *
     * @return array{on_hand: string, reserved: string, available: string}
     */
    public function apply(
        int $variantId,
        int $productId,
        string $movementType,
        string $onHandDelta,
        string $reservedDelta,
        string $referenceType,
        int $referenceId,
        ?int $referenceItemId,
        string $channel,
        ?int $userId,
        string $idempotencyKey,
        ?string $reason = null,
        ?string $note = null,
        ?string $unitCost = null,
    ): array {
        if (!$this->pdo->inTransaction()) {
            throw new RuntimeException('InventoryService::apply must run inside a transaction');
        }

        $existing = $this->pdo->prepare(
            'SELECT on_hand_after, reserved_after FROM inventory_movements WHERE idempotency_key = :key'
        );
        $existing->execute(['key' => $idempotencyKey]);
        $existingRow = $existing->fetch();

        if ($existingRow !== false) {
            $available = bcsub((string) $existingRow['on_hand_after'], (string) $existingRow['reserved_after'], 3);

            return [
                'on_hand' => $existingRow['on_hand_after'],
                'reserved' => $existingRow['reserved_after'],
                'available' => $available,
            ];
        }

        $this->pdo->prepare(
            'INSERT INTO inventory (variant_id, product_id) VALUES (:variant_id, :product_id)
             ON DUPLICATE KEY UPDATE variant_id = variant_id'
        )->execute(['variant_id' => $variantId, 'product_id' => $productId]);

        $stmt = $this->pdo->prepare(
            'SELECT on_hand, reserved FROM inventory WHERE variant_id = :variant_id FOR UPDATE'
        );
        $stmt->execute(['variant_id' => $variantId]);
        $row = $stmt->fetch();

        $onHandBefore = (string) $row['on_hand'];
        $reservedBefore = (string) $row['reserved'];
        $onHandAfter = bcadd($onHandBefore, $onHandDelta, 3);
        $reservedAfter = bcadd($reservedBefore, $reservedDelta, 3);

        if (bccomp($onHandAfter, '0', 3) < 0) {
            throw new RuntimeException('Insufficient stock');
        }

        if (bccomp($reservedAfter, '0', 3) < 0) {
            throw new RuntimeException('Invalid reservation release');
        }

        if (bccomp($reservedAfter, $onHandAfter, 3) > 0) {
            throw new RuntimeException('Reserved quantity cannot exceed on-hand stock');
        }

        $this->pdo->prepare(
            'UPDATE inventory SET on_hand = :on_hand, reserved = :reserved WHERE variant_id = :variant_id'
        )->execute(['on_hand' => $onHandAfter, 'reserved' => $reservedAfter, 'variant_id' => $variantId]);

        $this->pdo->prepare(
            'INSERT INTO inventory_movements (
                variant_id, product_id, movement_type, on_hand_delta, reserved_delta,
                on_hand_before, on_hand_after, reserved_before, reserved_after,
                unit_cost, reference_type, reference_id, reference_item_id,
                channel, reason, note, user_id, idempotency_key
            ) VALUES (
                :variant_id, :product_id, :movement_type, :on_hand_delta, :reserved_delta,
                :on_hand_before, :on_hand_after, :reserved_before, :reserved_after,
                :unit_cost, :reference_type, :reference_id, :reference_item_id,
                :channel, :reason, :note, :user_id, :idempotency_key
            )'
        )->execute([
            'variant_id' => $variantId,
            'product_id' => $productId,
            'movement_type' => $movementType,
            'on_hand_delta' => $onHandDelta,
            'reserved_delta' => $reservedDelta,
            'on_hand_before' => $onHandBefore,
            'on_hand_after' => $onHandAfter,
            'reserved_before' => $reservedBefore,
            'reserved_after' => $reservedAfter,
            'unit_cost' => $unitCost,
            'reference_type' => $referenceType,
            'reference_id' => $referenceId,
            'reference_item_id' => $referenceItemId,
            'channel' => $channel,
            'reason' => $reason,
            'note' => $note,
            'user_id' => $userId,
            'idempotency_key' => $idempotencyKey,
        ]);

        return [
            'on_hand' => $onHandAfter,
            'reserved' => $reservedAfter,
            'available' => bcsub($onHandAfter, $reservedAfter, 3),
        ];
    }

    /** @return array<string, mixed>|null */
    public function getStock(int $variantId): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM inventory WHERE variant_id = :variant_id');
        $stmt->execute(['variant_id' => $variantId]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /** @return list<array<string, mixed>> */
    public function lowStock(): array
    {
        return $this->pdo->query(
            "SELECT i.*, p.name AS product_name, v.sku, v.barcode
             FROM inventory i
             JOIN product_variants v ON v.id = i.variant_id
             JOIN products p ON p.id = i.product_id
             WHERE i.available <= i.low_stock_threshold
             ORDER BY i.available ASC"
        )->fetchAll();
    }

    /**
     * Creates a stock_adjustments header + items, then applies each item
     * as a STOCK_ADJUSTMENT_IN/OUT movement, all in one transaction.
     *
     * @param list<array{variant_id: int, product_id: int, counted_qty: string}> $items
     */
    public function createAdjustment(array $items, string $reason, int $createdBy): int
    {
        $this->pdo->beginTransaction();

        try {
            $adjustmentNo = 'ADJ-' . date('YmdHis') . '-' . random_int(100, 999);

            $this->pdo->prepare(
                "INSERT INTO stock_adjustments (adjustment_no, reason, status, created_by)
                 VALUES (:no, :reason, 'APPROVED', :created_by)"
            )->execute(['no' => $adjustmentNo, 'reason' => $reason, 'created_by' => $createdBy]);

            $adjustmentId = (int) $this->pdo->lastInsertId();

            foreach ($items as $index => $item) {
                $stock = $this->getStock($item['variant_id']);
                $systemQty = $stock['on_hand'] ?? '0.000';
                $countedQty = $item['counted_qty'];
                $difference = bcsub($countedQty, (string) $systemQty, 3);

                $this->pdo->prepare(
                    'INSERT INTO stock_adjustment_items (adjustment_id, variant_id, system_qty, counted_qty)
                     VALUES (:adjustment_id, :variant_id, :system_qty, :counted_qty)'
                )->execute([
                    'adjustment_id' => $adjustmentId,
                    'variant_id' => $item['variant_id'],
                    'system_qty' => $systemQty,
                    'counted_qty' => $countedQty,
                ]);

                if (bccomp($difference, '0', 3) === 0) {
                    continue;
                }

                $this->apply(
                    variantId: $item['variant_id'],
                    productId: $item['product_id'],
                    movementType: bccomp($difference, '0', 3) > 0 ? 'STOCK_ADJUSTMENT_IN' : 'STOCK_ADJUSTMENT_OUT',
                    onHandDelta: $difference,
                    reservedDelta: '0',
                    referenceType: 'ADJUSTMENT',
                    referenceId: $adjustmentId,
                    referenceItemId: $index,
                    channel: 'ADMIN',
                    userId: $createdBy,
                    idempotencyKey: "adjustment-{$adjustmentId}-{$item['variant_id']}",
                    reason: $reason,
                );
            }

            $this->pdo->commit();

            return $adjustmentId;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }
}
