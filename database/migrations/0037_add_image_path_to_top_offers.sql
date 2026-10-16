-- 0037_add_image_path_to_top_offers.sql
-- Add image_path to top_offers table for card background image

ALTER TABLE top_offers
    ADD COLUMN image_path VARCHAR(255) NULL AFTER subtitle;
