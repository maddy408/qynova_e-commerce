-- 0027_customer_pricing_and_batches.sql
-- Customer Type-wise Pricing & FEFO Inventory Batch Support

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS normal_price DECIMAL(15,2) NULL AFTER mrp;
UPDATE product_variants SET normal_price = retail_price WHERE normal_price IS NULL OR normal_price = 0;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_type ENUM('NORMAL', 'RETAIL', 'WHOLESALE') NOT NULL DEFAULT 'NORMAL';

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS batch_id BIGINT UNSIGNED NULL;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS batch_no VARCHAR(100) NULL;

INSERT INTO inventory_settings (setting_key, setting_value)
VALUES ('batch_consumption_rule', 'FEFO')
ON DUPLICATE KEY UPDATE setting_value = 'FEFO';
