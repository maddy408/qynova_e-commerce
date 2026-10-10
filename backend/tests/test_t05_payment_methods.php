<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/test_guard.php';

putenv('APP_ENV=testing');
$_ENV['APP_ENV'] = 'testing';
$_SERVER['APP_ENV'] = 'testing';

$pdo = new PDO('mysql:host=127.0.0.1;dbname=unified_pos_test;charset=utf8mb4', 'root', 'Mysql@1234', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

\App\Tests\TestDbGuard::assertTestDatabase($pdo, __FILE__);

echo "=== T05 PAYMENT METHODS TEST SUITE (unified_pos_test) ===\n\n";

$inventoryService = new \App\Services\InventoryService($pdo);
$invoiceService = new \App\Services\InvoiceService($pdo, $inventoryService);

// Find an active product variant with available stock to use for tests
$variant = $pdo->query('
    SELECT v.id as variant_id, v.product_id, p.name as product_name, v.normal_price, i.available
    FROM product_variants v
    JOIN products p ON p.id = v.product_id
    JOIN inventory i ON i.variant_id = v.id
    WHERE v.status = "ACTIVE" AND i.available >= 10
    ORDER BY v.id ASC
    LIMIT 1
')->fetch();

if (!$variant) {
    throw new RuntimeException("No active variant with stock found in test database");
}

$vId = (int) $variant['variant_id'];
$pName = (string) $variant['product_name'];
$price = (string) $variant['normal_price'];

// Find or create a test customer
$custId = $pdo->query('SELECT id FROM customers WHERE deleted_at IS NULL LIMIT 1')->fetchColumn();
if (!$custId) {
    $pdo->prepare('INSERT INTO customers (name, phone, customer_type, created_at, updated_at) VALUES ("Test Customer T05", "9998887770", "NORMAL", NOW(), NOW())')->execute();
    $custId = (int) $pdo->lastInsertId();
} else {
    $custId = (int) $custId;
}

$adminUserId = 1;

$passedCount = 0;
$totalTests = 0;

function assertCondition(bool $cond, string $msg): void {
    global $passedCount, $totalTests;
    $totalTests++;
    if (!$cond) {
        echo "❌ FAILED: {$msg}\n";
        throw new RuntimeException("Assertion failed: {$msg}");
    }
    $passedCount++;
    echo "✅ PASSED: {$msg}\n";
}

// TEST 1: Each of the 6 allowed payment methods saves exactly
$methods = ['CASH', 'UPI', 'CARD', 'NETBANKING', 'CREDIT', 'GOOGLE_PAY'];
foreach ($methods as $m) {
    $items = [
        [
            'variant_id' => $vId,
            'quantity' => 1,
            'unit_price' => (float) $price,
            'product_name' => $pName,
            'is_quick_sale' => false,
        ]
    ];

    $amountPaid = ($m === 'CREDIT') ? '0.00' : $price;
    $invId = $invoiceService->createPosSale(
        items: $items,
        customerId: $custId,
        cashierUserId: $adminUserId,
        paymentMethod: $m,
        amountPaid: $amountPaid,
    );

    $saved = $pdo->query("SELECT id, invoice_no, payment_method, amount_paid, payment_status FROM invoices WHERE id = {$invId}")->fetch();
    assertCondition($saved['payment_method'] === $m, "Method '{$m}' saved in invoice {$saved['invoice_no']} exactly as '{$m}'");
    if ($m === 'CREDIT') {
        assertCondition($saved['payment_status'] === 'UNPAID', "Credit method with 0.00 paid creates UNPAID status");
    } else {
        assertCondition($saved['payment_status'] === 'PAID', "Method '{$m}' with full paid amount creates PAID status");
    }
}

// TEST 2: Lowercase / mixed-case method is normalized
$invIdLower = $invoiceService->createPosSale(
    items: [['variant_id' => $vId, 'quantity' => 1, 'unit_price' => (float) $price, 'product_name' => $pName]],
    customerId: $custId,
    cashierUserId: $adminUserId,
    paymentMethod: 'google_pay',
    amountPaid: $price,
);
$savedLower = $pdo->query("SELECT payment_method FROM invoices WHERE id = {$invIdLower}")->fetch();
assertCondition($savedLower['payment_method'] === 'GOOGLE_PAY', "Lowercase 'google_pay' normalized to 'GOOGLE_PAY'");

// TEST 3: Unknown payment method is rejected with 422
$unknownRejected = false;
try {
    $invoiceService->createPosSale(
        items: [['variant_id' => $vId, 'quantity' => 1, 'unit_price' => (float) $price, 'product_name' => $pName]],
        customerId: $custId,
        cashierUserId: $adminUserId,
        paymentMethod: 'BITCOIN',
        amountPaid: $price,
    );
} catch (\RuntimeException $e) {
    if (str_contains($e->getMessage(), 'Invalid payment method')) {
        $unknownRejected = true;
    }
}
assertCondition($unknownRejected, "Unknown payment method 'BITCOIN' rejected with 'Invalid payment method' exception");

// TEST 4: Walk-in customer + Credit is rejected
$walkInCreditRejected = false;
try {
    $invoiceService->createPosSale(
        items: [['variant_id' => $vId, 'quantity' => 1, 'unit_price' => (float) $price, 'product_name' => $pName]],
        customerId: null, // walk-in customer
        cashierUserId: $adminUserId,
        paymentMethod: 'CREDIT',
        amountPaid: '0.00',
    );
} catch (\RuntimeException $e) {
    if (str_contains($e->getMessage(), 'Credit payment is only allowed for registered customers')) {
        $walkInCreditRejected = true;
    }
}
assertCondition($walkInCreditRejected, "Walk-in customer with CREDIT payment method rejected on backend");

// TEST 5: Master payment_methods table in test DB contains all 6 methods
$dbMethods = $pdo->query('SELECT code, name, sort_order, is_active FROM payment_methods ORDER BY sort_order')->fetchAll();
$codes = array_column($dbMethods, 'code');
foreach (['CASH', 'UPI', 'CARD', 'NETBANKING', 'CREDIT', 'GOOGLE_PAY'] as $expectedCode) {
    assertCondition(in_array($expectedCode, $codes, true), "payment_methods lookup table contains {$expectedCode}");
}

// TEST 6: Dashboard and aggregations do not crash with any payment method
$dashboardService = new \App\Services\DashboardService($pdo);
$summary = $dashboardService->summary();
assertCondition(isset($summary['sales']['total_sales']), "Dashboard summary runs successfully with all payment methods");

echo "\n============================================\n";
echo "RESULT: {$passedCount} / {$totalTests} TESTS PASSED\n";
echo "============================================\n\n";
