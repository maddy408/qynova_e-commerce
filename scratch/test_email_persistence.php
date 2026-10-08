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

echo "=== STARTING EMAIL PERSISTENCE TEST SUITE ===\n\n";

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

// Clean up any test users
$pdo->exec("DELETE FROM referral_codes WHERE customer_id IN (SELECT id FROM customers WHERE phone LIKE '99988877%')");
$pdo->exec("DELETE FROM customers WHERE phone LIKE '99988877%'");

// Helper to complete OTP verification for signup
function sendAndVerifyOtp(string $phone, string $baseUrl, PDO $pdo): void
{
    $res = httpPost("{$baseUrl}/customers/otp/send", ['phone' => $phone, 'purpose' => 'SIGNUP']);
    if ($res['code'] !== 200) {
        throw new RuntimeException("Failed to send OTP: " . json_encode($res));
    }
    $otp = $pdo->query("SELECT otp_hash FROM otp_verifications WHERE phone = '{$phone}' AND purpose = 'SIGNUP' ORDER BY id DESC LIMIT 1")->fetchColumn();
    $verifyRes = httpPost("{$baseUrl}/customers/otp/verify", ['phone' => $phone, 'otp' => $otp, 'purpose' => 'SIGNUP']);
    if ($verifyRes['code'] !== 200) {
        throw new RuntimeException("Failed to verify OTP: " . json_encode($verifyRes));
    }
}

// ==========================================
// TEST 1: Register a new customer with valid email test1@example.com
// ==========================================
echo "\n--- TEST 1: Register with test1@example.com ---\n";
$phone1 = '9998887701';
sendAndVerifyOtp($phone1, $baseUrl, $pdo);

$signup1 = httpPost("{$baseUrl}/customers/signup", [
    'name' => 'Test User',
    'phone' => $phone1,
    'email' => 'test1@example.com',
    'password' => 'secret123',
    'confirm_password' => 'secret123',
]);

assertTest('TEST 1 (API): Signup returns 201 with email in customer payload',
    $signup1['code'] === 201 && ($signup1['body']['customer']['email'] ?? '') === 'test1@example.com',
    json_encode($signup1)
);

$dbRow1 = $pdo->query("SELECT id, name, phone, email, status FROM customers WHERE phone = '{$phone1}'")->fetch(PDO::FETCH_ASSOC);
assertTest('TEST 1 (DB): customers.email matches test1@example.com in MySQL',
    $dbRow1 !== false && $dbRow1['email'] === 'test1@example.com',
    json_encode($dbRow1)
);

// ==========================================
// TEST 2: Register with another valid email (with uppercase & spaces to verify trimming/lowercase)
// ==========================================
echo "\n--- TEST 2: Register with another valid email (Test2.User@Domain.Com with whitespace) ---\n";
$phone2 = '9998887702';
sendAndVerifyOtp($phone2, $baseUrl, $pdo);

$signup2 = httpPost("{$baseUrl}/customers/signup", [
    'name' => 'Second User',
    'phone' => $phone2,
    'email' => '  Test2.User@Domain.Com  ',
    'password' => 'secret123',
    'confirm_password' => 'secret123',
]);

assertTest('TEST 2 (API): Signup succeeds with normalized email',
    $signup2['code'] === 201 && ($signup2['body']['customer']['email'] ?? '') === 'test2.user@domain.com',
    json_encode($signup2)
);

$dbRow2 = $pdo->query("SELECT id, name, phone, email FROM customers WHERE phone = '{$phone2}'")->fetch(PDO::FETCH_ASSOC);
assertTest('TEST 2 (DB): customers.email is trimmed and stored correctly',
    $dbRow2 !== false && $dbRow2['email'] === 'test2.user@domain.com',
    json_encode($dbRow2)
);

// ==========================================
// TEST 3: Register without email (optional)
// ==========================================
echo "\n--- TEST 3: Register without email (empty string & null) ---\n";
$phone3 = '9998887703';
sendAndVerifyOtp($phone3, $baseUrl, $pdo);

$signup3 = httpPost("{$baseUrl}/customers/signup", [
    'name' => 'No Email User',
    'phone' => $phone3,
    'email' => '',
    'password' => 'secret123',
    'confirm_password' => 'secret123',
]);

assertTest('TEST 3 (API): Signup succeeds with empty email',
    $signup3['code'] === 201 && ($signup3['body']['customer']['email'] ?? null) === null,
    json_encode($signup3)
);

$dbRow3 = $pdo->query("SELECT id, name, phone, email FROM customers WHERE phone = '{$phone3}'")->fetch(PDO::FETCH_ASSOC);
assertTest('TEST 3 (DB): customers.email is NULL in database when not provided',
    $dbRow3 !== false && $dbRow3['email'] === null,
    json_encode($dbRow3)
);

// ==========================================
// TEST 4: Refresh / Re-login the customer & verify email comes from DB
// ==========================================
echo "\n--- TEST 4: Refresh/re-login customer (Password login, OTP login, and /customers/me) ---\n";
// 4a: Password login
$loginRes = httpPost("{$baseUrl}/customers/login", [
    'phone' => $phone1,
    'password' => 'secret123',
]);
assertTest('TEST 4a: Password login returns stored email',
    $loginRes['code'] === 200 && ($loginRes['body']['customer']['email'] ?? '') === 'test1@example.com',
    json_encode($loginRes)
);
$token = $loginRes['body']['token'] ?? '';

// 4b: /customers/me (session refresh)
$meRes = httpGet("{$baseUrl}/customers/me", ["Authorization: Bearer {$token}"]);
assertTest('TEST 4b: GET /customers/me returns stored email from database',
    $meRes['code'] === 200 && ($meRes['body']['customer']['email'] ?? '') === 'test1@example.com',
    json_encode($meRes)
);

// 4c: OTP login
$otpSend = httpPost("{$baseUrl}/customers/otp/send", ['phone' => $phone1, 'purpose' => 'LOGIN']);
$loginOtp = $pdo->query("SELECT otp_hash FROM otp_verifications WHERE phone = '{$phone1}' AND purpose = 'LOGIN' ORDER BY id DESC LIMIT 1")->fetchColumn();
$otpLoginRes = httpPost("{$baseUrl}/customers/otp/login", ['phone' => $phone1, 'otp' => $loginOtp]);
assertTest('TEST 4c: Mobile OTP login returns stored email from database',
    $otpLoginRes['code'] === 200 && ($otpLoginRes['body']['customer']['email'] ?? '') === 'test1@example.com',
    json_encode($otpLoginRes)
);

// ==========================================
// TEST 5: Direct MySQL Verification
// ==========================================
echo "\n--- TEST 5: Direct MySQL row verification ---\n";
$allTestRows = $pdo->query("SELECT id, name, phone, email, status FROM customers WHERE phone IN ('{$phone1}', '{$phone2}', '{$phone3}') ORDER BY id ASC")->fetchAll(PDO::FETCH_ASSOC);
echo "Database records created:\n";
foreach ($allTestRows as $row) {
    echo "  - ID: {$row['id']} | Name: {$row['name']} | Phone: {$row['phone']} | Email: " . ($row['email'] ?? 'NULL') . "\n";
}
assertTest('TEST 5: All 3 customer records in MySQL have exact expected email values',
    count($allTestRows) === 3 &&
    $allTestRows[0]['email'] === 'test1@example.com' &&
    $allTestRows[1]['email'] === 'test2.user@domain.com' &&
    $allTestRows[2]['email'] === null
);

// ==========================================
// BONUS VALIDATION TESTS: Format & Duplicate Checks
// ==========================================
echo "\n--- BONUS: Format & Duplicate Email validation ---\n";
$phone4 = '9998887704';
sendAndVerifyOtp($phone4, $baseUrl, $pdo);
$badEmailRes = httpPost("{$baseUrl}/customers/signup", [
    'name' => 'Bad Email User',
    'phone' => $phone4,
    'email' => 'not-an-email',
    'password' => 'secret123',
    'confirm_password' => 'secret123',
]);
assertTest('BONUS: Invalid email format rejected with 422', $badEmailRes['code'] === 422);

$dupEmailRes = httpPost("{$baseUrl}/customers/signup", [
    'name' => 'Dup Email User',
    'phone' => $phone4,
    'email' => 'test1@example.com', // Already used by phone1
    'password' => 'secret123',
    'confirm_password' => 'secret123',
]);
assertTest('BONUS: Duplicate email rejected with 409', $dupEmailRes['code'] === 409);

// Clean up test rows
$pdo->exec("DELETE FROM referral_codes WHERE customer_id IN (SELECT id FROM customers WHERE phone LIKE '99988877%')");
$pdo->exec("DELETE FROM customers WHERE phone LIKE '99988877%'");
echo "\nCleaned up test customer records.\n";

echo "\n============================================\n";
echo "TEST RESULTS: {$passCount} PASSED, {$failCount} FAILED\n";
echo "============================================\n";

if ($failCount === 0) {
    exit(0);
} else {
    exit(1);
}
