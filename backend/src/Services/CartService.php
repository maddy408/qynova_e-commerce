<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Cart holds only {variant_id, quantity} — every read re-prices from
 * product_variants/inventory (docs/DOCUMENTATION.md section 13).
 */
final class CartService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array{items: list<array<string, mixed>>, subtotal: string} */
    public function getCart(int $customerId): array
    {
        $cartId = $this->findOrCreateCartId($customerId);
        $customerType = $this->customerType($customerId);

        $stmt = $this->pdo->prepare(
            'SELECT ci.id AS cart_item_id, ci.quantity, v.id AS variant_id, v.product_id, v.sku, v.mrp,
                    v.retail_price, v.wholesale_price, p.name AS product_name, p.is_active, p.is_ecommerce_enabled,
                    i.available
             FROM cart_items ci
             JOIN product_variants v ON v.id = ci.variant_id
             JOIN products p ON p.id = v.product_id
             LEFT JOIN inventory i ON i.variant_id = v.id
             WHERE ci.cart_id = :cart_id'
        );
        $stmt->execute(['cart_id' => $cartId]);
        $rows = $stmt->fetchAll();

        $subtotal = '0.00';
        $items = [];

        foreach ($rows as $row) {
            $unitPrice = PricingService::resolveUnitPrice($row, $customerType);
            $available = (string) ($row['available'] ?? '0');
            $cappedQty = min((int) $row['quantity'], max(0, (int) floor((float) $available)));
            $lineTotal = bcmul($unitPrice, (string) $cappedQty, 2);
            $subtotal = bcadd($subtotal, $lineTotal, 2);

            $items[] = [
                'cart_item_id' => $row['cart_item_id'],
                'variant_id' => $row['variant_id'],
                'product_id' => $row['product_id'],
                'product_name' => $row['product_name'],
                'sku' => $row['sku'],
                'quantity' => (int) $row['quantity'],
                'capped_quantity' => $cappedQty,
                'quantity_capped' => $cappedQty < (int) $row['quantity'],
                'mrp' => $row['mrp'],
                'unit_price' => $unitPrice,
                'line_total' => $lineTotal,
                'available' => $available,
                'purchasable' => (bool) $row['is_active'] && (bool) $row['is_ecommerce_enabled'] && $cappedQty > 0,
            ];
        }

        return ['items' => $items, 'subtotal' => $subtotal];
    }

    public function addItem(int $customerId, int $variantId, int $quantity): void
    {
        if ($quantity <= 0) {
            throw new RuntimeException('Quantity must be at least 1');
        }

        $cartId = $this->findOrCreateCartId($customerId);

        $this->pdo->prepare(
            'INSERT INTO cart_items (cart_id, variant_id, quantity) VALUES (:cart_id, :variant_id, :quantity)
             ON DUPLICATE KEY UPDATE quantity = quantity + :quantity2'
        )->execute(['cart_id' => $cartId, 'variant_id' => $variantId, 'quantity' => $quantity, 'quantity2' => $quantity]);
    }

    public function updateItemQuantity(int $customerId, int $cartItemId, int $quantity): void
    {
        if ($quantity <= 0) {
            throw new RuntimeException('Quantity must be at least 1');
        }

        $cartId = $this->findOrCreateCartId($customerId);

        $this->pdo->prepare('UPDATE cart_items SET quantity = :quantity WHERE id = :id AND cart_id = :cart_id')
            ->execute(['quantity' => $quantity, 'id' => $cartItemId, 'cart_id' => $cartId]);
    }

    public function removeItem(int $customerId, int $cartItemId): void
    {
        $cartId = $this->findOrCreateCartId($customerId);
        $this->pdo->prepare('DELETE FROM cart_items WHERE id = :id AND cart_id = :cart_id')
            ->execute(['id' => $cartItemId, 'cart_id' => $cartId]);
    }

    public function clear(int $customerId): void
    {
        $cartId = $this->findOrCreateCartId($customerId);
        $this->pdo->prepare('DELETE FROM cart_items WHERE cart_id = :cart_id')->execute(['cart_id' => $cartId]);
    }

    private function findOrCreateCartId(int $customerId): int
    {
        $this->pdo->prepare(
            "INSERT INTO carts (customer_id, status) VALUES (:customer_id, 'ACTIVE')
             ON DUPLICATE KEY UPDATE customer_id = customer_id"
        )->execute(['customer_id' => $customerId]);

        $stmt = $this->pdo->prepare('SELECT id FROM carts WHERE customer_id = :customer_id');
        $stmt->execute(['customer_id' => $customerId]);

        return (int) $stmt->fetchColumn();
    }

    private function customerType(int $customerId): string
    {
        $stmt = $this->pdo->prepare('SELECT customer_type FROM customers WHERE id = :id');
        $stmt->execute(['id' => $customerId]);

        return (string) ($stmt->fetchColumn() ?: 'RETAIL');
    }
}
