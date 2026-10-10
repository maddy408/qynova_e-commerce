<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\BatchService;
use PDO;
use RuntimeException;

final class BatchController
{
    private readonly BatchService $batchService;

    public function __construct(private readonly PDO $pdo)
    {
        $this->batchService = new BatchService($pdo);
    }

    public function getBatches(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.view');

        Response::json(['batches' => $this->batchService->getBatchReport()]);
    }

    public function getExpiryReport(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.view');

        $days = isset($_GET['days']) ? (int) $_GET['days'] : 30;
        Response::json(['expiring_batches' => $this->batchService->getExpiryReport($days)]);
    }

    public function getConsumptionRule(): void
    {
        Response::json(['rule' => $this->batchService->getConsumptionRule()]);
    }

    public function updateConsumptionRule(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.adjust');

        $body = Request::json();
        $rule = (string) ($body['rule'] ?? 'FIFO');

        try {
            $this->batchService->setConsumptionRule($rule);
            Response::json(['updated' => true, 'rule' => $this->batchService->getConsumptionRule()]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function getVariantBatches(string $variantId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.view');

        $batches = $this->batchService->getVariantBatches((int) $variantId);
        Response::json(['batches' => $batches]);
    }

    public function saveOpeningBatch(string $variantId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.adjust');

        $body = Request::json();

        try {
            $result = $this->batchService->saveOpeningBatchDetailed((int) $variantId, $body, (int) $claims['sub']);
            Response::json($result, 200);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function deleteBatch(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.adjust');

        try {
            $result = $this->batchService->deleteOrDeactivateBatch((int) $id, (int) $claims['sub']);
            Response::json($result, 200);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function resetOpeningStock(string $variantId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'inventory.adjust');

        try {
            $result = $this->batchService->resetVariantOpeningStock((int) $variantId, (int) $claims['sub']);
            Response::json($result, 200);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
