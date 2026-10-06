-- Dev seed data: roles/permissions, an admin + cashier login, a sample
-- customer, seed categories/units, matching docs/DOCUMENTATION.md sections
-- 3 (cashier permissions) and 7 (seed categories), and section 27 phase 2.
-- Not for production use (known passwords below).

INSERT INTO roles (code, name) VALUES
    ('ADMIN', 'Administrator'),
    ('CASHIER', 'Cashier');

INSERT INTO permissions (code, description) VALUES
    ('pos.sell', 'Create a POS sale / invoice'),
    ('pos.discount.apply', 'Apply a permitted discount at POS'),
    ('pos.coupon.apply', 'Apply a permitted coupon at POS'),
    ('pos.payment.accept', 'Accept payment at POS'),
    ('pos.invoice.print', 'Print an invoice'),
    ('pos.returns.process', 'Process a permitted sales return'),
    ('pos.sales.view', 'View permitted sales'),
    ('catalog.manage', 'Create/edit products, variants, categories, brands'),
    ('pricing.manage', 'Change pricing master, MRP, wholesale price'),
    ('inventory.adjust', 'Create stock adjustments'),
    ('inventory.view', 'View inventory and stock movement reports'),
    ('customers.manage', 'Create/edit customers and addresses'),
    ('suppliers.manage', 'Create/edit suppliers'),
    ('purchases.manage', 'Create/edit purchases and GRNs'),
    ('coupons.manage', 'Create/edit coupons and discounts'),
    ('orders.manage', 'Edit order items/price/status, process refunds'),
    ('delivery.manage', 'Manage delivery assignment and status'),
    ('reports.financial.view', 'View P&L, expenses, income, unrestricted reports'),
    ('settings.manage', 'Change system settings, referral settings, roles/permissions'),
    ('users.manage', 'Create/edit staff users and role assignments'),
    ('audit.view', 'View audit logs');

-- Admin gets every permission.
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'ADMIN'), id FROM permissions;

-- Cashier: only what docs/DOCUMENTATION.md section 3 explicitly allows.
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE code = 'CASHIER'), id FROM permissions
WHERE code IN (
    'pos.sell', 'pos.discount.apply', 'pos.coupon.apply', 'pos.payment.accept',
    'pos.invoice.print', 'pos.returns.process', 'pos.sales.view'
);

-- Dev-only logins: admin@example.com / Admin@123, cashier@example.com / Cashier@123
INSERT INTO users (role_id, name, email, password_hash, status) VALUES
    ((SELECT id FROM roles WHERE code = 'ADMIN'), 'Admin', 'admin@example.com',
     '$2y$10$iGDT65XjolGEOgvERtNu4.tM/bYxLJouLrGEHuAV7cZiqyR.M4sLK', 'ACTIVE'),
    ((SELECT id FROM roles WHERE code = 'CASHIER'), 'Cashier', 'cashier@example.com',
     '$2y$10$gxQ91lt.4Jvbh7FxNbsor.xOTQiYp.LQjHjVRV/neS706XUiWp22G', 'ACTIVE');

INSERT INTO categories (name, slug, sort_order) VALUES
    ('Hair Accessories', 'hair-accessories', 1),
    ('Jewellery & Fashion Accessories', 'jewellery-fashion-accessories', 2),
    ('Gift Items', 'gift-items', 3),
    ('Toys', 'toys', 4),
    ('Bags & Pouches', 'bags-pouches', 5),
    ('Beauty Accessories', 'beauty-accessories', 6),
    ('Storage & Utility Products', 'storage-utility-products', 7),
    ('Combo Offers', 'combo-offers', 8);

INSERT INTO units (name, short_code) VALUES
    ('Pieces', 'PCS'),
    ('Box', 'BOX'),
    ('Kilogram', 'KG'),
    ('Gram', 'GRAM'),
    ('Litre', 'LITRE'),
    ('Millilitre', 'ML'),
    ('Pack', 'PACK');

INSERT INTO gst_rates (name, gst_percent, cgst_percent, sgst_percent, igst_percent, tax_mode) VALUES
    ('GST 0%', 0, 0, 0, 0, 'EXCLUSIVE'),
    ('GST 5%', 5, 2.5, 2.5, 5, 'EXCLUSIVE'),
    ('GST 12%', 12, 6, 6, 12, 'EXCLUSIVE'),
    ('GST 18%', 18, 9, 9, 18, 'EXCLUSIVE');

-- Dev-only login: phone 9999999999 / Customer@123, already phone-verified.
INSERT INTO customers (name, phone, phone_verified_at, password_hash, status) VALUES
    ('Sample Customer', '9999999999', NOW(),
     '$2y$10$iGDT65XjolGEOgvERtNu4.tM/bYxLJouLrGEHuAV7cZiqyR.M4sLK', 'ACTIVE');

INSERT INTO referral_codes (customer_id, code)
SELECT id, 'SAMPLE10' FROM customers WHERE phone = '9999999999';
