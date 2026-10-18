-- 0042_returns_management_enhancement.sql
-- Production-ready Returns Management System:
-- Extended sale_returns with full lifecycle status, return type (Refund vs Replacement),
-- pickup/courier tracking, inspection & condition evaluation, refund linking,
-- replacement order linking, audit tracking, item snapshots, and tracking history timeline.

-- 1. Ensure returns.manage permission exists
INSERT IGNORE INTO permissions (code, description) VALUES
    ('returns.manage', 'Manage return requests, approve/reject, inspect items, process refunds and replacements');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'ADMIN' AND p.code = 'returns.manage';

-- 2. Add columns to sale_returns table
ALTER TABLE sale_returns
    ADD COLUMN status ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PICKUP_SCHEDULED', 'ITEM_RECEIVED', 'INSPECTION', 'PROCESSING', 'COMPLETED') NOT NULL DEFAULT 'PENDING_REVIEW' AFTER customer_id,
    ADD COLUMN return_type ENUM('REFUND', 'REPLACEMENT') NOT NULL DEFAULT 'REFUND' AFTER status,
    ADD COLUMN pickup_partner VARCHAR(100) NULL AFTER notes,
    ADD COLUMN pickup_tracking_id VARCHAR(100) NULL AFTER pickup_partner,
    ADD COLUMN pickup_tracking_url VARCHAR(255) NULL AFTER pickup_tracking_id,
    ADD COLUMN pickup_status VARCHAR(50) NULL AFTER pickup_tracking_url,
    ADD COLUMN pickup_scheduled_at DATETIME NULL AFTER pickup_status,
    ADD COLUMN pickup_completed_at DATETIME NULL AFTER pickup_scheduled_at,
    ADD COLUMN inspection_condition ENUM('PENDING', 'RESELLABLE', 'DAMAGED', 'DEFECTIVE', 'QUARANTINED') NOT NULL DEFAULT 'PENDING' AFTER pickup_completed_at,
    ADD COLUMN inspection_notes TEXT NULL AFTER inspection_condition,
    ADD COLUMN inspected_by BIGINT UNSIGNED NULL AFTER inspection_notes,
    ADD COLUMN inspected_at DATETIME NULL AFTER inspected_by,
    ADD COLUMN stock_credited TINYINT(1) NOT NULL DEFAULT 0 AFTER inspected_at,
    ADD COLUMN stock_adjustment_id BIGINT UNSIGNED NULL AFTER stock_credited,
    ADD COLUMN refund_id BIGINT UNSIGNED NULL AFTER stock_adjustment_id,
    ADD COLUMN refund_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER refund_id,
    ADD COLUMN refunded_at DATETIME NULL AFTER refund_amount,
    ADD COLUMN refunded_by BIGINT UNSIGNED NULL AFTER refunded_at,
    ADD COLUMN replacement_order_id BIGINT UNSIGNED NULL AFTER refunded_by,
    ADD COLUMN replacement_status ENUM('NOT_APPLICABLE', 'PENDING', 'PROCESSING', 'DISPATCHED', 'COMPLETED') NOT NULL DEFAULT 'NOT_APPLICABLE' AFTER replacement_order_id,
    ADD COLUMN rejection_reason VARCHAR(255) NULL AFTER replacement_status,
    ADD COLUMN rejected_by BIGINT UNSIGNED NULL AFTER rejection_reason,
    ADD COLUMN rejected_at DATETIME NULL AFTER rejected_by,
    ADD COLUMN completed_at DATETIME NULL AFTER rejected_at;

ALTER TABLE sale_returns
    MODIFY COLUMN refund_status ENUM('PENDING', 'PROCESSING', 'REFUNDED', 'REJECTED', 'NOT_APPLICABLE') NOT NULL DEFAULT 'PENDING';

ALTER TABLE sale_returns
    ADD INDEX idx_sr_status (status),
    ADD INDEX idx_sr_type (return_type),
    ADD INDEX idx_sr_pickup_tracking (pickup_tracking_id),
    ADD CONSTRAINT fk_sr_inspected_by FOREIGN KEY (inspected_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_sr_refunded_by FOREIGN KEY (refunded_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_sr_rejected_by FOREIGN KEY (rejected_by) REFERENCES users(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_sr_refund FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_sr_replacement_order FOREIGN KEY (replacement_order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- 3. Enhance sale_return_items table with item details & snapshots
ALTER TABLE sale_return_items
    ADD COLUMN order_item_id BIGINT UNSIGNED NULL AFTER variant_id,
    ADD COLUMN product_id BIGINT UNSIGNED NULL AFTER order_item_id,
    ADD COLUMN product_name_snapshot VARCHAR(255) NULL AFTER product_id,
    ADD COLUMN variant_label_snapshot VARCHAR(255) NULL AFTER product_name_snapshot,
    ADD COLUMN sku_snapshot VARCHAR(80) NULL AFTER variant_label_snapshot,
    ADD COLUMN image_path VARCHAR(255) NULL AFTER sku_snapshot,
    ADD COLUMN `condition` ENUM('PENDING', 'RESELLABLE', 'DAMAGED', 'DEFECTIVE') NOT NULL DEFAULT 'PENDING' AFTER total_amount;

ALTER TABLE sale_return_items
    ADD CONSTRAINT fk_sri_order_item FOREIGN KEY (order_item_id) REFERENCES order_items(id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_sri_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

-- 4. Create sale_return_status_history table
CREATE TABLE IF NOT EXISTS sale_return_status_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    return_id BIGINT UNSIGNED NOT NULL,
    from_status VARCHAR(50) NULL,
    to_status VARCHAR(50) NOT NULL,
    source ENUM('SYSTEM', 'ADMIN', 'CUSTOMER', 'COURIER') NOT NULL DEFAULT 'ADMIN',
    note TEXT NULL,
    actor_user_id BIGINT UNSIGNED NULL,
    actor_customer_id BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_srsh_return (return_id, created_at),
    CONSTRAINT fk_srsh_return FOREIGN KEY (return_id) REFERENCES sale_returns(id) ON DELETE CASCADE,
    CONSTRAINT fk_srsh_actor_user FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_srsh_actor_customer FOREIGN KEY (actor_customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
