<?php

declare(strict_types=1);

/**
 * One-time backfill (C2): generates a referral code for every existing
 * customer who doesn't have one — legacy customers from before the
 * referral system existed, and POS-created ("staff") customers, whose
 * creation path (CustomerAuthController::createForStaff()) never called
 * ReferralService::generateCodeForCustomer() until this fix. Uses the
 * real service (not raw SQL) so the same prefix/uniqueness/collision-
 * retry logic applies as everywhere else a code is generated.
 *
 * Safe to re-run: only customers with no referral_codes row are touched.
 *
 * Usage:
 *   php scripts/backfill_referral_codes.php
 */

require dirname(__DIR__) . '/backend/vendor/autoload.php';

use App\Services\ReferralService;
use Dotenv\Dotenv;

Dotenv::createImmutable(dirname(__DIR__) . '/backend')->safeLoad();

$host = $_ENV['DB_HOST'] ?? '127.0.0.1';
$port = $_ENV['DB_PORT'] ?? '3306';
$name = $_ENV['DB_NAME'] ?? 'unified_pos';
$user = $_ENV['DB_USER'] ?? 'root';
$pass = $_ENV['DB_PASS'] ?? '';

$pdo = new PDO("mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4", $user, $pass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

$referrals = new ReferralService($pdo);

$stmt = $pdo->query(
    'SELECT c.id, c.name FROM customers c
     LEFT JOIN referral_codes rc ON rc.customer_id = c.id
     WHERE rc.id IS NULL AND c.deleted_at IS NULL'
);
$customers = $stmt->fetchAll(PDO::FETCH_ASSOC);

echo 'Found ' . count($customers) . " customer(s) without a referral code.\n";

$generated = 0;
$failed = 0;

foreach ($customers as $customer) {
    try {
        $code = $referrals->generateCodeForCustomer((int) $customer['id'], (string) $customer['name']);
        echo "  customer #{$customer['id']} ({$customer['name']}) -> {$code}\n";
        $generated++;
    } catch (\Throwable $e) {
        echo "  customer #{$customer['id']} ({$customer['name']}) -> FAILED: {$e->getMessage()}\n";
        $failed++;
    }
}

echo "Done. Generated: {$generated}, Failed: {$failed}.\n";
