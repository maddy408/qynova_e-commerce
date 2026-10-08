<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config/database.php';

use App\Helpers\Config;
use App\Helpers\JwtHelper;
use App\Services\InventoryService;
use App\Services\PaymentService;
use App\Services\PurchaseService;

$pdo = db();
$inventory = new InventoryService($pdo);
$paymentService = new PaymentService($pdo);
$purchaseService = new PurchaseService($pdo, $inventory, $paymentService);

echo "=================================================================\n";
echo "=== STEP 4.1: TEST SUITE - PURCHASE PRINT DATA & ENDPOINTS ===\n";
echo "=================================================================\n\n";

$passed = 0;
$failed = 0;

function assertTest(bool $condition, string $testName, string $details = ''): void
{
    global $passed, $failed;
    if ($condition) {
        echo " [PASS] {$testName}\n";
        if ($details) echo "        -> {$details}\n";
        $passed++;
    } else {
        echo " [FAIL] {$testName}\n";
        if ($details) echo "        -> ERROR: {$details}\n";
        $failed++;
    }
}

// Track created IDs for strict test cleanup
$createdPurchaseIds = [];
$createdSupplierIds = [];

// 1. Setup Test Supplier, Product, Variant, Users (Admin & Cashier)
$supplierId = $purchaseService->createSupplier([
    'name' => 'Print Test Supplier ' . time() . '_' . random_int(100, 999),
    'contact_person' => 'Print Test Contact',
    'phone' => '9876543299',
    'email' => 'supplier@testprint.local',
    'address' => '456 Industrial Estate, Chennai',
    'gstin' => '33AAAAA0000A1Z5',
]);
$createdSupplierIds[] = $supplierId;

// Get product & variant
$variantRow = $pdo->query("SELECT id, product_id, sku, mrp, purchase_price FROM product_variants WHERE deleted_at IS NULL LIMIT 1")->fetch();
if (!$variantRow) {
    $unitId = $pdo->query("SELECT id FROM units LIMIT 1")->fetchColumn() ?: 1;
    $gstId = $pdo->query("SELECT id FROM gst_rates WHERE gst_percent = 0 LIMIT 1")->fetchColumn() ?: 1;

    $pdo->prepare("INSERT INTO products (name, slug, unit_id, gst_rate_id) VALUES ('Print Test Product', 'print-prod-" . time() . "', :unit, :gst)")
        ->execute(['unit' => $unitId, 'gst' => $gstId]);
    $prodId = (int) $pdo->lastInsertId();

    $sku = 'PRT-SKU-' . time();
    $pdo->prepare("INSERT INTO product_variants (product_id, sku, mrp, retail_price, purchase_price, gst_rate_id, status) VALUES (:prod, :sku, 200.00, 180.00, 150.00, :gst, 'ACTIVE')")
        ->execute(['prod' => $prodId, 'sku' => $sku, 'gst' => $gstId]);
    $vId = (int) $pdo->lastInsertId();

    $pdo->prepare("INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold) VALUES (:v, :p, 0, 0, 5)")
        ->execute(['v' => $vId, 'p' => $prodId]);

    $variantRow = ['id' => $vId, 'product_id' => $prodId, 'sku' => $sku, 'mrp' => '200.00', 'purchase_price' => '150.00'];
}

$variantId = (int) $variantRow['id'];
$productId = (int) $variantRow['product_id'];

// Get Admin and Cashier Users
$adminUser = $pdo->query("SELECT u.id, u.name, r.code AS role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'ADMIN' LIMIT 1")->fetch();
$cashierUser = $pdo->query("SELECT u.id, u.name, r.code AS role_code FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'CASHIER' LIMIT 1")->fetch();

if (!$adminUser) {
    $roleId = $pdo->query("SELECT id FROM roles WHERE code = 'ADMIN'")->fetchColumn();
    $pdo->prepare("INSERT INTO users (role_id, name, email, phone, status) VALUES (:r, 'Test Admin', 'admin.print@test.local', '9999999001', 'ACTIVE')")
        ->execute(['r' => $roleId]);
    $adminUser = ['id' => (int) $pdo->lastInsertId(), 'name' => 'Test Admin', 'role_code' => 'ADMIN'];
}
$adminUserId = (int) $adminUser['id'];

if (!$cashierUser) {
    $roleId = $pdo->query("SELECT id FROM roles WHERE code = 'CASHIER'")->fetchColumn();
    $pdo->prepare("INSERT INTO users (role_id, name, email, phone, status) VALUES (:r, 'Test Cashier', 'cashier.print@test.local', '9999999002', 'ACTIVE')")
        ->execute(['r' => $roleId]);
    $cashierUser = ['id' => (int) $pdo->lastInsertId(), 'name' => 'Test Cashier', 'role_code' => 'CASHIER'];
}
$cashierUserId = (int) $cashierUser['id'];

// Generate JWT tokens
$adminJwt = JwtHelper::issue([
    'sub' => $adminUserId,
    'type' => 'staff',
    'role' => 'ADMIN',
    'permissions' => ['purchases.manage', 'suppliers.manage', 'orders.manage', 'pos.sell'],
], 3600);

$cashierJwt = JwtHelper::issue([
    'sub' => $cashierUserId,
    'type' => 'staff',
    'role' => 'CASHIER',
    'permissions' => ['pos.sell'], // Note: no purchases.manage
], 3600);

$baseUrl = 'http://127.0.0.1:8080';

// Helper for HTTP requests
function sendHttp(string $method, string $path, ?array $body = null, ?string $token = null): array
{
    global $baseUrl;
    $ch = curl_init($baseUrl . $path);
    $headers = ['Content-Type: application/json', 'Accept: application/json'];
    if ($token !== null) {
        $headers[] = 'Authorization: Bearer ' . $token;
    }
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $rawResponse = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    return ['code' => $httpCode, 'data' => json_decode((string) $rawResponse, true) ?? [], 'raw' => $rawResponse];
}

try {
    echo "--- 1. Testing Unpaid Purchase Print Data ---\n";
    $p1Id = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [[
            'variant_id' => $variantId,
            'quantity' => '2',
            'unit_cost' => '100.00',
            'mrp' => '150.00',
            'discount_amount' => '0.00',
        ]],
        purchaseDate: date('Y-m-d'),
        amountPaid: '0.00',
        createdByUserId: $adminUserId,
        paymentMethod: null,
        notes: 'Unpaid purchase for print test'
    );
    $createdPurchaseIds[] = $p1Id;

    $p1Print = $purchaseService->getPurchasePrintData($p1Id, $adminUserId);
    assertTest($p1Print !== null, 'P1: Print data fetched successfully');
    assertTest(($p1Print['purchase']['purchase_no'] ?? '') !== '', 'P1: Purchase number present', $p1Print['purchase']['purchase_no'] ?? '');
    assertTest($p1Print['totals']['grand_total'] === '200.00', 'P1: Grand total is 200.00', $p1Print['totals']['grand_total']);
    assertTest($p1Print['totals']['paid_amount'] === '0.00', 'P1: Paid amount is 0.00', $p1Print['totals']['paid_amount']);
    assertTest($p1Print['totals']['balance_amount'] === '200.00', 'P1: Balance amount is 200.00', $p1Print['totals']['balance_amount']);
    assertTest($p1Print['payment']['payment_status'] === 'UNPAID', 'P1: Payment status is UNPAID');
    assertTest(count($p1Print['payment']['payments']) === 0, 'P1: Zero active payments list');
    assertTest(count($p1Print['items']) === 1, 'P1: 1 item present with serial 1');
    assertTest($p1Print['items'][0]['line_amount'] === '200.00', 'P1: Item line amount is 200.00');
    assertTest(str_contains($p1Print['printed_at'], 'IST'), 'P1: Printed at contains Asia/Kolkata IST timestamp');
    assertTest($p1Print['printed_by'] === $adminUser['name'], 'P1: Printed by name matches user', $p1Print['printed_by']);

    echo "\n--- 2. Testing Partially Paid Purchase Print Data ---\n";
    $p2Id = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [[
            'variant_id' => $variantId,
            'quantity' => '3',
            'unit_cost' => '100.00',
            'mrp' => '150.00',
            'discount_amount' => '0.00',
        ]],
        purchaseDate: date('Y-m-d'),
        amountPaid: '100.00',
        createdByUserId: $adminUserId,
        paymentMethod: 'CASH',
        notes: 'Partially paid purchase'
    );
    $createdPurchaseIds[] = $p2Id;

    $p2Print = $purchaseService->getPurchasePrintData($p2Id, $adminUserId);
    assertTest($p2Print !== null, 'P2: Print data fetched');
    assertTest($p2Print['totals']['grand_total'] === '300.00', 'P2: Grand total 300.00');
    assertTest($p2Print['totals']['paid_amount'] === '100.00', 'P2: Paid amount 100.00');
    assertTest($p2Print['totals']['balance_amount'] === '200.00', 'P2: Balance amount 200.00');
    assertTest($p2Print['payment']['payment_status'] === 'PARTIALLY_PAID', 'P2: Payment status PARTIALLY_PAID');
    assertTest(count($p2Print['payment']['payments']) === 1, 'P2: 1 active payment in list');
    assertTest($p2Print['payment']['payments'][0]['total_amount'] === '100.00', 'P2: Payment amount is 100.00');

    echo "\n--- 3. Testing Paid via Split (Cash + UPI with Ref) ---\n";
    $p3Id = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [[
            'variant_id' => $variantId,
            'quantity' => '4',
            'unit_cost' => '100.00',
            'mrp' => '150.00',
            'discount_amount' => '0.00',
        ]],
        purchaseDate: date('Y-m-d'),
        amountPaid: '400.00',
        createdByUserId: $adminUserId,
        paymentMethod: 'SPLIT',
        notes: 'Split payment purchase',
        paymentLines: [
            ['method' => 'CASH', 'amount' => '150.00'],
            ['method' => 'UPI', 'amount' => '250.00', 'reference_no' => 'UPI-REF-998877'],
        ]
    );
    $createdPurchaseIds[] = $p3Id;

    $p3Print = $purchaseService->getPurchasePrintData($p3Id, $adminUserId);
    assertTest($p3Print !== null, 'P3: Print data fetched');
    assertTest($p3Print['totals']['grand_total'] === '400.00', 'P3: Grand total 400.00');
    assertTest($p3Print['totals']['paid_amount'] === '400.00', 'P3: Paid amount 400.00');
    assertTest($p3Print['totals']['balance_amount'] === '0.00', 'P3: Balance amount 0.00');
    assertTest($p3Print['payment']['payment_status'] === 'PAID', 'P3: Payment status PAID');
    assertTest($p3Print['payment']['payment_method'] === 'SPLIT', 'P3: Payment method SPLIT');
    assertTest(count($p3Print['payment']['payments']) === 1, 'P3: 1 active payment');
    $p3Lines = $p3Print['payment']['payments'][0]['lines'];
    assertTest(count($p3Lines) === 2, 'P3: Payment has 2 split lines');
    assertTest($p3Lines[0]['payment_method'] === 'CASH' && $p3Lines[0]['amount'] === '150.00', 'P3: Line 1 is CASH 150.00');
    assertTest($p3Lines[1]['payment_method'] === 'UPI' && $p3Lines[1]['amount'] === '250.00' && $p3Lines[1]['reference_no'] === 'UPI-REF-998877', 'P3: Line 2 is UPI 250.00 with reference');

    echo "\n--- 4. Testing Cancelled Purchase Print Data ---\n";
    $p4Id = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [[
            'variant_id' => $variantId,
            'quantity' => '1',
            'unit_cost' => '100.00',
            'mrp' => '150.00',
            'discount_amount' => '0.00',
        ]],
        purchaseDate: date('Y-m-d'),
        amountPaid: '0.00',
        createdByUserId: $adminUserId,
        paymentMethod: null,
        notes: 'To be cancelled'
    );
    $createdPurchaseIds[] = $p4Id;
    $purchaseService->cancelPurchase($p4Id, 'Test cancellation for print', $adminUserId);

    $p4Print = $purchaseService->getPurchasePrintData($p4Id, $adminUserId);
    assertTest($p4Print !== null, 'P4: Print data fetched for cancelled purchase');
    assertTest($p4Print['purchase']['status'] === 'CANCELLED', 'P4: Status is CANCELLED', $p4Print['purchase']['status']);
    assertTest($p4Print['totals']['grand_total'] === '100.00', 'P4: Grand total preserved 100.00');

    echo "\n--- 5. Testing Purchase with Reversed Payment ---\n";
    $p5Id = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [[
            'variant_id' => $variantId,
            'quantity' => '5',
            'unit_cost' => '100.00',
            'mrp' => '150.00',
            'discount_amount' => '0.00',
        ]],
        purchaseDate: date('Y-m-d'),
        amountPaid: '0.00',
        createdByUserId: $adminUserId,
        paymentMethod: null,
        notes: 'Test reversal'
    );
    $createdPurchaseIds[] = $p5Id;

    // Add payment of 200
    $colRes = $purchaseService->collectPayment($p5Id, [
        'amount' => '200.00',
        'lines' => [['method' => 'CASH', 'amount' => '200.00']],
    ], $adminUserId);
    $payIdToReverse = (int) $colRes['payment']['id'];

    // Reverse the payment
    $purchaseService->reversePayment($p5Id, $payIdToReverse, 'Cheque bounced or duplicate entry', $adminUserId);

    $p5Print = $purchaseService->getPurchasePrintData($p5Id, $adminUserId);
    assertTest($p5Print !== null, 'P5: Print data fetched');
    assertTest($p5Print['totals']['paid_amount'] === '0.00', 'P5: Paid amount excludes reversed payment (0.00)', $p5Print['totals']['paid_amount']);
    assertTest($p5Print['totals']['balance_amount'] === '500.00', 'P5: Balance restored to 500.00', $p5Print['totals']['balance_amount']);
    assertTest(count($p5Print['payment']['payments']) === 0, 'P5: Active payments list is empty');
    assertTest(count($p5Print['payment']['reversed_payments']) === 1, 'P5: 1 payment in reversed_payments list');
    assertTest($p5Print['payment']['reversed_payments'][0]['reverse_reason'] === 'Cheque bounced or duplicate entry', 'P5: Reverse reason clearly labelled');

    echo "\n--- 6. Testing Single Payment Receipt Print Data (GET /purchases/{id}/payments/{paymentId}/print-data) ---\n";
    // Add an active payment to P5
    $colRes2 = $purchaseService->collectPayment($p5Id, [
        'amount' => '300.00',
        'lines' => [
            ['method' => 'CARD', 'amount' => '300.00', 'reference_no' => 'POS-CARD-5544'],
        ],
    ], $adminUserId);
    $activePayId = (int) $colRes2['payment']['id'];

    $singlePayPrint = $purchaseService->getPaymentPrintData($p5Id, $activePayId, $adminUserId);
    assertTest($singlePayPrint !== null, 'Single Payment Receipt print data fetched');
    assertTest($singlePayPrint['payment']['receipt_no'] === $colRes2['payment']['receipt_no'], 'Receipt No matches', $singlePayPrint['payment']['receipt_no']);
    assertTest($singlePayPrint['payment']['total_amount'] === '300.00', 'Receipt Total Amount is 300.00');
    assertTest($singlePayPrint['payment']['lines'][0]['reference_no'] === 'POS-CARD-5544', 'Receipt line reference matches');
    assertTest($singlePayPrint['supplier']['name'] === $p5Print['purchase']['supplier']['name'], 'Supplier name in receipt matches purchase supplier');
    assertTest($singlePayPrint['purchase']['balance_amount'] === '200.00', 'Purchase remaining balance is 200.00');

    echo "\n--- 7. Testing HTTP Endpoints, Auth & Guards (401, 403, 404) ---\n";
    // 7a. 200 OK with Admin Token
    $http200 = sendHttp('GET', "/api/purchases/{$p1Id}/print-data", null, $adminJwt);
    assertTest($http200['code'] === 200 && isset($http200['data']['print_data']), 'HTTP 200 on /api/purchases/{id}/print-data with Admin token');

    // 7b. 200 OK for Single Payment with Admin Token
    $httpPay200 = sendHttp('GET', "/api/purchases/{$p5Id}/payments/{$activePayId}/print-data", null, $adminJwt);
    assertTest($httpPay200['code'] === 200 && isset($httpPay200['data']['payment_print_data']), 'HTTP 200 on /api/purchases/{id}/payments/{payId}/print-data with Admin token');

    // 7c. 401 Unauthorized without Token
    $http401 = sendHttp('GET', "/api/purchases/{$p1Id}/print-data");
    assertTest($http401['code'] === 401, 'HTTP 401 without auth token');

    // 7d. 403 Forbidden with Cashier Token (missing purchases.manage)
    $http403 = sendHttp('GET', "/api/purchases/{$p1Id}/print-data", null, $cashierJwt);
    assertTest($http403['code'] === 403, 'HTTP 403 with Cashier token (lacks purchases.manage)');

    // 7e. 404 Not Found for unknown Purchase ID
    $http404 = sendHttp('GET', '/api/purchases/99999999/print-data', null, $adminJwt);
    assertTest($http404['code'] === 404, 'HTTP 404 for non-existent purchase ID');

    // 7f. 404 Not Found for mismatched Payment ID
    $httpPay404 = sendHttp('GET', "/api/purchases/{$p1Id}/payments/99999999/print-data", null, $adminJwt);
    assertTest($httpPay404['code'] === 404, 'HTTP 404 for payment not belonging to purchase');

    echo "\n--- 8. Testing payment_method Derivation on Edit, Collect, Reverse, Split ---\n";
    // 8a. Unpaid -> edit to partially paid (UPI) -> edit to unpaid -> method NULL
    $p8aId = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '5', 'unit_cost' => '100.00', 'mrp' => '150.00', 'discount_amount' => '0.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '0.00',
        createdByUserId: $adminUserId,
        paymentMethod: null
    );
    $createdPurchaseIds[] = $p8aId;
    $p8aRow = $pdo->query("SELECT payment_status, payment_method, paid_amount FROM purchases WHERE id = {$p8aId}")->fetch();
    assertTest($p8aRow['payment_status'] === 'UNPAID' && $p8aRow['payment_method'] === null, '8a-1: Initial unpaid purchase has payment_method = NULL');

    // Edit to partially paid (UPI)
    $paymentService->updatePayment($p8aId, [
        'payment_status' => 'PARTIALLY_PAID',
        'paid_amount' => '200.00',
        'payment_method' => 'UPI',
        'lines' => [['method' => 'UPI', 'amount' => '200.00', 'reference_no' => 'UPI-8A-123']],
    ], $adminUserId);
    $p8aRow2 = $pdo->query("SELECT payment_status, payment_method, paid_amount FROM purchases WHERE id = {$p8aId}")->fetch();
    assertTest($p8aRow2['payment_status'] === 'PARTIALLY_PAID' && $p8aRow2['payment_method'] === 'UPI', '8a-2: Edited to partially paid (UPI) has payment_method = UPI');

    // Edit to unpaid
    $paymentService->updatePayment($p8aId, [
        'payment_status' => 'UNPAID',
        'paid_amount' => '0.00',
        'payment_method' => 'CASH', // intentionally pass CASH to verify it is discarded
    ], $adminUserId);
    $p8aRow3 = $pdo->query("SELECT payment_status, payment_method, paid_amount FROM purchases WHERE id = {$p8aId}")->fetch();
    assertTest($p8aRow3['payment_status'] === 'UNPAID' && $p8aRow3['payment_method'] === null, '8a-3: Edited to unpaid has payment_method = NULL');

    // 8b. Collect then reverse everything -> NULL
    $p8bId = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '3', 'unit_cost' => '100.00', 'mrp' => '150.00', 'discount_amount' => '0.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '0.00',
        createdByUserId: $adminUserId,
        paymentMethod: null
    );
    $createdPurchaseIds[] = $p8bId;
    $col8b = $paymentService->collectPayment($p8bId, [
        'amount' => '300.00',
        'lines' => [['method' => 'CARD', 'amount' => '300.00', 'reference_no' => 'CARD-8B']],
    ], $adminUserId);
    $p8bPayId = (int) $col8b['payment']['id'];
    $p8bRow = $pdo->query("SELECT payment_status, payment_method FROM purchases WHERE id = {$p8bId}")->fetch();
    assertTest($p8bRow['payment_status'] === 'PAID' && $p8bRow['payment_method'] === 'CARD', '8b-1: Collected full CARD payment has payment_method = CARD');

    // Reverse the payment
    $paymentService->reversePayment($p8bId, $p8bPayId, 'Reversing all payments test', $adminUserId);
    $p8bRow2 = $pdo->query("SELECT payment_status, payment_method, paid_amount FROM purchases WHERE id = {$p8bId}")->fetch();
    assertTest($p8bRow2['payment_status'] === 'UNPAID' && $p8bRow2['payment_method'] === null, '8b-2: Reversed all payments yields payment_method = NULL');

    // 8c. Split then reverse one payment line/entry -> single remaining method
    $p8cId = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '4', 'unit_cost' => '100.00', 'mrp' => '150.00', 'discount_amount' => '0.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '0.00',
        createdByUserId: $adminUserId,
        paymentMethod: null
    );
    $createdPurchaseIds[] = $p8cId;
    $pay8c_1 = $paymentService->collectPayment($p8cId, [
        'amount' => '100.00',
        'lines' => [['method' => 'CASH', 'amount' => '100.00']],
    ], $adminUserId);
    $pay8c_2 = $paymentService->collectPayment($p8cId, [
        'amount' => '200.00',
        'lines' => [['method' => 'UPI', 'amount' => '200.00', 'reference_no' => 'UPI-8C']],
    ], $adminUserId);
    $p8cRow = $pdo->query("SELECT payment_status, payment_method FROM purchases WHERE id = {$p8cId}")->fetch();
    assertTest($p8cRow['payment_method'] === 'SPLIT', '8c-1: Two active payments with CASH and UPI yield payment_method = SPLIT');

    // Reverse the UPI payment -> only CASH remains
    $paymentService->reversePayment($p8cId, (int) $pay8c_2['payment']['id'], 'Reverse UPI portion', $adminUserId);
    $p8cRow2 = $pdo->query("SELECT payment_status, payment_method, paid_amount FROM purchases WHERE id = {$p8cId}")->fetch();
    assertTest($p8cRow2['payment_method'] === 'CASH' && $p8cRow2['paid_amount'] === '100.00', '8c-2: After reversing UPI, remaining payment_method is CASH');

    // 8d. Single -> add a different method -> SPLIT
    $p8dId = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '5', 'unit_cost' => '100.00', 'mrp' => '150.00', 'discount_amount' => '0.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '100.00',
        createdByUserId: $adminUserId,
        paymentMethod: 'CASH'
    );
    $createdPurchaseIds[] = $p8dId;
    $p8dRow = $pdo->query("SELECT payment_status, payment_method FROM purchases WHERE id = {$p8dId}")->fetch();
    assertTest($p8dRow['payment_method'] === 'CASH', '8d-1: Initial single CASH payment has payment_method = CASH');

    // Collect another payment with NETBANKING
    $paymentService->collectPayment($p8dId, [
        'amount' => '200.00',
        'lines' => [['method' => 'NETBANKING', 'amount' => '200.00', 'reference_no' => 'NET-8D']],
    ], $adminUserId);
    $p8dRow2 = $pdo->query("SELECT payment_status, payment_method FROM purchases WHERE id = {$p8dId}")->fetch();
    assertTest($p8dRow2['payment_method'] === 'SPLIT', '8d-2: Adding NETBANKING payment to CASH purchase transitions payment_method to SPLIT');


} finally {
    // Clean up created test data cleanly
    echo "\n--- Cleaning up test artifacts ---\n";
    foreach ($createdPurchaseIds as $pid) {
        $pdo->prepare("DELETE FROM purchase_payment_lines WHERE payment_id IN (SELECT id FROM purchase_payments WHERE purchase_id = :id)")->execute(['id' => $pid]);
        $pdo->prepare("DELETE FROM purchase_payments WHERE purchase_id = :id")->execute(['id' => $pid]);
        $pdo->prepare("DELETE FROM purchase_returns WHERE purchase_id = :id")->execute(['id' => $pid]);
        $pdo->prepare("DELETE FROM purchase_items WHERE purchase_id = :id")->execute(['id' => $pid]);
        $pdo->prepare("DELETE FROM supplier_ledger WHERE reference_id = :id AND reference_type = 'PURCHASE'")->execute(['id' => $pid]);
        $pdo->prepare("DELETE FROM purchases WHERE id = :id")->execute(['id' => $pid]);
    }
    foreach ($createdSupplierIds as $sid) {
        $pdo->prepare("DELETE FROM supplier_ledger WHERE supplier_id = :id")->execute(['id' => $sid]);
        $pdo->prepare("DELETE FROM suppliers WHERE id = :id")->execute(['id' => $sid]);
    }
    echo " Cleaned up {$passed} tests' database entries.\n";
}

echo "\n============================================\n";
echo "TEST RESULTS: Total Passed: {$passed} | Total Failed: {$failed}\n";
echo "============================================\n";

if ($failed > 0) {
    exit(1);
}
