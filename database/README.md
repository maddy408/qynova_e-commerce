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
| `0013_delivery.sql` | `deliveries`, `delivery_status_history` |
| `0014_refunds.sql` | `refunds`, `refund_transactions` |
| `0015_product_enrichment.sql` | Adds `bullet_points`, warranty/return/refund/SEO-keyword columns and `is_trending`/`is_deal` to `products`; adds `product_specifications` |
| `0016_banners.sql` | `banners`, `banner_items`, `home_sections`; adds the `banners.manage` permission |

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

**Delivery ↔ order sync** (`DeliveryService::DELIVERY_TO_ORDER_STATUS`)
maps a delivery status change onto the parent order's status (e.g.
`OUT_FOR_DELIVERY` on the delivery sets the order to `OUT_FOR_DELIVERY`
too), logging both `delivery_status_history` and `order_status_history`
in one transaction. A delivery already `DELIVERED` can't change further.
The admin-update path and the mock `/api/shipping/webhook` path share the
same `updateStatus()`, differing only in `source`.

**Refunds** are created automatically the moment a *paid* order or
invoice is cancelled (`RefundService::createForOrder`/`createForInvoice`,
called from inside that cancellation's own transaction) in `PENDING`
status, then processed as a separate explicit step — mirroring a real
gateway's async refund flow even though there's no real gateway. Verified
end-to-end: order-cancel → refund created → processed → `COMPLETED`;
force-failure → `FAILED` → retried → `COMPLETED`; a still-`PENDING`
refund can be cancelled outright (admin decides not to refund after all).

**Excel import/export** (`ProductImportService`/`ProductExportService`,
sections 11-13/39-40) added no new tables — it reads/writes the existing
`products`/`product_variants`/`inventory` rows via PhpSpreadsheet. One row
per variant; rows sharing a Product Code (or Product Name, if no code)
attach as additional variants to one product. `preview()` and `commit()`
run the exact same row-processing logic inside one transaction, each row
wrapped in its own `SAVEPOINT` so a bad row rolls back alone without
losing the rows already processed before it — `preview()` just rolls back
the whole transaction at the end instead of committing. Verified
end-to-end: multi-variant grouping, auto-create vs. reject-when-disabled
for every master type (category/brand/unit/HSN/GST/variant attribute),
duplicate-SKU/barcode rejection (including re-importing the same file
after it already succeeded), the downloadable error report (original row
data + reason, re-running the file through `preview()` to regenerate it),
and every export filter (all/selected/category/active, stock report).
Image URLs are stored as given, not downloaded/compressed — see "Not yet
built" below.

**Category/Subcategory/Brand/Unit CRUD** — until now these masters were
only ever populated by seed data or as an auto-create side effect of
product import; there was no admin API to manage them directly.
`CategoryService`/`SubcategoryService` (full CRUD, the latter managing
the `category_subcategory` mapping) and a minimal `MasterDataController`
(list + create for brands/units) close that gap, driven by the admin-pos
frontend's Category/Subcategory/Product-create screens. Found and fixed
a real bug along the way: `PDOException` extends `RuntimeException` as
of PHP 8, so `catch (RuntimeException $e) { ... } catch (PDOException $e)
{ ... }` silently let the first block swallow every PDO error too (wrong
status code, raw SQL message leaked to the client) — the `PDOException`
catch has to come first. Worth auditing for elsewhere this ordering
might recur; the full codebase search done here found two confirmed
occurrences (both fixed), with other controllers only ever catching
`RuntimeException` alone (no competing `PDOException` block to become
unreachable).

**Product/variant image upload + the WebP compression pipeline** —
`product_images`/`variant_images` existed since 0005/0006 but nothing
ever wrote to them except a pass-through URL during Excel import; there
was no real upload endpoint. `ImageUploadService` closes that gap:
MIME-sniffed (never trusted from the client), converted to WebP,
resized, and iteratively re-quality-reduced until under the configured
target size (`config.image.main_target_kb`/`thumb_target_kb` — these
existed in `config/config.php` since Phase 1 but were never wired to
anything until now). `ProductImageService`/`VariantImageService` own
primary/reorder/delete, with deleting the primary image correctly
promoting the next one. Verified against a real ~900KB noisy JPEG:
compressed to a 1200px-max WebP under the 100KB target and a 300px
thumbnail under the 30KB target, confirmed as a valid, readable image
afterward (not just "a file exists").

**Variant combination generator** — `VariantService::generateCombinations()`
takes attribute value groups (e.g. Color=[Blue,Orange], Size=[L,XL]) and
creates the cartesian product as variants in one call, auto-building each
SKU and skipping (not erroring on) combinations that already exist, so
re-running it after adding one more attribute value only adds what's new.
Verified: 2 colors × 2 sizes → 4 variants in one call; re-running the
exact same request afterward skipped all 4 with a clear per-combination
reason instead of erroring out.

**`product_specifications`** — free-form name/value rows (`ProductSpecificationService`),
replacing the full list per save rather than diffing individual rows —
simplest correct semantics for how the UI edits it (a whole list at once).

**Stock adjustment `product_id` fix** — `InventoryService::createAdjustment()`
was accepting a caller-supplied `product_id` for each line item, a foreign
key the frontend has no business sending since it's fully derivable from
`variant_id`. Caught while wiring the Stock Adjustments frontend (the UI
had no honest value to send and was about to fabricate one). Fixed by
resolving `product_id` from the variant's own `inventory` row inside the
service, with a `RuntimeException` guard if that row doesn't exist — the
frontend now only sends `variant_id` and `counted_qty`. This is the same
"never trust the frontend for a derivable FK" rule the rest of the stock
code already followed; this one call site had slipped through.

**Banners + home sections** (`0016_banners.sql`) — scoped down from
DOCUMENTATION.md section 10: `combos`/`deals` and the automatic
"discount_group" banner target stay deferred (no backing tables exist),
so `banners.target_type` omits `DISCOUNT_GROUP`, and `home_sections.type`
keeps the `BEST_SELLERS`/`COMBOS`/`DEALS` enum values (so the column
doesn't need a migration later) without any endpoint resolving them yet
— `BEST_SELLERS` would need `product_stats` (also deferred), `COMBOS`/
`DEALS` need their own tables. `target_id` is deliberately FK-less (it's
polymorphic — product/category/subcategory/brand/coupon depending on
`target_type`); `BannerService::resolveTarget()` validates it against the
right table instead. `GET /api/banners` and `GET /api/banners/{id}` are
public/unauthenticated, same reasoning as `CategoryController::index()` —
the storefront will need banner data without a login, same as category
navigation. Desktop/mobile images go through the same `ImageUploadService`
pipeline as product images, each as its own upload endpoint (`POST
/api/banners/{id}/image/desktop` / `.../mobile`) since a banner needs a
real ID before it has anywhere to attach a file, same two-step reasoning
as product images.

**GST rate / HSN code CRUD** — `gst_rates` and `hsn_codes` (tables since
`0004_catalog.sql`) could previously only be populated by
`ProductImportService`'s auto-create-on-import path; there was no direct
"create a GST rate" endpoint. Added `POST`/`PUT /api/gst-rates` and
`POST`/`PUT`/`DELETE /api/hsn-codes` to `MasterDataController` (no new
migration — the tables already existed). `GET /api/gst-rates` defaults to
`status = 'ACTIVE'` only (what the product form's dropdown wants); the
Tax admin page passes `?all=1` to also see INACTIVE rates it can
reactivate.

## Not yet built (next migrations, roughly in this order)

- **Deferred from the Product Create spec (low practical value for a
  single-shop build, scoped out rather than silently dropped)** —
  manufacturer address/contact, importer/packer info, batch tracking,
  package dimensions/shipping class, per-channel (POS vs. e-commerce)
  min/max order quantity, pre-order flag.
- **Automatic discounts** — `discounts` + its applicability join tables
  (DOCUMENTATION.md section 9's separate, code-less "Discount Master" —
  distinct from the `coupons` built in 0008, which always needs a code).
- **Combos and deals** — `combos`, `combo_items`, `deals`,
  `deal_products` — banners/home_sections (0016) ship with schema-ready
  placeholders for these but the tables themselves don't exist yet.
- **Wishlist** — `wishlists`, `wishlist_items`.
- **Partial order/invoice cancellation** — the coupon re-validate-on-
  cancel algorithm (DOCUMENTATION.md section 9); `order_item_discounts`
  already exists for this, `OrderService::cancel()` and
  `InvoiceService::cancel()` only do whole-order/whole-invoice so far.
- **Real shipping provider** — a `ShiprocketProvider` adapter behind the
  same interface the mock currently satisfies informally; `serviceable_
  pincodes`/`shipping_rules` for pincode-gated checkout and computed
  shipping charges (checkout currently uses a flat rate/free-above
  threshold — see `OrderService::FLAT_SHIPPING`).
- **Payment gateway & ledgers** — `payments`, `payment_transactions`,
  `payment_transaction_events`, `customer_ledger`, `supplier_ledger`.
  Invoice/purchase/refund payment tracking is currently just columns
  directly on each row — deliberately simplified, no Razorpay
  integration or running ledger balance yet.
- **Finance** — `expenses`, `income`.
- **Notifications** — `notification_templates`, `notification_queue`,
  `notification_logs`, `notification_preferences`.
- **Content & settings** — `pages`, `faqs`, `contact_messages`,
  `settings`.
- **Image download/compression** — docs section 8's WebP pipeline isn't
  wired to product import/export; an `Image URL` cell is stored as given
  (`variant_images.image_path`), not fetched, resized or compressed.

`audit_logs` (from `0001_access.sql`) is written to by `InvoiceService`
(`CANCEL_INVOICE`/`DELETE_INVOICE`) and `PurchaseService` (`PURCHASE`) —
still missing from catalog/order-editing and most other admin actions.
