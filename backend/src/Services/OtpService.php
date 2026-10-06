<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Config;
use PDO;
use RuntimeException;

/**
 * OTP generation/verification (ECOMMERCE_POS_ADMIN_SPEC.md section 2).
 * SMS delivery is a mock adapter (docs/DOCUMENTATION.md section 18 —
 * SMS/WhatsApp through mock adapter until a provider is bought): the OTP
 * is logged, never returned in the API response.
 */
final class OtpService
{
    private const OTP_LENGTH = 6;
    private const EXPIRY_SECONDS = 300;
    private const RESEND_COOLDOWN_SECONDS = 60;
    private const MAX_ATTEMPTS = 5;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array{expires_in: int, cooldown_seconds: int, debug_otp?: string} */
    public function requestOtp(string $phone, string $purpose): array
    {
        $this->assertCooldownElapsed($phone, $purpose);

        $otp = (string) random_int(0, 10 ** self::OTP_LENGTH - 1);
        $otp = str_pad($otp, self::OTP_LENGTH, '0', STR_PAD_LEFT);
        $hash = password_hash($otp, PASSWORD_BCRYPT);

        $stmt = $this->pdo->prepare(
            'INSERT INTO otp_verifications (phone, otp_hash, purpose, expires_at, ip_address)
             VALUES (:phone, :hash, :purpose, DATE_ADD(NOW(), INTERVAL :ttl SECOND), :ip)'
        );
        $stmt->execute([
            'phone' => $phone,
            'hash' => $hash,
            'purpose' => $purpose,
            'ttl' => self::EXPIRY_SECONDS,
            'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
        ]);

        $this->mockSendSms($phone, $otp);

        $result = [
            'expires_in' => self::EXPIRY_SECONDS,
            'cooldown_seconds' => self::RESEND_COOLDOWN_SECONDS,
        ];

        // Dev convenience only — a real SMS/WhatsApp provider is still a
        // mock adapter per docs/DOCUMENTATION.md section 18, so there is
        // nowhere else to see the OTP locally. Never set APP_DEBUG=true
        // outside local development.
        if ((bool) Config::get('app.debug', false)) {
            $result['debug_otp'] = $otp;
        }

        return $result;
    }

    public function verifyOtp(string $phone, string $purpose, string $otp): bool
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, otp_hash, status, attempt_count, max_attempts, expires_at
             FROM otp_verifications
             WHERE phone = :phone AND purpose = :purpose
             ORDER BY id DESC LIMIT 1'
        );
        $stmt->execute(['phone' => $phone, 'purpose' => $purpose]);
        $row = $stmt->fetch();

        if ($row === false) {
            throw new RuntimeException('No OTP was requested for this number');
        }

        if ($row['status'] === 'VERIFIED') {
            throw new RuntimeException('OTP already used');
        }

        if ($row['status'] === 'EXPIRED' || strtotime((string) $row['expires_at']) < time()) {
            $this->markExpired((int) $row['id']);
            throw new RuntimeException('OTP expired, please request a new one');
        }

        if ((int) $row['attempt_count'] >= (int) $row['max_attempts']) {
            $this->markExpired((int) $row['id']);
            throw new RuntimeException('Maximum verification attempts exceeded, please request a new OTP');
        }

        if (!password_verify($otp, (string) $row['otp_hash'])) {
            $this->pdo->prepare('UPDATE otp_verifications SET attempt_count = attempt_count + 1 WHERE id = :id')
                ->execute(['id' => $row['id']]);
            throw new RuntimeException('Invalid OTP');
        }

        $this->pdo->prepare(
            "UPDATE otp_verifications SET status = 'VERIFIED', verified_at = NOW() WHERE id = :id"
        )->execute(['id' => $row['id']]);

        return true;
    }

    public function hasRecentlyVerified(string $phone, string $purpose, int $withinSeconds = 600): bool
    {
        $stmt = $this->pdo->prepare(
            "SELECT 1 FROM otp_verifications
             WHERE phone = :phone AND purpose = :purpose AND status = 'VERIFIED'
               AND verified_at >= DATE_SUB(NOW(), INTERVAL :seconds SECOND)
             ORDER BY id DESC LIMIT 1"
        );
        $stmt->execute(['phone' => $phone, 'purpose' => $purpose, 'seconds' => $withinSeconds]);

        return $stmt->fetchColumn() !== false;
    }

    private function assertCooldownElapsed(string $phone, string $purpose): void
    {
        $stmt = $this->pdo->prepare(
            'SELECT created_at FROM otp_verifications
             WHERE phone = :phone AND purpose = :purpose
             ORDER BY id DESC LIMIT 1'
        );
        $stmt->execute(['phone' => $phone, 'purpose' => $purpose]);
        $lastCreatedAt = $stmt->fetchColumn();

        if ($lastCreatedAt === false) {
            return;
        }

        $secondsSinceLast = time() - strtotime((string) $lastCreatedAt);

        if ($secondsSinceLast < self::RESEND_COOLDOWN_SECONDS) {
            $wait = self::RESEND_COOLDOWN_SECONDS - $secondsSinceLast;
            throw new RuntimeException("Please wait {$wait}s before requesting another OTP");
        }
    }

    private function markExpired(int $id): void
    {
        $this->pdo->prepare("UPDATE otp_verifications SET status = 'EXPIRED' WHERE id = :id")
            ->execute(['id' => $id]);
    }

    private function mockSendSms(string $phone, string $otp): void
    {
        error_log("[MockSmsAdapter] OTP for {$phone}: {$otp} (valid " . self::EXPIRY_SECONDS . 's)');
    }
}
