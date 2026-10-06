-- Inventory ledger (spec: DOCUMENTATION.md section 11). One door: all
-- stock changes must go through a single InventoryService in application
-- code — no controller, script or other service may touch `inventory`
-- directly. `inventory` is a fast cache of `inventory_movements` and must
-- always reconcile with it (nightly reconciliation job, section 11).

CREATE TABLE inventory (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    variant_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    on_hand DECIMAL(15, 3) NOT NULL DEFAULT 0,
    reserved DECIMAL(15, 3) NOT NULL DEFAULT 0,
    available DECIMAL(15, 3) GENERATED ALWAYS AS (on_hand - reserved) STORED,
    low_stock_threshold DECIMAL(15, 3) NOT NULL DEFAULT 5,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_inventory_variant (variant_id),
    INDEX idx_inventory_product (product_id),
    CONSTRAINT fk_inventory_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id),
    CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT chk_inventory_on_hand CHECK (on_hand >= 0),
    CONSTRAINT chk_inventory_reserved CHECK (reserved >= 0),
    CONSTRAINT chk_inventory_reserved_le_on_hand CHECK (reserved <= on_hand)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-only. UPDATE/DELETE are blocked by triggers below — corrections
-- are a new reversing movement, never an edit to history.
CREATE TABLE inventory_movements (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    variant_id BIGINT UNSIGNED NOT NULL,
    product_id BIGINT UNSIGNED NOT NULL,
    movement_type ENUM(
        'OPENING_STOCK', 'PURCHASE', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN',
        'ORDER_RESERVE', 'ORDER_RESERVE_RELEASE', 'ORDER_CONFIRM', 'ORDER_CANCEL',
        'INVOICE_CANCEL', 'STOCK_ADJUSTMENT_IN', 'STOCK_ADJUSTMENT_OUT',
        'DAMAGE', 'EXPIRED_WRITE_OFF'
    ) NOT NULL,
    on_hand_delta DECIMAL(15, 3) NOT NULL DEFAULT 0,
    reserved_delta DECIMAL(15, 3) NOT NULL DEFAULT 0,
    on_hand_before DECIMAL(15, 3) NOT NULL,
    on_hand_after DECIMAL(15, 3) NOT NULL,
    reserved_before DECIMAL(15, 3) NOT NULL,
    reserved_after DECIMAL(15, 3) NOT NULL,
    unit_cost DECIMAL(15, 2) NULL,
    reference_type ENUM('INVOICE', 'ORDER', 'PURCHASE', 'SALES_RETURN', 'PURCHASE_RETURN', 'ADJUSTMENT', 'RESERVATION') NOT NULL,
    reference_id BIGINT UNSIGNED NOT NULL,
    reference_item_id BIGINT UNSIGNED NULL,
    channel ENUM('POS', 'ECOMMERCE', 'ADMIN', 'SYSTEM') NOT NULL,
    reason VARCHAR(255) NULL,
    note TEXT NULL,
    user_id BIGINT UNSIGNED NULL,
    idempotency_key VARCHAR(100) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_inventory_movements_idempotency (idempotency_key),
    INDEX idx_inventory_movements_variant (variant_id, created_at),
    INDEX idx_inventory_movements_reference (reference_type, reference_id),
    INDEX idx_inventory_movements_type (movement_type, created_at),
    CONSTRAINT fk_inventory_movements_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id),
    CONSTRAINT fk_inventory_movements_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_inventory_movements_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DELIMITER $$
CREATE TRIGGER trg_inventory_movements_no_update
BEFORE UPDATE ON inventory_movements
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'inventory_movements is append-only: UPDATE is not allowed';
END$$

CREATE TRIGGER trg_inventory_movements_no_delete
BEFORE DELETE ON inventory_movements
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'inventory_movements is append-only: DELETE is not allowed';
END$$
DELIMITER ;

-- order_id has no FK yet — the `orders` table lands in a later phase.
-- InventoryService must still enforce the relationship in code.
CREATE TABLE stock_reservations (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED NOT NULL,
    quantity DECIMAL(15, 3) NOT NULL,
    status ENUM('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED') NOT NULL DEFAULT 'ACTIVE',
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_stock_reservations_order (order_id),
    INDEX idx_stock_reservations_variant_status (variant_id, status, expires_at),
    CONSTRAINT fk_stock_reservations_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_adjustments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    adjustment_no VARCHAR(30) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    created_by BIGINT UNSIGNED NOT NULL,
    approved_by BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_stock_adjustments_no (adjustment_no),
    CONSTRAINT fk_stock_adjustments_created_by FOREIGN KEY (created_by) REFERENCES users(id),
    CONSTRAINT fk_stock_adjustments_approved_by FOREIGN KEY (approved_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stock_adjustment_items (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    adjustment_id BIGINT UNSIGNED NOT NULL,
    variant_id BIGINT UNSIGNED NOT NULL,
    system_qty DECIMAL(15, 3) NOT NULL,
    counted_qty DECIMAL(15, 3) NOT NULL,
    difference_qty DECIMAL(15, 3) GENERATED ALWAYS AS (counted_qty - system_qty) STORED,
    CONSTRAINT fk_stock_adjustment_items_adjustment FOREIGN KEY (adjustment_id) REFERENCES stock_adjustments(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_adjustment_items_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
