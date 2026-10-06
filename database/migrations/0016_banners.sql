-- Banners and home page sections (docs/DOCUMENTATION.md section 10).
-- Scoped down from the full section: combos/deals and the automatic
-- "discount_group" target stay deferred (no backing tables exist yet —
-- see database/README.md "Not yet built"), so banner target_type omits
-- DISCOUNT_GROUP, and home_sections' COMBOS/DEALS/BEST_SELLERS types are
-- schema-ready (the enum values exist so nothing has to migrate again
-- later) but not resolved by any endpoint yet — BEST_SELLERS would need
-- product_stats (also deferred), COMBOS/DEALS need their own tables.

CREATE TABLE banners (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    image_desktop_path VARCHAR(255) NULL,
    image_mobile_path VARCHAR(255) NULL,
    position ENUM('HOME_HERO', 'HOME_MIDDLE', 'CATEGORY_PAGE', 'POPUP') NOT NULL DEFAULT 'HOME_HERO',
    -- Polymorphic target: target_id's table depends on target_type, so it
    -- deliberately has no FK (same reasoning as the generated-column note
    -- below — a single banner can point at a product, a category, a
    -- subcategory, a brand, a coupon, an external URL, or nothing).
    target_type ENUM('PRODUCT', 'CATEGORY', 'SUBCATEGORY', 'BRAND', 'COUPON', 'EXTERNAL_URL', 'NONE') NOT NULL DEFAULT 'NONE',
    target_id BIGINT UNSIGNED NULL,
    target_url VARCHAR(500) NULL,
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_banners_position_active (position, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Products attached to a banner's landing page (DOCUMENTATION.md section
-- 10: "Clicking a banner opens a landing page listing those items with
-- the offer shown. Visibility only: pricing still comes from backend.").
CREATE TABLE banner_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    banner_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    offer_text VARCHAR(255) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_banner_items_banner FOREIGN KEY (banner_id) REFERENCES banners(id) ON DELETE CASCADE,
    CONSTRAINT fk_banner_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE KEY uq_banner_items_banner_product (banner_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE home_sections (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    type ENUM('BANNER', 'CATEGORIES', 'BEST_SELLERS', 'NEW_ARRIVALS', 'FEATURED', 'COMBOS', 'DEALS', 'CUSTOM') NOT NULL,
    title VARCHAR(150) NULL,
    item_limit INT UNSIGNED NOT NULL DEFAULT 10,
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions (code, description) VALUES
    ('banners.manage', 'Create/edit banners and home page sections');

-- Mirrors seed/0001_seed.sql's "Admin gets every permission" — that seed
-- only runs once at setup, so a permission added by a later migration
-- needs its own grant or ADMIN logins created before this migration ran
-- would silently lack it.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'ADMIN' AND p.code = 'banners.manage';
