-- Shipping Required / COD Available toggles for the Product Create
-- e-commerce-details step. Physical dimensions/weight already exist
-- (0005_products.sql) but were never wired into ProductService; fixed
-- alongside this, not a schema change.

ALTER TABLE products
    ADD COLUMN shipping_required TINYINT(1) NOT NULL DEFAULT 1 AFTER refund_available,
    ADD COLUMN cod_available TINYINT(1) NOT NULL DEFAULT 1 AFTER shipping_required;
