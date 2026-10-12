<?php

declare(strict_types=1);

// T25: Phase 7 — Dashboard finance figures.
//
// 1. DashboardService::summary()['refunds']['total_refund_amount'] used
//    to be a blanket SUM(amount) over ALL refunds regardless of status —
//    PENDING/PROCESSING/FAILED/CANCELLED refunds never actually paid
//    money out, so that overstated real cash outflow. Now COMPLETED-only.
// 2. summary()['finance'] (total_income/total_expense/net_profit) is new
//    — previously the dashboard omitted this entirely on the premise
//    that no expenses/income module existed, which is no longer true
//    (FinanceController/finance_transactions are live, Phase 6 fixed
//    their permission gate).
//
// Usage: php tests/test_t25_dashboard_finance.php

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/test_guard.php';

use App\Services\DashboardService;
use App\Tests\TestDbGuard;

echo "=== TASK T25: DASHBOARD FINANCE FIGURES ===\n\n";

putenv('APP_ENV=testing');
$_ENV['APP_ENV'] = 'testing';
$_SERVER['APP_ENV'] = 'testing';
require_once __DIR__ . '/../config/database.php';

$pdo = db();
TestDbGuard::assertTestDatabase($pdo, __FILE__);
echo "✓ Connected safely to test database: " . $pdo->query('SELECT DATABASE()')->fetchColumn() . "\n\n";

$passedCount = 0;
$totalTests = 0;

function assertCondition(bool $cond, string $msg): void
{
    global $passedCount, $totalTests;
    $totalTests++;
    if (!$cond) {
        echo "❌ FAILED: {$msg}\n";
        throw new RuntimeException("Assertion failed: {$msg}");
    }
    $passedCount++;
    echo "✅ PASSED: {$msg}\n";
}

$dashboard = new DashboardService($pdo);

echo "--- Part A: refunds.total_refund_amount excludes non-COMPLETED ---\n";

$marker = 'T25-' . bin2hex(random_bytes(4));
$baselineBefore = $dashboard->summary();
$baselineTotal = (float) $baselineBefore['refunds']['total_refund_amount'];
$baselinePending = (float) $baselineBefore['refunds']['pending_refund_amount'];

// refunds has a CHECK constraint requiring exactly one of order_id /
// invoice_id — reuse any existing invoice for the FK.
$anyInvoiceId = (int) $pdo->query('SELECT id FROM invoices LIMIT 1')->fetchColumn();
if ($anyInvoiceId === 0) {
    throw new RuntimeException('No invoice found in test database to satisfy refunds.chk_refunds_source');
}

$refundRows = [
    ['status' => 'COMPLETED', 'amount' => '500.00'],
    ['status' => 'PENDING', 'amount' => '200.00'],
    ['status' => 'FAILED', 'amount' => '300.00'],
    ['status' => 'CANCELLED', 'amount' => '150.00'],
];
$insertStmt = $pdo->prepare(
    "INSERT INTO refunds (refund_no, invoice_id, amount, reason, method, status, requested_at)
     VALUES (:no, :invoice_id, :amount, :reason, 'CASH', :status, NOW())"
);
foreach ($refundRows as $i => $row) {
    $insertStmt->execute([
        'no' => "{$marker}-{$i}",
        'invoice_id' => $anyInvoiceId,
        'amount' => $row['amount'],
        'reason' => 'T25 test refund',
        'status' => $row['status'],
    ]);
}
echo "✓ Inserted 4 test refunds: 1 COMPLETED (500), 1 PENDING (200), 1 FAILED (300), 1 CANCELLED (150)\n";

$afterSummary = $dashboard->summary();
$totalAfter = (float) $afterSummary['refunds']['total_refund_amount'];
$pendingAfter = (float) $afterSummary['refunds']['pending_refund_amount'];

assertCondition(
    abs(($totalAfter - $baselineTotal) - 500.0) < 0.01,
    "total_refund_amount increased by exactly 500 (the COMPLETED one), not 1150 (all 4 summed), delta=" . ($totalAfter - $baselineTotal)
);
assertCondition(
    abs(($pendingAfter - $baselinePending) - 200.0) < 0.01,
    'pending_refund_amount increased by exactly 200 (the PENDING one), unaffected by this fix'
);

echo "\n--- Part B: finance block (income/expense/net_profit) ---\n";

$financeBefore = $dashboard->summary()['finance'];
$incomeBefore = (float) $financeBefore['total_income'];
$expenseBefore = (float) $financeBefore['total_expense'];

$ftStmt = $pdo->prepare(
    "INSERT INTO finance_transactions (transaction_no, type, category, amount, transaction_date)
     VALUES (:no, :type, 'T25 Test', :amount, CURDATE())"
);
$ftStmt->execute(['no' => "{$marker}-INC", 'type' => 'INCOME', 'amount' => '1000.00']);
$ftStmt->execute(['no' => "{$marker}-EXP", 'type' => 'EXPENSE', 'amount' => '400.00']);
echo "✓ Inserted 1 INCOME (1000) and 1 EXPENSE (400) test finance_transactions row\n";

$financeAfter = $dashboard->summary()['finance'];
assertCondition(abs(((float) $financeAfter['total_income'] - $incomeBefore) - 1000.0) < 0.01, 'total_income increased by exactly 1000');
assertCondition(abs(((float) $financeAfter['total_expense'] - $expenseBefore) - 400.0) < 0.01, 'total_expense increased by exactly 400');
$expectedNetDelta = 1000.0 - 400.0;
$netBefore = $incomeBefore - $expenseBefore;
$netAfter = (float) $financeAfter['net_profit'];
assertCondition(abs(($netAfter - $netBefore) - $expectedNetDelta) < 0.01, "net_profit = total_income - total_expense, delta matches +600, got " . ($netAfter - $netBefore));

// Soft-deleted finance_transactions must not count.
$softDeleteId = $pdo->lastInsertId();
$pdo->prepare("INSERT INTO finance_transactions (transaction_no, type, category, amount, transaction_date, deleted_at) VALUES (?, 'EXPENSE', 'T25 Deleted', '9999.00', CURDATE(), NOW())")->execute(["{$marker}-DELETED"]);
$financeAfterDeleted = $dashboard->summary()['finance'];
assertCondition(abs((float) $financeAfterDeleted['total_expense'] - (float) $financeAfter['total_expense']) < 0.01, 'A soft-deleted finance_transactions row is excluded from total_expense');

echo "\n--- Cleanup ---\n";
$pdo->prepare('DELETE FROM refunds WHERE refund_no LIKE ?')->execute(["{$marker}-%"]);
$pdo->prepare('DELETE FROM finance_transactions WHERE transaction_no LIKE ?')->execute(["{$marker}-%"]);
echo "✓ Cleaned up T25 test refunds and finance_transactions\n";

echo "\n============================================\n";
echo "RESULT: {$passedCount} / {$totalTests} TESTS PASSED\n";
echo "============================================\n";
