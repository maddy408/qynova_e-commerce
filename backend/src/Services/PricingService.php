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
        if ($customerType === 'WHOLESALE' && $variant['wholesale_price'] !== null) {
            return (string) $variant['wholesale_price'];
        }

        return (string) $variant['retail_price'];
    }
}
