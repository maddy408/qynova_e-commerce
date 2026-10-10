# Database SQL to Run: Initial Inventory Stock Seed (DB-01 / DEF-06)

## Overview & Context

During the system audit, finding **DB-01 / DEF-06** verified that while `database/seed/0002_products_seed.sql` seeded 18 catalog products and default variants into `product_variants`, it created **zero** corresponding rows in the `inventory` table.

Because `OrderService::checkout` validates available inventory (`bccomp($quantity, $available, 3) > 0`), attempting to checkout any seeded product aborts with:
```
RuntimeException: Only 0 of [Product Name] left in stock
```

Additionally, `CartService::getCart` previously masked this defect by falling back to `'100'` stock, creating a mismatch between cart display and order placement.

---

## Schema Notes
In `database/migrations/0007_inventory.sql`:
- Table: `inventory`
- `available` is a generated stored column (`on_hand - reserved`). **Do not attempt to insert directly into `available`**.
- Columns to populate: `variant_id`, `product_id`, `on_hand`, `reserved`, `low_stock_threshold`.
- Default opening stock recommended: `100.000` on hand, `0.000` reserved, `5.000` low stock threshold.

---

## SQL Statements to Review and Run

You can choose either Option A (dynamic SKU lookup) or Option B (explicit IDs 1-18). Both are idempotent using `ON DUPLICATE KEY UPDATE`.

### Option A: Dynamic SKU-Based Insertion (Recommended)
This safely queries `product_variants` by SKU so it works regardless of auto-increment IDs:

```sql
-- Seed inventory balances for the 18 default catalog variants
INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold)
SELECT 
    v.id AS variant_id,
    v.product_id,
    100.000 AS on_hand,
    0.000 AS reserved,
    5.000 AS low_stock_threshold
FROM product_variants v
WHERE v.sku IN (
    'HA-001-DEF', 'HA-002-DEF', 'HA-003-DEF',
    'JW-001-DEF', 'JW-002-DEF', 'JW-003-DEF',
    'GF-001-DEF', 'GF-002-DEF',
    'TY-001-DEF', 'TY-002-DEF',
    'BG-001-DEF', 'BG-002-DEF',
    'BT-001-DEF', 'BT-002-DEF',
    'ST-001-DEF', 'ST-002-DEF',
    'CB-001-DEF', 'CB-002-DEF'
)
ON DUPLICATE KEY UPDATE
    on_hand = VALUES(on_hand),
    reserved = VALUES(reserved),
    low_stock_threshold = VALUES(low_stock_threshold);
```

---

### Option B: Explicit Literal Values (Matching Standard Seed ID sequence)

```sql
INSERT INTO inventory (variant_id, product_id, on_hand, reserved, low_stock_threshold) VALUES
(1, 1, 100.000, 0.000, 5.000),
(2, 2, 100.000, 0.000, 5.000),
(3, 3, 100.000, 0.000, 5.000),
(4, 4, 100.000, 0.000, 5.000),
(5, 5, 100.000, 0.000, 5.000),
(6, 6, 100.000, 0.000, 5.000),
(7, 7, 100.000, 0.000, 5.000),
(8, 8, 100.000, 0.000, 5.000),
(9, 9, 100.000, 0.000, 5.000),
(10, 10, 100.000, 0.000, 5.000),
(11, 11, 100.000, 0.000, 5.000),
(12, 12, 100.000, 0.000, 5.000),
(13, 13, 100.000, 0.000, 5.000),
(14, 14, 100.000, 0.000, 5.000),
(15, 15, 100.000, 0.000, 5.000),
(16, 16, 100.000, 0.000, 5.000),
(17, 17, 100.000, 0.000, 5.000),
(18, 18, 100.000, 0.000, 5.000)
ON DUPLICATE KEY UPDATE
    on_hand = VALUES(on_hand),
    reserved = VALUES(reserved),
    low_stock_threshold = VALUES(low_stock_threshold);
```

---

### Optional: Ledger Audit Trail in `inventory_movements`
If you wish to maintain full audit ledger parity in `inventory_movements` (which is append-only with `movement_type = 'OPENING_STOCK'`), you can also run:

```sql
INSERT INTO inventory_movements (
    variant_id, product_id, movement_type,
    on_hand_delta, reserved_delta,
    on_hand_before, on_hand_after,
    reserved_before, reserved_after,
    reference_type, reference_id, channel,
    reason, note, idempotency_key
)
SELECT 
    v.id AS variant_id,
    v.product_id,
    'OPENING_STOCK' AS movement_type,
    100.000 AS on_hand_delta,
    0.000 AS reserved_delta,
    0.000 AS on_hand_before,
    100.000 AS on_hand_after,
    0.000 AS reserved_before,
    0.000 AS reserved_after,
    'ADJUSTMENT' AS reference_type,
    v.id AS reference_id,
    'SYSTEM' AS channel,
    'Initial seed stock' AS reason,
    'Seed opening stock for e-commerce products' AS note,
    CONCAT('seed-opening-stock-variant-', v.id) AS idempotency_key
FROM product_variants v
WHERE v.sku IN (
    'HA-001-DEF', 'HA-002-DEF', 'HA-003-DEF',
    'JW-001-DEF', 'JW-002-DEF', 'JW-003-DEF',
    'GF-001-DEF', 'GF-002-DEF',
    'TY-001-DEF', 'TY-002-DEF',
    'BG-001-DEF', 'BG-002-DEF',
    'BT-001-DEF', 'BT-002-DEF',
    'ST-001-DEF', 'ST-002-DEF',
    'CB-001-DEF', 'CB-002-DEF'
)
ON DUPLICATE KEY UPDATE
    idempotency_key = VALUES(idempotency_key);
```

---

## Verification Query
After running either Option A or Option B, verify the inventory table with:

```sql
SELECT 
    i.variant_id,
    p.name AS product_name,
    v.sku,
    i.on_hand,
    i.reserved,
    i.available
FROM inventory i
JOIN product_variants v ON v.id = i.variant_id
JOIN products p ON p.id = i.product_id
ORDER BY i.variant_id ASC;
```
Expected result: 18 rows returned, each with `on_hand = 100.000`, `reserved = 0.000`, and `available = 100.000`.
