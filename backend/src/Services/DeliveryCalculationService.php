<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Config;
use PDO;
use RuntimeException;

/**
 * Delivery Management business rules (distance/weight-based charge,
 * ETA, first-order-free). Pure calculation plus the settings/first-order
 * lookups it needs — no HTTP, no order mutation; OrderService and
 * DeliveryController call into this, not the other way around.
 */
final class DeliveryCalculationService
{
    public function __construct(
        private readonly PDO $pdo,
        private readonly PincodeGeocodingService $geocoder,
    ) {
    }

    /**
     * Distance/type/ETA only — no ₹ charge, since that depends on the
     * real cart's weight (see quoteForOrder()) and this is also used by
     * the public "check delivery to my pincode" endpoint where trusting
     * client-supplied weights would be a tamper risk.
     *
     * @return array{
     *   pincode: string, is_tamil_nadu: bool, district: ?string, area: ?string,
     *   geocode_source: ?string, distance_km: ?float, within_radius: bool,
     *   delivery_type: string, delivery_days: int, is_first_order: bool,
     *   settings: array<string, mixed>
     * }
     */
    public function quotePincode(string $pincode, ?int $customerId): array
    {
        $geo = $this->geocoder->resolve($pincode);
        if ($geo === null) {
            throw new RuntimeException('Please enter a valid 6-digit PIN code.');
        }

        $settings = $this->getSettings();
        $isFirstOrder = $customerId !== null && $customerId > 0 && $this->isFirstOrder($customerId);

        if (!$geo['is_tamil_nadu']) {
            // Not an error (section 8 of the spec: "treated as beyond
            // radius, post office delivery" rather than failing).
            return [
                'pincode' => $pincode,
                'is_tamil_nadu' => false,
                'district' => null,
                'area' => null,
                'geocode_source' => null,
                'distance_km' => null,
                'within_radius' => false,
                'delivery_type' => 'INDIA_POST',
                'delivery_days' => (int) $settings['post_max_days'],
                'is_first_order' => $isFirstOrder,
                'settings' => $settings,
            ];
        }

        $shopLat = Config::get('shop.lat');
        $shopLng = Config::get('shop.lng');

        $distanceKm = null;
        if ($shopLat !== null && $shopLng !== null && $geo['lat'] !== null && $geo['lng'] !== null) {
            $distanceKm = round(self::haversineKm((float) $shopLat, (float) $shopLng, $geo['lat'], $geo['lng']), 2);
        }

        $withinRadius = $distanceKm !== null && $distanceKm <= (float) $settings['radius_km'];
        $deliveryType = $withinRadius ? 'OWN_DELIVERY' : 'INDIA_POST';
        $deliveryDays = $withinRadius ? (int) $settings['own_delivery_days'] : (int) $settings['post_max_days'];

        return [
            'pincode' => $pincode,
            'is_tamil_nadu' => true,
            'district' => $geo['district'],
            'area' => $geo['area'],
            'geocode_source' => $geo['geocode_source'],
            'distance_km' => $distanceKm,
            'within_radius' => $withinRadius,
            'delivery_type' => $deliveryType,
            'delivery_days' => $deliveryDays,
            'is_first_order' => $isFirstOrder,
            'settings' => $settings,
        ];
    }

    /**
     * Full quote INCLUDING the ₹ charge, from real cart items resolved
     * server-side by the caller (never from client input — see
     * OrderService). delivery_type/delivery_days/distance always reflect
     * the real distance regardless of first-order status; only the
     * charge is zeroed out for a first order or a within-radius address.
     *
     * @param list<array{weight_kg: float, qty: int}> $items
     * @return array<string, mixed> quotePincode()'s fields plus
     *   delivery_charge and breakdown
     */
    public function quoteForOrder(string $pincode, ?int $customerId, array $items): array
    {
        $quote = $this->quotePincode($pincode, $customerId);
        $settings = $quote['settings'];

        if ($quote['is_first_order']) {
            $charge = 0.0;
            $breakdown = [
                'reason' => 'first_order_free',
                'total_weight_kg' => null,
                'price_per_kg' => (float) $settings['price_per_kg'],
            ];
        } elseif ($quote['within_radius']) {
            $charge = 0.0;
            $breakdown = [
                'reason' => 'within_radius_free',
                'total_weight_kg' => null,
                'price_per_kg' => (float) $settings['price_per_kg'],
            ];
        } else {
            $totalWeightKg = 0.0;
            $hasAnyWeight = false;
            foreach ($items as $item) {
                $weightKg = (float) ($item['weight_kg'] ?? 0);
                $qty = (int) ($item['qty'] ?? 0);
                if ($weightKg > 0) {
                    $hasAnyWeight = true;
                }
                $totalWeightKg += $weightKg * $qty;
            }

            if (!$hasAnyWeight || $totalWeightKg <= 0) {
                $charge = (float) $settings['flat_fallback_charge'];
                $breakdown = [
                    'reason' => 'flat_fallback_no_weight_data',
                    'total_weight_kg' => 0.0,
                    'price_per_kg' => (float) $settings['price_per_kg'],
                    'flat_fallback_charge' => $charge,
                ];
            } else {
                $pricePerKg = (float) $settings['price_per_kg'];
                $charge = round($totalWeightKg * $pricePerKg, 2);
                $breakdown = [
                    'reason' => 'weight_based',
                    'total_weight_kg' => round($totalWeightKg, 3),
                    'price_per_kg' => $pricePerKg,
                ];
            }
        }

        return array_merge($quote, [
            'delivery_charge' => $charge,
            'breakdown' => $breakdown,
        ]);
    }

    /** "First order" = no prior non-cancelled order — same idiom as OrderService::findApplicableReferralReward() / CouponService. */
    private function isFirstOrder(int $customerId): bool
    {
        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM orders WHERE customer_id = :id AND status != 'CANCELLED'");
        $stmt->execute(['id' => $customerId]);

        return ((int) $stmt->fetchColumn()) === 0;
    }

    /**
     * Public so the admin Delivery Management settings page can read the
     * same row this service's own calculations use — one source of truth.
     *
     * @return array<string, mixed>
     */
    public function getSettings(): array
    {
        $row = $this->pdo->query('SELECT * FROM delivery_management_settings ORDER BY id ASC LIMIT 1')->fetch();

        return $row !== false ? $row : [
            'radius_km' => 10.0,
            'price_per_kg' => 20.0,
            'flat_fallback_charge' => 100.0,
            'own_delivery_days' => 1,
            'post_min_days' => 2,
            'post_max_days' => 3,
            'default_courier_name' => 'India Post',
        ];
    }

    /**
     * @param array<string, mixed> $data
     * @throws RuntimeException on invalid input (negative/zero where it
     *   shouldn't be, min > max days) — surfaced as a 422 by the controller.
     */
    public function updateSettings(array $data): void
    {
        $radiusKm = (float) ($data['radius_km'] ?? 10);
        $pricePerKg = (float) ($data['price_per_kg'] ?? 20);
        $flatFallback = (float) ($data['flat_fallback_charge'] ?? 100);
        $ownDeliveryDays = (int) ($data['own_delivery_days'] ?? 1);
        $postMinDays = (int) ($data['post_min_days'] ?? 2);
        $postMaxDays = (int) ($data['post_max_days'] ?? 3);
        $courierName = trim((string) ($data['default_courier_name'] ?? 'India Post'));

        if ($radiusKm <= 0) {
            throw new RuntimeException('Delivery radius (km) must be greater than 0');
        }
        if ($pricePerKg < 0 || $flatFallback < 0) {
            throw new RuntimeException('Price per kg and flat fallback charge must not be negative');
        }
        if ($ownDeliveryDays <= 0 || $postMinDays <= 0 || $postMaxDays <= 0) {
            throw new RuntimeException('Delivery day estimates must be at least 1');
        }
        if ($postMinDays > $postMaxDays) {
            throw new RuntimeException('Post office minimum days cannot be greater than maximum days');
        }
        if ($courierName === '') {
            throw new RuntimeException('Default courier name is required');
        }

        $this->pdo->prepare(
            'UPDATE delivery_management_settings SET
                radius_km = :radius_km,
                price_per_kg = :price_per_kg,
                flat_fallback_charge = :flat_fallback_charge,
                own_delivery_days = :own_delivery_days,
                post_min_days = :post_min_days,
                post_max_days = :post_max_days,
                default_courier_name = :default_courier_name
             WHERE id = 1'
        )->execute([
            'radius_km' => $radiusKm,
            'price_per_kg' => $pricePerKg,
            'flat_fallback_charge' => $flatFallback,
            'own_delivery_days' => $ownDeliveryDays,
            'post_min_days' => $postMinDays,
            'post_max_days' => $postMaxDays,
            'default_courier_name' => $courierName,
        ]);
    }

    public static function haversineKm(float $lat1, float $lng1, float $lat2, float $lng2): float
    {
        $earthRadiusKm = 6371.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLng = deg2rad($lng2 - $lng1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $earthRadiusKm * $c;
    }
}
