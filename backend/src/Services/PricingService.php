<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Single place that decides which price a customer pays
 * (docs/DOCUMENTATION.md section 8 — "Price selection must happen in PHP
 * backend. React must not be allowed to modify the final price.").
 */
final class PricingService
{
    /** @param array<string, mixed> $variant */
    public static function resolveUnitPrice(array $variant, string $customerType): string
    {
        $normalPrice = (isset($variant['normal_price']) && $variant['normal_price'] !== null && (float)$variant['normal_price'] > 0)
            ? (string) $variant['normal_price']
            : (string) ($variant['retail_price'] ?? $variant['mrp'] ?? '0.00');

        if ($customerType === 'WHOLESALE') {
            if (isset($variant['wholesale_price']) && $variant['wholesale_price'] !== null && (float)$variant['wholesale_price'] > 0) {
                return (string) $variant['wholesale_price'];
            }
            return $normalPrice;
        }

        if ($customerType === 'RETAIL') {
            if (isset($variant['retail_price']) && $variant['retail_price'] !== null && (float)$variant['retail_price'] > 0) {
                return (string) $variant['retail_price'];
            }
            return $normalPrice;
        }

        if ($customerType === 'CUSTOMER_WISE' && isset($variant['customer_price']) && $variant['customer_price'] !== null && (float)$variant['customer_price'] > 0) {
            return (string) $variant['customer_price'];
        }

        return $normalPrice;
    }
}
