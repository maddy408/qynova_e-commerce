-- Orders (docs/DOCUMENTATION.md section 13, 20; ECOMMERCE_POS_ADMIN_SPEC.md
-- sections 18-20, 36-38). Address and product/variant details are
-- snapshotted onto the order/order_items at creation time — an order must
-- read the same five years from now even if the product, its price, or
-- the customer's saved address changes later.

CREATE TABLE orders (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_no VARCHAR(30) NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    status ENUM(
        'PENDING', 'CONFIRMED', 'PROCESSING', 'PACKED', 'SHIPPED',
        'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURN_REQUESTED',
        'RETURNED', 'REFUNDED'
    ) NOT NULL DEFAULT 'PENDING',
    payment_status ENUM('PENDING', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    subtotal DECIMAL(15, 2) NOT NULL,
    product_discount_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    coupon_id BIGINT UNSIGNED NULL,
    coupon_code VARCHAR(40) NULL,
    coupon_discount_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    referral_reward_id BIGINT UNSIGNED NULL,
    referral_discount_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    tax_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    shipping_total DECIMAL(15, 2) NOT NULL DEFAULT 0,
    grand_total DECIMAL(15, 2) NOT NULL,
    shipping_name VARCHAR(150) NOT NULL,
    shipping_phone VARCHAR(20) NOT NULL,
    shipping_line1 VARCHAR(255) NOT NULL,
    shipping_line2 VARCHAR(255) NULL,
    shipping_city_district VARCHAR(100) NOT NULL,
    shipping_state VARCHAR(100) NOT NULL,
    shipping_pincode VARCHAR(10) NOT NULL,
    placed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_at DATETIME NULL,
    cancellation_reason VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_orders_order_no (order_no),
    INDEX idx_orders_customer (customer_id, created_at),
    INDEX idx_orders_status (status),
    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_orders_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id),
    CONSTRAINT fk_orders_referral_reward FOREIGN KEY (referral_reward_id) REFERENCES referral_rewards(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED NOT NULL,
    product_name_snapshot VARCHAR(255) NOT NULL,
    variant_label_snapshot VARCHAR(255) NULL,
    sku_snapshot VARCHAR(80) NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    mrp DECIMAL(15, 2) NOT NULL,
    unit_price DECIMAL(15, 2) NOT NULL,
    product_discount_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
    line_total DECIMAL(15, 2) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_items_order (order_id),
    CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_order_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Coupon/referral discount allocated per item (proportional to line
-- subtotal, last item absorbs rounding) — docs/DOCUMENTATION.md section 9
-- "Coupon Logic with Partial Cancellation". The re-validate-on-cancel
-- algorithm itself is not built yet (see database/README.md); this table
-- exists now so that work doesn't need a schema change later.
CREATE TABLE order_item_discounts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_item_id BIGINT UNSIGNED NOT NULL,
    discount_type ENUM('COUPON', 'REFERRAL') NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    CONSTRAINT fk_order_item_discounts_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE order_status_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    from_status VARCHAR(30) NULL,
    to_status VARCHAR(30) NOT NULL,
    changed_by BIGINT UNSIGNED NULL,
    source ENUM('ADMIN', 'SYSTEM', 'SHIPPING_WEBHOOK', 'CUSTOMER') NOT NULL,
    note VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_order_status_history_order (order_id, created_at),
    CONSTRAINT fk_order_status_history_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Retroactive FKs now that `orders` exists (see 0007_inventory.sql and
-- 0008_coupons.sql for why these were deferred).
ALTER TABLE stock_reservations
    ADD CONSTRAINT fk_stock_reservations_order FOREIGN KEY (order_id) REFERENCES orders(id);

ALTER TABLE coupon_usages
    ADD CONSTRAINT fk_coupon_usages_order FOREIGN KEY (order_id) REFERENCES orders(id);
