<?php
declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/../config/database.php';
require_once __DIR__ . '/test_guard.php';

use App\Services\BroadcastService;
use App\Services\DeviceTokenService;
use App\Services\FcmSenderService;
use App\Services\NotificationService;
use App\Tests\TestDbGuard;

$pdo = db();
TestDbGuard::assertTestDatabase($pdo, __FILE__);

echo "======================================================================\n";
echo "TASK T28: ADMIN BROADCAST NOTIFICATIONS TEST SUITE\n";
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
$notifications = new NotificationService($pdo);
$deviceTokens = new DeviceTokenService($pdo);
$fcm = new FcmSenderService($deviceTokens);

// This DB accumulates customers from every other test file run in this
// session (by established convention here, test rows are never cleaned
// up — see test_t04 etc.), so "the only active customer" can't be
// assumed. Temporarily deactivating every PRE-EXISTING active customer
// gives this suite a deterministic, exact-count-safe environment without
// deleting anything — restored at the very end regardless of pass/fail.
$preExistingActiveIds = $pdo->query("SELECT id FROM customers WHERE status = 'ACTIVE' AND deleted_at IS NULL")->fetchAll(PDO::FETCH_COLUMN);
if ($preExistingActiveIds !== []) {
    $placeholders = implode(',', array_fill(0, count($preExistingActiveIds), '?'));
    $pdo->prepare("UPDATE customers SET status = 'INACTIVE' WHERE id IN ({$placeholders})")->execute($preExistingActiveIds);
}
echo "(Temporarily deactivated " . count($preExistingActiveIds) . " pre-existing active customer(s) from earlier test runs for a clean, exact-count environment — restored at the end.)\n\n";

// broadcast_campaigns is a table only this feature/this test uses (no
// other test file depends on its history), and BroadcastService's own
// rate limit is keyed by sent_by_user_id against this table — without
// clearing prior runs' rows, re-running this script within the cooldown
// window would always hit the rate limiter it's deliberately testing in
// GROUP 4. Scoped delete of a test-only table in the test database, not
// a truncate of shared/business data.
$pdo->exec('DELETE FROM broadcast_campaigns');

register_shutdown_function(function () use ($pdo, $preExistingActiveIds) {
    if ($preExistingActiveIds !== []) {
        $placeholders = implode(',', array_fill(0, count($preExistingActiveIds), '?'));
        $pdo->prepare("UPDATE customers SET status = 'ACTIVE' WHERE id IN ({$placeholders})")->execute($preExistingActiveIds);
    }
});
$broadcasts = new BroadcastService($pdo, $notifications, $deviceTokens, $fcm);

// ---------------------------------------------------------------------
// GROUP 1: permission wiring (migration seeded the permission + granted it to ADMIN)
// ---------------------------------------------------------------------
echo "-- Permission wiring --\n";
$permExists = (int) $pdo->query("SELECT COUNT(*) FROM permissions WHERE code = 'notifications.broadcast'")->fetchColumn();
assertTest('notifications.broadcast permission row exists (migration 0039)', $permExists === 1);

$adminGranted = (int) $pdo->query(
    "SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id JOIN permissions p ON p.id = rp.permission_id
     WHERE r.code = 'ADMIN' AND p.code = 'notifications.broadcast'"
)->fetchColumn();
assertTest('ADMIN role explicitly granted the permission', $adminGranted === 1);

// PermissionMiddleware::require() itself calls Response::error() (process
// exit) on rejection, so it can't be exercised directly in this script —
// that exact gate (ADMIN bypasses; everyone else needs the permission
// explicitly; customers are never 'staff' so always rejected) is the
// same pre-existing, already-covered-elsewhere logic every other
// permission-gated endpoint in this app already relies on. What's
// actually new here — that BroadcastController really calls it with the
// right code — is verified below by reading the controller source
// itself rather than re-testing shared middleware behavior.
$controllerSource = file_get_contents(__DIR__ . '/../src/Controllers/BroadcastController.php');
assertTest("BroadcastController::send() requires the 'notifications.broadcast' permission", str_contains($controllerSource, "PermissionMiddleware::require(\$claims, 'notifications.broadcast')"));
assertTest('BroadcastController authenticates via the same JwtAuthMiddleware as every other endpoint', str_contains($controllerSource, 'JwtAuthMiddleware::authenticate()'));

// ---------------------------------------------------------------------
// GROUP 2: eligibility — only ACTIVE, non-deleted customers; never staff
// ---------------------------------------------------------------------
echo "\n-- Recipient eligibility --\n";

$pdo->exec("INSERT INTO customers (name, phone, customer_type, status) VALUES ('T28 Active Customer {$uid}', '9{$uid}1', 'RETAIL', 'ACTIVE')");
$activeCustomerId = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO customers (name, phone, customer_type, status) VALUES ('T28 Inactive Customer {$uid}', '9{$uid}2', 'RETAIL', 'INACTIVE')");
$inactiveCustomerId = (int) $pdo->lastInsertId();
$pdo->exec("INSERT INTO customers (name, phone, customer_type, status, deleted_at) VALUES ('T28 Deleted Customer {$uid}', '9{$uid}3', 'RETAIL', 'ACTIVE', NOW())");
$deletedCustomerId = (int) $pdo->lastInsertId();

$deviceTokens->register('CUSTOMER', $activeCustomerId, "T28-ACTIVE-TOKEN-{$uid}");
$deviceTokens->register('CUSTOMER', $inactiveCustomerId, "T28-INACTIVE-TOKEN-{$uid}");
$deviceTokens->register('CUSTOMER', $deletedCustomerId, "T28-DELETED-TOKEN-{$uid}");
$deviceTokens->register('USER', 1, "T28-ADMIN-USER-TOKEN-{$uid}"); // admin@example.com's OWN token — must never receive a customer broadcast

$adminUnreadBefore = $notifications->unreadCount('USER', 1);

$result1 = $broadcasts->send('T28 Special Offer ' . $uid, 'Get 20% off on selected products. Shop now!', 1, 'T28-IDEMPOTENCY-' . $uid);

assertTest('send() succeeds and returns COMPLETED status', $result1['status'] === 'COMPLETED', json_encode($result1));
assertTest('Exactly 1 eligible customer counted (inactive and soft-deleted excluded)', $result1['recipient_customer_count'] === 1, (string) $result1['recipient_customer_count']);
assertTest('Exactly 1 token targeted (the active customer\'s only)', $result1['token_count'] === 1, (string) $result1['token_count']);
assertTest('duplicate flag is false on the first send', $result1['duplicate'] === false);

$activeHasNotif = $notifications->unreadCount('CUSTOMER', $activeCustomerId);
assertTest('The ACTIVE customer received the in-app notification', $activeHasNotif === 1);

$inactiveHasNotif = $notifications->unreadCount('CUSTOMER', $inactiveCustomerId);
assertTest('The INACTIVE customer did NOT receive a notification', $inactiveHasNotif === 0);

$deletedHasNotif = $notifications->unreadCount('CUSTOMER', $deletedCustomerId);
assertTest('The soft-deleted customer did NOT receive a notification', $deletedHasNotif === 0);

$adminUnreadAfter = $notifications->unreadCount('USER', 1);
assertTest('The admin\'s OWN notification feed is untouched by a customer broadcast (staff never a recipient)', $adminUnreadAfter === $adminUnreadBefore);

$activeNotif = $notifications->listForRecipient('CUSTOMER', $activeCustomerId, 1, 1)['items'][0];
assertTest('Notification type is BROADCAST', $activeNotif['type'] === 'BROADCAST');
assertTest('Notification title/body match exactly what the admin entered', $activeNotif['title'] === 'T28 Special Offer ' . $uid && $activeNotif['body'] === 'Get 20% off on selected products. Shop now!');
assertTest('Notification references the campaign', $activeNotif['reference_type'] === 'BROADCAST_CAMPAIGN' && $activeNotif['reference_id'] === $result1['campaign_id']);

$campaignRow = $pdo->query("SELECT * FROM broadcast_campaigns WHERE id = {$result1['campaign_id']}")->fetch();
assertTest('Campaign audit row recorded the sending admin', (int) $campaignRow['sent_by_user_id'] === 1);
assertTest('Campaign audit row status is COMPLETED with a completed_at timestamp', $campaignRow['status'] === 'COMPLETED' && $campaignRow['completed_at'] !== null);

// ---------------------------------------------------------------------
// GROUP 3: idempotency — the SAME key never sends/creates twice
// ---------------------------------------------------------------------
echo "\n-- Idempotency (duplicate submission protection) --\n";

$activeUnreadBeforeRetry = $notifications->unreadCount('CUSTOMER', $activeCustomerId);
$result2 = $broadcasts->send('A DIFFERENT title (should be ignored)', 'A different body (should be ignored)', 1, 'T28-IDEMPOTENCY-' . $uid);
assertTest('Re-submitting the SAME idempotency key returns duplicate=true', $result2['duplicate'] === true);
assertTest('Re-submission returns the ORIGINAL campaign id, not a new one', $result2['campaign_id'] === $result1['campaign_id']);

$activeUnreadAfterRetry = $notifications->unreadCount('CUSTOMER', $activeCustomerId);
assertTest('No second notification was created by the duplicate submission', $activeUnreadAfterRetry === $activeUnreadBeforeRetry, "{$activeUnreadBeforeRetry} -> {$activeUnreadAfterRetry}");

$campaignCountForKey = (int) $pdo->query("SELECT COUNT(*) FROM broadcast_campaigns WHERE idempotency_key = 'T28-IDEMPOTENCY-{$uid}'")->fetchColumn();
assertTest('Exactly one campaign row exists for this idempotency key, not two', $campaignCountForKey === 1, (string) $campaignCountForKey);

// ---------------------------------------------------------------------
// GROUP 4: rate limiting — a DIFFERENT campaign too soon from the same admin is rejected
// ---------------------------------------------------------------------
echo "\n-- Rate limiting --\n";
try {
    $broadcasts->send('T28 Too Soon ' . $uid, 'This should be rate-limited', 1, null);
    assertTest('A second distinct campaign within the cooldown window should have been rejected', false);
} catch (RuntimeException $e) {
    assertTest('A second distinct campaign within the cooldown window throws a clear wait-message', str_contains($e->getMessage(), 'wait'), $e->getMessage());
}

// ---------------------------------------------------------------------
// GROUP 5: validation
// ---------------------------------------------------------------------
echo "\n-- Input validation --\n";
// Use a different admin-equivalent user id context isn't available (only
// one seeded admin in this DB), so validation failures are tested first,
// before anything could be rate-limited by a prior successful send in
// this group — each throws before ever reaching the rate-limit check
// since validation runs first in BroadcastService::send().
try {
    $broadcasts->send('', 'Non-empty body', 1, 'T28-VALIDATION-EMPTY-TITLE-' . $uid);
    assertTest('Empty title should have been rejected', false);
} catch (RuntimeException $e) {
    assertTest('Empty title is rejected', str_contains($e->getMessage(), 'Title'));
}

try {
    $broadcasts->send('Non-empty title', '', 1, 'T28-VALIDATION-EMPTY-BODY-' . $uid);
    assertTest('Empty message should have been rejected', false);
} catch (RuntimeException $e) {
    assertTest('Empty message is rejected', str_contains($e->getMessage(), 'Message'));
}

try {
    $broadcasts->send(str_repeat('A', 256), 'Non-empty body', 1, 'T28-VALIDATION-LONG-TITLE-' . $uid);
    assertTest('Over-length title (256 chars) should have been rejected', false);
} catch (RuntimeException $e) {
    assertTest('Over-length title is rejected', str_contains($e->getMessage(), '255'));
}

try {
    $broadcasts->send('Non-empty title', str_repeat('A', 501), 1, 'T28-VALIDATION-LONG-BODY-' . $uid);
    assertTest('Over-length message (501 chars) should have been rejected', false);
} catch (RuntimeException $e) {
    assertTest('Over-length message is rejected', str_contains($e->getMessage(), '500'));
}

// ---------------------------------------------------------------------
// GROUP 6: no eligible customers at all -> honest zero-result message
// ---------------------------------------------------------------------
echo "\n-- No eligible customers --\n";
$pdo->exec("UPDATE customers SET status = 'INACTIVE' WHERE id = {$activeCustomerId}");

// Different admin user needed to avoid the rate-limit cooldown from
// group 4 above still being in effect for user 1 — use cashier (id 2)
// with the permission explicitly granted for this one check.
$pdo->exec("INSERT INTO role_permissions (role_id, permission_id) SELECT r.id, p.id FROM roles r, permissions p WHERE r.code = 'CASHIER' AND p.code = 'notifications.broadcast' ON DUPLICATE KEY UPDATE role_id = role_id");
$result3 = $broadcasts->send('T28 No Recipients ' . $uid, 'Nobody should get this', 2, 'T28-NO-RECIPIENTS-' . $uid);
assertTest('Zero eligible customers -> recipient_customer_count is 0', $result3['recipient_customer_count'] === 0);
assertTest('Zero eligible customers -> the exact documented message is returned', $result3['message'] === 'No eligible customer devices are registered for push notifications.', $result3['message']);
$pdo->exec("UPDATE customers SET status = 'ACTIVE' WHERE id = {$activeCustomerId}");

// ---------------------------------------------------------------------
// GROUP 7: FCM not configured in this test env -> honest, not a false "success"
// ---------------------------------------------------------------------
echo "\n-- Honest reporting when FCM push is not configured --\n";
assertTest('FcmSenderService confirms push is NOT configured in this test env (no real service-account file)', $fcm->isConfigured() === false);
assertTest('The earlier successful campaign (1 token) reports success_count=0 — never claims push success it cannot verify', $result1['success_count'] === 0, (string) $result1['success_count']);
assertTest('...but the in-app notification was still saved regardless (business operation not broken by push being unavailable)', $activeHasNotif === 1);

echo "\n======================================================================\n";
echo "RESULTS: {$passed} passed, {$failed} failed\n";
echo "======================================================================\n";

exit($failed > 0 ? 1 : 0);
