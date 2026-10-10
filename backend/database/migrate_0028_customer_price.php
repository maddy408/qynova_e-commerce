<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';
require_once dirname(__DIR__) . '/config/database.php';

try {
    $pdo = db();

    $col = $pdo->query("SHOW COLUMNS FROM product_variants LIKE 'customer_price'")->fetch();
    if (!$col) {
        $pdo->exec("ALTER TABLE product_variants ADD COLUMN customer_price DECIMAL(15,2) NULL DEFAULT NULL AFTER wholesale_price;");
        echo "Added customer_price column to product_variants.\n";
    } else {
        echo "customer_price column already exists in product_variants.\n";
    }

    echo "Migration 0028 completed successfully.\n";
} catch (Exception $e) {
    echo "Migration 0028 error: " . $e->getMessage() . "\n";
    exit(1);
}
