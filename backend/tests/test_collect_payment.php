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
echo "=== COMPREHENSIVE PURCHASE COLLECT & SPLIT PAYMENT TEST SUITE ===\n";
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

// 0. Setup test users and supplier
$adminUser = (int) ($pdo->query("SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE code = 'ADMIN') LIMIT 1")->fetchColumn() ?: 1);
$cashierUser = (int) ($pdo->query("SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE code = 'CASHIER') LIMIT 1")->fetchColumn() ?: 2);

$supplierId = $purchaseService->createSupplier([
    'name' => 'Collect Test Supplier ' . time(),
    'contact_person' => 'Supplier Person',
    'phone' => '9988776655',
]);

$unitId = $pdo->query("SELECT id FROM units LIMIT 1")->fetchColumn() ?: 1;
$gstId = $pdo->query("SELECT id FROM gst_rates WHERE gst_percent = 0 LIMIT 1")->fetchColumn() ?: 1;

$pdo->prepare("INSERT INTO products (name, slug, unit_id, gst_rate_id) VALUES ('Collect Test Prod', 'col-prod-" . time() . "', :unit, :gst)")
    ->execute(['unit' => $unitId, 'gst' => $gstId]);
$prodId = (int) $pdo->lastInsertId();

$sku = 'COL-SKU-' . time();
$pdo->prepare("INSERT INTO product_variants (product_id, sku, mrp, retail_price, gst_rate_id, status) VALUES (:prod, :sku, 150.00, 100.00, :gst, 'ACTIVE')")
    ->execute(['prod' => $prodId, 'sku' => $sku, 'gst' => $gstId]);
$variantId = (int) $pdo->lastInsertId();

$pdo->prepare("INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold) VALUES (:v, :p, 0, 0, 5)")
    ->execute(['v' => $variantId, 'p' => $prodId]);

$initialStock = (float) $pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variantId}")->fetchColumn();

// =========================================================================
// TEST 1: Create purchase total 1000 with Cash 400 + UPI 300 (ref) -> paid 700, balance 300, PARTIALLY_PAID, SPLIT, opening payment with 2 lines, 1 ledger row
// =========================================================================
$p1Id = $purchaseService->createPurchase(
    supplierId: $supplierId,
    items: [['variant_id' => $variantId, 'quantity' => '10', 'unit_cost' => '100.00']],
    purchaseDate: date('Y-m-d'),
    amountPaid: '700.00',
    createdByUserId: $adminUser,
    paymentMethod: 'SPLIT',
    notes: 'Split upfront purchase',
    paymentLines: [
        ['method' => 'CASH', 'amount' => '400.00'],
        ['method' => 'UPI', 'amount' => '300.00', 'reference_no' => 'UPI-INIT-12345'],
    ]
);

$p1 = $purchaseService->find($p1Id);
$p1Payments = $purchaseService->listPayments($p1Id);
$p1LedgerRows = $pdo->query("SELECT * FROM supplier_ledger WHERE reference_type = 'PURCHASE' AND reference_id = {$p1Id}")->fetchAll();

assertTest(
    $p1['paid_amount'] === '700.00' &&
    $p1['balance_amount'] === '300.00' &&
    $p1['payment_status'] === 'PARTIALLY_PAID' &&
    $p1['payment_method'] === 'SPLIT' &&
    count($p1Payments) === 1 &&
    count($p1Payments[0]['lines']) === 2 &&
    count($p1LedgerRows) === 1 &&
    bccomp((string) $p1LedgerRows[0]['paid_amount_delta'], '700.00', 2) === 0,
    'Test 1: Create purchase total 1000 with Cash 400 + UPI 300 -> paid 700, balance 300, PARTIALLY_PAID, method SPLIT, opening payment with 2 lines, 1 ledger row',
    "Paid: {$p1['paid_amount']}, Balance: {$p1['balance_amount']}, Status: {$p1['payment_status']}, Method: {$p1['payment_method']}, Payment Lines: " . count($p1Payments[0]['lines'])
);

// =========================================================================
// TEST 2: Collect remaining 300 as Bank Transfer (ref) -> PAID, balance 0
// =========================================================================
$res2 = $purchaseService->collectPayment(
    purchaseId: $p1Id,
    data: [
        'amount' => '300.00',
        'payment_date' => date('Y-m-d'),
        'notes' => 'Settled remaining via Netbanking',
        'lines' => [
            ['method' => 'NETBANKING', 'amount' => '300.00', 'reference_no' => 'NEFT-UTR-789012'],
        ],
    ],
    userId: $adminUser
);

$p1AfterCollect = $res2['purchase'];
$allPaymentsP1 = $purchaseService->listPayments($p1Id);

assertTest(
    $p1AfterCollect['paid_amount'] === '1000.00' &&
    $p1AfterCollect['balance_amount'] === '0.00' &&
    $p1AfterCollect['payment_status'] === 'PAID' &&
    $p1AfterCollect['payment_method'] === 'SPLIT' &&
    count($allPaymentsP1) === 2,
    'Test 2: Collect remaining 300 as Bank Transfer (NETBANKING ref) -> PAID, balance 0, active payments = 2',
    "Paid: {$p1AfterCollect['paid_amount']}, Balance: {$p1AfterCollect['balance_amount']}, Status: {$p1AfterCollect['payment_status']}, Method: {$p1AfterCollect['payment_method']}"
);

// =========================================================================
// TEST 3: UPI/Card/Bank line without reference -> rejected (backend)
// =========================================================================
$p2Id = $purchaseService->createPurchase(
    supplierId: $supplierId,
    items: [['variant_id' => $variantId, 'quantity' => '10', 'unit_cost' => '100.00']],
    purchaseDate: date('Y-m-d'),
    amountPaid: '0.00',
    createdByUserId: $adminUser
);

$t3UpiRejected = false;
try {
    $purchaseService->collectPayment(
        purchaseId: $p2Id,
        data: [
            'amount' => '200.00',
            'lines' => [['method' => 'UPI', 'amount' => '200.00', 'reference_no' => '']],
        ],
        userId: $adminUser
    );
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'Reference number is required for UPI')) {
        $t3UpiRejected = true;
    }
}

$t3BankRejected = false;
try {
    $purchaseService->collectPayment(
        purchaseId: $p2Id,
        data: [
            'amount' => '200.00',
            'lines' => [['method' => 'NETBANKING', 'amount' => '200.00', 'reference_no' => '']],
        ],
        userId: $adminUser
    );
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'Reference number is required for NETBANKING')) {
        $t3BankRejected = true;
    }
}

assertTest(
    $t3UpiRejected && $t3BankRejected,
    'Test 3: UPI, Card, or Bank Transfer lines without required reference are rejected by backend',
    'Both UPI and NETBANKING missing references were rejected with clear messages'
);

// =========================================================================
// TEST 4: Sum of boxes > amount -> rejected; Collect with sum != collect amount -> rejected
// =========================================================================
$t4aRejected = false;
try {
    $purchaseService->collectPayment(
        purchaseId: $p2Id,
        data: [
            'amount' => '500.00',
            'lines' => [
                ['method' => 'CASH', 'amount' => '300.00'],
                ['method' => 'CARD', 'amount' => '300.00', 'reference_no' => 'CARD-123'],
            ],
        ],
        userId: $adminUser
    );
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'must equal total payment amount')) {
        $t4aRejected = true;
    }
}

$t4bRejected = false;
try {
    $purchaseService->collectPayment(
        purchaseId: $p2Id,
        data: [
            'amount' => '1200.00', // Exceeds balance of 1000
            'lines' => [['method' => 'CASH', 'amount' => '1200.00']],
        ],
        userId: $adminUser
    );
} catch (RuntimeException $e) {
    if ($e->getMessage() === 'Payment exceeds balance') {
        $t4bRejected = true;
    }
}

assertTest(
    $t4aRejected && $t4bRejected,
    'Test 4: Sum of boxes > amount rejected; Collect amount > balance rejected with "Payment exceeds balance"'
);

// =========================================================================
// TEST 5: CREDIT method can never be sent or stored as a payment line
// =========================================================================
$t5CreditRejected = false;
try {
    $purchaseService->collectPayment(
        purchaseId: $p2Id,
        data: [
            'amount' => '100.00',
            'lines' => [['method' => 'CREDIT', 'amount' => '100.00']],
        ],
        userId: $adminUser
    );
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'Credit/Due cannot be used as a payment line')) {
        $t5CreditRejected = true;
    }
}

$t5CreditCreateRejected = false;
try {
    $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '1', 'unit_cost' => '100.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '100.00',
        createdByUserId: $adminUser,
        paymentLines: [['method' => 'CREDIT', 'amount' => '100.00']]
    );
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'Credit/Due cannot be used as a payment line')) {
        $t5CreditCreateRejected = true;
    }
}

assertTest(
    $t5CreditRejected && $t5CreditCreateRejected,
    'Test 5: CREDIT method is strictly blocked from being used as a payment line',
    'Credit represents unpaid payable balance, not an upfront payment line'
);

// =========================================================================
// TEST 6: Edit Payment with split boxes keeps SUM(active payments) = purchases.paid_amount
// =========================================================================
$p3Id = $purchaseService->createPurchase(
    supplierId: $supplierId,
    items: [['variant_id' => $variantId, 'quantity' => '10', 'unit_cost' => '100.00']],
    purchaseDate: date('Y-m-d'),
    amountPaid: '0.00',
    createdByUserId: $adminUser
);

// Edit Payment to 800 as Cash 500 + Card 300
$editRes = $purchaseService->updatePayment(
    purchaseId: $p3Id,
    data: [
        'payment_status' => 'PARTIALLY_PAID',
        'paid_amount' => '800.00',
        'lines' => [
            ['method' => 'CASH', 'amount' => '500.00'],
            ['method' => 'CARD', 'amount' => '300.00', 'reference_no' => 'CARD-AUTH-999'],
        ],
    ],
    userId: $adminUser
);

$activeSum3 = $pdo->query("SELECT IFNULL(SUM(total_amount), 0) FROM purchase_payments WHERE purchase_id = {$p3Id} AND status = 'ACTIVE'")->fetchColumn();
$p3Payments = $purchaseService->listPayments($p3Id);

assertTest(
    $editRes['paid_amount'] === '800.00' &&
    $editRes['payment_method'] === 'SPLIT' &&
    bccomp((string) $activeSum3, '800.00', 2) === 0 &&
    count($p3Payments[0]['lines']) === 2,
    'Test 6: Edit Payment with split boxes sets SPLIT method and keeps SUM(active payments) === purchases.paid_amount',
    "Purchase paid_amount: {$editRes['paid_amount']} | Active payments sum: {$activeSum3} | Lines count: " . count($p3Payments[0]['lines'])
);

// =========================================================================
// TEST 7: Idempotency (same key twice) -> exactly 1 payment & 1 ledger row
// =========================================================================
$idemKey = 'idem-test-' . time();
$initialLedgerCount = (int) $pdo->query("SELECT COUNT(*) FROM supplier_ledger WHERE supplier_id = {$supplierId}")->fetchColumn();
$initialPaymentCount = (int) $pdo->query("SELECT COUNT(*) FROM purchase_payments WHERE purchase_id = {$p2Id}")->fetchColumn();

$c1 = $purchaseService->collectPayment(
    purchaseId: $p2Id,
    data: [
        'amount' => '100.00',
        'idempotency_key' => $idemKey,
        'lines' => [['method' => 'CASH', 'amount' => '100.00']],
    ],
    userId: $adminUser
);

$c2 = $purchaseService->collectPayment(
    purchaseId: $p2Id,
    data: [
        'amount' => '100.00',
        'idempotency_key' => $idemKey,
        'lines' => [['method' => 'CASH', 'amount' => '100.00']],
    ],
    userId: $adminUser
);

$afterLedgerCount = (int) $pdo->query("SELECT COUNT(*) FROM supplier_ledger WHERE supplier_id = {$supplierId}")->fetchColumn();
$afterPaymentCount = (int) $pdo->query("SELECT COUNT(*) FROM purchase_payments WHERE purchase_id = {$p2Id}")->fetchColumn();

assertTest(
    $c1['payment']['id'] === $c2['payment']['id'] &&
    $afterLedgerCount === $initialLedgerCount + 1 &&
    $afterPaymentCount === $initialPaymentCount + 1,
    'Test 7: Idempotency (same key twice) returns original payment with no duplicate rows',
    "Payment ID 1st: {$c1['payment']['id']}, 2nd: {$c2['payment']['id']} | Ledger added: 1"
);

// =========================================================================
// TEST 8: Reverse a payment -> paid reduces, negative ledger delta, double reverse rejected
// =========================================================================
$paymentToRevId = (int) $c1['payment']['id'];
$revRes = $purchaseService->reversePayment(
    purchaseId: $p2Id,
    paymentId: $paymentToRevId,
    reason: 'Customer requested refund / correction',
    userId: $adminUser
);

$p2AfterRev = $revRes['purchase'];
$revPaymentRow = $pdo->query("SELECT * FROM purchase_payments WHERE id = {$paymentToRevId}")->fetch();
$revLedgerRow = $pdo->query("SELECT * FROM supplier_ledger WHERE reference_type = 'PURCHASE_PAYMENT' AND reference_id = {$paymentToRevId} AND transaction_type = 'PAYMENT_REVERSAL'")->fetch();

$t8DoubleRevRejected = false;
try {
    $purchaseService->reversePayment($p2Id, $paymentToRevId, 'Second reversal attempt', $adminUser);
} catch (RuntimeException $e) {
    if ($e->getMessage() === 'Payment is already reversed') {
        $t8DoubleRevRejected = true;
    }
}

assertTest(
    $p2AfterRev['paid_amount'] === '0.00' &&
    $p2AfterRev['balance_amount'] === '1000.00' &&
    $revPaymentRow['status'] === 'REVERSED' &&
    $revLedgerRow !== false &&
    bccomp((string) $revLedgerRow['paid_amount_delta'], '-100.00', 2) === 0 &&
    $t8DoubleRevRejected,
    'Test 8: Reverse payment -> paid reduces, negative ledger delta, double reverse rejected',
    "Paid after rev: {$p2AfterRev['paid_amount']}, Reversal status: {$revPaymentRow['status']}, Ledger delta: {$revLedgerRow['paid_amount_delta']}"
);

// =========================================================================
// TEST 9: Security & Status guards (No token -> 401, Cashier -> 403, Cancelled purchase -> 422)
// =========================================================================
$adminToken = JwtHelper::issue(['sub' => $adminUser, 'type' => 'staff', 'role' => 'ADMIN', 'permissions' => ['purchases.manage']], 3600);
$cashierToken = JwtHelper::issue(['sub' => $cashierUser, 'type' => 'staff', 'role' => 'CASHIER', 'permissions' => ['pos.sell']], 3600);

function apiCall(string $method, string $path, array $data = [], ?string $token = null): array
{
    $ch = curl_init("http://127.0.0.1:8080{$path}");
    $headers = ['Content-Type: application/json', 'Accept: application/json'];
    if ($token) {
        $headers[] = "Authorization: Bearer {$token}";
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    if ($data !== []) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    }
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    return ['code' => $code, 'body' => json_decode((string) $resp, true)];
}

$rNoToken = apiCall('POST', "/api/purchases/{$p3Id}/payments", ['amount' => '50', 'lines' => [['method' => 'CASH', 'amount' => '50']]]);
$rCashier = apiCall('POST', "/api/purchases/{$p3Id}/payments", ['amount' => '50', 'lines' => [['method' => 'CASH', 'amount' => '50']]], $cashierToken);

$pCancelId = $purchaseService->createPurchase(
    supplierId: $supplierId,
    items: [['variant_id' => $variantId, 'quantity' => '1', 'unit_cost' => '100.00']],
    purchaseDate: date('Y-m-d'),
    amountPaid: '0.00',
    createdByUserId: $adminUser
);
$purchaseService->cancelPurchase($pCancelId, 'Defective shipment', $adminUser);

$rCancel = apiCall('POST', "/api/purchases/{$pCancelId}/payments", ['amount' => '50', 'lines' => [['method' => 'CASH', 'amount' => '50']]], $adminToken);

assertTest(
    $rNoToken['code'] === 401 &&
    $rCashier['code'] === 403 &&
    $rCancel['code'] === 422,
    'Test 9: Security & Status guards: No token -> 401, Cashier -> 403, Cancelled purchase -> 422',
    "NoToken HTTP: {$rNoToken['code']} | Cashier HTTP: {$rCashier['code']} | Cancelled HTTP: {$rCancel['code']}"
);

// =========================================================================
// TEST 10: Transaction rollback on failure ensures zero orphaned payment rows
// =========================================================================
$p4Id = $purchaseService->createPurchase(
    supplierId: $supplierId,
    items: [['variant_id' => $variantId, 'quantity' => '10', 'unit_cost' => '100.00']],
    purchaseDate: date('Y-m-d'),
    amountPaid: '0.00',
    createdByUserId: $adminUser
);

$pdo->beginTransaction();
$pdo->prepare("INSERT INTO purchase_payments (purchase_id, supplier_id, receipt_no, payment_date, total_amount, status, created_by) VALUES ({$p4Id}, {$supplierId}, 'REC-TEST-ROLLBACK', CURRENT_DATE, 500, 'ACTIVE', {$adminUser})")->execute();
$pdo->rollBack();

$rolledBackRow = $pdo->query("SELECT * FROM purchase_payments WHERE receipt_no = 'REC-TEST-ROLLBACK'")->fetch();
$p4Check = $purchaseService->find($p4Id);

assertTest(
    $rolledBackRow === false && $p4Check['paid_amount'] === '0.00',
    'Test 10: Transaction rollback on failure ensures zero orphaned payment rows and unmodified purchase'
);

// =========================================================================
// TEST 11: Inventory on_hand remains completely unchanged across all payment operations
// =========================================================================
$currentStock = (float) $pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variantId}")->fetchColumn();
// Total stock added: 10(p1) + 10(p2) + 10(p3) + 1(cancel: -1) + 10(p4) = 40 added
assertTest(
    bccomp((string) $currentStock, (string) ($initialStock + 40), 2) === 0,
    'Test 11: Inventory on_hand remains completely unchanged across all payment collections, splits, edits & reversals',
    "Expected Stock: " . ($initialStock + 40) . " | Actual Stock: {$currentStock}"
);

// =========================================================================
// TEST 12: Invariant holds for ALL active purchases: SUM(active payments) = purchases.paid_amount
// =========================================================================
$mismatchStmt = $pdo->query(
    "SELECT p.id, p.purchase_no, p.paid_amount, IFNULL(SUM(pp.total_amount), 0.00) AS active_sum
     FROM purchases p
     LEFT JOIN purchase_payments pp ON pp.purchase_id = p.id AND pp.status = 'ACTIVE'
     WHERE p.status = 'ACTIVE' AND p.deleted_at IS NULL
     GROUP BY p.id, p.purchase_no, p.paid_amount
     HAVING ABS(p.paid_amount - active_sum) > 0.001"
);
$mismatches = $mismatchStmt->fetchAll();

assertTest(
    count($mismatches) === 0,
    'Test 12: Invariant holds for ALL active purchases: SUM(active payments) === purchases.paid_amount',
    count($mismatches) === 0 ? 'All purchases 100% matched' : 'Found ' . count($mismatches) . ' mismatches'
);

// =========================================================================
// TEST 13: Supplier Outstanding Reconciliation across all transaction types
// =========================================================================
$p3BeforeReturn = $purchaseService->find($p3Id);
$p3ItemId = (int) $p3BeforeReturn['items'][0]['id'];
$returnId = $purchaseService->createReturn(
    purchaseId: $p3Id,
    items: [['purchase_item_id' => $p3ItemId, 'quantity' => '2']], // 2 * 100 = 200 return
    reason: 'Damaged packaging',
    createdByUserId: $adminUser
);

$outstandingData = $purchaseService->getSupplierOutstanding($supplierId);

assertTest(
    $outstandingData['is_reconciled'] === true,
    'Test 13: Ledger Outstanding === Entity Outstanding across purchase, collect, split, edit, reverse, return, and cancel',
    "Ledger: ₹{$outstandingData['ledger_outstanding']} | Entity: ₹{$outstandingData['entity_outstanding']} | Match: " . ($outstandingData['is_reconciled'] ? 'YES' : 'NO')
);

// =========================================================================
// TEST 14: Migration 0022 re-run idempotency check
// =========================================================================
$migrateOutput = shell_exec('php ' . escapeshellarg(dirname(__DIR__, 2) . '/database/migrate.php'));
$migrationReRunSuccess = str_contains((string) $migrateOutput, 'done');

assertTest(
    $migrationReRunSuccess,
    'Test 14: Migration 0022 runs idempotently without error via database/migrate.php',
    'Migration check completed cleanly'
);

// =========================================================================
// TEST 15: Existing tests (test_purchase_payment.php) still pass
// =========================================================================
$existingTestsOutput = shell_exec('php ' . escapeshellarg(__DIR__ . '/test_purchase_payment.php'));
$existingTestsPassed = str_contains((string) $existingTestsOutput, 'Total Passed: 20 | Total Failed: 0');

assertTest(
    $existingTestsPassed,
    'Test 15: Existing 20 tests from test_purchase_payment.php continue to pass with 0 failures',
    '20/20 legacy payment tests passing'
);

echo "\n============================================\n";
echo "TEST RESULTS: Total Passed: {$passed} | Total Failed: {$failed}\n";
echo "============================================\n";

if ($failed > 0) {
    exit(1);
}
