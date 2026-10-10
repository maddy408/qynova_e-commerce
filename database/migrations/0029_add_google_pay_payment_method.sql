-- Migration 0029: Add Google Pay payment method to payment_methods master table
-- Additive and idempotent

INSERT INTO payment_methods (code, name, sort_order, is_active)
SELECT 'GOOGLE_PAY', 'Google Pay', 6, 1
WHERE NOT EXISTS (
    SELECT 1 FROM payment_methods WHERE code = 'GOOGLE_PAY'
);
