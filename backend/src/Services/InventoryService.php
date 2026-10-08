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

    /**
     * Sets a variant's low-stock alert threshold. Works even before any
     * stock movement exists — upserts the inventory row the same way
     * apply() does, since `inventory` is otherwise only created lazily
     * on the first movement. product_id is resolved from the variant
     * itself, never trusted from the caller (same reasoning as
     * createAdjustment()).
     */
    public function setLowStockThreshold(int $variantId, string $threshold): void
    {
        if (bccomp($threshold, '0', 3) < 0) {
            throw new RuntimeException('Low stock threshold cannot be negative');
        }

        $stmt = $this->pdo->prepare('SELECT product_id FROM product_variants WHERE id = :id AND deleted_at IS NULL');
        $stmt->execute(['id' => $variantId]);
        $productId = $stmt->fetchColumn();

        if ($productId === false) {
            throw new RuntimeException('Variant not found');
        }

        $this->pdo->prepare(
            'INSERT INTO inventory (variant_id, product_id, low_stock_threshold) VALUES (:variant_id, :product_id, :threshold)
             ON DUPLICATE KEY UPDATE low_stock_threshold = VALUES(low_stock_threshold)'
        )->execute(['variant_id' => $variantId, 'product_id' => $productId, 'threshold' => $threshold]);
    }

    /** @return array<string, mixed>|null */
    public function getStock(int $variantId): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM inventory WHERE variant_id = :variant_id');
        $stmt->execute(['variant_id' => $variantId]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    /**
     * Every active variant with its current stock, for the Stock
     * Adjustment screen's product list (left-joined, not inner-joined —
     * a variant with no stock movement yet has no `inventory` row at
     * all, since that row is created lazily by apply()/setLowStockThreshold()).
     * Also carries pricing/image/category columns so the POS Sale
     * screen's product grid can reuse the same endpoint instead of a
     * second variant-level listing query — pass $posOnly to restrict it
     * to `is_pos_enabled` products, as Sale does (Stock Adjustment wants
     * every product regardless of channel).
     *
     * @return array{items: list<array<string, mixed>>, total: int, page: int, limit: int}
     */
    public function listAllStock(?string $search, int $page, int $limit, bool $posOnly = false, ?int $categoryId = null): array
    {
        $page = max(1, $page);
        $limit = min(200, max(1, $limit));
        $offset = ($page - 1) * $limit;

        $where = ['v.deleted_at IS NULL', 'p.deleted_at IS NULL', "v.status = 'ACTIVE'"];
        $params = [];

        if ($posOnly) {
            $where[] = 'p.is_pos_enabled = 1';
        }

        if ($categoryId !== null) {
            $where[] = 'EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = :category_id)';
            $params['category_id'] = $categoryId;
        }

        if ($search !== null && trim($search) !== '') {
            // Three distinct placeholders for the same value — with
            // emulated prepares off, PDO rejects reusing one named
            // placeholder twice in a query.
            $where[] = '(p.name LIKE :search1 OR v.sku LIKE :search2 OR v.barcode LIKE :search3)';
            $needle = '%' . trim($search) . '%';
            $params['search1'] = $needle;
            $params['search2'] = $needle;
            $params['search3'] = $needle;
        }

        $whereSql = implode(' AND ', $where);

        $countStmt = $this->pdo->prepare(
            "SELECT COUNT(*) FROM product_variants v JOIN products p ON p.id = v.product_id WHERE {$whereSql}"
        );
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare(
            "SELECT v.id AS variant_id, v.product_id, v.sku, v.barcode, p.name AS product_name,
                    v.mrp, v.retail_price, v.wholesale_price, g.gst_percent, g.tax_mode,
                    (SELECT image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) AS primary_image,
                    COALESCE(i.on_hand, 0) AS on_hand, COALESCE(i.available, 0) AS available,
                    COALESCE(i.low_stock_threshold, 5) AS low_stock_threshold
             FROM product_variants v
             JOIN products p ON p.id = v.product_id
             LEFT JOIN inventory i ON i.variant_id = v.id
             LEFT JOIN gst_rates g ON g.id = v.gst_rate_id
             WHERE {$whereSql}
             ORDER BY p.name, v.sku
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue(":{$key}", $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        return ['items' => $stmt->fetchAll(), 'total' => $total, 'page' => $page, 'limit' => $limit];
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

    /** @return list<array<string, mixed>> */
    public function listAdjustments(): array
    {
        $adjustments = $this->pdo->query(
            "SELECT sa.*, u.name AS created_by_name
             FROM stock_adjustments sa JOIN users u ON u.id = sa.created_by
             ORDER BY sa.created_at DESC LIMIT 200"
        )->fetchAll();

        foreach ($adjustments as &$adjustment) {
            $items = $this->pdo->prepare(
                'SELECT sai.*, v.sku, p.name AS product_name
                 FROM stock_adjustment_items sai
                 JOIN product_variants v ON v.id = sai.variant_id
                 JOIN products p ON p.id = v.product_id
                 WHERE sai.adjustment_id = :id'
            );
            $items->execute(['id' => $adjustment['id']]);
            $adjustment['items'] = $items->fetchAll();
        }
        unset($adjustment);

        return $adjustments;
    }

    /**
     * Creates a stock_adjustments header + items, then applies each item
     * as a STOCK_ADJUSTMENT_IN/OUT movement, all in one transaction.
     * product_id is resolved from each variant's own inventory row, not
     * accepted from the caller.
     *
     * @param array<int, array<string, mixed>> $items
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
                if (!is_array($item) || !isset($item['variant_id'], $item['counted_qty'])) {
                    continue;
                }

                $variantId = (int) $item['variant_id'];
                $countedQty = (string) $item['counted_qty'];
                $stock = $this->getStock($variantId);

                if ($stock === null) {
                    throw new RuntimeException("Variant {$variantId} has no inventory record");
                }

                $systemQty = (string) ($stock['on_hand'] ?? '0');
                $difference = bcsub($countedQty, $systemQty, 3);

                $this->pdo->prepare(
                    'INSERT INTO stock_adjustment_items (adjustment_id, variant_id, system_qty, counted_qty)
                     VALUES (:adjustment_id, :variant_id, :system_qty, :counted_qty)'
                )->execute([
                    'adjustment_id' => $adjustmentId,
                    'variant_id' => $variantId,
                    'system_qty' => $systemQty,
                    'counted_qty' => $countedQty,
                ]);

                if (bccomp($difference, '0', 3) === 0) {
                    continue;
                }

                $this->apply(
                    variantId: $variantId,
                    productId: (int) $stock['product_id'],
                    movementType: bccomp($difference, '0', 3) > 0 ? 'STOCK_ADJUSTMENT_IN' : 'STOCK_ADJUSTMENT_OUT',
                    onHandDelta: $difference,
                    reservedDelta: '0',
                    referenceType: 'ADJUSTMENT',
                    referenceId: $adjustmentId,
                    referenceItemId: (int) $index,
                    channel: 'ADMIN',
                    userId: $createdBy,
                    idempotencyKey: "adjustment-{$adjustmentId}-{$variantId}",
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

    /**
     * Save/update opening stock for a list of variant items.
     *
     * @param array<int, array<string, mixed>> $items
     */
    public function saveOpeningStock(array $items, int $userId): void
    {
        $adjustmentItems = [];
        $batchService = new BatchService($this->pdo);

        foreach ($items as $item) {
            if (!is_array($item) || !isset($item['variant_id'])) {
                continue;
            }

            $variantId = (int) $item['variant_id'];

            if (isset($item['batches']) && is_array($item['batches']) && count($item['batches']) > 0) {
                $totalBatchQty = 0.0;
                foreach ($item['batches'] as $b) {
                    $bNo = trim((string) ($b['batch_no'] ?? ''));
                    $qty = (float) ($b['qty'] ?? 0);
                    $mrp = (float) ($b['mrp'] ?? 0);
                    $selling = (float) ($b['selling_price'] ?? 0);
                    $mfg = !empty($b['mfg_date']) ? (string) $b['mfg_date'] : null;
                    $exp = !empty($b['exp_date']) ? (string) $b['exp_date'] : null;

                    if ($qty > 0 && $bNo !== '') {
                        $batchService->createOpeningBatch(
                            variantId: $variantId,
                            qty: $qty,
                            cost: 0.0,
                            selling: $selling,
                            mrp: $mrp,
                            mfgDate: $mfg,
                            expDate: $exp,
                            batchNo: $bNo
                        );
                        $totalBatchQty += $qty;
                    }
                }

                $stock = $this->getStock($variantId);
                $currentQty = $stock !== null ? (string) ($stock['on_hand'] ?? '0') : '0';
                $newTotalQty = (string) ((float)$currentQty + $totalBatchQty);

                $adjustmentItems[] = [
                    'variant_id' => $variantId,
                    'counted_qty' => $newTotalQty,
                ];
            } elseif (isset($item['opening_stock'])) {
                $newQty = (string) $item['opening_stock'];

                if ($variantId <= 0 || !is_numeric($newQty) || bccomp($newQty, '0', 3) < 0) {
                    continue;
                }

                $stock = $this->getStock($variantId);
                $currentQty = $stock !== null ? (string) ($stock['on_hand'] ?? '0') : '0';

                if (bccomp($currentQty, $newQty, 3) !== 0) {
                    $adjustmentItems[] = [
                        'variant_id' => $variantId,
                        'counted_qty' => $newQty,
                    ];
                }
            }
        }

        if ($adjustmentItems !== []) {
            $this->createAdjustment($adjustmentItems, 'Opening Stock Update with Batches', $userId);
        }
    }
}
