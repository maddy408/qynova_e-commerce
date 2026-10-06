-- Products (spec: DOCUMENTATION.md section 8 + ECOMMERCE_POS_ADMIN_SPEC.md
-- section 5, merged; no product_line_id — see 0004_catalog.sql).
-- SKU/barcode/price/stock live on the variant, never on the product
-- itself — every product has at least one variant (DOCUMENTATION.md
-- section 8: "Variant (sellable unit)").

CREATE TABLE products (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(280) NOT NULL,
    product_code VARCHAR(50) NULL,
    brand_id INT UNSIGNED NULL,
    unit_id INT UNSIGNED NULL,
    hsn_code_id INT UNSIGNED NULL,
    gst_rate_id INT UNSIGNED NULL,
    short_description VARCHAR(500) NULL,
    description TEXT NULL,
    material VARCHAR(150) NULL,
    length_cm DECIMAL(10, 2) NULL,
    width_cm DECIMAL(10, 2) NULL,
    height_cm DECIMAL(10, 2) NULL,
    weight_grams DECIMAL(10, 2) NULL,
    manufacturer VARCHAR(150) NULL,
    country_of_origin VARCHAR(100) NULL,
    manufacturing_date DATE NULL,
    expiry_date DATE NULL,
    tags VARCHAR(500) NULL,
    meta_title VARCHAR(255) NULL,
    meta_description VARCHAR(500) NULL,
    og_image_path VARCHAR(255) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    is_pos_enabled TINYINT(1) NOT NULL DEFAULT 1,
    is_ecommerce_enabled TINYINT(1) NOT NULL DEFAULT 1,
    is_featured TINYINT(1) NOT NULL DEFAULT 0,
    show_discount TINYINT(1) NOT NULL DEFAULT 1,
    is_best_seller_override TINYINT(1) NULL,
    is_new_arrival_override TINYINT(1) NULL,
    deleted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_products_slug (slug),
    UNIQUE KEY uq_products_product_code (product_code),
    FULLTEXT KEY ft_products_search (name, tags, short_description),
    CONSTRAINT fk_products_brand FOREIGN KEY (brand_id) REFERENCES brands(id),
    CONSTRAINT fk_products_unit FOREIGN KEY (unit_id) REFERENCES units(id),
    CONSTRAINT fk_products_hsn FOREIGN KEY (hsn_code_id) REFERENCES hsn_codes(id),
    CONSTRAINT fk_products_gst FOREIGN KEY (gst_rate_id) REFERENCES gst_rates(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_images (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT UNSIGNED NOT NULL,
    image_path VARCHAR(255) NOT NULL,
    thumb_path VARCHAR(255) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_images_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    INDEX idx_product_images_product (product_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Exactly one primary category per product (primary_flag is unique
-- whenever set, enforcing "at most one primary row" per product_id).
-- No ON DELETE CASCADE on product_id: MySQL rejects a cascade action on
-- a column a stored generated column (primary_flag) depends on. Products
-- are soft-deleted in normal operation anyway; a hard delete must clear
-- product_categories rows first (service-layer responsibility).
CREATE TABLE product_categories (
    product_id BIGINT UNSIGNED NOT NULL,
    category_id INT UNSIGNED NOT NULL,
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    primary_flag BIGINT UNSIGNED GENERATED ALWAYS AS (IF(is_primary = 1, product_id, NULL)) STORED,
    PRIMARY KEY (product_id, category_id),
    UNIQUE KEY uq_product_categories_primary (primary_flag),
    CONSTRAINT fk_product_categories_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_product_categories_category FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_subcategories (
    product_id BIGINT UNSIGNED NOT NULL,
    subcategory_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (product_id, subcategory_id),
    CONSTRAINT fk_product_subcategories_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_subcategories_subcategory FOREIGN KEY (subcategory_id) REFERENCES subcategories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Manual related products; automatic same-category fill (section 8 of
-- DOCUMENTATION.md) is computed at query time, not stored here.
CREATE TABLE related_products (
    product_id BIGINT UNSIGNED NOT NULL,
    related_product_id BIGINT UNSIGNED NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, related_product_id),
    CONSTRAINT fk_related_products_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_related_products_related FOREIGN KEY (related_product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Refreshed by a scheduled job and on order events; drives best-sellers/
-- popularity sort/"most wishlisted" without recomputing from orders live.
CREATE TABLE product_stats (
    product_id BIGINT UNSIGNED PRIMARY KEY,
    units_sold_30d INT UNSIGNED NOT NULL DEFAULT 0,
    orders_30d INT UNSIGNED NOT NULL DEFAULT 0,
    wishlist_count INT UNSIGNED NOT NULL DEFAULT 0,
    view_count INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_product_stats_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
