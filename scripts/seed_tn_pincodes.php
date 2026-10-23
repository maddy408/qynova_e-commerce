<?php

declare(strict_types=1);

/**
 * One-time, resumable seed of every Tamil Nadu pincode (600001-643999)
 * into tn_pincodes, via the free India Post API
 * (https://api.postalpincode.in/pincode/{pincode}) — there is no
 * "list all pincodes of a state" endpoint, only lookup-by-pincode, so
 * this just loops the whole numeric range once. Only district/office
 * data is cached here; lat/lng are geocoded lazily elsewhere (on first
 * real checkout use of that pincode) via PincodeGeocodingService, never
 * in bulk — Nominatim's usage policy would never tolerate ~44,000 eager
 * geocode calls.
 *
 * - Rate-limited to ~1 request per 500ms (usleep between pincodes).
 * - Retries a failed HTTP call up to 3 times with exponential backoff
 *   (1s, 2s, 4s) before giving up on that pincode and moving on.
 * - Resumable: the last successfully processed pincode is written to a
 *   small state file next to this script after every pincode, so a
 *   crash/interrupt can be restarted with no args and it picks up where
 *   it left off. Pass --restart to ignore the state file and start over
 *   from 600001 (the underlying INSERT ... ON DUPLICATE KEY UPDATE in
 *   cacheFromIndiaPostWithStatus() makes every run safe to repeat).
 *
 * Usage:
 *   php scripts/seed_tn_pincodes.php
 *   php scripts/seed_tn_pincodes.php --restart
 */

require dirname(__DIR__) . '/backend/vendor/autoload.php';

use App\Services\PincodeGeocodingService;
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

const RANGE_START = 600001;
const RANGE_END = 643999;
const DELAY_MICROSECONDS = 500_000; // ~1 request per 500ms
const MAX_RETRIES = 3;

$stateFile = __DIR__ . '/.seed_tn_pincodes.state';
$restart = in_array('--restart', $argv, true);

$resumeFrom = RANGE_START;
if (!$restart && is_file($stateFile)) {
    $state = json_decode((string) file_get_contents($stateFile), true);
    if (is_array($state) && isset($state['last_pincode']) && is_numeric($state['last_pincode'])) {
        $resumeFrom = max(RANGE_START, (int) $state['last_pincode'] + 1);
    }
}

if ($resumeFrom > RANGE_END) {
    echo 'Already complete (last processed pincode >= ' . RANGE_END . "). Pass --restart to redo the whole range.\n";
    exit(0);
}

echo 'Seeding Tamil Nadu pincodes ' . $resumeFrom . '..' . RANGE_END . ($resumeFrom > RANGE_START ? ' (resumed)' : '') . "\n";

$service = new PincodeGeocodingService($pdo);

$processed = 0;
$valid = 0;
$skipped = 0;
$failed = 0;
$startedAt = microtime(true);

for ($pincode = $resumeFrom; $pincode <= RANGE_END; $pincode++) {
    $pincodeStr = str_pad((string) $pincode, 6, '0', STR_PAD_LEFT);

    $status = null;
    for ($attempt = 1; $attempt <= MAX_RETRIES; $attempt++) {
        try {
            $status = $service->cacheFromIndiaPostWithStatus($pincodeStr);
        } catch (\Throwable $e) {
            $status = 'failed';
        }

        if ($status !== 'failed') {
            break;
        }

        if ($attempt < MAX_RETRIES) {
            $backoffSeconds = 2 ** ($attempt - 1); // 1s, 2s, 4s
            sleep($backoffSeconds);
        }
    }

    $processed++;
    if ($status === 'valid') {
        $valid++;
    } elseif ($status === 'skipped') {
        $skipped++;
    } else {
        $failed++;
        error_log("seed_tn_pincodes: giving up on {$pincodeStr} after " . MAX_RETRIES . ' attempts');
    }

    file_put_contents($stateFile, json_encode(['last_pincode' => $pincode]));

    if ($processed % 200 === 0) {
        $elapsed = round(microtime(true) - $startedAt);
        echo "  ...{$processed} processed ({$pincodeStr}) — valid={$valid} skipped={$skipped} failed={$failed} — {$elapsed}s elapsed\n";
    }

    usleep(DELAY_MICROSECONDS);
}

$elapsed = round(microtime(true) - $startedAt);
echo "\nDone. processed={$processed} valid={$valid} skipped={$skipped} failed={$failed} in {$elapsed}s\n";
if ($failed > 0) {
    echo "Re-run this script (no args) to retry the pincodes that failed after retries — it resumes from the end of the range only, so a handful of individually-failed pincodes mid-range won't be retried by a plain re-run; rerun with those specific codes via PincodeGeocodingService if that matters, or just --restart for a full clean pass.\n";
}
