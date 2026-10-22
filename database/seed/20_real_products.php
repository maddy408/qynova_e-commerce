<?php
declare(strict_types=1);

$targetDb = $argv[1] ?? 'unified_pos';
echo "=== Seeding 20 Real Products into DB: $targetDb ===\n";

$pdo = new PDO("mysql:host=127.0.0.1;port=3306;dbname={$targetDb};charset=utf8mb4", 'adams_user', 'AdamsPass@2026!', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

function getOrCreateBrand(PDO $pdo, string $name): int {
    $stmt = $pdo->prepare("SELECT id FROM brands WHERE name = ?");
    $stmt->execute([$name]);
    $id = $stmt->fetchColumn();
    if ($id) return (int) $id;
    $stmt = $pdo->prepare("INSERT INTO brands (name, status) VALUES (?, 'ACTIVE')");
    $stmt->execute([$name]);
    return (int) $pdo->lastInsertId();
}

function getOrCreateCategory(PDO $pdo, string $name): int {
    $slug = strtolower(trim(preg_replace('/[^A-Za-z0-9-]+/', '-', $name), '-'));
    $stmt = $pdo->prepare("SELECT id FROM categories WHERE name = ?");
    $stmt->execute([$name]);
    $id = $stmt->fetchColumn();
    if ($id) return (int) $id;
    $stmt = $pdo->prepare("INSERT INTO categories (name, slug, status) VALUES (?, ?, 'ACTIVE')");
    $stmt->execute([$name, $slug]);
    return (int) $pdo->lastInsertId();
}

function getOrCreateSubcategory(PDO $pdo, string $name, int $categoryId): int {
    $slug = strtolower(trim(preg_replace('/[^A-Za-z0-9-]+/', '-', $name), '-'));
    $stmt = $pdo->prepare("SELECT id FROM subcategories WHERE name = ?");
    $stmt->execute([$name]);
    $subId = $stmt->fetchColumn();
    if (!$subId) {
        $stmt = $pdo->prepare("INSERT INTO subcategories (name, slug, status) VALUES (?, ?, 'ACTIVE')");
        $stmt->execute([$name, $slug]);
        $subId = (int) $pdo->lastInsertId();
    } else {
        $subId = (int) $subId;
    }
    $stmt = $pdo->prepare("INSERT IGNORE INTO category_subcategory (category_id, subcategory_id) VALUES (?, ?)");
    $stmt->execute([$categoryId, $subId]);
    return $subId;
}

function getOrCreateUnit(PDO $pdo, string $name, string $shortCode): int {
    $stmt = $pdo->prepare("SELECT id FROM units WHERE name = ? OR short_code = ? LIMIT 1");
    $stmt->execute([$name, $shortCode]);
    $id = $stmt->fetchColumn();
    if ($id) return (int) $id;
    $stmt = $pdo->prepare("INSERT INTO units (name, short_code, status) VALUES (?, ?, 'ACTIVE')");
    $stmt->execute([$name, $shortCode]);
    return (int) $pdo->lastInsertId();
}

function getOrCreateGstRate(PDO $pdo, float $rate): int {
    $stmt = $pdo->prepare("SELECT id FROM gst_rates WHERE gst_percent = ?");
    $stmt->execute([$rate]);
    $id = $stmt->fetchColumn();
    if ($id) return (int) $id;
    $half = $rate / 2.0;
    $stmt = $pdo->prepare("INSERT INTO gst_rates (name, gst_percent, cgst_percent, sgst_percent, igst_percent, tax_mode, status) VALUES (?, ?, ?, ?, ?, 'INCLUSIVE', 'ACTIVE')");
    $stmt->execute(["GST {$rate}%", $rate, $half, $half, $rate]);
    return (int) $pdo->lastInsertId();
}

function getOrCreateHsn(PDO $pdo, string $code): int {
    $stmt = $pdo->prepare("SELECT id FROM hsn_codes WHERE code = ?");
    $stmt->execute([$code]);
    $id = $stmt->fetchColumn();
    if ($id) return (int) $id;
    $stmt = $pdo->prepare("INSERT INTO hsn_codes (code, description) VALUES (?, ?)");
    $stmt->execute([$code, "HSN {$code}"]);
    return (int) $pdo->lastInsertId();
}

$gst0 = getOrCreateGstRate($pdo, 0.0);
$gst5 = getOrCreateGstRate($pdo, 5.0);
$gst12 = getOrCreateGstRate($pdo, 12.0);
$gst18 = getOrCreateGstRate($pdo, 18.0);

$unitKg = getOrCreateUnit($pdo, 'Kilogram', 'KG');
$unitG = getOrCreateUnit($pdo, 'Gram', 'G');
$unitL = getOrCreateUnit($pdo, 'Litre', 'LTR');
$unitMl = getOrCreateUnit($pdo, 'Millilitre', 'ML');
$unitPack = getOrCreateUnit($pdo, 'Pack', 'PK');
$unitPiece = getOrCreateUnit($pdo, 'Piece', 'PC');

$productsData = [
    [
        'name' => 'Aashirvaad Shudh Chakki Atta',
        'code' => 'AASH-ATTA-5KG',
        'slug' => 'aashirvaad-shudh-chakki-atta',
        'brand' => 'Aashirvaad',
        'cat' => 'Atta, Rice & Dals',
        'subcat' => 'Atta & Flours',
        'hsn' => '1101',
        'gst' => $gst5,
        'unit' => $unitKg,
        'mrp' => 305.00,
        'price' => 279.00,
        'variant_title' => '5 kg',
        'stock' => 50,
        'image' => '/images/products/aashirvaad_atta_5kg.jpg',
        'short' => '100% whole wheat chakki atta for soft, fluffy rotis.',
        'desc' => 'Made from whole wheat grains ground the traditional chakki way to keep natural fibre. Kneads into a soft dough that stays soft for hours.',
    ],
    [
        'name' => 'Aashirvaad Pure Cow Ghee',
        'code' => 'AASH-GHEE-1L',
        'slug' => 'aashirvaad-pure-cow-ghee',
        'brand' => 'Aashirvaad',
        'cat' => 'Dairy & Breakfast',
        'subcat' => 'Ghee & Vanaspati',
        'hsn' => '0405',
        'gst' => $gst12,
        'unit' => $unitL,
        'mrp' => 690.00,
        'price' => 649.00,
        'variant_title' => '1 L',
        'stock' => 40,
        'image' => '/images/products/aashirvaad_cow_ghee.jpg',
        'short' => 'Traditional golden cow ghee with rich aroma and granular texture.',
        'desc' => 'Made from fresh cow milk using a special slow-cooking process that gives it a rich natural golden colour, wonderful aroma and authentic granular texture.',
    ],
    [
        'name' => 'Amul Butter Pasteurized',
        'code' => 'AMUL-BUTTER-500G',
        'slug' => 'amul-butter-pasteurized',
        'brand' => 'Amul',
        'cat' => 'Dairy & Breakfast',
        'subcat' => 'Butter & Cheese',
        'hsn' => '0405',
        'gst' => $gst12,
        'unit' => $unitG,
        'mrp' => 285.00,
        'price' => 275.00,
        'variant_title' => '500 g',
        'stock' => 60,
        'image' => '/images/products/amul_butter_500g.jpg',
        'short' => 'The classic Utterly Butterly Delicious salted butter.',
        'desc' => 'Made from pure milk fat with a pinch of salt. Perfect for breakfast toast, pav bhaji, baking and Indian parathas.',
    ],
    [
        'name' => 'Amul Processed Cheese Slices',
        'code' => 'AMUL-CHEESE-200G',
        'slug' => 'amul-processed-cheese-slices',
        'brand' => 'Amul',
        'cat' => 'Dairy & Breakfast',
        'subcat' => 'Butter & Cheese',
        'hsn' => '0406',
        'gst' => $gst12,
        'unit' => $unitPack,
        'mrp' => 145.00,
        'price' => 138.00,
        'variant_title' => '200 g (10 slices)',
        'stock' => 45,
        'image' => '/images/products/amul_cheese_slices.jpg',
        'short' => 'Individually wrapped creamy processed cheese slices.',
        'desc' => 'Creamy, melt-in-the-mouth cheese slices ideal for sandwiches, burgers, toasts and quick snacks for children.',
    ],
    [
        'name' => 'Britannia Good Day Cashew Cookies',
        'code' => 'BRIT-GOODDAY-600G',
        'slug' => 'britannia-good-day-cashew-cookies',
        'brand' => 'Britannia',
        'cat' => 'Snacks & Beverages',
        'subcat' => 'Biscuits & Cookies',
        'hsn' => '1905',
        'gst' => $gst18,
        'unit' => $unitG,
        'mrp' => 150.00,
        'price' => 135.00,
        'variant_title' => '600 g',
        'stock' => 80,
        'image' => '/images/products/britannia_good_day_cookies.jpg',
        'short' => 'Rich butter cookies loaded with crunchy cashew nuts.',
        'desc' => 'Iconic smile-pattern cookies packed with real cashews and a delightful buttery crunch that makes every day a good day.',
    ],
    [
        'name' => 'Cadbury Dairy Milk Chocolate',
        'code' => 'CAD-DAIRYMILK-130G',
        'slug' => 'cadbury-dairy-milk-chocolate',
        'brand' => 'Cadbury',
        'cat' => 'Snacks & Beverages',
        'subcat' => 'Chocolates & Candies',
        'hsn' => '1806',
        'gst' => $gst18,
        'unit' => $unitG,
        'mrp' => 110.00,
        'price' => 100.00,
        'variant_title' => '130 g',
        'stock' => 90,
        'image' => '/images/products/cadbury-dairy-milk-chocolate.jpg',
        'short' => 'Creamy, smooth milk chocolate loved across generations.',
        'desc' => 'Made from rich cocoa and glass-and-a-half of milk. The quintessential chocolate treat for celebrations and daily sweet cravings.',
    ],
    [
        'name' => 'Dabur 100% Pure Honey',
        'code' => 'DABUR-HONEY-500G',
        'slug' => 'dabur-100-pure-honey',
        'brand' => 'Dabur',
        'cat' => 'Dairy & Breakfast',
        'subcat' => 'Honey & Spreads',
        'hsn' => '0409',
        'gst' => $gst5,
        'unit' => $unitG,
        'mrp' => 235.00,
        'price' => 215.00,
        'variant_title' => '500 g',
        'stock' => 45,
        'image' => '/images/products/dabur_pure_honey.jpg',
        'short' => '100% pure NMR-tested honey sourced from natural apiaries.',
        'desc' => 'Pure honey rich in natural antioxidants, minerals and enzymes. Ideal with warm lemon water in the morning or as a healthy sugar replacement.',
    ],
    [
        'name' => 'Dabur Red Ayurvedic Toothpaste',
        'code' => 'DABUR-RED-300G',
        'slug' => 'dabur-red-ayurvedic-toothpaste',
        'brand' => 'Dabur',
        'cat' => 'Personal Care',
        'subcat' => 'Oral Care',
        'hsn' => '3306',
        'gst' => $gst18,
        'unit' => $unitG,
        'mrp' => 165.00,
        'price' => 149.00,
        'variant_title' => '300 g (Pack of 2)',
        'stock' => 55,
        'image' => '/images/products/dabur_red_paste.jpg',
        'short' => 'Clinically proven ayurvedic protection against 7 dental problems.',
        'desc' => 'Formulated with 13 potent Ayurvedic herbs including clove oil, pudina satva, tombar and maricha for strong teeth and healthy gums.',
    ],
    [
        'name' => 'Dettol Original Bathing Soap',
        'code' => 'DETTOL-SOAP-500G',
        'slug' => 'dettol-original-bathing-soap',
        'brand' => 'Dettol',
        'cat' => 'Personal Care',
        'subcat' => 'Bath & Body',
        'hsn' => '3401',
        'gst' => $gst18,
        'unit' => $unitPack,
        'mrp' => 220.00,
        'price' => 199.00,
        'variant_title' => '125 g x 4',
        'stock' => 70,
        'image' => '/images/products/dettol_bathing_soap.jpg',
        'short' => 'Trusted 99.9% germ protection with refreshing pine fragrance.',
        'desc' => 'Combines Dettol trusted germ protection with added moisturizers to cleanse and protect your family skin daily.',
    ],
    [
        'name' => 'Dove Cream Beauty Bathing Bar',
        'code' => 'DOVE-SOAP-300G',
        'slug' => 'dove-cream-beauty-bathing-bar',
        'brand' => 'Dove',
        'cat' => 'Personal Care',
        'subcat' => 'Bath & Body',
        'hsn' => '3401',
        'gst' => $gst18,
        'unit' => $unitPack,
        'mrp' => 255.00,
        'price' => 229.00,
        'variant_title' => '100 g x 3',
        'stock' => 65,
        'image' => '/images/products/dove_beauty_soap.jpg',
        'short' => 'Contains 1/4th moisturizing cream for soft, smooth glowing skin.',
        'desc' => 'Not a regular soap, but a beauty bar with mild cleansers that maintain skin natural moisture barrier rather than stripping it.',
    ],
    [
        'name' => 'Everest Pure Turmeric Powder',
        'code' => 'EVER-TURMERIC-500G',
        'slug' => 'everest-pure-turmeric-powder',
        'brand' => 'Everest',
        'cat' => 'Masalas & Spices',
        'subcat' => 'Powdered Spices',
        'hsn' => '0910',
        'gst' => $gst5,
        'unit' => $unitG,
        'mrp' => 160.00,
        'price' => 145.00,
        'variant_title' => '500 g',
        'stock' => 75,
        'image' => '/images/products/everest-turmeric-powder.jpg',
        'short' => 'High curcumin Salem haldi powder for rich golden colour and aroma.',
        'desc' => 'Ground from whole turmeric fingers carefully selected from Salem and Nizamabad. Delivers bright natural colour and authentic flavor.',
    ],
    [
        'name' => 'Fortune Chakki Fresh Atta',
        'code' => 'FORT-ATTA-5KG',
        'slug' => 'fortune-chakki-fresh-atta',
        'brand' => 'Fortune',
        'cat' => 'Atta, Rice & Dals',
        'subcat' => 'Atta & Flours',
        'hsn' => '1101',
        'gst' => $gst5,
        'unit' => $unitKg,
        'mrp' => 280.00,
        'price' => 255.00,
        'variant_title' => '5 kg',
        'stock' => 60,
        'image' => '/images/products/fortune_chakki_atta_5kg.jpg',
        'short' => 'Chakki-ground whole wheat atta for everyday rotis and pooris.',
        'desc' => 'Whole wheat atta ground in a traditional chakki process for a fine, consistent texture. Absorbs water well and rolls effortlessly.',
    ],
    [
        'name' => 'Fortune Sunlite Refined Sunflower Oil',
        'code' => 'FORT-OIL-1L',
        'slug' => 'fortune-sunlite-refined-sunflower-oil',
        'brand' => 'Fortune',
        'cat' => 'Cooking Oils & Ghee',
        'subcat' => 'Edible Oils',
        'hsn' => '1512',
        'gst' => $gst5,
        'unit' => $unitL,
        'mrp' => 165.00,
        'price' => 149.00,
        'variant_title' => '1 L Pouch',
        'stock' => 100,
        'image' => '/images/products/fortune_sunflower_oil_1l.jpg',
        'short' => 'Light, clear refined sunflower oil enriched with Vitamins A & D.',
        'desc' => 'Extremely light cooking oil that does not overpower natural food flavours. Absorbs less oil in deep frying and maintains heart health.',
    ],
    [
        'name' => 'Gold Winner Refined Sunflower Oil',
        'code' => 'GW-OIL-1L',
        'slug' => 'gold-winner-refined-sunflower-oil',
        'brand' => 'Gold Winner',
        'cat' => 'Cooking Oils & Ghee',
        'subcat' => 'Edible Oils',
        'hsn' => '1512',
        'gst' => $gst5,
        'unit' => $unitL,
        'mrp' => 170.00,
        'price' => 152.00,
        'variant_title' => '1 L Pouch',
        'stock' => 85,
        'image' => '/images/products/gold_winner_oil_1l.jpg',
        'short' => 'Top South Indian sunflower oil with natural Vitamin E & Omega-6.',
        'desc' => 'Refined to pure perfection for clear, odorless cooking. Popular in households for making crispy dosas, fries and traditional curries.',
    ],
    [
        'name' => 'Kissan 100% Real Mixed Fruit Jam',
        'code' => 'KISSAN-JAM-500G',
        'slug' => 'kissan-100-real-mixed-fruit-jam',
        'brand' => 'Kissan',
        'cat' => 'Dairy & Breakfast',
        'subcat' => 'Jams & Spreads',
        'hsn' => '2007',
        'gst' => $gst12,
        'unit' => $unitG,
        'mrp' => 185.00,
        'price' => 168.00,
        'variant_title' => '500 g',
        'stock' => 50,
        'image' => '/images/products/kissan-mixed-fruit-jam.jpg',
        'short' => 'Delicious blend of 8 real farm fruits for everyday breakfast.',
        'desc' => 'Packed with the goodness of apples, papayas, bananas, oranges, mangoes and grapes. Kids favorite spread on bread, roti or paratha.',
    ],
    [
        'name' => 'Maggi 2-Minute Masala Noodles',
        'code' => 'MAGGI-MASALA-8PK',
        'slug' => 'maggi-2-minute-masala-noodles',
        'brand' => 'Maggi',
        'cat' => 'Instant Food & Noodles',
        'subcat' => 'Noodles & Pasta',
        'hsn' => '1902',
        'gst' => $gst18,
        'unit' => $unitPack,
        'mrp' => 112.00,
        'price' => 99.00,
        'variant_title' => '560 g (Pack of 8)',
        'stock' => 120,
        'image' => '/images/products/maggi_masala_noodles.jpg',
        'short' => 'India favorite 2-minute instant noodles with special roasted spices.',
        'desc' => 'Each portion comes with the signature tastemaker blend of 10 roasted spices. Fortified with iron for a quick, delicious snack anytime.',
    ],
    [
        'name' => 'Nivea Men Dark Spot Reduction Face Wash',
        'code' => 'NIVEA-MEN-FW-100G',
        'slug' => 'nivea-men-dark-spot-reduction-face-wash',
        'brand' => 'Nivea',
        'cat' => 'Personal Care',
        'subcat' => "Men's Grooming",
        'hsn' => '3304',
        'gst' => $gst18,
        'unit' => $unitG,
        'mrp' => 225.00,
        'price' => 199.00,
        'variant_title' => '100 g',
        'stock' => 40,
        'image' => '/images/products/nivea_face_wash.jpg',
        'short' => 'Deep cleansing formula with 10x Vitamin C to reduce dark spots.',
        'desc' => 'Cleanses pollutants, dirt and excess oil from deep within facial pores while noticeably reducing dark spots and post-acne marks.',
    ],
    [
        'name' => 'Parachute 100% Pure Coconut Oil',
        'code' => 'PARA-COCONUT-500ML',
        'slug' => 'parachute-100-pure-coconut-oil',
        'brand' => 'Parachute',
        'cat' => 'Personal Care',
        'subcat' => 'Hair Care',
        'hsn' => '1513',
        'gst' => $gst5,
        'unit' => $unitMl,
        'mrp' => 210.00,
        'price' => 189.00,
        'variant_title' => '500 ml Bottle',
        'stock' => 80,
        'image' => '/images/products/parachute-100-pure-coconut-oil.jpg',
        'short' => '100% pure edible coconut oil made from sun-dried copras.',
        'desc' => 'Passes 27 quality tests and 5-stage purification. Keeps hair thick, long and shiny, while providing natural deep nourishment.',
    ],
    [
        'name' => 'Tata Salt Vacuum Evaporated Iodised Salt',
        'code' => 'TATA-SALT-1KG',
        'slug' => 'tata-salt-vacuum-evaporated-iodised-salt',
        'brand' => 'Tata Salt',
        'cat' => 'Masalas & Spices',
        'subcat' => 'Salt & Sugar',
        'hsn' => '2501',
        'gst' => $gst0,
        'unit' => $unitKg,
        'mrp' => 28.00,
        'price' => 26.00,
        'variant_title' => '1 kg',
        'stock' => 200,
        'image' => '/images/products/tata_salt_1kg.jpg',
        'short' => 'Desh Ka Namak - pure vacuum-evaporated iodised table salt.',
        'desc' => 'Pioneer of packaged iodised salt in India. Made through hygienic vacuum evaporation to ensure guaranteed iodine content for healthy family development.',
    ],
    [
        'name' => 'Tata Tea Gold Leaf Tea',
        'code' => 'TATA-TEA-GOLD-500G',
        'slug' => 'tata-tea-gold-leaf-tea',
        'brand' => 'Tata Tea',
        'cat' => 'Snacks & Beverages',
        'subcat' => 'Tea & Coffee',
        'hsn' => '0902',
        'gst' => $gst5,
        'unit' => $unitG,
        'mrp' => 330.00,
        'price' => 299.00,
        'variant_title' => '500 g',
        'stock' => 65,
        'image' => '/images/products/tata_tea_gold.jpg',
        'short' => 'Exquisite blend of rich Assam CTC tea with 15% long tea leaves.',
        'desc' => 'A unique blend that combines the rich strength of fine CTC teas with the irresistible aroma of 15% gently rolled long tea leaves.',
    ],
];

$insertedCount = 0;

foreach ($productsData as $p) {
    $brandId = getOrCreateBrand($pdo, $p['brand']);
    $catId = getOrCreateCategory($pdo, $p['cat']);
    $subcatId = getOrCreateSubcategory($pdo, $p['subcat'], $catId);
    $hsnId = getOrCreateHsn($pdo, $p['hsn']);

    // Check if product exists
    $stmt = $pdo->prepare("SELECT id FROM products WHERE product_code = ? OR slug = ?");
    $stmt->execute([$p['code'], $p['slug']]);
    $prodId = $stmt->fetchColumn();

    if ($prodId) {
        $prodId = (int) $prodId;
        $stmt = $pdo->prepare("UPDATE products SET name = ?, brand_id = ?, unit_id = ?, hsn_code_id = ?, gst_rate_id = ?, short_description = ?, description = ?, is_active = 1, is_pos_enabled = 1, is_ecommerce_enabled = 1, is_featured = 1 WHERE id = ?");
        $stmt->execute([$p['name'], $brandId, $p['unit'], $hsnId, $p['gst'], $p['short'], $p['desc'], $prodId]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO products (name, slug, product_code, brand_id, unit_id, hsn_code_id, gst_rate_id, short_description, description, is_active, is_pos_enabled, is_ecommerce_enabled, is_featured) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 1)");
        $stmt->execute([$p['name'], $p['slug'], $p['code'], $brandId, $p['unit'], $hsnId, $p['gst'], $p['short'], $p['desc']]);
        $prodId = (int) $pdo->lastInsertId();
    }

    // Link Category & Subcategory
    $pdo->prepare("DELETE FROM product_categories WHERE product_id = ?")->execute([$prodId]);
    $pdo->prepare("INSERT INTO product_categories (product_id, category_id, is_primary) VALUES (?, ?, 1)")->execute([$prodId, $catId]);

    $pdo->prepare("DELETE FROM product_subcategories WHERE product_id = ?")->execute([$prodId]);
    $pdo->prepare("INSERT INTO product_subcategories (product_id, subcategory_id) VALUES (?, ?)")->execute([$prodId, $subcatId]);

    // Link Product Image
    $pdo->prepare("DELETE FROM product_images WHERE product_id = ?")->execute([$prodId]);
    $pdo->prepare("INSERT INTO product_images (product_id, image_path, thumb_path, is_primary, sort_order) VALUES (?, ?, ?, 1, 0)")
        ->execute([$prodId, $p['image'], $p['image']]);

    // Product Variant
    $sku = $p['code'];
    $stmt = $pdo->prepare("SELECT id FROM product_variants WHERE product_id = ? AND sku = ?");
    $stmt->execute([$prodId, $sku]);
    $varId = $stmt->fetchColumn();

    if ($varId) {
        $varId = (int) $varId;
        $stmt = $pdo->prepare("UPDATE product_variants SET mrp = ?, retail_price = ?, normal_price = ?, status = 'ACTIVE' WHERE id = ?");
        $stmt->execute([$p['mrp'], $p['price'], $p['price'], $varId]);
    } else {
        $stmt = $pdo->prepare("INSERT INTO product_variants (product_id, sku, mrp, retail_price, normal_price, is_default, status) VALUES (?, ?, ?, ?, ?, 1, 'ACTIVE')");
        $stmt->execute([$prodId, $sku, $p['mrp'], $p['price'], $p['price']]);
        $varId = (int) $pdo->lastInsertId();
    }

    // Inventory
    $stmt = $pdo->prepare("INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold) VALUES (?, ?, ?, 0, 5) ON DUPLICATE KEY UPDATE on_hand = VALUES(on_hand)");
    $stmt->execute([$varId, $prodId, $p['stock']]);

    $insertedCount++;
    echo "  [OK] Product #{$insertedCount}: {$p['name']} ({$p['code']}) -> Rs.{$p['price']}, Stock: {$p['stock']}\n";
}

echo "Successfully seeded {$insertedCount} real products into {$targetDb}!\n";
