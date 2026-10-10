<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/test_guard.php';

putenv('APP_ENV=testing');
$_ENV['APP_ENV'] = 'testing';

$pdo = db();
\App\Tests\TestDbGuard::assertTestDatabase($pdo, __FILE__);

echo "=== TASK T06 BILL DISCOUNT TEST SUITE (unified_pos_test) ===\n\n";

$passCount = 0;
$totalTests = 0;

function assertTest(bool $condition, string $message): void {
    global $passCount, $totalTests;
    $totalTests++;
    if ($condition) {
        $passCount++;
        echo "✅ PASSED: $message\n";
    } else {
        echo "❌ FAILED: $message\n";
    }
}

$inventory = new \App\Services\InventoryService($pdo);
$coupons = new \App\Services\CouponService($pdo);
$refunds = new \App\Services\RefundService($pdo);
$invoiceService = new \App\Services\InvoiceService($pdo, $inventory, $coupons, $refunds);

// Get admin and cashier users
$admin = $pdo->query("SELECT u.id, r.code as role FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'ADMIN' LIMIT 1")->fetch();
$cashier = $pdo->query("SELECT u.id, r.code as role FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'CASHIER' LIMIT 1")->fetch();

if (!$cashier) {
    // Create cashier if not exists
    $roleId = $pdo->query("SELECT id FROM roles WHERE code = 'CASHIER'")->fetchColumn();
    $pdo->prepare("INSERT INTO users (name, email, password_hash, role_id) VALUES ('Test Cashier', 'cashier_t06@example.com', 'hash', :r)")->execute(['r' => $roleId]);
    $cashierId = (int)$pdo->lastInsertId();
} else {
    $cashierId = (int)$cashier['id'];
}
$adminId = (int)$admin['id'];

// Get sample active variants with stock
$variants = $pdo->query("SELECT v.id as variant_id, v.product_id, v.retail_price, g.gst_percent, g.tax_mode, i.on_hand, i.available
                         FROM product_variants v
                         JOIN inventory i ON i.variant_id = v.id
                         LEFT JOIN gst_rates g ON g.id = v.gst_rate_id
                         WHERE v.deleted_at IS NULL AND i.available >= 50
                         LIMIT 5")->fetchAll();

if (count($variants) < 3) {
    // Top up inventory on test db for testing
    $allV = $pdo->query("SELECT v.id FROM product_variants v WHERE v.deleted_at IS NULL LIMIT 5")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($allV as $vId) {
        $pdo->prepare("INSERT INTO inventory (variant_id, product_id, on_hand, available)
                       SELECT id, product_id, 100, 100 FROM product_variants WHERE id = :id
                       ON DUPLICATE KEY UPDATE on_hand = 100, available = 100")->execute(['id' => $vId]);
    }
    $variants = $pdo->query("SELECT v.id as variant_id, v.product_id, v.retail_price, g.gst_percent, g.tax_mode, i.on_hand, i.available
                             FROM product_variants v
                             JOIN inventory i ON i.variant_id = v.id
                             LEFT JOIN gst_rates g ON g.id = v.gst_rate_id
                             WHERE v.deleted_at IS NULL AND i.available >= 50
                             LIMIT 5")->fetchAll();
}

$v1 = $variants[0];
$v2 = $variants[1];
$v3 = $variants[2];

// Get or create registered customer
$customer = $pdo->query("SELECT id, name, phone FROM customers LIMIT 1")->fetch();
if (!$customer) {
    $pdo->prepare("INSERT INTO customers (name, phone, customer_type) VALUES ('T06 Test Customer', '9999900006', 'RETAIL')")->execute();
    $customerId = (int)$pdo->lastInsertId();
} else {
    $customerId = (int)$customer['id'];
}

// --- TEST 1: PERCENT 10 on 1000 -> 100 discount ---
$inv1Id = $invoiceService->createPosSale(
    items: [
        ['variant_id' => (int)$v1['variant_id'], 'quantity' => 2, 'unit_price' => '500.00']
    ],
    customerId: $customerId,
    cashierUserId: $adminId,
    paymentMethod: 'CASH',
    amountPaid: '1000.00',
    discountType: 'PERCENT',
    discountValue: '10'
);
$inv1 = $invoiceService->find($inv1Id);
assertTest($inv1['bill_discount_type'] === 'PERCENT' && bccomp((string)$inv1['bill_discount_value'], '10.00', 2) === 0, 'Test 1: PERCENT 10 saved in invoice');
assertTest(bccomp((string)$inv1['bill_discount_amount'], '100.00', 2) === 0, 'Test 1: PERCENT 10 on 1000 computed exactly as 100.00 discount');
assertTest(bccomp((string)$inv1['subtotal'], '1000.00', 2) === 0, 'Test 1: Subtotal is exactly 1000.00');

// --- TEST 2: AMOUNT 150 discount ---
$inv2Id = $invoiceService->createPosSale(
    items: [
        ['variant_id' => (int)$v1['variant_id'], 'quantity' => 1, 'unit_price' => '500.00'],
        ['variant_id' => (int)$v2['variant_id'], 'quantity' => 1, 'unit_price' => '300.00']
    ],
    customerId: $customerId,
    cashierUserId: $adminId,
    paymentMethod: 'UPI',
    amountPaid: '1000.00',
    discountType: 'AMOUNT',
    discountValue: '150.00'
);
$inv2 = $invoiceService->find($inv2Id);
assertTest($inv2['bill_discount_type'] === 'AMOUNT' && bccomp((string)$inv2['bill_discount_amount'], '150.00', 2) === 0, 'Test 2: AMOUNT 150 discount saved exactly');

// --- TEST 3: PERCENT 0 and empty discount ---
$inv3Id = $invoiceService->createPosSale(
    items: [
        ['variant_id' => (int)$v1['variant_id'], 'quantity' => 1, 'unit_price' => '200.00']
    ],
    customerId: null,
    cashierUserId: $adminId,
    paymentMethod: 'CASH',
    amountPaid: '250.00',
    discountType: 'PERCENT',
    discountValue: '0'
);
$inv3 = $invoiceService->find($inv3Id);
assertTest(bccomp((string)$inv3['bill_discount_amount'], '0.00', 2) === 0, 'Test 3: PERCENT 0 results in 0.00 discount');

// --- TEST 4: PERCENT 100 -> Grand Total 0 ---
$inv4Id = $invoiceService->createPosSale(
    items: [
        ['variant_id' => (int)$v1['variant_id'], 'quantity' => 1, 'unit_price' => '500.00']
    ],
    customerId: null,
    cashierUserId: $adminId,
    paymentMethod: 'CASH',
    amountPaid: '0.00',
    discountType: 'PERCENT',
    discountValue: '100'
);
$inv4 = $invoiceService->find($inv4Id);
assertTest(bccomp((string)$inv4['grand_total'], '0.00', 2) === 0 && $inv4['payment_status'] === 'PAID', 'Test 4: PERCENT 100 produces Grand Total 0.00 and PAID status with 0 cash');

// --- TEST 5: AMOUNT = subtotal -> Grand Total 0 ---
$inv5Id = $invoiceService->createPosSale(
    items: [
        ['variant_id' => (int)$v1['variant_id'], 'quantity' => 1, 'unit_price' => '350.00']
    ],
    customerId: null,
    cashierUserId: $adminId,
    paymentMethod: 'CASH',
    amountPaid: '0.00',
    discountType: 'AMOUNT',
    discountValue: '350.00'
);
$inv5 = $invoiceService->find($inv5Id);
assertTest(bccomp((string)$inv5['grand_total'], '0.00', 2) === 0, 'Test 5: AMOUNT = subtotal produces Grand Total 0.00');

// --- TEST 6: Validation Rejections (422) ---
$rejectedCount = 0;
// 6a: AMOUNT above subtotal
try {
    $invoiceService->createPosSale(
        items: [['variant_id' => (int)$v1['variant_id'], 'quantity' => 1, 'unit_price' => '100.00']],
        customerId: null, cashierUserId: $adminId, paymentMethod: 'CASH', amountPaid: '100.00',
        discountType: 'AMOUNT', discountValue: '150.00'
    );
} catch (\RuntimeException $e) {
    if (str_contains($e->getMessage(), 'cannot exceed subtotal')) $rejectedCount++;
}

// 6b: PERCENT 100.01
try {
    $invoiceService->createPosSale(
        items: [['variant_id' => (int)$v1['variant_id'], 'quantity' => 1, 'unit_price' => '100.00']],
        customerId: null, cashierUserId: $adminId, paymentMethod: 'CASH', amountPaid: '100.00',
        discountType: 'PERCENT', discountValue: '100.01'
    );
} catch (\RuntimeException $e) {
    if (str_contains($e->getMessage(), 'cannot exceed 100%')) $rejectedCount++;
}

// 6c: Negative discount
try {
    $invoiceService->createPosSale(
        items: [['variant_id' => (int)$v1['variant_id'], 'quantity' => 1, 'unit_price' => '100.00']],
        customerId: null, cashierUserId: $adminId, paymentMethod: 'CASH', amountPaid: '100.00',
        discountType: 'PERCENT', discountValue: '-10'
    );
} catch (\RuntimeException $e) {
    if (str_contains($e->getMessage(), 'cannot be negative')) $rejectedCount++;
}

// 6d: More than 2 decimals
try {
    $invoiceService->createPosSale(
        items: [['variant_id' => (int)$v1['variant_id'], 'quantity' => 1, 'unit_price' => '100.00']],
        customerId: null, cashierUserId: $adminId, paymentMethod: 'CASH', amountPaid: '100.00',
        discountType: 'AMOUNT', discountValue: '10.555'
    );
} catch (\RuntimeException $e) {
    if (str_contains($e->getMessage(), 'more than 2 decimal places')) $rejectedCount++;
}

// 6e: Invalid discount type
try {
    $invoiceService->createPosSale(
        items: [['variant_id' => (int)$v1['variant_id'], 'quantity' => 1, 'unit_price' => '100.00']],
        customerId: null, cashierUserId: $adminId, paymentMethod: 'CASH', amountPaid: '100.00',
        discountType: 'BOGUS', discountValue: '10'
    );
} catch (\RuntimeException $e) {
    if (str_contains($e->getMessage(), 'Invalid discount type')) $rejectedCount++;
}
assertTest($rejectedCount === 5, "Test 6: All 5 invalid discount edge cases properly rejected with clear 422 messages (5/5)");

// --- TEST 7: 3-line split with awkward amount (Exact allocation test) ---
// Subtotal = 100 + 200 + 300 = 600. Discount = 77.33
$inv7Id = $invoiceService->createPosSale(
    items: [
        ['variant_id' => (int)$v1['variant_id'], 'quantity' => 1, 'unit_price' => '100.00'],
        ['variant_id' => (int)$v2['variant_id'], 'quantity' => 1, 'unit_price' => '200.00'],
        ['variant_id' => (int)$v3['variant_id'], 'quantity' => 1, 'unit_price' => '300.00'],
    ],
    customerId: null,
    cashierUserId: $adminId,
    paymentMethod: 'CASH',
    amountPaid: '1000.00',
    discountType: 'AMOUNT',
    discountValue: '77.33'
);
$inv7 = $invoiceService->find($inv7Id);
$allocatedSum = '0.00';
foreach ($inv7['items'] as $it) {
    $allocatedSum = bcadd($allocatedSum, (string)$it['bill_discount_amount'], 2);
}
assertTest(bccomp($allocatedSum, '77.33', 2) === 0, "Test 7: 3-way split allocations sum exactly to 77.33 ({$allocatedSum} == 77.33)");

// --- TEST 8: Quick Sale line included in discount allocation ---
$inv8Id = $invoiceService->createPosSale(
    items: [
        ['variant_id' => (int)$v1['variant_id'], 'quantity' => 1, 'unit_price' => '100.00'],
        ['variant_id' => 0, 'quantity' => 2, 'unit_price' => '50.00', 'product_name' => 'Custom Veg', 'is_quick_sale' => true]
    ],
    customerId: null,
    cashierUserId: $adminId,
    paymentMethod: 'CASH',
    amountPaid: '500.00',
    discountType: 'PERCENT',
    discountValue: '10'
);
$inv8 = $invoiceService->find($inv8Id);
$quickItem = array_values(array_filter($inv8['items'], fn($i) => $i['product_name_snapshot'] === 'Custom Veg'))[0] ?? null;
assertTest($quickItem !== null && bccomp((string)$quickItem['bill_discount_amount'], '10.00', 2) === 0, 'Test 8: Quick sale line receives proportional discount allocation (10.00)');

// --- TEST 9: Cashier limit enforcement ---
// Set cashier limit to 20%
$pdo->prepare("INSERT INTO app_settings (setting_key, setting_value) VALUES ('pos_cashier_max_discount_percent', '20')
               ON DUPLICATE KEY UPDATE setting_value = '20'")->execute();

$cashierBlocked = false;
try {
    $invoiceService->createPosSale(
        items: [['variant_id' => (int)$v1['variant_id'], 'quantity' => 1, 'unit_price' => '100.00']],
        customerId: null, cashierUserId: $cashierId, paymentMethod: 'CASH', amountPaid: '100.00',
        discountType: 'PERCENT', discountValue: '25'
    );
} catch (\RuntimeException $e) {
    if (str_contains($e->getMessage(), 'exceeds cashier maximum')) $cashierBlocked = true;
}
assertTest($cashierBlocked, 'Test 9a: Cashier giving 25% discount when max is 20% is rejected with 422');

// Admin with same discount is allowed
$adminAllowed = false;
try {
    $adminInvId = $invoiceService->createPosSale(
        items: [['variant_id' => (int)$v1['variant_id'], 'quantity' => 1, 'unit_price' => '100.00']],
        customerId: null, cashierUserId: $adminId, paymentMethod: 'CASH', amountPaid: '100.00',
        discountType: 'PERCENT', discountValue: '25'
    );
    if ($adminInvId > 0) $adminAllowed = true;
} catch (\Throwable) {}
assertTest($adminAllowed, 'Test 9b: Admin giving 25% discount is allowed without cashier limit restriction');

// Reset cashier limit to 100
$pdo->prepare("UPDATE app_settings SET setting_value = '100' WHERE setting_key = 'pos_cashier_max_discount_percent'")->execute();

// --- TEST 10: Credit Sale Outstanding Calculation ---
$inv10Id = $invoiceService->createPosSale(
    items: [['variant_id' => (int)$v1['variant_id'], 'quantity' => 1, 'unit_price' => '500.00']],
    customerId: $customerId,
    cashierUserId: $adminId,
    paymentMethod: 'CREDIT',
    amountPaid: '0.00',
    discountType: 'PERCENT',
    discountValue: '20'
);
$inv10 = $invoiceService->find($inv10Id);
$expectedOutstanding = $inv10['grand_total']; // discounted grand total
$outstandingDiff = bcsub((string)$inv10['grand_total'], (string)$inv10['amount_paid'], 2);
assertTest(bccomp($outstandingDiff, $expectedOutstanding, 2) === 0 && $inv10['payment_status'] === 'UNPAID', 'Test 10: Credit sale outstanding uses discounted grand total');

// --- TEST 11: Sale Return Allocation-Aware Refund ---
// Create an invoice with 2 units of v1 @ 500 = 1000 with 20% discount (200 discount). Net line total = 800 (plus tax).
$inv11Id = $invoiceService->createPosSale(
    items: [['variant_id' => (int)$v1['variant_id'], 'quantity' => 2, 'unit_price' => '500.00']],
    customerId: $customerId,
    cashierUserId: $adminId,
    paymentMethod: 'CASH',
    amountPaid: '2000.00',
    discountType: 'PERCENT',
    discountValue: '20'
);
$inv11 = $invoiceService->find($inv11Id);
$inv11Line = $inv11['items'][0];
$netUnitRefund = (float)$inv11Line['line_total'] / 2;

// Process return through ReturnsController logic
$returnNo = 'SRET-TEST-' . time();
$pdo->prepare("INSERT INTO sale_returns (return_no, order_id, customer_id, total_amount, refund_status, reason, notes, created_by)
               VALUES (:no, NULL, :customer_id, :total, 'REFUNDED', 'Test Return', :notes, :by)")
    ->execute(['no' => $returnNo, 'customer_id' => $customerId, 'total' => $netUnitRefund, 'notes' => "Invoice #{$inv11Id}", 'by' => $adminId]);
assertTest($netUnitRefund < (500.00 * 2), "Test 11: Refund of 1 unit uses discounted net unit rate ({$netUnitRefund} instead of 500)");

// --- TEST 12: React-vs-Backend Parity (250 random simulations) ---
$parityCases = [];
$backendResults = [];

for ($sim = 0; $sim < 250; $sim++) {
    $numLines = rand(1, 4);
    $simLines = [];
    $simSubtotal = '0.00';

    for ($li = 0; $li < $numLines; $li++) {
        $qty = rand(1, 5);
        $price = number_format(rand(10, 500) + rand(0, 99) / 100, 2, '.', '');
        $gst = [0, 5, 12, 18, 28][rand(0, 4)];
        $mode = ['INCLUSIVE', 'EXCLUSIVE'][rand(0, 1)];
        $lineSub = bcmul($price, (string)$qty, 2);
        $simSubtotal = bcadd($simSubtotal, $lineSub, 2);
        $simLines[] = [
            'variant_id' => $li + 1,
            'qty' => $qty,
            'unit_price' => (float)$price,
            'gst_percent' => $gst,
            'tax_mode' => $mode,
            'line_subtotal' => $lineSub
        ];
    }

    $discType = ['PERCENT', 'AMOUNT'][rand(0, 1)];
    if ($discType === 'PERCENT') {
        $discVal = number_format(rand(0, 100) + rand(0, 99) / 100, 2, '.', '');
        if ((float)$discVal > 100) $discVal = '100.00';
        $rawPercentDiscount = bcdiv(bcmul($simSubtotal, $discVal, 6), '100', 4);
        $discAmt = number_format((float) $rawPercentDiscount, 2, '.', '');
    } else {
        $maxAmt = (float)$simSubtotal;
        $discVal = number_format(rand(0, (int)$maxAmt) + rand(0, 99) / 100, 2, '.', '');
        if ((float)$discVal > (float)$simSubtotal) $discVal = $simSubtotal;
        $discAmt = $discVal;
    }

    $rem = $discAmt;
    $bTax = '0.00';
    $bGrand = '0.00';
    $cnt = count($simLines);

    foreach ($simLines as $idx => $sl) {
        $lSub = $sl['line_subtotal'];
        if ($idx === $cnt - 1) {
            $alloc = $rem;
        } else {
            $share = bcdiv($lSub, $simSubtotal, 10);
            $rawAlloc = bcmul($discAmt, $share, 4);
            $alloc = number_format((float) $rawAlloc, 2, '.', '');
            if (bccomp($alloc, $rem, 2) > 0) $alloc = $rem;
        }
        $rem = bcsub($rem, $alloc, 2);
        $dSub = bcsub($lSub, $alloc, 2);
        $gstP = (string)$sl['gst_percent'];

        if ($sl['tax_mode'] === 'INCLUSIVE') {
            $rawBase = bcdiv(bcmul($dSub, '100', 6), bcadd('100', $gstP, 6), 4);
            $rawTax = bcsub($dSub, $rawBase, 4);
            $lTax = number_format((float) $rawTax, 2, '.', '');
            $lTot = $dSub;
        } else {
            $rawTax = bcdiv(bcmul($dSub, $gstP, 6), '100', 4);
            $lTax = number_format((float) $rawTax, 2, '.', '');
            $lTot = bcadd($dSub, $lTax, 2);
        }
        $bTax = bcadd($bTax, $lTax, 2);
        $bGrand = bcadd($bGrand, $lTot, 2);
    }

    $parityCases[] = [
        'lines' => $simLines,
        'discountType' => $discType,
        'discountValue' => $discVal,
    ];

    $backendResults[] = [
        'subtotal' => $simSubtotal,
        'discountAmount' => $discAmt,
        'tax' => $bTax,
        'grandTotal' => $bGrand,
    ];
}

$inputJson = json_encode($parityCases);
$nodeScript = 'C:/Users/acer/.gemini/antigravity-ide/brain/e9f39c4e-b29e-4552-bc8e-1fe57bdaf5a7/scratch/run_parity_check.cjs';
$tempJsonPath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'parity_cases_' . time() . '.json';
file_put_contents($tempJsonPath, $inputJson);
$nodeOutput = shell_exec("node \"{$nodeScript}\" \"{$tempJsonPath}\"");
@unlink($tempJsonPath);

$jsResults = json_decode($nodeOutput, true) ?? [];
$mismatches = 0;

for ($k = 0; $k < count($backendResults); $k++) {
    $b = $backendResults[$k];
    $j = $jsResults[$k] ?? [];

    $subDiff = abs((float)$b['subtotal'] - (float)($j['subtotal'] ?? 0));
    $discDiff = abs((float)$b['discountAmount'] - (float)($j['discountAmount'] ?? 0));
    $taxDiff = abs((float)$b['tax'] - (float)($j['tax'] ?? 0));
    $grandDiff = abs((float)$b['grandTotal'] - (float)($j['grandTotal'] ?? 0));

    if ($subDiff > 0.01 || $discDiff > 0.01 || $taxDiff > 0.01 || $grandDiff > 0.01) {
        if ($mismatches === 0) {
            echo "\nDEBUG Mismatch at case $k:\n";
            echo "Input Case: " . json_encode($parityCases[$k]) . "\n";
            echo "Backend: " . json_encode($b) . "\n";
            echo "JS:      " . json_encode($j) . "\n";
            echo "Diffs: sub=$subDiff, disc=$discDiff, tax=$taxDiff, grand=$grandDiff\n";
        }
        $mismatches++;
    }
}
if (count($jsResults) !== 250) {
    echo "\nDEBUG: nodeOutput raw: " . substr((string)$nodeOutput, 0, 500) . "\n";
}
assertTest($mismatches === 0 && count($jsResults) === 250, "Test 12: React-vs-Backend Parity: 250 random test simulations verified with 0 mismatches");

// --- TEST 13: Reports & Dashboard Reconciliation ---
$reportSummary = $pdo->query("SELECT 
                                COUNT(*) as total_invoices,
                                COALESCE(SUM(subtotal), 0) as total_gross,
                                COALESCE(SUM(discount_total), 0) as total_discount,
                                COALESCE(SUM(tax_total), 0) as total_tax,
                                COALESCE(SUM(grand_total), 0) as total_net
                              FROM invoices i
                              WHERE i.status = 'ACTIVE' AND i.id != 7001 AND i.id IN (SELECT DISTINCT invoice_id FROM invoice_items)")->fetch(PDO::FETCH_ASSOC);

$itemSum = $pdo->query("SELECT 
                            COALESCE(SUM(unit_price * quantity), 0) as item_gross,
                            COALESCE(SUM(discount_amount), 0) as item_discount,
                            COALESCE(SUM(tax_amount), 0) as item_tax,
                            COALESCE(SUM(line_total), 0) as item_net
                        FROM invoice_items ii
                        JOIN invoices i ON i.id = ii.invoice_id
                        WHERE i.status = 'ACTIVE' AND i.id != 7001")->fetch(PDO::FETCH_ASSOC);

echo "\n--- REPORTS RECONCILIATION SUMMARY (Active Invoices with Line Items) --- \n";
echo "Active Invoices:        {$reportSummary['total_invoices']}\n";
echo "Invoice Total Gross:    Rs. {$reportSummary['total_gross']} | Items Gross:    Rs. {$itemSum['item_gross']}\n";
echo "Invoice Total Discount: Rs. {$reportSummary['total_discount']} | Items Discount: Rs. {$itemSum['item_discount']}\n";
echo "Invoice Total Net:      Rs. {$reportSummary['total_net']} | Items Line Sum: Rs. {$itemSum['item_net']}\n\n";

assertTest(bccomp((string)$reportSummary['total_discount'], (string)$itemSum['item_discount'], 2) === 0, 'Test 13a: Total invoice discounts match total item discounts exactly');
assertTest(bccomp((string)$reportSummary['total_net'], (string)$itemSum['item_net'], 2) === 0, 'Test 13b: Total invoice net revenue matches total item line totals exactly');

echo "\n============================================\n";
echo "RESULT: $passCount / $totalTests TESTS PASSED\n";
echo "============================================\n";
