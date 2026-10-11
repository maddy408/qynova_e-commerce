-- 0032_safe_index_fk_fixes.sql
-- Schema-only safe fixes from docs/DB_ANALYSIS.md (DB-08 / DEF-29): missing
-- indexes and foreign keys on existing nullable *_id columns that already
-- point at exactly one, non-polymorphic parent table. No existing data is
-- changed except widening inventory_batches.supplier_id from INT UNSIGNED
-- to BIGINT UNSIGNED, which is lossless (every INT UNSIGNED value fits in
-- BIGINT UNSIGNED) and required so its type matches suppliers.id before a
-- foreign key can be added.
--
-- offers.target_id is intentionally left alone: it is polymorphic
-- (offers.target_type decides which table it points to), so it cannot
-- carry a single foreign key — see docs/DB_ANALYSIS.md for detail.
--
-- If this migration fails with an FK constraint error on an environment
-- that already has orphaned rows in one of these columns (a value with no
-- matching parent row), fix or null out the orphaned rows in that one
-- column and re-run — the other statements are independent.

-- inventory_batches.supplier_id -> suppliers.id
ALTER TABLE inventory_batches MODIFY supplier_id BIGINT UNSIGNED NULL;
ALTER TABLE inventory_batches ADD INDEX idx_inventory_batches_supplier (supplier_id);
ALTER TABLE inventory_batches ADD CONSTRAINT fk_inventory_batches_supplier
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- inventory_batches.purchase_id -> purchases.id
ALTER TABLE inventory_batches ADD INDEX idx_inventory_batches_purchase (purchase_id);
ALTER TABLE inventory_batches ADD CONSTRAINT fk_inventory_batches_purchase
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE SET NULL;

-- invoice_items.batch_id -> inventory_batches.id
ALTER TABLE invoice_items ADD INDEX idx_invoice_items_batch (batch_id);
ALTER TABLE invoice_items ADD CONSTRAINT fk_invoice_items_batch
    FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE SET NULL;

-- referral_rewards.applied_order_id -> orders.id
ALTER TABLE referral_rewards ADD INDEX idx_referral_rewards_applied_order (applied_order_id);
ALTER TABLE referral_rewards ADD CONSTRAINT fk_referral_rewards_applied_order
    FOREIGN KEY (applied_order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- offers.banner_id -> banners.id (offers.target_id stays unconstrained; polymorphic)
ALTER TABLE offers ADD INDEX idx_offers_banner (banner_id);
ALTER TABLE offers ADD CONSTRAINT fk_offers_banner
    FOREIGN KEY (banner_id) REFERENCES banners(id) ON DELETE SET NULL;
