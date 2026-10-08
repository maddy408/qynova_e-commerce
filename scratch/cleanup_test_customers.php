<?php

declare(strict_types=1);

require dirname(__DIR__) . '/backend/vendor/autoload.php';
require_once dirname(__DIR__) . '/backend/config/database.php';

$pdo = db();
$pdo->exec("DELETE FROM referral_codes WHERE customer_id IN (SELECT id FROM customers WHERE email LIKE '%@test-google.com')");
$pdo->exec("DELETE FROM customers WHERE email LIKE '%@test-google.com' OR google_id LIKE 'test_gid_%'");
echo "Cleaned temporary test customers successfully.\n";
