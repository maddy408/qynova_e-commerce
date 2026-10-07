<?php

declare(strict_types=1);

require __DIR__ . '/../backend/vendor/autoload.php';

use Dotenv\Dotenv;

Dotenv::createImmutable(__DIR__ . '/../backend')->safeLoad();

$host = $_ENV['DB_HOST'] ?? '127.0.0.1';
$port = $_ENV['DB_PORT'] ?? '3306';
$name = $_ENV['DB_NAME'] ?? 'unified_pos';
$user = $_ENV['DB_USER'] ?? 'root';
$pass = $_ENV['DB_PASS'] ?? '';

$pdo = new PDO("mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

// Definition of all 18 rich variant attributes and their default values
$allAttributes = [
    'Color' => [
        ['name' => 'Red', 'hex' => '#FF0000'],
        ['name' => 'Dark Red', 'hex' => '#8B0000'],
        ['name' => 'Crimson', 'hex' => '#DC143C'],
        ['name' => 'Maroon', 'hex' => '#800000'],
        ['name' => 'Burgundy', 'hex' => '#800020'],
        ['name' => 'Coral', 'hex' => '#FF7F50'],
        ['name' => 'Pink', 'hex' => '#FFC0CB'],
        ['name' => 'Hot Pink', 'hex' => '#FF69B4'],
        ['name' => 'Rose', 'hex' => '#FF007F'],
        ['name' => 'Rose Gold', 'hex' => '#B76E79'],
        ['name' => 'Magenta', 'hex' => '#FF00FF'],
        ['name' => 'Fuchsia', 'hex' => '#FF00FF'],
        ['name' => 'Purple', 'hex' => '#800080'],
        ['name' => 'Violet', 'hex' => '#8A2BE2'],
        ['name' => 'Indigo', 'hex' => '#4B0082'],
        ['name' => 'Lavender', 'hex' => '#E6E6FA'],
        ['name' => 'Plum', 'hex' => '#DDA0DD'],
        ['name' => 'Navy', 'hex' => '#000080'],
        ['name' => 'Dark Blue', 'hex' => '#00008B'],
        ['name' => 'Royal Blue', 'hex' => '#4169E1'],
        ['name' => 'Blue', 'hex' => '#0000FF'],
        ['name' => 'Sky Blue', 'hex' => '#87CEEB'],
        ['name' => 'Cyan', 'hex' => '#00FFFF'],
        ['name' => 'Teal', 'hex' => '#008080'],
        ['name' => 'Turquoise', 'hex' => '#40E0D0'],
        ['name' => 'Mint', 'hex' => '#98FF98'],
        ['name' => 'Emerald', 'hex' => '#50C878'],
        ['name' => 'Dark Green', 'hex' => '#006400'],
        ['name' => 'Green', 'hex' => '#008000'],
        ['name' => 'Olive', 'hex' => '#808000'],
        ['name' => 'Lime', 'hex' => '#00FF00'],
        ['name' => 'Yellow', 'hex' => '#FFFF00'],
        ['name' => 'Gold', 'hex' => '#FFD700'],
        ['name' => 'Amber', 'hex' => '#FFBF00'],
        ['name' => 'Mustard', 'hex' => '#FFDB58'],
        ['name' => 'Orange', 'hex' => '#FFA500'],
        ['name' => 'Peach', 'hex' => '#FFDAB9'],
        ['name' => 'Beige', 'hex' => '#F5F5DC'],
        ['name' => 'Khaki', 'hex' => '#F0E68C'],
        ['name' => 'Tan', 'hex' => '#D2B48C'],
        ['name' => 'Brown', 'hex' => '#A52A2A'],
        ['name' => 'Dark Brown', 'hex' => '#654321'],
        ['name' => 'Chocolate', 'hex' => '#7B3F00'],
        ['name' => 'White', 'hex' => '#FFFFFF'],
        ['name' => 'Off-White', 'hex' => '#FAFAFA'],
        ['name' => 'Silver', 'hex' => '#C0C0C0'],
        ['name' => 'Grey', 'hex' => '#808080'],
        ['name' => 'Light Grey', 'hex' => '#D3D3D3'],
        ['name' => 'Charcoal', 'hex' => '#36454F'],
        ['name' => 'Black', 'hex' => '#000000'],
        ['name' => 'Multi-color', 'hex' => '#FF5722'],
        ['name' => 'Transparent', 'hex' => '#E0E0E0'],
    ],
    'Size' => ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', 'Free Size', 'Standard'],
    'Weight' => ['50g', '100g', '250g', '500g', '1kg', '2kg', '5kg', '10kg', '25kg'],
    'Volume' => ['50ml', '100ml', '200ml', '250ml', '500ml', '750ml', '1L', '2L', '5L'],
    'Pack Size' => ['Pack of 1', 'Pack of 2', 'Pack of 3', 'Pack of 4', 'Pack of 6', 'Pack of 10', 'Pack of 12', 'Pack of 24'],
    'Quantity / Count' => ['1 pc', '6 pcs', '12 pcs', '24 pcs', '50 pcs', '100 pcs', '500 pcs'],
    'Flavor' => ['Vanilla', 'Chocolate', 'Strawberry', 'Mango', 'Butterscotch', 'Pineapple', 'Elaichi', 'Kesar', 'Cardamom', 'Mint', 'Chocolate Fudge', 'Pista', 'Blackcurrant'],
    'Taste' => ['Regular', 'Spicy', 'Extra Spicy', 'Salted', 'Masala', 'Sweet', 'Tangy', 'Peri Peri', 'Chilli Garlic'],
    'Type' => ['Full Cream', 'Toned', 'Double Toned', 'Skimmed', 'Whole', 'Cow Milk', 'Buffalo Milk'],
    'Form' => ['Powder', 'Liquid', 'Paste', 'Granules', 'Solid', 'Gel', 'Spray', 'Tablet', 'Capsule'],
    'Packaging Type' => ['Pouch', 'Bottle', 'Box', 'Jar', 'Can', 'Tin', 'Packet', 'Tetra Pack', 'Bucket', 'Tray'],
    'Grade' => ['Premium', 'Standard', 'Economy', 'Super Fine', 'Export Quality', 'Grade A', 'Grade B'],
    'Material / Ingredient Type' => ['Whole Wheat', 'Multigrain', 'Organic', 'Maida', 'Rice Flour', 'Rava', 'Besan', 'Oats'],
    'Scent / Fragrance' => ['Rose', 'Lemon', 'Lavender', 'Jasmine', 'Sandalwood', 'Neem', 'Herbal', 'Citrus', 'Lavender & Chamomile'],
    'Age Group' => ['Baby', 'Kids', 'Teen', 'Adult', 'Senior', 'All Ages'],
    'Diet Type' => ['Regular', 'Sugar Free', 'Gluten Free', 'Organic', 'Vegan', 'Keto', 'High Protein', 'Zero Fat'],
    'Strength' => ['Mild', 'Medium', 'Strong', 'Extra Strong'],
    'Combo / Bundle' => ['Single', 'Combo of 2', 'Combo of 3', 'Combo of 4', 'Family Pack', 'Mega Saver Pack', 'Starter Kit'],
];

$findAttrStmt = $pdo->prepare("SELECT id FROM variant_attributes WHERE name = :name");
$insertAttrStmt = $pdo->prepare("INSERT INTO variant_attributes (name, sort_order, status) VALUES (:name, :sort, 'ACTIVE')");
$insertValStmt = $pdo->prepare("
    INSERT INTO variant_attribute_values (attribute_id, value, color_hex, sort_order)
    VALUES (:attr_id, :val, :hex, :sort)
    ON DUPLICATE KEY UPDATE color_hex = VALUES(color_hex)
");

$attrSort = 1;
$totalAttributesSeeded = 0;
$totalValuesSeeded = 0;

foreach ($allAttributes as $attrName => $values) {
    $findAttrStmt->execute(['name' => $attrName]);
    $attrId = $findAttrStmt->fetchColumn();

    if (!$attrId) {
        $insertAttrStmt->execute(['name' => $attrName, 'sort' => $attrSort++]);
        $attrId = (int) $pdo->lastInsertId();
    } else {
        $attrId = (int) $attrId;
    }
    $totalAttributesSeeded++;

    $valSort = 1;
    foreach ($values as $val) {
        if (is_array($val)) {
            $valueStr = $val['name'];
            $hexStr = $val['hex'];
        } else {
            $valueStr = $val;
            $hexStr = null;
        }

        $insertValStmt->execute([
            'attr_id' => $attrId,
            'val' => $valueStr,
            'hex' => $hexStr,
            'sort' => $valSort++,
        ]);
        $totalValuesSeeded++;
    }
}

echo "Successfully seeded {$totalAttributesSeeded} variant attributes and {$totalValuesSeeded} attribute values into database.\n";
