<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

putenv('APP_ENV=testing');
$_ENV['APP_ENV'] = 'testing';
require dirname(__DIR__) . '/config/database.php';

use App\Services\ReturnService;

echo "=== RETURNS MANAGEMENT PRODUCTION TEST SUITE ===\n";

$pdo = db();
$currentDb = $pdo->query('SELECT DATABASE()')->fetchColumn();
echo "✓ Connected safely to test database: {$currentDb}\n";
assert($currentDb === 'unified_pos_test', "Must run on test database!");

$returnSvc = new ReturnService($pdo);

// 1. Test Summary
echo "-> Testing summary metrics...\n";
$summary = $returnSvc->summary();
assert(isset($summary['total_requests']['count']), "Summary must have total_requests count");
assert(isset($summary['pending_review']['count']), "Summary must have pending_review count");
assert(isset($summary['approved_processing']['count']), "Summary must have approved_processing count");
assert(isset($summary['completed']['count']), "Summary must have completed count");
echo "✓ Summary metrics validated: " . json_encode($summary) . "\n";

// 2. Setup a test delivered order with items
echo "-> Setting up test customer and delivered order...\n";
$custId = (int) ($pdo->query('SELECT id FROM customers LIMIT 1')->fetchColumn() ?: 0);
if ($custId === 0) {
    $pdo->prepare("INSERT INTO customers (name, phone, status) VALUES ('Priya Test', '9888776655', 'ACTIVE')")->execute();
    $custId = (int) $pdo->lastInsertId();
}

// Find a variant
$variant = $pdo->query("SELECT id, product_id, sku, normal_price FROM product_variants WHERE status = 'ACTIVE' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
if (!$variant) {
    throw new RuntimeException("No active variant found");
}

$orderNo = 'ORD-RET-' . time() . '-' . random_int(100, 999);
$pdo->prepare(
    "INSERT INTO orders (
        order_no, customer_id, status, payment_status, subtotal, grand_total,
        shipping_name, shipping_phone, shipping_line1, shipping_city_district, shipping_state, shipping_pincode, placed_at
    ) VALUES (
        :no, :cid, 'DELIVERED', 'PAID', 1250.00, 1250.00,
        'Priya', '9888776655', 'No.12, Main Road', 'Tenkasi', 'Tamil Nadu', '627811', NOW()
    )"
)->execute([
    'no' => $orderNo,
    'cid' => $custId,
]);
$orderId = (int) $pdo->lastInsertId();

$pdo->prepare(
    "INSERT INTO order_items (
        order_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total
    ) VALUES (
        :oid, :pid, :vid, 'Skin Care Kit', :sku, 2, 1500.00, 625.00, 1250.00
    )"
)->execute([
    'oid' => $orderId,
    'pid' => $variant['product_id'],
    'vid' => $variant['id'],
    'sku' => $variant['sku'],
]);
$orderItemId = (int) $pdo->lastInsertId();
echo "✓ Created test delivered order #{$orderId} ({$orderNo}) with 2 units\n";

// 3. Test Eligible Orders
echo "-> Testing eligible orders retrieval...\n";
$eligible = $returnSvc->getEligibleOrders($orderNo);
assert(count($eligible) >= 1, "Should find the created delivered order");
assert($eligible[0]['items'][0]['remaining_qty'] === 2, "Remaining quantity should be 2");
echo "✓ Eligible orders query verified\n";

// 4. Test Create Return
echo "-> Testing return creation for 1 unit (Replacement)...\n";
$returnId = $returnSvc->createReturn([
    'order_id' => $orderId,
    'return_type' => 'REPLACEMENT',
    'reason' => 'Wrong product',
    'notes' => 'Received wrong shade',
    'items' => [
        [
            'order_item_id' => $orderItemId,
            'qty' => 1,
        ],
    ],
], 1);

assert($returnId > 0, "Return ID must be positive");
$retRecord = $returnSvc->find($returnId);
assert($retRecord !== null, "Created return must be found");
assert(str_starts_with($retRecord['return_no'], 'RMA-'), "Return number must start with RMA-");
assert($retRecord['status'] === 'PENDING_REVIEW', "Initial status must be PENDING_REVIEW");
assert($retRecord['return_type'] === 'REPLACEMENT', "Return type must be REPLACEMENT");
assert(count($retRecord['items']) === 1, "Must have 1 return item");
assert(count($retRecord['history']) >= 1, "Must have initial status history event");
echo "✓ Return created successfully: {$retRecord['return_no']} (ID: {$returnId})\n";

// 5. Test Duplicate / Excess Quantity Prevention
echo "-> Testing excess return quantity rejection...\n";
try {
    $returnSvc->createReturn([
        'order_id' => $orderId,
        'return_type' => 'REFUND',
        'reason' => 'Size issue',
        'items' => [
            [
                'order_item_id' => $orderItemId,
                'qty' => 2, // Only 1 remaining!
            ],
        ],
    ], 1);
    assert(false, "Should have thrown exception for excess quantity");
} catch (RuntimeException $e) {
    assert(str_contains($e->getMessage(), 'remain returnable'), "Error must indicate quantity limit");
    echo "✓ Correctly rejected excess return quantity: " . $e->getMessage() . "\n";
}

// 6. Test List and Filtering
echo "-> Testing list with filters...\n";
$listAll = $returnSvc->list(['tab' => 'all', 'search' => $retRecord['return_no']]);
assert($listAll['total'] >= 1, "List must find return by RMA number");
assert($listAll['items'][0]['return_no'] === $retRecord['return_no'], "Matching return number expected");
echo "✓ List & tab filters verified\n";

// 7. Test State Transitions
echo "-> Testing State Machine transitions...\n";
// Invalid transition: PENDING_REVIEW to COMPLETED directly
try {
    $returnSvc->updateStatus($returnId, 'COMPLETED');
    assert(false, "Should reject invalid transition from PENDING_REVIEW to COMPLETED");
} catch (RuntimeException $e) {
    echo "✓ Correctly rejected invalid transition: " . $e->getMessage() . "\n";
}

// Valid transition: PENDING_REVIEW -> APPROVED
$approved = $returnSvc->updateStatus($returnId, 'APPROVED', 'Approved by admin', 1);
assert($approved['status'] === 'APPROVED', "Status must be APPROVED");
echo "✓ Transition to APPROVED verified\n";

// Valid transition: APPROVED -> PICKUP_SCHEDULED
$pickup = $returnSvc->updateStatus($returnId, 'PICKUP_SCHEDULED', 'Pickup assigned', 1, [
    'pickup_partner' => 'Bluedart Logistics',
    'pickup_tracking_id' => 'BD' . random_int(100000, 999999),
]);
assert($pickup['status'] === 'PICKUP_SCHEDULED', "Status must be PICKUP_SCHEDULED");
assert($pickup['pickup_partner'] === 'Bluedart Logistics', "Pickup partner must be persisted");
echo "✓ Transition to PICKUP_SCHEDULED verified\n";

// Valid transition: PICKUP_SCHEDULED -> ITEM_RECEIVED
$received = $returnSvc->updateStatus($returnId, 'ITEM_RECEIVED', 'Package arrived at hub', 1);
assert($received['status'] === 'ITEM_RECEIVED', "Status must be ITEM_RECEIVED");
echo "✓ Transition to ITEM_RECEIVED verified\n";

// Valid transition: ITEM_RECEIVED -> INSPECTION with RESELLABLE
echo "-> Testing INSPECTION with inventory restocking...\n";
$stockBefore = (float) ($pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variant['id']}")->fetchColumn() ?: 0);
$inspected = $returnSvc->updateStatus($returnId, 'INSPECTION', 'Item in mint condition', 1, [
    'condition' => 'RESELLABLE',
    'inspection_notes' => 'Original seal intact',
]);
assert($inspected['status'] === 'INSPECTION', "Status must be INSPECTION");
assert($inspected['inspection_condition'] === 'RESELLABLE', "Condition must be RESELLABLE");
assert((int) $inspected['stock_credited'] === 1, "Stock must be credited");

$stockAfter = (float) ($pdo->query("SELECT on_hand FROM inventory WHERE variant_id = {$variant['id']}")->fetchColumn() ?: 0);
assert($stockAfter === ($stockBefore + 1), "Stock must have increased by 1 returned unit");
echo "✓ Restocking verified: {$stockBefore} -> {$stockAfter}\n";

// Valid transition: INSPECTION -> PROCESSING -> COMPLETED
$processing = $returnSvc->updateStatus($returnId, 'PROCESSING', 'Processing replacement unit', 1);
assert($processing['status'] === 'PROCESSING', "Status must be PROCESSING");

$completed = $returnSvc->updateStatus($returnId, 'COMPLETED', 'Replacement fulfilled and closed', 1);
assert($completed['status'] === 'COMPLETED', "Status must be COMPLETED");
assert(!empty($completed['completed_at']), "Completed timestamp must be set");
echo "✓ Transition to COMPLETED verified\n";

// 8. Test Second Return with Refund & Financial Ledger
echo "-> Testing second return with REFUND flow...\n";
$returnId2 = $returnSvc->createReturn([
    'order_id' => $orderId,
    'return_type' => 'REFUND',
    'reason' => 'Damaged item',
    'notes' => 'Bottle leaked in transit',
    'items' => [
        [
            'order_item_id' => $orderItemId,
            'qty' => 1,
        ],
    ],
], 1);

// Approve second return
$returnSvc->updateStatus($returnId2, 'APPROVED', 'Approved for immediate refund', 1);
$refundResult = $returnSvc->processRefund($returnId2, 1, 'UPI');
assert($refundResult['refund_status'] === 'REFUNDED', "Refund status must be REFUNDED");

// Check finance_transactions record
$finStmt = $pdo->prepare("SELECT * FROM finance_transactions WHERE reference_no = :ref");
$finStmt->execute(['ref' => $refundResult['return_no']]);
$finRow = $finStmt->fetch(PDO::FETCH_ASSOC);
assert($finRow !== false, "Finance transaction must be recorded for refund");
assert((float) $finRow['amount'] === 625.00, "Refund amount must be Rs 625.00");
echo "✓ Refund processing & financial ledger reconciliation verified\n";

// 9. Test Rejection with reason required
echo "-> Testing rejection with required reason on test return...\n";
$orderNo3 = 'ORD-REJ-' . time();
$pdo->prepare(
    "INSERT INTO orders (order_no, customer_id, status, payment_status, subtotal, grand_total, shipping_name, shipping_phone, shipping_line1, shipping_city_district, shipping_state, shipping_pincode)
     VALUES (:no, :cid, 'DELIVERED', 'PAID', 625.00, 625.00, 'Test', '9999999999', 'Street', 'City', 'State', '600001')"
)->execute(['no' => $orderNo3, 'cid' => $custId]);
$orderId3 = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO order_items (order_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total) VALUES (:oid, :pid, :vid, 'Test Item', 'SKU-REJ', 1, 625, 625, 625)")->execute(['oid' => $orderId3, 'pid' => $variant['product_id'], 'vid' => $variant['id']]);
$orderItemId3 = (int) $pdo->lastInsertId();

$returnId3 = $returnSvc->createReturn([
    'order_id' => $orderId3,
    'return_type' => 'REFUND',
    'reason' => 'Defective',
    'items' => [['order_item_id' => $orderItemId3, 'qty' => 1]],
], 1);

try {
    $returnSvc->updateStatus($returnId3, 'REJECTED', null, 1);
    assert(false, "Should require rejection reason");
} catch (RuntimeException $e) {
    assert(str_contains($e->getMessage(), 'rejection reason is required'), "Must validate rejection reason");
    echo "✓ Correctly required rejection reason: " . $e->getMessage() . "\n";
}

$rejected = $returnSvc->updateStatus($returnId3, 'REJECTED', null, 1, ['rejection_reason' => 'Item was altered by customer']);
assert($rejected['status'] === 'REJECTED', "Status must be REJECTED");
assert($rejected['rejection_reason'] === 'Item was altered by customer', "Rejection reason must be saved");
echo "✓ Return rejection verified\n";

// 10. Test Customer findByOrder
echo "-> Testing Customer tracking endpoint findByOrder...\n";
$custTracking = $returnSvc->findByOrder($orderId);
assert($custTracking !== null, "Customer tracking should find latest return");
assert(count($custTracking['history']) > 0, "History should be loaded");
echo "✓ Customer tracking synchronization verified\n";

echo "\n============================================================\n";
echo "✓ ALL RETURNS MANAGEMENT BACKEND TESTS PASSED 100%!\n";
echo "============================================================\n";
