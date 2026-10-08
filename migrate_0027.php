<?php
require_once __DIR__ . '/backend/vendor/autoload.php';
require_once __DIR__ . '/backend/config/database.php';

try {
    $pdo = db();

    // Check normal_price on product_variants
    $col = $pdo->query("SHOW COLUMNS FROM product_variants LIKE 'normal_price'")->fetch();
    if (!$col) {
        $pdo->exec("ALTER TABLE product_variants ADD COLUMN normal_price DECIMAL(15,2) NULL AFTER mrp");
        echo "Added normal_price to product_variants.\n";
    }
    $pdo->exec("UPDATE product_variants SET normal_price = retail_price WHERE normal_price IS NULL OR normal_price = 0");

    // Check customer_type on invoices
    $col = $pdo->query("SHOW COLUMNS FROM invoices LIKE 'customer_type'")->fetch();
    if (!$col) {
        $pdo->exec("ALTER TABLE invoices ADD COLUMN customer_type ENUM('NORMAL', 'RETAIL', 'WHOLESALE') NOT NULL DEFAULT 'NORMAL'");
        echo "Added customer_type to invoices.\n";
    }

    // Check batch_id on invoice_items
    $col = $pdo->query("SHOW COLUMNS FROM invoice_items LIKE 'batch_id'")->fetch();
    if (!$col) {
        $pdo->exec("ALTER TABLE invoice_items ADD COLUMN batch_id BIGINT UNSIGNED NULL, ADD COLUMN batch_no VARCHAR(100) NULL");
        echo "Added batch_id & batch_no to invoice_items.\n";
    }

    // Ensure inventory_settings setting_value is FEFO
    $pdo->exec("INSERT INTO inventory_settings (setting_key, setting_value) VALUES ('batch_consumption_rule', 'FEFO') ON DUPLICATE KEY UPDATE setting_value = 'FEFO'");
    echo "Updated batch consumption rule to FEFO.\n";

    echo "Migration 0027 successfully executed!\n";
} catch (Exception $e) {
    echo "Migration error: " . $e->getMessage() . "\n";
}
