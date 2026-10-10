-- Migration 0028: Add performance indexes for POS sales ranking queries
-- NOTE: Adding indexes on very large production tables should be executed off-peak to avoid table locks.

SET @dbname = DATABASE();

-- 1. Index on invoices (deleted_at, status, created_at)
SET @exist_inv_idx := (
    SELECT COUNT(*) FROM information_schema.statistics 
    WHERE table_schema = @dbname AND table_name = 'invoices' AND index_name = 'idx_invoices_sales_rank'
);

SET @sql_inv := IF(
    @exist_inv_idx = 0,
    'ALTER TABLE invoices ADD INDEX idx_invoices_sales_rank (deleted_at, status, created_at)',
    'SELECT "idx_invoices_sales_rank already exists"'
);

PREPARE stmt_inv FROM @sql_inv;
EXECUTE stmt_inv;
DEALLOCATE PREPARE stmt_inv;

-- 2. Index on invoice_items (variant_id, quantity, invoice_id)
SET @exist_items_idx := (
    SELECT COUNT(*) FROM information_schema.statistics 
    WHERE table_schema = @dbname AND table_name = 'invoice_items' AND index_name = 'idx_invoice_items_variant_qty'
);

SET @sql_items := IF(
    @exist_items_idx = 0,
    'ALTER TABLE invoice_items ADD INDEX idx_invoice_items_variant_qty (variant_id, quantity, invoice_id)',
    'SELECT "idx_invoice_items_variant_qty already exists"'
);

PREPARE stmt_items FROM @sql_items;
EXECUTE stmt_items;
DEALLOCATE PREPARE stmt_items;
