<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config/database.php';

use App\Helpers\JwtHelper;
use App\Services\InventoryService;
use App\Services\PaymentService;
use App\Services\PurchaseService;

$pdo = db();
$inventory = new InventoryService($pdo);
$payments = new PaymentService($pdo);
$purchaseService = new PurchaseService($pdo, $inventory, $payments);

echo "=================================================================\n";
echo "=== STEP 3: TEST SUITE - BACKEND FLAGS & PAYMENT FLOW VERIFY ===\n";
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

// 1. Setup supplier, product, variant
$supplierId = (int) $pdo->query("SELECT id FROM suppliers WHERE status = 'ACTIVE' AND deleted_at IS NULL LIMIT 1")->fetchColumn();
$variant = $pdo->query("SELECT v.id AS variant_id, v.product_id, v.sku FROM product_variants v WHERE v.status = 'ACTIVE' AND v.deleted_at IS NULL LIMIT 1")->fetch(PDO::FETCH_ASSOC);

// Create fresh test purchases for: Active Unpaid, Active Partially Paid, Active Paid, Cancelled, Deleted
echo "--- 1. Testing API Flags for All States ---\n";

// 1a. Active Unpaid
$pUnpaidId = $purchaseService->createPurchase(
    supplierId: $supplierId,
    items: [['variant_id' => (int) $variant['variant_id'], 'quantity' => '1', 'unit_cost' => '500.00']],
    purchaseDate: date('Y-m-d'),
    amountPaid: '0.00',
    createdByUserId: 1,
    paymentMethod: null
);
$pUnpaid = $purchaseService->find($pUnpaidId);
assertTest(
    $pUnpaid['can_collect_payment'] === true && $pUnpaid['can_edit_payment'] === true && $pUnpaid['disabled_reason'] === null,
    "Active Unpaid flags correct",
    "can_collect: " . json_encode($pUnpaid['can_collect_payment']) . ", can_edit: " . json_encode($pUnpaid['can_edit_payment']) . ", disabled_reason: " . json_encode($pUnpaid['disabled_reason'])
);

// 1b. Active Partially Paid
$pPartId = $purchaseService->createPurchase(
    supplierId: $supplierId,
    items: [['variant_id' => (int) $variant['variant_id'], 'quantity' => '1', 'unit_cost' => '500.00']],
    purchaseDate: date('Y-m-d'),
    amountPaid: '200.00',
    createdByUserId: 1,
    paymentMethod: 'CASH'
);
$pPart = $purchaseService->find($pPartId);
assertTest(
    $pPart['can_collect_payment'] === true && $pPart['can_edit_payment'] === true && $pPart['disabled_reason'] === null,
    "Active Partially Paid flags correct",
    "can_collect: " . json_encode($pPart['can_collect_payment']) . ", can_edit: " . json_encode($pPart['can_edit_payment']) . ", disabled_reason: " . json_encode($pPart['disabled_reason'])
);

// 1c. Active Paid
$pPaidId = $purchaseService->createPurchase(
    supplierId: $supplierId,
    items: [['variant_id' => (int) $variant['variant_id'], 'quantity' => '1', 'unit_cost' => '500.00']],
    purchaseDate: date('Y-m-d'),
    amountPaid: '500.00',
    createdByUserId: 1,
    paymentMethod: 'UPI',
    paymentLines: [['method' => 'UPI', 'amount' => '500.00', 'reference_no' => 'REF-PAID-TEST']]
);
$pPaid = $purchaseService->find($pPaidId);
assertTest(
    $pPaid['can_collect_payment'] === false && $pPaid['can_edit_payment'] === true && $pPaid['disabled_reason'] === 'Already fully paid',
    "Active Paid flags correct",
    "can_collect: " . json_encode($pPaid['can_collect_payment']) . ", can_edit: " . json_encode($pPaid['can_edit_payment']) . ", disabled_reason: " . json_encode($pPaid['disabled_reason'])
);

// 1d. Cancelled Purchase
$pCancelId = $purchaseService->createPurchase(
    supplierId: $supplierId,
    items: [['variant_id' => (int) $variant['variant_id'], 'quantity' => '1', 'unit_cost' => '500.00']],
    purchaseDate: date('Y-m-d'),
    amountPaid: '0.00',
    createdByUserId: 1
);
$purchaseService->cancelPurchase($pCancelId, 'Testing cancel flags', 1);
$pCancel = $purchaseService->find($pCancelId);
assertTest(
    $pCancel['can_collect_payment'] === false && $pCancel['can_edit_payment'] === false && $pCancel['disabled_reason'] === 'Purchase is cancelled',
    "Cancelled flags correct",
    "can_collect: " . json_encode($pCancel['can_collect_payment']) . ", can_edit: " . json_encode($pCancel['can_edit_payment']) . ", disabled_reason: " . json_encode($pCancel['disabled_reason'])
);

// 1e. Deleted Purchase flag decoration check
$deletedSample = PurchaseService::decorateFlags(['status' => 'ACTIVE', 'deleted_at' => date('Y-m-d H:i:s'), 'balance_amount' => '500.00']);
assertTest(
    $deletedSample['can_collect_payment'] === false && $deletedSample['can_edit_payment'] === false && $deletedSample['disabled_reason'] === 'Purchase is deleted',
    "Deleted flags correct",
    "can_collect: " . json_encode($deletedSample['can_collect_payment']) . ", can_edit: " . json_encode($deletedSample['can_edit_payment']) . ", disabled_reason: " . json_encode($deletedSample['disabled_reason'])
);

// 2. HTTP Endpoint Security & Validation Checks
echo "\n--- 2. HTTP Endpoint Guards (422, 403, 401) ---\n";
$adminToken = JwtHelper::issue(['sub' => 1, 'type' => 'staff', 'email' => 'admin@test.com', 'role' => 'ADMIN', 'permissions' => ['purchases.manage']], 3600);
$cashierToken = JwtHelper::issue(['sub' => 2, 'type' => 'staff', 'email' => 'cashier@test.com', 'role' => 'CASHIER', 'permissions' => ['purchases.manage']], 3600);

function apiCall(string $method, string $path, array $data = [], ?string $token = null): array {
    $ch = curl_init("http://127.0.0.1:8080/api" . $path);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    $headers = ['Content-Type: application/json'];
    if ($token) {
        $headers[] = "Authorization: Bearer {$token}";
    }
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    if (!empty($data)) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    }
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    return ['code' => $code, 'body' => json_decode($res ?: '{}', true)];
}

// 2a. Collect on cancelled -> 422
$res2a = apiCall('POST', "/purchases/{$pCancelId}/payments", ['amount' => '100.00', 'lines' => [['method' => 'CASH', 'amount' => '100.00']]], $adminToken);
assertTest($res2a['code'] === 422, "Collect on cancelled purchase returns HTTP 422", "HTTP Code: {$res2a['code']} - " . ($res2a['body']['error'] ?? ''));

// 2b. Edit on cancelled -> 422
$res2b = apiCall('PATCH', "/purchases/{$pCancelId}/payment", ['payment_status' => 'PAID', 'payment_method' => 'CASH'], $adminToken);
assertTest($res2b['code'] === 422, "Edit on cancelled purchase returns HTTP 422", "HTTP Code: {$res2b['code']} - " . ($res2b['body']['error'] ?? ''));

// 2c. Cashier attempt on Collect -> 403
$res2c = apiCall('POST', "/purchases/{$pUnpaidId}/payments", ['amount' => '100.00', 'lines' => [['method' => 'CASH', 'amount' => '100.00']]], $cashierToken);
assertTest($res2c['code'] === 403, "Cashier role on Collect returns HTTP 403", "HTTP Code: {$res2c['code']} - " . ($res2c['body']['error'] ?? ''));

// 2d. Cashier attempt on Edit -> 403
$res2d = apiCall('PATCH', "/purchases/{$pUnpaidId}/payment", ['payment_status' => 'PAID', 'payment_method' => 'CASH'], $cashierToken);
assertTest($res2d['code'] === 403, "Cashier role on Edit returns HTTP 403", "HTTP Code: {$res2d['code']} - " . ($res2d['body']['error'] ?? ''));

// 2e. No token -> 401
$res2e = apiCall('POST', "/purchases/{$pUnpaidId}/payments", ['amount' => '100.00', 'lines' => [['method' => 'CASH', 'amount' => '100.00']]]);
assertTest($res2e['code'] === 401, "No token on payment action returns HTTP 401", "HTTP Code: {$res2e['code']}");

// 3. Edit Payment full round-trip (Unpaid -> Partially Paid -> Paid -> Unpaid)
echo "\n--- 3. Edit Payment Round-Trip & Consistency Checks ---\n";
$pEditId = $purchaseService->createPurchase(
    supplierId: $supplierId,
    items: [['variant_id' => (int) $variant['variant_id'], 'quantity' => '1', 'unit_cost' => '600.00']],
    purchaseDate: date('Y-m-d'),
    amountPaid: '0.00',
    createdByUserId: 1
);

// Unpaid -> Partially Paid (250/600)
$res3a = apiCall('PATCH', "/purchases/{$pEditId}/payment", [
    'payment_status' => 'PARTIALLY_PAID',
    'paid_amount' => '250.00',
    'payment_method' => 'UPI',
    'lines' => [['method' => 'UPI', 'amount' => '250.00', 'reference_no' => 'UPI-ROUNDTRIP-1']]
], $adminToken);
$get3a = apiCall('GET', "/purchases/{$pEditId}", [], $adminToken);
assertTest(
    $res3a['code'] === 200 && $get3a['body']['purchase']['paid_amount'] === '250.00' && $get3a['body']['purchase']['balance_amount'] === '350.00' && $get3a['body']['purchase']['payment_status'] === 'PARTIALLY_PAID',
    "Step 3a: Unpaid -> Partially Paid (250/600) persisted",
    "Paid: {$get3a['body']['purchase']['paid_amount']}, Balance: {$get3a['body']['purchase']['balance_amount']}, Status: {$get3a['body']['purchase']['payment_status']}"
);

// Partially Paid -> Paid (600/600)
$res3b = apiCall('PATCH', "/purchases/{$pEditId}/payment", [
    'payment_status' => 'PAID',
    'payment_method' => 'CASH'
], $adminToken);
$get3b = apiCall('GET', "/purchases/{$pEditId}", [], $adminToken);
assertTest(
    $res3b['code'] === 200 && $get3b['body']['purchase']['paid_amount'] === '600.00' && $get3b['body']['purchase']['balance_amount'] === '0.00' && $get3b['body']['purchase']['payment_status'] === 'PAID',
    "Step 3b: Partially Paid -> Paid (600/600) persisted",
    "Paid: {$get3b['body']['purchase']['paid_amount']}, Balance: {$get3b['body']['purchase']['balance_amount']}, Status: {$get3b['body']['purchase']['payment_status']}"
);

// Paid -> Unpaid (0/600)
$res3c = apiCall('PATCH', "/purchases/{$pEditId}/payment", [
    'payment_status' => 'UNPAID'
], $adminToken);
$get3c = apiCall('GET', "/purchases/{$pEditId}", [], $adminToken);
assertTest(
    $res3c['code'] === 200 && $get3c['body']['purchase']['paid_amount'] === '0.00' && $get3c['body']['purchase']['balance_amount'] === '600.00' && $get3c['body']['purchase']['payment_status'] === 'UNPAID',
    "Step 3c: Paid -> Unpaid (0/600) persisted",
    "Paid: {$get3c['body']['purchase']['paid_amount']}, Balance: {$get3c['body']['purchase']['balance_amount']}, Status: {$get3c['body']['purchase']['payment_status']}"
);

// Run Q1, Q2, Q3 consistency check after all operations
echo "\n--- 4. Running Consistency Invariant Queries (Q1-Q3) ---\n";

$q1 = $pdo->query("
    SELECT id, purchase_no, status, grand_total, paid_amount, balance_amount, payment_status
    FROM purchases
    WHERE status = 'ACTIVE' AND deleted_at IS NULL AND (
        (payment_status = 'PAID' AND (paid_amount != grand_total OR balance_amount != 0)) OR
        (payment_status = 'UNPAID' AND paid_amount != 0) OR
        (payment_status = 'PARTIALLY_PAID' AND (paid_amount <= 0 OR paid_amount >= grand_total)) OR
        (ROUND(balance_amount, 2) != ROUND(grand_total - paid_amount, 2))
    )
")->fetchAll(PDO::FETCH_ASSOC);
assertTest(count($q1) === 0, "Q1 Invariant: Status vs Amounts holds with 0 mismatches", "Found: " . count($q1));

$q2 = $pdo->query("
    SELECT p.id, p.purchase_no, p.paid_amount, COALESCE(SUM(pp.total_amount), 0) AS active_payments_sum
    FROM purchases p
    LEFT JOIN purchase_payments pp ON pp.purchase_id = p.id AND pp.status = 'ACTIVE'
    GROUP BY p.id, p.purchase_no, p.paid_amount
    HAVING ROUND(p.paid_amount, 2) != ROUND(active_payments_sum, 2)
")->fetchAll(PDO::FETCH_ASSOC);
assertTest(count($q2) === 0, "Q2 Invariant: purchases.paid_amount = SUM(ACTIVE payments) holds with 0 mismatches", "Found: " . count($q2));

$q3 = $pdo->query("
    SELECT pp.id, pp.purchase_id, pp.receipt_no, pp.total_amount, COALESCE(SUM(ppl.amount), 0) AS lines_sum
    FROM purchase_payments pp
    LEFT JOIN purchase_payment_lines ppl ON ppl.payment_id = pp.id
    GROUP BY pp.id, pp.purchase_id, pp.receipt_no, pp.total_amount
    HAVING ROUND(pp.total_amount, 2) != ROUND(lines_sum, 2)
")->fetchAll(PDO::FETCH_ASSOC);
assertTest(count($q3) === 0, "Q3 Invariant: payment.total_amount = SUM(lines.amount) holds with 0 mismatches", "Found: " . count($q3));

echo "\n============================================\n";
echo "TEST RESULTS: Total Passed: {$passed} | Total Failed: {$failed}\n";
echo "============================================\n";
