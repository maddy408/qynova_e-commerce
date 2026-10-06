-- Product Create enrichment (requested spec sections 3, 8-9, 23, 26, 30-31,
-- 32, 34). Adds the highest-value fields from that spec's 15-section
-- mockup directly onto `products` (scalar, admin-editable) plus a
-- normalized `product_specifications` table. Deliberately NOT added —
-- manufacturer address/contact/importer/packer, batch tracking, shipping
-- class/package dimensions, per-channel min/max order quantities: low
-- practical value for a single-shop build, flagged in database/README.md
-- rather than silently dropped.

ALTER TABLE products
    ADD COLUMN bullet_points JSON NULL AFTER description,
    ADD COLUMN expiry_applicable TINYINT(1) NOT NULL DEFAULT 0 AFTER expiry_date,
    ADD COLUMN warranty_applicable TINYINT(1) NOT NULL DEFAULT 0 AFTER expiry_applicable,
    ADD COLUMN warranty_period INT UNSIGNED NULL AFTER warranty_applicable,
    ADD COLUMN warranty_unit ENUM('DAYS', 'MONTHS', 'YEARS') NULL AFTER warranty_period,
    ADD COLUMN warranty_description VARCHAR(500) NULL AFTER warranty_unit,
    ADD COLUMN returnable TINYINT(1) NOT NULL DEFAULT 1 AFTER warranty_description,
    ADD COLUMN return_window_days INT UNSIGNED NULL AFTER returnable,
    ADD COLUMN replacement_available TINYINT(1) NOT NULL DEFAULT 0 AFTER return_window_days,
    ADD COLUMN refund_available TINYINT(1) NOT NULL DEFAULT 1 AFTER replacement_available,
    ADD COLUMN seo_keywords VARCHAR(500) NULL AFTER meta_description,
    ADD COLUMN is_trending TINYINT(1) NOT NULL DEFAULT 0 AFTER is_featured,
    ADD COLUMN is_deal TINYINT(1) NOT NULL DEFAULT 0 AFTER is_trending;

CREATE TABLE product_specifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(100) NOT NULL,
    value VARCHAR(255) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_product_specifications_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product_specifications_product (product_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
