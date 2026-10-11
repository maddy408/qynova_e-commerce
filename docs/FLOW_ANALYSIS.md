# Flow Analysis — Customer Purchase + Admin Order Management

**Flow validated:** signup/login → browse products/categories → product detail →
add to cart → cart → checkout (address) → payment (Razorpay) → order confirmation →
order history → admin: order management, product management, user management.

**Methodology:** [`docs/audit/01-05`](audit/) (dated 2026-10-09, "Antigravity" audit)
already traced this system end to end with file/line citations. This document reuses
those findings rather than re-deriving them — **except** where this session verified
the current code (2026-10-11) and found it had changed since that audit. The
storefront's checkout, cart-coupon, and customer-order-history code has visibly been
rewritten since 2026-10-09; several "critical" items from that audit are now fixed,
and one is now broken in a *different* way. §4 and §5 below call out exactly which is
which — do not re-fix anything in §4.

---

## 1. Stack discovery (Phase 1)

| Layer | Stack | Notes |
|---|---|---|
| `apps/admin-pos` | React 19 + TypeScript, Vite 8, React Router v7, Tailwind v4, axios | Admin panel + POS billing, one combined app. Route-protected by login only (see AUTH-GAP-01, §5). |
| `apps/storefront` | React 19 + JavaScript (JSX), Vite 6, React Router v7, Tailwind v4, axios | Customer storefront. Documented everywhere as Next.js (`README.md`, `docs/DOCUMENTATION.md`) but is actually a Vite SPA — orphan `next-env.d.ts` left over (ARCH-01). No SSR/SSG. |
| `backend` | PHP 8.1+, no framework, PSR-4 autoload, PDO (raw SQL, prepared statements), `firebase/php-jwt`, `phpoffice/phpspreadsheet` | Single REST API, JWT auth, 32 controllers / 30 services, manual (non-middleware-chained) auth/permission checks per action. |
| `database` | MySQL, `unified_pos`, 84 tables, utf8mb4 throughout, 32 migration files + 3 seed files | Shared by both frontends; see `docs/DB_ANALYSIS.md`. |
| `packages/shared` | TypeScript, npm package stub | Unused placeholder — not imported by either app (ARCH-10). |
| API calls today | Each app has its own hand-rolled axios client (`apps/admin-pos/src/lib/api.ts`, `apps/storefront/src/lib/api.js`) reading its own env var directly, with its own hardcoded port fallback and its own endpoint path strings scattered across page components. No shared endpoints file, no shared base-URL config. This is exactly what Phases 5-6 of this refactor replace. |

---

## 2. Flow trace: stage → frontend → API → backend → DB

| Stage | Frontend | API | Backend | DB tables | Status |
|---|---|---|---|---|---|
| Signup/Login (customer) | `storefront` `/register`, `/login` (mobile OTP + Google) | `POST /api/customers/otp/request`, `/otp/verify`, `POST /api/customers/google` | `CustomerAuthController`, `OtpService`, `GoogleAuthService` | `customers`, `otp_verifications`, `referral_codes` | **VERIFIED working**, but see SEC-01 (§5, plaintext OTP) |
| Browse products/categories | `storefront` `/`, `/shop` | `GET /api/categories`, `/subcategories`, `/products` | `CategoryController`, `ProductController` | `categories`, `products`, `product_images`, `product_variants`, `inventory` | **VERIFIED working** |
| Product detail | `storefront` `/product/:id` | `GET /api/products/{id}` | `ProductController::show` | `products`, `product_variants`, `product_variant_values`, `variant_images` | **PARTIAL** — no variant selector UI; hardcodes the default variant (GAP-01, §4) |
| Add to cart / Cart | `storefront` cart drawer | `GET/POST/PUT/DELETE /api/cart*` | `CartController`, `CartService` | `carts`, `cart_items` | **VERIFIED working**; coupon validation now calls the real `/coupons/validate` endpoint (fixed since the 2026-10-09 audit — see §4) |
| Checkout (address) | `storefront` `CheckoutModal.jsx` | `POST /api/orders` *(called)* vs `POST /api/orders/checkout` *(the only route that exists)* | `OrderController::checkout`, `OrderService::checkout` | `orders`, `order_items`, `order_item_discounts`, `stock_reservations`, `inventory`, `coupon_usages` | **BROKEN — new finding, see §5 BUG-01.** Every checkout request 404s before reaching the backend at all. |
| Payment | *(none)* | `POST /api/orders/{id}/confirm-payment` (mock only) | `OrderController::confirmPayment` | `orders` | **MISSING real gateway** — mock confirmation with no transaction verification (see §4, carried from DEF-10); Razorpay scaffolding is added as empty placeholders in this same branch (Phase 8), not wired in |
| Order confirmation | `storefront` `CheckoutModal.jsx` success screen | — | — | `orders` | Shows a real order number now (no more fake `KB-XXXXXX` generator — **fixed**, see §4) — but is currently unreachable because checkout itself 404s (BUG-01) |
| Order history | `storefront` `/orders`, `/orders/:id` (`customer/Orders.jsx`, `customer/OrderDetail.jsx`) | `GET /api/customers/orders`, `GET /api/orders/{id}` | `OrderController::myOrders`, `show` | `orders`, `order_items`, `order_status_history` | **VERIFIED working — fixed since audit** (the 2026-10-09 audit found zero routes for this; both now exist and call the correct endpoints) |
| Admin: order management | `admin-pos` `/orders`, `/orders/:id` | `GET /api/orders`, `GET /api/orders/{id}`, `PATCH /api/orders/{id}/status` | `OrderController::index/show/updateStatus` | `orders`, `order_items`, `order_status_history`, `invoices` | **VERIFIED working** |
| Admin: product management | `admin-pos` `/products`, `/products/new`, `/products/:id` | `GET/POST /api/products`, `/api/variants`, `/api/inventory/adjustments` | `ProductController`, `VariantController`, `InventoryController` | `products`, `product_variants`, `inventory` | **PARTIAL** — product core fields (name, description, category, SEO, active flag) have no edit UI after creation (DEF-16); variant SKU edits are silently dropped by the backend (DEF-15) |
| Admin: user management | `admin-pos` `/users` | `GET/POST/PUT /api/users` *(staff)* | `UserController` | `users`, `roles`, `role_permissions`, `permissions` | **VERIFIED working** |

---

## 3. Missing steps, broken/dead routes

| ID | Severity | Item | File refs |
|---|---|---|---|
| GAP-01 | **High** | No variant selector (size/color/pack) on the storefront product detail page; hardcodes `product.variants.find(v => v.is_default) || product.variants[0]` | `apps/storefront/src/pages/ProductDetails.jsx:243-245` (carried from DEF-05; not touched since) |
| GAP-02 | Medium | No admin UI or mutation endpoints for Offers/Flash Deals, despite a public read endpoint and a DB table | `backend/src/Controllers/SettingsController.php:90-119`, `apps/admin-pos/src/App.tsx` (DEF-17) |
| GAP-03 | Medium | Product core-field editing (name/description/category/SEO/active) has no form on the admin Product Detail page even though `PUT /api/products/{id}` exists | `apps/admin-pos/src/pages/ProductDetailPage.tsx` (DEF-16) |
| GAP-04 | Low | `bridge/` (hardware printer/scanner bridge) and `packages/shared` are both documented in the README/spec but contain no code | `bridge/README.md`, `packages/shared/src/index.ts` (ARCH-10, ARCH-11) |

## 4. Fixed since the 2026-10-09 audit (do not re-fix)

Verified directly against current code in this session — these are **no longer bugs**:

- **Fake `KB-XXXXXX` order ID generator removed.** `CheckoutModal.jsx` no longer
  catches a failed request and fabricates a success screen; it now shows a real
  `submissionError` banner on failure (was DEF-02).
- **`cartData` prop now passed correctly** from `Home.jsx`, `Shop.jsx`,
  `ProductDetails.jsx`, and `PolicyPage.jsx` into `<CheckoutModal>` (was DEF-03).
- **Guest checkout now requires sign-in** — `CheckoutModal.jsx` shows a "Sign In
  Required" screen instead of placing an order with no customer record (was
  part of DEF-05's guest-checkout bypass).
- **Cart coupon validation now calls the real backend** (`POST /api/coupons/validate`
  in `CartDrawer.jsx`) instead of hardcoding `COMBO20`/`SAVE20`/`WELCOME10`/`FIRST10`
  client-side (was DEF-11).
- **Customer order history and detail pages now exist and are routed**
  (`/orders`, `/orders/:id` in `apps/storefront/src/App.jsx`, backed by
  `customer/Orders.jsx` calling `GET /api/customers/orders` and
  `customer/OrderDetail.jsx`) — the 2026-10-09 audit found zero such routes (was
  DEF-04/DEF-06 in the "customer journey" sense — the backend endpoints always
  existed, only the frontend was missing).
- **Profile page "My Orders"/"Addresses" tiles link to real routes**, not `/` (was
  DEF-37).
- **Backend default port fallback changed to 8080** in `apps/storefront/src/lib/api.js`,
  matching `apps/admin-pos` and `start-backend.bat` (was part of DEF-09/ARCH-04's
  port-inconsistency chain — not fully re-verified across every doc, but the two
  frontend clients now agree).

## 5. New / still-current critical findings

| ID | Severity | Title | Evidence | Impact |
|---|---|---|---|---|
| **BUG-01** | **Critical (new)** | Storefront checkout posts to a route that does not exist, and in a shape the real route wouldn't accept either | `apps/storefront/src/components/CheckoutModal.jsx:140` calls `api.post('/orders', orderPayload)`. The router only registers `POST /api/orders/checkout` (`backend/public/index.php:258`) — there is no `POST /api/orders` handler, only `GET /api/orders` (listing, index.php:259). The request 404s before any backend logic runs. Separately, even pointed at the correct URL, `orderPayload` sends flat fields (`shipping_address`, `city`, `state`, `pincode`) with no `address` key, while `OrderController::checkout()` reads `$body['address'] ?? []` (`OrderController.php:56`) and `OrderService::checkout()` requires `address['line1']`/`address['city_district']` (`OrderService.php:58-65`) — neither of which the current payload provides under any key `OrderService` looks for. | **Every single checkout attempt fails.** This is the same end-user impact as the audit's original DEF-01 ("100% of checkout requests fail"), just caused by a different, more recent bug — the 404 now happens before the field-mismatch would even matter. Fixing requires both: (a) point the frontend at `/orders/checkout`, and (b) nest the address fields as `{ address: { line1, city_district, state, pincode, name, phone } }` to match what the backend actually reads. |
| DEF-06 / DB-01 | **Critical (carried forward, re-verified still true)** | Seeded product variants have zero `inventory` rows | `database/seed/0002_products_seed.sql` seeds 18 variants into `product_variants`; no seed file inserts matching rows into `inventory` (re-checked: no `INSERT INTO inventory` in any seed or migration file). `OrderService.php` falls back `available ?? '0'` and rejects checkout with "Only 0 left in stock." | Checkout is blocked for every seeded product even once BUG-01 is fixed, unless a real inventory seed is added (`database/seed/0004_inventory_seed.sql`, not created in this branch — this phase is report-only per Phase 2's scope) |
| DEF-10 | **High (carried forward)** | Payment confirmation requires no transaction ID/webhook signature — any customer can mark their own order PAID | `backend/src/Controllers/OrderController.php:101-119`, `OrderService.php:205-258` | A customer with a valid JWT can self-confirm payment on any of their own pending orders with no money changing hands. This is the exact gap the Razorpay scaffolding (Phase 8, placeholders only, not wired) will eventually need to close for real. |
| DEF-19 / ARCH-05 | **High (carried forward)** | OTP codes stored in plaintext | `backend/src/Services/OtpService.php:41-52` inserts the raw 6-digit code into `otp_verifications.otp_hash` with no hashing | DB read access exposes every active OTP, enabling account takeover |
| **AUTH-GAP-01** | **High (new)** | Admin-pos has no per-route role/permission guard — only "is logged in" | `apps/admin-pos/src/App.tsx:39-55` (`ProtectedLayout`) checks only `if (!user) return <Navigate to="/login">`. The sidebar (`Layout.tsx`) correctly hides nav links a role can't use (`hasPermission(item.permission)` checks throughout), but that's cosmetic — nothing stops a signed-in CASHIER from typing `/users`, `/finance`, or `/settings/company` directly into the address bar and having `UsersPage`/`FinancePage`/`SettingsSetupPage` render. The page shell and any data it fetches before the backend's own `PermissionMiddleware::require()` check rejects the request are both exposed client-side first. | Combined with DEF-14 (`CustomerAuthController::indexForStaff`/`createForStaff`/`updateForStaff` missing `PermissionMiddleware::require()` entirely — carried forward, re-check needed before fixing), a lower-privileged staff account can reach admin screens the nav deliberately hides from them. |
| DEF-14 | High (carried forward, not re-verified this session) | Staff customer endpoints (`indexForStaff`, `createForStaff`, `updateForStaff`) call `JwtAuthMiddleware::authenticate()` but skip `PermissionMiddleware::require()` | `backend/src/Controllers/CustomerAuthController.php:461-554` | Any authenticated staff JWT (any role) can view/create/edit all customer PII and switch price tiers to Wholesale |
| DEF-07 / DB-02 | Critical (carried forward, not re-verified — outside this flow) | `ReturnsController::storePurchaseReturn` inserts `NULL` into a `NOT NULL` FK | `backend/src/Controllers/ReturnsController.php:256`, `database/migrations/0012_purchases.sql:85` | Supplier returns crash with a 500 — not part of the chosen flow, listed for completeness |

### Missing validation / error / loading / empty states (carried forward from the 2026-10-09 audit, re-verification not needed — these are UI completeness gaps, not logic that recently changed)
- No stock-availability check when adding to cart (`CartService::addItem`, DEF-36) — can add more than `inventory.available`.
- Hardcoded price/MRP fallbacks (`|| 299`, `Math.round(retailPrice * 1.8)`) on the product details page mask missing/zero prices instead of showing an empty/error state (DEF-38).
- Home page imports `fetchHomeSections()` but never calls it — admin-curated homepage ordering has no effect (DEF-42).

### Order/payment status handling gaps
- Carts are never marked `CONVERTED` nor cleared server-side after a successful order; only the in-memory cart state is cleared client-side (DEF-08/DB-03). Re-verify once BUG-01 is fixed — it's possible this was addressed in the same rewrite that fixed DEF-02/03, but `CartService::mergeSessionCart`/`OrderService::checkout` were not touched in this session's checks.
- `OrderService::updateStatus` → `InvoiceService::createFromOrder` runs without a wrapping transaction (DEF-23/DB-06); a mid-write failure can leave an invoice header with no line items.

### Race conditions
- **SUSP-01 (carried forward, unverified — needs a concurrency test, not a code read):** whether `OrderService::checkout`'s `SELECT ... FOR UPDATE` stock reservation correctly rejects a second concurrent buyer of the last unit, or deadlocks. Recommended verification steps are in `docs/audit/05-report.md` §4.
- `CartService::mergeSessionCart` (guest→customer cart merge on login) runs its multi-row `INSERT ... ON DUPLICATE KEY UPDATE` loop with no transaction (DEF-08) — a retried request after a dropped connection double-adds quantities.

### Security issues
- Plaintext OTP storage (DEF-19, above).
- Missing `PermissionMiddleware::require()` on staff customer endpoints (DEF-14, above).
- No frontend route-level role guard in admin-pos (AUTH-GAP-01, above).
- 125 SELECT queries across 30 controllers/95 services omit `deleted_at IS NULL` on soft-deletable tables (DEF-22/DB-05) — e.g. a soft-deleted customer can still authenticate.

---

## 6. Summary for this phase

This is a **report-only** phase — nothing above was fixed here except the DB-schema
items in `docs/DB_ANALYSIS.md` (indexes/FKs, unrelated to this flow's bugs). The one
actionable takeaway for whoever picks up BUG-01: it is the single highest-leverage
fix in the entire system right now, because every other customer-journey item (order
history, coupons, order confirmation UI, guest-checkout gating) downstream of it is
already fixed and just waiting for checkout itself to reach the backend.
