<?php
declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/../config/database.php';

use App\Services\PaymentService;

$purchaseId = (int) ($argv[1] ?? 0);
$amount = (string) ($argv[2] ?? '0.00');

$pdo = db();
$paymentService = new PaymentService($pdo);

try {
    $res = $paymentService->collectPayment($purchaseId, [
        'amount' => $amount,
        'payment_method' => 'CASH',
        'paid_amount' => $amount,
        'payment_date' => date('Y-m-d'),
        'notes' => 'Concurrent test collection',
        'lines' => [
            ['method' => 'CASH', 'amount' => $amount, 'reference_no' => null]
        ]
    ], 1);
    echo json_encode([
        'status' => 'SUCCESS',
        'paid_amount' => $res['purchase']['paid_amount'],
        'balance_amount' => $res['purchase']['balance_amount']
    ]);
} catch (\Throwable $e) {
    echo json_encode([
        'status' => 'ERROR',
        'message' => $e->getMessage()
    ]);
}
