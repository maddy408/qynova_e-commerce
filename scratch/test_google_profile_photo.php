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

echo "=== STARTING GOOGLE PROFILE PHOTO TEST SUITE ===\n\n";

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

// Clean up any test records
$pdo->exec("DELETE FROM referral_codes WHERE customer_id IN (SELECT id FROM customers WHERE email LIKE '%@test-photo.com')");
$pdo->exec("DELETE FROM customers WHERE email LIKE '%@test-photo.com' OR google_id LIKE 'test_gid_photo_%'");

// ==========================================
// TEST A: Login with Google -> Google photo returned in auth payload
// ==========================================
echo "\n--- TEST A: Login with Google (Customer A) ---\n";
$gidA = 'test_gid_photo_101';
$emailA = 'ramya@test-photo.com';
$nameA = 'Ramya Customer';
$photoA = 'https://lh3.googleusercontent.com/photo_user_a_initial.jpg';
$tokenA_1 = "test_google:{$gidA}:{$emailA}:{$nameA}:{$photoA}";

$resA = httpPost("{$baseUrl}/customers/google-login", ['credential' => $tokenA_1]);
assertTest('TEST A: Google login returns HTTP 201/200 with JWT',
    ($resA['code'] === 201 || $resA['code'] === 200) && !empty($resA['body']['token']),
    json_encode($resA)
);
$jwtA = $resA['body']['token'] ?? '';
$customerA_id = (int) ($resA['body']['customer']['id'] ?? 0);
assertTest('TEST A: Google photo URL returned in customer payload',
    ($resA['body']['customer']['profile_photo_path'] ?? '') === $photoA,
    json_encode($resA['body']['customer'] ?? [])
);

// ==========================================
// TEST B: Open My Profile -> GET /api/customers/me returns same Google photo & safe fields
// ==========================================
echo "\n--- TEST B: Open My Profile (/customers/me) ---\n";
$meResA = httpGet("{$baseUrl}/customers/me", ["Authorization: Bearer {$jwtA}"]);
assertTest('TEST B: GET /customers/me returns HTTP 200',
    $meResA['code'] === 200,
    json_encode($meResA)
);
$meCustomerA = $meResA['body']['customer'] ?? [];
assertTest('TEST B: My Profile returns the Google profile photo',
    ($meCustomerA['profile_photo_path'] ?? '') === $photoA,
    json_encode($meCustomerA)
);
assertTest('TEST B: Safe customer info returned (name, email, customer_type, created_at)',
    $meCustomerA['name'] === $nameA && $meCustomerA['email'] === $emailA && !empty($meCustomerA['customer_type']) && !empty($meCustomerA['created_at'])
);
assertTest('TEST B: Security fields NOT exposed (password_hash, JWT, deleted_at absent)',
    !isset($meCustomerA['password_hash']) && !isset($meCustomerA['deleted_at'])
);

// ==========================================
// TEST C: Refresh page -> Photo still returned
// ==========================================
echo "\n--- TEST C: Refresh page ---\n";
$refreshResA = httpGet("{$baseUrl}/customers/me", ["Authorization: Bearer {$jwtA}"]);
assertTest('TEST C: Session refresh returns same photo from MySQL',
    $refreshResA['code'] === 200 && ($refreshResA['body']['customer']['profile_photo_path'] ?? '') === $photoA
);

// ==========================================
// TEST D: Logout and login again -> updated Google photo refreshes
// ==========================================
echo "\n--- TEST D: Logout and re-login (with refreshed photo) ---\n";
// Unauthenticated request
$unauth = httpGet("{$baseUrl}/customers/me");
assertTest('TEST D (Logout): Unauthenticated request rejected with HTTP 401', $unauth['code'] === 401);

// Re-login with updated Google photo
$photoA_updated = 'https://lh3.googleusercontent.com/photo_user_a_NEW.jpg';
$tokenA_updated = "test_google:{$gidA}:{$emailA}:{$nameA}:{$photoA_updated}";
$reLoginA = httpPost("{$baseUrl}/customers/google-login", ['credential' => $tokenA_updated]);
assertTest('TEST D: Re-login succeeds and returns updated photo',
    $reLoginA['code'] === 200 && ($reLoginA['body']['customer']['profile_photo_path'] ?? '') === $photoA_updated,
    json_encode($reLoginA)
);
$jwtA_new = $reLoginA['body']['token'] ?? '';
$meResA_updated = httpGet("{$baseUrl}/customers/me", ["Authorization: Bearer {$jwtA_new}"]);
assertTest('TEST D: /customers/me returns updated photo from MySQL',
    ($meResA_updated['body']['customer']['profile_photo_path'] ?? '') === $photoA_updated
);

// ==========================================
// TEST E: Login with another Google account -> user B's photo appears, NOT user A's
// ==========================================
echo "\n--- TEST E: Login with another Google account (Customer B) ---\n";
$gidB = 'test_gid_photo_202';
$emailB = 'banu@test-photo.com';
$nameB = 'Banu User';
$photoB = 'https://lh3.googleusercontent.com/photo_user_B_avatar.jpg';
$tokenB = "test_google:{$gidB}:{$emailB}:{$nameB}:{$photoB}";

$resB = httpPost("{$baseUrl}/customers/google-login", ['credential' => $tokenB]);
assertTest('TEST E: Google login for Customer B returns HTTP 201/200',
    ($resB['code'] === 201 || $resB['code'] === 200) && !empty($resB['body']['token'])
);
$jwtB = $resB['body']['token'] ?? '';
$meResB = httpGet("{$baseUrl}/customers/me", ["Authorization: Bearer {$jwtB}"]);
assertTest('TEST E: Customer B profile returns User B photo (not User A photo)',
    ($meResB['body']['customer']['profile_photo_path'] ?? '') === $photoB &&
    ($meResB['body']['customer']['profile_photo_path'] ?? '') !== $photoA_updated
);

// ==========================================
// TEST F: Existing OTP login continues working
// ==========================================
echo "\n--- TEST F: Existing OTP login ---\n";
$mobilePhone = '9876501234';
$sendOtp = httpPost("{$baseUrl}/customers/otp/send", ['phone' => $mobilePhone, 'purpose' => 'LOGIN']);
assertTest('TEST F: OTP send API succeeds', $sendOtp['code'] === 200);

$otpVal = $pdo->query("SELECT otp_hash FROM otp_verifications WHERE phone = '{$mobilePhone}' AND purpose = 'LOGIN' ORDER BY id DESC LIMIT 1")->fetchColumn();
$otpLogin = httpPost("{$baseUrl}/customers/otp/login", ['phone' => $mobilePhone, 'otp' => $otpVal]);
assertTest('TEST F: Mobile OTP login returns HTTP 200 and JWT',
    $otpLogin['code'] === 200 && !empty($otpLogin['body']['token']) && ($otpLogin['body']['customer']['phone'] ?? '') === $mobilePhone
);
$otpJwt = $otpLogin['body']['token'] ?? '';
$otpMe = httpGet("{$baseUrl}/customers/me", ["Authorization: Bearer {$otpJwt}"]);
assertTest('TEST F: OTP user can view My Profile via /customers/me',
    $otpMe['code'] === 200 && ($otpMe['body']['customer']['phone'] ?? '') === $mobilePhone
);

// ==========================================
// TEST G: Verify customers.profile_photo_path in MySQL
// ==========================================
echo "\n--- TEST G: Direct MySQL table verification ---\n";
$stmt = $pdo->prepare("SELECT id, name, email, google_id, profile_photo_path FROM customers WHERE id = :id");
$stmt->execute(['id' => $customerA_id]);
$dbRowA = $stmt->fetch(PDO::FETCH_ASSOC);

assertTest('TEST G: MySQL customers.profile_photo_path contains exact Google photo URL',
    $dbRowA !== false && $dbRowA['profile_photo_path'] === $photoA_updated,
    json_encode($dbRowA)
);

// Cleanup test customers
$pdo->exec("DELETE FROM referral_codes WHERE customer_id IN (SELECT id FROM customers WHERE email LIKE '%@test-photo.com')");
$pdo->exec("DELETE FROM customers WHERE email LIKE '%@test-photo.com' OR google_id LIKE 'test_gid_photo_%'");
echo "\nCleaned up test customer records.\n";

echo "\n============================================\n";
echo "TEST RESULTS: {$passCount} PASSED, {$failCount} FAILED\n";
echo "============================================\n";

if ($failCount === 0) {
    exit(0);
} else {
    exit(1);
}
