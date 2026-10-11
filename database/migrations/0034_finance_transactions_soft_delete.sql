-- 0034_finance_transactions_soft_delete.sql
-- finance_transactions had no deleted_at column, so
-- FinanceController::destroy() was doing a real DELETE FROM — a direct
-- violation of "never hard-delete business data" (found during the
-- admin-pos-overhaul Phase 0 audit). Adds the column so delete can
-- become a soft-delete like every other entity in this schema.

DELIMITER $$

DROP PROCEDURE IF EXISTS apply_0034_finance_soft_delete$$

CREATE PROCEDURE apply_0034_finance_soft_delete()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'finance_transactions' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE finance_transactions ADD COLUMN deleted_at DATETIME NULL AFTER notes;
        ALTER TABLE finance_transactions ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at;
        ALTER TABLE finance_transactions ADD CONSTRAINT fk_ft_deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END$$

DELIMITER ;

CALL apply_0034_finance_soft_delete();
DROP PROCEDURE IF EXISTS apply_0034_finance_soft_delete;
