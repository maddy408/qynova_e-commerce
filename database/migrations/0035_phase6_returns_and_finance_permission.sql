-- 0035_phase6_returns_and_finance_permission.sql
-- Phase 6 (Collections/Returns/Expenses) audit findings:
--
-- 1. sale_returns had no invoice_id column — only order_id (FK'd to
--    orders, ON DELETE SET NULL), which is always NULL for a POS sale
--    (POS invoices have no associated order row; only e-commerce
--    invoices do). ReturnsController::storeSaleReturn() needed a
--    reliable way to cap a return's quantity/refund against the specific
--    invoice it's actually returning against, which order_id could not
--    provide for the dominant POS case. Adds invoice_id with its own FK.
--
-- 2. FinanceController::store()/destroy() were gated on
--    'reports.financial.view' — a permission whose own seeded
--    description says "View P&L, expenses, income" — so any future role
--    granted view-only access to financial reports would also be able to
--    create or delete income/expense ledger entries. Adds a dedicated
--    'finance.manage' permission for the write path and grants it to
--    ADMIN (today's only role that reaches these endpoints at all).

DELIMITER $$

DROP PROCEDURE IF EXISTS apply_0035_phase6$$

CREATE PROCEDURE apply_0035_phase6()
BEGIN
    -- 1. sale_returns.invoice_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'sale_returns' AND column_name = 'invoice_id'
    ) THEN
        ALTER TABLE sale_returns ADD COLUMN invoice_id BIGINT UNSIGNED NULL AFTER order_id;
        ALTER TABLE sale_returns ADD CONSTRAINT fk_sr_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
        ALTER TABLE sale_returns ADD INDEX idx_sr_invoice (invoice_id);
    END IF;

    -- 2. finance.manage permission, granted to ADMIN only (matches how
    -- every other permission here is seeded — ADMIN gets everything).
    IF NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'finance.manage') THEN
        INSERT INTO permissions (code, description) VALUES
            ('finance.manage', 'Create/delete income & expense ledger entries (reports.financial.view is read-only)');

        INSERT INTO role_permissions (role_id, permission_id)
        SELECT r.id, p.id FROM roles r, permissions p
        WHERE r.code = 'ADMIN' AND p.code = 'finance.manage';
    END IF;
END$$

DELIMITER ;

CALL apply_0035_phase6();
DROP PROCEDURE IF EXISTS apply_0035_phase6;
