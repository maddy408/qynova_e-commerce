-- Active default coupons for storefront promotions and cart discounts
INSERT IGNORE INTO coupons (code, name, description, discount_type, discount_value, min_order_amount, status)
VALUES
    ('FESTIVE10', 'Festive Offer 10% Off', 'Get 10% off on all accessories and gift orders above ₹499.', 'PERCENTAGE', 10.00, 499.00, 'ACTIVE'),
    ('KIRANA50', 'Flat ₹50 Off Kirana Welcome', 'Flat ₹50 instant discount on orders above ₹299.', 'FIXED', 50.00, 299.00, 'ACTIVE');
