<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config/database.php';

use App\Services\PurchaseService;
use App\Services\InventoryService;
use App\Services\PaymentService;

/** @var PDO $pdo */
$pdo = db();

$inventory = new InventoryService($pdo);
$payments = new PaymentService($pdo);
$purchaseService = new PurchaseService($pdo, $inventory, $payments);

echo "=== C) TARGET PURCHASES AUDIT ===" . PHP_EOL;
$patterns = ['%9158', '%4228', '%9690', '%7104', '%3791'];

foreach ($patterns as $pattern) {
    $stmt = $pdo->prepare('SELECT id, purchase_no, status, deleted_at, grand_total, paid_amount, balance_amount, payment_status, payment_method FROM purchases WHERE purchase_no LIKE :pattern');
    $stmt->execute(['pattern' => $pattern]);
    $dbRow = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$dbRow) {
        echo "Pattern {$pattern}: NOT FOUND" . PHP_EOL;
        continue;
    }

    $apiRow = $purchaseService->find((int) $dbRow['id']);

    echo "--- Purchase {$dbRow['purchase_no']} (ID: {$dbRow['id']}) ---" . PHP_EOL;
    echo "DB Row:  " . json_encode($dbRow) . PHP_EOL;
    echo "API Row: " . json_encode([
        'purchase_no' => $apiRow['purchase_no'],
        'status' => $apiRow['status'],
        'deleted_at' => $apiRow['deleted_at'] ?? null,
        'grand_total' => $apiRow['grand_total'],
        'paid_amount' => $apiRow['paid_amount'],
        'balance_amount' => $apiRow['balance_amount'],
        'payment_status' => $apiRow['payment_status'],
        'payment_method' => $apiRow['payment_method'],
    ]) . PHP_EOL;
}

echo PHP_EOL . "=== E) CONSISTENCY QUERIES ===" . PHP_EOL;

echo "--- Q1: Status vs Amounts (ACTIVE, not deleted) ---" . PHP_EOL;
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
echo "Q1 Mismatches count: " . count($q1) . PHP_EOL;
if (count($q1) > 0) {
    print_r($q1);
}

echo "--- Q2: purchases.paid_amount = SUM(ACTIVE purchase_payments.total_amount) ---" . PHP_EOL;
$q2 = $pdo->query("
    SELECT p.id, p.purchase_no, p.paid_amount, COALESCE(SUM(pp.total_amount), 0) AS active_payments_sum
    FROM purchases p
    LEFT JOIN purchase_payments pp ON pp.purchase_id = p.id AND pp.status = 'ACTIVE'
    GROUP BY p.id, p.purchase_no, p.paid_amount
    HAVING ROUND(p.paid_amount, 2) != ROUND(active_payments_sum, 2)
")->fetchAll(PDO::FETCH_ASSOC);
echo "Q2 Mismatches count: " . count($q2) . PHP_EOL;
if (count($q2) > 0) {
    print_r($q2);
}

echo "--- Q3: purchase_payments.total_amount = SUM(purchase_payment_lines.amount) ---" . PHP_EOL;
$q3 = $pdo->query("
    SELECT pp.id, pp.purchase_id, pp.receipt_no, pp.total_amount, COALESCE(SUM(ppl.amount), 0) AS lines_sum
    FROM purchase_payments pp
    LEFT JOIN purchase_payment_lines ppl ON ppl.payment_id = pp.id
    GROUP BY pp.id, pp.purchase_id, pp.receipt_no, pp.total_amount
    HAVING ROUND(pp.total_amount, 2) != ROUND(lines_sum, 2)
")->fetchAll(PDO::FETCH_ASSOC);
echo "Q3 Mismatches count: " . count($q3) . PHP_EOL;
if (count($q3) > 0) {
    print_r($q3);
}
