<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\CouponService;
use App\Services\InventoryService;
use App\Services\InvoiceService;
use App\Services\RefundService;
use PDO;
use RuntimeException;

final class InvoiceController
{
    private readonly InvoiceService $invoices;

    public function __construct(private readonly PDO $pdo)
    {
        $this->invoices = new InvoiceService($pdo, new InventoryService($pdo), new CouponService($pdo), new RefundService($pdo));
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        Response::json(['invoices' => $this->invoices->list($_GET)]);
    }

    public function show(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $invoice = $this->invoices->find((int) $id);

        if ($invoice === null) {
            Response::error('Invoice not found', 404);
        }

        Response::json(['invoice' => $invoice]);
    }

    /** POS billing: Create Invoice -> Create Invoice Items -> Record Payment -> Reduce Inventory. */
    public function storePosSale(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'pos.sell');

        $body = Request::json();

        try {
            $id = $this->invoices->createPosSale(
                items: (array) ($body['items'] ?? []),
                customerId: isset($body['customer_id']) ? (int) $body['customer_id'] : null,
                cashierUserId: (int) $claims['sub'],
                paymentMethod: (string) ($body['payment_method'] ?? 'CASH'),
                amountPaid: (string) ($body['amount_paid'] ?? '0'),
                couponCode: $body['coupon_code'] ?? null,
            );
            Response::json(['invoice' => $this->invoices->find($id)], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function cancel(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $body = Request::json();
        $reason = trim((string) ($body['reason'] ?? ''));

        if ($reason === '') {
            Response::error('A cancellation reason is required', 422);
        }

        try {
            Response::json(['invoice' => $this->invoices->cancel((int) $id, $reason, (int) $claims['sub'])]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function destroy(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        try {
            $this->invoices->softDelete((int) $id, (int) $claims['sub']);
            Response::json(['deleted' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
