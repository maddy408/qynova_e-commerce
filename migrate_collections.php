<?php
require_once __DIR__ . '/backend/vendor/autoload.php';
require_once __DIR__ . '/backend/config/database.php';

try {
    $pdo = db();
    
    // Add credit_limit if not exists
    $columns = $pdo->query("SHOW COLUMNS FROM customers LIKE 'credit_limit'")->fetchAll();
    if (empty($columns)) {
        $pdo->exec("ALTER TABLE customers ADD COLUMN credit_limit DECIMAL(15, 2) NOT NULL DEFAULT 10000.00;");
        echo "Added credit_limit column to customers table.\n";
    }

    // Create collection_receipts table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS collection_receipts (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            receipt_no VARCHAR(50) NOT NULL UNIQUE,
            customer_id BIGINT UNSIGNED NOT NULL,
            amount DECIMAL(15, 2) NOT NULL,
            payment_method VARCHAR(50) NOT NULL DEFAULT 'CASH',
            mode VARCHAR(50) NOT NULL DEFAULT 'AUTO',
            collected_by BIGINT UNSIGNED NOT NULL,
            note VARCHAR(255) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_collection_receipts_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
            CONSTRAINT fk_collection_receipts_user FOREIGN KEY (collected_by) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    // Create collection_receipt_items table
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS collection_receipt_items (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            receipt_id BIGINT UNSIGNED NOT NULL,
            invoice_id BIGINT UNSIGNED NOT NULL,
            amount_paid DECIMAL(15, 2) NOT NULL,
            previous_balance DECIMAL(15, 2) NOT NULL,
            remaining_balance DECIMAL(15, 2) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT fk_collection_items_receipt FOREIGN KEY (receipt_id) REFERENCES collection_receipts(id) ON DELETE CASCADE,
            CONSTRAINT fk_collection_items_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    ");

    echo "Collection receipts tables created successfully!\n";
} catch (Exception $e) {
    echo "Migration failed: " . $e->getMessage() . "\n";
}
