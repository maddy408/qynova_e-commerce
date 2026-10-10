# Phase 5 Audit Report: Synthesis, Master Defects & Action Plan

**Date:** 2026-10-09  
**Auditor:** Antigravity (Advanced Agentic AI Assistant)  
**Project:** `qynova_e-commerce` (`unified_pos`)  
**Scope:** Phase 5 of 5 — Comprehensive Synthesis, End-to-End Matrix, Master Findings, Fix Plan & Testing Strategy.

---

## Safety & Repository Status Verification

In accordance with mandatory audit safety protocols:
- **Git Status:** Executed `git status`. Uncommitted changes were identified in 12 working tree files:
  - `apps/storefront/src/components/ProductCard.jsx`
  - `apps/storefront/src/components/ReferralModal.jsx`
  - `apps/storefront/src/pages/Home.jsx`
  - `apps/storefront/src/pages/ProductDetails.jsx`
  - `apps/storefront/src/pages/Shop.jsx`
  - `backend/src/Controllers/CategoryController.php`
  - `backend/src/Controllers/ProductController.php`
  - `backend/src/Controllers/SubcategoryController.php`
  - `backend/src/Services/CategoryService.php`
  - `backend/src/Services/ProductService.php`
  - `backend/src/Services/ReferralService.php`
  - `backend/src/Services/SubcategoryService.php`
  *All 12 files were left untouched. No git checkout, stash, commit, reset, merge, or push was performed.*
- **System Modifications:** No database migrations, SQL modifications, package installations, or environment variables were changed.
- **Privacy & Secrets:** No credentials, tokens, passwords, or customer PII were exposed.
- **Evidence Standard:** All statements are grounded in direct file and line inspection from Phases 1 through 4 and categorized as **VERIFIED**, **SUSPECTED**, or **ASSUMPTION**.

---

## 1. Executive Summary: Top 10 Customer Journey Blockers

The following 10 critical issues directly block the end-to-end customer purchasing lifecycle:

1. **Seeded variants have zero inventory records in MySQL**, causing checkout stock validation to abort with `"Only 0 left in stock"` for all catalog products.
2. **Address field naming mismatch (`address_line_1`/`city` vs `line1`/`city_district`)** causes backend checkout validation to fail 100% of the time.
3. **The checkout modal intercepts API failures and generates a fake `KB-XXXXXX` order ID**, displaying an "Order Confirmed!" popup while storing nothing in the database.
4. **`Home.jsx` and `Shop.jsx` mount `<CheckoutModal>` without passing `cartData`**, supplying empty items `[]` and instantly triggering the fake random order generator.
5. **Guest checkout completely bypasses the backend API**, fabricating a fake order on the client without creating records in `orders` or `order_items`.
6. **The storefront completely lacks a customer order experience**, providing zero routes or pages for Order History, Order Details, Invoices, Delivery Tracking, or Cancellations.
7. **The storefront product details page lacks variant selection controls**, preventing customers from selecting or buying non-default sizes, colors, or packs.
8. **Default backend port inconsistency (8080 in startup scripts & Admin-POS vs 8000 in Storefront fallback & README)** breaks Storefront-to-Backend API connectivity out-of-the-box.
9. **Cart Drawer hardcodes client-side fake coupons (`COMBO20`, `SAVE20`, etc.)**, ignoring real database coupons and causing checkout discount calculations to fail.
10. **Completed checkouts never convert or clear carts in MySQL (`carts.status = 'CONVERTED'`)**, leaving purchased items permanently in the customer's cart across sessions.

---

## 2. End-to-End System Matrix

Below is the verified end-to-end connectivity matrix across all major customer and administrative features.

| Business Feature | Admin Page | API Endpoint | PHP Controller / Service | MySQL Tables | Customer Page | Status | Verified By |
|---|---|---|---|---|---|---|---|
| **Catalog: Categories** | `apps/admin-pos/src/pages/CategoriesPage.tsx` | `GET /api/categories`<br>`POST /api/categories`<br>`PUT /api/categories/{id}` | `CategoryController::index`, `store`, `update`<br>`CategoryService::list`, `create`, `update` | `categories` | `apps/storefront/src/pages/Home.jsx`<br>`apps/storefront/src/pages/Shop.jsx`<br>`apps/storefront/src/components/Navbar.jsx` | **VERIFIED** | Code inspection |
| **Catalog: Subcategories** | `apps/admin-pos/src/pages/SubcategoriesPage.tsx` | `GET /api/subcategories`<br>`POST /api/subcategories`<br>`PUT /api/subcategories/{id}` | `SubcategoryController::index`, `store`, `update`<br>`SubcategoryService::list`, `create`, `update` | `subcategories`<br>`category_subcategory` | `apps/storefront/src/pages/Shop.jsx` | **VERIFIED** | Code inspection |
| **Catalog: Brands** | `apps/admin-pos/src/pages/BrandsPage.tsx` | `GET /api/brands`<br>`POST /api/brands`<br>`PUT /api/brands/{id}` | `MasterDataController::indexBrands`, `storeBrand`, `updateBrand` | `brands`<br>`brand_categories` | `apps/storefront/src/pages/Shop.jsx`<br>`apps/storefront/src/components/ProductCard.jsx` | **VERIFIED** | Code inspection |
| **Catalog: Product Listing & Search** | `apps/admin-pos/src/pages/ProductsPage.tsx` | `GET /api/products` | `ProductController::index`<br>`ProductService::list` | `products`<br>`brands`<br>`product_images`<br>`product_variants`<br>`inventory` | `apps/storefront/src/pages/Shop.jsx`<br>`apps/storefront/src/pages/Home.jsx`<br>`apps/storefront/src/components/Navbar.jsx` | **VERIFIED** | Code inspection |
| **Catalog: Product Details** | `apps/admin-pos/src/pages/ProductDetailPage.tsx` | `GET /api/products/{id}` | `ProductController::show`<br>`ProductService::find` | `products`<br>`product_images`<br>`product_specifications`<br>`product_variants`<br>`product_variant_values` | `apps/storefront/src/pages/ProductDetails.jsx` | **VERIFIED** | Code inspection |
| **Catalog: Variant Selection** | `apps/admin-pos/src/pages/ProductDetailPage.tsx` | `GET /api/products/{id}`<br>`POST /api/products/{id}/variants` | `VariantController::store`<br>`VariantService::createVariant` | `product_variants`<br>`product_variant_values`<br>`variant_images` | `apps/storefront/src/pages/ProductDetails.jsx` *(Selector UI missing; hardcodes default)* | **PARTIALLY CONNECTED** | Code inspection |
| **Catalog: Product Core Editing** | `apps/admin-pos/src/pages/ProductDetailPage.tsx` *(UI controls missing)* | `PUT /api/products/{id}` | `ProductController::update`<br>`ProductService::update` | `products`<br>`product_categories`<br>`product_subcategories` | N/A | **PARTIALLY CONNECTED** | Code inspection |
| **Catalog: Inventory Stock Ledger** | `apps/admin-pos/src/pages/InventoryAdjustmentsPage.tsx`<br>`InventoryBatchesPage.tsx` | `GET /api/inventory/overview`<br>`POST /api/inventory/adjustments` | `InventoryController::adjust`<br>`InventoryService::createAdjustment` | `inventory`<br>`inventory_movements`<br>`stock_adjustments`<br>`stock_adjustment_items` | `apps/storefront/src/components/ProductCard.jsx`<br>`ProductDetails.jsx` *(Blocked: seed has 0 rows)* | **BLOCKED** | Code inspection |
| **Pricing: Variant Prices & MRP** | `apps/admin-pos/src/pages/PriceAdjustmentPage.tsx`<br>`ProductDetailPage.tsx` | `PUT /api/variants/{id}`<br>`POST /api/products/price-settings` | `VariantController::update`<br>`VariantService::updateVariant`<br>`ProductController::updatePriceSettings` | `product_variants` | `apps/storefront/src/components/ProductCard.jsx`<br>`ProductDetails.jsx` | **VERIFIED** | Code inspection |
| **Pricing: Coupons & Discounts** | `apps/admin-pos/src/pages/CouponsPage.tsx` | `GET /api/coupons`<br>`POST /api/coupons`<br>`POST /api/coupons/validate` | `CouponController::index`, `store`, `validate`<br>`CouponService::create`, `validate` | `coupons`<br>`coupon_products`<br>`coupon_categories`<br>`coupon_brands`<br>`coupon_customers`<br>`coupon_usages` | `apps/storefront/src/components/CartDrawer.jsx` *(Hardcoded)*<br>`CheckoutModal.jsx` *(Dispatches coupon)* | **PARTIALLY CONNECTED** | Code inspection |
| **Pricing: Offers & Flash Deals** | *MISSING in Admin* (No admin UI or mutation endpoints) | `GET /api/offers`<br>`GET /api/offers/flash-deal` | `SettingsController::getOffers`<br>`SettingsController::getFlashDeal` | `offers` | `apps/storefront/src/pages/Home.jsx`<br>`apps/storefront/src/components/Navbar.jsx` | **PARTIALLY CONNECTED** | Code inspection |
| **Pricing: Delivery Thresholds** | `apps/admin-pos/src/pages/SettingsPage.tsx` | `GET /api/settings/delivery`<br>`PUT /api/settings/delivery` | `SettingsController::getDeliverySettings`<br>`SettingsController::updateDeliverySettings` | `delivery_settings` | `CartDrawer.jsx`<br>`CheckoutModal.jsx` *(OrderService ignores table, uses ₹50/₹500)* | **PARTIALLY CONNECTED** | Code inspection |
| **Auth: Staff RBAC & Sessions** | `apps/admin-pos/src/pages/LoginPage.tsx` | `POST /api/auth/login`<br>`GET /api/auth/me` | `AuthController::login`, `me` | `users`<br>`roles`<br>`permissions`<br>`role_permissions` | N/A | **VERIFIED** | Code inspection |
| **Auth: Customer OTP Login/Signup** | `apps/admin-pos/src/pages/CustomersPage.tsx` | `POST /api/customers/otp/request`<br>`POST /api/customers/otp/verify` | `CustomerAuthController::requestOtp`, `verifyOtp`<br>`OtpService::requestOtp`, `verifyOtp` | `customers`<br>`otp_verifications`<br>`referral_codes` | `apps/storefront/src/pages/customer/Login.jsx`<br>`apps/storefront/src/pages/customer/Register.jsx` | **VERIFIED** | Code inspection |
| **Auth: Customer Google OAuth** | N/A | `POST /api/customers/google` | `CustomerAuthController::loginWithGoogle`<br>`GoogleAuthService::verify` | `customers`<br>`referral_codes` | `apps/storefront/src/pages/customer/Login.jsx`<br>`Register.jsx` | **VERIFIED** | Code inspection |
| **Auth: Customer Addresses** | `apps/admin-pos/src/pages/CustomersPage.tsx` | `GET /api/customer/addresses`<br>`POST /api/customer/addresses` | `CustomerAuthController::getAddresses`, `addAddress` | `customer_addresses` | `apps/storefront/src/pages/customer/Profile.jsx`<br>`CheckoutModal.jsx` *(Pre-fill broken)* | **PARTIALLY CONNECTED** | Code inspection |
| **Cart: Persistent Carts (Guest/Auth)** | N/A | `GET /api/cart`<br>`POST /api/cart/items`<br>`PUT /api/cart/items/{id}`<br>`DELETE /api/cart/items/{id}` | `CartController::getCart`, `addItem`, `updateItem`, `removeItem`<br>`CartService` | `carts`<br>`cart_items`<br>`product_variants`<br>`products` | `apps/storefront/src/components/CartDrawer.jsx` | **VERIFIED** | Code inspection |
| **Cart: Login Cart Merge** | N/A | Triggered in `POST /api/customers/otp/verify` | `CustomerAuthController` -> `CartService::mergeSessionCart` | `carts`<br>`cart_items` | Automatic upon customer authentication | **VERIFIED** | Code inspection |
| **Cart: Checkout & Order Placement** | N/A | `POST /api/orders/checkout` | `OrderController::checkout`<br>`OrderService::checkout` | `orders`<br>`order_items`<br>`order_item_discounts`<br>`stock_reservations`<br>`inventory`<br>`coupon_usages` | `apps/storefront/src/components/CheckoutModal.jsx` *(Crashes & masked by fake generator)* | **BLOCKED** | Code inspection |
| **Cart: Guest Checkout Flow** | N/A | `POST /api/orders/checkout` *(Backend supports guest)* | `OrderController::checkout`<br>`OrderService::checkout` | `orders`<br>`order_items` | `apps/storefront/src/components/CheckoutModal.jsx` *(Completely skips API call for guests)* | **MISSING** | Code inspection |
| **Cart: Post-Order Cart Conversion** | N/A | `DELETE /api/cart/clear` | `OrderService::checkout` *(Never calls CartService::clear or marks CONVERTED)* | `carts` | `CheckoutModal.jsx` *(Clears React state only; DB retains items)* | **MISSING** | Code inspection |
| **Orders: Admin Management** | `apps/admin-pos/src/pages/OrdersPage.tsx`<br>`OrderDetailPage.tsx` | `GET /api/orders`<br>`GET /api/orders/{id}`<br>`PATCH /api/orders/{id}/status` | `OrderController::index`, `show`, `updateStatus`<br>`OrderService::updateStatus` | `orders`<br>`order_items`<br>`order_status_history`<br>`invoices`<br>`invoice_items` | N/A | **VERIFIED** | Code inspection |
| **Orders: Admin Delivery Dispatch** | `apps/admin-pos/src/pages/DeliveriesPage.tsx`<br>`DeliveryDetailPage.tsx` | `GET /api/deliveries`<br>`POST /api/orders/{orderId}/delivery`<br>`PUT /api/deliveries/{id}/status` | `DeliveryController`<br>`DeliveryService` | `deliveries`<br>`delivery_status_history`<br>`orders` | N/A | **VERIFIED** | Code inspection |
| **Orders: Customer Order History** | N/A | `GET /api/customers/orders`<br>`GET /api/orders/{id}` | `OrderController::myOrders`, `show` | `orders`<br>`order_items`<br>`order_status_history` | *MISSING in Storefront* (`Profile.jsx` links to `/`; no routes in `App.jsx`) | **MISSING** | Code inspection |
| **Orders: Customer Tracking & Cancel** | `apps/admin-pos/src/pages/OrderDetailPage.tsx` | `GET /api/orders/{orderId}/delivery`<br>`POST /api/orders/{id}/cancel` | `DeliveryController::showForOrder`<br>`OrderController::cancel` | `deliveries`<br>`orders`<br>`refunds`<br>`inventory` | *MISSING in Storefront* (No customer tracking/cancel UI) | **MISSING** | Code inspection |
| **Referrals: Settings & Rewards** | `apps/admin-pos/src/pages/SettingsPage.tsx` | `GET /api/referral-settings`<br>`PUT /api/referral-settings` | `ReferralController`<br>`ReferralService` | `referral_settings` | `apps/storefront/src/components/ReferralModal.jsx` | **VERIFIED** | Code inspection |
| **Referrals: Sharing & Applying** | `apps/admin-pos/src/pages/CustomersPage.tsx` | `POST /api/customers/referral/apply`<br>`POST /api/referrals/validate` | `CustomerAuthController`<br>`ReferralService` | `referrals`<br>`referral_rewards`<br>`referral_codes` | `apps/storefront/src/components/ReferralModal.jsx`<br>`Register.jsx`<br>`Profile.jsx` | **VERIFIED** | Code inspection |
| **Content: Banners (Hero & Promo)** | `apps/admin-pos/src/pages/BannersPage.tsx` | `GET /api/banners`<br>`POST /api/banners`<br>`PUT /api/banners/{id}`<br>`DELETE /api/banners/{id}` | `BannerController`<br>`BannerService` | `banners`<br>`banner_items` | `apps/storefront/src/pages/Home.jsx`<br>`PromotionalBannerCarousel.jsx`<br>`LowerPromotionalBanners.jsx` | **VERIFIED** | Code inspection |
| **Content: Dynamic Home Sections** | `apps/admin-pos/src/pages/HomeSectionsPage.tsx` | `GET /api/home-sections`<br>`POST /api/home-sections`<br>`PUT /api/home-sections/reorder` | `HomeSectionController`<br>`HomeSectionService` | `home_sections` | `apps/storefront/src/pages/Home.jsx` *(Imports API but never invokes; hardcoded JSX)* | **PARTIALLY CONNECTED** | Code inspection |
| **Content: CMS Pages & Store Meta** | `apps/admin-pos/src/pages/SettingsPage.tsx` | `GET /api/settings/store`<br>`GET /api/pages`<br>`GET /api/pages/{slug}` | `SettingsController::getStoreSettings`, `getPages`, `getPage` | `store_settings`<br>`pages` | `apps/storefront/src/components/Footer.jsx`<br>`Navbar.jsx`<br>`PolicyPage.jsx` | **VERIFIED** | Code inspection |

---

## 3. Confirmed Defects Master Log

All findings below have been verified directly in the codebase.

| ID | Severity | Title | Location (file::method) | Evidence | Impact | Verified or Suspected |
|---|---|---|---|---|---|---|
| **DEF-01** | **Critical** | Customer Checkout Blocked by Address Field Name Mismatch | `apps/storefront/src/components/CheckoutModal.jsx::handlePlaceOrder`<br>`backend/src/Services/OrderService.php::checkout` | `CheckoutModal.jsx:114-115` sends `{ address_line_1, city }`. `OrderService.php:58-62` requires `line1` and `city_district`, throwing `RuntimeException: Address field 'line1' is required`. | 100% of customer checkout requests crash with HTTP 422/500 error. | **VERIFIED** |
| **DEF-02** | **Critical** | Fake Random Order Generator (`KB-XXXXXX`) Masks Order Creation Failures | `apps/storefront/src/components/CheckoutModal.jsx::handlePlaceOrder` | `CheckoutModal.jsx:122-138` catches backend checkout failure with `.catch(() => null)` and generates client-side random string `KB-` + `Math.floor(100000 + Math.random() * 900000)`. | Customers believe an order was placed, but no record is written to MySQL. Revenue and orders are permanently lost. | **VERIFIED** |
| **DEF-03** | **Critical** | Missing `cartData` Prop on Home and Shop Triggers Instant Fake Order Fallback | `apps/storefront/src/pages/Home.jsx:548`<br>`apps/storefront/src/pages/Shop.jsx:564` | Both pages render `<CheckoutModal isOpen={isCheckoutOpen} onClose={...} />` omitting `cartData`. Line 106 evaluates `items = cartData?.items || []` to `[]`. | Checkout instantly skips the API call and triggers the fake random order generator even for authenticated customers. | **VERIFIED** |
| **DEF-04** | **Critical** | Complete Absence of Customer Order Journey in Storefront | `apps/storefront/src/App.jsx`<br>`apps/storefront/src/pages/customer/Profile.jsx:212` | `App.jsx` has zero routes for `/orders`, `/orders/:id`, `/orders/track`. `Profile.jsx:212` links "My Orders" tile to `<Link to="/">`. Backend order endpoints exist but are never called. | Customers cannot track orders, view order history, download tax invoices, or request cancellations. | **VERIFIED** |
| **DEF-05** | **Critical** | Absence of Variant Selection Controls on Product Details Page | `apps/storefront/src/pages/ProductDetails.jsx:243-245` | `ProductDetails.jsx` hardcodes `product.variants.find((v) => v.is_default) || product.variants[0]`. No UI selector (size, color, weight) exists. | Customers are blocked from viewing or purchasing any non-default variant across the entire store. | **VERIFIED** |
| **DEF-06** | **Critical** | Seeded Product Variants Have Zero Inventory Rows, Blocking Checkout | `database/seed/0002_products_seed.sql`<br>`backend/src/Services/OrderService.php:72, 471` | `0002_products_seed.sql` seeded 18 variants into `product_variants` but inserted 0 rows into `inventory`. `OrderService.php:72` checks `bccomp($qty, $available, 3) > 0` and throws `"Only 0 left in stock"`. | Even if address fields matched, checkout fails for all seeded products due to 0 inventory. | **VERIFIED** |
| **DEF-07** | **Critical** | `ReturnsController::storePurchaseReturn` Inserts `NULL` into `NOT NULL` Foreign Key `purchase_item_id` | `backend/src/Controllers/ReturnsController.php:256`<br>`database/migrations/0012_purchases.sql:85` | `ReturnsController.php:256` binds `'purchase_item_id' => null`. Migration 0012 enforces `purchase_item_id BIGINT UNSIGNED NOT NULL REFERENCES purchase_items(id)`. | Supplier purchase returns submitted from Admin POS crash with `PDOException: Integrity constraint violation: 1048`. | **VERIFIED** |
| **DEF-08** | **Critical** | Guest Cart Merge is Non-Transactional & Carts are Never Converted on Checkout | `backend/src/Services/CartService.php:156-184`<br>`backend/src/Services/OrderService.php:52-202` | `CartService::mergeSessionCart` executes multiple queries without `beginTransaction()`. Neither `OrderService::checkout` nor `OrderController` clears or marks `carts.status = 'CONVERTED'`. | Partial merges duplicate quantities on network drops; purchased items remain in the customer's cart after checkout. | **VERIFIED** |
| **DEF-09** | **Critical** | Backend Port Inconsistency Across Startup Scripts, Documentation, and Clients | `start-backend.bat:4`<br>`README.md:84`<br>`apps/admin-pos/src/lib/api.ts:12`<br>`apps/storefront/src/lib/api.js:3` | `start-backend.bat` and Admin-POS use port `8080`. `README.md` and Storefront fallback use port `8000`. | Running the backend via startup script causes Storefront API requests to fail with `ERR_CONNECTION_REFUSED`. | **VERIFIED** |
| **DEF-10** | **High** | Insecure Payment Confirmation Endpoint Allowing Free Order Mark-As-Paid | `backend/src/Controllers/OrderController.php:101-119`<br>`backend/src/Services/OrderService.php:205-258` | `POST /api/orders/{id}/confirm-payment` requires no payment transaction ID, webhook signature, or gateway payload. | Any customer possessing a valid JWT can mark any of their pending orders as `PAID` without transferring funds. | **VERIFIED** |
| **DEF-11** | **High** | Hardcoded Client-Side Coupon Bypass in Cart Drawer | `apps/storefront/src/components/CartDrawer.jsx:69-79` | `CartDrawer.jsx` hardcodes checks for `COMBO20`, `SAVE20`, `WELCOME10`, `FIRST10` and computes discount locally. Never calls `/api/coupons`. | Legitimate admin-created database coupons fail in cart drawer; fake coupons succeed locally and fail during checkout. | **VERIFIED** |
| **DEF-12** | **High** | Shipping Fee & Free Shipping Threshold Backend/Database Discrepancy | `backend/src/Services/OrderService.php:23-24, 542`<br>`backend/src/Controllers/SettingsController.php:48-66` | `OrderService.php` hardcodes `FLAT_SHIPPING = '50.00'` and `FREE_SHIPPING_ABOVE = '500.00'`. `delivery_settings` table uses ₹49 / ₹499. | Orders between ₹499 and ₹500 show free shipping in UI, but backend charges ₹50, causing order total mismatch. | **VERIFIED** |
| **DEF-13** | **High** | Saved Address Pre-Fill Broken in CheckoutModal Due to Column Name Mismatches | `apps/storefront/src/components/CheckoutModal.jsx:44-48`<br>`backend/src/Controllers/CustomerAuthController.php:606` | `CheckoutModal.jsx` expects `def.address_line_1` and `def.city`. `CustomerAuthController.php` returns `line1` and `city_district`. | Saved addresses fail to populate the checkout form; fields remain empty on load. | **VERIFIED** |
| **DEF-14** | **High** | Staff Customer Endpoints Lack Permission Verification | `backend/src/Controllers/CustomerAuthController.php:461-554` | `indexForStaff`, `createForStaff`, and `updateForStaff` call `JwtAuthMiddleware::authenticate()` but omit `PermissionMiddleware::require()`. | Any authenticated user with a customer JWT can view all customer PII, create accounts, and switch price tiers to Wholesale. | **VERIFIED** |
| **DEF-15** | **High** | Variant SKU Edit in Admin Detail Page Silently Ignored by Backend | `backend/src/Services/VariantService.php:146-150`<br>`apps/admin-pos/src/pages/ProductDetailPage.tsx:245` | `ProductDetailPage.tsx` submits `{ sku, mrp, retail_price }`. `VariantService.php` filters out `sku` from updated fields. | SKU updates saved by administrators in the UI modal are silently dropped and never persisted to MySQL. | **VERIFIED** |
| **DEF-16** | **High** | Product Detail Page Lacks Form or API Call to Edit Core Product Attributes | `apps/admin-pos/src/pages/ProductDetailPage.tsx` | `PUT /api/products/{id}` exists in backend, but `ProductDetailPage.tsx` has zero UI inputs and never calls `api.put('/products/...')`. | Administrators cannot edit product name, description, categories, brand, dimensions, SEO, or active flags after creation. | **VERIFIED** |
| **DEF-17** | **High** | Promotional Offers Feature Completely Lacks Admin UI & Mutation Endpoints | `backend/src/Controllers/SettingsController.php:90-119`<br>`apps/admin-pos/src/App.tsx` | Table `offers` has public read endpoints (`GET /api/offers`), but zero Admin UI pages and zero `POST`/`PUT`/`DELETE` API endpoints exist. | Admins cannot create, edit, activate, or schedule promotional offers or flash deals without direct SQL access. | **VERIFIED** |
| **DEF-18** | **High** | Storefront Environment Example Mismatch (`NEXT_PUBLIC_` vs `VITE_`) | `apps/storefront/.env.example:1`<br>`apps/storefront/src/lib/api.js:3` | `.env.example` defines `NEXT_PUBLIC_API_BASE_URL`. `api.js` reads `import.meta.env.VITE_API_BASE_URL`. | Any setup derived from `.env.example` ignores configured API URL and falls back to port 8000. | **VERIFIED** |
| **DEF-19** | **High** | Plaintext OTP Storage in Database | `backend/src/Services/OtpService.php:41-52` | Raw 6-digit OTP string is inserted into `otp_verifications.otp_hash` without hashing (`password_hash` or SHA-256). | Database read compromise exposes valid OTP codes, allowing unauthorized customer account takeover. | **VERIFIED** |
| **DEF-20** | **High** | Duplicate Migration Numbering Across 7 Pairs of SQL Files | `database/migrations/` | 14 migration files share 7 duplicate prefix numbers (`0019_*` through `0025_*`). Runner sorts files alphabetically. | Fragile migration execution order; renaming any migration file alters application order on new environments. | **VERIFIED** |
| **DEF-21** | **High** | Dual Disjoint Inventory Ledgers & Direct Unlogged Return Adjustments | `database/migrations/0007_inventory.sql`<br>`0024_inventory_batches.sql`<br>`backend/src/Controllers/ReturnsController.php:135` | Migration 0007 created `inventory_movements` with append-only triggers. Migration 0024 created `inventory_transactions`. `ReturnsController` updates `inventory.on_hand` directly without writing to either. | Inventory audit trail is fractured; returns bypass stock movement triggers and corrupt ledger balances. | **VERIFIED** |
| **DEF-22** | **High** | 125 SELECT Queries Omit `deleted_at IS NULL` on Soft-Deletable Entities | Across 30 Controllers and 95 Services (`CustomerAuthController.php:159`, `CollectionController.php:27`, `CartService.php:35`) | 125 queries omit `deleted_at IS NULL`. For example, customer login checks phone without verifying `deleted_at IS NULL`; collections queries deleted invoices. | Soft-deleted customers can authenticate; cashiers can collect payments against deleted invoices; deleted variants appear in carts. | **VERIFIED** |
| **DEF-23** | **High** | Missing Database Transactions in Multi-Step Mutations | `backend/src/Services/OrderService.php:370-384`<br>`backend/src/Services/InvoiceService.php:32-85`<br>`backend/src/Services/BatchService.php:256` | `OrderService::updateStatus` updates order, writes status history, and invokes invoice generation across multiple queries without a transaction. `InvoiceService::createFromOrder` has no transaction. | Incomplete writes during network drops; corrupted invoice items; orphaned records. | **VERIFIED** |
| **DEF-24** | **Medium** | Storefront Architecture Uses Vite SPA Instead of Documented Next.js SSR | `apps/storefront/package.json`<br>`docs/DOCUMENTATION.md` Section 2 | Built with Vite 6 + React 19 SPA. Orphan `next-env.d.ts` exists. | Storefront lacks SSR/SSG required by specification for search engine optimization (SEO). | **VERIFIED** |
| **DEF-25** | **Medium** | Missing `.env` File in Admin-POS Application | `apps/admin-pos` | Workspace inspection confirmed absence of `apps/admin-pos/.env`. Only `.env.example` exists. | Frontend falls back to hardcoded `localhost:8080`. Fails silently if backend runs on a different port. | **VERIFIED** |
| **DEF-26** | **Medium** | Duplicate Purchase Return Implementations | `backend/src/Controllers/ReturnsController.php:186`<br>`backend/src/Services/PurchaseService.php:292` | `PurchaseService::createReturn` enforces over-return checks and updates purchase items. `ReturnsController` bypasses service and inserts ad-hoc adjustments. Admin UI calls `ReturnsController`. | Bypasses over-return protection and causes divergent data models. | **VERIFIED** |
| **DEF-27** | **Medium** | Pricing Column Naming Discrepancy on Product Variants | `database/migrations/0027_customer_pricing_and_batches.sql:14`<br>`backend/database/migrate_hold_bills.php:32` | `0027` defines `normal_price DECIMAL(15,2)`, while `migrate_hold_bills.php` defines `customer_price DECIMAL(12,3)`. | Potential column reference errors or inconsistent pricing values across POS billing and customer price lists. | **VERIFIED** |
| **DEF-28** | **Medium** | Duplicate Columns in `purchases` (`amount_paid` vs `paid_amount`) | `database/migrations/0012_purchases.sql:45`<br>`database/migrations/0022_purchase_payment_update.sql:12` | Migration 0012 created `amount_paid`. Migration 0022 added `paid_amount` and `balance_amount` without dropping `amount_paid`. | Divergent payment tracking totals depending on which column is queried by services. | **VERIFIED** |
| **DEF-29** | **Medium** | Missing Foreign Keys & Unindexed Foreign Keys in Newer Migrations | `database/migrations/0024_inventory_batches.sql`<br>`database/migrations/0027_customer_pricing_and_batches.sql` | `inventory_batches.supplier_id` (INT UNSIGNED, unindexed, no FK). `inventory_batches.purchase_id` (unindexed, no FK). `invoice_items.batch_id` (unindexed, no FK). `offers.banner_id` (unindexed, no FK). | Orphaned records when parent entities are deleted; degraded JOIN performance on batch and offer queries. | **VERIFIED** |
| **DEF-30** | **Medium** | Table Naming & Cardinality Inconsistencies (`wishlist` Singular; No Variant Scoping) | `database/migrations/0024_storefront_database_source_of_truth.sql:52-63` | Table is named `wishlist` (singular) while all other tables are plural. References `product_id` directly without variant granularity. | Naming inconsistency; customers cannot favorite specific product variants. | **VERIFIED** |
| **DEF-31** | **Medium** | Image URL Helper Prepends Backend Origin Unconditionally, Breaking Seeded Absolute URLs | `apps/admin-pos/src/pages/ProductsPage.tsx:9-11`<br>`apps/admin-pos/src/pages/BannersPage.tsx:8-10`<br>`apps/admin-pos/src/pages/CategoriesPage.tsx:9-11` | `imageUrl(path) => `${API_ORIGIN}/${path}`` without checking if `path` begins with `http://` or `https://`. Seed data uses Unsplash URLs. | Produces malformed URLs like `http://localhost:8080/https://images.unsplash.com/...`, breaking image previews. | **VERIFIED** |
| **DEF-32** | **Medium** | Product Creation Orchestrates 5 to 10 Client-Side HTTP Calls Without Distributed Rollback | `apps/admin-pos/src/pages/ProductCreatePage.tsx:427-558` | Sequentially dispatches `POST /products`, multiple `POST /variants`, multiple `POST /inventory/adjustments`, images, and specs. | Network failure midway commits base product and previous variants, leaving orphaned unpriced/unstocked records. | **VERIFIED** |
| **DEF-33** | **Medium** | Multi-Step Mutations Omit Database Transactions in Catalog | `backend/src/Services/ProductService.php:266-345`<br>`backend/src/Controllers/ProductController.php:148-177`<br>`backend/src/Services/SubcategoryService.php:132-165` | `create()` performs `INSERT INTO products` followed by category/subcategory inserts with no transaction. `updatePriceSettings` runs batch updates in a non-transactional loop. | Partial database writes on failures; inconsistent category mappings and orphaned records. | **VERIFIED** |
| **DEF-34** | **Medium** | Severe N+1 Query Loops in Admin Master Listings | `backend/src/Services/SubcategoryService.php:56-59`<br>`backend/src/Controllers/MasterDataController.php:32-41`<br>`backend/src/Services/BannerService.php:58-62` | `SELECT category_id FROM category_subcategory` executed per subcategory; `SELECT c.id FROM brand_categories` executed per brand. | Linear database query degradation as catalog data expands. | **VERIFIED** |
| **DEF-35** | **Medium** | Hardcoded `LIMIT 200` Without Pagination Parameters in Orders, Customers, Adjustments | `backend/src/Services/OrderService.php:422`<br>`backend/src/Controllers/CustomerAuthController.php:488`<br>`backend/src/Services/InventoryService.php:269` | Queries append `LIMIT 200` with no `LIMIT :limit OFFSET :offset` logic or `page` calculation. | Records beyond 200 become completely invisible in the admin dashboard. | **VERIFIED** |
| **DEF-36** | **Medium** | Cart Additions Lack Stock Availability Validation | `backend/src/Services/CartService.php:112-116` | `CartService::addItem` executes `INSERT INTO cart_items ... ON DUPLICATE KEY UPDATE quantity = quantity + :quantity2` without checking `inventory.available`. | Customers can add quantities exceeding physical on-hand inventory to their cart. | **VERIFIED** |
| **DEF-37** | **Medium** | Disconnected Navigation Tiles on Customer Profile Page | `apps/storefront/src/pages/customer/Profile.jsx:212-244` | Links "My Orders", "Wishlist", and "Addresses" tiles to `<Link to="/">`. | Customers clicking account tiles are unexpectedly redirected to the homepage. | **VERIFIED** |
| **DEF-38** | **Medium** | Hardcoded Price and MRP Fallbacks in Product Details Page | `apps/storefront/src/pages/ProductDetails.jsx:248-249` | Uses fallback `|| 299` and `Math.round(retailPrice * 1.8)`. | Products with price 0 or missing variants display fabricated ₹299 retail price and ₹538 MRP. | **VERIFIED** |
| **DEF-39** | **Low** | Inactive Placeholder Shared Monorepo Package | `packages/shared/src/index.ts:1` | Contains only `export const SHARED_PACKAGE_PLACEHOLDER = true;`. Not imported by either app. | Monorepo structure provides no shared types or client code; API client is duplicated. | **VERIFIED** |
| **DEF-40** | **Low** | Empty Hardware Bridge Directory | `bridge/README.md:1-15` | Documents Phase 6+ thermal printer/scanner bridge. No executable code exists. | Hardware printing/scanning over LAN bridge is unavailable. | **VERIFIED** |
| **DEF-41** | **Low** | Coupons UI Lacks Start and End Date Inputs; Price Adjustment Lacks MRP Input | `apps/admin-pos/src/pages/CouponsPage.tsx`<br>`apps/admin-pos/src/pages/PriceAdjustmentPage.tsx` | Schema columns `coupons.start_at` and `coupons.end_at` exist in DB, but `CouponsPage.tsx` has no date pickers. MRP is read-only in PriceAdjustmentPage. | Inability to schedule coupons with date windows; inability to modify MRP in batch adjustments. | **VERIFIED** |
| **DEF-42** | **Low** | Dynamic Home Sections API Unused by Home Page | `apps/storefront/src/pages/Home.jsx:8, 96-106`<br>`backend/src/Controllers/HomeSectionController.php` | `Home.jsx` imports `fetchHomeSections()` but never calls it; sections are hardcoded in JSX. | Dynamic home section reordering configured in admin has zero effect on the storefront. | **VERIFIED** |
| **DEF-43** | **Low** | Selected Payment Method Not Passed in Checkout API Payload | `apps/storefront/src/components/CheckoutModal.jsx:104-120` | `CheckoutModal.jsx` gathers `formData.paymentMethod` but omits it from `orderPayload`. | Backend receives no record of customer's chosen payment method (COD vs UPI vs Card). | **VERIFIED** |

---

## 4. Suspected Issues Requiring Further Verification

The following issues were identified during architectural tracing and require specific runtime or load testing to confirm:

| ID | Title | Suspected Impact | How to Verify |
|---|---|---|---|
| **SUSP-01** | **Race Conditions Under Concurrent Checkout Stock Reservation** | If multiple customers checkout the last unit of a variant simultaneously, does `OrderService::checkout` (`SELECT ... FOR UPDATE`) properly block and reject the second customer, or cause a deadlock? | Execute a concurrency test script (e.g. 5 parallel `curl` requests) attempting to checkout variant ID 1 when `inventory.available = 1`. Verify only 1 order succeeds with status `PENDING` and 4 return HTTP 422 `"Insufficient stock"`. |
| **SUSP-02** | **Memory Exhaustion on Large Image WebP Conversion** | `ImageUploadService.php` loads uncompressed images into memory with `imagecreatefromjpeg`/`imagecreatefrompng`. A 5MB high-resolution camera image (e.g. 6000x4000) may exceed PHP's default `memory_limit = 128M`. | Upload a 4.9MB, 24-megapixel JPEG image via `POST /api/categories/{id}/image` under default `php.ini` memory limits and observe whether HTTP 500 fatal memory exhaustion occurs. |
| **SUSP-03** | **Google OAuth Token Validation Failure Under Clock Skew** | `GoogleAuthService.php` validates JWT expiration against `time()`. If the server clock drifts or Google token issuer has minor clock skew, token verification may throw `SignatureInvalidException` or `BeforeValidException`. | Test authentication with a live Google credential token generated on a mobile device and verify successful customer session creation. |
| **SUSP-04** | **Phone Number Normalization Inconsistencies** | Customers entering `+919876543210` vs `9876543210` vs `09876543210` may generate duplicate records in `customers` table or fail OTP matching if normalization logic differs between `OtpService.php` and `CustomerAuthController.php`. | Inspect database rows after executing OTP requests with and without `+91` prefix; verify whether regex `preg_replace('/[^0-9]/', '', $phone)` consistently strips country codes. |
| **SUSP-05** | **Corrupted Invoice Items When POS Checkout Session Drops Midway** | `InvoiceService::createPosSale` loops through cart items and inserts into `invoice_items`. If an unhandled PDO constraint fails on the 5th item, does the transaction rollback leave the inventory intact? | Trigger a synthetic database failure (e.g. invalid variant ID on item 3) during `POST /api/invoices/pos-sale` and verify whether zero rows are written to `invoices`, `invoice_items`, and `inventory_movements`. |

---

## 5. Missing Integrations & Incomplete Customer Workflows

The following complete workflows are currently missing from the application:

1. **Customer Order Journey & Tracking (End-to-End Missing in Storefront):**
   - Customer cannot view a list of their past orders.
   - Customer cannot view itemized order receipts, GST breakdowns, or download tax invoices.
   - Customer cannot inspect live courier status, tracking numbers (AWB), or dispatch timelines.
   - Customer cannot initiate self-service order cancellations or return requests.
2. **Real Payment Gateway Integration (Razorpay / PhonePe / Cashfree):**
   - System currently contains only a mock payment confirmation endpoint (`POST /api/orders/{id}/confirm-payment`).
   - No payment gateway SDK or redirect flow is implemented.
   - No webhook listeners exist to verify payment signatures or capture asynchronous payment success/failure events.
   - No idempotency keys exist to prevent double billing.
3. **Automated Transactional Notifications (SMS / WhatsApp / Email):**
   - `OtpService.php` generates OTP codes but does not transmit SMS (only logs or returns codes in response).
   - No notification dispatch exists for order placement, shipment tracking, or delivery confirmation.
4. **Third-Party Logistics / Courier API Integration:**
   - Table `deliveries` stores `courier` and `awb`, but tracking status changes must be entered manually by administrators in the admin panel.
   - No API webhook exists from providers like Shiprocket, Delhivery, or BlueDart to automatically transition delivery status from `IN_TRANSIT` to `OUT_FOR_DELIVERY` and `DELIVERED`.
5. **Administrative Interface for Promotional Offers & Flash Deals:**
   - Database table `offers` and public storefront endpoints (`/api/offers`) exist, but administrators have no management interface in `apps/admin-pos` to create banners, schedule flash sales, or configure countdown timers.

---

## 6. Prioritized Fix Plan

### P0: Critical Journey Blockers (Must Fix First)

| Priority | Task Description | Files Affected | Effort Estimate | Risk to Other Features | Dependencies |
|---|---|---|---|---|---|
| **P0-1** | **Align Checkout Address Field Names:** Update `CheckoutModal.jsx` to submit `line1` and `city_district` matching `OrderService.php` validation rules. | `apps/storefront/src/components/CheckoutModal.jsx`<br>`backend/src/Services/OrderService.php` | 1 hour | Low. Only impacts checkout payload. | None |
| **P0-2** | **Remove Fake Order ID Generator & Expose Real API Errors:** Remove random string generator `KB-XXXXXX` from `CheckoutModal.jsx`. Display real backend validation errors in the modal UI. | `apps/storefront/src/components/CheckoutModal.jsx` | 1.5 hours | Low. Prevents deceptive success states. | P0-1 |
| **P0-3** | **Pass `cartData` Prop to CheckoutModal:** Update `Home.jsx` and `Shop.jsx` to pass `cartData={cartData}` to `<CheckoutModal>`. | `apps/storefront/src/pages/Home.jsx`<br>`apps/storefront/src/pages/Shop.jsx` | 30 minutes | Low. Supplies items array to checkout. | None |
| **P0-4** | **Seed Initial Inventory Stock for All Product Variants:** Create a database seed/migration script to insert rows into `inventory` for all existing `product_variants` with positive `on_hand` and `available` balances. | `database/seed/0004_inventory_seed.sql` (new) | 1 hour | Low. Resolves checkout `"Only 0 left in stock"` exception. | None |
| **P0-5** | **Implement Variant Selector Controls on Product Details Page:** Add attribute pills/dropdowns (e.g. Size, Color) to `ProductDetails.jsx`. Bind selected variant ID and price to Add to Cart action. | `apps/storefront/src/pages/ProductDetails.jsx` | 3 hours | Medium. Modifies product details pricing and cart addition logic. | None |
| **P0-6** | **Build Storefront Customer Order Experience:** Create `/orders` (history list), `/orders/:id` (order details & timeline), and `/orders/:id/track` pages. Register routes in `App.jsx` and link in `Navbar.jsx` and `Profile.jsx`. | `apps/storefront/src/App.jsx`<br>`apps/storefront/src/pages/customer/Orders.jsx` (new)<br>`apps/storefront/src/pages/customer/OrderDetail.jsx` (new)<br>`apps/storefront/src/pages/customer/Profile.jsx` | 5 hours | Low. Adds missing customer views. | P0-1 |
| **P0-7** | **Standardize Backend Port & Environment Configurations:** Set default port to 8080 across `start-backend.bat`, `apps/storefront/src/lib/api.js`, `apps/storefront/.env.example`, and `apps/admin-pos/.env.example`. | `apps/storefront/src/lib/api.js`<br>`apps/storefront/.env.example`<br>`apps/admin-pos/.env.example`<br>`README.md` | 1 hour | Low. Prevents environment setup discrepancies. | None |
| **P0-8** | **Convert and Clear Cart in MySQL upon Successful Order:** Update `OrderService::checkout` to call `CartService::clear` or set `carts.status = 'CONVERTED'` upon committing order. | `backend/src/Services/OrderService.php`<br>`backend/src/Services/CartService.php` | 1 hour | Medium. Affects cart state persistence. | P0-1 |

---

### P1: High Integrity, Security & Admin Workflows

| Priority | Task Description | Files Affected | Effort Estimate | Risk to Other Features | Dependencies |
|---|---|---|---|---|---|
| **P1-1** | **Secure Payment Confirmation & Capture Payment Method:** Update `CheckoutModal.jsx` to include `payment_method` in checkout payload. Add backend authorization and transaction reference requirement to `OrderController::confirmPayment`. | `apps/storefront/src/components/CheckoutModal.jsx`<br>`backend/src/Controllers/OrderController.php`<br>`backend/src/Services/OrderService.php` | 2 hours | Medium. Changes order payment verification. | P0-1 |
| **P1-2** | **Integrate Dynamic Coupon Validation in Cart Drawer:** Replace hardcoded coupon codes in `CartDrawer.jsx` with calls to `POST /api/coupons/validate`. Display server-calculated discount amounts. | `apps/storefront/src/components/CartDrawer.jsx` | 2.5 hours | Medium. Modifies cart discount display. | None |
| **P1-3** | **Synchronize Delivery Fee and Free Shipping Thresholds:** Refactor `OrderService.php` to fetch shipping fee and free threshold dynamically from `delivery_settings` table instead of hardcoded constants. | `backend/src/Services/OrderService.php` | 1.5 hours | Medium. Changes checkout totals computation. | None |
| **P1-4** | **Fix Pre-Fill of Saved Addresses in CheckoutModal:** Update `CheckoutModal.jsx` address loader to read `def.line1` and `def.city_district` returned by `CustomerAuthController::getAddresses`. | `apps/storefront/src/components/CheckoutModal.jsx` | 1 hour | Low. Fixes address pre-fill. | P0-1 |
| **P1-5** | **Fix Purchase Returns NULL Foreign Key:** Update `ReturnsController.php::storePurchaseReturn` to lookup and bind the valid `purchase_item_id` instead of `null`, or use `PurchaseService::createReturn`. | `backend/src/Controllers/ReturnsController.php` | 2 hours | Medium. Affects supplier purchase returns. | None |
| **P1-6** | **Enforce RBAC Permissions on Staff Customer Endpoints:** Add `PermissionMiddleware::require($claims, 'customers.manage')` to `CustomerAuthController::indexForStaff`, `createForStaff`, and `updateForStaff`. | `backend/src/Controllers/CustomerAuthController.php` | 1 hour | Low. Security fix for customer data access. | None |
| **P1-7** | **Enable Product Core Editing and SKU Updates in Admin:** Add edit form modal in `ProductDetailPage.tsx` invoking `PUT /api/products/{id}`. Update `VariantService.php::updateVariant` to accept and update `sku`. | `apps/admin-pos/src/pages/ProductDetailPage.tsx`<br>`backend/src/Services/VariantService.php` | 3.5 hours | Medium. Modifies product update logic. | None |
| **P1-8** | **Wrap Multi-Step Mutations in Database Transactions:** Add explicit `$this->pdo->beginTransaction()` and `$this->pdo->commit()` blocks to `OrderService::updateStatus`, `InvoiceService::createFromOrder`, `BatchService::consumeStock`, and `CartService::mergeSessionCart`. | `backend/src/Services/OrderService.php`<br>`backend/src/Services/InvoiceService.php`<br>`backend/src/Services/BatchService.php`<br>`backend/src/Services/CartService.php` | 3 hours | Medium. Prevents orphaned data during network aborts. | None |
| **P1-9** | **Enforce Soft-Delete Filtering Across Backend Queries:** Add `WHERE deleted_at IS NULL` to authentication queries in `CustomerAuthController.php` and collection invoice queries in `CollectionController.php`. | `backend/src/Controllers/CustomerAuthController.php`<br>`backend/src/Controllers/CollectionController.php`<br>`backend/src/Services/CartService.php` | 2.5 hours | Low. Prevents soft-deleted records from leaking. | None |
| **P1-10** | **Hash OTP Verification Codes:** Update `OtpService.php` to store `password_hash($otp, PASSWORD_BCRYPT)` in `otp_verifications.otp_hash` and verify using `password_verify()`. | `backend/src/Services/OtpService.php` | 1.5 hours | Medium. Enhances customer authentication security. | None |

---

### P2: Architectural Polish, Performance & CMS

| Priority | Task Description | Files Affected | Effort Estimate | Risk to Other Features | Dependencies |
|---|---|---|---|---|---|
| **P2-1** | **Build Admin UI for Offers and Flash Deals:** Create `OffersPage.tsx` in `apps/admin-pos` and implement `POST`/`PUT`/`DELETE /api/offers` endpoints in `SettingsController.php`. | `apps/admin-pos/src/pages/OffersPage.tsx` (new)<br>`apps/admin-pos/src/App.tsx`<br>`backend/src/Controllers/SettingsController.php` | 4 hours | Low. Provides UI for promotional offers. | None |
| **P2-2** | **Fix Admin Image URL Helper for Absolute URLs:** Update `imageUrl` helper in `ProductsPage.tsx`, `BannersPage.tsx`, and `CategoriesPage.tsx` to check `path.startsWith('http')` before prepending backend origin. | `apps/admin-pos/src/pages/ProductsPage.tsx`<br>`apps/admin-pos/src/pages/BannersPage.tsx`<br>`apps/admin-pos/src/pages/CategoriesPage.tsx` | 30 minutes | Low. Fixes broken image previews. | None |
| **P2-3** | **Eliminate N+1 Queries in Admin Master Listings:** Refactor `SubcategoryService::list` and `MasterDataController::indexBrands` to load junction table mappings via a single `JOIN` or `GROUP_CONCAT` query. | `backend/src/Services/SubcategoryService.php`<br>`backend/src/Controllers/MasterDataController.php` | 2 hours | Medium. Improves catalog page response times. | None |
| **P2-4** | **Add Offset Pagination to Admin Master Tables:** Replace hardcoded `LIMIT 200` with query parameters `page` and `limit` across `OrderService::listOrders`, `CustomerAuthController::indexForStaff`, and `InventoryService::listAdjustments`. | `backend/src/Services/OrderService.php`<br>`backend/src/Controllers/CustomerAuthController.php`<br>`backend/src/Services/InventoryService.php` | 2.5 hours | Medium. Modifies admin listing APIs. | None |
| **P2-5** | **Connect Storefront Home Page to Dynamic Home Sections API:** Update `Home.jsx` to invoke `fetchHomeSections()` and render homepage carousels dynamically in the order configured by administrators. | `apps/storefront/src/pages/Home.jsx` | 2 hours | Medium. Modifies homepage rendering structure. | None |
| **P2-6** | **Validate Stock Availability on Add to Cart:** Add stock availability validation (`inventory.available >= quantity`) in `CartService::addItem` before inserting into `cart_items`. | `backend/src/Services/CartService.php` | 1 hour | Low. Prevents adding out-of-stock items. | P0-4 |
| **P2-7** | **Consolidate Migration File Prefix Collisions:** Renumber duplicate prefixes `0019_*` through `0025_*` in `database/migrations/` sequentially (e.g. `0019` to `0034`) to ensure deterministic schema execution on clean setups. | `database/migrations/` (rename files) | 1 hour | Low. Only affects new environments. | None |

---

## 7. Comprehensive Testing Plan

The following test suites specify step-by-step verification procedures from Admin data entry through customer display, customer action, and database assertions.

### Workflow 1: Catalog Creation & Customer Browse
- **Admin Data Entry (Non-Destructive Test Data):**
  1. Login to Admin Panel at `http://localhost:5173/login`.
  2. Navigate to **Catalog > Categories**. Click **+ Add Category**. Enter Name: `Test Category Alpha`, Description: `Audit verification category`. Save.
  3. Navigate to **Catalog > Products**. Click **+ Create Product**. Enter Name: `Audit Test Product`, Category: `Test Category Alpha`, Brand: Any active brand.
  4. In Step 2 (Variants), enter SKU: `AUDIT-SKU-001`, MRP: `999.00`, Retail Price: `799.00`.
  5. In Step 3 (Stock), enter Initial Stock: `50`. Submit product creation wizard.
- **Customer Display & Action:**
  1. Open Storefront at `http://localhost:3000/`.
  2. Verify `Test Category Alpha` appears in the Category Navigation Bar and category tile list.
  3. Navigate to `http://localhost:3000/shop?category_id=<new_id>`.
  4. Verify `Audit Test Product` displays on the product grid with price `₹799.00`, MRP strikethrough `₹999.00`, and badge `"In Stock"`.
  5. Click the product card to navigate to `/product/<new_id>`.
  6. Verify product details page renders image gallery, specifications, and price without falling back to ₹299.
- **Expected Results & Database Verification:**
  - Table `products` contains 1 new active row with matching slug.
  - Table `product_variants` contains variant with `sku = 'AUDIT-SKU-001'`.
  - Table `inventory` contains record with `variant_id = <new_variant_id>`, `on_hand = 50`, `available = 50`.

---

### Workflow 2: Customer Authentication & Saved Address
- **Customer Action:**
  1. Open Storefront at `http://localhost:3000/register`.
  2. Enter Mobile Number: `9876543210`, Name: `Test User`, Email: `testuser@example.com`.
  3. Click **Send OTP**. Enter 6-digit verification code.
  4. Navigate to `http://localhost:3000/customer/profile`.
  5. In Saved Addresses, click **Add Address**. Enter Address Line 1: `123 Main Market Road`, City: `Bangalore`, State: `Karnataka`, Pincode: `560001`. Save address.
- **Expected Results & Database Verification:**
  - Table `customers` contains row with `phone = '9876543210'`, `phone_verified_at IS NOT NULL`.
  - Table `referral_codes` automatically contains an 8-character code for the new customer.
  - Table `customer_addresses` contains 1 row with `line1 = '123 Main Market Road'`, `city_district = 'Bangalore'`, `pincode = '560001'`.

---

### Workflow 3: Cart, Coupon Application & Stock Reservation
- **Admin Setup:**
  1. Navigate to **Coupons** in Admin Panel. Click **+ Add Coupon**.
  2. Enter Code: `AUDIT10`, Name: `Audit 10% Discount`, Discount Type: `PERCENT`, Discount Value: `10`, Min Order Amount: `500.00`. Save.
- **Customer Action:**
  1. On Storefront `/product/<id>`, click **Add to Cart**.
  2. Open Cart Drawer (`CartDrawer.jsx`). Verify item appears with price `₹799.00` and quantity `1`.
  3. In Coupon Code input, enter `AUDIT10`. Click **Apply**.
  4. Verify discount of `₹79.90` (10%) is subtracted from subtotal.
  5. Verify delivery fee shows `Free Delivery` (since ₹799 exceeds threshold).
- **Expected Results & Database Verification:**
  - Table `carts` contains active cart for customer.
  - Table `cart_items` contains 1 row for variant with `quantity = 1`.
  - Backend API `POST /api/coupons/validate` returns `valid: true, discount_amount: 79.90`.

---

### Workflow 4: Real Checkout & Order Persistence
- **Customer Action:**
  1. In Cart Drawer, click **Proceed to Checkout**.
  2. In `<CheckoutModal>`, verify customer address `123 Main Market Road` and `Bangalore` pre-fills into form fields.
  3. Select Payment Method: `Cash on Delivery (COD)`.
  4. Click **Place Order**.
- **Expected Results & Database Verification:**
  - Modal receives HTTP 201 response with real order number `ORD-XXXXXXXX`.
  - Modal displays Order Confirmed screen showing real order number (NOT `KB-XXXXXX`).
  - Table `orders` contains 1 new record with `order_no = 'ORD-XXXXXXXX'`, `customer_id`, `subtotal = 799.00`, `discount_total = 79.90`, `grand_total = 719.10`, `status = 'PENDING'`.
  - Table `order_items` contains line item with price snapshot and SKU snapshot.
  - Table `stock_reservations` contains record locking `quantity = 1` for variant.
  - Table `inventory` reflects `reserved = 1`, `available = 49` (`50 - 1`).
  - Table `carts` record is marked `status = 'CONVERTED'` or cart items are emptied.

---

### Workflow 5: Admin Order Processing, Dispatch & Invoice Generation
- **Admin Action:**
  1. In Admin Panel, open **Orders**. Verify order `ORD-XXXXXXXX` appears with status `PENDING`.
  2. Click **View Details**. Click **Confirm Order**.
  3. In Deliveries, click **Assign Delivery**. Select Courier: `Delhivery`, enter AWB: `DLV-987654321`.
  4. Update delivery status from `ASSIGNED` -> `PICKED_UP` -> `DELIVERED`.
- **Expected Results & Database Verification:**
  - Table `order_status_history` records state transitions: `PENDING` -> `CONFIRMED` -> `SHIPPED` -> `DELIVERED`.
  - When status becomes `DELIVERED`, `InvoiceService::createFromOrder` executes.
  - Table `invoices` contains legal tax invoice `INV-YYYYMM-XXXX`.
  - Table `invoice_items` contains itemized tax breakdown (CGST, SGST, IGST).
  - Table `inventory` updates `on_hand = 49`, `reserved = 0`, `available = 49`.
  - Table `inventory_movements` records movement type `SALE` with delta `-1`.

---

### Workflow 6: Customer Order Tracking & History
- **Customer Action:**
  1. Open Storefront at `http://localhost:3000/orders`.
  2. Verify order `ORD-XXXXXXXX` displays in the order list with total `₹719.10` and status badge `Delivered`.
  3. Click **View Order Details**.
  4. Verify tracking timeline displays Courier: `Delhivery`, AWB: `DLV-987654321`, Status: `Delivered`.
  5. Click **Download Tax Invoice**. Verify browser downloads PDF/printable invoice matching invoice `INV-YYYYMM-XXXX`.
- **Expected Results:**
  - API `GET /api/customers/orders` returns array including the order.
  - API `GET /api/orders/{id}` returns complete order payload including items, address, and delivery tracking.

---

### Workflow 7: Returns, Cancellation & Stock Restoration
- **Admin Action (or Customer Cancellation):**
  1. In Admin Panel **Orders**, select a `PENDING` or `CONFIRMED` order. Click **Cancel Order**.
  2. Select Reason: `Customer Request`. Confirm cancellation.
- **Expected Results & Database Verification:**
  - Table `orders` updates `status = 'CANCELLED'`.
  - Table `order_status_history` logs cancellation event with actor ID and reason.
  - Table `stock_reservations` records are released.
  - Table `inventory` restores `available` quantity (`available = 50`).
  - Table `inventory_movements` logs stock restoration movement.
  - If order was marked paid, table `refunds` contains a `PENDING` refund record for `₹719.10`.
