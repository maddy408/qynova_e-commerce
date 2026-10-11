-- 0033_phase1_foundation.sql
-- Phase 1 of the admin-pos overhaul: refresh tokens (1.1), itemized
-- invoice payment lines mirroring purchase_payments/purchase_payment_lines
-- (needed for G9 "invoice paid = SUM of active payment lines" and Phase 5
-- amendment work), and price_history (needed for Phase 2.3).
-- Idempotent / re-runnable, same guarded pattern as 0023/0027/0028.

DELIMITER $$

DROP PROCEDURE IF EXISTS apply_0033_phase1_foundation$$

CREATE PROCEDURE apply_0033_phase1_foundation()
BEGIN
    -- 1. Refresh tokens (Phase 1.1). Stored hashed (sha256 hex, 64 chars)
    -- — the raw token is only ever shown once, in the Set-Cookie header.
    -- replaced_by_id chains rotations so reuse of a revoked token can be
    -- detected and the whole chain revoked as a security response.
    CREATE TABLE IF NOT EXISTS refresh_tokens (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT UNSIGNED NOT NULL,
        token_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL,
        revoked_at DATETIME NULL,
        revoke_reason VARCHAR(50) NULL,
        replaced_by_id BIGINT UNSIGNED NULL,
        user_agent VARCHAR(255) NULL,
        ip_address VARCHAR(45) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_refresh_tokens_hash (token_hash),
        INDEX idx_refresh_tokens_user (user_id, revoked_at),
        CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT fk_refresh_tokens_replaced_by FOREIGN KEY (replaced_by_id) REFERENCES refresh_tokens(id) ON DELETE SET NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- 2. Widen invoices.payment_method so it can store 'SPLIT', matching
    -- what 0023_purchase_payments.sql already did for purchases.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'invoices'
          AND column_name = 'payment_method' AND data_type = 'enum'
    ) THEN
        ALTER TABLE invoices MODIFY COLUMN payment_method VARCHAR(100) NULL;
    END IF;

    -- 3. invoice_payments / invoice_payment_lines, mirroring
    -- purchase_payments / purchase_payment_lines exactly.
    CREATE TABLE IF NOT EXISTS invoice_payments (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        invoice_id BIGINT UNSIGNED NOT NULL,
        customer_id BIGINT UNSIGNED NULL,
        receipt_no VARCHAR(100) NOT NULL,
        payment_date DATE NOT NULL,
        total_amount DECIMAL(15, 2) NOT NULL,
        notes TEXT NULL,
        status ENUM('ACTIVE', 'REVERSED') NOT NULL DEFAULT 'ACTIVE',
        reversed_by BIGINT UNSIGNED NULL,
        reversed_at DATETIME NULL,
        reverse_reason TEXT NULL,
        idempotency_key VARCHAR(100) NULL,
        created_by BIGINT UNSIGNED NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_invoice_payments_receipt_no (receipt_no),
        UNIQUE KEY uq_invoice_payments_idempotency (idempotency_key),
        INDEX idx_invoice_payments_invoice (invoice_id, status),
        INDEX idx_invoice_payments_customer (customer_id),
        CONSTRAINT fk_invoice_payments_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id),
        CONSTRAINT fk_invoice_payments_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
        CONSTRAINT fk_invoice_payments_created_by FOREIGN KEY (created_by) REFERENCES users(id),
        CONSTRAINT fk_invoice_payments_reversed_by FOREIGN KEY (reversed_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    CREATE TABLE IF NOT EXISTS invoice_payment_lines (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        payment_id BIGINT UNSIGNED NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        reference_no VARCHAR(100) NULL,
        INDEX idx_invoice_payment_lines_payment (payment_id),
        CONSTRAINT fk_invoice_payment_lines_payment FOREIGN KEY (payment_id) REFERENCES invoice_payments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

    -- Backfill: every existing invoice with amount_paid > 0 gets one
    -- opening invoice_payments row + one invoice_payment_lines row, same
    -- backfill approach 0023 used for purchases, so G9 (paid = SUM of
    -- active lines) holds for pre-existing invoices too, not just new ones.
    INSERT INTO invoice_payments (invoice_id, customer_id, receipt_no, payment_date, total_amount, notes, status, created_by, created_at)
    SELECT
        i.id,
        i.customer_id,
        CONCAT('REC-INV-', i.id, '-OPEN'),
        DATE(i.created_at),
        i.amount_paid,
        'Opening payment backfilled from invoices.amount_paid (migration 0033)',
        'ACTIVE',
        i.cashier_user_id,
        i.created_at
    FROM invoices i
    WHERE i.amount_paid > 0
      AND NOT EXISTS (SELECT 1 FROM invoice_payments ip WHERE ip.invoice_id = i.id);

    INSERT INTO invoice_payment_lines (payment_id, payment_method, amount, reference_no)
    SELECT
        ip.id,
        CASE
            WHEN i.payment_method IN ('CASH', 'UPI', 'CARD', 'NETBANKING', 'CREDIT', 'RAZORPAY') THEN i.payment_method
            ELSE 'CASH'
        END,
        ip.total_amount,
        NULL
    FROM invoice_payments ip
    JOIN invoices i ON i.id = ip.invoice_id
    WHERE ip.notes = 'Opening payment backfilled from invoices.amount_paid (migration 0033)'
      AND NOT EXISTS (SELECT 1 FROM invoice_payment_lines ipl WHERE ipl.payment_id = ip.id);

    -- 4. Price history (Phase 2.3). customer_id is NULL for RETAIL/
    -- WHOLESALE changes, set for CUSTOMER (per customer_price_lists).
    CREATE TABLE IF NOT EXISTS price_history (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        variant_id BIGINT UNSIGNED NOT NULL,
        customer_id BIGINT UNSIGNED NULL,
        price_type ENUM('RETAIL', 'WHOLESALE', 'CUSTOMER') NOT NULL,
        old_price DECIMAL(15, 2) NULL,
        new_price DECIMAL(15, 2) NOT NULL,
        changed_by BIGINT UNSIGNED NULL,
        changed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_price_history_variant (variant_id, price_type, changed_at),
        INDEX idx_price_history_customer (customer_id),
        CONSTRAINT fk_price_history_variant FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
        CONSTRAINT fk_price_history_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        CONSTRAINT fk_price_history_changed_by FOREIGN KEY (changed_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
END$$

DELIMITER ;

CALL apply_0033_phase1_foundation();
DROP PROCEDURE IF EXISTS apply_0033_phase1_foundation;
