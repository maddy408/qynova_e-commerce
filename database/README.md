# Database

Single MySQL database (`unified_pos`) shared by the Admin+POS app and the
Storefront through the one PHP backend.

- `migrations/` — one `.sql` file per schema change, applied in filename
  order by `php database/migrate.php` (tracks applied files in
  `schema_migrations`; run it after pulling new migrations).
- `seed/` — seed data (admin user, cashier, sample customer, seed
  categories/brands/units, sample products).
- `migrate.php` — the migration runner. Reads `backend/.env` for DB
  credentials. Supports `DELIMITER` changes (needed for the
  `inventory_movements` triggers).

No `product_line`, `route`, `city` or `branch` tables anywhere — see
README.md "Conflicts ... resolved" at the repo root.

## Applied so far (foundation layer)

| File | Tables |
|---|---|
| `0001_access.sql` | `roles`, `permissions`, `role_permissions`, `users` (staff only — ADMIN/CASHIER), `device_tokens`, `audit_logs` |
| `0002_customers.sql` | `customers` (separate identity from `users`, OTP/Google auth), `customer_addresses` |
| `0003_otp_and_referral.sql` | `otp_verifications`, `referral_settings` (singleton), `referral_codes`, `referrals`, `referral_rewards` |
| `0004_catalog.sql` | `categories`, `subcategories`, `category_subcategory`, `brands`, `units`, `hsn_codes`, `gst_rates` |
| `0005_products.sql` | `products`, `product_images`, `product_categories` (one primary per product, enforced by a generated-column unique key), `product_subcategories`, `related_products`, `product_stats` |
| `0006_variants.sql` | `variant_attributes`, `variant_attribute_values`, `product_variants`, `product_variant_values`, `variant_images`, `customer_price_lists`, `customer_price_list_items` |
| `0007_inventory.sql` | `inventory`, `inventory_movements` (append-only — `UPDATE`/`DELETE` blocked by trigger), `stock_reservations`, `stock_adjustments`, `stock_adjustment_items` |
| `0008_coupons.sql` | `coupons`, `coupon_products`, `coupon_categories`, `coupon_brands`, `coupon_customers` (customer-specific targeting), `coupon_usages` |
| `0009_carts.sql` | `carts`, `cart_items` (no stored price — every read re-prices) |
| `0010_orders.sql` | `orders`, `order_items`, `order_item_discounts`, `order_status_history`; adds the deferred FKs on `stock_reservations.order_id` and `coupon_usages.order_id` |
| `0011_invoices.sql` | `invoices` (gap-reuse numbering via a generated `active_invoice_no` column — see below), `invoice_items` |
| `0012_purchases.sql` | `suppliers`, `purchases`, `purchase_items`, `purchase_returns`, `purchase_return_items` |

All verified against a live MySQL 9.4 instance: migrations apply cleanly,
the append-only triggers actually block `UPDATE`/`DELETE` on
`inventory_movements`, and the one-primary-category and singleton-settings
constraints hold. The full checkout flow (cart → coupon validation →
referral discount → tax → stock reserve → order → mock payment confirm →
stock deduct, plus both the unpaid-reservation-release and paid-stock-
restore cancellation paths) was exercised end-to-end against a running
server, as was the full purchase/GRN and purchase-return flow, and the
exact invoice-numbering gap-reuse scenario from `DOCUMENTATION.md` section
25's "INVOICE GAP TEST" (1,2,3,4 → delete 2 → reuse as 2 → delete 3 →
reuse as 3 → next is 5 → cancel 5 → next is 6, and 5 can never come back)
— see the backend README/commit history for what was checked.

**Invoice numbering** (`InvoiceService::nextInvoiceNumber()`) reuses the
lowest gap first and never reuses a cancelled number, via a generated
column: `active_invoice_no` is `invoice_no` while the row is live and
`NULL` once soft-deleted, so the `UNIQUE` key only reserves a number for
currently-active rows — the same trick `0005_products.sql` uses for "one
primary category per product". Cancelling an invoice therefore blocks
deleting it (deletion is what frees a number), which is also exactly the
rule the spec states ("a cancelled invoice remains a valid historical
transaction").

## Not yet built (next migrations, roughly in this order)

- **Automatic discounts** — `discounts` + its applicability join tables
  (DOCUMENTATION.md section 9's separate, code-less "Discount Master" —
  distinct from the `coupons` built in 0008, which always needs a code).
- **Combos, deals, banners** — `combos`, `combo_items`, `deals`,
  `deal_products`, `banners`, `banner_items`, `home_sections`.
- **Wishlist** — `wishlists`, `wishlist_items`.
- **Partial order/invoice cancellation** — the coupon re-validate-on-
  cancel algorithm (DOCUMENTATION.md section 9); `order_item_discounts`
  already exists for this, `OrderService::cancel()` and
  `InvoiceService::cancel()` only do whole-order/whole-invoice so far.
- **Payments & refunds** — `payments`, `payment_transactions`,
  `payment_transaction_events`, `refunds`, `refund_transactions`. Invoice/
  purchase payment tracking is currently just `amount_paid`/
  `payment_status` columns directly on the row — deliberately simplified,
  no payment-gateway integration or supplier/customer ledger yet.
- **Delivery** — `deliveries`, `delivery_status_history`,
  `serviceable_pincodes`, `shipping_rules`.
- **Finance ledger** — `customer_ledger`, `supplier_ledger`, `expenses`,
  `income`.
- **Notifications** — `notification_templates`, `notification_queue`,
  `notification_logs`, `notification_preferences`.
- **Content & settings** — `pages`, `faqs`, `contact_messages`,
  `settings`.

`audit_logs` already exists (in `0001_access.sql`) since it's referenced
conceptually from the start, but no code writes to it yet — that lands
with the admin order-editing and product-management APIs.
