<?php
$pdo = new PDO("mysql:host=127.0.0.1;dbname=unified_pos;charset=utf8mb4", "root", "root");
try {
    $pdo->exec("ALTER TABLE home_sections ADD COLUMN image_path VARCHAR(255) NULL AFTER title");
    echo "Added image_path column to home_sections table\n";
} catch (Exception $e) {
    echo $e->getMessage() . "\n";
}
