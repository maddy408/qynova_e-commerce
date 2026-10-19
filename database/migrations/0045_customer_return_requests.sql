-- 0045_customer_return_requests.sql
-- Customer-initiated return requests (ECOMMERCE_POS_ADMIN_SPEC.md "Product
-- Return Management Workflow" task). The admin Returns section and its
-- sale_returns/sale_return_items/sale_return_status_history tables already
-- exist (migration 0042) and are reused as-is; this migration only adds
-- what that existing design genuinely lacks for a customer-facing request:
--
-- 1. An optional, free-text return policy description per product —
--    products.returnable/return_window_days already exist (migration 0015)
--    and already drive eligibility; this just lets the admin explain the
--    policy in their own words, mirroring the existing
--    warranty_applicable/warranty_description pair on the same table.
-- 2. The customer's own self-reported condition/packaging state at request
--    time — distinct from sale_return_items.condition, which is the
--    ADMIN's post-inspection assessment (RESELLABLE/DAMAGED/DEFECTIVE) used
--    to decide whether stock gets restocked. Conflating the two would let
--    a customer's own claim silently drive a restock decision.
-- 3. Customer-uploaded supporting photos — sale_return_items.image_path
--    already exists, but it's the CATALOG product photo auto-attached by
--    createReturn(), not evidence the customer uploads. A new table is used
--    instead of overloading that column so the catalog photo is never
--    overwritten by the customer's own upload.

ALTER TABLE products
    ADD COLUMN return_policy_description TEXT NULL AFTER return_window_days;

ALTER TABLE sale_returns
    ADD COLUMN reported_condition ENUM('UNOPENED', 'OPENED_UNUSED', 'USED', 'DAMAGED_ON_ARRIVAL') NULL AFTER reason,
    ADD COLUMN packaging_available TINYINT(1) NULL AFTER reported_condition;

-- Customer-scoped lookups ("my returns", eligibility/duplicate checks) were
-- previously only indexed by order_id (via the FK) — a dedicated
-- (customer_id, created_at) index keeps those from degrading to a table
-- scan as sale_returns grows.
ALTER TABLE sale_returns
    ADD INDEX idx_sr_customer (customer_id, created_at);

CREATE TABLE IF NOT EXISTS sale_return_images (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    return_id BIGINT UNSIGNED NOT NULL,
    image_path VARCHAR(255) NOT NULL,
    thumb_path VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sri_return (return_id),
    CONSTRAINT fk_sale_return_images_return FOREIGN KEY (return_id) REFERENCES sale_returns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
