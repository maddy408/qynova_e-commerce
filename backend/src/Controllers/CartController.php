<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\JwtHelper;
use App\Helpers\Request;
use App\Helpers\Response;
use App\Services\CartService;
use PDO;
use RuntimeException;

final class CartController
{
    private readonly CartService $cartService;

    public function __construct(private readonly PDO $pdo)
    {
        $this->cartService = new CartService($this->pdo);
    }

    private function resolveIdentity(): array
    {
        $customerId = null;
        $token = Request::bearerToken();
        if ($token !== null) {
            try {
                $claims = JwtHelper::verify($token);
                if (($claims['type'] ?? '') === 'customer') {
                    $customerId = (int) $claims['sub'];
                }
            } catch (\Throwable) {
                // Ignore invalid or expired token
            }
        }

        $sessionId = null;
        if ($customerId === null) {
            $sessionId = $_SERVER['HTTP_X_SESSION_ID'] ?? ($_GET['session_id'] ?? null);
            if ($sessionId !== null) {
                $sessionId = substr(trim((string) $sessionId), 0, 64);
            }
        }

        return [$customerId, $sessionId];
    }

    /** GET /api/cart - Load customer or session cart */
    public function show(): void
    {
        [$customerId, $sessionId] = $this->resolveIdentity();
        Response::json($this->cartService->getCart($customerId, $sessionId));
    }

    /** POST /api/cart/items - Add item to database cart */
    public function store(): void
    {
        [$customerId, $sessionId] = $this->resolveIdentity();
        if ($customerId === null && ($sessionId === null || $sessionId === '')) {
            $sessionId = bin2hex(random_bytes(16));
        }

        $body = Request::json();
        $variantId = (int) ($body['variant_id'] ?? 0);
        $productId = isset($body['product_id']) ? (int) $body['product_id'] : null;
        $quantity = (int) ($body['quantity'] ?? 1);

        try {
            $this->cartService->addItem($customerId, $sessionId, $variantId, $quantity, $productId);
            $cart = $this->cartService->getCart($customerId, $sessionId);
            Response::json(['cart' => $cart, 'session_id' => $sessionId], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** PUT|PATCH /api/cart/items/{id} - Update item quantity in database cart */
    public function update(string $cartItemId): void
    {
        [$customerId, $sessionId] = $this->resolveIdentity();
        $body = Request::json();
        $quantity = (int) ($body['quantity'] ?? 1);

        try {
            $this->cartService->updateItemQuantity($customerId, $sessionId, (int) $cartItemId, $quantity);
            Response::json($this->cartService->getCart($customerId, $sessionId));
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    /** DELETE /api/cart/items/{id} - Remove item from database cart */
    public function destroy(string $cartItemId): void
    {
        [$customerId, $sessionId] = $this->resolveIdentity();
        $this->cartService->removeItem($customerId, $sessionId, (int) $cartItemId);
        Response::json($this->cartService->getCart($customerId, $sessionId));
    }

    /** DELETE /api/cart - Clear entire database cart */
    public function clear(): void
    {
        [$customerId, $sessionId] = $this->resolveIdentity();
        $this->cartService->clear($customerId, $sessionId);
        Response::json(['items' => [], 'subtotal' => '0.00', 'item_count' => 0]);
    }

    /** POST /api/cart/merge - Merge session cart into customer cart upon login */
    public function merge(): void
    {
        [$customerId, $sessionId] = $this->resolveIdentity();
        $body = Request::json();
        $incomingSession = $body['session_id'] ?? $sessionId;

        if ($customerId !== null && !empty($incomingSession)) {
            $this->cartService->mergeSessionCart((string) $incomingSession, $customerId);
        }

        Response::json($this->cartService->getCart($customerId, null));
    }
}
