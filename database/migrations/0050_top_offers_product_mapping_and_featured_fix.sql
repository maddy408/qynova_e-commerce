-- 0047_top_offers_product_mapping_and_featured_fix.sql
-- 1. Add product_id to top_offers for direct product mapping
ALTER TABLE top_offers ADD COLUMN product_id BIGINT UNSIGNED NULL AFTER image_path;
ALTER TABLE top_offers ADD CONSTRAINT fk_top_offers_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
CREATE INDEX idx_top_offers_product_id ON top_offers(product_id);

-- 2. Fix home_sections discrepancy where section 1 had type FEATURED but section_key best_sellers
UPDATE home_sections
SET section_key = 'featured',
    view_all_link = '/products?section=featured'
WHERE id = 1 AND type = 'FEATURED';
