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
    /**
     * Product ordering definition kept in one place for POS & inventory listings.
     */
    public const DEFAULT_STOCK_ORDER_BY = 'p.name ASC, v.sku ASC, v.id ASC';

    public function listAllStock(
        ?string $search,
        int $page = 1,
        int $limit = 50,
        bool $posOnly = false,
        ?int $categoryId = null,
        string $sort = 'sales'
    ): array {
        $page = max(1, $page);
        $limit = min(200, max(1, $limit));
        $offset = ($page - 1) * $limit;

        $where = ['v.deleted_at IS NULL', 'p.deleted_at IS NULL', "v.status = 'ACTIVE'"];
        $params = [];

        if ($posOnly) {
            $where[] = 'p.is_pos_enabled = 1';
            $where[] = 'p.is_active = 1';
        }

        if ($categoryId !== null) {
            $where[] = 'EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = :category_id)';
            $params['category_id'] = $categoryId;
        }

        $searchTrimmed = $search !== null ? trim($search) : '';
        if ($searchTrimmed !== '') {
            $where[] = '(p.name LIKE :search1 OR v.sku LIKE :search2 OR v.barcode LIKE :search3)';
            $needle = '%' . $searchTrimmed . '%';
            $params['search1'] = $needle;
            $params['search2'] = $needle;
            $params['search3'] = $needle;
        }

        $whereSql = implode(' AND ', $where);

        // If sort by name or standard alphabetic order requested
        if ($sort === 'name') {
            $countStmt = $this->pdo->prepare(
                "SELECT COUNT(*) FROM product_variants v JOIN products p ON p.id = v.product_id WHERE {$whereSql}"
            );
            $countStmt->execute($params);
            $total = (int) $countStmt->fetchColumn();

            $stmt = $this->pdo->prepare(
                "SELECT v.id AS variant_id, v.product_id, v.sku, v.barcode, p.name AS product_name,
                        v.mrp, v.normal_price, v.retail_price, v.wholesale_price, v.customer_price,
                        g.gst_percent, g.tax_mode,
                        (SELECT image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) AS primary_image,
                        COALESCE(i.on_hand, 0) AS on_hand, COALESCE(i.available, 0) AS available,
                        COALESCE(i.low_stock_threshold, 5) AS low_stock_threshold
                 FROM product_variants v
                 JOIN products p ON p.id = v.product_id
                 LEFT JOIN inventory i ON i.variant_id = v.id
                 LEFT JOIN gst_rates g ON g.id = v.gst_rate_id
                 WHERE {$whereSql}
                 ORDER BY " . self::DEFAULT_STOCK_ORDER_BY . "
                 LIMIT :limit OFFSET :offset"
            );
            foreach ($params as $key => $value) {
                $stmt->bindValue(":{$key}", $value);
            }
            $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
            $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
            $stmt->execute();

            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as &$r) {
                $r['sales_units'] = '0.000';
            }
            unset($r);

            return ['items' => $rows, 'total' => $total, 'page' => $page, 'limit' => $limit];
        }

        // --- SALES-BASED ORDERING (T03 Requirement) ---
        // 1. Fetch cached variant sales map [variant_id => net_units]
        $salesRankingService = new SalesRankingService($this->pdo);
        $salesMap = $salesRankingService->getVariantSalesMap();

        // 2. Fetch all matching candidate variants (ID, Name, SKU, Barcode) for fast in-memory sorting
        $candidatesStmt = $this->pdo->prepare(
            "SELECT v.id AS variant_id, p.name AS product_name, v.sku, v.barcode
             FROM product_variants v
             JOIN products p ON p.id = v.product_id
             WHERE {$whereSql}"
        );
        $candidatesStmt->execute($params);
        $candidates = $candidatesStmt->fetchAll(PDO::FETCH_ASSOC);
        $total = count($candidates);

        if ($total === 0) {
            return ['items' => [], 'total' => 0, 'page' => $page, 'limit' => $limit];
        }

        // 3. Sort candidates deterministically
        $searchExact = $searchTrimmed !== '' ? $searchTrimmed : null;
        usort($candidates, function (array $a, array $b) use ($salesMap, $searchExact): int {
            // (a) Exact barcode/SKU match first if search is present
            if ($searchExact !== null) {
                $aExact = ($a['barcode'] === $searchExact || strcasecmp((string) $a['sku'], $searchExact) === 0) ? 1 : 0;
                $bExact = ($b['barcode'] === $searchExact || strcasecmp((string) $b['sku'], $searchExact) === 0) ? 1 : 0;
                if ($aExact !== $bExact) {
                    return $bExact <=> $aExact;
                }
            }

            $aUnits = (float) ($salesMap[(int) $a['variant_id']] ?? 0);
            $bUnits = (float) ($salesMap[(int) $b['variant_id']] ?? 0);

            $aHasSales = $aUnits > 0 ? 1 : 0;
            $bHasSales = $bUnits > 0 ? 1 : 0;

            // (b) Items with sales > 0 come before items with <= 0 sales
            if ($aHasSales !== $bHasSales) {
                return $bHasSales <=> $aHasSales;
            }

            // (c) Net units sold DESC
            if ($aHasSales === 1 && $aUnits !== $bUnits) {
                return ($bUnits < $aUnits) ? -1 : 1;
            }

            // (d) Tie breaks: product name ASC, SKU ASC, ID ASC
            $nameCmp = strcasecmp((string) $a['product_name'], (string) $b['product_name']);
            if ($nameCmp !== 0) {
                return $nameCmp;
            }

            $skuCmp = strcasecmp((string) $a['sku'], (string) $b['sku']);
            if ($skuCmp !== 0) {
                return $skuCmp;
            }

            return ((int) $a['variant_id']) <=> ((int) $b['variant_id']);
        });

        // 4. Slice current page IDs
        $pageCandidates = array_slice($candidates, $offset, $limit);
        if (empty($pageCandidates)) {
            return ['items' => [], 'total' => $total, 'page' => $page, 'limit' => $limit];
        }

        $pageVariantIds = array_map(fn (array $c) => (int) $c['variant_id'], $pageCandidates);
        $inPlaceholders = implode(',', array_fill(0, count($pageVariantIds), '?'));

        // 5. Fetch full row details for only this page's variants
        $detailStmt = $this->pdo->prepare(
            "SELECT v.id AS variant_id, v.product_id, v.sku, v.barcode, p.name AS product_name,
                    v.mrp, v.normal_price, v.retail_price, v.wholesale_price, v.customer_price,
                    g.gst_percent, g.tax_mode,
                    (SELECT image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) AS primary_image,
                    COALESCE(i.on_hand, 0) AS on_hand, COALESCE(i.available, 0) AS available,
                    COALESCE(i.low_stock_threshold, 5) AS low_stock_threshold,
                    b.id AS batch_id,
                    b.batch_no,
                    b.manufacturing_date,
                    b.expiry_date,
                    b.selling_price AS batch_selling_price,
                    b.mrp AS batch_mrp
             FROM product_variants v
             JOIN products p ON p.id = v.product_id
             LEFT JOIN inventory i ON i.variant_id = v.id
             LEFT JOIN (
                 SELECT b1.*
                 FROM inventory_batches b1
                 INNER JOIN (
                     SELECT variant_id, MAX(id) AS max_id
                     FROM inventory_batches
                     GROUP BY variant_id
                 ) b2 ON b1.id = b2.max_id
             ) b ON b.variant_id = v.id
             WHERE v.id IN ({$inPlaceholders})"
        );
        $detailStmt->execute($pageVariantIds);
        $fetchedRows = $detailStmt->fetchAll(PDO::FETCH_ASSOC);

        // Index fetched rows by variant_id
        $indexedRows = [];
        foreach ($fetchedRows as $row) {
            $indexedRows[(int) $row['variant_id']] = $row;
        }

        // 6. Build final items matching the sorted page order exactly
        $finalItems = [];
        foreach ($pageVariantIds as $vId) {
            if (isset($indexedRows[$vId])) {
                $item = $indexedRows[$vId];
                $netUnits = (float) ($salesMap[$vId] ?? 0);
                $item['sales_units'] = number_format($netUnits, 3, '.', '');
                $finalItems[] = $item;
            }
        }

        return ['items' => $finalItems, 'total' => $total, 'page' => $page, 'limit' => $limit];
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
     * accepted from the caller. If the variant does not yet have an inventory
     * row, it is lazily initialized from product_variants with 0 stock.
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
                    $vStmt = $this->pdo->prepare('SELECT id, product_id FROM product_variants WHERE id = :id AND deleted_at IS NULL');
                    $vStmt->execute(['id' => $variantId]);
                    $variantRow = $vStmt->fetch();

                    if ($variantRow === false) {
                        throw new RuntimeException("Variant {$variantId} does not exist");
                    }

                    // Lazily initialize inventory row with 0 on_hand / 0 reserved
                    $this->pdo->prepare(
                        'INSERT INTO inventory (variant_id, product_id)
                         VALUES (:variant_id, :product_id)
                         ON DUPLICATE KEY UPDATE variant_id = variant_id'
                    )->execute([
                        'variant_id' => $variantId,
                        'product_id' => (int) $variantRow['product_id'],
                    ]);

                    $stock = [
                        'variant_id' => $variantId,
                        'product_id' => (int) $variantRow['product_id'],
                        'on_hand' => '0.000',
                        'reserved' => '0.000',
                        'available' => '0.000',
                    ];
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
            } elseif (
                isset($item['batch_no']) ||
                isset($item['mfg_date']) ||
                isset($item['exp_date']) ||
                isset($item['manufacturing_date']) ||
                isset($item['expiry_date']) ||
                isset($item['selling_price']) ||
                isset($item['price']) ||
                isset($item['mrp'])
            ) {
                // Save inline batch details directly
                $batchService->saveOpeningBatchDetailed($variantId, [
                    'batch_id' => !empty($item['batch_id']) ? (int) $item['batch_id'] : null,
                    'batch_no' => $item['batch_no'] ?? null,
                    'quantity' => isset($item['quantity']) ? (float) $item['quantity'] : (isset($item['opening_stock']) ? (float) $item['opening_stock'] : 0),
                    'selling_price' => (float) ($item['selling_price'] ?? ($item['price'] ?? 0)),
                    'mrp' => (float) ($item['mrp'] ?? 0),
                    'manufacturing_date' => $item['mfg_date'] ?? ($item['manufacturing_date'] ?? null),
                    'expiry_date' => $item['exp_date'] ?? ($item['expiry_date'] ?? null),
                ], $userId);
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
