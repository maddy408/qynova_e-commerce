<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Config;
use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\DeliveryService;
use PDO;
use RuntimeException;

final class DeliveryController
{
    private readonly DeliveryService $deliveries;

    public function __construct(private readonly PDO $pdo)
    {
        $this->deliveries = new DeliveryService($pdo);
    }

    /** GET /api/deliveries/summary - Real-time metrics for delivery dashboard cards. */
    public function summary(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        Response::json([
            'summary' => $this->deliveries->summary(),
        ]);
    }

    /** GET /api/deliveries/eligible-orders - Orders eligible for delivery creation. */
    public function eligibleOrders(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $search = isset($_GET['search']) ? trim((string) $_GET['search']) : null;
        Response::json([
            'orders' => $this->deliveries->getEligibleOrders($search),
        ]);
    }

    /** GET /api/deliveries/drivers - Available staff/fleet drivers for assignment. */
    public function drivers(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        Response::json([
            'drivers' => $this->deliveries->getDrivers(),
        ]);
    }

    /** GET /api/deliveries - Paginated list of deliveries with filters, search, and tabs. */
    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $result = $this->deliveries->list($_GET);
        Response::json([
            'deliveries' => $result['items'],
            'total' => $result['total'],
            'page' => $result['page'],
            'limit' => $result['limit'],
            'tab_counts' => $result['tab_counts'],
        ]);
    }

    /** GET /api/deliveries/{id} - Full delivery details, items with thumbnails, and tracking history. */
    public function show(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $delivery = $this->deliveries->find((int) $id);

        if ($delivery === null) {
            Response::error('Delivery not found', 404);
        }

        Response::json(['delivery' => $delivery]);
    }

    /** Customer-facing order tracking. */
    public function showForOrder(string $orderId): void
    {
        $claims = JwtAuthMiddleware::authenticate();

        $orderStmt = $this->pdo->prepare('SELECT customer_id FROM orders WHERE id = :id');
        $orderStmt->execute(['id' => $orderId]);
        $customerId = $orderStmt->fetchColumn();

        if ($customerId === false) {
            Response::error('Order not found', 404);
        }

        if ($claims['type'] === 'customer' && (int) $customerId !== (int) $claims['sub']) {
            Response::error('Forbidden', 403);
        } elseif ($claims['type'] === 'staff') {
            PermissionMiddleware::require($claims, 'delivery.manage');
        }

        $delivery = $this->deliveries->findByOrder((int) $orderId);

        if ($delivery === null) {
            Response::error('No delivery created for this order yet', 404);
        }

        Response::json(['delivery' => $delivery]);
    }

    /** POST /api/orders/{orderId}/delivery - Create delivery for specific order. */
    public function store(string $orderId): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $body = Request::json();

        try {
            $id = $this->deliveries->createForOrder((int) $orderId, $body);
            Response::json(['delivery' => $this->deliveries->find($id)], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/deliveries - Direct delivery creation endpoint with order_id in body. */
    public function createDirect(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $body = Request::json();
        $orderId = isset($body['order_id']) ? (int) $body['order_id'] : 0;

        if ($orderId <= 0) {
            Response::error('order_id is required', 422);
        }

        try {
            $id = $this->deliveries->createForOrder($orderId, $body);
            Response::json(['delivery' => $this->deliveries->find($id)], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** PATCH/PUT /api/deliveries/{id}/status - Update delivery status through validated transitions. */
    public function updateStatus(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $body = Request::json();
        $status = strtoupper(trim((string) ($body['status'] ?? '')));

        if ($status === '') {
            Response::error('status is required', 422);
        }

        try {
            Response::json(['delivery' => $this->deliveries->updateStatus(
                deliveryId: (int) $id,
                newStatus: $status,
                source: 'ADMIN',
                note: $body['note'] ?? null,
                actorUserId: (int) $claims['sub'],
                failureReason: $body['failure_reason'] ?? null,
                location: $body['location'] ?? null,
            )]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** PUT /api/deliveries/{id}/assignment - Assign or reassign driver or courier partner. */
    public function updateAssignment(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $body = Request::json();

        try {
            Response::json(['delivery' => $this->deliveries->updateAssignment(
                deliveryId: (int) $id,
                data: $body,
                actorUserId: (int) $claims['sub'],
            )]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** POST /api/deliveries/{id}/cod-collect - Record Cash On Delivery collection. */
    public function collectCod(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'delivery.manage');

        $body = Request::json();
        $amount = isset($body['amount']) ? (float) $body['amount'] : 0.0;
        $notes = isset($body['notes']) ? trim((string) $body['notes']) : null;

        try {
            Response::json(['delivery' => $this->deliveries->collectCod(
                deliveryId: (int) $id,
                amount: $amount,
                actorUserId: (int) $claims['sub'],
                notes: $notes,
            )]);
        } catch (RuntimeException $e) {
            $status = ($e->getCode() === 409) ? 409 : 422;
            Response::error($e->getMessage(), $status);
        }
    }

    /** Secure shipping-provider inbound webhook. */
    public function webhook(): void
    {
        // 1. Authenticate webhook using server-configured secret
        $configuredSecret = (string) (Config::get('shipping.webhook_secret') ?: ($_ENV['SHIPPING_WEBHOOK_SECRET'] ?? ''));

        // Fail-closed: do not allow unauthenticated status updates if secret is missing on server
        if ($configuredSecret === '') {
            Response::error('Shipping webhook secret is not configured on server', 503);
            return;
        }

        // Support standard webhook authentication headers safely
        $providedSecret = $_SERVER['HTTP_X_WEBHOOK_SECRET']
            ?? $_SERVER['HTTP_X_SHIPPING_TOKEN']
            ?? $_SERVER['HTTP_X_API_KEY']
            ?? null;

        if ($providedSecret === null && !empty($_SERVER['HTTP_AUTHORIZATION'])) {
            $auth = trim((string) $_SERVER['HTTP_AUTHORIZATION']);
            if (str_starts_with($auth, 'Bearer ')) {
                $providedSecret = substr($auth, 7);
            }
        }

        if ($providedSecret === null || !hash_equals($configuredSecret, (string) $providedSecret)) {
            Response::error('Invalid or missing webhook signature/secret', 401);
            return;
        }

        // 2. Validate payload structure
        $body = Request::json();
        if (!is_array($body) || empty($body)) {
            Response::error('Malformed webhook payload: JSON body is required', 422);
            return;
        }

        $awb = trim((string) ($body['awb'] ?? $body['tracking_number'] ?? $body['waybill'] ?? ''));
        $rawStatus = trim((string) ($body['status'] ?? $body['current_status'] ?? ''));
        $eventId = trim((string) ($body['event_id'] ?? $body['webhook_id'] ?? ''));

        if ($awb === '' || $rawStatus === '') {
            Response::error('awb and status are required', 422);
            return;
        }

        $status = strtoupper($rawStatus);
        if (!array_key_exists($status, DeliveryService::DELIVERY_TO_ORDER_STATUS)) {
            Response::error("Invalid delivery status: {$rawStatus}", 422);
            return;
        }

        // 3. Process delivery status update with transition validation and deduplication
        try {
            $updated = $this->deliveries->updateByAwb(
                awb: $awb,
                newStatus: $status,
                note: $body['note'] ?? $body['message'] ?? null,
                eventId: $eventId ?: null,
                location: $body['location'] ?? null,
            );
            Response::json(['delivery' => $updated]);
        } catch (RuntimeException $e) {
            $code = ($e->getCode() >= 400 && $e->getCode() <= 499) ? $e->getCode() : 422;
            Response::error($e->getMessage(), $code);
        }
    }

    /**
     * Customer-facing pincode serviceability check. Delivery Management
     * (Part B) extends this additively — every field the original mock
     * response returned (serviceable/status/pincode/estimated_delivery/
     * cod_available/shipping_required/delivery_charge/message) is still
     * present with the same meaning, so ProductDetails.jsx's existing
     * "check delivery to my pincode" widget keeps working unchanged. The
     * new fields carry the real distance/type/ETA; `delivery_charge`
     * here stays a human-readable string, not a final ₹ figure — the
     * actual chargeable amount depends on the real cart's weight and is
     * only ever computed server-side from it (OrderService::preview()/
     * checkout()), never from anything this GET could be tricked into
     * trusting from the client.
     */
    public function checkPincode(): void
    {
        $pincode = trim((string) ($_GET['pincode'] ?? ''));
        $productId = isset($_GET['product_id']) ? (int) $_GET['product_id'] : null;

        if (!preg_match('/^[1-9][0-9]{5}$/', $pincode)) {
            Response::json([
                'serviceable' => false,
                'status' => 'INVALID',
                'message' => 'Please enter a valid 6-digit Indian PIN code.',
            ], 400);
            return;
        }

        $codAvailable = true;
        $shippingRequired = true;

        if ($productId !== null && $productId > 0) {
            $stmt = $this->pdo->prepare('SELECT cod_available, shipping_required FROM products WHERE id = :id AND deleted_at IS NULL');
            $stmt->execute(['id' => $productId]);
            $prod = $stmt->fetch();
            if ($prod !== false) {
                $codAvailable = (bool) $prod['cod_available'];
                $shippingRequired = (bool) $prod['shipping_required'];
            }
        }

        $customerId = $this->optionalCustomerId();

        try {
            $geocoder = new \App\Services\PincodeGeocodingService($this->pdo);
            $calc = new \App\Services\DeliveryCalculationService($this->pdo, $geocoder);
            $quote = $calc->quotePincode($pincode, $customerId);
        } catch (RuntimeException $e) {
            Response::json([
                'serviceable' => false,
                'status' => 'INVALID',
                'message' => $e->getMessage(),
            ], 400);
            return;
        }

        $days = $quote['within_radius']
            ? "{$quote['delivery_days']} day" . ($quote['delivery_days'] === 1 ? '' : 's') . ' (delivered by the shop)'
            : "{$quote['settings']['post_min_days']}-{$quote['settings']['post_max_days']} days (via {$quote['settings']['default_courier_name']})";

        $message = !$quote['is_tamil_nadu']
            ? "We deliver to {$pincode} via {$quote['settings']['default_courier_name']}, typically {$quote['settings']['post_min_days']}-{$quote['settings']['post_max_days']} days."
            : "Delivery available to {$pincode}. Estimated delivery within {$days}.";

        Response::json([
            // Original fields — unchanged meaning, existing callers unaffected.
            'serviceable' => true,
            'status' => 'AVAILABLE',
            'pincode' => $pincode,
            'estimated_delivery' => $days,
            'cod_available' => $codAvailable,
            'shipping_required' => $shippingRequired,
            'delivery_charge' => $quote['is_first_order']
                ? 'Free (your first order)'
                : ($quote['within_radius'] ? 'Free (within local delivery area)' : 'Based on order weight — shown at checkout'),
            'message' => $message,
            // Delivery Management additions.
            'is_tamil_nadu' => $quote['is_tamil_nadu'],
            'district' => $quote['district'],
            'area' => $quote['area'],
            'geocode_source' => $quote['geocode_source'],
            'distance_km' => $quote['distance_km'],
            'within_radius' => $quote['within_radius'],
            'delivery_type' => $quote['delivery_type'],
            'delivery_days' => $quote['delivery_days'],
            'is_first_order' => $quote['is_first_order'],
        ]);
    }

    /** Best-effort: a guest/invalid/missing token just means no first-order discount — never force a 401 on a public pincode check. */
    private function optionalCustomerId(): ?int
    {
        $token = Request::bearerToken();
        if ($token === null) {
            return null;
        }

        try {
            $claims = \App\Helpers\JwtHelper::verify($token);
        } catch (\Throwable) {
            return null;
        }

        return isset($claims['sub']) && ($claims['type'] ?? '') === 'customer' ? (int) $claims['sub'] : null;
    }
}
