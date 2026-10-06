# Unified POS + E-Commerce System

One shop (single branch) selling accessories, gifts, toys and related
products. One PHP REST API + one MySQL database, shared by two independent
frontends: a combined Admin + POS app, and a customer-facing storefront.

Specs this build follows (in order of precedence where they overlap):

1. [docs/ECOMMERCE_POS_ADMIN_SPEC.md](docs/ECOMMERCE_POS_ADMIN_SPEC.md) —
   **current architecture source of truth.** Defines the 2-app layout
   (Admin+POS combined, separate customer e-commerce app), mobile-OTP
   customer auth, the referral system, and the full variant/coupon/order/
   delivery/refund business logic.
2. [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md) — the original 40-section
   build spec (3-app layout, Google login, Firebase push, Razorpay,
   wholesale pricing, combos/deals, shipping-provider tracking). Superseded
   on app count by spec 1, but still the source for everything spec 1
   doesn't redefine (GST/HSN master, invoice-numbering rules, inventory
   ledger design, shipping/pincode logic, non-negotiable rules in section 26).
3. [docs/SHOP_FEATURES_REQUIREMENTS.md](docs/SHOP_FEATURES_REQUIREMENTS.md) —
   the original shorter customer brief; a subset of spec 2.

**Conflicts between spec 1 and spec 2, resolved:**

- **Customer auth** — mobile number + OTP is the primary signup/login flow
  (spec 2 section 2); "Continue with Google" stays available as an
  additional option (spec 1 section 5), not a replacement.
- **Firebase push, Razorpay, wholesale customer type, combos/deals/
  banners/home-sections** — all kept from spec 1; spec 2 doesn't mention
  them but doesn't exclude them either.
- **Product Line** — stays removed (spec 1's decision). Spec 2's Product
  Line field/master table/filter/coupon-scope do not apply; use the
  existing multi-category/subcategory mapping wherever spec 2 says
  "Product Line".

## Architecture

```
apps/admin-pos    React (Vite) — Admin Panel + POS Billing, one app, role-based access
apps/storefront   Next.js — customer-facing e-commerce (SSR/SSG for SEO)
backend/          ONE PHP REST API (PDO, JWT auth, role-based authorization)
packages/shared/  Shared UI components, API client, types — no business logic
database/         Migrations + seed for the single MySQL database
bridge/           Optional local print/scanner bridge (Node.js, shop PC) —
                  only needed if POS hardware (thermal printer/barcode
                  scanner) is added; not required by spec 1
docs/             The three specs above
```

Pricing, GST, coupon, referral, inventory and ledger logic live **only**
in the backend. Both apps call the same API and the same database; neither
may compute money values independently.

## Non-negotiable rules

From spec 1 section 48 and spec 2 section 26/32:

- No duplicate product/inventory/customer/order systems between Admin+POS
  and the storefront — one shared backend and database.
- Frontend is never trusted for price, discount, tax, stock, coupon amount,
  customer ID or role — the backend recalculates and re-validates everything.
- Variants are first-class (attributes, SKU, barcode, price, stock, images,
  description per variant) — never plain text.
- All stock changes are transactional and variant-aware; POS and
  e-commerce share one inventory, with locking to prevent overselling.
- Every admin edit to price/quantity/discount/status on an order is
  audit-logged (old value, new value, changed by, reason).
- Referral and coupon percentages, tax, and discount rules come from
  configuration/database — never hardcoded.
- No Product Line/Route/City/Branch concept anywhere (spec 2, single
  business/location).

## Setup

### Backend

```bash
cd backend
composer install
copy .env.example .env        # edit DB_*, JWT_SECRET, etc.
mysql -u root -p -e "CREATE DATABASE unified_pos CHARACTER SET utf8mb4;"
php database/migrate.php      # from repo root — applies database/migrations/*.sql
php database/seed.php         # dev-only seed data — see database/README.md
php -S localhost:8000 -t backend/public
curl http://localhost:8000/api/health
```

### Admin + POS (Vite)

```bash
cd apps/admin-pos
npm install
copy .env.example .env
npm run dev
```

### Storefront (Next.js)

```bash
cd apps/storefront
npm install
copy .env.example .env
npm run dev
```

## Build status

- **Phase 1** — monorepo skeleton: two app shells (admin-pos, storefront),
  backend skeleton with a working `/api/health` route, env examples.
- **Phase 2 (in progress)** — database: 61 tables (see `database/README.md`
  for the full list and what's still missing — automatic discounts,
  combos/deals/banners, wishlist, a real payment gateway, ledgers, etc.).
  Backend APIs built and verified end-to-end against a running dev server
  (not just written — actually exercised with curl):
  - Staff login (JWT + permissions) and customer mobile+OTP signup/login
  - Referral system: code generation, reward creation, self-referral guard
  - Products + the attribute-based variant system, duplicate-combination
    guard, POS barcode/SKU/name lookup
  - Inventory ledger (`InventoryService`) + stock adjustments
  - Coupons (customer-specific targeting, full validation) + cart +
    checkout: coupon + referral discount stacking with combine flags,
    backend-computed tax/shipping/grand total, stock reservation, mock
    payment confirmation, and both cancellation paths (release an unpaid
    reservation vs. restore stock on a paid order) — including reverting
    coupon usage and the referral reward on cancel
  - Invoices: POS billing (immediate stock deduction) and auto-generated
    e-commerce invoices (on order payment confirmation); the exact
    "INVOICE GAP TEST" from docs section 25 (reuse the lowest deleted
    gap, never reuse a cancelled number) verified step-by-step
  - Purchases/GRN: supplier → purchase → stock increase, partial purchase
    returns with over-return rejection, and whole-purchase cancellation
    reversing exactly the un-returned remainder
  - Delivery: order status stays synchronized with delivery status
    through every stage (PENDING → ASSIGNED → PICKED_UP → IN_TRANSIT →
    OUT_FOR_DELIVERY → DELIVERED), both via admin update and a mock
    shipping-provider webhook; a delivered shipment can't be changed
    further; customers can track their own order's delivery
  - Refunds: created automatically (PENDING) the moment a paid order or
    invoice is cancelled, processed as an explicit separate step
    (COMPLETED/FAILED), with a tested retry-after-failure path and a
    refund summary report
  - Admin dashboard: sales cards (total/today/this-month/collection,
    split POS vs. e-commerce), order funnel counts, refund totals,
    customer counts, product/stock counts; a sales chart (daily/weekly/
    monthly buckets); top-selling products/categories/variants plus a
    gross-profit *estimate* (explicitly labeled — no cost-at-sale-time
    snapshot exists yet, see `database/README.md`); new-vs-returning and
    top-customer analytics, referral-customer count; recent sales/orders.
    Net Profit/Expenses/Income are deliberately omitted rather than
    reported as a fabricated zero — that module doesn't exist. Verified
    against real multi-product, multi-channel test data, including
    catching and fixing a double-counting bug (an out-of-stock variant
    was being counted as both "low stock" and "out of stock") and —
    caught later, live in the browser, when a freshly-seeded dashboard
    showed "null pending" instead of "0 pending" — three more spots
    with the same missing-`COALESCE` pattern (`SUM()` over zero matching
    rows returns `NULL`, not `0`, in SQL)
  - Excel import/export (PhpSpreadsheet): one row per variant, grouped
    into one product by Product Code/Name; a downloadable sample
    template; `preview` vs. `commit` share identical logic (a
    transaction rolled back vs. committed), each row in its own
    `SAVEPOINT` so one bad row doesn't take down the rows around it;
    auto-create-or-reject for every master type (category/brand/unit/
    HSN/GST/variant attribute); duplicate SKU/barcode rejection; a
    downloadable error report with the original row data plus the
    reason; export filters for all/selected/category/brand/active/
    inactive products plus a stock report. Verified end-to-end,
    including a real bug caught along the way — PhpSpreadsheet 5.x
    removed the `setCellValueByColumnAndRow()` method the first draft
    used, and an initial naive-pluralization bug turned "Category" into
    "Categorie" in error messages (the spec's own example is literally
    `"Row 41: Category not found"`)
  - Category/Subcategory/Brand/Unit CRUD: previously these masters were
    only ever seed data or an import side effect — no admin API existed
    to manage them directly. Added `CategoryService`/`SubcategoryService`
    (the latter owning the `category_subcategory` mapping) and a small
    `MasterDataController` for brands/units. Found and fixed a real bug
    while testing duplicate-name rejection: `PDOException` extends
    `RuntimeException` as of PHP 8, so a `catch (RuntimeException)` block
    listed before a `catch (PDOException)` block silently swallowed every
    PDO error too — wrong HTTP status, raw SQL message leaked to the
    client. Audited the rest of the codebase for the same ordering risk;
    these were the only two instances.

- **Phase 3 (started)** — `apps/admin-pos` frontend: real screens now,
  not the default Vite scaffold. React Router + Tailwind v4 + an axios
  client with JWT-interceptor auth. Built and verified **in an actual
  browser** (navigated, clicked, typed — not just code review): login,
  a live dashboard pulling `/api/dashboard/summary`, Categories (list/
  create/activate-deactivate), Subcategories (same, plus a category
  multi-select mapping UI), and Product creation with a category
  chip-picker (click a chip's star to set the primary category) whose
  subcategory picker is *live-filtered* to only subcategories mapped to
  the categories currently selected — mirroring `ProductService`'s own
  validation rule so a submission here can never be rejected for
  violating it. Confirmed end-to-end against the real API: created a
  category, a subcategory mapped to two categories (reproducing the
  spec's own "Kids under both Toys and Gift Items" example verbatim),
  and a product through that mapping — then verified via a direct API
  call that `is_primary`/the subcategory link both persisted exactly as
  selected in the UI.
  - **Product Create, rebuilt against a detailed spec/mockup** (real
    image upload + variant management, not placeholder UI): a sectioned
    Create screen (Basic Info/Classification/Pricing & Tax/
    Specifications) with a Simple vs. Variable product-type toggle, then
    redirects to a Product Detail page for everything that needs a real
    product ID first — product images (drag-drop upload, set primary,
    delete-promotes-next-primary), a variant attribute picker + "Generate
    Combinations" button (the cartesian product of selected attribute
    values, e.g. 2 colors × 2 sizes → 4 variants in one call), inline
    per-variant price editing, and a per-variant "Manage Images" modal
    scoped to exactly that variant. Verified end-to-end in the browser
    for both product types: created a Simple product (Coffee Mug) and
    confirmed its opening stock hit the real `inventory_movements`
    ledger (`STOCK_ADJUSTMENT_IN`, not an optimistic UI number); opened a
    Variable product (Cotton T-Shirt, 4 generated variants) and confirmed
    an image uploaded earlier via curl rendered correctly as the primary
    product image and as that specific variant's thumbnail, and that the
    per-variant image modal showed only that variant's own images — the
    explicit "never mix Blue/L images with Orange/XL" requirement,
    confirmed visually, not just by reading the code.
  - New backend alongside it: real file upload with WebP compression
    (verified against a ~900KB test image: 1200px/100KB main,
    300px/30KB thumbnail, confirmed as a valid readable image afterward)
    for both `product_images` and `variant_images` — tables that existed
    since Phase 2 but had no upload endpoint, only a pass-through URL
    during Excel import; a variant combination generator; and
    `product_specifications`.

Still ahead: editing a product's basic fields from the detail page, POS
billing, the storefront app (still the default scaffold), admin frontend
for coupons/orders/referral/purchases/stock-adjustment (all have working
backends already — just no UI yet), banners (no backend yet either),
Razorpay, a real shipping provider adapter, and a dedicated reports page
— per `docs/ECOMMERCE_POS_ADMIN_SPEC.md` section 46's phase order.
