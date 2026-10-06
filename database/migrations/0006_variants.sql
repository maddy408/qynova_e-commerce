-- Variant architecture (spec: ECOMMERCE_POS_ADMIN_SPEC.md sections 6-7).
-- Attributes (Size, Color, ...) and their values are admin-managed masters;
-- each variant is linked to one value per attribute via
-- product_variant_values. Uniqueness of an attribute combination within a
-- product (no two "Blue + L" variants on the same product) is enforced in
-- the service layer, not the schema — a portable DB-level check across a
-- variable number of attributes would need a derived signature column
-- that can't be computed from product_variants' own columns alone.

CREATE TABLE variant_attributes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_variant_attributes_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE variant_attribute_values (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    attribute_id INT UNSIGNED NOT NULL,
    value VARCHAR(100) NOT NULL,
    color_hex VARCHAR(7) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    UNIQUE KEY uq_variant_attribute_values (attribute_id, value),
    CONSTRAINT fk_variant_attribute_values_attribute FOREIGN KEY (attribute_id) REFERENCES variant_attributes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_variants (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id BIGINT UNSIGNED NOT NULL,
    sku VARCHAR(80) NOT NULL,
    barcode VARCHAR(80) NULL,
    mrp DECIMAL(15, 2) NOT NULL,
    retail_price DECIMAL(15, 2) NOT NULL,
    wholesale_price DECIMAL(15, 2) NULL,
    purchase_price DECIMAL(15, 2) NULL,
    min_selling_price DECIMAL(15, 2) NULL,
    weight_grams DECIMAL(10, 2) NULL,
    hsn_code_id INT UNSIGNED NULL,
    gst_rate_id INT UNSIGNED NULL,
    manufacturing_date DATE NULL,
    expiry_date DATE NULL,
    variant_description TEXT NULL,
    is_default TINYINT(1) NOT NULL DEFAULT 0,
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    deleted_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_product_variants_sku (sku),
    UNIQUE KEY uq_product_variants_barcode (barcode),
    INDEX idx_product_variants_product (product_id),
    CONSTRAINT fk_product_variants_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_variants_hsn FOREIGN KEY (hsn_code_id) REFERENCES hsn_codes(id),
    CONSTRAINT fk_product_variants_gst FOREIGN KEY (gst_rate_id) REFERENCES gst_rates(id),
    CONSTRAINT chk_product_variants_prices CHECK (mrp >= 0 AND retail_price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE product_variant_values (
    variant_id BIGINT UNSIGNED NOT NULL,
    attribute_value_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (variant_id, attribute_value_id),
    CONSTRAINT fk_product_variant_values_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_product_variant_values_value FOREIGN KEY (attribute_value_id) REFERENCES variant_attribute_values(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE variant_images (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    variant_id BIGINT UNSIGNED NOT NULL,
    image_path VARCHAR(255) NOT NULL,
    thumb_path VARCHAR(255) NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_primary TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_variant_images_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    INDEX idx_variant_images_variant (variant_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-customer price overrides (spec: DOCUMENTATION.md section 21,
-- Customers group) on top of the retail/wholesale split above.
CREATE TABLE customer_price_lists (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(150) NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_customer_price_lists_customer (customer_id),
    CONSTRAINT fk_customer_price_lists_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE customer_price_list_items (
    price_list_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED NOT NULL,
    price DECIMAL(15, 2) NOT NULL,
    PRIMARY KEY (price_list_id, variant_id),
    CONSTRAINT fk_customer_price_list_items_list FOREIGN KEY (price_list_id) REFERENCES customer_price_lists(id) ON DELETE CASCADE,
    CONSTRAINT fk_customer_price_list_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
