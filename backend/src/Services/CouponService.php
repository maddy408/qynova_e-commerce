<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Coupon CRUD, visibility and validation (ECOMMERCE_POS_ADMIN_SPEC.md
 * sections 14-17). validate() is the single source of truth for whether
 * a coupon can be applied and for how much — called both for a cart
 * preview and again, for real, at checkout. The frontend-computed
 * discount is never trusted (docs/DOCUMENTATION.md section 9: "During
 * checkout, backend validates everything again").
 */
final class CouponService
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @param array<string, mixed> $filters */
    public function list(array $filters): array
    {
        $where = [];
        $params = [];

        if (!empty($filters['status'])) {
            $where[] = 'status = :status';
            $params['status'] = $filters['status'];
        }

        if (!empty($filters['active_now'])) {
            $where[] = "status = 'ACTIVE' AND (start_at IS NULL OR start_at <= NOW()) AND (end_at IS NULL OR end_at >= NOW())";
        }

        $whereSql = $where === [] ? '1=1' : implode(' AND ', $where);

        $stmt = $this->pdo->prepare("SELECT * FROM coupons WHERE {$whereSql} ORDER BY created_at DESC");
        $stmt->execute($params);

        return $stmt->fetchAll();
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM coupons WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $coupon = $stmt->fetch();

        if ($coupon === false) {
            return null;
        }

        $coupon['product_ids'] = $this->pdo->prepare('SELECT product_id FROM coupon_products WHERE coupon_id = :id');
        $coupon['product_ids']->execute(['id' => $id]);
        $coupon['product_ids'] = $coupon['product_ids']->fetchAll(PDO::FETCH_COLUMN);

        $categoryStmt = $this->pdo->prepare('SELECT category_id FROM coupon_categories WHERE coupon_id = :id');
        $categoryStmt->execute(['id' => $id]);
        $coupon['category_ids'] = $categoryStmt->fetchAll(PDO::FETCH_COLUMN);

        $brandStmt = $this->pdo->prepare('SELECT brand_id FROM coupon_brands WHERE coupon_id = :id');
        $brandStmt->execute(['id' => $id]);
        $coupon['brand_ids'] = $brandStmt->fetchAll(PDO::FETCH_COLUMN);

        $customerStmt = $this->pdo->prepare(
            'SELECT cc.customer_id, c.name FROM coupon_customers cc JOIN customers c ON c.id = cc.customer_id WHERE cc.coupon_id = :id'
        );
        $customerStmt->execute(['id' => $id]);
        $coupon['customers'] = $customerStmt->fetchAll();

        $usage = $this->pdo->prepare(
            'SELECT COUNT(*) AS total_usage, COALESCE(SUM(discount_amount), 0) AS total_discount_given
             FROM coupon_usages WHERE coupon_id = :id'
        );
        $usage->execute(['id' => $id]);
        $coupon['usage'] = $usage->fetch();

        $orders = $this->pdo->prepare(
            'SELECT DISTINCT cu.customer_id, c.name AS customer_name, cu.order_id, cu.discount_amount, cu.used_at
             FROM coupon_usages cu JOIN customers c ON c.id = cu.customer_id
             WHERE cu.coupon_id = :id ORDER BY cu.used_at DESC'
        );
        $orders->execute(['id' => $id]);
        $coupon['usages'] = $orders->fetchAll();

        return $coupon;
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        $code = trim((string) ($data['code'] ?? ''));
        $name = trim((string) ($data['name'] ?? ''));

        if ($code === '' || $name === '') {
            throw new RuntimeException('code and name are required');
        }

        if (!in_array($data['discount_type'] ?? null, ['PERCENTAGE', 'FIXED'], true)) {
            throw new RuntimeException('discount_type must be PERCENTAGE or FIXED');
        }

        $this->pdo->beginTransaction();

        try {
            $this->pdo->prepare(
                'INSERT INTO coupons (
                    code, name, description, discount_type, discount_value, max_discount_amount,
                    min_order_amount, start_at, end_at, usage_limit, per_customer_usage_limit,
                    first_order_only, can_combine_with_product_offer, can_combine_with_referral, status
                ) VALUES (
                    :code, :name, :description, :discount_type, :discount_value, :max_discount_amount,
                    :min_order_amount, :start_at, :end_at, :usage_limit, :per_customer_usage_limit,
                    :first_order_only, :can_combine_with_product_offer, :can_combine_with_referral, :status
                )'
            )->execute([
                'code' => strtoupper($code),
                'name' => $name,
                'description' => $data['description'] ?? null,
                'discount_type' => $data['discount_type'],
                'discount_value' => $data['discount_value'] ?? 0,
                'max_discount_amount' => $data['max_discount_amount'] ?? null,
                'min_order_amount' => $data['min_order_amount'] ?? null,
                'start_at' => $data['start_at'] ?? null,
                'end_at' => $data['end_at'] ?? null,
                'usage_limit' => $data['usage_limit'] ?? null,
                'per_customer_usage_limit' => $data['per_customer_usage_limit'] ?? null,
                'first_order_only' => (int) (bool) ($data['first_order_only'] ?? false),
                'can_combine_with_product_offer' => (int) (bool) ($data['can_combine_with_product_offer'] ?? true),
                'can_combine_with_referral' => (int) (bool) ($data['can_combine_with_referral'] ?? false),
                'status' => $data['status'] ?? 'ACTIVE',
            ]);

            $couponId = (int) $this->pdo->lastInsertId();

            $this->syncScope($couponId, 'coupon_products', 'product_id', (array) ($data['product_ids'] ?? []));
            $this->syncScope($couponId, 'coupon_categories', 'category_id', (array) ($data['category_ids'] ?? []));
            $this->syncScope($couponId, 'coupon_brands', 'brand_id', (array) ($data['brand_ids'] ?? []));
            $this->syncScope($couponId, 'coupon_customers', 'customer_id', (array) ($data['customer_ids'] ?? []));

            $this->pdo->commit();

            return $couponId;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }

    /** @param array<string, mixed> $data */
    public function update(int $id, array $data): void
    {
        $fields = [
            'name', 'description', 'discount_type', 'discount_value', 'max_discount_amount',
            'min_order_amount', 'start_at', 'end_at', 'usage_limit', 'per_customer_usage_limit',
            'first_order_only', 'can_combine_with_product_offer', 'can_combine_with_referral', 'status',
        ];
        $boolFields = ['first_order_only', 'can_combine_with_product_offer', 'can_combine_with_referral'];

        $sets = [];
        $params = ['id' => $id];

        foreach ($fields as $field) {
            if (array_key_exists($field, $data)) {
                $sets[] = "{$field} = :{$field}";
                $params[$field] = in_array($field, $boolFields, true) ? (int) (bool) $data[$field] : $data[$field];
            }
        }

        if ($sets !== []) {
            $this->pdo->prepare('UPDATE coupons SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
        }

        if (array_key_exists('product_ids', $data)) {
            $this->syncScope($id, 'coupon_products', 'product_id', (array) $data['product_ids']);
        }
        if (array_key_exists('category_ids', $data)) {
            $this->syncScope($id, 'coupon_categories', 'category_id', (array) $data['category_ids']);
        }
        if (array_key_exists('brand_ids', $data)) {
            $this->syncScope($id, 'coupon_brands', 'brand_id', (array) $data['brand_ids']);
        }
        if (array_key_exists('customer_ids', $data)) {
            $this->syncScope($id, 'coupon_customers', 'customer_id', (array) $data['customer_ids']);
        }
    }

    /**
     * Coupons visible to this customer: public (no coupon_customers rows)
     * plus any where they're explicitly listed (section 15 "For You").
     *
     * @return list<array<string, mixed>>
     */
    public function availableForCustomer(int $customerId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT c.* FROM coupons c
             WHERE c.status = 'ACTIVE'
               AND (c.start_at IS NULL OR c.start_at <= NOW())
               AND (c.end_at IS NULL OR c.end_at >= NOW())
               AND (
                    NOT EXISTS (SELECT 1 FROM coupon_customers cc WHERE cc.coupon_id = c.id)
                    OR EXISTS (SELECT 1 FROM coupon_customers cc WHERE cc.coupon_id = c.id AND cc.customer_id = :customer_id)
               )
             ORDER BY c.created_at DESC"
        );
        $stmt->execute(['customer_id' => $customerId]);

        return $stmt->fetchAll();
    }

    /**
     * Validates a coupon for this customer against these cart lines and
     * returns the computed discount. Throws with a user-facing message on
     * any failure — never returns a discount for an invalid coupon.
     *
     * @param list<array{variant_id: int, product_id: int, category_ids: list<int>, brand_id: ?int, quantity: int, line_subtotal: string}> $items
     * @return array{coupon_id: int, discount_amount: string, eligible_subtotal: string}
     */
    public function validate(string $code, int $customerId, array $items): array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM coupons WHERE code = :code');
        $stmt->execute(['code' => strtoupper(trim($code))]);
        $coupon = $stmt->fetch();

        if ($coupon === false) {
            throw new RuntimeException('Invalid coupon code');
        }

        if ($coupon['status'] !== 'ACTIVE') {
            throw new RuntimeException('This coupon is no longer active');
        }

        if ($coupon['start_at'] !== null && strtotime($coupon['start_at']) > time()) {
            throw new RuntimeException('This coupon is not active yet');
        }

        if ($coupon['end_at'] !== null && strtotime($coupon['end_at']) < time()) {
            throw new RuntimeException('This coupon has expired');
        }

        if (!$this->isCustomerEligible((int) $coupon['id'], $customerId)) {
            throw new RuntimeException('This coupon is not available for your account');
        }

        if ($coupon['first_order_only'] && $this->customerOrderCount($customerId) > 0) {
            throw new RuntimeException('This coupon is valid for first orders only');
        }

        if ($coupon['usage_limit'] !== null && $this->totalUsageCount((int) $coupon['id']) >= (int) $coupon['usage_limit']) {
            throw new RuntimeException('This coupon has reached its usage limit');
        }

        if ($coupon['per_customer_usage_limit'] !== null
            && $this->customerUsageCount((int) $coupon['id'], $customerId) >= (int) $coupon['per_customer_usage_limit']) {
            throw new RuntimeException('You have already used this coupon the maximum number of times');
        }

        $eligibleItems = $this->filterEligibleItems((int) $coupon['id'], $items);

        if ($eligibleItems === []) {
            throw new RuntimeException('No items in your cart are eligible for this coupon');
        }

        $eligibleSubtotal = array_reduce($eligibleItems, fn (string $carry, array $item) => bcadd($carry, $item['line_subtotal'], 2), '0.00');

        if ($coupon['min_order_amount'] !== null && bccomp($eligibleSubtotal, (string) $coupon['min_order_amount'], 2) < 0) {
            throw new RuntimeException("Minimum purchase of ₹{$coupon['min_order_amount']} required for this coupon");
        }

        $discount = $coupon['discount_type'] === 'PERCENTAGE'
            ? bcdiv(bcmul($eligibleSubtotal, (string) $coupon['discount_value'], 4), '100', 2)
            : (string) $coupon['discount_value'];

        if (bccomp($discount, $eligibleSubtotal, 2) > 0) {
            $discount = $eligibleSubtotal;
        }

        if ($coupon['max_discount_amount'] !== null && bccomp($discount, (string) $coupon['max_discount_amount'], 2) > 0) {
            $discount = (string) $coupon['max_discount_amount'];
        }

        return [
            'coupon_id' => (int) $coupon['id'],
            'coupon' => $coupon,
            'discount_amount' => $discount,
            'eligible_subtotal' => $eligibleSubtotal,
        ];
    }

    public function recordUsage(int $couponId, int $customerId, ?int $orderId, string $discountAmount): void
    {
        $this->pdo->prepare(
            'INSERT INTO coupon_usages (coupon_id, customer_id, order_id, discount_amount) VALUES (:coupon_id, :customer_id, :order_id, :amount)'
        )->execute([
            'coupon_id' => $couponId,
            'customer_id' => $customerId,
            'order_id' => $orderId,
            'amount' => $discountAmount,
        ]);
    }

    /** @param list<int> $ids */
    private function syncScope(int $couponId, string $table, string $column, array $ids): void
    {
        $this->pdo->prepare("DELETE FROM {$table} WHERE coupon_id = :id")->execute(['id' => $couponId]);

        foreach ($ids as $id) {
            $this->pdo->prepare("INSERT INTO {$table} (coupon_id, {$column}) VALUES (:coupon_id, :value)")
                ->execute(['coupon_id' => $couponId, 'value' => (int) $id]);
        }
    }

    private function isCustomerEligible(int $couponId, int $customerId): bool
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM coupon_customers WHERE coupon_id = :id');
        $stmt->execute(['id' => $couponId]);

        if ((int) $stmt->fetchColumn() === 0) {
            return true;
        }

        $stmt = $this->pdo->prepare('SELECT 1 FROM coupon_customers WHERE coupon_id = :id AND customer_id = :customer_id');
        $stmt->execute(['id' => $couponId, 'customer_id' => $customerId]);

        return $stmt->fetchColumn() !== false;
    }

    private function customerOrderCount(int $customerId): int
    {
        $stmt = $this->pdo->prepare("SELECT COUNT(*) FROM orders WHERE customer_id = :id AND status != 'CANCELLED'");
        $stmt->execute(['id' => $customerId]);

        return (int) $stmt->fetchColumn();
    }

    private function totalUsageCount(int $couponId): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM coupon_usages WHERE coupon_id = :id');
        $stmt->execute(['id' => $couponId]);

        return (int) $stmt->fetchColumn();
    }

    private function customerUsageCount(int $couponId, int $customerId): int
    {
        $stmt = $this->pdo->prepare('SELECT COUNT(*) FROM coupon_usages WHERE coupon_id = :id AND customer_id = :customer_id');
        $stmt->execute(['id' => $couponId, 'customer_id' => $customerId]);

        return (int) $stmt->fetchColumn();
    }

    /**
     * @param list<array<string, mixed>> $items
     * @return list<array<string, mixed>>
     */
    private function filterEligibleItems(int $couponId, array $items): array
    {
        $productIds = $this->scopeIds('coupon_products', 'product_id', $couponId);
        $categoryIds = $this->scopeIds('coupon_categories', 'category_id', $couponId);
        $brandIds = $this->scopeIds('coupon_brands', 'brand_id', $couponId);

        if ($productIds === [] && $categoryIds === [] && $brandIds === []) {
            return $items;
        }

        return array_values(array_filter($items, function (array $item) use ($productIds, $categoryIds, $brandIds): bool {
            if (in_array($item['product_id'], $productIds, true)) {
                return true;
            }

            if ($item['brand_id'] !== null && in_array($item['brand_id'], $brandIds, true)) {
                return true;
            }

            return array_intersect($item['category_ids'], $categoryIds) !== [];
        }));
    }

    /** @return list<int> */
    private function scopeIds(string $table, string $column, int $couponId): array
    {
        $stmt = $this->pdo->prepare("SELECT {$column} FROM {$table} WHERE coupon_id = :id");
        $stmt->execute(['id' => $couponId]);

        return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    }
}
