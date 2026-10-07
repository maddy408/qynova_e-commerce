<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/test_migration_rerun.php'; // has splitStatements function

$serverPdo = new PDO('mysql:host=127.0.0.1;charset=utf8mb4', 'root', 'Mysql@1234', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

echo "=== TEST A: FRESH DATABASE MIGRATION ===\n";
$serverPdo->exec('DROP DATABASE IF EXISTS test_fresh_pos_db');
$serverPdo->exec('CREATE DATABASE test_fresh_pos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');

$freshPdo = new PDO('mysql:host=127.0.0.1;dbname=test_fresh_pos_db;charset=utf8mb4', 'root', 'Mysql@1234', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

$files = glob(__DIR__ . '/../../database/migrations/*.sql');
sort($files);

foreach ($files as $file) {
    $sql = file_get_contents($file);
    foreach (splitStatements($sql) as $statement) {
        $statement = trim($statement);
        if ($statement !== '') {
            $freshPdo->exec($statement);
        }
    }
    echo "  apply " . basename($file) . "\n";
}

$cols = $freshPdo->query('DESCRIBE purchases')->fetchAll(PDO::FETCH_COLUMN);
echo "Fresh DB purchases columns: " . implode(', ', $cols) . "\n";

$serverPdo->exec('DROP DATABASE test_fresh_pos_db');
echo "Fresh DB test completed successfully and cleaned up.\n\n";

echo "=== TEST B: EXISTING DATABASE COPY MIGRATION ===\n";
$serverPdo->exec('DROP DATABASE IF EXISTS test_existing_pos_db');
$serverPdo->exec('CREATE DATABASE test_existing_pos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');

$existingPdo = new PDO('mysql:host=127.0.0.1;dbname=test_existing_pos_db;charset=utf8mb4', 'root', 'Mysql@1234', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

// Apply migrations 0001 through 0018
for ($i = 0; $i < count($files) - 1; $i++) {
    $file = $files[$i];
    $sql = file_get_contents($file);
    foreach (splitStatements($sql) as $statement) {
        $statement = trim($statement);
        if ($statement !== '') {
            $existingPdo->exec($statement);
        }
    }
}

$existingPdo->exec("INSERT INTO roles (id, code, name) VALUES (1, 'ADMIN', 'Administrator')");
$existingPdo->exec("INSERT INTO users (id, role_id, name, email, status) VALUES (1, 1, 'Admin', 'admin@example.com', 'ACTIVE')");
$existingPdo->exec("INSERT INTO suppliers (id, name) VALUES (1, 'Supplier X')");
$existingPdo->exec("
    INSERT INTO purchases (purchase_no, supplier_id, status, subtotal, tax_total, grand_total, amount_paid, payment_status, purchase_date, created_by)
    VALUES ('PUR-LEGACY-001', 1, 'ACTIVE', 1000.00, 0.00, 1000.00, 400.00, 'PARTIAL', '2026-10-01', 1)
");

echo "Applying migration 0019 over existing data with legacy columns...\n";
$sql0019 = file_get_contents(__DIR__ . '/../../database/migrations/0019_purchase_payment_update.sql');
foreach (splitStatements($sql0019) as $statement) {
    $statement = trim($statement);
    if ($statement !== '') {
        $existingPdo->exec($statement);
    }
}

$legacyPurchase = $existingPdo->query("SELECT * FROM purchases WHERE purchase_no = 'PUR-LEGACY-001'")->fetch(PDO::FETCH_ASSOC);
echo "Legacy Purchase After 0019 Migration:\n";
echo "  payment_status : {$legacyPurchase['payment_status']}\n";
echo "  paid_amount    : {$legacyPurchase['paid_amount']}\n";
echo "  balance_amount : {$legacyPurchase['balance_amount']}\n";
echo "  amount_paid    : {$legacyPurchase['amount_paid']}\n";

$legacyLedger = $existingPdo->query("SELECT * FROM supplier_ledger WHERE reference_id = {$legacyPurchase['id']}")->fetch(PDO::FETCH_ASSOC);
echo "Legacy Ledger Opening Row:\n";
echo "  amount         : {$legacyLedger['amount']}\n";
echo "  paid_delta     : {$legacyLedger['paid_amount_delta']}\n";
echo "  notes          : {$legacyLedger['notes']}\n";

$serverPdo->exec('DROP DATABASE test_existing_pos_db');
echo "\nExisting DB test completed successfully and cleaned up.\n";
