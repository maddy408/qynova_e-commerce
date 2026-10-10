-- Migration 0030: Add Bill Discount support to POS sales and Invoices
-- Idempotent and additive. Safe to run multiple times.

-- 1. Add bill_discount columns to invoices table if not exists
SET @dbname = DATABASE();

SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'bill_discount_type'
);
SET @sql = IF(@col_exists = 0, 'ALTER TABLE invoices ADD COLUMN bill_discount_type ENUM(\'PERCENT\', \'AMOUNT\') NULL AFTER discount_total', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'bill_discount_value'
);
SET @sql = IF(@col_exists = 0, 'ALTER TABLE invoices ADD COLUMN bill_discount_value DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER bill_discount_type', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'bill_discount_amount'
);
SET @sql = IF(@col_exists = 0, 'ALTER TABLE invoices ADD COLUMN bill_discount_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER bill_discount_value', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Add bill_discount_amount column to invoice_items table if not exists
SET @col_exists = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'invoice_items' AND COLUMN_NAME = 'bill_discount_amount'
);
SET @sql = IF(@col_exists = 0, 'ALTER TABLE invoice_items ADD COLUMN bill_discount_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER discount_amount', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Create app_settings table if not exists for POS discount policies
CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
    setting_value TEXT NOT NULL,
    description VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Seed default discount settings if not present
INSERT INTO app_settings (setting_key, setting_value, description)
SELECT 'pos_cashier_max_discount_percent', '100', 'Maximum bill discount percent allowed for Cashier role'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key = 'pos_cashier_max_discount_percent');

INSERT INTO app_settings (setting_key, setting_value, description)
SELECT 'pos_allow_bill_discount_with_coupon', '0', 'Allow combining bill discount with coupon (0 = false, 1 = true)'
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE setting_key = 'pos_allow_bill_discount_with_coupon');
