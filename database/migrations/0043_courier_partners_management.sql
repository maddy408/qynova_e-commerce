-- 0043_courier_partners_management.sql
-- Production-ready Courier Partners Management schema:
-- Stores courier partner configurations, services, service areas, credentials (encrypted/masked),
-- sync status, performance stats, sync logs, and links deliveries to courier partners.

CREATE TABLE IF NOT EXISTS courier_partners (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL,
    subtitle VARCHAR(150) NULL,
    account_id VARCHAR(100) NOT NULL,
    logo_url VARCHAR(255) NULL,
    status ENUM('ACTIVE', 'PENDING', 'INACTIVE') NOT NULL DEFAULT 'PENDING',
    integration_status ENUM('CONNECTED', 'PENDING', 'ERROR', 'UNCONFIGURED') NOT NULL DEFAULT 'UNCONFIGURED',
    company_name VARCHAR(190) NULL,
    contact_person VARCHAR(150) NULL,
    email VARCHAR(190) NULL,
    phone VARCHAR(50) NULL,
    website VARCHAR(190) NULL,
    supported_services JSON NULL,
    service_areas JSON NULL,
    auth_type ENUM('API_KEY', 'BEARER_TOKEN', 'OAUTH2', 'BASIC') NOT NULL DEFAULT 'API_KEY',
    api_base_url VARCHAR(255) NULL,
    webhook_url VARCHAR(255) NULL,
    tracking_method ENUM('WEBHOOK', 'POLLING') NOT NULL DEFAULT 'WEBHOOK',
    masked_api_key VARCHAR(100) NULL,
    encrypted_credentials TEXT NULL,
    last_sync_at DATETIME NULL,
    total_shipments INT UNSIGNED NOT NULL DEFAULT 0,
    success_rate DECIMAL(5,2) NOT NULL DEFAULT 98.00,
    avg_delivery_days DECIMAL(4,1) NOT NULL DEFAULT 2.5,
    error_notes VARCHAR(255) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL,
    UNIQUE KEY uq_courier_partners_code (code),
    UNIQUE KEY uq_courier_partners_account (account_id),
    INDEX idx_courier_partners_status (status),
    INDEX idx_courier_partners_integration (integration_status),
    CONSTRAINT fk_courier_partners_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS courier_sync_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    courier_partner_id BIGINT UNSIGNED NOT NULL,
    event_type ENUM('CONNECTION_TEST', 'POLL_TRACKING', 'WEBHOOK_RECEIVED', 'SHIPMENT_DISPATCH', 'RECONCILIATION') NOT NULL,
    status ENUM('SUCCESS', 'FAILED') NOT NULL,
    message VARCHAR(255) NOT NULL,
    payload_sanitized JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_courier_sync_logs_partner (courier_partner_id),
    INDEX idx_courier_sync_logs_type (event_type),
    CONSTRAINT fk_courier_sync_logs_partner FOREIGN KEY (courier_partner_id) REFERENCES courier_partners(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional link on deliveries to configured courier partners
ALTER TABLE deliveries
    ADD COLUMN courier_partner_id BIGINT UNSIGNED NULL AFTER courier_partner,
    ADD CONSTRAINT fk_deliveries_courier_partner FOREIGN KEY (courier_partner_id) REFERENCES courier_partners(id) ON DELETE SET NULL;
