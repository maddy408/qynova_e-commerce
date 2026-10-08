-- 0027_customer_pricing_and_batches.sql
-- Customer Type-wise Pricing & FEFO Inventory Batch Support

DELIMITER $$

DROP PROCEDURE IF EXISTS apply_0027_customer_pricing_and_batches$$

CREATE PROCEDURE apply_0027_customer_pricing_and_batches()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'product_variants' AND column_name = 'normal_price'
    ) THEN
        ALTER TABLE product_variants ADD COLUMN normal_price DECIMAL(15,2) NULL AFTER mrp;
    END IF;

    UPDATE product_variants SET normal_price = retail_price WHERE normal_price IS NULL OR normal_price = 0;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'invoices' AND column_name = 'customer_type'
    ) THEN
        ALTER TABLE invoices ADD COLUMN customer_type ENUM('NORMAL', 'RETAIL', 'WHOLESALE') NOT NULL DEFAULT 'NORMAL';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'invoice_items' AND column_name = 'batch_id'
    ) THEN
        ALTER TABLE invoice_items ADD COLUMN batch_id BIGINT UNSIGNED NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'invoice_items' AND column_name = 'batch_no'
    ) THEN
        ALTER TABLE invoice_items ADD COLUMN batch_no VARCHAR(100) NULL;
    END IF;

    INSERT INTO inventory_settings (setting_key, setting_value)
    VALUES ('batch_consumption_rule', 'FEFO')
    ON DUPLICATE KEY UPDATE setting_value = 'FEFO';
END$$

DELIMITER ;

CALL apply_0027_customer_pricing_and_batches();
DROP PROCEDURE IF EXISTS apply_0027_customer_pricing_and_batches;
