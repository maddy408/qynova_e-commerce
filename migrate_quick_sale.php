<?php
require_once __DIR__ . '/backend/vendor/autoload.php';
require_once __DIR__ . '/backend/config/database.php';

try {
    $pdo = db();

    echo "Modifying invoice_items table to allow NULL for product_id and variant_id...\n";
    $pdo->exec("
        ALTER TABLE invoice_items 
        MODIFY product_id BIGINT UNSIGNED NULL,
        MODIFY variant_id BIGINT UNSIGNED NULL;
    ");

    echo "invoice_items table successfully updated to support Quick Sale items (NULL product_id / variant_id)!\n";
} catch (Exception $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
}
