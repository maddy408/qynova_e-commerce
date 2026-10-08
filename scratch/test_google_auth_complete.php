<?php

declare(strict_types=1);

require dirname(__DIR__) . '/backend/vendor/autoload.php';
require_once dirname(__DIR__) . '/backend/config/database.php';

$pdo = db();
$baseUrl = 'http://localhost:8000/api';

function httpPost(string $url, array $data, array $headers = []): array
{
    $ch = curl_init($url);
    $payload = json_encode($data);
    $headers[] = 'Content-Type: application/json';
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $code, 'body' => json_decode((string) $res, true) ?: $res];
}

function httpGet(string $url, array $headers = []): array
{
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    $res = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['code' => $code, 'body' => json_decode((string) $res, true) ?: $res];
}

echo "=== STARTING GOOGLE AUTHENTICATION TEST SUITE ===\n\n";

$passCount = 0;
$failCount = 0;

function assertTest(string $name, bool $condition, string $detail = '')
{
    global $passCount, $failCount;
    if ($condition) {
        $passCount++;
        echo "✅ PASS: {$name}\n";
    } else {
        $failCount++;
        echo "❌ FAIL: {$name} - {$detail}\n";
    }
}

// Clean up any previous test customer records with test identifiers
$pdo->exec("DELETE FROM referral_codes WHERE customer_id IN (SELECT id FROM customers WHERE email LIKE '%@test-google.com')");
$pdo->exec("DELETE FROM customers WHERE email LIKE '%@test-google.com' OR google_id LIKE 'test_gid_%'");

// --- TEST 1: New Google Account ---
echo "\n--- TEST 1: New Google Account ---\n";
$newGoogleId = 'test_gid_1001';
$newEmail = 'user1@test-google.com';
$newName = 'Google Test User 1';
$token1 = "test_google:{$newGoogleId}:{$newEmail}:{$newName}:https://example.com/photo1.jpg";

$res1 = httpPost("{$baseUrl}/customers/google-login", ['credential' => $token1]);
$t1Pass = ($res1['code'] === 201 || $res1['code'] === 200) && !empty($res1['body']['token']) && ($res1['body']['customer']['email'] ?? '') === $newEmail;
assertTest('TEST 1: New Google account login creates customer & returns JWT', $t1Pass, json_encode($res1));

$stmt = $pdo->prepare("SELECT * FROM customers WHERE google_id = :gid");
$stmt->execute(['gid' => $newGoogleId]);
$createdCust = $stmt->fetch();
assertTest('TEST 1 (DB): Customer record exists with correct google_id & email', $createdCust !== false && $createdCust['email'] === $newEmail && $createdCust['status'] === 'ACTIVE');
$createdCustId = (int) ($createdCust['id'] ?? 0);
$user1Jwt = $res1['body']['token'] ?? '';

// --- TEST 2: Same Google Account logs in again ---
echo "\n--- TEST 2: Same Google Account logs in again ---\n";
$countBefore = (int) $pdo->query("SELECT COUNT(*) FROM customers WHERE google_id = '{$newGoogleId}'")->fetchColumn();
$res2 = httpPost("{$baseUrl}/customers/google-login", ['credential' => $token1]);
$t2Pass = ($res2['code'] === 200) && !empty($res2['body']['token']) && ($res2['body']['customer']['id'] ?? 0) === $createdCustId;
assertTest('TEST 2: Same Google account logs in without error & returns JWT', $t2Pass, json_encode($res2));

$countAfter = (int) $pdo->query("SELECT COUNT(*) FROM customers WHERE google_id = '{$newGoogleId}'")->fetchColumn();
assertTest('TEST 2 (DB): NO duplicate customer created', $countBefore === 1 && $countAfter === 1);

// --- TEST 3: Existing customer has matching email ---
echo "\n--- TEST 3: Existing customer has matching email ---\n";
// Create customer with email but no google_id
$existingEmail = 'user2_existing@test-google.com';
$pdo->prepare("INSERT INTO customers (name, email, phone, status, customer_type) VALUES ('Existing Email User', :email, '9870000001', 'ACTIVE', 'RETAIL')")
    ->execute(['email' => $existingEmail]);
$existingCustId = (int) $pdo->lastInsertId();

$newGidForExisting = 'test_gid_2002';
$token3 = "test_google:{$newGidForExisting}:{$existingEmail}:Existing Email User:https://example.com/photo2.jpg";
$res3 = httpPost("{$baseUrl}/customers/google-login", ['credential' => $token3]);
$t3Pass = ($res3['code'] === 200) && !empty($res3['body']['token']) && ($res3['body']['customer']['id'] ?? 0) === $existingCustId;
assertTest('TEST 3: Existing customer matching email is linked to Google ID', $t3Pass, json_encode($res3));

$stmt = $pdo->prepare("SELECT * FROM customers WHERE id = :id");
$stmt->execute(['id' => $existingCustId]);
$linkedCust = $stmt->fetch();
assertTest('TEST 3 (DB): Customer record now has verified google_id linked', $linkedCust['google_id'] === $newGidForExisting);

// Ensure no duplicate created
$emailMatches = (int) $pdo->query("SELECT COUNT(*) FROM customers WHERE email = '{$existingEmail}'")->fetchColumn();
assertTest('TEST 3 (DB): Exactly 1 customer row with that email (no duplicate)', $emailMatches === 1);

// --- TEST 4: Google account belongs to inactive customer ---
echo "\n--- TEST 4: Inactive Customer ---\n";
$inactiveEmail = 'inactive@test-google.com';
$inactiveGid = 'test_gid_4004';
$pdo->prepare("INSERT INTO customers (name, email, google_id, status, customer_type) VALUES ('Inactive User', :email, :gid, 'INACTIVE', 'RETAIL')")
    ->execute(['email' => $inactiveEmail, 'gid' => $inactiveGid]);

$token4 = "test_google:{$inactiveGid}:{$inactiveEmail}:Inactive User:https://example.com/photo.jpg";
$res4 = httpPost("{$baseUrl}/customers/google-login", ['credential' => $token4]);
assertTest('TEST 4: Inactive customer login rejected with HTTP 403', $res4['code'] === 403, "Returned code: {$res4['code']}");

// --- TEST 5: Google account belongs to deleted customer ---
echo "\n--- TEST 5: Deleted Customer ---\n";
$deletedEmail = 'deleted@test-google.com';
$deletedGid = 'test_gid_5005';
$pdo->prepare("INSERT INTO customers (name, email, google_id, status, deleted_at, customer_type) VALUES ('Deleted User', :email, :gid, 'ACTIVE', NOW(), 'RETAIL')")
    ->execute(['email' => $deletedEmail, 'gid' => $deletedGid]);

$token5 = "test_google:{$deletedGid}:{$deletedEmail}:Deleted User:https://example.com/photo.jpg";
$res5 = httpPost("{$baseUrl}/customers/google-login", ['credential' => $token5]);
assertTest('TEST 5: Deleted customer login rejected with HTTP 403', $res5['code'] === 403, "Returned code: {$res5['code']}");

// Verify no duplicate customer created to bypass deleted account
$delCount = (int) $pdo->query("SELECT COUNT(*) FROM customers WHERE email = '{$deletedEmail}'")->fetchColumn();
assertTest('TEST 5 (DB): No bypass/duplicate customer created', $delCount === 1);

// --- TEST 6: Existing mobile OTP login ---
echo "\n--- TEST 6: Existing Mobile OTP login ---\n";
$mobilePhone = '9876501234'; // Existing Ramya Sharma customer
$sendOtpRes = httpPost("{$baseUrl}/customers/otp/send", ['phone' => $mobilePhone, 'purpose' => 'LOGIN']);
assertTest('TEST 6: OTP send API succeeds', $sendOtpRes['code'] === 200, json_encode($sendOtpRes));

$otpRow = $pdo->query("SELECT otp_hash FROM otp_verifications WHERE phone = '{$mobilePhone}' AND purpose = 'LOGIN' ORDER BY id DESC LIMIT 1")->fetch();
$actualOtp = $otpRow['otp_hash'] ?? '';

$otpLoginRes = httpPost("{$baseUrl}/customers/otp/login", ['phone' => $mobilePhone, 'otp' => $actualOtp]);
$t6Pass = ($otpLoginRes['code'] === 200) && !empty($otpLoginRes['body']['token']) && ($otpLoginRes['body']['customer']['phone'] ?? '') === $mobilePhone;
assertTest('TEST 6: Mobile OTP login works seamlessly and returns JWT', $t6Pass, json_encode($otpLoginRes));

// --- TEST 7: Logout ---
echo "\n--- TEST 7: Logout / Unauthenticated behavior ---\n";
$unauthRes = httpGet("{$baseUrl}/customers/me");
assertTest('TEST 7: Requesting protected customer endpoint without token returns HTTP 401', $unauthRes['code'] === 401);

// --- TEST 8: Refresh / Session Persistence after Google login ---
echo "\n--- TEST 8: Session Persistence with Google JWT ---\n";
$sessionRes = httpGet("{$baseUrl}/customers/me", ["Authorization: Bearer {$user1Jwt}"]);
$t8Pass = ($sessionRes['code'] === 200) && (($sessionRes['body']['customer']['id'] ?? 0) === $createdCustId);
assertTest('TEST 8: JWT from Google login authenticates successfully on /customers/me', $t8Pass, json_encode($sessionRes));

echo "\n============================================\n";
echo "TEST RESULTS SUMMARY: {$passCount} PASSED, {$failCount} FAILED\n";
echo "============================================\n";

if ($failCount === 0) {
    exit(0);
} else {
    exit(1);
}
