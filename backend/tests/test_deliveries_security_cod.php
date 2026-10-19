<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

putenv('APP_ENV=testing');
$_ENV['APP_ENV'] = 'testing';
require dirname(__DIR__) . '/config/database.php';

use App\Services\DeliveryService;

echo "====================================================================\n";
echo "=== UNIFIED POS — DELIVERIES SECURITY & COD HARMONIZATION TESTS ===\n";
echo "====================================================================\n";

$pdo = db();
$currentDb = $pdo->query('SELECT DATABASE()')->fetchColumn();
echo "✓ Connected safely to test database: {$currentDb}\n";
assert($currentDb === 'unified_pos_test', "Must run on test database!");

$deliverySvc = new DeliveryService($pdo);
$testSecret = 'whsec_test_mock_secret_998877';

// Helper to run webhook worker
function runWebhook(string $headerName, string $headerVal, ?string $envSecret, array $payload): array {
    $cmd = 'php ' . escapeshellarg(__DIR__ . '/webhook_worker.php') . ' '
        . escapeshellarg($headerName) . ' '
        . escapeshellarg($headerVal) . ' '
        . ($envSecret !== null ? escapeshellarg($envSecret) : '');

    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $proc = proc_open($cmd, $descriptors, $pipes);
    if (!is_resource($proc)) {
        throw new RuntimeException("Failed to spawn webhook worker");
    }

    fwrite($pipes[0], json_encode($payload));
    fclose($pipes[0]);

    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($proc);

    $httpCode = 0;
    if (preg_match('/HTTP_CODE:(\d+)/', $stderr, $m)) {
        $httpCode = (int) $m[1];
    }

    $json = json_decode($stdout, true) ?? [];
    return ['code' => $httpCode, 'body' => $json, 'stdout' => $stdout, 'stderr' => $stderr];
}

// Helper to create test customer & order
function createTestOrder(PDO $pdo, string $paymentStatus = 'PENDING', float $total = 850.00): array {
    $uid = time() . '-' . rand(1000, 9999);
    $phone = '97' . rand(10000000, 99999999);
    $pdo->prepare("INSERT INTO customers (name, phone, status, customer_type) VALUES ('Security Test Cust', :phone, 'ACTIVE', 'RETAIL')")
        ->execute(['phone' => $phone]);
    $customerId = (int) $pdo->lastInsertId();

    $orderNo = "ORD-SEC-{$uid}";
    $pdo->prepare(
        "INSERT INTO orders (
            order_no, customer_id, status, payment_status, subtotal, grand_total,
            shipping_name, shipping_phone, shipping_line1, shipping_city_district, shipping_state, shipping_pincode
        ) VALUES (
            :order_no, :cid, 'CONFIRMED', :pstatus, :subtotal, :grand_total,
            'Test Recipient', :phone, '100 Security Blvd', 'Chennai', 'Tamil Nadu', '600002'
        )"
    )->execute([
        'order_no' => $orderNo,
        'cid' => $customerId,
        'pstatus' => $paymentStatus,
        'subtotal' => $total,
        'grand_total' => $total,
        'phone' => $phone,
    ]);
    $orderId = (int) $pdo->lastInsertId();

    $pdo->prepare(
        "INSERT INTO order_items (
            order_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total
        ) VALUES (
            :oid, 1, 1, 'Test Security Item', 'SKU-SEC-01', 1, :mrp, :unit_price, :line_total
        )"
    )->execute([
        'oid' => $orderId,
        'mrp' => $total,
        'unit_price' => $total,
        'line_total' => $total,
    ]);

    return ['order_id' => $orderId, 'order_no' => $orderNo, 'customer_id' => $customerId, 'uid' => $uid, 'total' => $total];
}

echo "\n--- SCENARIO 1: Inbound Webhook Secret Authentication ---\n";
// 1.1 Secret missing on server -> 503
$r1_1 = runWebhook('HTTP_X_WEBHOOK_SECRET', 'any_secret', 'UNSET', ['awb' => 'AWB-101', 'status' => 'IN_TRANSIT']);
assert($r1_1['code'] === 503, "Webhook must return 503 if secret unconfigured on server (got {$r1_1['code']})");
echo "✓ Webhook rejected with 503 when server secret is unconfigured (fail-closed)\n";

// 1.2 Secret missing from client request -> 401
$r1_2 = runWebhook('NONE', '', $testSecret, ['awb' => 'AWB-101', 'status' => 'IN_TRANSIT']);
assert($r1_2['code'] === 401, "Webhook must return 401 if secret missing from request (got {$r1_2['code']})");
echo "✓ Webhook rejected with 401 when request secret is missing\n";

// 1.3 Invalid secret provided -> 401
$r1_3 = runWebhook('HTTP_X_WEBHOOK_SECRET', 'wrong_secret_xyz', $testSecret, ['awb' => 'AWB-101', 'status' => 'IN_TRANSIT']);
assert($r1_3['code'] === 401, "Webhook must return 401 on secret mismatch (got {$r1_3['code']})");
echo "✓ Webhook rejected with 401 when invalid secret is provided\n";

// 1.4 Valid secret provided via HTTP_X_WEBHOOK_SECRET or Bearer token
$testOrder1 = createTestOrder($pdo, 'PENDING', 600.00);
$testAwb1 = "AWB-SEC-{$testOrder1['uid']}";
$delId1 = $deliverySvc->createForOrder($testOrder1['order_id'], [
    'delivery_channel' => 'COURIER',
    'courier_partner' => 'Delhivery',
    'awb' => $testAwb1,
]);

$r1_4 = runWebhook('HTTP_X_WEBHOOK_SECRET', $testSecret, $testSecret, [
    'awb' => $testAwb1,
    'status' => 'IN_TRANSIT',
    'note' => 'Package moving between hubs',
]);
if ($r1_4['code'] !== 200) {
    echo "R1_4 DEBUG: " . json_encode($r1_4) . "\n";
}
assert($r1_4['code'] === 200, "Webhook must return 200 for valid secret (got {$r1_4['code']})");
$dAfter1 = $deliverySvc->find($delId1);
assert($dAfter1['status'] === 'IN_TRANSIT', "Status must transition to IN_TRANSIT");
echo "✓ Webhook accepted with 200 when authenticated with valid secret\n";

echo "\n--- SCENARIO 2: Allowed Webhook Status Transitions & Deduplication ---\n";
// 2.1 Invalid delivery status string -> 422
$r2_1 = runWebhook('HTTP_X_WEBHOOK_SECRET', $testSecret, $testSecret, [
    'awb' => $testAwb1,
    'status' => 'EXPLODED_IN_FLAMES',
]);
assert($r2_1['code'] === 422, "Webhook must return 422 on invalid status (got {$r2_1['code']})");
echo "✓ Malformed / unsupported delivery status rejected with 422\n";

// 2.2 Transition from IN_TRANSIT to DELIVERED
$eventId1 = "evt_del_{$testOrder1['uid']}";
$r2_2 = runWebhook('HTTP_X_WEBHOOK_SECRET', $testSecret, $testSecret, [
    'awb' => $testAwb1,
    'status' => 'DELIVERED',
    'event_id' => $eventId1,
    'note' => 'Delivered to recipient',
]);
assert($r2_2['code'] === 200, "Webhook must allow transition IN_TRANSIT -> DELIVERED");
$dAfter2 = $deliverySvc->find($delId1);
assert($dAfter2['status'] === 'DELIVERED', "Delivery status must be DELIVERED");
echo "✓ Allowed transition IN_TRANSIT -> DELIVERED succeeded\n";

// 2.3 Duplicate event replay prevention (same event_id)
$r2_3 = runWebhook('HTTP_X_WEBHOOK_SECRET', $testSecret, $testSecret, [
    'awb' => $testAwb1,
    'status' => 'DELIVERED',
    'event_id' => $eventId1,
]);
assert($r2_3['code'] === 200, "Idempotent event should return 200");
$syncLogs = $pdo->prepare("SELECT COUNT(*) FROM courier_sync_logs WHERE JSON_UNQUOTE(JSON_EXTRACT(payload_sanitized, '$.event_id')) = :eid");
$syncLogs->execute(['eid' => $eventId1]);
assert((int)$syncLogs->fetchColumn() === 1, "Duplicate event_id must not create duplicate courier_sync_logs");
echo "✓ Webhook duplicate event replayed safely without redundant log/state mutation\n";

// 2.4 Illegal transition attempt: DELIVERED -> PICKED_UP -> 422
$r2_4 = runWebhook('HTTP_X_WEBHOOK_SECRET', $testSecret, $testSecret, [
    'awb' => $testAwb1,
    'status' => 'PICKED_UP',
    'event_id' => "evt_illegal_{$testOrder1['uid']}",
]);
assert($r2_4['code'] === 422, "Illegal transition DELIVERED -> PICKED_UP must be rejected with 422 (got {$r2_4['code']})");
echo "✓ Illegal transition DELIVERED -> PICKED_UP strictly rejected with 422\n";

echo "\n--- SCENARIO 3: Webhook DELIVERED Does NOT Alter COD or Payment State ---\n";
// Check delivery 1: It was marked DELIVERED via webhook in Scenario 2.2
$dCheck = $deliverySvc->find($delId1);
assert($dCheck['status'] === 'DELIVERED', "Delivery is DELIVERED");
assert($dCheck['cod_status'] === 'PENDING', "COD status MUST REMAIN PENDING after delivery webhook");
assert((float)$dCheck['cod_collected_amount'] === 0.0, "cod_collected_amount MUST REMAIN 0.00");

// Check the order in DB
$orderStmt = $pdo->prepare('SELECT status, payment_status FROM orders WHERE id = :id');
$orderStmt->execute(['id' => $testOrder1['order_id']]);
$oCheck = $orderStmt->fetch();
assert($oCheck['status'] === 'DELIVERED', "Order delivery status synced to DELIVERED");
assert($oCheck['payment_status'] === 'PENDING', "Order payment_status MUST REMAIN PENDING! Webhook delivery never marks order paid");
echo "✓ Confirmed: Webhook reporting DELIVERED does NOT mark COD collected or order paid\n";

echo "\n--- SCENARIO 4: Concurrency-Safe COD Collection ---\n";
// Create a new COD order and delivery
$testOrder2 = createTestOrder($pdo, 'PENDING', 1250.00);
$testAwb2 = "AWB-COD-{$testOrder2['uid']}";
$delId2 = $deliverySvc->createForOrder($testOrder2['order_id'], [
    'delivery_channel' => 'COURIER',
    'courier_partner' => 'Blue Dart Express',
    'awb' => $testAwb2,
]);
// Transition delivery to DELIVERED
$deliverySvc->updateStatus($delId2, 'PICKED_UP', 'ADMIN', 'Dispatched', 1);
$deliverySvc->updateStatus($delId2, 'DELIVERED', 'ADMIN', 'Delivered to customer', 1);

// Spawn 2 parallel worker processes simultaneously attempting to collect COD for delId2
$workerCmd = 'php ' . escapeshellarg(__DIR__ . '/cod_collect_worker.php') . " {$delId2} 1250.00 1";
$descriptors = [
    0 => ['pipe', 'r'],
    1 => ['pipe', 'w'],
    2 => ['pipe', 'w'],
];

$proc1 = proc_open($workerCmd, $descriptors, $pipes1);
$proc2 = proc_open($workerCmd, $descriptors, $pipes2);

$out1 = stream_get_contents($pipes1[1]);
$out2 = stream_get_contents($pipes2[1]);

fclose($pipes1[0]); fclose($pipes1[1]); fclose($pipes1[2]); proc_close($proc1);
fclose($pipes2[0]); fclose($pipes2[1]); fclose($pipes2[2]); proc_close($proc2);

$res1 = json_decode($out1, true);
$res2 = json_decode($out2, true);

echo "Worker 1 Result: " . trim($out1) . "\n";
echo "Worker 2 Result: " . trim($out2) . "\n";

$oneSucceeded = ($res1['status'] === 'SUCCESS' && $res2['status'] === 'ERROR')
             || ($res2['status'] === 'SUCCESS' && $res1['status'] === 'ERROR');

assert($oneSucceeded, "Exactly one concurrent COD collection must succeed, the other must fail");

// Check the error code of the failing worker
$failedRes = ($res1['status'] === 'ERROR') ? $res1 : $res2;
assert($failedRes['code'] === 409, "Failed concurrent collection must return HTTP 409 Conflict");

// Verify that EXACTLY ONE finance transaction exists in the database
$ftStmt = $pdo->prepare("SELECT * FROM finance_transactions WHERE transaction_no = :txno");
$ftStmt->execute(['txno' => "TX-COD-DEL-{$delId2}"]);
$ftRows = $ftStmt->fetchAll();
assert(count($ftRows) === 1, "Must have exactly 1 finance transaction entry for this delivery");
assert((float)$ftRows[0]['amount'] === 1250.00, "Finance amount must match COD total");

// Verify order is marked PAID
$oAfter = $pdo->query("SELECT payment_status FROM orders WHERE id = {$testOrder2['order_id']}")->fetchColumn();
assert($oAfter === 'PAID', "Order must be marked PAID");

echo "✓ Concurrency test passed: Exactly 1 worker succeeded, 1 rejected with 409, exactly 1 finance transaction created\n";

echo "\n--- SCENARIO 5: Transaction Atomicity (Rollback on Ledger Error) ---\n";
// Create a third COD order and delivery
$testOrder3 = createTestOrder($pdo, 'PENDING', 950.00);
$delId3 = $deliverySvc->createForOrder($testOrder3['order_id'], [
    'delivery_channel' => 'COURIER',
    'courier_partner' => 'Delhivery',
    'awb' => "AWB-ATOMIC-{$testOrder3['uid']}",
]);
$deliverySvc->updateStatus($delId3, 'DELIVERED', 'ADMIN', 'Delivered', 1);

// Simulate a collision by inserting a pre-existing finance record with the deterministic reference TX-COD-DEL-{$delId3}
$pdo->prepare(
    "INSERT INTO finance_transactions (
        transaction_no, transaction_date, type, category, amount, payment_method, reference_no, notes, created_by
    ) VALUES (
        :txno, CURRENT_DATE(), 'INCOME', 'COD_COLLECTION', 950.00, 'CASH', 'COLLISION-TEST', 'Simulated collision', 1
    )"
)->execute(['txno' => "TX-COD-DEL-{$delId3}"]);

// Attempt collectCod — the finance insert will fail due to duplicate key uq_ft_no
$rollbackTriggered = false;
try {
    $deliverySvc->collectCod($delId3, 950.00, 1, 'Attempt collection with ledger collision');
    assert(false, "Should have thrown duplicate-key exception");
} catch (RuntimeException $e) {
    assert($e->getCode() === 409, "Exception code must be 409 Conflict");
    $rollbackTriggered = true;
    echo "✓ Expected exception caught: {$e->getMessage()}\n";
}
assert($rollbackTriggered, "Rollback must be triggered on ledger error");

// Verify that the delivery update and order update were rolled back!
$delStateAfter = $deliverySvc->find($delId3);
assert($delStateAfter['cod_status'] === 'PENDING', "Delivery cod_status must remain PENDING after rollback");
assert((float)$delStateAfter['cod_collected_amount'] === 0.00, "Delivery cod_collected_amount must remain 0.00 after rollback");

$orderStateAfter = $pdo->query("SELECT payment_status FROM orders WHERE id = {$testOrder3['order_id']}")->fetchColumn();
assert($orderStateAfter === 'PENDING', "Order payment_status must remain PENDING after rollback");
echo "✓ Confirmed: Ledger failure safely rolled back delivery and order updates atomically\n";

// Clean up simulated collision record
$pdo->exec("DELETE FROM finance_transactions WHERE transaction_no = 'TX-COD-DEL-{$delId3}'");

echo "\n--- SCENARIO 6: Rejection of Already Collected / Reconciled COD ---\n";
// delivery 2 was already successfully collected in Scenario 4
try {
    $deliverySvc->collectCod($delId2, 1250.00, 1, 'Retry collection');
    assert(false, "Must not allow collecting already collected COD");
} catch (RuntimeException $e) {
    assert($e->getCode() === 409, "Exception code must be 409 Conflict");
    echo "✓ Correctly rejected collection on already COLLECTED delivery: {$e->getMessage()}\n";
}

// Test NOT_APPLICABLE prepaid order
$prepaidOrder = createTestOrder($pdo, 'PAID', 400.00);
$prepaidDelId = $deliverySvc->createForOrder($prepaidOrder['order_id'], [
    'delivery_channel' => 'COURIER',
    'courier_partner' => 'Ekart Logistics',
    'awb' => "AWB-PRE-{$prepaidOrder['uid']}",
]);
try {
    $deliverySvc->collectCod($prepaidDelId, 400.00, 1, 'Collect COD on prepaid');
    assert(false, "Must not allow collecting COD on prepaid order");
} catch (RuntimeException $e) {
    assert(in_array($e->getCode(), [409, 422], true), "Exception code must be 422 Unprocessable or 409 Conflict");
    echo "✓ Correctly rejected collection on NOT_APPLICABLE prepaid delivery: {$e->getMessage()}\n";
}

echo "\n--- SCENARIO 7: Own-Fleet Assignment Rejected by Backend ---\n";
// 7.1 Reject OWN_DELIVERY on creation
$fleetOrder = createTestOrder($pdo, 'PENDING', 500.00);
try {
    $deliverySvc->createForOrder($fleetOrder['order_id'], [
        'delivery_channel' => 'OWN_DELIVERY',
        'driver_id' => 1,
        'driver_name' => 'Fleet Driver',
        'vehicle_no' => 'TN-01-9999',
    ]);
    assert(false, "Must reject OWN_DELIVERY on creation");
} catch (RuntimeException $e) {
    assert($e->getCode() === 422, "Must return 422 for Own Fleet assignment");
    echo "✓ Creation rejected: {$e->getMessage()}\n";
}

// 7.2 Reject driver_id even if delivery_channel not specified
try {
    $deliverySvc->createForOrder($fleetOrder['order_id'], [
        'driver_id' => 2,
    ]);
    assert(false, "Must reject driver_id on creation");
} catch (RuntimeException $e) {
    assert($e->getCode() === 422, "Must return 422 for driver_id");
    echo "✓ Creation with driver_id rejected: {$e->getMessage()}\n";
}

// 7.3 Create valid courier delivery and attempt reassigning to OWN_DELIVERY
$fleetDelId = $deliverySvc->createForOrder($fleetOrder['order_id'], [
    'delivery_channel' => 'COURIER',
    'courier_partner' => 'Delhivery',
    'awb' => "AWB-REASSIGN-{$fleetOrder['uid']}",
]);
try {
    $deliverySvc->updateAssignment($fleetDelId, [
        'delivery_channel' => 'OWN_DELIVERY',
        'driver_id' => 1,
    ], 1);
    assert(false, "Must reject reassigning to OWN_DELIVERY");
} catch (RuntimeException $e) {
    assert($e->getCode() === 422, "Must return 422 for Own Fleet reassignment");
    echo "✓ Reassignment to OWN_DELIVERY rejected: {$e->getMessage()}\n";
}

// 7.4 Reject invalid courier partner ID
try {
    $deliverySvc->updateAssignment($fleetDelId, [
        'courier_partner_id' => 999999, // Non-existent partner ID
    ], 1);
    assert(false, "Must reject non-existent courier partner ID");
} catch (RuntimeException $e) {
    echo "✓ Non-existent courier partner ID rejected: {$e->getMessage()}\n";
}

echo "\n--- SCENARIO 8: External Courier Assignment & Customer Tracking ---\n";
// 8.1 Valid courier assignment with canonical courier_partner_id
$activeCp = $pdo->query("SELECT id, name FROM courier_partners WHERE status = 'ACTIVE' LIMIT 1")->fetch();
assert(!empty($activeCp), "At least one active courier partner must exist");

$validTrackingAwb = "TRK-AWB-{$fleetOrder['uid']}";
$updatedDel = $deliverySvc->updateAssignment($fleetDelId, [
    'courier_partner_id' => (int) $activeCp['id'],
    'awb' => $validTrackingAwb,
    'tracking_url' => "https://track.example.com/{$validTrackingAwb}",
    'expected_delivery_date' => date('Y-m-d', strtotime('+3 days')),
], 1);

assert((int)$updatedDel['courier_partner_id'] === (int)$activeCp['id'], "courier_partner_id must be stored canonically");
assert($updatedDel['courier_partner'] === $activeCp['name'], "courier_partner string populated for backward compatibility");
assert($updatedDel['awb'] === $validTrackingAwb, "AWB updated");
assert($updatedDel['tracking_url'] === "https://track.example.com/{$validTrackingAwb}", "Tracking URL stored");
echo "✓ External courier assigned with canonical courier_partner_id and backward compatible fields\n";

// 8.2 Customer tracking lookup
$custTracking = $deliverySvc->findByOrder($fleetOrder['order_id']);
assert($custTracking !== null, "findByOrder must return delivery for customer tracking");
assert($custTracking['awb'] === $validTrackingAwb, "Customer sees correct AWB");
assert($custTracking['tracking_url'] === "https://track.example.com/{$validTrackingAwb}", "Customer sees tracking URL");
assert(count($custTracking['history']) >= 2, "Customer sees chronological status history events");
echo "✓ Customer tracking findByOrder returns accurate AWB, tracking URL, and history events\n";

echo "\n====================================================================\n";
echo "✓ ALL 8 DELIVERIES SECURITY & COD HARMONIZATION TESTS PASSED 100%!\n";
echo "====================================================================\n";
