<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../config/database.php';
require_once __DIR__ . '/test_guard.php';

use App\Services\ReturnService;
use App\Tests\TestDbGuard;

$pdo = db();
TestDbGuard::assertTestDatabase($pdo, __FILE__);

echo "======================================================================\n";
echo "TASK: CUSTOMER RETURN REQUEST WORKFLOW TEST SUITE\n";
echo "Database: unified_pos_test\n";
echo "======================================================================\n\n";

$passed = 0;
$failed = 0;

function assertTest(string $name, bool $condition, string $detail = ''): void
{
    global $passed, $failed;
    if ($condition) {
        echo "  [PASS] {$name}" . ($detail ? " -> {$detail}" : '') . "\n";
        $passed++;
    } else {
        echo "  [FAIL] {$name}" . ($detail ? " -> {$detail}" : '') . "\n";
        $failed++;
    }
}

$uid = uniqid();
$returns = new ReturnService($pdo);

// ---------------------------------------------------------------------
// Fixtures: two customers, a returnable product + a non-returnable
// product, a delivered order (with a real deliveries.delivered_at row —
// the only thing eligibility is ever computed from) containing one item
// of each.
// ---------------------------------------------------------------------
$phone1 = '9' . random_int(100000000, 999999999);
$phone2 = '9' . random_int(100000000, 999999999);
$pdo->prepare("INSERT INTO customers (name, phone, status) VALUES (:name, :phone, 'ACTIVE')")
    ->execute(['name' => "T-Return Customer {$uid}", 'phone' => $phone1]);
$customerId = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO customers (name, phone, status) VALUES (:name, :phone, 'ACTIVE')")
    ->execute(['name' => "T-Return Other Customer {$uid}", 'phone' => $phone2]);
$otherCustomerId = (int) $pdo->lastInsertId();

$pdo->exec("INSERT INTO products (name, slug, returnable, return_window_days) VALUES ('T-Return Returnable Product {$uid}', 't-return-returnable-{$uid}', 1, 7)");
$returnableProductId = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO product_variants (product_id, sku, mrp, retail_price) VALUES (:p, :sku, 500, 500)")
    ->execute(['p' => $returnableProductId, 'sku' => "T-RETURN-SKU-{$uid}"]);
$returnableVariantId = (int) $pdo->lastInsertId();

$pdo->exec("INSERT INTO products (name, slug, returnable, return_window_days) VALUES ('T-Return Non-Returnable Product {$uid}', 't-return-nonreturnable-{$uid}', 0, NULL)");
$nonReturnableProductId = (int) $pdo->lastInsertId();
$pdo->prepare("INSERT INTO product_variants (product_id, sku, mrp, retail_price) VALUES (:p, :sku, 300, 300)")
    ->execute(['p' => $nonReturnableProductId, 'sku' => "T-RETURN-NR-SKU-{$uid}"]);
$nonReturnableVariantId = (int) $pdo->lastInsertId();

function makeDeliveredOrder(PDO $pdo, int $customerId, string $uid, string $deliveredAt, array $items): int
{
    $orderNo = 'TRET-' . substr(md5($uid . random_int(0, PHP_INT_MAX)), 0, 16);
    $pdo->prepare(
        "INSERT INTO orders (order_no, customer_id, status, payment_status, subtotal, grand_total,
            shipping_name, shipping_phone, shipping_line1, shipping_city_district, shipping_state, shipping_pincode)
         VALUES (:no, :cid, 'DELIVERED', 'PAID', 500, 500, 'Test', '9999999999', 'Line 1', 'City', 'State', '600001')"
    )->execute(['no' => $orderNo, 'cid' => $customerId]);
    $orderId = (int) $pdo->lastInsertId();

    foreach ($items as $item) {
        $pdo->prepare(
            "INSERT INTO order_items (order_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total)
             VALUES (:oid, :pid, :vid, :name, :sku, :qty, :mrp, :price, :total)"
        )->execute([
            'oid' => $orderId, 'pid' => $item['product_id'], 'vid' => $item['variant_id'],
            'name' => $item['name'], 'sku' => $item['sku'], 'qty' => $item['qty'],
            'mrp' => $item['price'], 'price' => $item['price'], 'total' => $item['price'] * $item['qty'],
        ]);
    }

    $pdo->prepare(
        "INSERT INTO deliveries (order_id, status, awb, delivered_at) VALUES (:oid, 'DELIVERED', :awb, :delivered_at)"
    )->execute(['oid' => $orderId, 'awb' => 'TRET-' . $uid, 'delivered_at' => $deliveredAt]);

    return $orderId;
}

// ---------------------------------------------------------------------
// GROUP 1: eligibility — returnable vs non-returnable, within window
// ---------------------------------------------------------------------
echo "-- Eligibility: returnable + non-returnable items --\n";
$deliveredAt = date('Y-m-d H:i:s', strtotime('-2 days'));
$orderId = makeDeliveredOrder($pdo, $customerId, $uid, $deliveredAt, [
    ['product_id' => $returnableProductId, 'variant_id' => $returnableVariantId, 'name' => 'Returnable Item', 'sku' => "T-RETURN-SKU-{$uid}", 'qty' => 2, 'price' => 500],
    ['product_id' => $nonReturnableProductId, 'variant_id' => $nonReturnableVariantId, 'name' => 'Non-Returnable Item', 'sku' => "T-RETURN-NR-SKU-{$uid}", 'qty' => 1, 'price' => 300],
]);

$eligibility = $returns->eligibilityForOrder($orderId, $customerId);
assertTest('delivered_at reflects the deliveries row, not order.created_at', $eligibility['delivered_at'] === $deliveredAt, (string) $eligibility['delivered_at']);

$returnableItem = null;
$nonReturnableItem = null;
foreach ($eligibility['items'] as $it) {
    if ($it['product_id'] === $returnableProductId) $returnableItem = $it;
    if ($it['product_id'] === $nonReturnableProductId) $nonReturnableItem = $it;
}
assertTest('Returnable item (within window) reports eligible', $returnableItem['eligible'] === true, json_encode($returnableItem));
assertTest('Returnable item deadline = delivered_at + 7 days', $returnableItem['return_deadline'] === date('Y-m-d H:i:s', strtotime($deliveredAt . ' +7 days')));
assertTest('Non-returnable item reports NOT eligible', $nonReturnableItem['eligible'] === false && $nonReturnableItem['reason'] === 'This item is not eligible for return.', json_encode($nonReturnableItem));

// ---------------------------------------------------------------------
// GROUP 2: eligibility — window expired, and never-delivered order
// ---------------------------------------------------------------------
echo "\n-- Eligibility: expired window / undelivered order --\n";
$oldDeliveredAt = date('Y-m-d H:i:s', strtotime('-30 days'));
$expiredOrderId = makeDeliveredOrder($pdo, $customerId, $uid . '-exp', $oldDeliveredAt, [
    ['product_id' => $returnableProductId, 'variant_id' => $returnableVariantId, 'name' => 'Returnable Item', 'sku' => "T-RETURN-SKU-{$uid}", 'qty' => 1, 'price' => 500],
]);
$expiredElig = $returns->eligibilityForOrder($expiredOrderId, $customerId);
assertTest('Return window expired (delivered 30 days ago, 7-day window)', $expiredElig['items'][0]['eligible'] === false && $expiredElig['items'][0]['reason'] === 'Return window expired.', json_encode($expiredElig['items'][0]));

// No deliveries row at all — order.status says DELIVERED but there's no
// verified delivery timestamp, which must never be trusted as a fallback.
$undeliveredOrderNo = 'TRET-UND-' . substr(md5($uid), 0, 12);
$pdo->prepare(
    "INSERT INTO orders (order_no, customer_id, status, payment_status, subtotal, grand_total,
        shipping_name, shipping_phone, shipping_line1, shipping_city_district, shipping_state, shipping_pincode)
     VALUES (:no, :cid, 'DELIVERED', 'PAID', 500, 500, 'Test', '9999999999', 'Line 1', 'City', 'State', '600001')"
)->execute(['no' => $undeliveredOrderNo, 'cid' => $customerId]);
$undeliveredOrderId = (int) $pdo->lastInsertId();
$pdo->prepare(
    "INSERT INTO order_items (order_id, product_id, variant_id, product_name_snapshot, sku_snapshot, quantity, mrp, unit_price, line_total)
     VALUES (:oid, :pid, :vid, 'Returnable Item', :sku, 1, 500, 500, 500)"
)->execute(['oid' => $undeliveredOrderId, 'pid' => $returnableProductId, 'vid' => $returnableVariantId, 'sku' => "T-RETURN-SKU-{$uid}"]);
$undeliveredElig = $returns->eligibilityForOrder($undeliveredOrderId, $customerId);
assertTest('order.status=DELIVERED with no deliveries.delivered_at is NOT treated as delivered', $undeliveredElig['delivered_at'] === null && $undeliveredElig['items'][0]['eligible'] === false && $undeliveredElig['items'][0]['reason'] === 'This order has not been delivered yet.', json_encode($undeliveredElig));

// ---------------------------------------------------------------------
// GROUP 3: ownership — another customer cannot see or act on this order
// ---------------------------------------------------------------------
echo "\n-- Ownership enforcement --\n";
try {
    $returns->eligibilityForOrder($orderId, $otherCustomerId);
    assertTest('A different customer cannot read this order\'s eligibility', false);
} catch (RuntimeException $e) {
    assertTest('A different customer cannot read this order\'s eligibility', str_contains($e->getMessage(), 'Unauthorized') || str_contains($e->getMessage(), 'belong'), $e->getMessage());
}

try {
    $returns->createReturn(['order_id' => $orderId, 'reason' => 'Ordered by mistake', 'items' => [['order_item_id' => 1, 'qty' => 1]]], null, $otherCustomerId);
    assertTest('A different customer cannot create a return for this order', false);
} catch (RuntimeException $e) {
    assertTest('A different customer cannot create a return for this order', str_contains($e->getMessage(), 'Unauthorized'), $e->getMessage());
}

// ---------------------------------------------------------------------
// GROUP 4: a genuine customer submission — persists reported_condition,
// packaging_available, supporting images, and notifies admins exactly once
// ---------------------------------------------------------------------
echo "\n-- Customer return submission --\n";
$orderItemsStmt = $pdo->prepare("SELECT id, product_id, quantity FROM order_items WHERE order_id = :oid ORDER BY id");
$orderItemsStmt->execute(['oid' => $orderId]);
$orderItems = $orderItemsStmt->fetchAll(PDO::FETCH_ASSOC);
$returnableOrderItem = null;
foreach ($orderItems as $oi) {
    if ((int) $oi['product_id'] === $returnableProductId) $returnableOrderItem = $oi;
}

$adminManagerCount = (int) $pdo->query(
    "SELECT COUNT(DISTINCT u.id) FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.status = 'ACTIVE' AND u.deleted_at IS NULL
       AND (r.code = 'ADMIN' OR EXISTS (SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = r.id AND p.code = 'orders.manage'))"
)->fetchColumn();
$adminNotifBefore = (int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE type = 'RETURN_REQUESTED'")->fetchColumn();

$returnId = $returns->createReturn(
    data: [
        'order_id' => $orderId,
        'reason' => 'Damaged product',
        'notes' => 'Box was crushed',
        'return_type' => 'REFUND',
        'items' => [['order_item_id' => $returnableOrderItem['id'], 'qty' => 1]],
    ],
    createdByUserId: null,
    customerId: $customerId,
    reportedCondition: 'DAMAGED_ON_ARRIVAL',
    packagingAvailable: false,
    imagePaths: [['path' => 'uploads/returns/fake-test-image.webp', 'thumb_path' => 'uploads/returns/fake-test-image-thumb.webp']],
);
assertTest('Customer return request created', $returnId > 0, (string) $returnId);

$created = $returns->find($returnId);
assertTest('reported_condition persisted', $created['reported_condition'] === 'DAMAGED_ON_ARRIVAL');
assertTest('packaging_available persisted as false', (int) $created['packaging_available'] === 0);
assertTest('Supporting image row persisted', count($created['images']) === 1 && $created['images'][0]['image_path'] === 'uploads/returns/fake-test-image.webp', json_encode($created['images']));
assertTest('created_by is NULL for a customer-originated request (distinguishes it from the admin/POS path)', $created['created_by'] === null);

$adminNotifAfter = (int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE type = 'RETURN_REQUESTED'")->fetchColumn();
assertTest(
    'Exactly one new admin notification per order-manager user created for this submission',
    $adminNotifAfter === $adminNotifBefore + $adminManagerCount,
    "{$adminNotifBefore} -> {$adminNotifAfter} ({$adminManagerCount} managers)"
);

$adminNotif = $pdo->query("SELECT reference_id, reference_type FROM notifications WHERE type = 'RETURN_REQUESTED' ORDER BY id DESC LIMIT 1")->fetch(PDO::FETCH_ASSOC);
assertTest('Admin notification links to this return', (int) $adminNotif['reference_id'] === $returnId && $adminNotif['reference_type'] === 'RETURN');

// ---------------------------------------------------------------------
// GROUP 5: quantity enforcement — excessive and duplicate/concurrent
// ---------------------------------------------------------------------
echo "\n-- Quantity validation / duplicate prevention --\n";
try {
    $returns->createReturn([
        'order_id' => $orderId, 'reason' => 'Ordered by mistake',
        'items' => [['order_item_id' => $returnableOrderItem['id'], 'qty' => 99]],
    ], null, $customerId);
    assertTest('Excessive quantity is rejected', false);
} catch (RuntimeException $e) {
    assertTest('Excessive quantity is rejected', str_contains($e->getMessage(), 'remain returnable'), $e->getMessage());
}

// The first request above already consumed 1 of the 2 units; a second
// request for the SAME remaining unit must still succeed (1 remains)...
$secondReturnId = $returns->createReturn([
    'order_id' => $orderId, 'reason' => 'Ordered by mistake',
    'items' => [['order_item_id' => $returnableOrderItem['id'], 'qty' => 1]],
], null, $customerId);
assertTest('Second request for the LAST remaining unit succeeds', $secondReturnId > 0);

// ...but now all 2 units are spoken for (both PENDING_REVIEW, which counts
// as "already returned" — see createReturn()'s own docblock) — a THIRD
// request for this same item must be rejected as having nothing left.
$postEligibility = $returns->eligibilityForOrder($orderId, $customerId);
$postItem = null;
foreach ($postEligibility['items'] as $it) {
    if ($it['product_id'] === $returnableProductId) $postItem = $it;
}
assertTest('After both units are requested, remaining_qty is 0 and item is no longer eligible', $postItem['remaining_qty'] === 0 && $postItem['eligible'] === false, json_encode($postItem));

try {
    $returns->createReturn([
        'order_id' => $orderId, 'reason' => 'Ordered by mistake',
        'items' => [['order_item_id' => $returnableOrderItem['id'], 'qty' => 1]],
    ], null, $customerId);
    assertTest('A third request for an item with 0 remaining quantity is rejected', false);
} catch (RuntimeException $e) {
    assertTest('A third request for an item with 0 remaining quantity is rejected', str_contains($e->getMessage(), 'remain returnable'), $e->getMessage());
}

// ---------------------------------------------------------------------
// GROUP 6: admin approval does not disturb the ORIGINAL order's status,
// and notifies the customer exactly once per status change
// ---------------------------------------------------------------------
echo "\n-- Admin approval: order status untouched, customer notified --\n";
$orderStatusBefore = $pdo->query("SELECT status FROM orders WHERE id = {$orderId}")->fetchColumn();
$custNotifBefore = (int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE type = 'RETURN_STATUS_UPDATED' AND reference_id = {$returnId}")->fetchColumn();

$adminUserId = (int) ($pdo->query("SELECT id FROM users WHERE role_id = (SELECT id FROM roles WHERE code = 'ADMIN') LIMIT 1")->fetchColumn() ?: 1);
$approved = $returns->updateStatus($returnId, 'APPROVED', 'Looks good', $adminUserId);
assertTest('Return transitions to APPROVED', $approved['status'] === 'APPROVED');

$orderStatusAfter = $pdo->query("SELECT status FROM orders WHERE id = {$orderId}")->fetchColumn();
assertTest('Approving a return never resets the order to Packed/Shipped/Delivered — status unchanged by this step', $orderStatusAfter === $orderStatusBefore, "{$orderStatusBefore} -> {$orderStatusAfter}");

$custNotifAfter = (int) $pdo->query("SELECT COUNT(*) FROM notifications WHERE type = 'RETURN_STATUS_UPDATED' AND reference_id = {$returnId}")->fetchColumn();
assertTest('Customer notified exactly once for the APPROVED transition', $custNotifAfter === $custNotifBefore + 1, "{$custNotifBefore} -> {$custNotifAfter}");

try {
    $returns->updateStatus($returnId, 'REJECTED', null, $adminUserId, []);
    assertTest('Rejecting without a reason is refused', false);
} catch (RuntimeException $e) {
    assertTest('Rejecting without a reason is refused', str_contains($e->getMessage(), 'rejection reason'), $e->getMessage());
}

// ---------------------------------------------------------------------
// GROUP 7: replacement order creation — linked, not double-created
// ---------------------------------------------------------------------
echo "\n-- Replacement order creation --\n";
$replOrderId = makeDeliveredOrder($pdo, $customerId, $uid . '-repl', date('Y-m-d H:i:s', strtotime('-1 day')), [
    ['product_id' => $returnableProductId, 'variant_id' => $returnableVariantId, 'name' => 'Returnable Item', 'sku' => "T-RETURN-SKU-{$uid}", 'qty' => 1, 'price' => 500],
]);
$replOrderItemId = (int) $pdo->query("SELECT id FROM order_items WHERE order_id = {$replOrderId} LIMIT 1")->fetchColumn();

$replReturnId = $returns->createReturn([
    'order_id' => $replOrderId, 'return_type' => 'REPLACEMENT', 'reason' => 'Defective / not working',
    'items' => [['order_item_id' => $replOrderItemId, 'qty' => 1]],
], null, $customerId);
$returns->updateStatus($replReturnId, 'APPROVED', 'Approved for replacement', $adminUserId);

$withReplacement = $returns->createReplacementOrder($replReturnId, $adminUserId);
assertTest('Replacement order linked to the return', $withReplacement['replacement_order_id'] > 0 && $withReplacement['replacement_status'] === 'PROCESSING', json_encode($withReplacement['replacement_order_id']));

$replacementOrder = $pdo->query("SELECT status, customer_id FROM orders WHERE id = {$withReplacement['replacement_order_id']}")->fetch(PDO::FETCH_ASSOC);
assertTest('Replacement order created for the same customer, ready to fulfill', (int) $replacementOrder['customer_id'] === $customerId && $replacementOrder['status'] === 'CONFIRMED', json_encode($replacementOrder));

$replacementItemCount = (int) $pdo->query("SELECT COUNT(*) FROM order_items WHERE order_id = {$withReplacement['replacement_order_id']}")->fetchColumn();
assertTest('Replacement order carries the returned item', $replacementItemCount === 1);

try {
    $returns->createReplacementOrder($replReturnId, $adminUserId);
    assertTest('A second replacement order cannot be created for the same return', false);
} catch (RuntimeException $e) {
    assertTest('A second replacement order cannot be created for the same return', str_contains($e->getMessage(), 'already been created'), $e->getMessage());
}

echo "\n======================================================================\n";
echo "RESULTS: {$passed} passed, {$failed} failed\n";
echo "======================================================================\n";

exit($failed > 0 ? 1 : 0);
