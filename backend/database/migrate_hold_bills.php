<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';
require_once dirname(__DIR__) . '/config/database.php';

$pdo = db();

try {
    // 1. Create hold_bills table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS hold_bills (
            id INT AUTO_INCREMENT PRIMARY KEY,
            bill_no VARCHAR(64) NOT NULL UNIQUE,
            customer_id INT NULL,
            customer_name VARCHAR(255) NULL,
            note TEXT NULL,
            total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
            price_type VARCHAR(32) NOT NULL DEFAULT 'RETAIL',
            items_json LONGTEXT NOT NULL,
            created_by INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");
    echo "hold_bills table created/verified.\n";

    // 2. Add customer_price column to product_variants if not exists
    $columns = $pdo->query("SHOW COLUMNS FROM product_variants LIKE 'customer_price'")->fetchAll();
    if (empty($columns)) {
        $pdo->exec("ALTER TABLE product_variants ADD COLUMN customer_price DECIMAL(12, 3) NULL DEFAULT NULL AFTER wholesale_price;");
        echo "Added customer_price column to product_variants.\n";
    } else {
        echo "customer_price column already exists.\n";
    }

    echo "Migration completed successfully.\n";
} catch (Exception $e) {
    echo "Migration error: " . $e->getMessage() . "\n";
    exit(1);
}
