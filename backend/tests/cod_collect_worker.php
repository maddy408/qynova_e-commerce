<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';
putenv('APP_ENV=testing');
$_ENV['APP_ENV'] = 'testing';
require dirname(__DIR__) . '/config/database.php';

use App\Services\DeliveryService;

$deliveryId = (int) ($argv[1] ?? 0);
$amount = (float) ($argv[2] ?? 0.0);
$userId = (int) ($argv[3] ?? 1);
$notes = (string) ($argv[4] ?? 'Concurrent test collection');

$pdo = db();
$svc = new DeliveryService($pdo);

try {
    $res = $svc->collectCod($deliveryId, $amount, $userId, $notes);
    echo json_encode([
        'status' => 'SUCCESS',
        'delivery_id' => $res['id'],
        'cod_status' => $res['cod_status'],
        'cod_collected_amount' => $res['cod_collected_amount'],
    ]);
} catch (\Throwable $e) {
    echo json_encode([
        'status' => 'ERROR',
        'code' => $e->getCode(),
        'message' => $e->getMessage(),
    ]);
}
