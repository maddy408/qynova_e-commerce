<?php

declare(strict_types=1);

// T18: Refresh token issuance, rotation, reuse detection, logout
// revocation, and role-based TTL. HTTP-level integration test against a
// locally running backend (start one on a free port before running this,
// e.g. `php -S 127.0.0.1:8090 -t public public/index.php` from backend/,
// with APP_ENV=testing so it loads .env.test).
//
// Usage: php tests/test_t18_refresh_tokens.php http://127.0.0.1:8090

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/test_guard.php';

use App\Tests\TestDbGuard;

echo "=== TASK T18: REFRESH TOKEN TESTS ===\n";

$baseUrl = $argv[1] ?? 'http://127.0.0.1:8090';

putenv('APP_ENV=testing');
$_ENV['APP_ENV'] = 'testing';
require_once __DIR__ . '/../config/database.php';
$pdo = db();
TestDbGuard::assertTestDatabase($pdo, __FILE__);
echo "✓ Connected safely to test database: " . $pdo->query('SELECT DATABASE()')->fetchColumn() . "\n";

// --- Setup: a dedicated ADMIN and CASHIER test user with a known password ---
$password = 'T18-Test-Pass-1';
$hash = password_hash($password, PASSWORD_BCRYPT);

$adminRoleId = (int) $pdo->query("SELECT id FROM roles WHERE code = 'ADMIN'")->fetchColumn();
$cashierRoleId = (int) $pdo->query("SELECT id FROM roles WHERE code = 'CASHIER'")->fetchColumn();
assert($adminRoleId > 0 && $cashierRoleId > 0, 'ADMIN and CASHIER roles must exist');

foreach (['t18_admin@test.local' => $adminRoleId, 't18_cashier@test.local' => $cashierRoleId] as $email => $roleId) {
    $pdo->prepare('DELETE FROM users WHERE email = :email')->execute(['email' => $email]);
    $pdo->prepare(
        "INSERT INTO users (role_id, name, email, password_hash, status) VALUES (:role_id, 'T18 Test User', :email, :hash, 'ACTIVE')"
    )->execute(['role_id' => $roleId, 'email' => $email, 'hash' => $hash]);
}
echo "✓ Created test ADMIN and CASHIER users\n";

/** Minimal curl wrapper with cookie-jar support. */
function httpPost(string $url, array $body, string $cookieJar, ?string $bearer = null): array
{
    $ch = curl_init($url);
    $headers = ['Content-Type: application/json'];
    if ($bearer !== null) {
        $headers[] = "Authorization: Bearer {$bearer}";
    }
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($body),
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_COOKIEJAR => $cookieJar,
        CURLOPT_COOKIEFILE => $cookieJar,
        CURLOPT_HEADER => false,
    ]);
    $raw = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['status' => $status, 'body' => json_decode((string) $raw, true) ?? []];
}

$jar = tempnam(sys_get_temp_dir(), 't18_cookies_');

// --- 1. Login sets a refresh cookie and returns an access token ---
$login = httpPost("{$baseUrl}/api/auth/login", ['email' => 't18_admin@test.local', 'password' => $password], $jar);
assert($login['status'] === 200, 'Login should succeed, got ' . $login['status'] . ' ' . json_encode($login['body']));
$accessToken1 = $login['body']['token'] ?? null;
assert(is_string($accessToken1) && $accessToken1 !== '', 'Login must return an access token');
assert(str_contains((string) file_get_contents($jar), 'admin_pos_refresh_token'), 'Login must set the refresh cookie');
echo "✓ Login succeeded, access token issued, refresh cookie set\n";

$tokenRow1 = $pdo->query('SELECT id, expires_at, revoked_at FROM refresh_tokens ORDER BY id DESC LIMIT 1')->fetch();
assert($tokenRow1['revoked_at'] === null, 'Freshly issued refresh token must not be revoked');
$ttlDays = (strtotime($tokenRow1['expires_at']) - time()) / 86400;
assert($ttlDays > 29 && $ttlDays < 31, "ADMIN refresh TTL should be ~30 days, got {$ttlDays}");
echo "✓ ADMIN refresh token TTL is ~30 days ({$ttlDays} days)\n";

// --- 2. Refresh rotates the token and returns a new access token ---
$refresh1 = httpPost("{$baseUrl}/api/auth/refresh", [], $jar);
assert($refresh1['status'] === 200, 'First refresh should succeed, got ' . $refresh1['status'] . ' ' . json_encode($refresh1['body']));
$accessToken2 = $refresh1['body']['token'] ?? null;
assert(is_string($accessToken2) && $accessToken2 !== $accessToken1, 'Refresh must return a new, different access token');
echo "✓ Refresh #1 succeeded, new access token issued\n";

$rows = $pdo->query('SELECT id, revoked_at, revoke_reason, replaced_by_id FROM refresh_tokens ORDER BY id ASC')->fetchAll();
assert(count($rows) === 2, 'Expected exactly 2 refresh_tokens rows after one rotation, got ' . count($rows));
assert($rows[0]['revoked_at'] !== null && $rows[0]['revoke_reason'] === 'ROTATED', 'Original token must be revoked with reason ROTATED');
assert((int) $rows[0]['replaced_by_id'] === (int) $rows[1]['id'], 'Original token must link replaced_by_id to the new row');
assert($rows[1]['revoked_at'] === null, 'New token must be active');
echo "✓ Rotation chain correct: old token revoked (ROTATED), replaced_by_id links to new token\n";

// --- 3. A second refresh (with the now-rotated cookie) succeeds again ---
$refresh2 = httpPost("{$baseUrl}/api/auth/refresh", [], $jar);
assert($refresh2['status'] === 200, 'Second refresh (with rotated cookie) should succeed');
echo "✓ Refresh #2 (using the rotated cookie) succeeded\n";

// --- 4. Replaying the ORIGINAL (now twice-revoked) raw token must be
// detected as reuse and revoke the entire chain ---
$originalRawToken = null;
// Re-extract the first raw token from the first cookie jar snapshot by
// re-logging in to get a fresh, independently-trackable raw token value.
$jar2 = tempnam(sys_get_temp_dir(), 't18_cookies_reuse_');
$loginForReuse = httpPost("{$baseUrl}/api/auth/login", ['email' => 't18_admin@test.local', 'password' => $password], $jar2);
assert($loginForReuse['status'] === 200, 'Login for reuse-test should succeed');
$cookieJarContent = file_get_contents($jar2);
preg_match('/admin_pos_refresh_token\s+(\S+)\s*$/m', $cookieJarContent, $m);
$originalRawToken = $m[1] ?? null;
assert($originalRawToken !== null, 'Could not extract raw refresh token from cookie jar for reuse test');

// Rotate it once (legitimate use)
httpPost("{$baseUrl}/api/auth/refresh", [], $jar2);

// Now manually replay the ORIGINAL (already-rotated-away) raw token by
// writing it back into a fresh cookie jar file in Netscape format.
$replayJar = tempnam(sys_get_temp_dir(), 't18_cookies_replay_');
$host = parse_url($baseUrl, PHP_URL_HOST);
file_put_contents($replayJar, "# Netscape HTTP Cookie File\n{$host}\tFALSE\t/api/auth\tFALSE\t0\tadmin_pos_refresh_token\t{$originalRawToken}\n");

$replay = httpPost("{$baseUrl}/api/auth/refresh", [], $replayJar);
assert($replay['status'] === 401, 'Replaying a revoked (rotated-away) refresh token must be rejected with 401, got ' . $replay['status']);
assert(($replay['body']['reason'] ?? null) === 'reuse_detected', 'Replay must be flagged as reuse_detected, got ' . json_encode($replay['body']));
echo "✓ Replaying a rotated-away token was rejected as reuse_detected (401)\n";

// Confirm the WHOLE chain for this user got revoked as the security response
$stmt = $pdo->prepare(
    "SELECT COUNT(*) FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
     WHERE u.email = 't18_admin@test.local' AND rt.revoked_at IS NULL"
);
$stmt->execute();
$activeCount = (int) $stmt->fetchColumn();
assert($activeCount === 0, "Reuse detection must revoke the entire session chain — expected 0 active tokens left, got {$activeCount}");
echo "✓ Reuse detection revoked the entire session chain (0 active refresh tokens remain for this user)\n";

// Using the main jar's (now-also-dead, since chain was wiped) cookie should also now fail
$refreshAfterReuse = httpPost("{$baseUrl}/api/auth/refresh", [], $jar);
assert($refreshAfterReuse['status'] === 401, 'Any token in the revoked chain must now be rejected, got ' . $refreshAfterReuse['status']);
echo "✓ The legitimate (but same-chain) session is also forced to re-login after reuse detection\n";

// --- 5. Expired refresh token is rejected ---
$expiredHash = hash('sha256', 'expired-test-token-raw');
$pdo->prepare(
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (
        (SELECT id FROM users WHERE email = 't18_cashier@test.local'), :hash, DATE_SUB(NOW(), INTERVAL 1 DAY)
    )"
)->execute(['hash' => $expiredHash]);
$expiredJar = tempnam(sys_get_temp_dir(), 't18_cookies_expired_');
file_put_contents($expiredJar, "# Netscape HTTP Cookie File\n{$host}\tFALSE\t/api/auth\tFALSE\t0\tadmin_pos_refresh_token\texpired-test-token-raw\n");
$expiredResult = httpPost("{$baseUrl}/api/auth/refresh", [], $expiredJar);
assert($expiredResult['status'] === 401, 'An expired refresh token must be rejected, got ' . $expiredResult['status']);
assert(($expiredResult['body']['reason'] ?? null) === 'expired', 'Must be flagged as expired, got ' . json_encode($expiredResult['body']));
echo "✓ Expired refresh token correctly rejected\n";

// --- 6. CASHIER gets a shorter TTL than ADMIN ---
$jar3 = tempnam(sys_get_temp_dir(), 't18_cookies_cashier_');
$cashierLogin = httpPost("{$baseUrl}/api/auth/login", ['email' => 't18_cashier@test.local', 'password' => $password], $jar3);
assert($cashierLogin['status'] === 200, 'Cashier login should succeed');
$cashierTokenRow = $pdo->query(
    "SELECT rt.expires_at FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
     WHERE u.email = 't18_cashier@test.local' ORDER BY rt.id DESC LIMIT 1"
)->fetch();
$cashierTtlDays = (strtotime($cashierTokenRow['expires_at']) - time()) / 86400;
assert($cashierTtlDays > 6 && $cashierTtlDays < 8, "CASHIER refresh TTL should be ~7 days, got {$cashierTtlDays}");
assert($cashierTtlDays < $ttlDays, 'CASHIER TTL must be shorter than ADMIN TTL');
echo "✓ CASHIER refresh token TTL is ~7 days ({$cashierTtlDays} days), shorter than ADMIN's {$ttlDays} days\n";

// --- 7. Logout revokes the refresh token and clears the cookie ---
$logout = httpPost("{$baseUrl}/api/auth/logout", [], $jar3, $cashierLogin['body']['token'] ?? null);
assert($logout['status'] === 200, 'Logout should succeed, got ' . $logout['status']);
$refreshAfterLogout = httpPost("{$baseUrl}/api/auth/refresh", [], $jar3);
assert($refreshAfterLogout['status'] === 401, 'Refresh must fail after logout, got ' . $refreshAfterLogout['status']);
echo "✓ Logout revoked the refresh token — subsequent refresh correctly rejected\n";

// --- 8. Audit log entries were written ---
$auditActions = $pdo->query(
    "SELECT action, COUNT(*) AS c FROM audit_logs WHERE entity_type = 'auth_session' GROUP BY action"
)->fetchAll(PDO::FETCH_KEY_PAIR);
foreach (['LOGIN', 'REFRESH_FAILURE', 'LOGOUT'] as $expectedAction) {
    assert(($auditActions[$expectedAction] ?? 0) > 0, "Expected at least one '{$expectedAction}' audit log entry, found " . ($auditActions[$expectedAction] ?? 0));
}
echo "✓ Audit log entries recorded for LOGIN, REFRESH_FAILURE, and LOGOUT\n";

// --- Cleanup test users (keep the test DB tidy for the next run) ---
$pdo->exec("DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE email IN ('t18_admin@test.local','t18_cashier@test.local'))");
$pdo->exec("DELETE FROM audit_logs WHERE entity_type = 'auth_session' AND actor_id IN (SELECT id FROM users WHERE email IN ('t18_admin@test.local','t18_cashier@test.local'))");
$pdo->exec("DELETE FROM users WHERE email IN ('t18_admin@test.local','t18_cashier@test.local')");
echo "✓ Cleaned up test users and their sessions\n";

echo "\n============================================================\n";
echo "✓ TASK T18 VERIFICATION COMPLETE: ALL ASSERTIONS PASSED\n";
echo "============================================================\n";
