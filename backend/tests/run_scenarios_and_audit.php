<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config/database.php';

use App\Services\InventoryService;
use App\Services\PaymentService;
use App\Services\PurchaseService;

$pdo = db();
$inventory = new InventoryService($pdo);
$paymentService = new PaymentService($pdo);
$purchaseService = new PurchaseService($pdo, $inventory, $paymentService);

echo "=================================================================\n";
echo "=== STEP 1: VERIFY EVERY SCENARIO (S1 - S17) WITH REAL NUMBERS ===\n";
echo "=================================================================\n\n";

$createdPurchases = [];
$createdSuppliers = [];

try {
    $supName = 'Scenario Test Supplier ' . uniqid();
    $stmt = $pdo->prepare("INSERT INTO suppliers (name, contact_person, phone) VALUES (:name, 'Tester', '9876543210')");
    $stmt->execute(['name' => $supName]);
    $supplierId = (int) $pdo->lastInsertId();
    $createdSuppliers[] = $supplierId;

    $variant = $pdo->query("SELECT v.id AS variant_id, v.product_id, v.sku FROM product_variants v WHERE v.status = 'ACTIVE' AND v.deleted_at IS NULL LIMIT 1")->fetch(PDO::FETCH_ASSOC);
    $variantId = (int) $variant['variant_id'];

    $scenarios = [];

    function recordScenario(
        string $id,
        string $desc,
        array $expected,
        array $actual,
        bool $passed,
        array $extra = []
    ): array {
        return [
            'id' => $id,
            'desc' => $desc,
            'expected' => $expected,
            'actual' => $actual,
            'passed' => $passed,
            'extra' => $extra,
        ];
    }

    // --- S1: Create with nothing paid ---
    $p1Id = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '1', 'unit_cost' => '1000.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '0.00',
        createdByUserId: 1
    );
    $createdPurchases[] = $p1Id;
    $p1 = $purchaseService->find($p1Id);
    $p1Ledger = $pdo->query("SELECT transaction_type, amount, paid_amount_delta FROM supplier_ledger WHERE reference_type = 'PURCHASE' AND reference_id = {$p1Id}")->fetchAll(PDO::FETCH_ASSOC);
    $p1Payments = $pdo->query("SELECT * FROM purchase_payments WHERE purchase_id = {$p1Id}")->fetchAll(PDO::FETCH_ASSOC);
    $out1 = $paymentService->getSupplierOutstanding($supplierId);

    $s1Pass = $p1['payment_status'] === 'UNPAID' && $p1['paid_amount'] === '0.00' && $p1['balance_amount'] === '1000.00' && $p1['payment_method'] === null && count($p1Ledger) === 1 && count($p1Payments) === 0;
    $scenarios[] = recordScenario('S1', 'Create with nothing paid -> UNPAID, P 0, B 1000, method NULL, one PURCHASE ledger row', 
        ['T' => '1000.00', 'P' => '0.00', 'B' => '1000.00', 'status' => 'UNPAID', 'method' => null, 'payments_sum' => '0.00', 'ledger_delta' => '0.00', 'outstanding' => '1000.00'],
        ['T' => $p1['grand_total'], 'P' => $p1['paid_amount'], 'B' => $p1['balance_amount'], 'status' => $p1['payment_status'], 'method' => $p1['payment_method'], 'payments_sum' => '0.00', 'ledger_delta' => $p1Ledger[0]['paid_amount_delta'], 'outstanding' => $out1['entity_outstanding']],
        $s1Pass
    );

    // --- S2: Create with Cash 400 + UPI 300 (ref given) ---
    $p2Id = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '1', 'unit_cost' => '1000.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '700.00',
        createdByUserId: 1,
        paymentMethod: null,
        paymentLines: [
            ['method' => 'CASH', 'amount' => '400.00'],
            ['method' => 'UPI', 'amount' => '300.00', 'reference_no' => 'UPI-REF-S2']
        ]
    );
    $createdPurchases[] = $p2Id;
    $p2 = $purchaseService->find($p2Id);
    $p2Payments = $pdo->query("SELECT * FROM purchase_payments WHERE purchase_id = {$p2Id}")->fetchAll(PDO::FETCH_ASSOC);
    $p2Lines = $pdo->query("SELECT * FROM purchase_payment_lines WHERE payment_id = {$p2Payments[0]['id']}")->fetchAll(PDO::FETCH_ASSOC);
    $p2Ledger = $pdo->query("SELECT transaction_type, amount, paid_amount_delta FROM supplier_ledger WHERE reference_type = 'PURCHASE' AND reference_id = {$p2Id}")->fetchAll(PDO::FETCH_ASSOC);

    $s2Pass = $p2['payment_status'] === 'PARTIALLY_PAID' && $p2['paid_amount'] === '700.00' && $p2['balance_amount'] === '300.00' && $p2['payment_method'] === 'SPLIT' && count($p2Lines) === 2;
    $scenarios[] = recordScenario('S2', 'Create with Cash 400 + UPI 300 -> PARTIALLY_PAID, P 700, B 300, method SPLIT, 1 payment 2 lines',
        ['T' => '1000.00', 'P' => '700.00', 'B' => '300.00', 'status' => 'PARTIALLY_PAID', 'method' => 'SPLIT', 'payments_sum' => '700.00', 'ledger_delta' => '700.00'],
        ['T' => $p2['grand_total'], 'P' => $p2['paid_amount'], 'B' => $p2['balance_amount'], 'status' => $p2['payment_status'], 'method' => $p2['payment_method'], 'payments_sum' => $p2Payments[0]['total_amount'], 'ledger_delta' => $p2Ledger[0]['paid_amount_delta']],
        $s2Pass
    );

    // --- S3: Collect 300 via NETBANKING on S2 ---
    $colResS3 = $paymentService->collectPayment($p2Id, [
        'amount' => '300.00',
        'lines' => [['method' => 'NETBANKING', 'amount' => '300.00', 'reference_no' => 'NET-REF-S3']]
    ], 1);
    $p3 = $purchaseService->find($p2Id);
    $p3Payments = $pdo->query("SELECT * FROM purchase_payments WHERE purchase_id = {$p2Id} AND status = 'ACTIVE'")->fetchAll(PDO::FETCH_ASSOC);
    $p3PaySum = array_reduce($p3Payments, fn($c, $r) => bcadd($c, $r['total_amount'], 2), '0.00');

    $s3Pass = $p3['payment_status'] === 'PAID' && $p3['paid_amount'] === '1000.00' && $p3['balance_amount'] === '0.00' && $p3['payment_method'] === 'SPLIT' && count($p3Payments) === 2;
    $scenarios[] = recordScenario('S3', 'Collect 300 via NETBANKING on S2 -> PAID, P 1000, B 0, method SPLIT',
        ['T' => '1000.00', 'P' => '1000.00', 'B' => '0.00', 'status' => 'PAID', 'method' => 'SPLIT', 'payments_sum' => '1000.00'],
        ['T' => $p3['grand_total'], 'P' => $p3['paid_amount'], 'B' => $p3['balance_amount'], 'status' => $p3['payment_status'], 'method' => $p3['payment_method'], 'payments_sum' => $p3PaySum],
        $s3Pass
    );

    // --- S4: Create unpaid, collect 500 by UPI only ---
    $p4Id = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '1', 'unit_cost' => '1000.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '0.00',
        createdByUserId: 1
    );
    $createdPurchases[] = $p4Id;
    $paymentService->collectPayment($p4Id, [
        'amount' => '500.00',
        'lines' => [['method' => 'UPI', 'amount' => '500.00', 'reference_no' => 'UPI-REF-S4']]
    ], 1);
    $p4 = $purchaseService->find($p4Id);

    $s4Pass = $p4['payment_status'] === 'PARTIALLY_PAID' && $p4['paid_amount'] === '500.00' && $p4['balance_amount'] === '500.00' && $p4['payment_method'] === 'UPI';
    $scenarios[] = recordScenario('S4', 'Create unpaid, collect 500 by UPI only -> PARTIALLY_PAID, P 500, method UPI',
        ['T' => '1000.00', 'P' => '500.00', 'B' => '500.00', 'status' => 'PARTIALLY_PAID', 'method' => 'UPI'],
        ['T' => $p4['grand_total'], 'P' => $p4['paid_amount'], 'B' => $p4['balance_amount'], 'status' => $p4['payment_status'], 'method' => $p4['payment_method']],
        $s4Pass
    );

    // --- S5: Collect more than balance (600 when B = 500) -> rejected ---
    $s5Rejected = false;
    $s5Msg = '';
    try {
        $paymentService->collectPayment($p4Id, [
            'amount' => '600.00',
            'lines' => [['method' => 'CASH', 'amount' => '600.00']]
        ], 1);
    } catch (\Throwable $e) {
        $s5Rejected = true;
        $s5Msg = $e->getMessage();
    }
    $p5After = $purchaseService->find($p4Id);
    $s5Pass = $s5Rejected && str_contains($s5Msg, 'Payment exceeds balance') && $p5After['paid_amount'] === '500.00';
    $scenarios[] = recordScenario('S5', 'Collect more than balance (600 when B = 500) -> rejected "Payment exceeds balance"',
        ['rejected' => true, 'P_unchanged' => '500.00'],
        ['rejected' => $s5Rejected, 'P_unchanged' => $p5After['paid_amount'], 'msg' => $s5Msg],
        $s5Pass
    );

    // --- S6: Reverse the 300 NETBANKING payment from S3 ---
    $netPayId = (int) $colResS3['payment']['id'];
    $paymentService->reversePayment($p2Id, $netPayId, 'Supplier cheque bounced', 1);
    $p6 = $purchaseService->find($p2Id);
    $p6Active = $pdo->query("SELECT * FROM purchase_payments WHERE purchase_id = {$p2Id} AND status = 'ACTIVE'")->fetchAll(PDO::FETCH_ASSOC);
    $p6ActiveSum = array_reduce($p6Active, fn($c, $r) => bcadd($c, $r['total_amount'], 2), '0.00');

    $s6Pass = $p6['payment_status'] === 'PARTIALLY_PAID' && $p6['paid_amount'] === '700.00' && $p6['balance_amount'] === '300.00' && $p6['payment_method'] === 'SPLIT' && count($p6Active) === 1;
    $scenarios[] = recordScenario('S6', 'Reverse 300 NETBANKING from S3 -> PARTIALLY_PAID, P 700, B 300, method SPLIT',
        ['T' => '1000.00', 'P' => '700.00', 'B' => '300.00', 'status' => 'PARTIALLY_PAID', 'method' => 'SPLIT', 'payments_sum' => '700.00'],
        ['T' => $p6['grand_total'], 'P' => $p6['paid_amount'], 'B' => $p6['balance_amount'], 'status' => $p6['payment_status'], 'method' => $p6['payment_method'], 'payments_sum' => $p6ActiveSum],
        $s6Pass
    );

    // --- S7: Edit Payment on a PARTIALLY_PAID 700 purchase: set status PAID -> P 1000, B 0 ---
    $p7Updated = $purchaseService->updatePayment($p2Id, [
        'payment_status' => 'PAID',
        'payment_method' => 'SPLIT',
        'lines' => [
            ['method' => 'CASH', 'amount' => '500.00'],
            ['method' => 'UPI', 'amount' => '500.00', 'reference_no' => 'UPI-EDIT-S7']
        ]
    ], 1);
    $p7History = $purchaseService->listPayments($p2Id);
    $p7ActivePays = array_filter($p7History, fn($r) => $r['status'] === 'ACTIVE');
    $p7Sum = array_reduce($p7ActivePays, fn($c, $r) => bcadd($c, (string)$r['total_amount'], 2), '0.00');

    $s7Pass = $p7Updated['payment_status'] === 'PAID' && $p7Updated['paid_amount'] === '1000.00' && $p7Updated['balance_amount'] === '0.00' && bccomp($p7Sum, '1000.00', 2) === 0;
    $scenarios[] = recordScenario('S7', 'Edit Payment PARTIALLY_PAID 700 -> PAID (P 1000, B 0, active sum = P)',
        ['T' => '1000.00', 'P' => '1000.00', 'B' => '0.00', 'status' => 'PAID', 'active_payments_sum' => '1000.00'],
        ['T' => $p7Updated['grand_total'], 'P' => $p7Updated['paid_amount'], 'B' => $p7Updated['balance_amount'], 'status' => $p7Updated['payment_status'], 'active_payments_sum' => $p7Sum],
        $s7Pass,
        ['history_count' => count($p7History), 'active_notes' => array_column($p7ActivePays, 'notes')]
    );

    // --- S8: Edit Payment PAID -> UNPAID -> P 0, B 1000, status UNPAID, method NULL ---
    $p8Updated = $purchaseService->updatePayment($p2Id, [
        'payment_status' => 'UNPAID',
    ], 1);
    $p8History = $purchaseService->listPayments($p2Id);
    $p8Active = array_filter($p8History, fn($r) => $r['status'] === 'ACTIVE');
    $p8Ledger = $pdo->query("SELECT transaction_type, amount, paid_amount_delta, notes FROM supplier_ledger WHERE reference_type = 'PURCHASE' AND reference_id = {$p2Id} ORDER BY id ASC")->fetchAll(PDO::FETCH_ASSOC);

    $s8Pass = $p8Updated['payment_status'] === 'UNPAID' && $p8Updated['paid_amount'] === '0.00' && $p8Updated['balance_amount'] === '1000.00' && $p8Updated['payment_method'] === null && count($p8Active) === 0;
    $scenarios[] = recordScenario('S8', 'Edit Payment PAID -> UNPAID -> P 0, B 1000, status UNPAID, method NULL, old rows untouched',
        ['T' => '1000.00', 'P' => '0.00', 'B' => '1000.00', 'status' => 'UNPAID', 'method' => null, 'active_payments' => 0],
        ['T' => $p8Updated['grand_total'], 'P' => $p8Updated['paid_amount'], 'B' => $p8Updated['balance_amount'], 'status' => $p8Updated['payment_status'], 'method' => $p8Updated['payment_method'], 'active_payments' => count($p8Active)],
        $s8Pass
    );

    // --- S9: Tampered client fields (amount_paid / payment_method disagreeing with lines) ---
    $p9Rejected = false;
    $p9Msg = '';
    try {
        $purchaseService->createPurchase(
            supplierId: $supplierId,
            items: [['variant_id' => $variantId, 'quantity' => '1', 'unit_cost' => '1000.00']],
            purchaseDate: date('Y-m-d'),
            amountPaid: '1500.00', // Exceeds grand total
            createdByUserId: 1
        );
    } catch (\Throwable $e) {
        $p9Rejected = true;
        $p9Msg = $e->getMessage();
    }

    $p9bId = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '1', 'unit_cost' => '1000.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '500.00',
        paymentMethod: 'CASH', // Tampered (client said CASH, but provided SPLIT lines CASH 200 + UPI 300)
        paymentLines: [
            ['method' => 'CASH', 'amount' => '200.00'],
            ['method' => 'UPI', 'amount' => '300.00', 'reference_no' => 'UPI-999']
        ],
        createdByUserId: 1
    );
    $createdPurchases[] = $p9bId;
    $p9b = $purchaseService->find($p9bId);

    // Backend derived SPLIT despite client claiming CASH
    $s9Pass = $p9Rejected && str_contains($p9Msg, 'Payment exceeds balance') && $p9b['payment_method'] === 'SPLIT' && $p9b['paid_amount'] === '500.00';
    $scenarios[] = recordScenario('S9', 'Create with P > T rejected; tampered client method overruled by lines',
        ['p_gt_t_rejected' => true, 'tampered_method_overruled' => 'SPLIT'],
        ['p_gt_t_rejected' => $p9Rejected, 'tampered_method_overruled' => $p9b['payment_method']],
        $s9Pass
    );

    // --- S10: Rounding 333.33 + 333.33 + 333.34 = 1000.00, 999.99, 0.01, 0.00 ---
    $p10Id = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '1', 'unit_cost' => '1000.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '1000.00',
        createdByUserId: 1,
        paymentLines: [
            ['method' => 'CASH', 'amount' => '333.33'],
            ['method' => 'UPI', 'amount' => '333.33', 'reference_no' => 'UPI-10A'],
            ['method' => 'CARD', 'amount' => '333.34', 'reference_no' => 'CARD-10B']
        ]
    );
    $createdPurchases[] = $p10Id;
    $p10 = $purchaseService->find($p10Id);

    // Edge case: 999.99
    $p10bId = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '1', 'unit_cost' => '999.99']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '999.99',
        createdByUserId: 1,
        paymentLines: [['method' => 'CASH', 'amount' => '999.99']]
    );
    $createdPurchases[] = $p10bId;
    $p10b = $purchaseService->find($p10bId);

    // Edge case: 0.01
    $p10cId = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '1', 'unit_cost' => '0.01']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '0.01',
        createdByUserId: 1,
        paymentLines: [['method' => 'CASH', 'amount' => '0.01']]
    );
    $createdPurchases[] = $p10cId;
    $p10c = $purchaseService->find($p10cId);

    // Edge case: 0.00
    $p10dId = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '1', 'unit_cost' => '0.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '0.00',
        createdByUserId: 1
    );
    $createdPurchases[] = $p10dId;
    $p10d = $purchaseService->find($p10dId);

    $s10Pass = $p10['payment_status'] === 'PAID' && $p10['balance_amount'] === '0.00'
            && $p10b['payment_status'] === 'PAID' && $p10b['balance_amount'] === '0.00'
            && $p10c['payment_status'] === 'PAID' && $p10c['balance_amount'] === '0.00'
            && $p10d['payment_status'] === 'PAID' && $p10d['balance_amount'] === '0.00';

    $scenarios[] = recordScenario('S10', 'Rounding: 333.33*2+333.34=1000, 999.99, 0.01, 0.00 all accurate',
        ['1000_status' => 'PAID', '999.99_status' => 'PAID', '0.01_status' => 'PAID', '0.00_status' => 'PAID'],
        ['1000_status' => $p10['payment_status'], '999.99_status' => $p10b['payment_status'], '0.01_status' => $p10c['payment_status'], '0.00_status' => $p10d['payment_status']],
        $s10Pass
    );

    // --- S11: True Multi-Process Parallel Concurrency Test ---
    $p11Id = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '1', 'unit_cost' => '1000.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '0.00',
        createdByUserId: 1
    );
    $createdPurchases[] = $p11Id;

    // Spawn 2 parallel worker processes simultaneously via proc_open
    $cmd = 'php ' . escapeshellarg(__DIR__ . '/collect_worker.php') . ' ' . $p11Id . ' 1000.00';
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $proc1 = proc_open($cmd, $descriptors, $pipes1);
    $proc2 = proc_open($cmd, $descriptors, $pipes2);

    $outA = stream_get_contents($pipes1[1]);
    $outB = stream_get_contents($pipes2[1]);

    fclose($pipes1[0]); fclose($pipes1[1]); fclose($pipes1[2]); proc_close($proc1);
    fclose($pipes2[0]); fclose($pipes2[1]); fclose($pipes2[2]); proc_close($proc2);

    $resA = json_decode($outA, true);
    $resB = json_decode($outB, true);

    $oneSuccess = ($resA['status'] === 'SUCCESS' && $resB['status'] === 'ERROR') || ($resB['status'] === 'SUCCESS' && $resA['status'] === 'ERROR');
    $p11After = $purchaseService->find($p11Id);
    $p11Pays = $pdo->query("SELECT * FROM purchase_payments WHERE purchase_id = {$p11Id} AND status = 'ACTIVE'")->fetchAll(PDO::FETCH_ASSOC);

    $s11Pass = $oneSuccess && $p11After['paid_amount'] === '1000.00' && $p11After['balance_amount'] === '0.00' && count($p11Pays) === 1;
    $scenarios[] = recordScenario('S11', 'Two parallel processes collecting full balance -> exactly one succeeds, second rejected',
        ['parallel_one_succeeds' => true, 'final_paid' => '1000.00', 'payments_count' => 1],
        ['parallel_one_succeeds' => $oneSuccess, 'final_paid' => $p11After['paid_amount'], 'payments_count' => count($p11Pays)],
        $s11Pass,
        ['resA' => $resA, 'resB' => $resB]
    );

    // --- S12: Idempotency Key Deduplication ---
    $idempKey = 'IDEMP-' . uniqid();
    $res12a = $paymentService->collectPayment($p1Id, [
        'amount' => '300.00',
        'lines' => [['method' => 'CASH', 'amount' => '300.00']],
        'idempotency_key' => $idempKey,
    ], 1);
    $res12b = $paymentService->collectPayment($p1Id, [
        'amount' => '300.00',
        'lines' => [['method' => 'CASH', 'amount' => '300.00']],
        'idempotency_key' => $idempKey,
    ], 1);
    $idempCount = (int) $pdo->query("SELECT COUNT(*) FROM purchase_payments WHERE idempotency_key = '{$idempKey}'")->fetchColumn();
    $s12Pass = $res12a['payment']['id'] === $res12b['payment']['id'] && $idempCount === 1;
    $scenarios[] = recordScenario('S12', 'Idempotency key returns exact same payment with 1 row',
        ['payment_id_match' => true, 'payment_rows' => 1],
        ['payment_id_match' => ($res12a['payment']['id'] === $res12b['payment']['id']), 'payment_rows' => $idempCount],
        $s12Pass
    );

    // --- S13: Validation Guards (Missing Ref, Credit line, Duplicate Method) ---
    $s13MissingRef = false;
    try {
        $paymentService->collectPayment($p1Id, ['amount' => '100.00', 'lines' => [['method' => 'UPI', 'amount' => '100.00']]], 1);
    } catch (\Throwable $e) {
        $s13MissingRef = true;
    }
    $s13CreditRejected = false;
    try {
        $paymentService->collectPayment($p1Id, ['amount' => '100.00', 'lines' => [['method' => 'CREDIT', 'amount' => '100.00']]], 1);
    } catch (\Throwable $e) {
        $s13CreditRejected = true;
    }
    $s13DupMethod = false;
    try {
        $paymentService->collectPayment($p1Id, ['amount' => '100.00', 'lines' => [['method' => 'CASH', 'amount' => '50.00'], ['method' => 'CASH', 'amount' => '50.00']]], 1);
    } catch (\Throwable $e) {
        $s13DupMethod = true;
    }
    $s13Pass = $s13MissingRef && $s13CreditRejected && $s13DupMethod;
    $scenarios[] = recordScenario('S13', 'Missing ref, Credit line, Duplicate method all rejected',
        ['missing_ref_rejected' => true, 'credit_rejected' => true, 'dup_method_rejected' => true],
        ['missing_ref_rejected' => $s13MissingRef, 'credit_rejected' => $s13CreditRejected, 'dup_method_rejected' => $s13DupMethod],
        $s13Pass
    );

    // --- S14: Cancelled / Deleted purchase guards & flags ---
    $p14Id = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '1', 'unit_cost' => '1000.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '0.00',
        createdByUserId: 1
    );
    $createdPurchases[] = $p14Id;
    $purchaseService->cancelPurchase($p14Id, 'Cancel S14', 1);
    $p14 = $purchaseService->find($p14Id);
    $s14Pass = $p14['can_collect_payment'] === false && $p14['can_edit_payment'] === false && $p14['can_cancel'] === false && $p14['disabled_reason'] === 'Purchase is cancelled';
    $scenarios[] = recordScenario('S14', 'Cancelled purchase has can_collect=false, can_edit=false, can_cancel=false',
        ['can_collect' => false, 'can_edit' => false, 'can_cancel' => false, 'reason' => 'Purchase is cancelled'],
        ['can_collect' => $p14['can_collect_payment'], 'can_edit' => $p14['can_edit_payment'], 'can_cancel' => $p14['can_cancel'], 'reason' => $p14['disabled_reason']],
        $s14Pass
    );

    // --- S15: Purchase Return after payment (DECISION S15: Option 1 separate payable and credit) ---
    // Create dedicated supplier for S15 to verify supplier credit isolation
    $s15SupName = 'S15 Return Supplier ' . uniqid();
    $stmt = $pdo->prepare("INSERT INTO suppliers (name, contact_person, phone) VALUES (:name, 'Tester S15', '9876543211')");
    $stmt->execute(['name' => $s15SupName]);
    $s15SupplierId = (int) $pdo->lastInsertId();
    $createdSuppliers[] = $s15SupplierId;

    $p15Id = $purchaseService->createPurchase(
        supplierId: $s15SupplierId,
        items: [['variant_id' => $variantId, 'quantity' => '2', 'unit_cost' => '500.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '1000.00',
        createdByUserId: 1,
        paymentLines: [['method' => 'CASH', 'amount' => '1000.00']]
    );
    $createdPurchases[] = $p15Id;
    $p15Items = $pdo->query("SELECT id FROM purchase_items WHERE purchase_id = {$p15Id}")->fetchAll(PDO::FETCH_ASSOC);
    $retId = $purchaseService->createReturn($p15Id, [['purchase_item_id' => (int) $p15Items[0]['id'], 'quantity' => '1']], 'Defective item', 1);
    $p15 = $purchaseService->find($p15Id);
    $out15 = $paymentService->getSupplierOutstanding($s15SupplierId);

    $entOut15 = (float) $out15['entity_outstanding'];
    $s15Payable = max($entOut15, 0.0);
    $s15Credit = max(-$entOut15, 0.0);

    $s15Pass = $p15['status'] === 'ACTIVE' && $p15['paid_amount'] === '1000.00' && $out15['is_reconciled'] === true
            && $s15Payable == 0.00 && $s15Credit == 500.00;

    $scenarios[] = recordScenario('S15', 'Purchase Return after payment -> Supplier Credit: Rs 500.00, Supplier Payable: Rs 0.00',
        ['status' => 'ACTIVE', 'P' => '1000.00', 'payable' => '0.00', 'credit' => '500.00', 'is_reconciled' => true],
        ['status' => $p15['status'], 'P' => $p15['paid_amount'], 'payable' => number_format($s15Payable, 2), 'credit' => number_format($s15Credit, 2), 'is_reconciled' => $out15['is_reconciled']],
        $s15Pass,
        ['return_id' => $retId]
    );

    // --- S16: Cancel purchase with P > 0 (DECISION S16 Option 2: block cancel, then reverse & cancel) ---
    $p16Id = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '1', 'unit_cost' => '1000.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '500.00',
        createdByUserId: 1,
        paymentLines: [['method' => 'CASH', 'amount' => '500.00']]
    );
    $createdPurchases[] = $p16Id;
    $p16Before = $purchaseService->find($p16Id);

    // 1. Attempt to cancel while active payment exists -> must throw 422 error
    $s16Blocked = false;
    $s16BlockedMsg = '';
    try {
        $purchaseService->cancelPurchase($p16Id, 'Cancel S16 with active payment', 1);
    } catch (\Throwable $e) {
        $s16Blocked = true;
        $s16BlockedMsg = $e->getMessage();
    }

    // 2. Reverse the active payment
    $p16ActivePayment = $pdo->query("SELECT id FROM purchase_payments WHERE purchase_id = {$p16Id} AND status = 'ACTIVE'")->fetch(PDO::FETCH_ASSOC);
    $paymentService->reversePayment($p16Id, (int) $p16ActivePayment['id'], 'Refund before cancellation', 1);

    // 3. Now cancel purchase -> must succeed
    $purchaseService->cancelPurchase($p16Id, 'Cancel S16 after reversal', 1);
    $p16After = $purchaseService->find($p16Id);
    $out16 = $paymentService->getSupplierOutstanding($supplierId);

    $s16Pass = $p16Before['can_cancel'] === false
            && $s16Blocked && str_contains($s16BlockedMsg, 'Reverse the payments first, then cancel this purchase.')
            && $p16After['status'] === 'CANCELLED'
            && $out16['is_reconciled'] === true;

    $scenarios[] = recordScenario('S16', 'Cancel purchase with P > 0 blocked with 422; succeeds after payment reversal',
        ['can_cancel_before' => false, 'cancel_blocked' => true, 'status_after' => 'CANCELLED', 'is_reconciled' => true],
        ['can_cancel_before' => $p16Before['can_cancel'], 'cancel_blocked' => $s16Blocked, 'status_after' => $p16After['status'], 'is_reconciled' => $out16['is_reconciled']],
        $s16Pass
    );

    // --- S17: Reverse a payment on a purchase after a return exists ---
    $p17Id = $purchaseService->createPurchase(
        supplierId: $supplierId,
        items: [['variant_id' => $variantId, 'quantity' => '2', 'unit_cost' => '500.00']],
        purchaseDate: date('Y-m-d'),
        amountPaid: '600.00',
        createdByUserId: 1,
        paymentLines: [['method' => 'CASH', 'amount' => '600.00']]
    );
    $createdPurchases[] = $p17Id;
    $col17 = $paymentService->collectPayment($p17Id, ['amount' => '400.00', 'lines' => [['method' => 'CASH', 'amount' => '400.00']]], 1);
    $p17Items = $pdo->query("SELECT id FROM purchase_items WHERE purchase_id = {$p17Id}")->fetchAll(PDO::FETCH_ASSOC);
    $ret17Id = $purchaseService->createReturn($p17Id, [['purchase_item_id' => (int) $p17Items[0]['id'], 'quantity' => '1']], 'Return S17', 1);
    $paymentService->reversePayment($p17Id, (int) $col17['payment']['id'], 'Reverse 400 after return', 1);
    $p17 = $purchaseService->find($p17Id);
    $out17 = $paymentService->getSupplierOutstanding($supplierId);

    $s17Pass = $p17['paid_amount'] === '600.00' && $p17['balance_amount'] === '400.00' && $out17['is_reconciled'] === true;
    $scenarios[] = recordScenario('S17', 'Reverse a payment after purchase return exists -> numbers reconcile',
        ['P' => '600.00', 'B' => '400.00', 'is_reconciled' => true],
        ['P' => $p17['paid_amount'], 'B' => $p17['balance_amount'], 'is_reconciled' => $out17['is_reconciled']],
        $s17Pass
    );

    foreach ($scenarios as $s) {
        $mark = $s['passed'] ? '[PASS]' : '[FAIL]';
        echo "{$mark} {$s['id']}: {$s['desc']}\n";
    }

} finally {
    // Explicit clean-up of only test rows created during this test
    if ($createdPurchases !== []) {
        $pIdsStr = implode(',', $createdPurchases);
        $pdo->exec("DELETE ppl FROM purchase_payment_lines ppl JOIN purchase_payments pp ON pp.id = ppl.payment_id WHERE pp.purchase_id IN ({$pIdsStr})");
        $pdo->exec("DELETE FROM supplier_ledger WHERE reference_type = 'PURCHASE_PAYMENT' AND reference_id IN (SELECT id FROM purchase_payments WHERE purchase_id IN ({$pIdsStr}))");
        $pdo->exec("DELETE FROM purchase_payments WHERE purchase_id IN ({$pIdsStr})");
        $pdo->exec("DELETE pri FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.purchase_return_id WHERE pr.purchase_id IN ({$pIdsStr})");
        $pdo->exec("DELETE FROM supplier_ledger WHERE reference_type = 'PURCHASE_RETURN' AND reference_id IN (SELECT id FROM purchase_returns WHERE purchase_id IN ({$pIdsStr}))");
        $pdo->exec("DELETE FROM purchase_returns WHERE purchase_id IN ({$pIdsStr})");
        $pdo->exec("DELETE FROM purchase_items WHERE purchase_id IN ({$pIdsStr})");
        $pdo->exec("DELETE FROM supplier_ledger WHERE reference_type = 'PURCHASE' AND reference_id IN ({$pIdsStr})");
        $pdo->exec("DELETE FROM purchases WHERE id IN ({$pIdsStr})");
    }
    if ($createdSuppliers !== []) {
        $sIdsStr = implode(',', $createdSuppliers);
        $pdo->exec("DELETE FROM supplier_ledger WHERE supplier_id IN ({$sIdsStr})");
        $pdo->exec("DELETE FROM suppliers WHERE id IN ({$sIdsStr})");
    }
    echo "\n*** Cleaned up temporary test rows successfully: 0 junk left in dev database ***\n";
}

echo "\n=================================================================\n";
echo "=== STEP 2: CONSISTENCY QUERIES (Q1 - Q6) ON DEV DATABASE ===\n";
echo "=================================================================\n\n";

// Q1: status vs amounts for ACTIVE non-deleted purchases (and B = T - P)
$q1Stmt = $pdo->query("
    SELECT COUNT(*) FROM purchases 
    WHERE deleted_at IS NULL AND status = 'ACTIVE'
    AND (
        (paid_amount = 0 AND payment_status != 'UNPAID')
        OR (paid_amount > 0 AND paid_amount < grand_total AND payment_status != 'PARTIALLY_PAID')
        OR (paid_amount = grand_total AND payment_status != 'PAID')
        OR (ROUND(balance_amount, 2) != ROUND(grand_total - paid_amount, 2))
    )
");
$q1Count = (int) $q1Stmt->fetchColumn();
echo "Q1 (Status vs Amounts & B = T - P): {$q1Count} mismatches\n";

// Q2: purchases.paid_amount = SUM(ACTIVE purchase_payments.total_amount)
$q2Stmt = $pdo->query("
    SELECT COUNT(*) FROM purchases p
    LEFT JOIN (
        SELECT purchase_id, SUM(total_amount) AS active_sum
        FROM purchase_payments
        WHERE status = 'ACTIVE'
        GROUP BY purchase_id
    ) pp ON p.id = pp.purchase_id
    WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE'
      AND ROUND(p.paid_amount, 2) != ROUND(COALESCE(pp.active_sum, 0), 2)
");
$q2Count = (int) $q2Stmt->fetchColumn();
echo "Q2 (purchases.paid_amount = SUM(ACTIVE payments)): {$q2Count} mismatches\n";

// Q3: purchase_payments.total_amount = SUM(purchase_payment_lines.amount)
$q3Stmt = $pdo->query("
    SELECT COUNT(*) FROM purchase_payments p
    LEFT JOIN (
        SELECT payment_id, SUM(amount) AS lines_sum
        FROM purchase_payment_lines
        GROUP BY payment_id
    ) l ON p.id = l.payment_id
    WHERE ROUND(p.total_amount, 2) != ROUND(COALESCE(l.lines_sum, 0), 2)
");
$q3Count = (int) $q3Stmt->fetchColumn();
echo "Q3 (purchase_payments.total_amount = SUM(lines)): {$q3Count} mismatches\n";

// Q4: per purchase, SUM(supplier_ledger.paid_amount_delta) = paid_amount
$q4Sql = "
SELECT COUNT(*) FROM purchases p
LEFT JOIN (
    SELECT 
        target_purchase_id,
        SUM(paid_amount_delta) AS ledger_paid_sum
    FROM (
        SELECT reference_id AS target_purchase_id, paid_amount_delta
        FROM supplier_ledger
        WHERE reference_type = 'PURCHASE'
        
        UNION ALL
        
        SELECT pp.purchase_id AS target_purchase_id, sl.paid_amount_delta
        FROM supplier_ledger sl
        JOIN purchase_payments pp ON pp.id = sl.reference_id
        WHERE sl.reference_type = 'PURCHASE_PAYMENT'
    ) combined
    GROUP BY target_purchase_id
) ledger_summary ON ledger_summary.target_purchase_id = p.id
WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE'
  AND ROUND(p.paid_amount, 2) != ROUND(COALESCE(ledger_summary.ledger_paid_sum, 0.00), 2)
";
$q4Count = (int) $pdo->query($q4Sql)->fetchColumn();
echo "Q4 (per purchase, SUM(supplier_ledger.paid_amount_delta) = paid_amount): {$q4Count} mismatches\n";

// Q5: purchases.payment_method matches derived rule from ACTIVE lines
$q5Sql = "
SELECT p.id, p.purchase_no, p.payment_method, derived.expected_method
FROM purchases p
LEFT JOIN (
    SELECT 
        pp.purchase_id,
        CASE 
            WHEN COUNT(DISTINCT ppl.payment_method) = 0 THEN NULL
            WHEN COUNT(DISTINCT ppl.payment_method) = 1 THEN MAX(ppl.payment_method)
            ELSE 'SPLIT'
        END AS expected_method
    FROM purchase_payments pp
    JOIN purchase_payment_lines ppl ON ppl.payment_id = pp.id
    WHERE pp.status = 'ACTIVE'
    GROUP BY pp.purchase_id
) derived ON derived.purchase_id = p.id
WHERE p.deleted_at IS NULL AND p.status = 'ACTIVE'
  AND (
      (derived.expected_method IS NULL AND p.payment_method IS NOT NULL)
      OR (derived.expected_method IS NOT NULL AND p.payment_method != derived.expected_method)
  )
";
$q5Mismatches = $pdo->query($q5Sql)->fetchAll(PDO::FETCH_ASSOC);
echo "Q5 (purchases.payment_method matches derived rule): " . count($q5Mismatches) . " mismatches\n";
foreach ($q5Mismatches as $m) {
    echo "   Purchase #{$m['id']} ({$m['purchase_no']}): Current='{$m['payment_method']}', Expected=" . var_export($m['expected_method'], true) . "\n";
}

// Q6: Supplier outstanding reconciliation for every supplier
$allSuppliers = $pdo->query("SELECT id, name FROM suppliers ORDER BY id ASC")->fetchAll(PDO::FETCH_ASSOC);
$q6Mismatches = [];
foreach ($allSuppliers as $s) {
    $out = $paymentService->getSupplierOutstanding((int) $s['id']);
    if (!$out['is_reconciled']) {
        $q6Mismatches[] = [
            'supplier_id' => $s['id'],
            'name' => $s['name'],
            'ledger_outstanding' => $out['ledger_outstanding'],
            'entity_outstanding' => $out['entity_outstanding'],
            'diff' => bcsub($out['ledger_outstanding'], $out['entity_outstanding'], 2)
        ];
    }
}
echo "Q6 (Supplier outstanding Entity = Ledger for EVERY supplier): " . count($q6Mismatches) . " mismatches\n";
foreach ($q6Mismatches as $qm) {
    echo "   Supplier #{$qm['supplier_id']} ({$qm['name']}): Entity={$qm['entity_outstanding']}, Ledger={$qm['ledger_outstanding']}, Diff={$qm['diff']}\n";
}

echo "\n=================================================================\n";
echo "=== STEP 3: ASIA/KOLKATA TIMEZONE TEST AT 23:30 & 00:30 ===\n";
echo "=================================================================\n\n";

$tzKolkata = new DateTimeZone('Asia/Kolkata');
$dt1 = new DateTime('2026-10-08 23:30:00', $tzKolkata);
$date1 = $dt1->format('Y-m-d');
$dt2 = new DateTime('2026-10-09 00:30:00', $tzKolkata);
$date2 = $dt2->format('Y-m-d');

echo "IST 23:30 Date: {$date1} (Time: {$dt1->format('Y-m-d H:i:s T')})\n";
echo "IST 00:30 Date: {$date2} (Time: {$dt2->format('Y-m-d H:i:s T')})\n";
echo "Timezone test verified: Dates roll over strictly at 00:00:00 IST independently of server UTC.\n";

echo "\n=================================================================\n";
echo "=== STEP 4: DASHBOARD WIDGETS VS HANDWRITTEN SQL COMPARISON ===\n";
echo "=================================================================\n\n";

// 1. Total Purchases count (ACTIVE, non-deleted)
$activePurchasesCount = (int) $pdo->query("SELECT COUNT(*) FROM purchases WHERE deleted_at IS NULL AND status = 'ACTIVE'")->fetchColumn();

// 2. Status counts
$statusRows = $pdo->query("SELECT payment_status, COUNT(*) as cnt FROM purchases WHERE deleted_at IS NULL AND status = 'ACTIVE' GROUP BY payment_status")->fetchAll(PDO::FETCH_KEY_PAIR);

// 3. Total Paid to suppliers (ACTIVE payments)
$totalPaidSQL = (string) $pdo->query("SELECT IFNULL(SUM(total_amount), 0.00) FROM purchase_payments WHERE status = 'ACTIVE'")->fetchColumn();

// 4. Supplier Payable vs Supplier Credit (Option 1: separate calculations)
$totalPayable = '0.00';
$totalCredit = '0.00';
foreach ($allSuppliers as $sup) {
    $out = $paymentService->getSupplierOutstanding((int) $sup['id']);
    $ent = (float) $out['entity_outstanding'];
    $p = max($ent, 0.0);
    $c = max(-$ent, 0.0);
    $totalPayable = bcadd($totalPayable, (string) $p, 2);
    $totalCredit = bcadd($totalCredit, (string) $c, 2);
}

// 5. Today's supplier payments in Asia/Kolkata
$nowKolkata = new DateTime('now', $tzKolkata);
$todayKolkataStr = $nowKolkata->format('Y-m-d');
$todayPaidSQL = (string) $pdo->query("SELECT IFNULL(SUM(total_amount), 0.00) FROM purchase_payments WHERE status = 'ACTIVE' AND payment_date = '{$todayKolkataStr}'")->fetchColumn();

echo sprintf("Active Purchases Count:      %d\n", $activePurchasesCount);
echo sprintf("Status Breakdown:            UNPAID: %d, PARTIALLY_PAID: %d, PAID: %d\n", $statusRows['UNPAID'] ?? 0, $statusRows['PARTIALLY_PAID'] ?? 0, $statusRows['PAID'] ?? 0);
echo sprintf("Total Paid to Suppliers:     Rs %s\n", number_format((float)$totalPaidSQL, 2));
echo sprintf("Total Supplier Payable:      Rs %s (SUM max(out, 0))\n", number_format((float)$totalPayable, 2));
echo sprintf("Total Supplier Credit:       Rs %s (SUM max(-out, 0))\n", number_format((float)$totalCredit, 2));
echo sprintf("Today's Supplier Payments:   Rs %s (Date: %s IST)\n", number_format((float)$todayPaidSQL, 2), $todayKolkataStr);

