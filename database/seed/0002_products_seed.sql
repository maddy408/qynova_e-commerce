-- Seed sample products for accessories, gifts, toys & combos
INSERT INTO brands (name) VALUES ('Qynova Luxury'), ('Pastel Bloom'), ('WonderPlay'), ('Aura Chic');

-- 1. Hair Accessories
INSERT INTO products (id, name, slug, product_code, short_description, is_active, is_ecommerce_enabled, is_featured, is_deal) VALUES
(1, 'Premium Silk Satin Scrunchies Set of 5', 'premium-silk-satin-scrunchies-set', 'HA-001', 'Ultra-soft pure mulberry satin hair scrunchies that prevent hair breakage and frizz.', 1, 1, 1, 1),
(2, 'French Pearl Elegance Hair Claw Clip', 'french-pearl-elegance-hair-claw-clip', 'HA-002', 'Non-slip acrylic hair claw clip studded with iridescent faux pearls for all hair types.', 1, 1, 1, 0),
(3, 'Vintage Velvet Bow Hair Clip', 'vintage-velvet-bow-hair-clip', 'HA-003', 'Handcrafted plush velvet oversized bow with French barrette clasp.', 1, 1, 0, 1),

-- 2. Jewellery & Fashion
(4, '18K Gold Plated Minimalist Butterfly Necklace', '18k-gold-plated-minimalist-butterfly-necklace', 'JW-001', 'Dainty water-resistant chain with sparkling zircon butterfly pendant.', 1, 1, 1, 1),
(5, 'Korean Crystal Teardrop Dangle Earrings', 'korean-crystal-teardrop-dangle-earrings', 'JW-002', 'Hypoallergenic 925 sterling silver post earrings with multifaceted crystal shine.', 1, 1, 1, 0),
(6, 'Boho Layered Gold Bead Bracelet Stack', 'boho-layered-gold-bead-bracelet-stack', 'JW-003', 'Set of 4 stretchable layered beaded charm bracelets for daily wear.', 1, 1, 0, 1),

-- 3. Gift Items
(7, 'Aromatherapy Soy Wax Scented Candle in Amber Jar', 'aromatherapy-soy-wax-scented-candle', 'GF-001', 'Natural essential oil scented candle with calming lavender and vanilla notes. 45h burn time.', 1, 1, 1, 1),
(8, 'Handcrafted Ceramic Mug with Gold Spoon', 'handcrafted-ceramic-mug-gold-spoon', 'GF-002', 'Artisan glazed stoneware mug with embossed constellation pattern in luxury gift box.', 1, 1, 1, 0),

-- 4. Toys
(9, 'Cute Huggable Pastel Teddy Bear (35cm)', 'cute-huggable-pastel-teddy-bear-35cm', 'TY-001', 'Ultra-soft baby-safe plush toy made with premium non-toxic velvet cotton.', 1, 1, 1, 1),
(10, 'Magnetic 3D Building Blocks Construction Set', 'magnetic-3d-building-blocks-set', 'TY-002', 'STEM educational creative building tiles for toddlers and kids.', 1, 1, 0, 1),

-- 5. Bags & Pouches
(11, 'Quilted Velvet Travel Makeup Organizer Pouch', 'quilted-velvet-makeup-organizer-pouch', 'BG-001', 'Spacious water-repellent cosmetics bag with golden zipper and brush slots.', 1, 1, 1, 1),
(12, 'Aesthetic Canvas Floral Tote Bag', 'aesthetic-canvas-floral-tote-bag', 'BG-002', 'Eco-friendly heavy-duty 100% cotton canvas tote with interior zip pocket.', 1, 1, 1, 0),

-- 6. Beauty Accessories
(13, 'Natural Rose Quartz Facial Roller & Gua Sha Set', 'natural-rose-quartz-facial-roller-gua-sha', 'BT-001', 'Authentic healing gemstone facial massage tool for glowing and sculpted skin.', 1, 1, 1, 1),
(14, 'Ultra-Soft Velour Powder Puff Trio Pack', 'ultra-soft-velour-powder-puff-trio', 'BT-002', 'Triangle makeup setting powder puffs for flawless airbrushed baking.', 1, 1, 0, 1),

-- 7. Storage & Utility
(15, 'Luxury 3-Tier Rotating Jewellery Storage Box', 'luxury-3-tier-rotating-jewellery-storage-box', 'ST-001', 'Dustproof cylindrical jewelry organizer with velvet lined compartments and mirror.', 1, 1, 1, 1),
(16, 'Stackable Acrylic Cosmetic Drawer Organizer', 'stackable-acrylic-cosmetic-drawer-organizer', 'ST-002', 'Crystal clear waterproof vanity organizer for lipsticks, palettes and perfumes.', 1, 1, 0, 0),

-- 8. Combo Offers
(17, 'Glam Diva Beauty & Hair Accessories Mega Combo', 'glam-diva-beauty-hair-mega-combo', 'CB-001', 'Special value bundle: 5 Satin Scrunchies + Pearl Claw Clip + Gua Sha Roller + Velvet Pouch.', 1, 1, 1, 1),
(18, 'Self-Care Scent & Comfort Pamper Hamper', 'self-care-scent-comfort-pamper-hamper', 'CB-002', 'Deluxe gift box with Scented Candle + Ceramic Mug + Teddy Plush + Greeting Card.', 1, 1, 1, 1);

-- Map Products to Categories
INSERT INTO product_categories (product_id, category_id) VALUES
(1, 1), (2, 1), (3, 1),
(4, 2), (5, 2), (6, 2),
(7, 3), (8, 3),
(9, 4), (10, 4),
(11, 5), (12, 5),
(13, 6), (14, 6),
(15, 7), (16, 7),
(17, 8), (18, 8);

-- Seed Default Variants with MRP and Retail Price
INSERT INTO product_variants (product_id, sku, mrp, retail_price, is_default, status) VALUES
(1, 'HA-001-DEF', 599.00, 299.00, 1, 'ACTIVE'),
(2, 'HA-002-DEF', 399.00, 199.00, 1, 'ACTIVE'),
(3, 'HA-003-DEF', 449.00, 249.00, 1, 'ACTIVE'),
(4, 'JW-001-DEF', 1299.00, 599.00, 1, 'ACTIVE'),
(5, 'JW-002-DEF', 799.00, 349.00, 1, 'ACTIVE'),
(6, 'JW-003-DEF', 699.00, 299.00, 1, 'ACTIVE'),
(7, 'GF-001-DEF', 899.00, 449.00, 1, 'ACTIVE'),
(8, 'GF-002-DEF', 799.00, 399.00, 1, 'ACTIVE'),
(9, 'TY-001-DEF', 999.00, 499.00, 1, 'ACTIVE'),
(10, 'TY-002-DEF', 1499.00, 799.00, 1, 'ACTIVE'),
(11, 'BG-001-DEF', 699.00, 349.00, 1, 'ACTIVE'),
(12, 'BG-002-DEF', 599.00, 279.00, 1, 'ACTIVE'),
(13, 'BT-001-DEF', 1199.00, 549.00, 1, 'ACTIVE'),
(14, 'BT-002-DEF', 399.00, 179.00, 1, 'ACTIVE'),
(15, 'ST-001-DEF', 1499.00, 699.00, 1, 'ACTIVE'),
(16, 'ST-002-DEF', 1299.00, 649.00, 1, 'ACTIVE'),
(17, 'CB-001-DEF', 2499.00, 999.00, 1, 'ACTIVE'),
(18, 'CB-002-DEF', 2999.00, 1299.00, 1, 'ACTIVE');
