-- Migration 0046: Default Rich Variant Attributes and Values
-- Ensures all 18 standard variant attribute categories and their options are seeded.

INSERT INTO variant_attributes (name, sort_order, status) VALUES
('Color', 1, 'ACTIVE'),
('Size', 2, 'ACTIVE'),
('Weight', 3, 'ACTIVE'),
('Volume', 4, 'ACTIVE'),
('Pack Size', 5, 'ACTIVE'),
('Quantity / Count', 6, 'ACTIVE'),
('Flavor', 7, 'ACTIVE'),
('Taste', 8, 'ACTIVE'),
('Type', 9, 'ACTIVE'),
('Form', 10, 'ACTIVE'),
('Packaging Type', 11, 'ACTIVE'),
('Grade', 12, 'ACTIVE'),
('Material / Ingredient Type', 13, 'ACTIVE'),
('Scent / Fragrance', 14, 'ACTIVE'),
('Age Group', 15, 'ACTIVE'),
('Diet Type', 16, 'ACTIVE'),
('Strength', 17, 'ACTIVE'),
('Combo / Bundle', 18, 'ACTIVE')
ON DUPLICATE KEY UPDATE status = VALUES(status);
