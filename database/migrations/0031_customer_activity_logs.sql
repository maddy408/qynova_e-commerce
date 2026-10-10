-- Migration 0031: Customer Activity Logs and Product Stats for T15 (Popular Sale) & T16 (Recently Viewed Products)

CREATE TABLE IF NOT EXISTS customer_activity_logs (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    customer_id BIGINT UNSIGNED NULL,
    session_id VARCHAR(100) NULL,
    activity_type VARCHAR(50) NOT NULL DEFAULT 'PRODUCT_VIEW',
    product_id BIGINT UNSIGNED NOT NULL,
    ip_address VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_activity_customer (customer_id),
    KEY idx_activity_session (session_id),
    KEY idx_activity_product (product_id),
    KEY idx_activity_type (activity_type),
    KEY idx_activity_created (created_at),
    CONSTRAINT fk_activity_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Initialize product_stats for any products missing a record
INSERT INTO product_stats (product_id, units_sold_30d, orders_30d, wishlist_count, view_count, updated_at)
SELECT p.id, 0, 0, 0, 0, NOW()
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM product_stats ps WHERE ps.product_id = p.id);

-- Sync units_sold_30d and orders_30d from invoices
UPDATE product_stats ps
JOIN (
    SELECT ii.product_id, CAST(COALESCE(SUM(ii.quantity), 0) AS UNSIGNED) AS total_qty, COUNT(DISTINCT ii.invoice_id) AS total_orders
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id AND i.status = 'ACTIVE' AND i.deleted_at IS NULL
    GROUP BY ii.product_id
) sales ON sales.product_id = ps.product_id
SET ps.units_sold_30d = sales.total_qty, ps.orders_30d = sales.total_orders;
