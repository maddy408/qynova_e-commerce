-- Delivery management (ECOMMERCE_POS_ADMIN_SPEC.md sections 21-22;
-- docs/DOCUMENTATION.md section 15's shipment/tracking design, merged —
-- `deliveries` is this build's name for what DOCUMENTATION.md calls
-- `shipments`). `provider` is always MOCK for now — no real shipping
-- aggregator is wired up (see database/README.md).

CREATE TABLE deliveries (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT UNSIGNED NOT NULL,
    provider ENUM('MOCK', 'SHIPROCKET') NOT NULL DEFAULT 'MOCK',
    courier VARCHAR(100) NULL,
    awb VARCHAR(50) NULL,
    tracking_url VARCHAR(255) NULL,
    status ENUM(
        'PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT',
        'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'RETURNED'
    ) NOT NULL DEFAULT 'PENDING',
    expected_delivery_date DATE NULL,
    delivery_notes VARCHAR(500) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_deliveries_order (order_id),
    INDEX idx_deliveries_status (status),
    INDEX idx_deliveries_awb (awb),
    CONSTRAINT fk_deliveries_order FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE delivery_status_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    delivery_id BIGINT UNSIGNED NOT NULL,
    from_status VARCHAR(30) NULL,
    to_status VARCHAR(30) NOT NULL,
    source ENUM('ADMIN', 'SYSTEM', 'SHIPPING_WEBHOOK') NOT NULL,
    note VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_delivery_status_history_delivery (delivery_id, created_at),
    CONSTRAINT fk_delivery_status_history_delivery FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
