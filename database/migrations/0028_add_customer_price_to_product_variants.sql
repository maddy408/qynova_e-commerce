-- 0028_add_customer_price_to_product_variants.sql
-- Adds customer_price to product_variants for Customer-Wise tier pricing

ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS customer_price DECIMAL(15,2) NULL DEFAULT NULL AFTER wholesale_price;
