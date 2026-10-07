
-- Migration: 0022_purchase_payment_update.sql
-- Idempotent, re-runnable migration with guards for columns, constraints and ledger backfilling.

DELIMITER $$

DROP PROCEDURE IF EXISTS apply_0022_purchase_payment_update$$

CREATE PROCEDURE apply_0022_purchase_payment_update()
BEGIN
    -- 1. Modify payment_status enum
    ALTER TABLE purchases MODIFY COLUMN payment_status VARCHAR(30) NOT NULL DEFAULT 'UNPAID';
    UPDATE purchases SET payment_status = 'PARTIALLY_PAID' WHERE payment_status = 'PARTIAL';
    UPDATE purchases SET payment_status = 'UNPAID' WHERE payment_status NOT IN ('PAID', 'PARTIALLY_PAID', 'UNPAID');
    ALTER TABLE purchases MODIFY COLUMN payment_status ENUM('UNPAID', 'PARTIALLY_PAID', 'PAID') NOT NULL DEFAULT 'UNPAID';

    -- 2. Add paid_amount if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'purchases' AND column_name = 'paid_amount'
    ) THEN
        ALTER TABLE purchases ADD COLUMN paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER grand_total;
    END IF;

    -- Add balance_amount if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'purchases' AND column_name = 'balance_amount'
    ) THEN
        ALTER TABLE purchases ADD COLUMN balance_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER paid_amount;
    END IF;

    -- Add notes if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'purchases' AND column_name = 'notes'
    ) THEN
        ALTER TABLE purchases ADD COLUMN notes VARCHAR(500) NULL AFTER purchase_date;
    END IF;

    -- Add updated_by if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'purchases' AND column_name = 'updated_by'
    ) THEN
        ALTER TABLE purchases ADD COLUMN updated_by BIGINT UNSIGNED NULL AFTER created_by;
    END IF;

    -- Add deleted_at if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'purchases' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE purchases ADD COLUMN deleted_at DATETIME NULL AFTER cancellation_reason;
    END IF;

    -- 3. Backfill data
    UPDATE purchases SET
        paid_amount = CASE
            WHEN payment_status = 'PAID' THEN grand_total
            WHEN payment_status = 'UNPAID' THEN 0.00
            ELSE IFNULL(amount_paid, 0.00)
        END,
        balance_amount = CASE
            WHEN payment_status = 'PAID' THEN 0.00
            WHEN payment_status = 'UNPAID' THEN grand_total
            ELSE GREATEST(0.00, grand_total - IFNULL(amount_paid, 0.00))
        END;

    UPDATE purchases SET amount_paid = paid_amount;

    -- 4. Add check constraint if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = DATABASE() AND table_name = 'purchases' AND constraint_name = 'chk_purchases_paid_amount'
    ) THEN
        ALTER TABLE purchases ADD CONSTRAINT chk_purchases_paid_amount CHECK (paid_amount >= 0 AND paid_amount <= grand_total);
    END IF;

    -- 5. Add foreign key if not exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_schema = DATABASE() AND table_name = 'purchases' AND constraint_name = 'fk_purchases_updated_by'
    ) THEN
        ALTER TABLE purchases ADD CONSTRAINT fk_purchases_updated_by FOREIGN KEY (updated_by) REFERENCES users(id);
    END IF;

    -- 6. Create supplier_ledger table
    CREATE TABLE IF NOT EXISTS supplier_ledger (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        supplier_id BIGINT UNSIGNED NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        reference_type VARCHAR(50) NOT NULL DEFAULT 'PURCHASE',
        reference_id BIGINT UNSIGNED NULL,
        amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        paid_amount_delta DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        balance_after DECIMAL(15, 2) NULL,
        notes VARCHAR(255) NULL,
        created_by BIGINT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_supplier_ledger_supplier (supplier_id, created_at),
        INDEX idx_supplier_ledger_ref (reference_type, reference_id),
        CONSTRAINT fk_supplier_ledger_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        CONSTRAINT fk_supplier_ledger_created_by FOREIGN KEY (created_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- Backfill opening ledger entries for any purchases that do not have a ledger entry yet
    INSERT INTO supplier_ledger (supplier_id, transaction_type, reference_type, reference_id, amount, paid_amount_delta, notes, created_by, created_at)
    SELECT p.supplier_id, 'PURCHASE', 'PURCHASE', p.id, p.grand_total, p.paid_amount, CONCAT('Opening purchase ', p.purchase_no), p.created_by, p.created_at
    FROM purchases p
    WHERE NOT EXISTS (
        SELECT 1 FROM supplier_ledger sl WHERE sl.reference_type = 'PURCHASE' AND sl.reference_id = p.id
    );

END$$

DELIMITER ;

CALL apply_0022_purchase_payment_update();

DROP PROCEDURE IF EXISTS apply_0022_purchase_payment_update;
