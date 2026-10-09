# Customer Storefront Integration & Audit Fixes Summary

> **Document Type:** Work Summary & Verification Report  
> **Branch:** `audit-fixes`  
> **Date:** October 9, 2026  
> **Status:** Completed

---

## 1. Executive Summary

All customer storefront and customer-facing backend fixes have been successfully implemented across all specified areas (**A through F**) in strict compliance with all hard boundaries:
- **Zero edits** to `apps/admin-pos/` or admin-only backend controllers/services.
- **Zero modifications** to live database migrations or running DDL commands directly (all needed SQL documented in `docs/audit/sql-to-run.md`).
- **Zero new packages** installed.
- **Zero secrets or customer personal data** logged or printed.
- **Backward-compatible & additive** changes to all shared backend files.
- **All fake data and fallback masks removed**: real database data, real backend errors, and real order flows now operate end-to-end.

---

## 2. Area-by-Area Breakdown: Files Changed & Rationale

### Area A: Catalog (Products, Variants, Prices/MRP, Images, Categories, Subcategories, Brands, Search & Filters)
- **Goal:** Ensure inactive and soft-deleted rows never appear in customer storefront, fix image URLs, brand filters, out-of-stock handling, and remove fake prices.
- **Files Changed:**
  1. [`backend/src/Controllers/ProductController.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/ProductController.php)
     - *Why:* Added check for non-staff requests in `index()`, automatically enforcing `p.is_active = 1` and `channel = 'ecommerce'`.
  2. [`backend/src/Services/ProductService.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/ProductService.php)
     - *Why:* Added `$isStaff = true` parameter to `find()`. When called by customers (`$isStaff = false`), filters `v.status = 'ACTIVE'`, active categories (`status = 'ACTIVE' AND deleted_at IS NULL`), and active subcategories. In `list()`, added `v.status = 'ACTIVE'` condition for ecommerce channel queries.
  3. [`backend/src/Controllers/CategoryController.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/CategoryController.php)
     - *Why:* For non-staff, scoped `index()` to `status = 'ACTIVE' AND deleted_at IS NULL`.
  4. [`backend/src/Controllers/SubcategoryController.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/SubcategoryController.php)
     - *Why:* For non-staff, scoped `index()` and `byCategory()` to `status = 'ACTIVE' AND deleted_at IS NULL`.
  5. [`backend/src/Controllers/MasterDataController.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/MasterDataController.php)
     - *Why:* Filtered out soft-deleted and inactive brands (`status = 'ACTIVE' AND deleted_at IS NULL`) in `brands()`, `brandCategories()`, and `categories()`.
  6. [`apps/storefront/src/pages/Shop.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/Shop.jsx)
     - *Why:* Added brand filtering support (`brand_id` URL query param), dynamic brand filter chips, and dynamic page titles reflecting selected brand/category.
  7. [`apps/storefront/src/components/ProductCard.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/ProductCard.jsx)
     - *Why:* Disabled out-of-stock "Add" button and displayed "Sold Out" badge when stock is 0.
  8. [`apps/storefront/src/pages/ProductDetails.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/ProductDetails.jsx)
     - *Why:* Removed hardcoded pricing fallbacks (`|| 299`, `1.8` multiplier). Uses authoritative variant prices and MRP directly from backend.
  9. [`apps/storefront/src/components/CartDrawer.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/CartDrawer.jsx) & [`apps/storefront/src/components/CheckoutModal.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/CheckoutModal.jsx)
     - *Why:* Wrapped image paths with `resolveImageUrl` so images load correctly from backend upload directory.

---

### Area B: Banners/Hero Carousel, Offers and Coupons
- **Goal:** Remove hardcoded coupons (`COMBO20`, `SAVE20`), connect to real backend coupons, align cart totals with checkout calculation, and show valid banners.
- **Files Changed:**
  1. [`backend/src/Controllers/CouponController.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/CouponController.php)
     - *Why:* Added public `validate()` method calling `CouponService::validate`.
  2. [`backend/public/index.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php)
     - *Why:* Registered customer-facing route `POST /api/coupons/validate`.
  3. [`backend/src/Controllers/BannerController.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/BannerController.php)
     - *Why:* Filtered storefront `active()` query to `is_active = 1` and current date within `start_datetime` and `end_datetime`.
  4. [`backend/src/Services/OrderService.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/OrderService.php)
     - *Why:* Resolved DEF-12 delivery settings mismatch by querying authoritative `delivery_settings` table (standard ₹49, free threshold ₹499) instead of hardcoding; fixed exclusive vs inclusive tax addition so cart totals match order total.
  5. [`apps/storefront/src/components/CartDrawer.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/CartDrawer.jsx)
     - *Why:* Removed hardcoded coupons (`COMBO20`, `SAVE20`). Connected coupon validation directly to `POST /api/coupons/validate` and populated available coupon badges from `GET /api/coupons/available`. Synced delivery fee calculation with database rules.

---

### Area C: Cart and Checkout
- **Goal:** Fix address field mismatch, pass `cartData` everywhere `CheckoutModal` is mounted, require login for checkout, remove fake order ID / fake confirmation, and clear cart as `CONVERTED` in the same database transaction.
- **Files Changed:**
  1. [`backend/src/Services/OrderService.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/OrderService.php)
     - *Why:* In `checkout()`, added fallbacks for address keys (`address_line_1` / `streetAddress` -> `line1`, `city` -> `city_district`). Inside the database transaction, deleted cart items and updated `carts.status = 'CONVERTED'` for the customer.
  2. [`backend/src/Services/CartService.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/CartService.php)
     - *Why:* Scoped `findCartId` to `status = 'ACTIVE'`, and in `findOrCreateCartId`, re-activated converted carts using `ON DUPLICATE KEY UPDATE status = 'ACTIVE'`.
  3. [`apps/storefront/src/components/CheckoutModal.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/CheckoutModal.jsx)
     - *Why:* Enforced login requirement by rendering a dedicated authentication prompt when `!getCustomerToken()`; removed all random `KB-` generation; displayed real backend error banners on failure; displayed real order number/id on success; prefilled saved addresses using `def.line1` and `def.city_district`; added fallback cart fetching if `cartData` is omitted.
  4. [`apps/storefront/src/pages/Home.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/Home.jsx), [`Shop.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/Shop.jsx), [`PolicyPage.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/PolicyPage.jsx), [`ProductDetails.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/ProductDetails.jsx)
     - *Why:* Added `checkoutCartData` state and passed `cartData={checkoutCartData}` to all `<CheckoutModal>` instances; aligned `CartDrawer` prop `onProceedToCheckout`.

---

### Area D: Order History & Order Details (My Orders)
- **Goal:** Implement customer My Orders and Order Details pages, using existing customer backend endpoints, with cancellation support.
- **Files Changed:**
  1. [`apps/storefront/src/pages/customer/Orders.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/customer/Orders.jsx) *(New File)*
     - *Why:* Customer order history page fetching from `GET /api/customers/orders`. Includes status filter tabs (All, In Progress, Delivered, Cancelled), order number, date, amount, payment and delivery status badges, and direct links to `/orders/:id`.
  2. [`apps/storefront/src/pages/customer/OrderDetail.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/customer/OrderDetail.jsx) *(New File)*
     - *Why:* Full order details page fetching from `GET /api/orders/:id` and `GET /api/orders/:id/delivery`. Displays ordered items, snapshots, price breakdown, shipping address, status history timeline, shipment tracking link, and cancellation modal using `POST /api/orders/:id/cancel`.
  3. [`apps/storefront/src/App.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/App.jsx)
     - *Why:* Registered routes `/orders`, `/orders/:id`, `/customer/orders`, and `/customer/orders/:id`.
  4. [`apps/storefront/src/pages/customer/Profile.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/customer/Profile.jsx)
     - *Why:* Updated "My Orders" quick access tile link from `/` to `/orders`.
  5. [`apps/storefront/src/components/Navbar.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/Navbar.jsx)
     - *Why:* Added "My Orders" link in both desktop customer dropdown menu and mobile navigation drawer.

---

### Area E: Referral Codes & Rewards
- **Goal:** Display real referral data from the backend and apply referral codes dynamically according to Admin's settings.
- **Files Changed:**
  1. [`apps/storefront/src/lib/api.js`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/lib/api.js)
     - *Why:* Exported `fetchReferralSettings()` calling `GET /api/referral-settings`.
  2. [`apps/storefront/src/components/Navbar.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/Navbar.jsx)
     - *Why:* Dynamically fetched referral settings; replaced hardcoded `10% OFF` text with live `referrer_discount_percent`; hid button if `is_enabled` is false.
  3. [`apps/storefront/src/pages/customer/Profile.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/customer/Profile.jsx)
     - *Why:* Added one-click copy button for referral code with instant visual confirmation. Real code, referral count, and reward rates are rendered directly from `GET /api/customers/me`.
  4. [`apps/storefront/src/components/ReferralModal.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/ReferralModal.jsx)
     - *Why:* Verified real data bindings for `GET /api/referral-settings`, `GET /api/customers/me`, and `POST /api/customers/referral/apply`. Real reward history is rendered directly from database rewards table.

---

### Area F: Variant Selector on ProductDetails
- **Goal:** Provide an interactive variant selector allowing customers to choose among product options (sizes, colors, packs), updating active pricing, stock, SKU, and cart payloads.
- **Files Changed:**
  1. [`apps/storefront/src/pages/ProductDetails.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/ProductDetails.jsx)
     - *Why:* Added `selectedVariantId` state; computed `activeVariant` with fallback to default variant; dynamically updated price, MRP, discount percentage, savings, stock availability, and SKU; rendered interactive pill/chip variant buttons with color hex swatches and sold-out indicators; updated both `handleAddToCart` and `handleBuyNow` to submit the specific `variant_id`.

---

## 3. Complete List of Shared Backend Files Touched

All modifications were additive, backwards compatible, and preserved existing Admin endpoint behavior:

| Shared Backend File | Modifications Made | Backward-Compatibility Verification |
|---|---|---|
| [`backend/src/Controllers/ProductController.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/ProductController.php) | Scoped non-staff calls to `is_active = 1` and `channel = 'ecommerce'`. Staff calls retain full unfiltered access. | Admin endpoints authenticate with staff JWT tokens; condition is only applied when staff token is absent. |
| [`backend/src/Services/ProductService.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/ProductService.php) | Added optional `$isStaff = true` default parameter in `find()`. Added `v.status = 'ACTIVE'` for ecommerce queries. | Default argument is `$isStaff = true`, preserving Admin controllers' existing calls and return shapes. |
| [`backend/src/Controllers/CategoryController.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/CategoryController.php) | Non-staff requests filter `status = 'ACTIVE' AND deleted_at IS NULL`. | Staff requests pass through untouched. |
| [`backend/src/Controllers/SubcategoryController.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/SubcategoryController.php) | Non-staff requests filter `status = 'ACTIVE' AND deleted_at IS NULL`. | Staff requests pass through untouched. |
| [`backend/src/Controllers/MasterDataController.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/MasterDataController.php) | Filtered soft-deleted and inactive brands/categories for non-staff. | Preserved all response shapes and staff access. |
| [`backend/src/Controllers/CouponController.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/CouponController.php) | Added `validate()` method. | Purely additive; existing CRUD endpoints unchanged. |
| [`backend/public/index.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php) | Registered route `POST /api/coupons/validate`. | Additive route registration; all existing routes intact. |
| [`backend/src/Controllers/BannerController.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/BannerController.php) | Filtered active banners within valid date windows. | Admin banner index endpoint unchanged. |
| [`backend/src/Services/OrderService.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/OrderService.php) | Dynamic delivery settings from DB; address aliases fallback; clear and mark cart CONVERTED in transaction. | Admin POS order creation passes validated address fields and uses POS channel; cart conversion only targets customer cart. |
| [`backend/src/Services/CartService.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/CartService.php) | Filtered `findCartId` by `status = 'ACTIVE'`; updated `findOrCreateCartId` with `ON DUPLICATE KEY UPDATE status = 'ACTIVE'`. | POS does not use server-side cart; session/customer cart behavior improved. |

---

## 4. Items Left Undone or Blocked

Documented in detail in [`docs/audit/blocked-items.md`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/docs/audit/blocked-items.md):

1. **Online Razorpay / Card Gateway Live Processing (BLK-01):**
   - *Reason:* Production Razorpay API credentials and webhook secrets are not in repository. Admin webhook callback handler is admin-side.
   - *Status:* Cash on Delivery (COD) is fully functional end-to-end. Backend `confirmPayment` endpoint is available for mock/admin confirmation.
2. **Direct Database Migration Execution (BLK-02):**
   - *Reason:* Hard boundary prohibited running migrations or altering the database directly.
   - *Status:* All required SQL scripts were compiled into [`docs/audit/sql-to-run.md`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/docs/audit/sql-to-run.md).
3. **Disjoint Dual Inventory Architecture (BLK-04):**
   - *Reason:* Requires database schema refactoring to unify `inventory_movements` (with trigger) and `inventory_transactions`.
   - *Status:* Storefront relies on authoritative `inventory.available` column.

---

## 5. Admin-Side Issues Found for Admin Developer

Documented in detail in [`docs/audit/admin-issues-for-other-dev.md`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/docs/audit/admin-issues-for-other-dev.md):

1. **`ReturnsController::storePurchaseReturn` NOT NULL Violation:**
   - `purchase_return_items.purchase_item_id` is defined as `NOT NULL`, but line 256 inserts `$item['purchase_item_id'] ?? null`, causing crashes on purchase returns.
2. **Customer Address Schema Discrepancy:**
   - Admin customer edit and POS forms send `address_line_1` and `city` instead of schema column names `line1` and `city_district`.
3. **Backend Port Inconsistency:**
   - `start-backend.bat` runs on port **8080**, while `README.md` lines 84–86 instructs port **8000**.
4. **Missing `.env` file in `apps/admin-pos/`:**
   - Only `.env.example` exists; defaults rely on hardcoded fallback in `api.ts`.
5. **Admin Inventory Batches Disjoint Triggers:**
   - Batch adjustments in Admin bypass the append-only `inventory_movements` trigger.

---

## 6. Manual Test Steps by Area

### Area A: Catalog Verification
1. Start backend: `php -S 0.0.0.0:8080 -t backend/public backend/public/index.php`.
2. Start storefront: `npm --prefix apps/storefront run dev`.
3. Open `http://localhost:5173/shop`.
4. Verify all displayed products have `p.is_active = 1` and active categories. Inactive or soft-deleted items do not appear.
5. Click on a brand filter chip (e.g. "Kirana Crafts"). Verify URL updates to `/shop?brand_id=...` and only products for that brand are shown.
6. Verify products with 0 stock display "Sold Out" badge and the "Add" button is disabled.
7. Open a product detail page (e.g. `/product/1`). Verify displayed price matches MySQL `retail_price` and MRP matches `mrp` with no fake `299` fallback.

### Area B: Banners, Offers & Coupons Verification
1. Open `http://localhost:5173/`.
2. Verify banners in the hero carousel only display active banners within current date window.
3. Add an in-stock product to the cart and open the cart drawer.
4. Try typing a fake coupon (e.g. `COMBO20` or `FAKE100`) and click "Apply". Verify a real backend error message is shown (e.g. "Invalid coupon code").
5. Apply a real coupon from the available coupons list. Verify backend validation succeeds and discount is applied.
6. Verify cart delivery fee is ₹0 if subtotal ≥ ₹499, and ₹49 if subtotal < ₹499.

### Area C: Cart and Checkout Verification
1. Open the storefront as a guest (logged out).
2. Add an item to the cart and click "Proceed to Checkout".
3. Verify `CheckoutModal` displays the **Authentication Required** screen with "Sign In / Register →" button.
4. Sign in with customer credentials or OTP at `/login`.
5. Return to cart and click "Proceed to Checkout".
6. Verify saved address fields are prefilled from `customer_addresses` (`line1`, `city_district`, `state`, `pincode`).
7. Click "Place Order Now".
8. Verify order is created in MySQL, real order number (e.g. `KB-...`) is displayed, and the cart is cleared.
9. Open cart drawer again to verify cart is empty and its status in `carts` table is `CONVERTED`.

### Area D: Order History & Details (My Orders) Verification
1. Log in as a customer and click "My Orders" from the account dropdown or navigate to `/orders`.
2. Verify list displays real past orders from `GET /api/customers/orders`.
3. Test filter tabs: "All", "In Progress", "Delivered", "Cancelled".
4. Click "View Details →" on an order to open `/orders/:id`.
5. Verify order details display all snapshot line items, prices, shipping address, delivery status, and status history timeline.
6. For a `PENDING` order, click "Cancel Order". Enter a reason (e.g. "Test cancellation") and confirm.
7. Verify order status transitions to `CANCELLED` and status badge updates.

### Area E: Referral Codes & Rewards Verification
1. Log in as a customer and navigate to `/profile`.
2. Verify "Referral Program" card displays the customer's unique referral code, total referrals count, and reward percentage from the database.
3. Click "Copy" next to the referral code and verify copied feedback appears.
4. Click "Refer & Earn" in the navbar. Verify the modal displays live settings and earned rewards from MySQL.
5. In Admin, change `referral_settings.is_enabled` to 0. Verify the storefront updates accordingly.

### Area F: Variant Selector Verification
1. Open a product with multiple variants (e.g. sizes or colors) at `/product/:id`.
2. Verify the "Select Variant / Option:" box appears above available offers.
3. Click different variant pills. Verify:
   - Retail price and MRP update immediately.
   - SKU indicator updates.
   - Stock status updates (switches between "In Stock", "Only X left", or "Sold Out").
4. Select a variant and click "Add to Cart".
5. Open the cart drawer and verify the added item contains the selected variant's `variant_id` and price snapshot.
