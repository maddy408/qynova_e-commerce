-- Migration: 0060_hold_bills.sql
-- Table to persist held bills in POS

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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_hold_bills_created_at (created_at),
    INDEX idx_hold_bills_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
