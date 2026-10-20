-- SEO fields for category & subcategory landing pages (/category/:slug).
-- All optional: when empty, the storefront SEO service auto-generates
-- the title/description from the name, product count and price range.
ALTER TABLE categories
    ADD COLUMN meta_title VARCHAR(255) NULL AFTER description,
    ADD COLUMN meta_description VARCHAR(500) NULL AFTER meta_title,
    ADD COLUMN seo_keywords VARCHAR(500) NULL AFTER meta_description,
    ADD COLUMN seo_content TEXT NULL AFTER seo_keywords;

ALTER TABLE subcategories
    ADD COLUMN meta_title VARCHAR(255) NULL AFTER description,
    ADD COLUMN meta_description VARCHAR(500) NULL AFTER meta_title,
    ADD COLUMN seo_keywords VARCHAR(500) NULL AFTER meta_description,
    ADD COLUMN seo_content TEXT NULL AFTER seo_keywords;
