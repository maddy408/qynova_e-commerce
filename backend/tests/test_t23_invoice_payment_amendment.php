<?php

declare(strict_types=1);

// T23: Phase 5 — Invoice Amendment (InvoicePaymentService). Replaces the
// old InvoiceController::update() endpoint, which let amount_paid/status
// be rewritten directly via a raw UPDATE with zero validation. Verifies:
//   - createPosSale() now backs its own amount_paid with a real
//     invoice_payments row at creation time (G9).
//   - collectPayment() validates, caps at the remaining balance, derives
//     payment_status/payment_method, is idempotent, and audit-logs.
//   - reversePayment() undoes a payment correctly and re-derives totals.
//   - CREDIT is rejected as a payment line method (it's not a payment).
//
// Usage: php tests/test_t23_invoice_payment_amendment.php

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/test_guard.php';

use App\Services\InventoryService;
use App\Services\InvoicePaymentService;
use App\Services\InvoiceService;
use App\Tests\TestDbGuard;

echo "=== TASK T23: INVOICE PAYMENT AMENDMENT (collect/reverse) ===\n\n";

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

$inventoryService = new InventoryService($pdo);
$invoiceService = new InvoiceService($pdo, $inventoryService);
$paymentService = new InvoicePaymentService($pdo, $invoiceService);
$adminUserId = 1;

$variant = $pdo->query('
    SELECT v.id AS variant_id, p.name as product_name, v.normal_price
    FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE v.status = "ACTIVE" AND v.normal_price > 0
    ORDER BY v.id ASC LIMIT 1
')->fetch();
if (!$variant) {
    throw new RuntimeException('No active priced variant found in test database');
}
$vId = (int) $variant['variant_id'];
$price = (string) $variant['normal_price'];

$custId = $pdo->query('SELECT id FROM customers WHERE deleted_at IS NULL LIMIT 1')->fetchColumn();
if (!$custId) {
    $pdo->prepare('INSERT INTO customers (name, phone, customer_type, created_at, updated_at) VALUES ("T23 Test Customer", "9998887733", "RETAIL", NOW(), NOW())')->execute();
    $custId = (int) $pdo->lastInsertId();
} else {
    $custId = (int) $custId;
}

$createdInvoiceIds = [];

echo "--- Part A: createPosSale() backs its own amount_paid with a real payment row ---\n";

$paidInvId = $invoiceService->createPosSale(
    items: [['variant_id' => $vId, 'quantity' => 1, 'unit_price' => (float) $price, 'product_name' => $variant['product_name']]],
    customerId: $custId,
    cashierUserId: $adminUserId,
    paymentMethod: 'CASH',
    amountPaid: $price,
);
$createdInvoiceIds[] = $paidInvId;

$autoPayment = $pdo->query("SELECT SUM(total_amount) FROM invoice_payments WHERE invoice_id = {$paidInvId} AND status = 'ACTIVE'")->fetchColumn();
assertCondition((float) $autoPayment === (float) $price, "A fully-paid sale at creation automatically gets an invoice_payments row summing to the price paid, got {$autoPayment}");

echo "\n--- Part B: UNPAID (CREDIT) invoice + collectPayment() ---\n";

$creditInvId = $invoiceService->createPosSale(
    items: [['variant_id' => $vId, 'quantity' => 2, 'unit_price' => (float) $price, 'product_name' => $variant['product_name']]],
    customerId: $custId,
    cashierUserId: $adminUserId,
    paymentMethod: 'CREDIT',
    amountPaid: '0.00',
);
$createdInvoiceIds[] = $creditInvId;

$noPaymentYet = (int) $pdo->query("SELECT COUNT(*) FROM invoice_payments WHERE invoice_id = {$creditInvId}")->fetchColumn();
assertCondition($noPaymentYet === 0, 'A CREDIT sale with amount_paid=0 creates no invoice_payments row (nothing to attribute)');

$creditInvoice = $invoiceService->find($creditInvId);
$grandTotal = (string) $creditInvoice['grand_total'];
$halfAmount = bcdiv($grandTotal, '2', 2);

// TEST: CREDIT rejected as a payment line method.
$creditLineRejected = false;
try {
    $paymentService->collectPayment($creditInvId, ['amount' => $halfAmount, 'lines' => [['method' => 'CREDIT', 'amount' => $halfAmount]]], $adminUserId);
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'Credit')) {
        $creditLineRejected = true;
    }
}
assertCondition($creditLineRejected, 'CREDIT is rejected as a payment line method');

// TEST: collect a partial payment (CASH).
$result1 = $paymentService->collectPayment($creditInvId, [
    'amount' => $halfAmount,
    'lines' => [['method' => 'CASH', 'amount' => $halfAmount]],
], $adminUserId);
assertCondition($result1['invoice']['payment_status'] === 'PARTIAL', "Partial payment of half the total gives payment_status=PARTIAL, got {$result1['invoice']['payment_status']}");
assertCondition((float) $result1['invoice']['amount_paid'] === (float) $halfAmount, 'invoice.amount_paid reflects the partial payment');
$firstPaymentId = (int) $result1['payment']['id'];

// TEST: paying the remaining balance (UPI, with reference) completes it.
$remaining = bcsub($grandTotal, $halfAmount, 2);
$result2 = $paymentService->collectPayment($creditInvId, [
    'amount' => $remaining,
    'lines' => [['method' => 'UPI', 'amount' => $remaining, 'reference_no' => 'UTR-T23-TEST']],
], $adminUserId);
assertCondition($result2['invoice']['payment_status'] === 'PAID', "Paying off the remaining balance gives payment_status=PAID, got {$result2['invoice']['payment_status']}");
assertCondition($result2['invoice']['payment_method'] === 'SPLIT', "payment_method becomes SPLIT across CASH+UPI active payments, got {$result2['invoice']['payment_method']}");

// TEST: overpayment is rejected now that the balance is 0.
$overpayRejected = false;
try {
    $paymentService->collectPayment($creditInvId, ['amount' => '1.00', 'lines' => [['method' => 'CASH', 'amount' => '1.00']]], $adminUserId);
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'exceeds')) {
        $overpayRejected = true;
    }
}
assertCondition($overpayRejected, 'Collecting a payment beyond the (now zero) remaining balance is rejected');

// TEST: UPI reference number required.
$refRequired = false;
try {
    $paymentService->collectPayment($creditInvId, ['amount' => '1.00', 'lines' => [['method' => 'UPI', 'amount' => '1.00']]], $adminUserId);
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'Reference number')) {
        $refRequired = true;
    }
}
assertCondition($refRequired, 'UPI payment line without a reference_no is rejected');

echo "\n--- Part C: idempotency ---\n";

$idemKey = 'T23-IDEM-' . bin2hex(random_bytes(4));
$extraInvId = $invoiceService->createPosSale(
    items: [['variant_id' => $vId, 'quantity' => 1, 'unit_price' => (float) $price, 'product_name' => $variant['product_name']]],
    customerId: $custId,
    cashierUserId: $adminUserId,
    paymentMethod: 'CREDIT',
    amountPaid: '0.00',
);
$createdInvoiceIds[] = $extraInvId;

$firstCall = $paymentService->collectPayment($extraInvId, [
    'amount' => '1.00',
    'idempotency_key' => $idemKey,
    'lines' => [['method' => 'CASH', 'amount' => '1.00']],
], $adminUserId);
$secondCall = $paymentService->collectPayment($extraInvId, [
    'amount' => '1.00',
    'idempotency_key' => $idemKey,
    'lines' => [['method' => 'CASH', 'amount' => '1.00']],
], $adminUserId);
assertCondition($firstCall['payment']['id'] === $secondCall['payment']['id'], 'Replaying the same idempotency_key returns the same payment, not a duplicate');
$paymentCountForExtra = (int) $pdo->query("SELECT COUNT(*) FROM invoice_payments WHERE invoice_id = {$extraInvId}")->fetchColumn();
assertCondition($paymentCountForExtra === 1, 'Only one invoice_payments row exists despite the duplicate call');

echo "\n--- Part D: reversePayment() ---\n";

$beforeReverse = $invoiceService->find($creditInvId);
$reverseResult = $paymentService->reversePayment($creditInvId, $firstPaymentId, 'T23 test reversal', $adminUserId);
assertCondition($reverseResult['invoice']['payment_status'] === 'PARTIAL', "Reversing the CASH half-payment drops status back to PARTIAL, got {$reverseResult['invoice']['payment_status']}");
assertCondition((float) $reverseResult['invoice']['amount_paid'] === (float) $remaining, 'amount_paid drops back to just the remaining UPI payment after reversal');
assertCondition($reverseResult['invoice']['payment_method'] === 'UPI', "payment_method re-derives to UPI (the only active line left), got {$reverseResult['invoice']['payment_method']}");

$doubleReverseRejected = false;
try {
    $paymentService->reversePayment($creditInvId, $firstPaymentId, 'try again', $adminUserId);
} catch (RuntimeException $e) {
    if (str_contains($e->getMessage(), 'already reversed')) {
        $doubleReverseRejected = true;
    }
}
assertCondition($doubleReverseRejected, 'Reversing an already-reversed payment is rejected');

// G9 check: SUM(active invoice_payments) must equal invoices.amount_paid.
$sumActive = (string) $pdo->query("SELECT IFNULL(SUM(total_amount),0) FROM invoice_payments WHERE invoice_id = {$creditInvId} AND status = 'ACTIVE'")->fetchColumn();
$invoiceAmountPaid = (string) $pdo->query("SELECT amount_paid FROM invoices WHERE id = {$creditInvId}")->fetchColumn();
assertCondition(bccomp($sumActive, $invoiceAmountPaid, 2) === 0, "G9: SUM(active invoice_payments)={$sumActive} equals invoices.amount_paid={$invoiceAmountPaid}");

// Audit log check.
$auditCount = (int) $pdo->query("SELECT COUNT(*) FROM audit_logs WHERE entity_type = 'invoice' AND entity_id = {$creditInvId} AND action IN ('INVOICE_PAYMENT_COLLECT', 'INVOICE_PAYMENT_REVERSE')")->fetchColumn();
assertCondition($auditCount >= 3, "At least 3 audit_logs rows written for this invoice's payment activity (2 collects + 1 reverse), got {$auditCount}");

echo "\n--- Cleanup ---\n";
foreach ($createdInvoiceIds as $invId) {
    $pdo->prepare('DELETE FROM audit_logs WHERE entity_type = "invoice" AND entity_id = ?')->execute([$invId]);
    $pdo->prepare('DELETE FROM invoice_payment_lines WHERE payment_id IN (SELECT id FROM invoice_payments WHERE invoice_id = ?)')->execute([$invId]);
    $pdo->prepare('DELETE FROM invoice_payments WHERE invoice_id = ?')->execute([$invId]);
    $pdo->prepare('DELETE FROM invoice_items WHERE invoice_id = ?')->execute([$invId]);
    $pdo->prepare('DELETE FROM invoices WHERE id = ?')->execute([$invId]);
}
echo "✓ Cleaned up T23 test invoices, payments, and audit logs\n";

echo "\n============================================\n";
echo "RESULT: {$passedCount} / {$totalTests} TESTS PASSED\n";
echo "============================================\n";
