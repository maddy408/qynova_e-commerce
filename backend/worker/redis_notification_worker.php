<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Helpers\Database;
use App\Services\DeviceTokenService;
use App\Services\FcmSenderService;
use App\Services\RedisQueueService;

echo "====================================================\n";
echo " Adams E-Commerce - Redis Push Notification Worker  \n";
echo "====================================================\n";

$redis = new RedisQueueService();
$stats = $redis->getStats();

echo "Redis Host: {$stats['host']}:{$stats['port']}\n";
echo "Redis Driver: {$stats['driver']}\n";
echo "Queue: {$stats['queue_name']}\n";
echo "Connected: " . ($stats['connected'] ? 'YES' : 'NO') . "\n";
echo "Initial Pending Jobs: {$stats['pending_jobs']}\n";
echo "----------------------------------------------------\n";

if (!$stats['connected']) {
    echo "Warning: Redis server is currently not reachable at {$stats['host']}:{$stats['port']}.\n";
    echo "Push notifications will use synchronous failover dispatch.\n";
    if (in_array('--once', $argv, true)) {
        exit(0);
    }
}

$pdo = Database::getConnection();
$deviceTokens = new DeviceTokenService($pdo);
$fcm = new FcmSenderService($deviceTokens);

$runOnce = in_array('--once', $argv, true);
$maxJobs = 50;
$processed = 0;

echo "Worker running... (Ctrl+C to stop)\n";

while (true) {
    // Pop job with 2s timeout
    $job = $redis->pop(timeoutSeconds: 2);

    if ($job !== null) {
        $processed++;
        $title = (string) ($job['title'] ?? '');
        $body = (string) ($job['body'] ?? '');
        $tokens = (array) ($job['tokens'] ?? []);
        $fcmData = (array) ($job['data'] ?? []);
        $campaignId = isset($job['campaign_id']) ? (int) $job['campaign_id'] : null;

        echo "[" . date('Y-m-d H:i:s') . "] Processing job #{$processed}: '{$title}' to " . count($tokens) . " device(s)...\n";

        if (!empty($tokens) && $fcm->isConfigured()) {
            $result = $fcm->sendBatch($tokens, $title, $body, $fcmData);
            echo "   Sent: {$result['sent']}/{$result['attempted']}\n";

            if ($campaignId !== null && $campaignId > 0) {
                try {
                    $failureCount = $result['attempted'] - $result['sent'];
                    $stmt = $pdo->prepare(
                        "UPDATE broadcast_campaigns 
                         SET status = 'COMPLETED', 
                             token_count = :tokens, 
                             success_count = :success, 
                             failure_count = :failure, 
                             completed_at = NOW() 
                         WHERE id = :id"
                    );
                    $stmt->execute([
                        'tokens' => count($tokens),
                        'success' => $result['sent'],
                        'failure' => $failureCount,
                        'id' => $campaignId,
                    ]);
                } catch (\Throwable $e) {
                    echo "   Failed to update campaign #{$campaignId}: {$e->getMessage()}\n";
                }
            }
        } else {
            echo "   FCM not configured or no tokens — skipped.\n";
            if ($campaignId !== null && $campaignId > 0) {
                try {
                    $pdo->prepare("UPDATE broadcast_campaigns SET status = 'COMPLETED', completed_at = NOW() WHERE id = :id")->execute(['id' => $campaignId]);
                } catch (\Throwable $e) {}
            }
        }
    }

    if ($runOnce) {
        break;
    }

    // Small sleep when queue is empty to avoid CPU thrashing
    if ($job === null) {
        usleep(500000); // 0.5s
    }
}

echo "Worker finished. Total processed: {$processed}\n";
