<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Config;
use App\Helpers\JwtHelper;
use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\OtpService;
use App\Services\ReferralService;
use PDO;
use RuntimeException;

final class CustomerAuthController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function sendOtp(): void
    {
        $body = Request::json();
        $phone = $this->normalizePhone((string) ($body['phone'] ?? ''));
        $purpose = (string) ($body['purpose'] ?? 'SIGNUP');

        if (!in_array($purpose, ['SIGNUP', 'LOGIN', 'RESET_PASSWORD'], true)) {
            Response::error('Invalid purpose', 422);
        }

        if ($phone === null) {
            Response::error('A valid 10-digit mobile number is required', 422);
        }

        try {
            $result = (new OtpService($this->pdo))->requestOtp($phone, $purpose);
            Response::json(['message' => 'OTP sent', ...$result]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 429);
        }
    }

    public function verifyOtp(): void
    {
        $body = Request::json();
        $phone = $this->normalizePhone((string) ($body['phone'] ?? ''));
        $purpose = (string) ($body['purpose'] ?? 'SIGNUP');
        $otp = (string) ($body['otp'] ?? '');

        if ($phone === null || $otp === '') {
            Response::error('phone and otp are required', 422);
        }

        try {
            (new OtpService($this->pdo))->verifyOtp($phone, $purpose, $otp);
            Response::json(['verified' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function signup(): void
    {
        $body = Request::json();
        $name = trim((string) ($body['name'] ?? ''));
        $phone = $this->normalizePhone((string) ($body['phone'] ?? ''));
        $password = (string) ($body['password'] ?? '');
        $confirmPassword = (string) ($body['confirm_password'] ?? '');
        $referralCode = $body['referral_code'] ?? null;

        if ($name === '' || $phone === null) {
            Response::error('name and a valid phone are required', 422);
        }

        if (strlen($password) < 6) {
            Response::error('Password must be at least 6 characters', 422);
        }

        if ($password !== $confirmPassword) {
            Response::error('Passwords do not match', 422);
        }

        $otpService = new OtpService($this->pdo);

        if (!$otpService->hasRecentlyVerified($phone, 'SIGNUP')) {
            Response::error('Phone number is not verified — request and verify an OTP first', 422);
        }

        $exists = $this->pdo->prepare('SELECT 1 FROM customers WHERE phone = :phone');
        $exists->execute(['phone' => $phone]);

        if ($exists->fetchColumn() !== false) {
            Response::error('An account with this phone number already exists', 409);
        }

        $this->pdo->beginTransaction();

        try {
            $this->pdo->prepare(
                'INSERT INTO customers (name, phone, phone_verified_at, password_hash, status)
                 VALUES (:name, :phone, NOW(), :password_hash, "ACTIVE")'
            )->execute([
                'name' => $name,
                'phone' => $phone,
                'password_hash' => password_hash($password, PASSWORD_BCRYPT),
            ]);

            $customerId = (int) $this->pdo->lastInsertId();

            $referralService = new ReferralService($this->pdo);
            $referralService->generateCodeForCustomer($customerId, $name);
            $referralService->applyReferralAtSignup($customerId, $referralCode !== null ? (string) $referralCode : null);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        Response::json([
            'token' => $this->issueToken($customerId, $name, $phone),
            'customer' => ['id' => $customerId, 'name' => $name, 'phone' => $phone],
        ], 201);
    }

    public function login(): void
    {
        $body = Request::json();
        $phone = $this->normalizePhone((string) ($body['phone'] ?? ''));
        $password = (string) ($body['password'] ?? '');

        if ($phone === null) {
            Response::error('A valid phone number is required', 422);
        }

        $stmt = $this->pdo->prepare(
            "SELECT id, name, password_hash FROM customers WHERE phone = :phone AND status = 'ACTIVE' AND deleted_at IS NULL"
        );
        $stmt->execute(['phone' => $phone]);
        $customer = $stmt->fetch();

        if ($customer === false || $customer['password_hash'] === null || !password_verify($password, $customer['password_hash'])) {
            Response::error('Invalid phone number or password', 401);
        }

        Response::json([
            'token' => $this->issueToken((int) $customer['id'], $customer['name'], $phone),
            'customer' => ['id' => (int) $customer['id'], 'name' => $customer['name'], 'phone' => $phone],
        ]);
    }

    public function loginWithOtp(): void
    {
        $body = Request::json();
        $phone = $this->normalizePhone((string) ($body['phone'] ?? ''));
        $otp = (string) ($body['otp'] ?? '');

        if ($phone === null || $otp === '') {
            Response::error('phone and otp are required', 422);
        }

        try {
            (new OtpService($this->pdo))->verifyOtp($phone, 'LOGIN', $otp);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }

        $stmt = $this->pdo->prepare(
            "SELECT id, name FROM customers WHERE phone = :phone AND status = 'ACTIVE' AND deleted_at IS NULL"
        );
        $stmt->execute(['phone' => $phone]);
        $customer = $stmt->fetch();

        if ($customer === false) {
            Response::error('No account found for this phone number', 404);
        }

        Response::json([
            'token' => $this->issueToken((int) $customer['id'], $customer['name'], $phone),
            'customer' => ['id' => (int) $customer['id'], 'name' => $customer['name'], 'phone' => $phone],
        ]);
    }

    public function me(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);

        $customerId = (int) $claims['sub'];

        $stmt = $this->pdo->prepare(
            'SELECT id, name, phone, email, customer_type, profile_completed, created_at
             FROM customers WHERE id = :id'
        );
        $stmt->execute(['id' => $customerId]);
        $customer = $stmt->fetch();

        if ($customer === false) {
            Response::error('Not found', 404);
        }

        $referral = (new ReferralService($this->pdo))->getCustomerReferralSummary($customerId);

        Response::json(['customer' => $customer, 'referral' => $referral]);
    }

    /** Staff-facing customer search for POS billing's customer picker. */
    public function indexForStaff(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.sell');

        $search = trim((string) ($_GET['search'] ?? ''));
        $where = ['deleted_at IS NULL'];
        $params = [];

        if ($search !== '') {
            $where[] = '(name LIKE :search1 OR phone LIKE :search2)';
            $needle = '%' . $search . '%';
            $params['search1'] = $needle;
            $params['search2'] = $needle;
        }

        $stmt = $this->pdo->prepare(
            'SELECT c.id, c.name, c.phone, c.customer_type, c.created_at,
                    (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count,
                    (SELECT MAX(created_at) FROM orders o WHERE o.customer_id = c.id) AS latest_order_at
             FROM customers c WHERE ' . implode(' AND ', $where) . ' ORDER BY latest_order_at DESC, c.name LIMIT 50'
        );
        $stmt->execute($params);

        Response::json(['customers' => $stmt->fetchAll()]);
    }

    private function issueToken(int $customerId, string $name, string $phone): string
    {
        return JwtHelper::issue(
            ['sub' => $customerId, 'type' => 'customer', 'name' => $name, 'phone' => $phone],
            (int) Config::get('jwt.access_ttl', 900)
        );
    }

    private function normalizePhone(string $phone): ?string
    {
        $digits = preg_replace('/\D/', '', $phone) ?? '';

        if (strlen($digits) === 12 && str_starts_with($digits, '91')) {
            $digits = substr($digits, 2);
        }

        return preg_match('/^[6-9]\d{9}$/', $digits) === 1 ? $digits : null;
    }
}
