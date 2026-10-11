-- Opening stock for any product_variant that has no inventory row yet
-- (DEF-06/DB-01 in docs/FLOW_ANALYSIS.md / docs/DB_ANALYSIS.md: the
-- original product seed, 0002_products_seed.sql, creates variants but
-- never inserts into `inventory`, so a freshly migrated+seeded database
-- has 0 available stock everywhere and every checkout fails with "Only
-- 0 left in stock"). Idempotent — only inserts a row for a variant that
-- doesn't already have one, so this is safe to run against a database
-- that already has real inventory data from purchases/adjustments too.
--
-- `available` is a generated column (on_hand - reserved) and cannot be
-- inserted directly.
INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold)
SELECT v.id, v.product_id, 50, 0, 5
FROM product_variants v
WHERE v.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM inventory i WHERE i.variant_id = v.id);
