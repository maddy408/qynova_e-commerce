-- Storefront database source of truth: store_settings, delivery_settings, wishlist, offers, pages, and carts/home_sections upgrades

-- 1. Store settings
CREATE TABLE IF NOT EXISTS store_settings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    store_name VARCHAR(150) NOT NULL DEFAULT 'KiranaBazaar',
    logo VARCHAR(255) NULL,
    favicon VARCHAR(255) NULL,
    tagline VARCHAR(255) NULL DEFAULT 'Your Trusted Neighborhood Store',
    description TEXT NULL,
    phone VARCHAR(50) NULL DEFAULT '+91 98765 01234',
    whatsapp_number VARCHAR(50) NULL DEFAULT '919876501234',
    email VARCHAR(150) NULL DEFAULT 'support@kiranabazaar.in',
    address VARCHAR(255) NULL DEFAULT 'Plot 42, Commercial Avenue, Sector 5',
    city VARCHAR(100) NULL DEFAULT 'Jaipur',
    state VARCHAR(100) NULL DEFAULT 'Rajasthan',
    pincode VARCHAR(20) NULL DEFAULT '302001',
    support_hours VARCHAR(100) NULL DEFAULT 'Mon - Sat: 9:00 AM - 9:00 PM',
    facebook_url VARCHAR(255) NULL,
    instagram_url VARCHAR(255) NULL,
    youtube_url VARCHAR(255) NULL,
    website_url VARCHAR(255) NULL,
    copyright_text VARCHAR(255) NULL DEFAULT 'KiranaBazaar Hub. All rights reserved.',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO store_settings (id, store_name, tagline, description, phone, whatsapp_number, email, address, city, state, pincode, support_hours, copyright_text)
VALUES (1, 'KiranaBazaar', 'Your Trusted Neighborhood Store', 'Your trusted supermarket for trending hair accessories, Korean jewellery, gifts, plush toys, and beauty essentials at unmatched prices.', '+91 98765 01234', '919876501234', 'support@kiranabazaar.in', 'Plot 42, Commercial Avenue, Sector 5', 'Jaipur', 'Rajasthan', '302001', 'Mon - Sat: 9:00 AM - 9:00 PM', 'KiranaBazaar Hub. All rights reserved.')
ON DUPLICATE KEY UPDATE store_name = VALUES(store_name);

-- 2. Delivery settings
CREATE TABLE IF NOT EXISTS delivery_settings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    minimum_order_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    delivery_charge DECIMAL(15,2) NOT NULL DEFAULT 49.00,
    free_delivery_threshold DECIMAL(15,2) NOT NULL DEFAULT 499.00,
    delivery_discount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    estimated_delivery_text VARCHAR(255) NOT NULL DEFAULT '2–4 Business Days',
    express_delivery_text VARCHAR(255) NOT NULL DEFAULT '1–2 Business Days (Express Courier)',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO delivery_settings (id, minimum_order_amount, delivery_charge, free_delivery_threshold, delivery_discount, estimated_delivery_text)
VALUES (1, 0.00, 49.00, 499.00, 0.00, '2–4 Business Days')
ON DUPLICATE KEY UPDATE delivery_charge = VALUES(delivery_charge);

-- 3. Wishlist table (supporting logged-in customer & guest session persistence)
CREATE TABLE IF NOT EXISTS wishlist (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id BIGINT UNSIGNED NULL,
    session_id VARCHAR(64) NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_wishlist_customer_product (customer_id, product_id),
    INDEX idx_wishlist_session (session_id, product_id),
    CONSTRAINT fk_wishlist_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT fk_wishlist_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Enable session-based guest carts in MySQL
ALTER TABLE carts MODIFY customer_id BIGINT UNSIGNED NULL;
ALTER TABLE carts ADD COLUMN session_id VARCHAR(64) NULL AFTER customer_id;
ALTER TABLE carts ADD UNIQUE KEY uq_carts_session (session_id);

-- 5. Offers and Flash Deals table
CREATE TABLE IF NOT EXISTS offers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255) NULL,
    description TEXT NULL,
    offer_type ENUM('FLASH_DEAL', 'FESTIVAL', 'COMBO', 'SPECIAL') NOT NULL DEFAULT 'FLASH_DEAL',
    discount_type ENUM('PERCENTAGE', 'FIXED') NOT NULL DEFAULT 'PERCENTAGE',
    discount_value DECIMAL(15,2) NOT NULL DEFAULT 20.00,
    start_datetime DATETIME NOT NULL,
    end_datetime DATETIME NOT NULL,
    minimum_order_amount DECIMAL(15,2) NULL,
    maximum_discount_amount DECIMAL(15,2) NULL,
    target_type ENUM('PRODUCT', 'CATEGORY', 'ALL') NOT NULL DEFAULT 'ALL',
    target_id BIGINT UNSIGNED NULL,
    banner_id BIGINT UNSIGNED NULL,
    badge_text VARCHAR(100) NULL DEFAULT 'FLASH SALE',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO offers (id, name, title, subtitle, description, offer_type, discount_type, discount_value, start_datetime, end_datetime, badge_text, is_active)
VALUES (
    1,
    'Flash Sale Special',
    'Mega Supermarket Savings',
    'Extra discount applied on handpicked bestseller accessories and gifts',
    'Limited hours flash sale with verified instant savings on trending products.',
    'FLASH_DEAL',
    'PERCENTAGE',
    25.00,
    NOW() - INTERVAL 1 HOUR,
    NOW() + INTERVAL 23 HOUR,
    'LIMITED TIME FLASH DEAL',
    1
)
ON DUPLICATE KEY UPDATE end_datetime = VALUES(end_datetime);

-- 6. Pages & Policies table
CREATE TABLE IF NOT EXISTS pages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    content LONGTEXT NOT NULL,
    page_type ENUM('POLICY', 'ABOUT', 'CONTACT', 'TERMS', 'CUSTOM') NOT NULL DEFAULT 'POLICY',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO pages (slug, title, page_type, content) VALUES
('shipping-policy', 'Shipping & Delivery Policy', 'POLICY', 'All orders are processed and dispatched within 24 hours from our local hub. We offer free standard delivery across India on orders over ₹499. Orders below ₹499 incur a nominal delivery fee of ₹49. Average delivery timeline is 2 to 4 business days.'),
('return-policy', 'Return & Refund Policy', 'POLICY', 'We offer a hassle-free 7-day return guarantee for damaged, defective, or incorrect items. Return requests can be submitted directly through your order history. Once verified, refunds are processed within 3-5 business days.'),
('privacy-policy', 'Privacy Policy', 'POLICY', 'We value your trust and are committed to protecting your personal information. We do not sell your personal data. All payments are encrypted via secure SSL payment protocols.'),
('terms-and-conditions', 'Terms & Conditions', 'TERMS', 'By accessing KiranaBazaar, you agree to our terms of service. Products are subject to inventory availability and verified pricing at time of purchase.'),
('about-us', 'About Us', 'ABOUT', 'KiranaBazaar is your neighborhood online destination for premium lifestyle accessories, hair care essentials, trending jewellery, toys, and luxury gift hampers at affordable direct-from-source prices.'),
('contact-us', 'Contact Support', 'CONTACT', 'Our support team is available Monday to Saturday, 9:00 AM to 9:00 PM. Contact us via WhatsApp or email for instant assistance with orders and inquiries.')
ON DUPLICATE KEY UPDATE title = VALUES(title);

-- 7. Home sections enrichment
ALTER TABLE home_sections ADD COLUMN section_key VARCHAR(100) NULL AFTER type;
ALTER TABLE home_sections ADD COLUMN subtitle VARCHAR(255) NULL AFTER title;
ALTER TABLE home_sections ADD COLUMN badge_text VARCHAR(100) NULL AFTER subtitle;
ALTER TABLE home_sections ADD COLUMN view_all_link VARCHAR(255) NULL AFTER item_limit;

INSERT INTO home_sections (id, type, section_key, title, subtitle, badge_text, item_limit, sort_order, is_active, view_all_link)
VALUES
(1, 'BEST_SELLERS', 'best_sellers', 'Best Sellers', 'Customer favorites that fly off our shelves fastest', 'MOST POPULAR', 8, 1, 1, '/products?section=best_sellers'),
(2, 'NEW_ARRIVALS', 'new_arrivals', 'New Arrivals', 'Fresh trends and newest additions just arrived', 'JUST DROPPED', 8, 2, 1, '/products?section=new_arrivals'),
(3, 'FEATURED', 'featured', 'Featured Products', 'Curated collections handpicked by our stylists', 'STAFF PICKS', 8, 3, 1, '/products?section=featured'),
(4, 'DEALS', 'deals', 'Hot Deals', 'Unbeatable savings on trending accessories and gifts', 'MAX VALUE', 8, 4, 1, '/products?section=deals'),
(5, 'CUSTOM', 'trending', 'Trending Products', 'What everyone is loving and sharing right now', 'TRENDING NOW', 8, 5, 1, '/products?section=trending')
ON DUPLICATE KEY UPDATE section_key = VALUES(section_key);

-- 8. Customer addresses enhancements
ALTER TABLE customer_addresses ADD COLUMN landmark VARCHAR(255) NULL AFTER pincode;
ALTER TABLE customer_addresses ADD COLUMN address_type VARCHAR(50) NOT NULL DEFAULT 'HOME' AFTER landmark;
