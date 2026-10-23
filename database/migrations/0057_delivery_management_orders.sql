-- 0057_delivery_management_orders.sql
-- Delivery Management (Part B): per-order delivery decision, snapshotted
-- at checkout time the same way shipping_name/phone/address already are
-- — an order must keep reading the same delivery type/distance/charge
-- years later even if the shop's radius or price-per-kg setting changes
-- afterward. Tracking fields cover the "beyond radius -> India Post"
-- path only (own-delivery orders simply leave them NULL).
ALTER TABLE orders
    ADD COLUMN delivery_type ENUM('OWN_DELIVERY', 'INDIA_POST') NULL AFTER shipping_pincode,
    ADD COLUMN delivery_distance_km DECIMAL(8,2) NULL AFTER delivery_type,
    ADD COLUMN delivery_days TINYINT UNSIGNED NULL AFTER delivery_distance_km,
    ADD COLUMN delivery_geocode_source ENUM('pending', 'nominatim', 'district_centroid') NULL AFTER delivery_days,
    ADD COLUMN is_first_order_delivery TINYINT(1) NOT NULL DEFAULT 0 AFTER delivery_geocode_source,
    ADD COLUMN delivery_tracking_id VARCHAR(60) NULL AFTER is_first_order_delivery,
    ADD COLUMN delivery_tracking_courier VARCHAR(100) NULL AFTER delivery_tracking_id,
    ADD COLUMN delivery_tracking_status VARCHAR(50) NULL AFTER delivery_tracking_courier,
    ADD COLUMN delivery_whatsapp_sent_at DATETIME NULL AFTER delivery_tracking_status,
    ADD INDEX idx_orders_delivery_tracking (delivery_tracking_id);
