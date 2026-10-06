-- Payment methods as an admin-manageable master instead of a fixed
-- MySQL ENUM. invoices.payment_method was ENUM('CASH','UPI','CARD',
-- 'NETBANKING','CREDIT','RAZORPAY') — switched to a plain VARCHAR
-- storing a payment_methods.code, so the merchant can add/rename/
-- deactivate methods (e.g. a specific UPI app, a gift card) without a
-- schema change. No FK: same reasoning as banners.target_id — a
-- historical invoice should keep showing the code it was paid with
-- even if that method is later deactivated or renamed.

CREATE TABLE payment_methods (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(30) NOT NULL,
    name VARCHAR(60) NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_payment_methods_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO payment_methods (code, name, sort_order) VALUES
    ('CASH', 'Cash', 1),
    ('UPI', 'UPI', 2),
    ('CARD', 'Card', 3),
    ('NETBANKING', 'Net Banking', 4),
    ('CREDIT', 'Credit', 5);

ALTER TABLE invoices
    MODIFY COLUMN payment_method VARCHAR(30) NULL;

-- purchases never had a payment_method column at all (amount_paid/
-- payment_status only) — the merchant asked for it alongside MRP and
-- a per-line discount on the Purchase screen.
ALTER TABLE purchases
    ADD COLUMN payment_method VARCHAR(30) NULL AFTER amount_paid;

ALTER TABLE purchase_items
    ADD COLUMN mrp DECIMAL(15, 2) NULL AFTER unit_cost,
    ADD COLUMN discount_amount DECIMAL(15, 2) NOT NULL DEFAULT 0 AFTER mrp;

INSERT INTO permissions (code, description) VALUES
    ('payment_methods.manage', 'Create/edit payment methods');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.code = 'ADMIN' AND p.code = 'payment_methods.manage';
