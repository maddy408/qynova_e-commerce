-- 0041_deliveries_management_enhancement.sql
-- Production-ready delivery management enhancements:
-- Own Delivery fleet assignment (driver, vehicle), Courier partner tracking,
-- COD collection & reconciliation tracking, package metadata, return/failure tracking,
-- and actor tracking on delivery status history.

-- 1. Ensure DRIVER role exists in roles
INSERT IGNORE INTO roles (code, name) VALUES ('DRIVER', 'Delivery Driver');

-- 2. Add delivery management columns to deliveries table
ALTER TABLE deliveries
    ADD COLUMN delivery_channel ENUM('OWN_DELIVERY', 'COURIER') NOT NULL DEFAULT 'COURIER' AFTER provider,
    ADD COLUMN courier_partner VARCHAR(100) NULL AFTER courier,
    ADD COLUMN driver_id BIGINT UNSIGNED NULL AFTER courier_partner,
    ADD COLUMN driver_name VARCHAR(150) NULL AFTER driver_id,
    ADD COLUMN driver_phone VARCHAR(20) NULL AFTER driver_name,
    ADD COLUMN vehicle_no VARCHAR(50) NULL AFTER driver_phone,
    ADD COLUMN package_weight_kg DECIMAL(8,2) NOT NULL DEFAULT 0.50 AFTER vehicle_no,
    ADD COLUMN package_dimensions VARCHAR(50) NULL AFTER package_weight_kg,
    ADD COLUMN package_items_count INT UNSIGNED NOT NULL DEFAULT 1 AFTER package_dimensions,
    ADD COLUMN cod_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER package_items_count,
    ADD COLUMN cod_collected_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00 AFTER cod_amount,
    ADD COLUMN cod_status ENUM('NOT_APPLICABLE', 'PENDING', 'COLLECTED', 'RECONCILED') NOT NULL DEFAULT 'NOT_APPLICABLE' AFTER cod_collected_amount,
    ADD COLUMN cod_collected_at DATETIME NULL AFTER cod_status,
    ADD COLUMN cod_collected_by BIGINT UNSIGNED NULL AFTER cod_collected_at,
    ADD COLUMN failure_reason VARCHAR(255) NULL AFTER delivery_notes,
    ADD COLUMN return_initiated_at DATETIME NULL AFTER failure_reason,
    ADD COLUMN returned_at DATETIME NULL AFTER return_initiated_at,
    ADD COLUMN dispatched_at DATETIME NULL AFTER returned_at,
    ADD COLUMN delivered_at DATETIME NULL AFTER dispatched_at,
    MODIFY COLUMN status ENUM('PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURN_INITIATED', 'RETURNED') NOT NULL DEFAULT 'PENDING';

ALTER TABLE deliveries
    ADD INDEX idx_deliveries_channel (delivery_channel),
    ADD INDEX idx_deliveries_driver (driver_id),
    ADD INDEX idx_deliveries_cod_status (cod_status),
    ADD CONSTRAINT fk_deliveries_driver FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_deliveries_cod_collector FOREIGN KEY (cod_collected_by) REFERENCES users(id) ON DELETE SET NULL;

-- 3. Enhance delivery_status_history with actor and location
ALTER TABLE delivery_status_history
    ADD COLUMN actor_user_id BIGINT UNSIGNED NULL AFTER source,
    ADD COLUMN location VARCHAR(150) NULL AFTER note,
    ADD CONSTRAINT fk_delivery_history_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- 4. Seed default fleet drivers for Own Delivery workflow
INSERT INTO users (role_id, name, email, password_hash, status)
SELECT r.id, 'Murugan K (Fleet Driver)', 'driver1@example.com', '$2y$10$wT.f98Ofe3ZgY01gPj6UieUj9uYj8HwzU/pPcqNl1H2sBw8e.Z2iq', 'ACTIVE'
FROM roles r WHERE r.code = 'DRIVER'
AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'driver1@example.com');

INSERT INTO users (role_id, name, email, password_hash, status)
SELECT r.id, 'Suresh V (Express Driver)', 'driver2@example.com', '$2y$10$wT.f98Ofe3ZgY01gPj6UieUj9uYj8HwzU/pPcqNl1H2sBw8e.Z2iq', 'ACTIVE'
FROM roles r WHERE r.code = 'DRIVER'
AND NOT EXISTS (SELECT 1 FROM users WHERE email = 'driver2@example.com');
