<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\CouponService;
use App\Services\InventoryService;
use App\Services\InvoicePaymentService;
use App\Services\InvoiceService;
use App\Services\RefundService;
use PDO;
use RuntimeException;

final class InvoiceController
{
    private readonly InvoiceService $invoices;
    private readonly InvoicePaymentService $payments;

    public function __construct(private readonly PDO $pdo)
    {
        $this->invoices = new InvoiceService($pdo, new InventoryService($pdo), new CouponService($pdo), new RefundService($pdo));
        $this->payments = new InvoicePaymentService($pdo, $this->invoices);
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $permissions = (array) ($claims['permissions'] ?? []);
        if (($claims['type'] ?? null) !== 'staff' || (!in_array('orders.manage', $permissions, true) && !in_array('pos.sell', $permissions, true))) {
            Response::error('Forbidden', 403);
        }

        Response::json(['invoices' => $this->invoices->list($_GET)]);
    }

    public function show(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        $permissions = (array) ($claims['permissions'] ?? []);
        if (($claims['type'] ?? null) !== 'staff' || (!in_array('orders.manage', $permissions, true) && !in_array('pos.sell', $permissions, true))) {
            Response::error('Forbidden', 403);
        }

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
                priceType: isset($body['price_type']) ? (string) $body['price_type'] : null,
                discountType: $body['discount_type'] ?? null,
                discountValue: $body['discount_value'] ?? 0,
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

    /**
     * Phase 5 — Invoice Amendment. Replaces the old update() endpoint,
     * which let amount_paid/status/customer_id be rewritten directly via
     * a raw SQL UPDATE: no cap on amount_paid against grand_total, no
     * payment_status recompute, status settable to CANCELLED bypassing
     * cancel()'s restock+refund logic entirely, no audit trail. From here
     * on: amount_paid only ever changes through collectPayment/
     * reversePayment below (both derive payment_status, both audit-log),
     * and status only ever changes through the existing cancel() endpoint.
     */
    public function collectPayment(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $body = Request::json();

        try {
            $result = $this->payments->collectPayment((int) $id, $body, (int) $claims['sub'], Request::clientIp());
            Response::json($result, 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function reversePayment(string $id, string $paymentId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $body = Request::json();
        $reason = trim((string) ($body['reason'] ?? ''));

        try {
            Response::json($this->payments->reversePayment((int) $id, (int) $paymentId, $reason, (int) $claims['sub'], Request::clientIp()));
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function listPayments(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        Response::json(['payments' => $this->payments->listPayments((int) $id)]);
    }

    /** Narrow correction for a mis-recorded payment method label — never touches money. */
    public function updatePaymentMethod(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'orders.manage');

        $body = Request::json();
        $method = strtoupper(trim((string) ($body['payment_method'] ?? '')));
        $allowed = \App\Services\InvoiceService::ALLOWED_POS_PAYMENT_METHODS;

        if (!in_array($method, $allowed, true)) {
            Response::error('Invalid payment method', 422);
        }

        $invoice = $this->invoices->find((int) $id);
        if ($invoice === null) {
            Response::error('Invoice not found', 404);
        }
        if ($invoice['status'] === 'CANCELLED') {
            Response::error('Cannot amend a cancelled invoice', 422);
        }

        $this->pdo->prepare('UPDATE invoices SET payment_method = :method WHERE id = :id')
            ->execute(['method' => $method, 'id' => (int) $id]);

        $this->pdo->prepare(
            "INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, old_value, new_value)
             VALUES ('USER', :actor, 'INVOICE_PAYMENT_METHOD_CORRECT', 'invoice', :id, :old_val, :new_val)"
        )->execute([
            'actor' => (int) $claims['sub'],
            'id' => (int) $id,
            'old_val' => json_encode(['payment_method' => $invoice['payment_method']]),
            'new_val' => json_encode(['payment_method' => $method]),
        ]);

        Response::json(['invoice' => $this->invoices->find((int) $id)]);
    }
}
