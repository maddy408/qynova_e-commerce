<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Config;
use App\Helpers\JwtHelper;
use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\GoogleAuthService;
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

        $rawEmail = isset($body['email']) ? trim((string) $body['email']) : '';
        $email = $rawEmail !== '' ? strtolower($rawEmail) : null;

        if ($name === '' || $phone === null) {
            Response::error('name and a valid phone are required', 422);
        }

        if ($email !== null) {
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                Response::error('Enter a valid email address', 422);
            }

            $emailExists = $this->pdo->prepare('SELECT 1 FROM customers WHERE email = :email AND deleted_at IS NULL');
            $emailExists->execute(['email' => $email]);
            if ($emailExists->fetchColumn() !== false) {
                Response::error('An account with this email address already exists', 409);
            }
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
                'INSERT INTO customers (name, phone, email, phone_verified_at, password_hash, status)
                 VALUES (:name, :phone, :email, NOW(), :password_hash, "ACTIVE")'
            )->execute([
                'name' => $name,
                'phone' => $phone,
                'email' => $email,
                'password_hash' => password_hash($password, PASSWORD_BCRYPT),
            ]);

            $customerId = (int) $this->pdo->lastInsertId();

            $referralService = new ReferralService($this->pdo);
            $referralService->generateCodeForCustomer($customerId, $name);
            $referralResult = $referralService->applyReferralAtSignup($customerId, $referralCode !== null ? (string) $referralCode : null);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        Response::json([
            'token' => $this->issueToken($customerId, $name, $phone),
            'customer' => ['id' => $customerId, 'name' => $name, 'phone' => $phone, 'email' => $email],
            'referral_applied' => $referralResult !== null && !empty($referralResult['success']),
            'referral' => $referralResult,
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
            "SELECT id, name, phone, email, profile_photo_path, customer_type, password_hash FROM customers WHERE phone = :phone AND status = 'ACTIVE' AND deleted_at IS NULL"
        );
        $stmt->execute(['phone' => $phone]);
        $customer = $stmt->fetch();

        if ($customer === false || $customer['password_hash'] === null || !password_verify($password, $customer['password_hash'])) {
            Response::error('Invalid phone number or password', 401);
        }

        Response::json([
            'token' => $this->issueToken((int) $customer['id'], $customer['name'], $phone),
            'customer' => [
                'id' => (int) $customer['id'],
                'name' => $customer['name'],
                'phone' => $phone,
                'email' => $customer['email'],
                'profile_photo_path' => $customer['profile_photo_path'],
                'customer_type' => $customer['customer_type'] ?? 'RETAIL',
            ],
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
            "SELECT id, name, phone, email, profile_photo_path, customer_type FROM customers WHERE phone = :phone AND status = 'ACTIVE' AND deleted_at IS NULL"
        );
        $stmt->execute(['phone' => $phone]);
        $customer = $stmt->fetch();

        if ($customer === false) {
            Response::error('No account found for this phone number', 404);
        }

        Response::json([
            'token' => $this->issueToken((int) $customer['id'], $customer['name'], $phone),
            'customer' => [
                'id' => (int) $customer['id'],
                'name' => $customer['name'],
                'phone' => $phone,
                'email' => $customer['email'],
                'profile_photo_path' => $customer['profile_photo_path'],
                'customer_type' => $customer['customer_type'] ?? 'RETAIL',
            ],
        ]);
    }

    public function loginWithGoogle(): void
    {
        $body = Request::json();
        $credential = (string) ($body['credential'] ?? $body['id_token'] ?? '');

        if (trim($credential) === '') {
            Response::error('Google credential token is required', 422);
        }

        try {
            $googleAuth = new GoogleAuthService();
            $googleUser = $googleAuth->verifyIdToken($credential);
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 401);
        }

        $googleId = trim((string) ($googleUser['google_id'] ?? ''));
        $email = strtolower(trim((string) ($googleUser['email'] ?? '')));
        $name = trim((string) ($googleUser['name'] ?? ''));
        $picture = !empty($googleUser['picture']) ? (string) $googleUser['picture'] : null;

        if ($googleId === '' || $email === '') {
            Response::error('Invalid Google user data: missing ID or email', 422);
        }

        // STEP 1: Search customer by verified Google sub in google_id
        $stmt = $this->pdo->prepare('SELECT * FROM customers WHERE google_id = :google_id AND google_id IS NOT NULL AND google_id != ""');
        $stmt->execute(['google_id' => $googleId]);
        $customerByGoogle = $stmt->fetch();

        if ($customerByGoogle !== false) {
            // Check inactive or deleted
            if ($customerByGoogle['status'] !== 'ACTIVE' || $customerByGoogle['deleted_at'] !== null) {
                Response::error('This account has been deactivated or deleted. Please contact support.', 403);
            }

            // RULE 8: If google_id belongs to another customer but the Google email is different, reject!
            if (!empty($customerByGoogle['email']) && strtolower(trim($customerByGoogle['email'])) !== $email) {
                Response::error('This Google account is linked to an account with a different email address', 403);
            }

            // If existing customer had no email stored, update with verified Google email
            if (empty($customerByGoogle['email'])) {
                $this->pdo->prepare('UPDATE customers SET email = :email WHERE id = :id')
                    ->execute(['email' => $email, 'id' => $customerByGoogle['id']]);
                $customerByGoogle['email'] = $email;
            }

            // Refresh/update profile photo if Google provides one
            if ($picture !== null && $picture !== '') {
                $this->pdo->prepare(
                    'UPDATE customers SET profile_photo_path = :picture, updated_at = NOW() WHERE id = :id'
                )->execute([
                    'picture' => $picture,
                    'id' => $customerByGoogle['id'],
                ]);
                $customerByGoogle['profile_photo_path'] = $picture;
            }

            Response::json([
                'token' => $this->issueToken((int) $customerByGoogle['id'], $customerByGoogle['name'], (string) ($customerByGoogle['phone'] ?? '')),
                'customer' => [
                    'id' => (int) $customerByGoogle['id'],
                    'name' => $customerByGoogle['name'],
                    'phone' => $customerByGoogle['phone'],
                    'email' => $customerByGoogle['email'],
                    'profile_photo_path' => $customerByGoogle['profile_photo_path'],
                    'customer_type' => $customerByGoogle['customer_type'] ?? 'RETAIL',
                ],
                'is_new_customer' => false,
                'linked_existing' => false,
            ]);
            return;
        }

        // STEP 2: Search customer by verified Google email in customers.email
        $stmt = $this->pdo->prepare('SELECT * FROM customers WHERE email = :email AND email IS NOT NULL AND email != ""');
        $stmt->execute(['email' => $email]);
        $customerByEmail = $stmt->fetch();

        if ($customerByEmail !== false) {
            // Check inactive or deleted
            if ($customerByEmail['status'] !== 'ACTIVE' || $customerByEmail['deleted_at'] !== null) {
                Response::error('This account has been deactivated or deleted. Please contact support.', 403);
            }

            // If existing account already has a different google_id, reject mismatch!
            if (!empty($customerByEmail['google_id']) && $customerByEmail['google_id'] !== $googleId) {
                Response::error('This email account is already linked to a different Google account', 403);
            }

            // Link verified Google ID to that existing customer & update profile photo
            $this->pdo->prepare(
                'UPDATE customers 
                 SET google_id = :google_id, 
                     profile_photo_path = COALESCE(:picture, profile_photo_path),
                     updated_at = NOW() 
                 WHERE id = :id'
            )->execute([
                'google_id' => $googleId,
                'picture' => $picture,
                'id' => $customerByEmail['id'],
            ]);

            $customerByEmail['google_id'] = $googleId;
            if ($picture !== null && $picture !== '') {
                $customerByEmail['profile_photo_path'] = $picture;
            }

            Response::json([
                'token' => $this->issueToken((int) $customerByEmail['id'], $customerByEmail['name'], (string) ($customerByEmail['phone'] ?? '')),
                'customer' => [
                    'id' => (int) $customerByEmail['id'],
                    'name' => $customerByEmail['name'],
                    'phone' => $customerByEmail['phone'],
                    'email' => $customerByEmail['email'],
                    'profile_photo_path' => $customerByEmail['profile_photo_path'],
                    'customer_type' => $customerByEmail['customer_type'] ?? 'RETAIL',
                ],
                'is_new_customer' => false,
                'linked_existing' => true,
            ]);
            return;
        }

        // CASE 3: Completely new Google customer
        $this->pdo->beginTransaction();

        try {
            $this->pdo->prepare(
                'INSERT INTO customers (name, email, google_id, profile_photo_path, customer_type, profile_completed, status)
                 VALUES (:name, :email, :google_id, :picture, "RETAIL", 0, "ACTIVE")'
            )->execute([
                'name' => $name,
                'email' => $email,
                'google_id' => $googleId,
                'picture' => $picture,
            ]);

            $newCustomerId = (int) $this->pdo->lastInsertId();

            // Automatically generate unique referral code for the new customer
            $referralService = new ReferralService($this->pdo);
            $referralService->generateCodeForCustomer($newCustomerId, $name);

            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        Response::json([
            'token' => $this->issueToken($newCustomerId, $name, ''),
            'customer' => [
                'id' => $newCustomerId,
                'name' => $name,
                'phone' => null,
                'email' => $email,
                'profile_photo_path' => $picture,
                'customer_type' => 'RETAIL',
            ],
            'is_new_customer' => true,
            'linked_existing' => false,
        ], 201);
    }

    public function me(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);

        $customerId = (int) $claims['sub'];

        $stmt = $this->pdo->prepare(
            'SELECT id, name, phone, email, profile_photo_path, customer_type, profile_completed, created_at
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

    public function applyReferral(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);
        $customerId = (int) $claims['sub'];

        $body = Request::json();
        $referralCode = trim((string) ($body['referral_code'] ?? ''));

        if ($referralCode === '') {
            Response::error('Referral code is required', 422);
        }

        try {
            $referralService = new ReferralService($this->pdo);
            $result = $referralService->applyReferral($customerId, $referralCode);
            Response::json($result);
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function validateReferral(): void
    {
        $body = Request::json();
        $referralCode = trim((string) ($body['referral_code'] ?? ''));

        if ($referralCode === '') {
            Response::error('Referral code is required', 422);
        }

        $customerId = null;
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        if ($authHeader !== '') {
            try {
                $claims = JwtAuthMiddleware::authenticate();
                $customerId = (int) ($claims['sub'] ?? 0) ?: null;
            } catch (\Throwable) {
                // Ignore if unauthenticated
            }
        }

        try {
            $referralService = new ReferralService($this->pdo);
            $result = $referralService->validateReferralCode($referralCode, $customerId);
            Response::json($result);
        } catch (\RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** Staff-facing customer listing & search for POS billing & customer management. */
    public function indexForStaff(): void
    {
        $claims = JwtAuthMiddleware::authenticate();

        $search = trim((string) ($_GET['search'] ?? ''));
        $type = trim((string) ($_GET['type'] ?? ''));
        $where = ['c.deleted_at IS NULL'];
        $params = [];

        if ($search !== '') {
            $where[] = '(c.name LIKE :search1 OR c.phone LIKE :search2 OR c.email LIKE :search3)';
            $needle = '%' . $search . '%';
            $params['search1'] = $needle;
            $params['search2'] = $needle;
            $params['search3'] = $needle;
        }

        if (in_array(strtoupper($type), ['RETAIL', 'WHOLESALE'], true)) {
            $where[] = 'c.customer_type = :type';
            $params['type'] = strtoupper($type);
        }

        $stmt = $this->pdo->prepare(
            'SELECT c.id, c.name, c.phone, c.email, c.customer_type, c.status, c.created_at,
                    (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count,
                    (SELECT COALESCE(SUM(i.grand_total), 0) FROM invoices i WHERE i.customer_id = c.id AND i.status = "ACTIVE") AS total_spent,
                    (SELECT MAX(created_at) FROM orders o WHERE o.customer_id = c.id) AS latest_order_at
             FROM customers c WHERE ' . implode(' AND ', $where) . ' ORDER BY c.created_at DESC LIMIT 200'
        );
        $stmt->execute($params);

        Response::json(['customers' => $stmt->fetchAll()]);
    }

    /** Staff updating customer_type (Retail vs Wholesale mapping) & customer profile. */
    public function updateForStaff(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();

        $customerId = (int) $id;
        $body = Request::json();

        $fields = [];
        $params = ['id' => $customerId];

        if (array_key_exists('name', $body) && trim((string) $body['name']) !== '') {
            $fields[] = 'name = :name';
            $params['name'] = trim((string) $body['name']);
        }

        if (array_key_exists('customer_type', $body)) {
            $type = strtoupper(trim((string) $body['customer_type']));
            if (!in_array($type, ['RETAIL', 'WHOLESALE'], true)) {
                Response::error('customer_type must be RETAIL or WHOLESALE', 422);
            }
            $fields[] = 'customer_type = :customer_type';
            $params['customer_type'] = $type;
        }

        if (array_key_exists('status', $body)) {
            $status = strtoupper(trim((string) $body['status']));
            if (!in_array($status, ['ACTIVE', 'INACTIVE'], true)) {
                Response::error('status must be ACTIVE or INACTIVE', 422);
            }
            $fields[] = 'status = :status';
            $params['status'] = $status;
        }

        if (array_key_exists('email', $body)) {
            $fields[] = 'email = :email';
            $params['email'] = trim((string) $body['email']) ?: null;
        }

        if ($fields === []) {
            Response::json(['updated' => false, 'message' => 'No fields to update']);
        }

        $stmt = $this->pdo->prepare('UPDATE customers SET ' . implode(', ', $fields) . ' WHERE id = :id');
        $stmt->execute($params);

        Response::json(['updated' => true]);
    }
    /** GET /api/customer/addresses - Customer's saved addresses */
    public function getAddresses(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);
        $customerId = (int) $claims['sub'];

        $stmt = $this->pdo->prepare(
            "SELECT * FROM customer_addresses WHERE customer_id = :id ORDER BY is_default DESC, id DESC"
        );
        $stmt->execute(['id' => $customerId]);
        Response::json(['addresses' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
    }

    /** POST /api/customer/addresses - Add customer address */
    public function storeAddress(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);
        $customerId = (int) $claims['sub'];
        $body = Request::json();

        $name = trim((string) ($body['name'] ?? $claims['name'] ?? ''));
        $phone = trim((string) ($body['phone'] ?? $claims['phone'] ?? ''));
        $line1 = trim((string) ($body['line1'] ?? $body['address_line1'] ?? ''));
        $line2 = trim((string) ($body['line2'] ?? $body['address_line2'] ?? ''));
        $city = trim((string) ($body['city_district'] ?? $body['city'] ?? ''));
        $state = trim((string) ($body['state'] ?? ''));
        $pincode = trim((string) ($body['pincode'] ?? ''));
        $landmark = trim((string) ($body['landmark'] ?? ''));
        $addressType = trim((string) ($body['address_type'] ?? 'HOME'));
        $isDefault = !empty($body['is_default']) ? 1 : 0;

        if ($name === '' || $phone === '' || $line1 === '' || $city === '' || $pincode === '') {
            Response::error('Name, phone, address line, city, and pincode are required', 422);
            return;
        }

        if ($isDefault === 1) {
            $this->pdo->prepare("UPDATE customer_addresses SET is_default = 0 WHERE customer_id = :cid")
                ->execute(['cid' => $customerId]);
        }

        $stmt = $this->pdo->prepare(
            "INSERT INTO customer_addresses (customer_id, name, phone, line1, line2, city_district, state, pincode, landmark, address_type, is_default)
             VALUES (:cid, :name, :phone, :line1, :line2, :city, :state, :pincode, :landmark, :type, :def)"
        );
        $stmt->execute([
            'cid' => $customerId,
            'name' => $name,
            'phone' => $phone,
            'line1' => $line1,
            'line2' => $line2,
            'city' => $city,
            'state' => $state,
            'pincode' => $pincode,
            'landmark' => $landmark,
            'type' => $addressType,
            'def' => $isDefault,
        ]);

        $newId = (int) $this->pdo->lastInsertId();
        Response::json(['id' => $newId, 'message' => 'Address saved successfully'], 201);
    }

    /** PUT /api/customer/addresses/{id} - Update customer address */
    public function updateAddress(string $addressId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);
        $customerId = (int) $claims['sub'];
        $body = Request::json();

        $stmt = $this->pdo->prepare("SELECT id FROM customer_addresses WHERE id = :id AND customer_id = :cid");
        $stmt->execute(['id' => (int) $addressId, 'cid' => $customerId]);
        if (!$stmt->fetch()) {
            Response::error('Address not found', 404);
            return;
        }

        $name = trim((string) ($body['name'] ?? ''));
        $phone = trim((string) ($body['phone'] ?? ''));
        $line1 = trim((string) ($body['line1'] ?? $body['address_line1'] ?? ''));
        $line2 = trim((string) ($body['line2'] ?? $body['address_line2'] ?? ''));
        $city = trim((string) ($body['city_district'] ?? $body['city'] ?? ''));
        $state = trim((string) ($body['state'] ?? ''));
        $pincode = trim((string) ($body['pincode'] ?? ''));
        $landmark = trim((string) ($body['landmark'] ?? ''));
        $addressType = trim((string) ($body['address_type'] ?? 'HOME'));
        $isDefault = !empty($body['is_default']) ? 1 : 0;

        if ($isDefault === 1) {
            $this->pdo->prepare("UPDATE customer_addresses SET is_default = 0 WHERE customer_id = :cid")
                ->execute(['cid' => $customerId]);
        }

        $updateStmt = $this->pdo->prepare(
            "UPDATE customer_addresses
             SET name = :name, phone = :phone, line1 = :line1, line2 = :line2,
                 city_district = :city, state = :state, pincode = :pincode,
                 landmark = :landmark, address_type = :type, is_default = :def
             WHERE id = :id AND customer_id = :cid"
        );
        $updateStmt->execute([
            'name' => $name,
            'phone' => $phone,
            'line1' => $line1,
            'line2' => $line2,
            'city' => $city,
            'state' => $state,
            'pincode' => $pincode,
            'landmark' => $landmark,
            'type' => $addressType,
            'def' => $isDefault,
            'id' => (int) $addressId,
            'cid' => $customerId,
        ]);

        Response::json(['message' => 'Address updated successfully']);
    }

    /** DELETE /api/customer/addresses/{id} - Delete customer address */
    public function deleteAddress(string $addressId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);
        $customerId = (int) $claims['sub'];

        $stmt = $this->pdo->prepare("DELETE FROM customer_addresses WHERE id = :id AND customer_id = :cid");
        $stmt->execute(['id' => (int) $addressId, 'cid' => $customerId]);

        Response::json(['message' => 'Address deleted successfully']);
    }

    /** PUT /api/customers/me - Update customer profile */
    public function updateProfile(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::requireCustomer($claims);
        $customerId = (int) $claims['sub'];
        $body = Request::json();

        $name = trim((string) ($body['name'] ?? ''));
        $email = trim((string) ($body['email'] ?? ''));

        if ($name === '') {
            Response::error('Name is required', 422);
            return;
        }

        $stmt = $this->pdo->prepare("UPDATE customers SET name = :name, email = :email WHERE id = :id");
        $stmt->execute(['name' => $name, 'email' => $email ?: null, 'id' => $customerId]);

        $fetchStmt = $this->pdo->prepare("SELECT id, name, phone, email, customer_type, profile_photo_path FROM customers WHERE id = :id");
        $fetchStmt->execute(['id' => $customerId]);
        Response::json(['customer' => $fetchStmt->fetch(PDO::FETCH_ASSOC)]);
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
