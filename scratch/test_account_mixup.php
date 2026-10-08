<?php

declare(strict_types=1);

require dirname(__DIR__) . '/backend/vendor/autoload.php';
require_once dirname(__DIR__) . '/backend/config/database.php';

$pdo = db();
$pdo->exec("DELETE FROM referral_codes WHERE customer_id IN (SELECT id FROM customers WHERE email IN ('customer1@gmail.com', 'customer2@gmail.com'))");
$pdo->exec("DELETE FROM customers WHERE email IN ('customer1@gmail.com', 'customer2@gmail.com')");
$pdo->exec("INSERT INTO customers (name, email, phone, status, customer_type) VALUES ('Customer One', 'customer1@gmail.com', '9870001111', 'ACTIVE', 'RETAIL')");
$c1_id = (int) $pdo->lastInsertId();

echo "Customer 1 created in DB with ID: {$c1_id}, email: customer1@gmail.com\n";

$ch = curl_init('http://localhost:8000/api/customers/google-login');
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['credential' => 'test_google:gid_c2:customer2@gmail.com:Customer Two:https://example.com/c2.jpg']));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
$res = curl_exec($ch);
curl_close($ch);

echo "Backend Response for customer2@gmail.com:\n" . $res . "\n";

$data = json_decode($res, true);
echo "Returned Customer ID: " . ($data['customer']['id'] ?? 'none') . "\n";
echo "Returned Customer Email: " . ($data['customer']['email'] ?? 'none') . "\n";

// Cleanup
$pdo->exec("DELETE FROM referral_codes WHERE customer_id IN (SELECT id FROM customers WHERE email IN ('customer1@gmail.com', 'customer2@gmail.com'))");
$pdo->exec("DELETE FROM customers WHERE email IN ('customer1@gmail.com', 'customer2@gmail.com')");
