-- 0058_delivery_tracking_messages.sql
-- Delivery Management (Part B): WhatsApp tracking-notification send log.
-- Mirrors courier_sync_logs' shape/role (0043_courier_partners_management.sql)
-- and the "durable record first, best-effort external send second" idiom
-- already used by NotificationDispatcher — a row is written here before
-- the WhatsApp Cloud API call is even attempted, so "credentials not
-- configured" and "API call failed" both leave an auditable trail rather
-- than silently vanishing.
CREATE TABLE IF NOT EXISTS delivery_tracking_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    channel ENUM('WHATSAPP_CLOUD_API', 'WHATSAPP_CLICK_TO_CHAT') NOT NULL,
    recipient_phone VARCHAR(20) NOT NULL,
    template_name VARCHAR(100) NULL,
    payload_sanitized JSON NULL,
    status ENUM('PENDING', 'SENT', 'FAILED', 'SKIPPED_UNCONFIGURED') NOT NULL DEFAULT 'PENDING',
    provider_message_id VARCHAR(120) NULL,
    error_message VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME NULL,
    KEY idx_delivery_tracking_messages_order (order_id),
    CONSTRAINT fk_delivery_tracking_messages_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
