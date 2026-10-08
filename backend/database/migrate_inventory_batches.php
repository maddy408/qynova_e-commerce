<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';
require_once dirname(__DIR__) . '/config/database.php';

$pdo = db();

try {
    echo "Running 0024_inventory_batches migration...\n";

    // 1. Create tables
    $sql = file_get_contents(dirname(__DIR__, 2) . '/database/migrations/0024_inventory_batches.sql');
    $pdo->exec($sql);
    echo "inventory_batches, inventory_transactions, and inventory_settings created/verified.\n";

    // 2. Ensure product_variants columns exist
    $cols = [
        'manufacturing_date' => 'DATE NULL AFTER hsn_code_id',
        'expiry_date' => 'DATE NULL AFTER manufacturing_date',
        'discount_percent' => 'DECIMAL(5, 2) NOT NULL DEFAULT 0.00 AFTER wholesale_price',
        'discount_amount' => 'DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER discount_percent',
    ];

    foreach ($cols as $col => $def) {
        $check = $pdo->query("SHOW COLUMNS FROM product_variants LIKE '{$col}'")->fetchAll();
        if (empty($check)) {
            $pdo->exec("ALTER TABLE product_variants ADD COLUMN {$col} {$def}");
            echo "Added column '{$col}' to product_variants.\n";
        }
    }

    // 3. Populate initial batches for variants that have stock but no batch entry yet
    $variants = $pdo->query("SELECT v.id, v.retail_price, v.mrp, v.purchase_price, COALESCE(i.on_hand, 0) as stock 
                             FROM product_variants v 
                             LEFT JOIN inventory i ON i.variant_id = v.id 
                             WHERE v.deleted_at IS NULL")->fetchAll();

    foreach ($variants as $v) {
        $varId = (int)$v['id'];
        $batchCheck = $pdo->query("SELECT COUNT(*) FROM inventory_batches WHERE variant_id = {$varId}")->fetchColumn();
        if ($batchCheck == 0) {
            $qty = (float)$v['stock'];
            $cost = (float)($v['purchase_price'] ?? 0);
            $selling = (float)$v['retail_price'];
            $mrp = (float)$v['mrp'];

            $stmt = $pdo->prepare("INSERT INTO inventory_batches (variant_id, batch_no, cost_price, selling_price, mrp, quantity, available_quantity, status) 
                                   VALUES (:var_id, 'OPENING-001', :cost, :selling, :mrp, :qty, :avail, 'ACTIVE')");
            $stmt->execute([
                'var_id' => $varId,
                'cost' => $cost,
                'selling' => $selling,
                'mrp' => $mrp,
                'qty' => $qty,
                'avail' => $qty,
            ]);
            $batchId = (int)$pdo->lastInsertId();

            if ($qty > 0) {
                $tx = $pdo->prepare("INSERT INTO inventory_transactions (variant_id, batch_id, type, reference_type, reference_id, qty, old_stock, new_stock, remarks) 
                                     VALUES (:var_id, :batch_id, 'OPENING', 'INITIAL', 0, :qty, 0, :new_stock, 'Initial Batch Setup')");
                $tx->execute([
                    'var_id' => $varId,
                    'batch_id' => $batchId,
                    'qty' => $qty,
                    'new_stock' => $qty,
                ]);
            }
        }
    }

    echo "Batch Migration completed successfully.\n";
} catch (Exception $e) {
    echo "Batch Migration error: " . $e->getMessage() . "\n";
    exit(1);
}
