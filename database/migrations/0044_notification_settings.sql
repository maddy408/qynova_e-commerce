-- Migration 0044: Notification Settings & Discount Limits for Firebase Push & Redis
CREATE TABLE IF NOT EXISTS app_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    description VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO app_settings (setting_key, setting_value, description)
VALUES 
    ('notification_discount_threshold_percent', '10.0', 'Minimum discount percentage threshold to trigger push notifications (for price drops and new coupons)'),
    ('notification_daily_discount_limit', '5', 'Maximum daily push notifications allowed for price drops and discount alerts'),
    ('notification_price_drop_enabled', '1', 'Enable automatic push notifications on product price drops (1 = true, 0 = false)'),
    ('notification_coupon_enabled', '1', 'Enable automatic push notifications on new coupon codes (1 = true, 0 = false)'),
    ('notification_redis_enabled', '1', 'Enable Redis job queue for push notification dispatch (1 = true, 0 = false)')
ON DUPLICATE KEY UPDATE 
    setting_key = VALUES(setting_key);
