-- Admin -> all-customers broadcast push notifications. Reuses the
-- existing notifications table (one row per recipient, same as every
-- other notification type — see NotificationService) and device_tokens
-- (see DeviceTokenService) for actual delivery; this migration only adds
-- what neither of those covers: a campaign-level audit record (who sent
-- what, to how many, with what delivery result) and the permission that
-- gates sending one.

CREATE TABLE IF NOT EXISTS broadcast_campaigns (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body VARCHAR(500) NOT NULL,
    sent_by_user_id BIGINT UNSIGNED NOT NULL,
    idempotency_key VARCHAR(100) NULL,
    recipient_customer_count INT UNSIGNED NOT NULL DEFAULT 0,
    token_count INT UNSIGNED NOT NULL DEFAULT 0,
    success_count INT UNSIGNED NOT NULL DEFAULT 0,
    failure_count INT UNSIGNED NOT NULL DEFAULT 0,
    status ENUM('PROCESSING', 'COMPLETED') NOT NULL DEFAULT 'PROCESSING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    UNIQUE KEY uq_broadcast_campaigns_idempotency (idempotency_key),
    INDEX idx_broadcast_campaigns_sent_by (sent_by_user_id, created_at),
    CONSTRAINT fk_broadcast_campaigns_user FOREIGN KEY (sent_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO permissions (code, description)
VALUES ('notifications.broadcast', 'Send broadcast push notifications to all customers');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'ADMIN' AND p.code = 'notifications.broadcast';
