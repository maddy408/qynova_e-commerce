-- 0024_inventory_batches.sql
-- Production Inventory Architecture: SKU + Variant + Batch + Inventory Logic

CREATE TABLE IF NOT EXISTS inventory_batches (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    variant_id BIGINT UNSIGNED NOT NULL,
    batch_no VARCHAR(100) NOT NULL,
    supplier_id INT UNSIGNED NULL,
    purchase_id BIGINT UNSIGNED NULL,
    purchase_date DATE NULL,
    manufacturing_date DATE NULL,
    expiry_date DATE NULL,
    cost_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    selling_price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    mrp DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    quantity DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
    available_quantity DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
    status ENUM('ACTIVE', 'EXPIRED', 'DEPLETED', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_batches_variant (variant_id),
    INDEX idx_batches_expiry (expiry_date),
    INDEX idx_batches_number (batch_no),
    CONSTRAINT fk_batches_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_transactions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    variant_id BIGINT UNSIGNED NOT NULL,
    batch_id BIGINT UNSIGNED NULL,
    type ENUM('OPENING', 'PURCHASE', 'SALE', 'RETURN', 'DAMAGE', 'ADJUSTMENT', 'TRANSFER') NOT NULL,
    reference_type VARCHAR(50) NULL,
    reference_id BIGINT UNSIGNED NULL,
    qty DECIMAL(15, 3) NOT NULL,
    old_stock DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
    new_stock DECIMAL(15, 3) NOT NULL DEFAULT 0.000,
    remarks VARCHAR(255) NULL,
    created_by BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_tx_variant (variant_id),
    INDEX idx_tx_batch (batch_id),
    CONSTRAINT fk_tx_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CONSTRAINT fk_tx_batch FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO inventory_settings (setting_key, setting_value)
VALUES ('batch_consumption_rule', 'FIFO')
ON DUPLICATE KEY UPDATE setting_key=setting_key;
