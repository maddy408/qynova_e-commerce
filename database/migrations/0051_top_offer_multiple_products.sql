-- 0048_top_offer_multiple_products.sql
-- Create relational mapping table for Top Offers <-> Multiple Products

CREATE TABLE IF NOT EXISTS top_offer_products (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    top_offer_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_top_offer_products_offer FOREIGN KEY (top_offer_id) REFERENCES top_offers(id) ON DELETE CASCADE,
    CONSTRAINT fk_top_offer_products_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY uq_top_offer_product (top_offer_id, product_id),
    INDEX idx_top_offer_products_offer (top_offer_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrate any existing single product_id mapping into top_offer_products
INSERT IGNORE INTO top_offer_products (top_offer_id, product_id, sort_order)
SELECT id, product_id, 0 FROM top_offers WHERE product_id IS NOT NULL;
