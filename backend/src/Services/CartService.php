<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Database Cart Service: holds {variant_id, quantity} for customer or guest session in MySQL.
 * Every read re-prices from authoritative MySQL product_variants/inventory.
 */
final class CartService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array{items: list<array<string, mixed>>, subtotal: string, item_count: int} */
    public function getCart(?int $customerId, ?string $sessionId): array
    {
        if ($customerId === null && ($sessionId === null || $sessionId === '')) {
            return ['items' => [], 'subtotal' => '0.00', 'item_count' => 0];
        }

        $cartId = $this->findCartId($customerId, $sessionId);
        if ($cartId === null) {
            return ['items' => [], 'subtotal' => '0.00', 'item_count' => 0];
        }

        $customerType = $customerId !== null ? $this->customerType($customerId) : 'RETAIL';

        $stmt = $this->pdo->prepare(
            'SELECT ci.id AS cart_item_id, ci.quantity, v.id AS variant_id, v.product_id, v.sku, v.mrp,
                    v.retail_price, v.wholesale_price, p.name AS product_name, p.is_active, p.is_ecommerce_enabled,
                    b.name AS brand_name,
                    (SELECT image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY is_primary DESC, sort_order ASC LIMIT 1) AS primary_image,
                    i.available
             FROM cart_items ci
             JOIN product_variants v ON v.id = ci.variant_id
             JOIN products p ON p.id = v.product_id
             LEFT JOIN brands b ON b.id = p.brand_id
             LEFT JOIN inventory i ON i.variant_id = v.id
             WHERE ci.cart_id = :cart_id
             ORDER BY ci.id DESC'
        );
        $stmt->execute(['cart_id' => $cartId]);
        $rows = $stmt->fetchAll();

        $subtotal = '0.00';
        $itemCount = 0;
        $items = [];

        foreach ($rows as $row) {
            $unitPrice = PricingService::resolveUnitPrice($row, $customerType);
            $available = (string) ($row['available'] ?? '0');
            $quantity = (int) $row['quantity'];
            $lineTotal = bcmul($unitPrice, (string) $quantity, 2);
            $subtotal = bcadd($subtotal, $lineTotal, 2);
            $itemCount += $quantity;

            $items[] = [
                'id' => $row['cart_item_id'],
                'cart_item_id' => $row['cart_item_id'],
                'variant_id' => $row['variant_id'],
                'product_id' => $row['product_id'],
                'name' => $row['product_name'],
                'product_name' => $row['product_name'],
                'sku' => $row['sku'],
                'brand' => $row['brand_name'] ?: 'Supermarket',
                'image' => $row['primary_image'],
                'quantity' => $quantity,
                'price' => $unitPrice,
                'unit_price' => $unitPrice,
                'mrp' => $row['mrp'],
                'originalPrice' => $row['mrp'],
                'line_total' => $lineTotal,
                'available' => $available,
                'purchasable' => (bool) $row['is_active'] && (bool) $row['is_ecommerce_enabled'],
            ];
        }

        return [
            'items' => $items,
            'subtotal' => $subtotal,
            'item_count' => $itemCount,
        ];
    }

    public function addItem(?int $customerId, ?string $sessionId, int $variantId, int $quantity, ?int $productId = null): void
    {
        if ($quantity <= 0) {
            throw new RuntimeException('Quantity must be at least 1');
        }

        // If variantId not provided but productId is, resolve default variant
        if ($variantId <= 0 && $productId !== null && $productId > 0) {
            $stmt = $this->pdo->prepare(
                'SELECT id FROM product_variants WHERE product_id = :product_id AND deleted_at IS NULL ORDER BY is_default DESC, id ASC LIMIT 1'
            );
            $stmt->execute(['product_id' => $productId]);
            $variantId = (int) $stmt->fetchColumn();
        }

        if ($variantId <= 0) {
            throw new RuntimeException('Invalid product or variant ID');
        }

        $cartId = $this->findOrCreateCartId($customerId, $sessionId);

        $this->pdo->prepare(
            'INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (:cart_id, :variant_id, :quantity)
             ON DUPLICATE KEY UPDATE quantity = quantity + :quantity2'
        )->execute(['cart_id' => $cartId, 'variant_id' => $variantId, 'quantity' => $quantity, 'quantity2' => $quantity]);
    }

    public function updateItemQuantity(?int $customerId, ?string $sessionId, int $cartItemId, int $quantity): void
    {
        $cartId = $this->findCartId($customerId, $sessionId);
        if ($cartId === null) {
            throw new RuntimeException('Cart not found');
        }

        if ($quantity <= 0) {
            $this->removeItem($customerId, $sessionId, $cartItemId);
            return;
        }

        $this->pdo->prepare('UPDATE cart_items SET quantity = :quantity WHERE id = :id AND cart_id = :cart_id')
            ->execute(['quantity' => $quantity, 'id' => $cartItemId, 'cart_id' => $cartId]);
    }

    public function removeItem(?int $customerId, ?string $sessionId, int $cartItemId): void
    {
        $cartId = $this->findCartId($customerId, $sessionId);
        if ($cartId === null) {
            return;
        }

        $this->pdo->prepare('DELETE FROM cart_items WHERE id = :id AND cart_id = :cart_id')
            ->execute(['id' => $cartItemId, 'cart_id' => $cartId]);
    }

    public function clear(?int $customerId, ?string $sessionId): void
    {
        $cartId = $this->findCartId($customerId, $sessionId);
        if ($cartId === null) {
            return;
        }

        $this->pdo->prepare('DELETE FROM cart_items WHERE cart_id = :cart_id')->execute(['cart_id' => $cartId]);
    }

    /** Merge guest session cart into logged-in customer cart */
    public function mergeSessionCart(string $sessionId, int $customerId): void
    {
        $sessionCartId = $this->findCartId(null, $sessionId);
        if ($sessionCartId === null) {
            return;
        }

        $customerCartId = $this->findOrCreateCartId($customerId, null);

        // Merge items
        $stmt = $this->pdo->prepare('SELECT variant_id, quantity FROM cart_items WHERE cart_id = :cart_id');
        $stmt->execute(['cart_id' => $sessionCartId]);
        $sessionItems = $stmt->fetchAll();

        foreach ($sessionItems as $item) {
            $this->pdo->prepare(
                'INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (:cart_id, :variant_id, :quantity)
                 ON DUPLICATE KEY UPDATE quantity = quantity + :quantity2'
            )->execute([
                'cart_id' => $customerCartId,
                'variant_id' => $item['variant_id'],
                'quantity' => $item['quantity'],
                'quantity2' => $item['quantity'],
            ]);
        }

        // Clean up session cart
        $this->pdo->prepare('DELETE FROM carts WHERE id = :id')->execute(['id' => $sessionCartId]);
    }

    private function findCartId(?int $customerId, ?string $sessionId): ?int
    {
        if ($customerId !== null) {
            $stmt = $this->pdo->prepare("SELECT id FROM carts WHERE customer_id = :customer_id AND status = 'ACTIVE'");
            $stmt->execute(['customer_id' => $customerId]);
            $id = $stmt->fetchColumn();
            return $id !== false ? (int) $id : null;
        }

        if ($sessionId !== null && $sessionId !== '') {
            $stmt = $this->pdo->prepare("SELECT id FROM carts WHERE session_id = :session_id AND status = 'ACTIVE'");
            $stmt->execute(['session_id' => $sessionId]);
            $id = $stmt->fetchColumn();
            return $id !== false ? (int) $id : null;
        }

        return null;
    }

    private function findOrCreateCartId(?int $customerId, ?string $sessionId): int
    {
        $existing = $this->findCartId($customerId, $sessionId);
        if ($existing !== null) {
            return $existing;
        }

        if ($customerId !== null) {
            $this->pdo->prepare(
                "INSERT INTO carts (customer_id, status) VALUES (:customer_id, 'ACTIVE')
                 ON DUPLICATE KEY UPDATE status = 'ACTIVE'"
            )->execute(['customer_id' => $customerId]);

            $stmt = $this->pdo->prepare("SELECT id FROM carts WHERE customer_id = :customer_id AND status = 'ACTIVE'");
            $stmt->execute(['customer_id' => $customerId]);
            return (int) $stmt->fetchColumn();
        }

        $session = $sessionId ?: bin2hex(random_bytes(16));
        $this->pdo->prepare(
            "INSERT INTO carts (session_id, status) VALUES (:session_id, 'ACTIVE')
             ON DUPLICATE KEY UPDATE status = 'ACTIVE'"
        )->execute(['session_id' => $session]);

        $stmt = $this->pdo->prepare("SELECT id FROM carts WHERE session_id = :session_id AND status = 'ACTIVE'");
        $stmt->execute(['session_id' => $session]);
        return (int) $stmt->fetchColumn();
    }

    private function customerType(int $customerId): string
    {
        $stmt = $this->pdo->prepare('SELECT customer_type FROM customers WHERE id = :id');
        $stmt->execute(['id' => $customerId]);

        return (string) ($stmt->fetchColumn() ?: 'RETAIL');
    }
}
