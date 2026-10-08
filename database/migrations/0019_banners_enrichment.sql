-- Enrich banners with presentation attributes for dynamic customer storefront
ALTER TABLE banners
    ADD COLUMN subtitle VARCHAR(255) NULL AFTER title,
    ADD COLUMN description TEXT NULL AFTER subtitle,
    ADD COLUMN color_theme VARCHAR(100) NULL DEFAULT 'purple' AFTER position,
    ADD COLUMN discount_text VARCHAR(100) NULL AFTER color_theme,
    ADD COLUMN cta_text VARCHAR(100) NULL AFTER discount_text;
