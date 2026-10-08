<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

final class BatchService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Get the configured batch consumption rule ('FIFO' or 'FEFO').
     */
    public function getConsumptionRule(): string
    {
        $stmt = $this->pdo->query("SELECT setting_value FROM inventory_settings WHERE setting_key = 'batch_consumption_rule'");
        $val = $stmt->fetchColumn();
        return $val ? strtoupper((string) $val) : 'FIFO';
    }

    /**
     * Set the batch consumption rule ('FIFO' or 'FEFO').
     */
    public function setConsumptionRule(string $rule): void
    {
        $rule = strtoupper(trim($rule));
        if (!in_array($rule, ['FIFO', 'FEFO'], true)) {
            throw new RuntimeException('Invalid consumption rule. Must be FIFO or FEFO');
        }
        $stmt = $this->pdo->prepare(
            "INSERT INTO inventory_settings (setting_key, setting_value) 
             VALUES ('batch_consumption_rule', :rule) 
             ON DUPLICATE KEY UPDATE setting_value = :rule"
        );
        $stmt->execute(['rule' => $rule]);
    }

    /**
     * Get total available stock across all active batches for a variant.
     */
    public function getVariantStock(int $variantId): float
    {
        $stmt = $this->pdo->prepare(
            "SELECT COALESCE(SUM(available_quantity), 0) 
             FROM inventory_batches 
             WHERE variant_id = :variant_id AND status = 'ACTIVE'"
        );
        $stmt->execute(['variant_id' => $variantId]);
        return (float) $stmt->fetchColumn();
    }

    /**
     * List all batches for a specific variant.
     */
    public function getVariantBatches(int $variantId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT b.*, s.name as supplier_name 
             FROM inventory_batches b 
             LEFT JOIN suppliers s ON s.id = b.supplier_id 
             WHERE b.variant_id = :variant_id 
             ORDER BY b.created_at DESC"
        );
        $stmt->execute(['variant_id' => $variantId]);
        return $stmt->fetchAll();
    }

    /**
     * Create an opening batch for a variant during product creation or inventory initialization.
     */
    public function createOpeningBatch(
        int $variantId,
        float $qty,
        float $cost = 0.0,
        float $selling = 0.0,
        float $mrp = 0.0,
        ?string $mfgDate = null,
        ?string $expDate = null,
        ?string $batchNo = null
    ): int {
        if ($qty <= 0) {
            return 0;
        }

        $batchNo = $batchNo && trim($batchNo) !== '' ? trim($batchNo) : 'OPENING-001';

        // Check if opening batch with same number exists
        $stmt = $this->pdo->prepare("SELECT id, available_quantity, quantity FROM inventory_batches WHERE variant_id = :variant_id AND batch_no = :batch_no");
        $stmt->execute(['variant_id' => $variantId, 'batch_no' => $batchNo]);
        $existing = $stmt->fetch();

        if ($existing) {
            $batchId = (int) $existing['id'];
            $newQty = (float) $existing['quantity'] + $qty;
            $newAvail = (float) $existing['available_quantity'] + $qty;

            $update = $this->pdo->prepare("UPDATE inventory_batches SET quantity = :qty, available_quantity = :avail, status = 'ACTIVE' WHERE id = :id");
            $update->execute(['qty' => $newQty, 'avail' => $newAvail, 'id' => $batchId]);

            $tx = $this->pdo->prepare(
                "INSERT INTO inventory_transactions (variant_id, batch_id, type, reference_type, reference_id, qty, old_stock, new_stock, remarks) 
                 VALUES (:v_id, :b_id, 'OPENING', 'INITIAL', 0, :qty, :old_s, :new_s, 'Additional Opening Stock')"
            );
            $tx->execute([
                'v_id' => $variantId,
                'b_id' => $batchId,
                'qty' => $qty,
                'old_s' => $existing['available_quantity'],
                'new_s' => $newAvail,
            ]);
            return $batchId;
        }

        $insert = $this->pdo->prepare(
            "INSERT INTO inventory_batches (variant_id, batch_no, manufacturing_date, expiry_date, cost_price, selling_price, mrp, quantity, available_quantity, status) 
             VALUES (:variant_id, :batch_no, :mfg_date, :exp_date, :cost, :selling, :mrp, :qty, :avail, 'ACTIVE')"
        );
        $insert->execute([
            'variant_id' => $variantId,
            'batch_no' => $batchNo,
            'mfg_date' => $mfgDate ?: null,
            'exp_date' => $expDate ?: null,
            'cost' => $cost,
            'selling' => $selling,
            'mrp' => $mrp,
            'qty' => $qty,
            'avail' => $qty,
        ]);
        $batchId = (int) $this->pdo->lastInsertId();

        $tx = $this->pdo->prepare(
            "INSERT INTO inventory_transactions (variant_id, batch_id, type, reference_type, reference_id, qty, old_stock, new_stock, remarks) 
             VALUES (:v_id, :b_id, 'OPENING', 'INITIAL', 0, :qty, 0, :new_s, 'Initial Opening Stock')"
        );
        $tx->execute([
            'v_id' => $variantId,
            'b_id' => $batchId,
            'qty' => $qty,
            'new_s' => $qty,
        ]);

        return $batchId;
    }

    /**
     * Add purchase batch stock entry.
     */
    public function createPurchaseBatch(
        int $variantId,
        string $batchNo,
        float $qty,
        float $cost = 0.0,
        float $selling = 0.0,
        float $mrp = 0.0,
        ?int $supplierId = null,
        ?int $purchaseId = null,
        ?string $mfgDate = null,
        ?string $expDate = null
    ): int {
        if ($qty <= 0) {
            throw new RuntimeException('Purchase quantity must be greater than zero');
        }

        $batchNo = trim($batchNo);
        if ($batchNo === '') {
            $batchNo = 'BATCH-' . date('Ymd') . '-' . random_int(100, 999);
        }

        $stmt = $this->pdo->prepare("SELECT id, available_quantity, quantity FROM inventory_batches WHERE variant_id = :v_id AND batch_no = :b_no");
        $stmt->execute(['v_id' => $variantId, 'b_no' => $batchNo]);
        $existing = $stmt->fetch();

        if ($existing) {
            $batchId = (int) $existing['id'];
            $newQty = (float) $existing['quantity'] + $qty;
            $newAvail = (float) $existing['available_quantity'] + $qty;

            $update = $this->pdo->prepare(
                "UPDATE inventory_batches SET 
                 quantity = :qty, 
                 available_quantity = :avail, 
                 cost_price = :cost, 
                 selling_price = :selling, 
                 mrp = :mrp,
                 status = 'ACTIVE' 
                 WHERE id = :id"
            );
            $update->execute([
                'qty' => $newQty,
                'avail' => $newAvail,
                'cost' => $cost,
                'selling' => $selling,
                'mrp' => $mrp,
                'id' => $batchId,
            ]);

            $tx = $this->pdo->prepare(
                "INSERT INTO inventory_transactions (variant_id, batch_id, type, reference_type, reference_id, qty, old_stock, new_stock, remarks) 
                 VALUES (:v_id, :b_id, 'PURCHASE', 'PURCHASE', :ref_id, :qty, :old_s, :new_s, 'Purchase Entry')"
            );
            $tx->execute([
                'v_id' => $variantId,
                'b_id' => $batchId,
                'ref_id' => $purchaseId ?: 0,
                'qty' => $qty,
                'old_s' => $existing['available_quantity'],
                'new_s' => $newAvail,
            ]);

            return $batchId;
        }

        $insert = $this->pdo->prepare(
            "INSERT INTO inventory_batches 
             (variant_id, batch_no, supplier_id, purchase_id, purchase_date, manufacturing_date, expiry_date, cost_price, selling_price, mrp, quantity, available_quantity, status) 
             VALUES (:v_id, :b_no, :sup_id, :pur_id, CURRENT_DATE(), :mfg_date, :exp_date, :cost, :selling, :mrp, :qty, :avail, 'ACTIVE')"
        );
        $insert->execute([
            'v_id' => $variantId,
            'b_no' => $batchNo,
            'sup_id' => $supplierId ?: null,
            'pur_id' => $purchaseId ?: null,
            'mfg_date' => $mfgDate ?: null,
            'exp_date' => $expDate ?: null,
            'cost' => $cost,
            'selling' => $selling,
            'mrp' => $mrp,
            'qty' => $qty,
            'avail' => $qty,
        ]);
        $batchId = (int) $this->pdo->lastInsertId();

        $tx = $this->pdo->prepare(
            "INSERT INTO inventory_transactions (variant_id, batch_id, type, reference_type, reference_id, qty, old_stock, new_stock, remarks) 
             VALUES (:v_id, :b_id, 'PURCHASE', 'PURCHASE', :ref_id, :qty, 0, :new_s, 'Purchase Entry')"
        );
        $tx->execute([
            'v_id' => $variantId,
            'b_id' => $batchId,
            'ref_id' => $purchaseId ?: 0,
            'qty' => $qty,
            'new_s' => $qty,
        ]);

        return $batchId;
    }

    /**
     * Consume stock from active batches using FIFO or FEFO.
     */
    public function consumeStock(
        int $variantId,
        float $qtyToConsume,
        string $referenceType = 'SALE',
        int $referenceId = 0,
        string $remarks = ''
    ): void {
        if ($qtyToConsume <= 0) {
            return;
        }

        $rule = $this->getConsumptionRule();

        // Determine ordering based on rule
        $orderBy = $rule === 'FEFO' 
            ? 'COALESCE(expiry_date, "9999-12-31") ASC, created_at ASC, id ASC' 
            : 'created_at ASC, id ASC';

        $stmt = $this->pdo->prepare(
            "SELECT id, available_quantity, batch_no 
             FROM inventory_batches 
             WHERE variant_id = :v_id AND status = 'ACTIVE' AND available_quantity > 0 
             ORDER BY {$orderBy} FOR UPDATE"
        );
        $stmt->execute(['v_id' => $variantId]);
        $batches = $stmt->fetchAll();

        $totalAvailable = array_sum(array_column($batches, 'available_quantity'));
        if ($totalAvailable < $qtyToConsume) {
            throw new RuntimeException("Insufficient stock for SKU/variant ID {$variantId}. Required: {$qtyToConsume}, Available: {$totalAvailable}");
        }

        $remaining = $qtyToConsume;
        foreach ($batches as $batch) {
            if ($remaining <= 0) {
                break;
            }

            $batchId = (int) $batch['id'];
            $avail = (float) $batch['available_quantity'];
            $deduct = min($remaining, $avail);
            $newAvail = $avail - $deduct;
            $newStatus = $newAvail <= 0 ? 'DEPLETED' : 'ACTIVE';

            $update = $this->pdo->prepare("UPDATE inventory_batches SET available_quantity = :avail, status = :status WHERE id = :id");
            $update->execute(['avail' => $newAvail, 'status' => $newStatus, 'id' => $batchId]);

            $tx = $this->pdo->prepare(
                "INSERT INTO inventory_transactions (variant_id, batch_id, type, reference_type, reference_id, qty, old_stock, new_stock, remarks) 
                 VALUES (:v_id, :b_id, 'SALE', :ref_type, :ref_id, :qty, :old_s, :new_s, :remarks)"
            );
            $tx->execute([
                'v_id' => $variantId,
                'b_id' => $batchId,
                'ref_type' => $referenceType,
                'ref_id' => $referenceId,
                'qty' => -$deduct,
                'old_s' => $avail,
                'new_s' => $newAvail,
                'remarks' => $remarks ?: "Batch {$batch['batch_no']} stock consumed",
            ]);

            $remaining -= $deduct;
        }
    }

    /**
     * Reports API
     */
    public function getBatchReport(): array
    {
        $stmt = $this->pdo->query(
            "SELECT b.*, v.sku, v.barcode, p.name AS product_name, s.name AS supplier_name 
             FROM inventory_batches b 
             JOIN product_variants v ON v.id = b.variant_id 
             JOIN products p ON p.id = v.product_id 
             LEFT JOIN suppliers s ON s.id = b.supplier_id 
             ORDER BY b.created_at DESC"
        );
        return $stmt->fetchAll();
    }

    public function getExpiryReport(int $daysThreshold = 30): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT b.*, v.sku, v.barcode, p.name AS product_name, 
                    DATEDIFF(b.expiry_date, CURRENT_DATE()) AS days_to_expiry 
             FROM inventory_batches b 
             JOIN product_variants v ON v.id = b.variant_id 
             JOIN products p ON p.id = v.product_id 
             WHERE b.expiry_date IS NOT NULL 
               AND b.available_quantity > 0 
               AND DATEDIFF(b.expiry_date, CURRENT_DATE()) <= :days 
             ORDER BY b.expiry_date ASC"
        );
        $stmt->execute(['days' => $daysThreshold]);
        return $stmt->fetchAll();
    }
}
