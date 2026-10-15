<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../config/database.php';
require_once __DIR__ . '/test_guard.php';

use App\Services\CouponService;
use App\Services\DeviceTokenService;
use App\Services\FcmSenderService;
use App\Services\InventoryService;
use App\Services\InvoiceService;
use App\Services\NotificationDispatcher;
use App\Services\NotificationService;
use App\Services\OrderService;
use App\Services\RefundService;
use App\Tests\TestDbGuard;

$pdo = db();
TestDbGuard::assertTestDatabase($pdo, __FILE__);

echo "======================================================================\n";
echo "TASK T27: NOTIFICATIONS + FCM TEST SUITE\n";
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
$notificationService = new NotificationService($pdo);
$deviceTokens = new DeviceTokenService($pdo);
$fcm = new FcmSenderService($deviceTokens);
$dispatcher = new NotificationDispatcher($pdo, $notificationService, $deviceTokens, $fcm);

// ---------------------------------------------------------------------
// GROUP 1: NotificationService CRUD + authorization scoping
// ---------------------------------------------------------------------
echo "-- NotificationService CRUD + authorization --\n";

// Two distinct customers so cross-recipient access can be proven unreachable.
$pdo->exec("INSERT INTO customers (name, phone, customer_type) VALUES ('T27 Customer A {$uid}', '9{$uid}1', 'RETAIL')");
$customerAId = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO customers (name, phone, customer_type) VALUES ('T27 Customer B {$uid}', '9{$uid}2', 'RETAIL')");
$customerBId = (int) $pdo->lastInsertId();

$notifId = $notificationService->create('CUSTOMER', $customerAId, 'TEST_TYPE', 'Test title', 'Test body', 'ORDER', 123, ['foo' => 'bar']);
assertTest('create() returns a positive id', $notifId > 0);

$listA = $notificationService->listForRecipient('CUSTOMER', $customerAId);
assertTest('listForRecipient() returns the created notification for its real owner', $listA['total'] === 1 && $listA['items'][0]['id'] === $notifId);
assertTest('unread_count reflects the one unread notification', $listA['unread_count'] === 1);
assertTest('data JSON round-trips correctly', $listA['items'][0]['data']['foo'] === 'bar');

$listB = $notificationService->listForRecipient('CUSTOMER', $customerBId);
assertTest('A different customer sees NONE of customer A\'s notifications', $listB['total'] === 0 && $listB['unread_count'] === 0);

try {
    $notificationService->markRead('CUSTOMER', $customerBId, $notifId);
    assertTest('Customer B cannot mark customer A\'s notification read (should have thrown)', false);
} catch (RuntimeException $e) {
    assertTest('Customer B marking customer A\'s notification read throws cleanly', str_contains($e->getMessage(), 'not found'));
}

$stillUnread = $notificationService->unreadCount('CUSTOMER', $customerAId);
assertTest('The cross-recipient markRead attempt did not actually mark it read', $stillUnread === 1);

$notificationService->markRead('CUSTOMER', $customerAId, $notifId);
assertTest('The real owner CAN mark their own notification read', $notificationService->unreadCount('CUSTOMER', $customerAId) === 0);

$notificationService->create('CUSTOMER', $customerAId, 'TEST_TYPE', 'Second', 'Second body', null, null, null);
$notificationService->create('CUSTOMER', $customerAId, 'TEST_TYPE', 'Third', 'Third body', null, null, null);
$marked = $notificationService->markAllRead('CUSTOMER', $customerAId);
assertTest('markAllRead() marks exactly the 2 remaining unread notifications', $marked === 2);
assertTest('unread_count is 0 after markAllRead', $notificationService->unreadCount('CUSTOMER', $customerAId) === 0);

// ---------------------------------------------------------------------
// GROUP 2: DeviceTokenService — dedup, ownership scoping, reassignment
// ---------------------------------------------------------------------
echo "\n-- DeviceTokenService --\n";

$sharedToken = 'T27-TOKEN-' . $uid;
$deviceTokens->register('CUSTOMER', $customerAId, $sharedToken, 'WEB', 'TestAgent/1.0');
$tokensA = $deviceTokens->activeTokensFor('CUSTOMER', $customerAId);
assertTest('Token registered against customer A', in_array($sharedToken, $tokensA, true));

// Re-registering the SAME token for a DIFFERENT owner (e.g. logout then
// login as someone else on the same browser) must reassign, not duplicate.
$deviceTokens->register('CUSTOMER', $customerBId, $sharedToken, 'WEB', 'TestAgent/1.0');
$tokensAAfter = $deviceTokens->activeTokensFor('CUSTOMER', $customerAId);
$tokensBAfter = $deviceTokens->activeTokensFor('CUSTOMER', $customerBId);
assertTest('Token no longer belongs to customer A after being re-registered for customer B', !in_array($sharedToken, $tokensAAfter, true));
assertTest('Token now belongs to customer B', in_array($sharedToken, $tokensBAfter, true));

$tokenCount = (int) $pdo->query("SELECT COUNT(*) FROM device_tokens WHERE token = '{$sharedToken}'")->fetchColumn();
assertTest('Exactly ONE row exists for this token (UNIQUE KEY prevented a duplicate row)', $tokenCount === 1, (string) $tokenCount);

// remove() is scoped to the CALLER's own ownership — customer A trying
// to remove a token that is now B's must not affect it.
$deviceTokens->remove('CUSTOMER', $customerAId, $sharedToken);
assertTest('Customer A "removing" a token that is actually B\'s does nothing', in_array($sharedToken, $deviceTokens->activeTokensFor('CUSTOMER', $customerBId), true));

$deviceTokens->remove('CUSTOMER', $customerBId, $sharedToken);
assertTest('Customer B (the real owner) CAN remove their own token', !in_array($sharedToken, $deviceTokens->activeTokensFor('CUSTOMER', $customerBId), true));

// ---------------------------------------------------------------------
// GROUP 3: FcmSenderService / NotificationDispatcher — safe no-op when unconfigured
// ---------------------------------------------------------------------
echo "\n-- FcmSenderService / NotificationDispatcher (push unconfigured in this test env) --\n";

assertTest('FcmSenderService reports NOT configured (no real service-account file in this test env)', $fcm->isConfigured() === false);
assertTest('send() returns false (not throws) when unconfigured', $fcm->send('fake-token', 'title', 'body') === false);

$deviceTokens->register('CUSTOMER', $customerAId, 'T27-DISPATCH-TOKEN-' . $uid);
$dispatchId = $dispatcher->notify('CUSTOMER', $customerAId, 'TEST_DISPATCH', 'Dispatch title', 'Dispatch body');
assertTest('NotificationDispatcher::notify() still creates the in-app record even though push is unconfigured', $dispatchId > 0);
$found = $notificationService->listForRecipient('CUSTOMER', $customerAId, 1, 50);
assertTest('The dispatched notification appears in the recipient\'s list', in_array('Dispatch title', array_column($found['items'], 'title'), true));

// ---------------------------------------------------------------------
// GROUP 4: OrderService integration — the real business trigger points
// ---------------------------------------------------------------------
echo "\n-- OrderService notification triggers (full checkout -> confirm -> status -> cancel lifecycle) --\n";

$inventory = new InventoryService($pdo);
$coupons = new CouponService($pdo);
$refunds = new RefundService($pdo);
$invoices = new InvoiceService($pdo, $inventory, $coupons, $refunds);
$orders = new OrderService($pdo, $inventory, $coupons, $invoices, $refunds, $dispatcher);

// Minimal sellable product + variant for checkout to price against.
$pdo->exec("INSERT INTO products (name, slug, is_active, is_ecommerce_enabled) VALUES ('T27 Order Product {$uid}', 't27-order-product-{$uid}', 1, 1)");
$t27ProductId = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO product_variants (product_id, sku, mrp, retail_price, status) VALUES ({$t27ProductId}, 'T27-ORDER-SKU-{$uid}', 200, 150, 'ACTIVE')");
$t27VariantId = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold) VALUES ({$t27VariantId}, {$t27ProductId}, 100, 0, 5)");

$orderCustomerId = $customerAId;
$address = ['name' => 'T27 Test', 'phone' => '9999999999', 'line1' => '123 Test St', 'city_district' => 'Testville', 'state' => 'TS', 'pincode' => '123456'];

$adminUnreadBefore = $notificationService->unreadCount('USER', 1);
$order = $orders->checkout($orderCustomerId, [['variant_id' => $t27VariantId, 'quantity' => 2]], $address, null);
$orderId = (int) $order['id'];
$adminUnreadAfter = $notificationService->unreadCount('USER', 1);
assertTest('checkout() creates exactly one NEW_ORDER notification for the ADMIN user', $adminUnreadAfter === $adminUnreadBefore + 1, "{$adminUnreadBefore} -> {$adminUnreadAfter}");

$adminList = $notificationService->listForRecipient('USER', 1, 1, 5);
$newOrderNotif = $adminList['items'][0];
assertTest('The admin notification references the correct order id', ($newOrderNotif['data']['order_id'] ?? null) === $orderId, json_encode($newOrderNotif['data']));
assertTest('The admin notification type is NEW_ORDER', $newOrderNotif['type'] === 'NEW_ORDER');

$customerUnreadBefore = $notificationService->unreadCount('CUSTOMER', $orderCustomerId);
$orders->confirmPayment($orderId);
$customerUnreadAfter = $notificationService->unreadCount('CUSTOMER', $orderCustomerId);
assertTest('confirmPayment() notifies the CUSTOMER (not the admin) exactly once', $customerUnreadAfter === $customerUnreadBefore + 1);
$confirmNotif = $notificationService->listForRecipient('CUSTOMER', $orderCustomerId, 1, 1)['items'][0];
assertTest('Confirmation notification type is ORDER_CONFIRMED', $confirmNotif['type'] === 'ORDER_CONFIRMED');

foreach (['PROCESSING', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY'] as $status) {
    $before = $notificationService->unreadCount('CUSTOMER', $orderCustomerId);
    $orders->updateStatus($orderId, $status, 1, null);
    $after = $notificationService->unreadCount('CUSTOMER', $orderCustomerId);
    assertTest("updateStatus('{$status}') notifies the customer exactly once", $after === $before + 1, "{$before} -> {$after}");
}

// Business rule (not notification-specific) already prevents re-sending
// the same transition twice: status can only move forward, so repeating
// a transition throws before the notification call is ever reached —
// this is the dedup guarantee for status-change notifications.
$beforeRepeat = $notificationService->unreadCount('CUSTOMER', $orderCustomerId);
try {
    $orders->updateStatus($orderId, 'PACKED', 1, null);
    assertTest('Repeating an already-applied status transition should have thrown', false);
} catch (RuntimeException $e) {
    assertTest('Repeating an already-applied transition throws (forward-only rule)', str_contains($e->getMessage(), 'forward'));
}
$afterRepeat = $notificationService->unreadCount('CUSTOMER', $orderCustomerId);
assertTest('No duplicate notification was created by the rejected repeat transition', $afterRepeat === $beforeRepeat, "{$beforeRepeat} -> {$afterRepeat}");

// DELIVERED is the last forward step, then a separate order tests cancellation.
$orders->updateStatus($orderId, 'DELIVERED', 1, null);

// ---------------------------------------------------------------------
// GROUP 5: cancellation notifications — correct direction depending on actor
// ---------------------------------------------------------------------
echo "\n-- Cancellation notification direction --\n";

$pdo->exec("INSERT INTO product_variants (product_id, sku, mrp, retail_price, status) VALUES ({$t27ProductId}, 'T27-ORDER-SKU-B-{$uid}', 200, 150, 'ACTIVE')");
$t27VariantBId = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold) VALUES ({$t27VariantBId}, {$t27ProductId}, 100, 0, 5)");

$orderToCancelByCustomer = $orders->checkout($orderCustomerId, [['variant_id' => $t27VariantBId, 'quantity' => 1]], $address, null);
$adminBefore = $notificationService->unreadCount('USER', 1);
$orders->cancel((int) $orderToCancelByCustomer['id'], 'Changed my mind', null); // actorUserId=null => customer-initiated
$adminAfterCancel = $notificationService->unreadCount('USER', 1);
assertTest('Customer-initiated cancellation notifies the ADMIN (actorUserId=null)', $adminAfterCancel === $adminBefore + 1);

$pdo->exec("INSERT INTO product_variants (product_id, sku, mrp, retail_price, status) VALUES ({$t27ProductId}, 'T27-ORDER-SKU-C-{$uid}', 200, 150, 'ACTIVE')");
$t27VariantCId = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold) VALUES ({$t27VariantCId}, {$t27ProductId}, 100, 0, 5)");

$orderToCancelByAdmin = $orders->checkout($orderCustomerId, [['variant_id' => $t27VariantCId, 'quantity' => 1]], $address, null);
$customerBeforeCancel = $notificationService->unreadCount('CUSTOMER', $orderCustomerId);
$orders->cancel((int) $orderToCancelByAdmin['id'], 'Out of stock', 1); // actorUserId=1 => admin-initiated
$customerAfterCancel = $notificationService->unreadCount('CUSTOMER', $orderCustomerId);
assertTest('Admin-initiated cancellation notifies the CUSTOMER (actorUserId=1)', $customerAfterCancel === $customerBeforeCancel + 1);

// ---------------------------------------------------------------------
// GROUP 6: InventoryService low-stock crossing — fires once, not per-sale
// ---------------------------------------------------------------------
echo "\n-- InventoryService low-stock crossing (in-app only, no push, by design) --\n";

$pdo->exec("INSERT INTO product_variants (product_id, sku, mrp, retail_price, status) VALUES ({$t27ProductId}, 'T27-LOWSTOCK-SKU-{$uid}', 100, 80, 'ACTIVE')");
$lowStockVariantId = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold) VALUES ({$lowStockVariantId}, {$t27ProductId}, 10, 0, 5)");

$inventoryWithNotify = new InventoryService($pdo, $notificationService);

$adminBeforeStock = $notificationService->unreadCount('USER', 1);

$pdo->beginTransaction();
// 10 -> 6: still at/above a threshold of 5, no alert yet.
$inventoryWithNotify->apply(variantId: $lowStockVariantId, productId: $t27ProductId, movementType: 'STOCK_ADJUSTMENT_OUT', onHandDelta: '-4', reservedDelta: '0', referenceType: 'ADJUSTMENT', referenceId: 1, referenceItemId: null, channel: 'ADMIN', userId: 1, idempotencyKey: "t27-lowstock-a-{$uid}");
$pdo->commit();
$afterFirstDrop = $notificationService->unreadCount('USER', 1);
assertTest('Stock at 6 (still >= threshold 5) does not yet trigger a low-stock alert', $afterFirstDrop === $adminBeforeStock, "{$adminBeforeStock} -> {$afterFirstDrop}");

$pdo->beginTransaction();
// 6 -> 3: crosses below threshold 5 -> exactly one LOW_STOCK alert.
$inventoryWithNotify->apply(variantId: $lowStockVariantId, productId: $t27ProductId, movementType: 'STOCK_ADJUSTMENT_OUT', onHandDelta: '-3', reservedDelta: '0', referenceType: 'ADJUSTMENT', referenceId: 2, referenceItemId: null, channel: 'ADMIN', userId: 1, idempotencyKey: "t27-lowstock-b-{$uid}");
$pdo->commit();
$afterCrossing = $notificationService->unreadCount('USER', 1);
assertTest('Crossing below threshold (6 -> 3) triggers exactly one low-stock alert', $afterCrossing === $afterFirstDrop + 1, "{$afterFirstDrop} -> {$afterCrossing}");

$crossingNotif = $notificationService->listForRecipient('USER', 1, 1, 1)['items'][0];
assertTest('The alert type is LOW_STOCK (stock > 0)', $crossingNotif['type'] === 'LOW_STOCK');

$pdo->beginTransaction();
// 3 -> 2: still below threshold, already alerted -> must NOT alert again.
$inventoryWithNotify->apply(variantId: $lowStockVariantId, productId: $t27ProductId, movementType: 'STOCK_ADJUSTMENT_OUT', onHandDelta: '-1', reservedDelta: '0', referenceType: 'ADJUSTMENT', referenceId: 3, referenceItemId: null, channel: 'ADMIN', userId: 1, idempotencyKey: "t27-lowstock-c-{$uid}");
$pdo->commit();
$afterSecondDropBelow = $notificationService->unreadCount('USER', 1);
assertTest('A further decrement while already below threshold does NOT create a duplicate alert', $afterSecondDropBelow === $afterCrossing, "{$afterCrossing} -> {$afterSecondDropBelow}");

$pdo->beginTransaction();
// 2 -> 0: exactly out of stock -> a distinct OUT_OF_STOCK alert.
$inventoryWithNotify->apply(variantId: $lowStockVariantId, productId: $t27ProductId, movementType: 'STOCK_ADJUSTMENT_OUT', onHandDelta: '-2', reservedDelta: '0', referenceType: 'ADJUSTMENT', referenceId: 4, referenceItemId: null, channel: 'ADMIN', userId: 1, idempotencyKey: "t27-lowstock-d-{$uid}");
$pdo->commit();
$afterZero = $notificationService->unreadCount('USER', 1);
assertTest('Reaching exactly 0 on_hand (threshold already crossed before, this crosses 0 too) raises an OUT_OF_STOCK alert', $afterZero === $afterSecondDropBelow + 1, "{$afterSecondDropBelow} -> {$afterZero}");
$zeroNotif = $notificationService->listForRecipient('USER', 1, 1, 1)['items'][0];
assertTest('The alert type at exactly 0 is OUT_OF_STOCK', $zeroNotif['type'] === 'OUT_OF_STOCK');

echo "\n======================================================================\n";
echo "RESULTS: {$passed} passed, {$failed} failed\n";
echo "======================================================================\n";

exit($failed > 0 ? 1 : 0);
