-- Migration: 0023_purchase_payments.sql
-- Idempotent, re-runnable migration for purchase payments, payment lines, split methods, and ledger backfilling.

DELIMITER $$

DROP PROCEDURE IF EXISTS apply_0023_purchase_payments$$

CREATE PROCEDURE apply_0023_purchase_payments()
BEGIN
    -- 1. Ensure purchases.payment_method is VARCHAR(100) NULL so it can store 'SPLIT' or any method
    ALTER TABLE purchases MODIFY COLUMN payment_method VARCHAR(100) NULL;

    -- 2. Create purchase_payments table if not exists
    CREATE TABLE IF NOT EXISTS purchase_payments (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        purchase_id BIGINT UNSIGNED NOT NULL,
        supplier_id BIGINT UNSIGNED NOT NULL,
        receipt_no VARCHAR(100) NOT NULL,
        payment_date DATE NOT NULL,
        total_amount DECIMAL(15, 2) NOT NULL,
        notes TEXT NULL,
        status ENUM('ACTIVE', 'REVERSED') NOT NULL DEFAULT 'ACTIVE',
        reversed_by BIGINT UNSIGNED NULL,
        reversed_at DATETIME NULL,
        reverse_reason TEXT NULL,
        idempotency_key VARCHAR(100) NULL,
        created_by BIGINT UNSIGNED NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_purchase_payments_receipt_no (receipt_no),
        UNIQUE KEY uq_purchase_payments_idempotency (idempotency_key),
        INDEX idx_purchase_payments_purchase (purchase_id, status),
        INDEX idx_purchase_payments_supplier (supplier_id),
        CONSTRAINT fk_purchase_payments_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id),
        CONSTRAINT fk_purchase_payments_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
        CONSTRAINT fk_purchase_payments_created_by FOREIGN KEY (created_by) REFERENCES users(id),
        CONSTRAINT fk_purchase_payments_reversed_by FOREIGN KEY (reversed_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 3. Create purchase_payment_lines table if not exists
    CREATE TABLE IF NOT EXISTS purchase_payment_lines (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        payment_id BIGINT UNSIGNED NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        reference_no VARCHAR(100) NULL,
        INDEX idx_purchase_payment_lines_payment (payment_id),
        CONSTRAINT fk_purchase_payment_lines_payment FOREIGN KEY (payment_id) REFERENCES purchase_payments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 4. Backfill legacy purchases that have paid_amount > 0 and no rows in purchase_payments
    -- Insert payment rows
    INSERT INTO purchase_payments (purchase_id, supplier_id, receipt_no, payment_date, total_amount, notes, status, created_by, created_at)
    SELECT
        p.id,
        p.supplier_id,
        CONCAT('REC-PUR-', p.id, '-OPEN'),
        p.purchase_date,
        p.paid_amount,
        'Opening payment from purchase creation',
        'ACTIVE',
        p.created_by,
        p.created_at
    FROM purchases p
    WHERE p.paid_amount > 0
      AND NOT EXISTS (
          SELECT 1 FROM purchase_payments pp WHERE pp.purchase_id = p.id
      );

    -- Insert payment line rows for the opening payments just created
    INSERT INTO purchase_payment_lines (payment_id, payment_method, amount, reference_no)
    SELECT
        pp.id,
        CASE
            WHEN p.payment_method IN ('CASH', 'UPI', 'CARD', 'NETBANKING', 'CREDIT') THEN p.payment_method
            ELSE 'CASH'
        END,
        pp.total_amount,
        NULL
    FROM purchase_payments pp
    JOIN purchases p ON p.id = pp.purchase_id
    WHERE pp.notes = 'Opening payment from purchase creation'
      AND NOT EXISTS (
          SELECT 1 FROM purchase_payment_lines ppl WHERE ppl.payment_id = pp.id
      );

    -- 5. Backfill supplier_ledger entries for existing purchase_returns that lack a ledger row (Task C2)
    INSERT INTO supplier_ledger (supplier_id, transaction_type, reference_type, reference_id, amount, paid_amount_delta, notes, created_by, created_at)
    SELECT
        pr.supplier_id,
        'PURCHASE_RETURN',
        'PURCHASE_RETURN',
        pr.id,
        pr.grand_total,
        0.00,
        CONCAT('Purchase return ', pr.purchase_return_no),
        pr.created_by,
        pr.created_at
    FROM purchase_returns pr
    WHERE NOT EXISTS (
        SELECT 1 FROM supplier_ledger sl
        WHERE sl.reference_type = 'PURCHASE_RETURN' AND sl.reference_id = pr.id
    );

END$$

DELIMITER ;

CALL apply_0023_purchase_payments();

DROP PROCEDURE IF EXISTS apply_0023_purchase_payments;
