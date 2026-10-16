-- 0036_create_top_offers.sql
-- Create top_offers table for dynamic 'Top Offers for You' section

CREATE TABLE IF NOT EXISTS top_offers (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    badge VARCHAR(100) NOT NULL,
    icon VARCHAR(50) NOT NULL DEFAULT 'percent',
    title VARCHAR(255) NOT NULL,
    subtitle TEXT NULL,
    code VARCHAR(50) NULL,
    button_text VARCHAR(100) NOT NULL DEFAULT 'Shop Deals',
    link VARCHAR(255) NOT NULL DEFAULT '/products?section=deals',
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO top_offers (id, badge, icon, title, subtitle, code, button_text, link, sort_order, is_active)
VALUES
(1, 'FREE DELIVERY', 'truck', 'Free Delivery Above ₹499', 'No shipping charge applied on orders over ₹499. Fast doorstep delivery.', NULL, 'Shop Essentials', '/products', 1, 1),
(2, 'FLAT ₹50 OFF', 'tag', 'Flat ₹50 Off Kirana Welcome', 'Flat ₹50 instant discount on orders above ₹299.', 'KIRANA50', 'Shop Deals', '/products?section=deals', 2, 1),
(3, '10% OFF', 'percent', 'Festive Offer 10% Off', 'Get 10% off on all accessories and gift orders above ₹499.', 'FESTIVE10', 'Shop Deals', '/products?section=deals', 3, 1),
(4, '10% OFF', 'percent', 'Test Coupon', 'Applicable directly on checkout', 'TEST10', 'Shop Deals', '/products?section=deals', 4, 1)
ON DUPLICATE KEY UPDATE title = VALUES(title);