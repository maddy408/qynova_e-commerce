-- demo_products_seed.sql
-- Idempotent, single-transaction seed script for ZZ DEMO catalog and products.
-- Fills all Admin product features with recognizable, testable values.
-- Product id 29 is untouched.
-- Does not run any DDL or migrations.

START TRANSACTION;

-- ============================================================================
-- 1. MASTER DATA: Categories, Subcategories, Brands, Variant Attributes
-- ============================================================================

-- A. Categories
INSERT INTO categories (name, slug, description, image_path, thumb_path, sort_order, status)
SELECT 'ZZ DEMO Luxury Living', 'zz-demo-luxury-living', 'ZZ-CAT-DESC: Curated premium artisan homeware and ambient decor.', 'uploads/categories/zz-demo-category.webp', 'uploads/categories/zz-demo-category-thumb.webp', 10, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'zz-demo-luxury-living');

SET @demo_cat_id = (SELECT id FROM categories WHERE slug = 'zz-demo-luxury-living' LIMIT 1);

-- B. Subcategories
INSERT INTO subcategories (name, slug, description, image_path, thumb_path, sort_order, status)
SELECT 'ZZ DEMO Ambient Decor', 'zz-demo-ambient-decor', 'ZZ-SUBCAT-DESC-1: Statement textiles, lighting, and tactile homeware.', 'uploads/subcategories/zz-demo-subcategory-1.webp', NULL, 1, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM subcategories WHERE slug = 'zz-demo-ambient-decor');

SET @demo_subcat_1_id = (SELECT id FROM subcategories WHERE slug = 'zz-demo-ambient-decor' LIMIT 1);

INSERT INTO subcategories (name, slug, description, image_path, thumb_path, sort_order, status)
SELECT 'ZZ DEMO Lifestyle Collectibles', 'zz-demo-lifestyle-collectibles', 'ZZ-SUBCAT-DESC-2: Handcrafted bespoke collectibles and studio sculptures.', 'uploads/subcategories/zz-demo-subcategory-2.webp', NULL, 2, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM subcategories WHERE slug = 'zz-demo-lifestyle-collectibles');

SET @demo_subcat_2_id = (SELECT id FROM subcategories WHERE slug = 'zz-demo-lifestyle-collectibles' LIMIT 1);

-- Link Category <-> Subcategories
INSERT INTO category_subcategory (category_id, subcategory_id, sort_order)
SELECT @demo_cat_id, @demo_subcat_1_id, 1
WHERE NOT EXISTS (SELECT 1 FROM category_subcategory WHERE category_id = @demo_cat_id AND subcategory_id = @demo_subcat_1_id);

INSERT INTO category_subcategory (category_id, subcategory_id, sort_order)
SELECT @demo_cat_id, @demo_subcat_2_id, 2
WHERE NOT EXISTS (SELECT 1 FROM category_subcategory WHERE category_id = @demo_cat_id AND subcategory_id = @demo_subcat_2_id);

-- C. Brands
INSERT INTO brands (name, description, status)
SELECT 'ZZ DEMO Aurelia Studio', 'ZZ-BRAND-DESC: Bespoke interior architecture and tactile aesthetic artifacts.', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM brands WHERE name = 'ZZ DEMO Aurelia Studio');

SET @demo_brand_id = (SELECT id FROM brands WHERE name = 'ZZ DEMO Aurelia Studio' LIMIT 1);

-- Link Brand <-> Category
INSERT INTO brand_categories (brand_id, category_id)
SELECT @demo_brand_id, @demo_cat_id
WHERE NOT EXISTS (SELECT 1 FROM brand_categories WHERE brand_id = @demo_brand_id AND category_id = @demo_cat_id);

-- D. Variant Attributes & Values
INSERT INTO variant_attributes (name, sort_order, status)
SELECT 'ZZ DEMO Size', 1, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM variant_attributes WHERE name = 'ZZ DEMO Size');

SET @demo_attr_size_id = (SELECT id FROM variant_attributes WHERE name = 'ZZ DEMO Size' LIMIT 1);

INSERT INTO variant_attribute_values (attribute_id, value, color_hex, sort_order, status)
SELECT @demo_attr_size_id, 'ZZ-Small (40cm)', NULL, 1, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM variant_attribute_values WHERE attribute_id = @demo_attr_size_id AND value = 'ZZ-Small (40cm)');
SET @demo_val_size_s = (SELECT id FROM variant_attribute_values WHERE attribute_id = @demo_attr_size_id AND value = 'ZZ-Small (40cm)' LIMIT 1);

INSERT INTO variant_attribute_values (attribute_id, value, color_hex, sort_order, status)
SELECT @demo_attr_size_id, 'ZZ-Medium (50cm)', NULL, 2, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM variant_attribute_values WHERE attribute_id = @demo_attr_size_id AND value = 'ZZ-Medium (50cm)');
SET @demo_val_size_m = (SELECT id FROM variant_attribute_values WHERE attribute_id = @demo_attr_size_id AND value = 'ZZ-Medium (50cm)' LIMIT 1);

INSERT INTO variant_attribute_values (attribute_id, value, color_hex, sort_order, status)
SELECT @demo_attr_size_id, 'ZZ-Large (60cm)', NULL, 3, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM variant_attribute_values WHERE attribute_id = @demo_attr_size_id AND value = 'ZZ-Large (60cm)');
SET @demo_val_size_l = (SELECT id FROM variant_attribute_values WHERE attribute_id = @demo_attr_size_id AND value = 'ZZ-Large (60cm)' LIMIT 1);

INSERT INTO variant_attributes (name, sort_order, status)
SELECT 'ZZ DEMO Color Tone', 2, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM variant_attributes WHERE name = 'ZZ DEMO Color Tone');
SET @demo_attr_color_id = (SELECT id FROM variant_attributes WHERE name = 'ZZ DEMO Color Tone' LIMIT 1);

INSERT INTO variant_attribute_values (attribute_id, value, color_hex, sort_order, status)
SELECT @demo_attr_color_id, 'ZZ-Ruby Velvet', '#E11D48', 1, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM variant_attribute_values WHERE attribute_id = @demo_attr_color_id AND value = 'ZZ-Ruby Velvet');
SET @demo_val_col_ruby = (SELECT id FROM variant_attribute_values WHERE attribute_id = @demo_attr_color_id AND value = 'ZZ-Ruby Velvet' LIMIT 1);

INSERT INTO variant_attribute_values (attribute_id, value, color_hex, sort_order, status)
SELECT @demo_attr_color_id, 'ZZ-Emerald Silk', '#059669', 2, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM variant_attribute_values WHERE attribute_id = @demo_attr_color_id AND value = 'ZZ-Emerald Silk');
SET @demo_val_col_emerald = (SELECT id FROM variant_attribute_values WHERE attribute_id = @demo_attr_color_id AND value = 'ZZ-Emerald Silk' LIMIT 1);

INSERT INTO variant_attribute_values (attribute_id, value, color_hex, sort_order, status)
SELECT @demo_attr_color_id, 'ZZ-Sapphire Blue', '#2563EB', 3, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM variant_attribute_values WHERE attribute_id = @demo_attr_color_id AND value = 'ZZ-Sapphire Blue');
SET @demo_val_col_sapphire = (SELECT id FROM variant_attribute_values WHERE attribute_id = @demo_attr_color_id AND value = 'ZZ-Sapphire Blue' LIMIT 1);


-- ============================================================================
-- PRODUCT 1: ZZ DEMO Variable Multi-Variant Flagship (3 Variants, Full Details)
-- Tests: Variable options, different prices & stocks, specs, gallery, warranty
-- ============================================================================
INSERT INTO products (
    name, slug, product_code, brand_id, unit_id, hsn_code_id, gst_rate_id,
    short_description, description, bullet_points, tags, material,
    length_cm, width_cm, height_cm, weight_grams, manufacturer, country_of_origin,
    meta_title, meta_description, seo_keywords,
    expiry_applicable, warranty_applicable, warranty_period, warranty_unit, warranty_description,
    returnable, return_window_days, replacement_available, refund_available,
    shipping_required, cod_available,
    is_active, is_pos_enabled, is_ecommerce_enabled, is_featured, is_trending, is_deal, show_discount,
    is_best_seller_override, is_new_arrival_override
)
SELECT
    'ZZ DEMO Variable Artisan Velvet Cushion', 'zz-demo-variable-artisan-velvet-cushion', 'ZZDEMO-CODE-VAR01',
    @demo_brand_id, 1, NULL, 4,
    'ZZ-SHORT-DESC-VAR-001: Premium velvet handcrafted artisan cushion with 3 distinct size options.',
    'ZZ-DESC-UNIQUE-0001: Detailed velvet texture woven with high-resilience organic foam. Hypoallergenic and stain resistant luxury finishing for modern interiors.',
    '["ZZ-POINT-VAR-A: 100% Cotton Velvet Pile", "ZZ-POINT-VAR-B: Hidden Zipper Construction", "ZZ-POINT-VAR-C: Machine Washable Cover"]',
    'zzdemo, velvet, luxury, cushion, pillow, artisan, decor',
    'ZZ-Silk-Velvet-Blend',
    45.00, 45.00, 15.00, 650.00, 'ZZ Aurelia Crafts Ltd', 'India',
    'ZZ DEMO Velvet Cushion - Luxury Home Decor',
    'Discover ZZ DEMO handcrafted velvet cushions with premium down fill.',
    'velvet cushion, luxury pillow, artisan homeware',
    0, 1, 12, 'MONTHS', 'ZZ-WARRANTY-12-MONTHS-SEAM-REPAIR',
    1, 14, 1, 1,
    1, 1,
    1, 1, 1, 1, 1, 0, 1,
    NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM products WHERE slug = 'zz-demo-variable-artisan-velvet-cushion');

SET @p1_id = (SELECT id FROM products WHERE slug = 'zz-demo-variable-artisan-velvet-cushion' LIMIT 1);

-- Product 1 Categories & Subcategories
INSERT INTO product_categories (product_id, category_id, is_primary)
SELECT @p1_id, @demo_cat_id, 1
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE product_id = @p1_id AND category_id = @demo_cat_id);

INSERT INTO product_subcategories (product_id, subcategory_id)
SELECT @p1_id, @demo_subcat_1_id
WHERE NOT EXISTS (SELECT 1 FROM product_subcategories WHERE product_id = @p1_id AND subcategory_id = @demo_subcat_1_id);

-- Product 1 Images
INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
SELECT @p1_id, 'uploads/products/demo/zz-demo-cushion-main.webp', 'uploads/products/demo/zz-demo-cushion-thumb.webp', 0, 1
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = @p1_id AND image_path = 'uploads/products/demo/zz-demo-cushion-main.webp');

INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
SELECT @p1_id, 'uploads/products/demo/zz-demo-cushion-angle.webp', NULL, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = @p1_id AND image_path = 'uploads/products/demo/zz-demo-cushion-angle.webp');

INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
SELECT @p1_id, 'uploads/products/demo/zz-demo-cushion-detail.webp', NULL, 2, 0
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = @p1_id AND image_path = 'uploads/products/demo/zz-demo-cushion-detail.webp');

-- Product 1 Specifications
INSERT INTO product_specifications (product_id, name, value, sort_order)
SELECT @p1_id, 'Material Density', '400 GSM Heavyweight Velvet', 0
WHERE NOT EXISTS (SELECT 1 FROM product_specifications WHERE product_id = @p1_id AND name = 'Material Density');

INSERT INTO product_specifications (product_id, name, value, sort_order)
SELECT @p1_id, 'Care Instructions', 'Dry clean or gentle machine wash inside-out', 1
WHERE NOT EXISTS (SELECT 1 FROM product_specifications WHERE product_id = @p1_id AND name = 'Care Instructions');

INSERT INTO product_specifications (product_id, name, value, sort_order)
SELECT @p1_id, 'Closure Type', 'Concealed YKK Luxury Brass Zipper', 2
WHERE NOT EXISTS (SELECT 1 FROM product_specifications WHERE product_id = @p1_id AND name = 'Closure Type');

-- Product 1 Variants (Variant A: Small, Stock 42, MRP 1299, Retail 899)
INSERT INTO product_variants (
    product_id, sku, barcode, mrp, normal_price, retail_price, wholesale_price, purchase_price,
    min_selling_price, weight_grams, hsn_code_id, gst_rate_id,
    variant_description, is_default, status
)
SELECT
    @p1_id, 'ZZDEMO-VAR-001-SML', 'ZZBAR-VAR-S01', 1299.00, 899.00, 899.00, 650.00, 420.00,
    750.00, 500.00, NULL, 4,
    'ZZ-Small (40cm) / Ruby Velvet', 1, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = 'ZZDEMO-VAR-001-SML');
SET @v1_sml_id = (SELECT id FROM product_variants WHERE sku = 'ZZDEMO-VAR-001-SML' LIMIT 1);

INSERT INTO product_variant_values (variant_id, attribute_value_id)
SELECT @v1_sml_id, @demo_val_size_s
WHERE NOT EXISTS (SELECT 1 FROM product_variant_values WHERE variant_id = @v1_sml_id AND attribute_value_id = @demo_val_size_s);

INSERT INTO product_variant_values (variant_id, attribute_value_id)
SELECT @v1_sml_id, @demo_val_col_ruby
WHERE NOT EXISTS (SELECT 1 FROM product_variant_values WHERE variant_id = @v1_sml_id AND attribute_value_id = @demo_val_col_ruby);

INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold)
SELECT @v1_sml_id, @p1_id, 42.000, 0.000, 7.000
WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE variant_id = @v1_sml_id);

INSERT INTO inventory_batches (variant_id, batch_no, cost_price, selling_price, mrp, quantity, available_quantity, status)
SELECT @v1_sml_id, 'ZZDEMO-BATCH-VAR-S01', 420.00, 899.00, 1299.00, 42.000, 42.000, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM inventory_batches WHERE variant_id = @v1_sml_id AND batch_no = 'ZZDEMO-BATCH-VAR-S01');
SET @b1_sml_id = (SELECT id FROM inventory_batches WHERE variant_id = @v1_sml_id AND batch_no = 'ZZDEMO-BATCH-VAR-S01' LIMIT 1);

INSERT INTO inventory_transactions (variant_id, batch_id, type, reference_type, reference_id, qty, old_stock, new_stock, remarks)
SELECT @v1_sml_id, @b1_sml_id, 'OPENING', 'INITIAL', 0, 42.000, 0.000, 42.000, 'ZZ Initial Opening Stock'
WHERE NOT EXISTS (SELECT 1 FROM inventory_transactions WHERE variant_id = @v1_sml_id AND batch_id = @b1_sml_id);

INSERT INTO variant_images (variant_id, image_path, thumb_path, sort_order, is_primary)
SELECT @v1_sml_id, 'uploads/variants/demo/zz-demo-var-small.webp', NULL, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM variant_images WHERE variant_id = @v1_sml_id);

-- Product 1 Variant B: Medium, Stock 28, MRP 1599, Retail 1199
INSERT INTO product_variants (
    product_id, sku, barcode, mrp, normal_price, retail_price, wholesale_price, purchase_price,
    min_selling_price, weight_grams, hsn_code_id, gst_rate_id,
    variant_description, is_default, status
)
SELECT
    @p1_id, 'ZZDEMO-VAR-001-MED', 'ZZBAR-VAR-M01', 1599.00, 1199.00, 1199.00, 850.00, 550.00,
    999.00, 650.00, NULL, 4,
    'ZZ-Medium (50cm) / Emerald Silk', 0, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = 'ZZDEMO-VAR-001-MED');
SET @v1_med_id = (SELECT id FROM product_variants WHERE sku = 'ZZDEMO-VAR-001-MED' LIMIT 1);

INSERT INTO product_variant_values (variant_id, attribute_value_id)
SELECT @v1_med_id, @demo_val_size_m
WHERE NOT EXISTS (SELECT 1 FROM product_variant_values WHERE variant_id = @v1_med_id AND attribute_value_id = @demo_val_size_m);

INSERT INTO product_variant_values (variant_id, attribute_value_id)
SELECT @v1_med_id, @demo_val_col_emerald
WHERE NOT EXISTS (SELECT 1 FROM product_variant_values WHERE variant_id = @v1_med_id AND attribute_value_id = @demo_val_col_emerald);

INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold)
SELECT @v1_med_id, @p1_id, 28.000, 0.000, 5.000
WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE variant_id = @v1_med_id);

INSERT INTO inventory_batches (variant_id, batch_no, cost_price, selling_price, mrp, quantity, available_quantity, status)
SELECT @v1_med_id, 'ZZDEMO-BATCH-VAR-M01', 550.00, 1199.00, 1599.00, 28.000, 28.000, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM inventory_batches WHERE variant_id = @v1_med_id AND batch_no = 'ZZDEMO-BATCH-VAR-M01');
SET @b1_med_id = (SELECT id FROM inventory_batches WHERE variant_id = @v1_med_id AND batch_no = 'ZZDEMO-BATCH-VAR-M01' LIMIT 1);

INSERT INTO inventory_transactions (variant_id, batch_id, type, reference_type, reference_id, qty, old_stock, new_stock, remarks)
SELECT @v1_med_id, @b1_med_id, 'OPENING', 'INITIAL', 0, 28.000, 0.000, 28.000, 'ZZ Initial Opening Stock'
WHERE NOT EXISTS (SELECT 1 FROM inventory_transactions WHERE variant_id = @v1_med_id AND batch_id = @b1_med_id);

INSERT INTO variant_images (variant_id, image_path, thumb_path, sort_order, is_primary)
SELECT @v1_med_id, 'uploads/variants/demo/zz-demo-var-med.webp', NULL, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM variant_images WHERE variant_id = @v1_med_id);

-- Product 1 Variant C: Large, Stock 15, MRP 1999, Retail 1499
INSERT INTO product_variants (
    product_id, sku, barcode, mrp, normal_price, retail_price, wholesale_price, purchase_price,
    min_selling_price, weight_grams, hsn_code_id, gst_rate_id,
    variant_description, is_default, status
)
SELECT
    @p1_id, 'ZZDEMO-VAR-001-LRG', 'ZZBAR-VAR-L01', 1999.00, 1499.00, 1499.00, 1100.00, 720.00,
    1250.00, 850.00, NULL, 4,
    'ZZ-Large (60cm) / Sapphire Blue', 0, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = 'ZZDEMO-VAR-001-LRG');
SET @v1_lrg_id = (SELECT id FROM product_variants WHERE sku = 'ZZDEMO-VAR-001-LRG' LIMIT 1);

INSERT INTO product_variant_values (variant_id, attribute_value_id)
SELECT @v1_lrg_id, @demo_val_size_l
WHERE NOT EXISTS (SELECT 1 FROM product_variant_values WHERE variant_id = @v1_lrg_id AND attribute_value_id = @demo_val_size_l);

INSERT INTO product_variant_values (variant_id, attribute_value_id)
SELECT @v1_lrg_id, @demo_val_col_sapphire
WHERE NOT EXISTS (SELECT 1 FROM product_variant_values WHERE variant_id = @v1_lrg_id AND attribute_value_id = @demo_val_col_sapphire);

INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold)
SELECT @v1_lrg_id, @p1_id, 15.000, 0.000, 4.000
WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE variant_id = @v1_lrg_id);

INSERT INTO inventory_batches (variant_id, batch_no, cost_price, selling_price, mrp, quantity, available_quantity, status)
SELECT @v1_lrg_id, 'ZZDEMO-BATCH-VAR-L01', 720.00, 1499.00, 1999.00, 15.000, 15.000, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM inventory_batches WHERE variant_id = @v1_lrg_id AND batch_no = 'ZZDEMO-BATCH-VAR-L01');
SET @b1_lrg_id = (SELECT id FROM inventory_batches WHERE variant_id = @v1_lrg_id AND batch_no = 'ZZDEMO-BATCH-VAR-L01' LIMIT 1);

INSERT INTO inventory_transactions (variant_id, batch_id, type, reference_type, reference_id, qty, old_stock, new_stock, remarks)
SELECT @v1_lrg_id, @b1_lrg_id, 'OPENING', 'INITIAL', 0, 15.000, 0.000, 15.000, 'ZZ Initial Opening Stock'
WHERE NOT EXISTS (SELECT 1 FROM inventory_transactions WHERE variant_id = @v1_lrg_id AND batch_id = @b1_lrg_id);

INSERT INTO variant_images (variant_id, image_path, thumb_path, sort_order, is_primary)
SELECT @v1_lrg_id, 'uploads/variants/demo/zz-demo-var-large.webp', NULL, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM variant_images WHERE variant_id = @v1_lrg_id);


-- ============================================================================
-- PRODUCT 2: ZZ DEMO Discounted Hot Deal Product (50% Off Deal)
-- Tests: is_deal = 1, show_discount = 1, high percentage savings display
-- ============================================================================
INSERT INTO products (
    name, slug, product_code, brand_id, unit_id, hsn_code_id, gst_rate_id,
    short_description, description, bullet_points, tags, material,
    length_cm, width_cm, height_cm, weight_grams, manufacturer, country_of_origin,
    meta_title, meta_description, seo_keywords,
    expiry_applicable, warranty_applicable, warranty_period, warranty_unit, warranty_description,
    returnable, return_window_days, replacement_available, refund_available,
    shipping_required, cod_available,
    is_active, is_pos_enabled, is_ecommerce_enabled, is_featured, is_trending, is_deal, show_discount,
    is_best_seller_override, is_new_arrival_override
)
SELECT
    'ZZ DEMO Flash Deal Nordic Brass Table Lamp', 'zz-demo-flash-deal-nordic-brass-table-lamp', 'ZZDEMO-CODE-DEAL02',
    @demo_brand_id, 1, NULL, 4,
    'ZZ-SHORT-DESC-DEAL-002: Contemporary minimalist solid brass lamp with dual dimming modes.',
    'ZZ-DESC-UNIQUE-0002: Precision turned brushed brass with warm 2700K integrated LED light engine. Features step-less rotary tactile dimmer.',
    '["ZZ-POINT-DEAL-A: Brushed Antique Brass", "ZZ-POINT-DEAL-B: 3000K Warm Ambient Glow", "ZZ-POINT-DEAL-C: Touch Dimmer Base"]',
    'zzdemo, lamp, lighting, brass, nordic, flash deal',
    'ZZ-Brushed-Brass-Alloy',
    18.00, 18.00, 38.00, 1420.00, 'ZZ Aurelia Luminaire Hub', 'India',
    'ZZ DEMO Nordic Brass Lamp - Limited Deal',
    'Exclusive discount on ZZ DEMO solid brass minimalist lamp.',
    'brass table lamp, luxury lighting, desk lamp deal',
    0, 1, 2, 'YEARS', 'ZZ-WARRANTY-2-YEARS-LED-DRIVER',
    1, 7, 1, 1,
    1, 1,
    1, 1, 1, 0, 0, 1, 1,
    NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM products WHERE slug = 'zz-demo-flash-deal-nordic-brass-table-lamp');
SET @p2_id = (SELECT id FROM products WHERE slug = 'zz-demo-flash-deal-nordic-brass-table-lamp' LIMIT 1);

INSERT INTO product_categories (product_id, category_id, is_primary)
SELECT @p2_id, @demo_cat_id, 1
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE product_id = @p2_id AND category_id = @demo_cat_id);

INSERT INTO product_subcategories (product_id, subcategory_id)
SELECT @p2_id, @demo_subcat_1_id
WHERE NOT EXISTS (SELECT 1 FROM product_subcategories WHERE product_id = @p2_id AND subcategory_id = @demo_subcat_1_id);

INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
SELECT @p2_id, 'uploads/products/demo/zz-demo-lamp.webp', NULL, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = @p2_id);

INSERT INTO product_specifications (product_id, name, value, sort_order)
SELECT @p2_id, 'Bulb Type', 'Integrated 9W Warm LED', 0
WHERE NOT EXISTS (SELECT 1 FROM product_specifications WHERE product_id = @p2_id AND name = 'Bulb Type');

INSERT INTO product_specifications (product_id, name, value, sort_order)
SELECT @p2_id, 'Color Temperature', '2700K - 3000K Soft White', 1
WHERE NOT EXISTS (SELECT 1 FROM product_specifications WHERE product_id = @p2_id AND name = 'Color Temperature');

INSERT INTO product_variants (
    product_id, sku, barcode, mrp, normal_price, retail_price, wholesale_price, purchase_price,
    min_selling_price, weight_grams, hsn_code_id, gst_rate_id,
    variant_description, is_default, status
)
SELECT
    @p2_id, 'ZZDEMO-SMP-DEAL-002', 'ZZBAR-DEAL-002', 2999.00, 1499.00, 1499.00, 1100.00, 750.00,
    1200.00, 1420.00, NULL, 4,
    'Standard Brass Edition', 1, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = 'ZZDEMO-SMP-DEAL-002');
SET @v2_id = (SELECT id FROM product_variants WHERE sku = 'ZZDEMO-SMP-DEAL-002' LIMIT 1);

INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold)
SELECT @v2_id, @p2_id, 55.000, 0.000, 10.000
WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE variant_id = @v2_id);

INSERT INTO inventory_batches (variant_id, batch_no, cost_price, selling_price, mrp, quantity, available_quantity, status)
SELECT @v2_id, 'ZZDEMO-BATCH-DEAL-002', 750.00, 1499.00, 2999.00, 55.000, 55.000, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM inventory_batches WHERE variant_id = @v2_id);


-- ============================================================================
-- PRODUCT 3: ZZ DEMO No-Discount Full-Price Product
-- Tests: MRP == retail_price, show_discount = 0, no strikethrough price shown
-- ============================================================================
INSERT INTO products (
    name, slug, product_code, brand_id, unit_id, hsn_code_id, gst_rate_id,
    short_description, description, bullet_points, tags, material,
    length_cm, width_cm, height_cm, weight_grams, manufacturer, country_of_origin,
    returnable, return_window_days, replacement_available, refund_available,
    shipping_required, cod_available,
    is_active, is_pos_enabled, is_ecommerce_enabled, is_featured, is_trending, is_deal, show_discount
)
SELECT
    'ZZ DEMO Full Price Limited Marble Bookends', 'zz-demo-full-price-limited-marble-bookends', 'ZZDEMO-CODE-NODISC03',
    @demo_brand_id, 1, NULL, 4,
    'ZZ-SHORT-DESC-NODISC-003: Hand-sculpted Carrara marble bookends with zero promotional discount.',
    'ZZ-DESC-UNIQUE-0003: Carved from unblemished solid marble slabs with beveled architectural lines. Weighted base with velvet scratch protection.',
    '["ZZ-POINT-NODISC-A: Solid White Carrara Marble", "ZZ-POINT-NODISC-B: Non-Slip Felt Base", "ZZ-POINT-NODISC-C: Set of 2 Geometric Halves"]',
    'zzdemo, marble, bookends, luxury stone, full price',
    'ZZ-White-Carrara-Marble',
    12.00, 8.00, 18.00, 2400.00, 'ZZ Aurelia Stone Works', 'India',
    1, 7, 0, 1,
    1, 1,
    1, 1, 1, 0, 0, 0, 0
WHERE NOT EXISTS (SELECT 1 FROM products WHERE slug = 'zz-demo-full-price-limited-marble-bookends');
SET @p3_id = (SELECT id FROM products WHERE slug = 'zz-demo-full-price-limited-marble-bookends' LIMIT 1);

INSERT INTO product_categories (product_id, category_id, is_primary)
SELECT @p3_id, @demo_cat_id, 1
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE product_id = @p3_id AND category_id = @demo_cat_id);

INSERT INTO product_subcategories (product_id, subcategory_id)
SELECT @p3_id, @demo_subcat_2_id
WHERE NOT EXISTS (SELECT 1 FROM product_subcategories WHERE product_id = @p3_id AND subcategory_id = @demo_subcat_2_id);

INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
SELECT @p3_id, 'uploads/products/demo/zz-demo-bookends.webp', NULL, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = @p3_id);

INSERT INTO product_specifications (product_id, name, value, sort_order)
SELECT @p3_id, 'Stone Variety', 'Natural White Carrara Marble', 0
WHERE NOT EXISTS (SELECT 1 FROM product_specifications WHERE product_id = @p3_id AND name = 'Stone Variety');

INSERT INTO product_variants (
    product_id, sku, barcode, mrp, normal_price, retail_price, wholesale_price, purchase_price,
    weight_grams, is_default, status
)
SELECT
    @p3_id, 'ZZDEMO-SMP-NODISC-003', 'ZZBAR-NODISC-003', 1750.00, 1750.00, 1750.00, 1400.00, 950.00,
    2400.00, 1, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = 'ZZDEMO-SMP-NODISC-003');
SET @v3_id = (SELECT id FROM product_variants WHERE sku = 'ZZDEMO-SMP-NODISC-003' LIMIT 1);

INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold)
SELECT @v3_id, @p3_id, 24.000, 0.000, 5.000
WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE variant_id = @v3_id);


-- ============================================================================
-- PRODUCT 4: ZZ DEMO Out-Of-Stock Product
-- Tests: on_hand = 0, available = 0, "Out of Stock" badge, disabled "Add to Cart"
-- ============================================================================
INSERT INTO products (
    name, slug, product_code, brand_id, unit_id, hsn_code_id, gst_rate_id,
    short_description, description, bullet_points, tags, material,
    returnable, refund_available, shipping_required, cod_available,
    is_active, is_pos_enabled, is_ecommerce_enabled, is_featured, is_trending, is_deal, show_discount
)
SELECT
    'ZZ DEMO Sold Out Ceramic Espresso Tumbler', 'zz-demo-sold-out-ceramic-espresso-tumbler', 'ZZDEMO-CODE-OOS04',
    @demo_brand_id, 1, NULL, 4,
    'ZZ-SHORT-DESC-OOS-004: Studio stoneware espresso cup currently sold out.',
    'ZZ-DESC-UNIQUE-0004: Double-walled matte stoneware with volcanic ash flecks. Sells out instantly on restock.',
    '["ZZ-POINT-OOS-A: 150ml Ideal Cortado Capacity", "ZZ-POINT-OOS-B: Thermal Double Walled"]',
    'zzdemo, ceramic, espresso, tumbler, oos, out of stock',
    'ZZ-Double-Walled-Stoneware',
    1, 1, 1, 0,
    1, 1, 1, 1, 0, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM products WHERE slug = 'zz-demo-sold-out-ceramic-espresso-tumbler');
SET @p4_id = (SELECT id FROM products WHERE slug = 'zz-demo-sold-out-ceramic-espresso-tumbler' LIMIT 1);

INSERT INTO product_categories (product_id, category_id, is_primary)
SELECT @p4_id, @demo_cat_id, 1
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE product_id = @p4_id AND category_id = @demo_cat_id);

INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
SELECT @p4_id, 'uploads/products/demo/zz-demo-tumbler.webp', NULL, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = @p4_id);

INSERT INTO product_variants (
    product_id, sku, barcode, mrp, normal_price, retail_price, is_default, status
)
SELECT
    @p4_id, 'ZZDEMO-SMP-OOS-004', 'ZZBAR-OOS-004', 850.00, 650.00, 650.00, 1, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = 'ZZDEMO-SMP-OOS-004');
SET @v4_id = (SELECT id FROM product_variants WHERE sku = 'ZZDEMO-SMP-OOS-004' LIMIT 1);

INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold)
SELECT @v4_id, @p4_id, 0.000, 0.000, 5.000
WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE variant_id = @v4_id);


-- ============================================================================
-- PRODUCT 5: ZZ DEMO Inactive / Draft Product
-- Tests: is_active = 0, excluded from /api/products, returns 404 on show
-- ============================================================================
INSERT INTO products (
    name, slug, product_code, brand_id, unit_id,
    short_description, description,
    is_active, is_pos_enabled, is_ecommerce_enabled
)
SELECT
    'ZZ DEMO Inactive Seasonal Crystal Decanter', 'zz-demo-inactive-seasonal-crystal-decanter', 'ZZDEMO-CODE-INACT05',
    @demo_brand_id, 1,
    'ZZ-SHORT-DESC-INACT-005: Unreleased seasonal crystal decanter in draft status.',
    'ZZ-DESC-UNIQUE-0005: Hand-blown lead-free crystal with faceted geometric stopper. Reserved for seasonal catalog launch.',
    0, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM products WHERE slug = 'zz-demo-inactive-seasonal-crystal-decanter');
SET @p5_id = (SELECT id FROM products WHERE slug = 'zz-demo-inactive-seasonal-crystal-decanter' LIMIT 1);

INSERT INTO product_categories (product_id, category_id, is_primary)
SELECT @p5_id, @demo_cat_id, 1
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE product_id = @p5_id AND category_id = @demo_cat_id);

INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
SELECT @p5_id, 'uploads/products/demo/zz-demo-decanter.webp', NULL, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = @p5_id);

INSERT INTO product_variants (
    product_id, sku, barcode, mrp, normal_price, retail_price, is_default, status
)
SELECT
    @p5_id, 'ZZDEMO-SMP-INACT-005', 'ZZBAR-INACT-005', 3200.00, 2600.00, 2600.00, 1, 'INACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = 'ZZDEMO-SMP-INACT-005');
SET @v5_id = (SELECT id FROM product_variants WHERE sku = 'ZZDEMO-SMP-INACT-005' LIMIT 1);

INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold)
SELECT @v5_id, @p5_id, 18.000, 0.000, 5.000
WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE variant_id = @v5_id);


-- ============================================================================
-- PRODUCT 6: ZZ DEMO Soft-Deleted Product
-- Tests: deleted_at IS NOT NULL, excluded from all catalog and query listings
-- ============================================================================
INSERT INTO products (
    name, slug, product_code, brand_id, unit_id,
    short_description, description,
    is_active, is_pos_enabled, is_ecommerce_enabled, deleted_at
)
SELECT
    'ZZ DEMO Soft Deleted Archived Serving Tray', 'zz-demo-soft-deleted-archived-serving-tray', 'ZZDEMO-CODE-DEL06',
    @demo_brand_id, 1,
    'ZZ-SHORT-DESC-DEL-006: Archived serving tray that has been soft deleted.',
    'ZZ-DESC-UNIQUE-0006: Soft-deleted product to verify that queries checking deleted_at IS NULL exclude it completely.',
    1, 1, 1, NOW()
WHERE NOT EXISTS (SELECT 1 FROM products WHERE slug = 'zz-demo-soft-deleted-archived-serving-tray');
SET @p6_id = (SELECT id FROM products WHERE slug = 'zz-demo-soft-deleted-archived-serving-tray' LIMIT 1);

INSERT INTO product_categories (product_id, category_id, is_primary)
SELECT @p6_id, @demo_cat_id, 1
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE product_id = @p6_id AND category_id = @demo_cat_id);

INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
SELECT @p6_id, 'uploads/products/demo/zz-demo-tray.webp', NULL, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = @p6_id);

INSERT INTO product_variants (
    product_id, sku, barcode, mrp, normal_price, retail_price, is_default, status, deleted_at
)
SELECT
    @p6_id, 'ZZDEMO-SMP-DEL-006', 'ZZBAR-DEL-006', 1899.00, 1399.00, 1399.00, 1, 'ACTIVE', NOW()
WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = 'ZZDEMO-SMP-DEL-006');
SET @v6_id = (SELECT id FROM product_variants WHERE sku = 'ZZDEMO-SMP-DEL-006' LIMIT 1);

INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold)
SELECT @v6_id, @p6_id, 10.000, 0.000, 5.000
WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE variant_id = @v6_id);


-- ============================================================================
-- PRODUCT 7: ZZ DEMO Best Seller Flagship Product (4 Gallery Images)
-- Tests: is_best_seller_override = 1, multiple gallery images browsing
-- ============================================================================
INSERT INTO products (
    name, slug, product_code, brand_id, unit_id, hsn_code_id, gst_rate_id,
    short_description, description, bullet_points, tags, material,
    returnable, refund_available, shipping_required, cod_available,
    is_active, is_pos_enabled, is_ecommerce_enabled, is_featured, is_trending, is_deal, show_discount,
    is_best_seller_override
)
SELECT
    'ZZ DEMO Best Seller Hand-Poured Botanical Candle', 'zz-demo-best-seller-hand-poured-botanical-candle', 'ZZDEMO-CODE-BS07',
    @demo_brand_id, 1, NULL, 4,
    'ZZ-SHORT-DESC-BS-007: Signature botanical scented candle with amber glass jar.',
    'ZZ-DESC-UNIQUE-0007: 100% natural soy wax infused with essential oils of wild lavender and sandalwood. 55-hour clean burn time.',
    '["ZZ-POINT-BS-A: 100% Natural Soy Wax", "ZZ-POINT-BS-B: 55-Hour Clean Burn", "ZZ-POINT-BS-C: Heavyweight Reusable Amber Jar"]',
    'zzdemo, candle, botanical, best seller, fragrance, amber',
    'ZZ-Natural-Soy-Wax',
    1, 1, 1, 1,
    1, 1, 1, 0, 0, 0, 1,
    1
WHERE NOT EXISTS (SELECT 1 FROM products WHERE slug = 'zz-demo-best-seller-hand-poured-botanical-candle');
SET @p7_id = (SELECT id FROM products WHERE slug = 'zz-demo-best-seller-hand-poured-botanical-candle' LIMIT 1);

INSERT INTO product_categories (product_id, category_id, is_primary)
SELECT @p7_id, @demo_cat_id, 1
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE product_id = @p7_id AND category_id = @demo_cat_id);

INSERT INTO product_subcategories (product_id, subcategory_id)
SELECT @p7_id, @demo_subcat_1_id
WHERE NOT EXISTS (SELECT 1 FROM product_subcategories WHERE product_id = @p7_id AND subcategory_id = @demo_subcat_1_id);

-- 4 Distinct Gallery Images
INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
SELECT @p7_id, 'uploads/products/demo/zz-demo-candle-1.webp', NULL, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = @p7_id AND image_path = 'uploads/products/demo/zz-demo-candle-1.webp');

INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
SELECT @p7_id, 'uploads/products/demo/zz-demo-candle-2.webp', NULL, 1, 0
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = @p7_id AND image_path = 'uploads/products/demo/zz-demo-candle-2.webp');

INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
SELECT @p7_id, 'uploads/products/demo/zz-demo-candle-3.webp', NULL, 2, 0
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = @p7_id AND image_path = 'uploads/products/demo/zz-demo-candle-3.webp');

INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
SELECT @p7_id, 'uploads/products/demo/zz-demo-candle-4.webp', NULL, 3, 0
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = @p7_id AND image_path = 'uploads/products/demo/zz-demo-candle-4.webp');

INSERT INTO product_variants (
    product_id, sku, barcode, mrp, normal_price, retail_price, is_default, status
)
SELECT
    @p7_id, 'ZZDEMO-SMP-BS-007', 'ZZBAR-BS-007', 1199.00, 849.00, 849.00, 1, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = 'ZZDEMO-SMP-BS-007');
SET @v7_id = (SELECT id FROM product_variants WHERE sku = 'ZZDEMO-SMP-BS-007' LIMIT 1);

INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold)
SELECT @v7_id, @p7_id, 88.000, 0.000, 12.000
WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE variant_id = @v7_id);


-- ============================================================================
-- PRODUCT 8: ZZ DEMO New Arrival Modernist Vase
-- Tests: is_new_arrival_override = 1, New Arrivals home section
-- ============================================================================
INSERT INTO products (
    name, slug, product_code, brand_id, unit_id,
    short_description, description, bullet_points, tags, material,
    returnable, refund_available, shipping_required, cod_available,
    is_active, is_pos_enabled, is_ecommerce_enabled, show_discount,
    is_new_arrival_override
)
SELECT
    'ZZ DEMO New Arrival Ribbed Fluted Glass Vase', 'zz-demo-new-arrival-ribbed-fluted-glass-vase', 'ZZDEMO-CODE-NA08',
    @demo_brand_id, 1,
    'ZZ-SHORT-DESC-NA-008: Fluted architectural glass vase from latest studio drop.',
    'ZZ-DESC-UNIQUE-0008: Blown borosilicate fluted glass in subtle emerald hue. Designed for single stem or full floral arrangements.',
    '["ZZ-POINT-NA-A: Borosilicate Thermal Glass", "ZZ-POINT-NA-B: Modernist Fluted Ribs"]',
    'zzdemo, vase, glass, new arrival, fluted, green',
    'ZZ-Borosilicate-Fluted-Glass',
    1, 1, 1, 1,
    1, 1, 1, 1,
    1
WHERE NOT EXISTS (SELECT 1 FROM products WHERE slug = 'zz-demo-new-arrival-ribbed-fluted-glass-vase');
SET @p8_id = (SELECT id FROM products WHERE slug = 'zz-demo-new-arrival-ribbed-fluted-glass-vase' LIMIT 1);

INSERT INTO product_categories (product_id, category_id, is_primary)
SELECT @p8_id, @demo_cat_id, 1
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE product_id = @p8_id AND category_id = @demo_cat_id);

INSERT INTO product_subcategories (product_id, subcategory_id)
SELECT @p8_id, @demo_subcat_2_id
WHERE NOT EXISTS (SELECT 1 FROM product_subcategories WHERE product_id = @p8_id AND subcategory_id = @demo_subcat_2_id);

INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
SELECT @p8_id, 'uploads/products/demo/zz-demo-vase.webp', NULL, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = @p8_id);

INSERT INTO product_variants (
    product_id, sku, barcode, mrp, normal_price, retail_price, is_default, status
)
SELECT
    @p8_id, 'ZZDEMO-SMP-NA-008', 'ZZBAR-NA-008', 1450.00, 990.00, 990.00, 1, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = 'ZZDEMO-SMP-NA-008');
SET @v8_id = (SELECT id FROM product_variants WHERE sku = 'ZZDEMO-SMP-NA-008' LIMIT 1);

INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold)
SELECT @v8_id, @p8_id, 33.000, 0.000, 5.000
WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE variant_id = @v8_id);


-- ============================================================================
-- PRODUCT 9: ZZ DEMO Trending Minimalist Clock
-- Tests: is_trending = 1, Trending home section
-- ============================================================================
INSERT INTO products (
    name, slug, product_code, brand_id, unit_id,
    short_description, description, bullet_points, tags, material,
    returnable, refund_available, shipping_required, cod_available,
    is_active, is_pos_enabled, is_ecommerce_enabled, is_trending, show_discount
)
SELECT
    'ZZ DEMO Trending Floating Dial Walnut Wall Clock', 'zz-demo-trending-floating-dial-walnut-wall-clock', 'ZZDEMO-CODE-TR09',
    @demo_brand_id, 1,
    'ZZ-SHORT-DESC-TR-009: Floating rim silent sweep walnut clock trending across socials.',
    'ZZ-DESC-UNIQUE-0009: Silent Japanese quartz mechanism nestled in hand-finished American black walnut. Zero ticking noise.',
    '["ZZ-POINT-TR-A: Solid American Walnut", "ZZ-POINT-TR-B: Silent Sweep Quartz Movement"]',
    'zzdemo, clock, walnut, trending, wooden, minimal',
    'ZZ-Solid-American-Walnut',
    1, 1, 1, 1,
    1, 1, 1, 1, 1
WHERE NOT EXISTS (SELECT 1 FROM products WHERE slug = 'zz-demo-trending-floating-dial-walnut-wall-clock');
SET @p9_id = (SELECT id FROM products WHERE slug = 'zz-demo-trending-floating-dial-walnut-wall-clock' LIMIT 1);

INSERT INTO product_categories (product_id, category_id, is_primary)
SELECT @p9_id, @demo_cat_id, 1
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE product_id = @p9_id AND category_id = @demo_cat_id);

INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
SELECT @p9_id, 'uploads/products/demo/zz-demo-clock.webp', NULL, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = @p9_id);

INSERT INTO product_variants (
    product_id, sku, barcode, mrp, normal_price, retail_price, is_default, status
)
SELECT
    @p9_id, 'ZZDEMO-SMP-TR-009', 'ZZBAR-TR-009', 2499.00, 1899.00, 1899.00, 1, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = 'ZZDEMO-SMP-TR-009');
SET @v9_id = (SELECT id FROM product_variants WHERE sku = 'ZZDEMO-SMP-TR-009' LIMIT 1);

INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold)
SELECT @v9_id, @p9_id, 21.000, 0.000, 5.000
WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE variant_id = @v9_id);


-- ============================================================================
-- PRODUCT 10: ZZ DEMO Intentionally Minimal / Permissible Nulls Tester
-- Tests: Handled gracefully when optional fields (brand, specs, tags, etc.) are NULL
-- ============================================================================
INSERT INTO products (
    name, slug, product_code, brand_id, unit_id, hsn_code_id, gst_rate_id,
    short_description, description, bullet_points, tags, material,
    length_cm, width_cm, height_cm, weight_grams, manufacturer, country_of_origin,
    returnable, return_window_days, replacement_available, refund_available,
    shipping_required, cod_available,
    is_active, is_pos_enabled, is_ecommerce_enabled, is_featured, is_trending, is_deal, show_discount
)
SELECT
    'ZZ DEMO Intentionally Minimal Bare Product', 'zz-demo-intentionally-minimal-bare-product', NULL,
    NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL,
    NULL, NULL, NULL, NULL, NULL, NULL,
    0, NULL, 0, 0,
    1, 0,
    1, 1, 1, 0, 0, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM products WHERE slug = 'zz-demo-intentionally-minimal-bare-product');
SET @p10_id = (SELECT id FROM products WHERE slug = 'zz-demo-intentionally-minimal-bare-product' LIMIT 1);

INSERT INTO product_categories (product_id, category_id, is_primary)
SELECT @p10_id, @demo_cat_id, 1
WHERE NOT EXISTS (SELECT 1 FROM product_categories WHERE product_id = @p10_id AND category_id = @demo_cat_id);

INSERT INTO product_images (product_id, image_path, thumb_path, sort_order, is_primary)
SELECT @p10_id, 'uploads/products/demo/zz-demo-bare.webp', NULL, 0, 1
WHERE NOT EXISTS (SELECT 1 FROM product_images WHERE product_id = @p10_id);

INSERT INTO product_variants (
    product_id, sku, barcode, mrp, normal_price, retail_price, is_default, status
)
SELECT
    @p10_id, 'ZZDEMO-SMP-MIN-010', NULL, 500.00, 500.00, 500.00, 1, 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM product_variants WHERE sku = 'ZZDEMO-SMP-MIN-010');
SET @v10_id = (SELECT id FROM product_variants WHERE sku = 'ZZDEMO-SMP-MIN-010' LIMIT 1);

INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold)
SELECT @v10_id, @p10_id, 12.000, 0.000, 5.000
WHERE NOT EXISTS (SELECT 1 FROM inventory WHERE variant_id = @v10_id);

COMMIT;
