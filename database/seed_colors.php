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

// 1. Ensure 'Color' and 'Size' attributes exist
$stmt = $pdo->prepare("SELECT id FROM variant_attributes WHERE name = 'Color'");
$stmt->execute();
$colorAttrId = $stmt->fetchColumn();

if (!$colorAttrId) {
    $pdo->exec("INSERT INTO variant_attributes (name, sort_order) VALUES ('Color', 1)");
    $colorAttrId = (int) $pdo->lastInsertId();
}

$stmt = $pdo->prepare("SELECT id FROM variant_attributes WHERE name = 'Size'");
$stmt->execute();
$sizeAttrId = $stmt->fetchColumn();

if (!$sizeAttrId) {
    $pdo->exec("INSERT INTO variant_attributes (name, sort_order) VALUES ('Size', 2)");
    $sizeAttrId = (int) $pdo->lastInsertId();
}

// 2. Comprehensive 50+ World Colors with Hex Codes
$colors = [
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
];

$insertVal = $pdo->prepare("
    INSERT INTO variant_attribute_values (attribute_id, value, color_hex, sort_order)
    VALUES (:attr_id, :val, :hex, :sort)
    ON DUPLICATE KEY UPDATE color_hex = VALUES(color_hex)
");

$sort = 1;
foreach ($colors as $color) {
    $insertVal->execute([
        'attr_id' => $colorAttrId,
        'val' => $color['name'],
        'hex' => $color['hex'],
        'sort' => $sort++,
    ]);
}

// Also seed standard sizes if not present
$sizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'Free Size', 'Standard'];
$sort = 1;
foreach ($sizes as $size) {
    $insertVal->execute([
        'attr_id' => $sizeAttrId,
        'val' => $size,
        'hex' => null,
        'sort' => $sort++,
    ]);
}

echo "Seeded " . count($colors) . " colors and " . count($sizes) . " sizes successfully.\n";
