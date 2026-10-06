<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Referral system (ECOMMERCE_POS_ADMIN_SPEC.md sections 3-4). A customer
 * cannot refer themself, the same referral is never rewarded twice per
 * side (enforced by uq_referral_rewards_side), and rewards stay PENDING
 * until the configured trigger event actually happens.
 */
final class ReferralService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function generateCodeForCustomer(int $customerId, string $name): string
    {
        $settings = $this->getSettings();
        $prefix = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $settings['referral_code_prefix'] ?? '') ?: $this->nameToPrefix($name));

        for ($attempt = 0; $attempt < 10; $attempt++) {
            $code = $prefix . random_int(10, 99);

            $stmt = $this->pdo->prepare('SELECT 1 FROM referral_codes WHERE code = :code');
            $stmt->execute(['code' => $code]);

            if ($stmt->fetchColumn() === false) {
                $this->pdo->prepare('INSERT INTO referral_codes (customer_id, code) VALUES (:customer_id, :code)')
                    ->execute(['customer_id' => $customerId, 'code' => $code]);

                return $code;
            }
        }

        throw new RuntimeException('Could not generate a unique referral code, please retry');
    }

    /**
     * Applies an (optional) referral code at signup. Does nothing when
     * referrals are disabled, the code is missing/invalid, or it would be
     * a self-referral. Never throws for an invalid code — signup must not
     * fail because of a typo in an optional field.
     */
    public function applyReferralAtSignup(int $newCustomerId, ?string $referralCodeInput): void
    {
        if ($referralCodeInput === null || trim($referralCodeInput) === '') {
            return;
        }

        $settings = $this->getSettings();

        if (!$settings['is_enabled']) {
            return;
        }

        $stmt = $this->pdo->prepare(
            'SELECT rc.id AS referral_code_id, rc.customer_id AS referrer_customer_id
             FROM referral_codes rc WHERE rc.code = :code'
        );
        $stmt->execute(['code' => trim($referralCodeInput)]);
        $code = $stmt->fetch();

        if ($code === false) {
            return;
        }

        $referrerCustomerId = (int) $code['referrer_customer_id'];

        if ($referrerCustomerId === $newCustomerId) {
            return;
        }

        $expiresAt = $settings['referral_validity_days'] !== null
            ? date('Y-m-d H:i:s', strtotime('+' . (int) $settings['referral_validity_days'] . ' days'))
            : null;

        // No transaction here — the caller (e.g. CustomerAuthController::signup)
        // already runs this inside its own transaction; PDO does not support
        // nested transactions.
        $initialStatus = $settings['reward_trigger'] === 'SIGNUP' ? 'ELIGIBLE' : 'PENDING';

        $this->pdo->prepare(
            'INSERT INTO referrals (referrer_customer_id, referred_customer_id, referral_code_id, status)
             VALUES (:referrer, :referred, :code_id, :status)'
        )->execute([
            'referrer' => $referrerCustomerId,
            'referred' => $newCustomerId,
            'code_id' => $code['referral_code_id'],
            'status' => $initialStatus,
        ]);

        $referralId = (int) $this->pdo->lastInsertId();

        $this->createReward($referralId, $referrerCustomerId, 'REFERRER', (float) $settings['referrer_discount_percent'], $settings, $expiresAt);
        $this->createReward($referralId, $newCustomerId, 'REFERRED', (float) $settings['referred_discount_percent'], $settings, $expiresAt);
    }

    /** @return array<string, mixed> */
    public function getSettings(): array
    {
        $stmt = $this->pdo->query('SELECT * FROM referral_settings WHERE id = 1');
        $row = $stmt->fetch();
        $row['is_enabled'] = (bool) $row['is_enabled'];
        $row['first_order_only'] = (bool) $row['first_order_only'];

        return $row;
    }

    /** @param array<string, mixed> $data */
    public function updateSettings(array $data): void
    {
        $this->pdo->prepare(
            'UPDATE referral_settings SET
                is_enabled = :is_enabled,
                referrer_discount_percent = :referrer_discount_percent,
                referred_discount_percent = :referred_discount_percent,
                max_discount_amount = :max_discount_amount,
                min_order_amount = :min_order_amount,
                first_order_only = :first_order_only,
                reward_trigger = :reward_trigger,
                referral_validity_days = :referral_validity_days,
                referral_code_prefix = :referral_code_prefix
             WHERE id = 1'
        )->execute([
            'is_enabled' => (int) ($data['is_enabled'] ?? false),
            'referrer_discount_percent' => $data['referrer_discount_percent'] ?? 0,
            'referred_discount_percent' => $data['referred_discount_percent'] ?? 0,
            'max_discount_amount' => $data['max_discount_amount'] ?? null,
            'min_order_amount' => $data['min_order_amount'] ?? null,
            'first_order_only' => (int) ($data['first_order_only'] ?? true),
            'reward_trigger' => $data['reward_trigger'] ?? 'FIRST_DELIVERED_ORDER',
            'referral_validity_days' => $data['referral_validity_days'] ?? null,
            'referral_code_prefix' => $data['referral_code_prefix'] ?? null,
        ]);
    }

    /** @return array<string, mixed> */
    public function getCustomerReferralSummary(int $customerId): array
    {
        $code = $this->pdo->prepare('SELECT code FROM referral_codes WHERE customer_id = :id');
        $code->execute(['id' => $customerId]);

        $referrals = $this->pdo->prepare(
            'SELECT r.id, r.referred_customer_id, c.name AS referred_name, r.status, r.created_at
             FROM referrals r JOIN customers c ON c.id = r.referred_customer_id
             WHERE r.referrer_customer_id = :id ORDER BY r.created_at DESC'
        );
        $referrals->execute(['id' => $customerId]);

        $rewards = $this->pdo->prepare(
            'SELECT id, reward_side, discount_percent, discount_amount, status, trigger_event, expires_at
             FROM referral_rewards WHERE beneficiary_customer_id = :id ORDER BY id DESC'
        );
        $rewards->execute(['id' => $customerId]);

        return [
            'referral_code' => $code->fetchColumn() ?: null,
            'referrals' => $referrals->fetchAll(),
            'rewards' => $rewards->fetchAll(),
        ];
    }

    /** @param array<string, mixed> $settings */
    private function createReward(int $referralId, int $beneficiaryCustomerId, string $side, float $percent, array $settings, ?string $expiresAt): void
    {
        if ($percent <= 0) {
            return;
        }

        $status = $settings['reward_trigger'] === 'SIGNUP' ? 'ELIGIBLE' : 'PENDING';

        $this->pdo->prepare(
            'INSERT INTO referral_rewards
                (referral_id, beneficiary_customer_id, reward_side, discount_percent, status, trigger_event, expires_at)
             VALUES (:referral_id, :beneficiary, :side, :percent, :status, :trigger, :expires_at)'
        )->execute([
            'referral_id' => $referralId,
            'beneficiary' => $beneficiaryCustomerId,
            'side' => $side,
            'percent' => $percent,
            'status' => $status,
            'trigger' => $settings['reward_trigger'],
            'expires_at' => $expiresAt,
        ]);
    }

    private function nameToPrefix(string $name): string
    {
        $clean = strtoupper(preg_replace('/[^A-Za-z]/', '', $name) ?: 'USER');

        return substr($clean, 0, 8) ?: 'USER';
    }
}
