-- 0028_add_customer_price_to_product_variants.sql
-- Adds customer_price to product_variants for Customer-Wise tier pricing
--
-- Rewritten: the original `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...`
-- one-liner fails with a syntax error on this server's MariaDB build
-- (10.4.32) — confirmed by running database/migrate.php, which halts
-- here on every fresh/behind database. Replaced with the same guarded
-- pattern migration 0027 already uses successfully on this server
-- (information_schema check + DELIMITER-wrapped procedure), same net
-- effect, no change in what the migration does.

DELIMITER $$

DROP PROCEDURE IF EXISTS apply_0028_add_customer_price$$

CREATE PROCEDURE apply_0028_add_customer_price()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'product_variants' AND column_name = 'customer_price'
    ) THEN
        ALTER TABLE product_variants ADD COLUMN customer_price DECIMAL(15,2) NULL DEFAULT NULL AFTER wholesale_price;
    END IF;
END$$

DELIMITER ;

CALL apply_0028_add_customer_price();
DROP PROCEDURE IF EXISTS apply_0028_add_customer_price;
