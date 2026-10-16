-- In-app notification history (admin + customer). device_tokens already
-- exists (0001_access.sql) — schema was orphaned (no controller/service
-- ever read or wrote it) but already shaped correctly (owner_type/
-- owner_id polymorphic pair, unique token, is_active, and an index on
-- (owner_type, owner_id, is_active)) for DeviceTokenService's lookups.
-- This migration only adds what was actually missing: the notifications
-- table itself.

CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    recipient_type ENUM('USER', 'CUSTOMER') NOT NULL,
    recipient_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body VARCHAR(500) NOT NULL,
    reference_type VARCHAR(50) NULL,
    reference_id BIGINT UNSIGNED NULL,
    data JSON NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    read_at DATETIME NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_notifications_recipient (recipient_type, recipient_id, is_read, created_at),
    INDEX idx_notifications_reference (reference_type, reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- device_tokens(id, owner_type, owner_id, token, platform, user_agent,
-- is_active, last_seen_at, created_at) already exists with a unique key
-- on `token` and an index on (owner_type, owner_id, is_active) — exactly
-- what DeviceTokenService needs; nothing to add there.
