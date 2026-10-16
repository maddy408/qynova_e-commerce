-- Add image, top brand flag, offer text, and sort order to brands for storefront showcase
ALTER TABLE brands
ADD COLUMN image_path VARCHAR(255) NULL AFTER description,
ADD COLUMN is_top_brand TINYINT(1) NOT NULL DEFAULT 0 AFTER status,
ADD COLUMN offer_text VARCHAR(100) NULL AFTER is_top_brand,
ADD COLUMN sort_order INT NOT NULL DEFAULT 0 AFTER offer_text;
