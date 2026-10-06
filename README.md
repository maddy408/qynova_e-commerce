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
- **Phase 2 (in progress)** — database: 50 tables (see `database/README.md`
  for the full list and what's still missing — suppliers/purchases,
  automatic discounts, combos/deals/banners, wishlist, invoices, payments,
  delivery, etc.). Backend APIs built and verified end-to-end against a
  running dev server (not just written — actually exercised with curl):
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

Still ahead: both frontend apps' actual UI (nothing built in React/Next.js
yet beyond the default scaffolds), purchases/suppliers, invoices, Razorpay,
delivery tracking, refunds, Excel import/export, the admin dashboard, and
reports — per `docs/ECOMMERCE_POS_ADMIN_SPEC.md` section 46's phase order.
