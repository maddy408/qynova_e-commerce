<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\InventoryService;
use App\Services\PurchaseService;
use PDO;
use RuntimeException;

final class PurchaseController
{
    private readonly PurchaseService $purchases;

    public function __construct(private readonly PDO $pdo)
    {
        $this->purchases = new PurchaseService($pdo, new InventoryService($pdo));
    }

    public function indexSuppliers(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'suppliers.manage');

        Response::json(['suppliers' => $this->purchases->listSuppliers()]);
    }

    public function storeSupplier(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'suppliers.manage');

        try {
            $id = $this->purchases->createSupplier(Request::json());
            Response::json(['id' => $id], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'purchases.manage');

        Response::json(['purchases' => $this->purchases->list($_GET)]);
    }

    public function show(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'purchases.manage');

        $purchase = $this->purchases->find((int) $id);

        if ($purchase === null) {
            Response::error('Purchase not found', 404);
        }

        Response::json(['purchase' => $purchase]);
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'purchases.manage');

        $body = Request::json();

        try {
            $id = $this->purchases->createPurchase(
                supplierId: (int) ($body['supplier_id'] ?? 0),
                items: (array) ($body['items'] ?? []),
                purchaseDate: (string) ($body['purchase_date'] ?? date('Y-m-d')),
                amountPaid: (string) ($body['amount_paid'] ?? '0'),
                createdByUserId: (int) $claims['sub'],
                paymentMethod: isset($body['payment_method']) ? (string) $body['payment_method'] : null,
                notes: isset($body['notes']) ? (string) $body['notes'] : null,
            );
            Response::json(['purchase' => $this->purchases->find($id)], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function cancel(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'purchases.manage');

        $body = Request::json();
        $reason = trim((string) ($body['reason'] ?? ''));

        if ($reason === '') {
            Response::error('A cancellation reason is required', 422);
        }

        try {
            Response::json(['purchase' => $this->purchases->cancelPurchase((int) $id, $reason, (int) $claims['sub'])]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function storeReturn(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'purchases.manage');

        $body = Request::json();
        $reason = trim((string) ($body['reason'] ?? ''));

        if ($reason === '') {
            Response::error('A reason is required', 422);
        }

        try {
            $returnId = $this->purchases->createReturn((int) $id, (array) ($body['items'] ?? []), $reason, (int) $claims['sub']);
            Response::json(['purchase' => $this->purchases->find((int) $id), 'return_id' => $returnId], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
