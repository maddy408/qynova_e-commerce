-- 0056_delivery_management_settings.sql
-- Delivery Management (Part B): a dedicated settings table, deliberately
-- separate from the existing `delivery_settings` table (0024_...sql),
-- which remains untouched and keeps serving its own unrelated flat-rate
-- shipping role (OrderService's FLAT_SHIPPING/FREE_SHIPPING_ABOVE
-- fallback). Bolting distance/weight fields onto that table would
-- conflate two different pricing engines. Singleton row, same pattern
-- as referral_settings.
CREATE TABLE IF NOT EXISTS delivery_management_settings (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    radius_km DECIMAL(6,2) NOT NULL DEFAULT 10.00,
    price_per_kg DECIMAL(10,2) NOT NULL DEFAULT 20.00,
    flat_fallback_charge DECIMAL(10,2) NOT NULL DEFAULT 100.00,
    own_delivery_days TINYINT UNSIGNED NOT NULL DEFAULT 1,
    post_min_days TINYINT UNSIGNED NOT NULL DEFAULT 2,
    post_max_days TINYINT UNSIGNED NOT NULL DEFAULT 3,
    default_courier_name VARCHAR(100) NOT NULL DEFAULT 'India Post',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO delivery_management_settings (id, radius_km, price_per_kg, flat_fallback_charge, own_delivery_days, post_min_days, post_max_days, default_courier_name)
VALUES (1, 10.00, 20.00, 100.00, 1, 2, 3, 'India Post')
ON DUPLICATE KEY UPDATE id = id;
