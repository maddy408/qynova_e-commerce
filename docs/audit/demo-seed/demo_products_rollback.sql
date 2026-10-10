-- demo_products_rollback.sql
-- Rollback script for all ZZ DEMO product, catalog, inventory, and variant records.
-- Safely removes only records starting with 'ZZ DEMO' or 'ZZDEMO-'.
-- Leave product id 29 completely untouched.

START TRANSACTION;

-- 1. Remove inventory transactions linked to ZZDEMO variants
DELETE it FROM inventory_transactions it
JOIN product_variants pv ON pv.id = it.variant_id
WHERE pv.sku LIKE 'ZZDEMO-%';

-- 2. Remove inventory batches linked to ZZDEMO variants
DELETE ib FROM inventory_batches ib
JOIN product_variants pv ON pv.id = ib.variant_id
WHERE pv.sku LIKE 'ZZDEMO-%';

-- 3. Remove inventory records linked to ZZDEMO variants
DELETE inv FROM inventory inv
JOIN product_variants pv ON pv.id = inv.variant_id
WHERE pv.sku LIKE 'ZZDEMO-%';

-- 4. Remove variant images linked to ZZDEMO variants
DELETE vi FROM variant_images vi
JOIN product_variants pv ON pv.id = vi.variant_id
WHERE pv.sku LIKE 'ZZDEMO-%';

-- 5. Remove product variant values linked to ZZDEMO variants
DELETE pvv FROM product_variant_values pvv
JOIN product_variants pv ON pv.id = pvv.variant_id
WHERE pv.sku LIKE 'ZZDEMO-%';

-- 6. Remove product variants with SKU starting with ZZDEMO-
DELETE FROM product_variants WHERE sku LIKE 'ZZDEMO-%';

-- 7. Remove product images linked to ZZ DEMO products
DELETE pi FROM product_images pi
JOIN products p ON p.id = pi.product_id
WHERE p.name LIKE 'ZZ DEMO%';

-- 8. Remove product specifications linked to ZZ DEMO products
DELETE ps FROM product_specifications ps
JOIN products p ON p.id = ps.product_id
WHERE p.name LIKE 'ZZ DEMO%';

-- 9. Remove category and subcategory product junction rows
DELETE pc FROM product_categories pc
JOIN products p ON p.id = pc.product_id
WHERE p.name LIKE 'ZZ DEMO%';

DELETE psc FROM product_subcategories psc
JOIN products p ON p.id = psc.product_id
WHERE p.name LIKE 'ZZ DEMO%';

-- 10. Remove ZZ DEMO products (ensuring product ID 29 is never touched)
DELETE FROM products WHERE name LIKE 'ZZ DEMO%' AND id != 29;

-- 11. Remove junction rows for demo categories, subcategories, and brands
DELETE cs FROM category_subcategory cs
JOIN categories c ON c.id = cs.category_id
WHERE c.name LIKE 'ZZ DEMO%';

DELETE cs FROM category_subcategory cs
JOIN subcategories s ON s.id = cs.subcategory_id
WHERE s.name LIKE 'ZZ DEMO%';

DELETE bc FROM brand_categories bc
JOIN brands b ON b.id = bc.brand_id
WHERE b.name LIKE 'ZZ DEMO%';

-- 12. Remove demo subcategories, categories, and brands
DELETE FROM subcategories WHERE name LIKE 'ZZ DEMO%';
DELETE FROM categories WHERE name LIKE 'ZZ DEMO%';
DELETE FROM brands WHERE name LIKE 'ZZ DEMO%';

-- 13. Remove demo variant attribute values and attributes
DELETE vav FROM variant_attribute_values vav
JOIN variant_attributes va ON va.id = vav.attribute_id
WHERE va.name LIKE 'ZZ DEMO%';

DELETE FROM variant_attributes WHERE name LIKE 'ZZ DEMO%';

COMMIT;
