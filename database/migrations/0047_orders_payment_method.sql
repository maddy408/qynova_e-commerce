-- Add payment_method to orders table for preserving customer's chosen payment method (COD, ONLINE, CARD, UPI, etc.)
ALTER TABLE orders
    ADD COLUMN payment_method VARCHAR(50) NOT NULL DEFAULT 'COD' AFTER payment_status;

ALTER TABLE orders
    ADD INDEX idx_orders_payment_method (payment_method);
