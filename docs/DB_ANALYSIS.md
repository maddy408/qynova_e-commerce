# Database Analysis — `unified_pos`

**Scope:** Phase 3 of the `refactor/dynamic-config-structure` work. Schema review +
query-pattern review of the 84-table MySQL database shared by `apps/admin-pos`,
`apps/storefront`, and `backend/`.

**Source of truth:** This document does not re-derive the schema from scratch —
[`docs/audit/02-database.md`](audit/02-database.md) (dated 2026-10-09, "Antigravity"
audit) already did a verified, table-by-table and query-by-query pass over the live
database and the 71 PHP files that touch it. This document re-states its findings in
the format this task asked for, adds the few items that audit didn't score against
"is this a safe schema migration," and records exactly what was fixed.

---

## 1. Schema review

### 1.1 Data types, keys, defaults, charset/collation
- **Charset/collation:** consistent `utf8mb4` / `utf8mb4_unicode_ci` on every table
  across all 32 migration files. No stray `latin1` or mismatched collations found —
  nothing to fix here.
- **Primary keys:** every table uses `BIGINT UNSIGNED AUTO_INCREMENT` (or a
  composite PK for pure junction tables, e.g. `role_permissions(role_id,
  permission_id)`). Consistent.
- **One real type mismatch:** `inventory_batches.supplier_id` was declared
  `INT UNSIGNED` while the column it should reference, `suppliers.id`, is
  `BIGINT UNSIGNED` (migration `0024_inventory_batches.sql` line 6). This is why it
  never got a foreign key. **Fixed** — see §3.
- **NOT NULL / defaults:** generally disciplined (explicit `DEFAULT` on every status
  / timestamp column). The one NOT NULL violation found is a *code* bug, not a schema
  bug: `ReturnsController::storePurchaseReturn` inserts `NULL` into
  `purchase_item_id`, which the schema correctly declares `NOT NULL`
  (`0012_purchases.sql` line 85). Flagged as risky below — not something a migration
  can fix (see §4).

### 1.2 Naming consistency / normalization / ENUM vs lookup tables
- **`wishlist` is singular** while every other table in the database is plural
  (`carts`, `orders`, `products`, ...). Cosmetic, not fixed (renaming a live table
  means updating every `WishlistController`/query reference — out of scope for a
  "safe" migration).
- **Duplicate/overlapping columns:** `purchases.amount_paid` (added in
  `0012_purchases.sql`) and `purchases.paid_amount`/`balance_amount` (added later in
  `0022_purchase_payment_update.sql`) coexist. `PaymentService` writes
  `paid_amount`; nothing currently reads `amount_paid`, but dropping a column that
  might still be read somewhere is exactly the kind of destructive change this phase
  is told not to make. Documented only (§4).
- **ENUM vs lookup tables:** the codebase already converted the one place this
  mattered — `payment_methods` was pulled out of a fixed `ENUM` into its own
  admin-manageable table in migration `0018_payment_methods.sql`. Remaining ENUMs
  (`orders.status`, `purchases.status`, `inventory_batches.status`, etc.) are closed,
  small, rarely-changing state machines — appropriate use of `ENUM`, not lookup-table
  candidates.
- **Migration numbering collisions:** 7 pairs of migration files share the same
  4-digit prefix (`0019` through `0025`, each pair listed in
  [`docs/audit/02-database.md` §6.4](audit/02-database.md)). `database/migrate.php`
  sorts files with `glob()` + alphabetical `sort()`, so today's execution order is
  accidental, not explicit. **Not renamed** in this pass — see §4 for why.

### 1.3 Indexes vs. actual queries (WHERE / JOIN / ORDER BY)
Cross-referencing `docs/audit/02-database.md §6.3` against the service-layer queries
that actually filter/join on these columns, 5 columns are both (a) queried and (b)
missing an index, all nullable foreign-key-shaped columns pointing at exactly one
parent table:

| Column | Queried via | Had index? | Had FK? |
|---|---|---|---|
| `inventory_batches.supplier_id` | `BatchService` supplier filters | No | No (type mismatch blocked it) |
| `inventory_batches.purchase_id` | `BatchService` / `PurchaseService` joins | No | No |
| `invoice_items.batch_id` | `InvoiceService::createPosSale` batch consumption join | No | No |
| `referral_rewards.applied_order_id` | `ReferralService` reward-application lookups | No | No |
| `offers.banner_id` | `SettingsController::getOffers` banner join | No | No |

`offers.target_id` is excluded on purpose — it's polymorphic (`target_type` decides
which table it points to), so it can't take a single FK, and indexing a polymorphic
ID alone without `target_type` in the index would be close to useless for the
queries that use it. All five rows above are now indexed and FK-constrained — see §3.

---

## 2. Query review (N+1, SELECT *, pagination, transactions, prepared statements)

All verified directly in `docs/audit/02-database.md` §5 and §6, and
`docs/audit/05-report.md` §3 Confirmed Defects Master Log — summarized here, not
re-traced:

- **Prepared statements:** consistently used everywhere (`PDO::prepare()` +
  bound params, `PDO::ATTR_EMULATE_PREPARES => false`). No raw string-concatenated
  SQL was found. No SQL-injection-shaped findings in either audit pass.
- **Connection pooling:** N/A for this stack — `db()` is a single-request PDO
  singleton (PHP's built-in dev server / typical PHP-FPM model), not a long-lived
  pooled connection. Nothing to tune here without changing the deployment model,
  which is out of scope.
- **N+1 queries (confirmed, not fixed — business logic):** `SubcategoryService::list`
  and `MasterDataController::indexBrands`/banner category joins run one query per
  row to resolve a junction-table mapping instead of a single `JOIN`/`GROUP_CONCAT`
  (DEF-34). Fixing this means rewriting service methods, not a schema migration.
- **Missing pagination (confirmed, not fixed — business logic):** `OrderService`,
  `CustomerAuthController`, `InventoryService` listings use a hardcoded
  `LIMIT 200` with no `page`/`offset` parameters (DEF-35) — rows beyond 200 are
  invisible, not slow. Again, an API/controller change, not a schema change.
- **Missing transactions (confirmed, not fixed — business logic):** 7 multi-step
  mutations run without `beginTransaction()`/`commit()` — `CartService::
  mergeSessionCart`, `BatchService::consumeStock`, `OrderService::updateStatus`,
  `InvoiceService::createFromOrder`, `WishlistController::merge`,
  `ProductService::update`, `SubcategoryService::delete`/`CategoryService::delete`
  (full detail in `docs/audit/02-database.md` §5.2). These are PHP code changes
  wrapping existing statements in a transaction — no schema change needed or made.
- **Order+stock+payment writes specifically:** the checkout, payment-confirmation,
  and cancellation paths (`OrderService::checkout`/`confirmPayment`/`cancel`,
  `InvoiceService::createPosSale`/`cancel`, `PaymentService::collectPayment`) are
  already correctly wrapped in transactions. The gaps are in secondary paths
  (status transitions after checkout, cart merge on login, batch consumption) —
  listed above.
- **125 SELECT queries missing `deleted_at IS NULL`** on 10 soft-deletable tables
  (DB-05 / DEF-22) — e.g. a soft-deleted customer can still log in; a cashier can
  collect payment against a deleted invoice. This is a `WHERE` clause fix in PHP,
  not a schema or index change.

---

## 3. SAFE fixes applied (new migration)

Per this phase's scope decision (schema-only, no renames of already-applied
migration files), [`database/migrations/0032_safe_index_fk_fixes.sql`](../database/migrations/0032_safe_index_fk_fixes.sql)
adds the 5 missing index+FK pairs identified in §1.3:

1. Widens `inventory_batches.supplier_id` from `INT UNSIGNED` to
   `BIGINT UNSIGNED` (lossless — every `INT UNSIGNED` value fits in
   `BIGINT UNSIGNED`) so its type matches `suppliers.id`, then adds the index and
   `ON DELETE SET NULL` foreign key.
2. Adds index + `ON DELETE SET NULL` foreign key: `inventory_batches.purchase_id`
   → `purchases.id`.
3. Adds index + `ON DELETE SET NULL` foreign key: `invoice_items.batch_id`
   → `inventory_batches.id`.
4. Adds index + `ON DELETE SET NULL` foreign key: `referral_rewards.applied_order_id`
   → `orders.id`.
5. Adds index + `ON DELETE SET NULL` foreign key: `offers.banner_id` → `banners.id`
   (`offers.target_id` is left alone — polymorphic, see §1.3).

No table or column is dropped. No existing row's data changes (the one `MODIFY` is a
type widen, not a data rewrite). `ON DELETE SET NULL` was used on every new FK
(matching how the codebase already treats these as optional/nullable links) so
deleting a parent row cannot cascade-delete unrelated child rows or suddenly start
rejecting deletes that worked before.

**Caveat:** if an environment already has orphaned values in one of these 5 columns
(a value with no matching parent row — shouldn't exist in the current dev/seed data,
but worth saying), that one `ADD CONSTRAINT` statement will fail. The statements are
independent, so fix or null out that column's orphans and re-run the rest.

## 4. Risky items — documented, not applied

These were all re-confirmed as real in `docs/audit/02-database.md` and
`docs/audit/05-report.md`, but are explicitly **not** schema-safe one-way migrations,
so they're left here for a deliberate decision rather than applied silently:

| Item | Why it's risky to "just fix" |
|---|---|
| **Migration numbering collisions** (7 duplicate 4-digit prefixes, `0019`–`0025`) | Renaming files that `schema_migrations` already recorded by filename on any already-migrated environment (including whatever database this repo's own dev/test runs have touched) breaks `migrate.php`'s `in_array($filename, $applied)` check — the renamed file would look new and re-run `CREATE TABLE IF NOT EXISTS` statements that are mostly idempotent, but also ALTERs that are not (e.g. re-adding a column). Needs a coordinated rename + `schema_migrations` row update, done once, with everyone's local DB in sync — not something to auto-apply from a feature branch. |
| **Dual inventory ledgers** (`inventory_movements` vs `inventory_transactions`) | Structural/business-logic duplication, not a column-level fix. Consolidating means picking one ledger and migrating `BatchService` off the other — a service-layer rewrite. |
| **`purchases.amount_paid` vs `paid_amount`/`balance_amount`** | Dropping `amount_paid` is exactly the "don't drop columns" case this phase rules out, in case any report or export still reads it. Needs a code grep + verified-zero-readers check first. |
| **`ReturnsController` inserting `NULL` into `purchase_item_id`** | A code bug (DEF-07/DB-02), not a schema gap — the column is already correctly `NOT NULL`. Fixing it means changing `ReturnsController::storePurchaseReturn` to resolve a real `purchase_item_id`, or switching the route to call the already-correct `PurchaseService::createReturn`. Out of this phase's scope (business logic). |
| **125 missing `deleted_at IS NULL` filters, N+1 queries, missing pagination, missing transactions** | All PHP code changes in controllers/services, not database schema. Listed in §2 for completeness; not touched here. |
| **`wishlist` singular table name** | Renaming a live table means updating every reference in `WishlistController`/`WishlistService` and any raw SQL — a coordinated code+schema change, not a standalone migration. |

---

## 5. Summary

| | Count |
|---|---|
| Tables reviewed | 84 |
| Confirmed DB-level findings (from existing audit) | 10 (DB-01 … DB-10) |
| Fixed in this pass (new migration, schema-only) | 5 missing index+FK pairs (1 migration file) |
| Documented as risky / needs a deliberate decision | 6 items (see §4) |
| Business-logic bugs noted but intentionally not touched | 125 missing soft-delete filters, 7 un-transacted mutation paths, N+1 listing queries, hardcoded `LIMIT 200` pagination |

No table or column was dropped. No destructive statement was written or run.
