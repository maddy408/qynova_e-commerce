# Phase 4 Audit Report: Database to Customer Flows

**Date:** 2026-10-09  
**Auditor:** Antigravity (Advanced Agentic AI Assistant)  
**Project:** `qynova_e-commerce` (`unified_pos`)  
**Scope:** Phase 4 of 5 — Database to Customer Flows (Storefront & Backend Integration).

---

## Safety & Pre-Audit Verification

Before conducting the audit, repository state and safety constraints were verified in accordance with the Safety Rules:
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
  *These files were left completely untouched (no stash, reset, checkout, commit, or discard was performed).*
- **Environment and Secret Handling:** Variable names were inspected without reading or printing secret values. No tokens, database passwords, API credentials, or customer personal data were logged or printed.
- **Operations:** Read-only code tracing and static inspection across `apps/storefront/` and `backend/`. No destructive SQL, migrations, package installations, or modifications to business data were executed.

---

## Executive Summary

The customer flow audit examined the complete journey across 14 distinct feature domains: from React components in `apps/storefront` through the Axios API layer, PHP router, controllers, and services, down to MySQL tables, and back to the customer UI.

While core catalog browsing (categories, products, banners, and search) successfully fetches live data from MySQL, **the transaction and post-purchase customer journeys are critically broken**:
1. **Checkout is 100% Non-Functional in Production:** Due to a strict address field name mismatch between `CheckoutModal.jsx` (`address_line_1`, `city`) and `OrderService.php` (`line1`, `city_district`), the backend throws an unhandled validation error on every checkout attempt.
2. **Fake Order IDs (`KB-XXXXXX`) Mask Failure:** `CheckoutModal.jsx` catches backend errors with `.catch(() => null)` and falls back to generating a random 6-digit number, presenting an "Order Confirmed!" modal to the customer. No record is ever saved to MySQL for guest checkouts or failed checkouts.
3. **Cart Drawer Checkout Bypasses API:** `Home.jsx` and `Shop.jsx` fail to pass `cartData` to `<CheckoutModal>`, meaning `items` is empty (`[]`). This immediately triggers the fake random order generator even for authenticated users.
4. **Completely Missing Customer Order Experience:** The storefront has no pages or routes for Order History, Order Details, Invoices, Delivery Tracking, or Order Cancellation, despite full backend REST API support.
5. **No Variant Selection UI:** The storefront product details page hardcodes selection to the first default variant; customers cannot choose or buy sizes, colors, or packs.

---

## 1. Feature-by-Feature End-to-End Traces

### 1.1 Home Page Sections
- **Customer Page:** [apps/storefront/src/pages/Home.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/Home.jsx) lines 87–139.
- **API Client:** [apps/storefront/src/lib/api.js](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/lib/api.js): invokes `api.get('/categories')`, `api.get('/banners?position=HOME_HERO&is_active=1')`, `api.get('/banners?position=HOME_MIDDLE&is_active=1')`, `api.get('/products?section=best_sellers&limit=8')`, `api.get('/products?section=new_arrivals&limit=8')`, `api.get('/products?section=featured&limit=8')`, `api.get('/products?section=deals&limit=8')`, `api.get('/products?section=trending&limit=8')`, `fetchStoreSettings()`, `fetchDeliverySettings()`, and `fetchFlashDeal()`.
- **PHP Route:** `public/index.php` lines 90, 143, 237, 238, 242, 319.
- **Controllers & Methods:**
  - `CategoryController::index`
  - `BannerController::index`
  - `ProductController::index`
  - `SettingsController::getStoreSettings`, `getDeliverySettings`, `getFlashDeal`
- **Services:**
  - `CategoryService::list`
  - `BannerService::list`
  - `ProductService::list`
- **MySQL Tables & Queries:**
  - `categories`: `SELECT c.* FROM categories c WHERE c.deleted_at IS NULL AND c.status = 'ACTIVE' ORDER BY total_units_sold DESC, c.sort_order, c.name`
  - `banners`: `SELECT * FROM banners WHERE position = :position AND is_active = 1`
  - `products`: `SELECT p.*, (SELECT COALESCE(SUM(i.available), 0) FROM product_variants v LEFT JOIN inventory i ON i.variant_id = v.id WHERE v.product_id = p.id AND v.deleted_at IS NULL) AS total_stock FROM products p WHERE p.deleted_at IS NULL AND p.is_active = 1 AND p.is_ecommerce_enabled = 1 AND (...)`
  - `store_settings`: `SELECT * FROM store_settings WHERE is_active = 1 ORDER BY id ASC LIMIT 1`
  - `delivery_settings`: `SELECT * FROM delivery_settings WHERE is_active = 1 ORDER BY id ASC LIMIT 1`
  - `offers`: `SELECT * FROM offers WHERE is_active = 1 AND offer_type = 'FLASH_DEAL' AND start_datetime <= NOW() AND end_datetime >= NOW()`
- **Response Format:** JSON payloads (`{ categories: [...] }`, `{ banners: [...] }`, `{ items: [...], pagination: {...} }`, `{ settings: {...} }`, `{ flash_deal: {...} }`).
- **Customer UI Rendering:**
  - `Navbar.jsx`: promotional top strip, contact helpline, logo, search input.
  - `PromotionalBannerCarousel.jsx`: hero banner slides with dynamic themes, badges, and auto-play interval.
  - `LowerPromotionalBanners.jsx`: auto-scrolling promotional cards.
  - `Home.jsx`: Category grid buttons, Department preview, 5 horizontal product carousels (`HorizontalProductSection.jsx`).
- **Write-Back Operations:**
  - Wishlist toggle writes to `wishlist` via `POST /api/wishlist` or `DELETE /api/wishlist/{id}`.
  - Add to cart writes to `carts` and `cart_items` via `POST /api/cart/items`.
- **Status:** **VERIFIED**

---

### 1.2 Categories & Subcategories
- **Customer Page:** [apps/storefront/src/pages/Home.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/Home.jsx) lines 270–332; [apps/storefront/src/pages/Shop.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/Shop.jsx) lines 334–401; [apps/storefront/src/components/Navbar.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/Navbar.jsx).
- **API Client:** `api.get('/categories')` and `api.get('/subcategories')`.
- **PHP Routes:** `GET /api/categories`, `GET /api/subcategories` (`public/index.php` lines 90, 99).
- **Controllers & Methods:** `CategoryController::index`, `SubcategoryController::index`.
- **Services:** `CategoryService::list(?string $status)`, `SubcategoryService::list(?int $categoryId, ?string $status)`.
- **MySQL Tables & Queries:**
  - `categories`: filters `deleted_at IS NULL` and `status = 'ACTIVE'`.
  - `subcategories`: filters `deleted_at IS NULL` and `status = 'ACTIVE'`.
  - `category_subcategory`: populates `category_ids` array on each subcategory object.
- **Response Format:** `{ categories: [...] }`, `{ subcategories: [...] }`.
- **Customer UI Rendering:**
  - Category tiles on Home page display image or icon with dynamic palette colors (`getCategoryPalette`).
  - Shop page renders horizontal pill chips for categories and dynamic subcategory chips filtered by `relevantSubcategories` based on selected category ID.
- **Write-Back Operations:** None (read-only).
- **Status:** **VERIFIED**

---

### 1.3 Product Listing & Detail
- **Customer Pages:**
  - Listing: [apps/storefront/src/pages/Shop.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/Shop.jsx).
  - Details: [apps/storefront/src/pages/ProductDetails.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/ProductDetails.jsx).
  - Product Card: [apps/storefront/src/components/ProductCard.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/ProductCard.jsx).
- **API Client:**
  - Listing: `api.get('/products?page=...&limit=12&channel=ecommerce&is_active=1...')`.
  - Details: `api.get('/products/' + id)`.
- **PHP Routes:** `GET /api/products`, `GET /api/products/{id}` (`public/index.php` lines 143, 162).
- **Controllers & Methods:** `ProductController::index`, `ProductController::show`.
- **Services:** `ProductService::list(array $filters)`, `ProductService::find(int $id)`.
- **MySQL Tables & Queries:**
  - `products`: joined with `brands`, `product_images`, `product_variants`, `inventory`.
  - In `ProductService::find`: executes queries against `product_images`, `product_specifications`, `product_categories`, `product_subcategories`, `product_variants`, `product_variant_values`, `variant_attributes`, `variant_attribute_values`, and `variant_images`.
- **Response Format:**
  - List: `{ items: [...], total: int, page: int, limit: int, pagination: {...} }`.
  - Show: `{ product: { id, name, slug, brand_name, images: [...], specifications: [...], categories: [...], subcategories: [...], variants: [...] } }`.
- **Customer UI Rendering:**
  - ProductCard renders WebP image, brand name, name, discounted retail price, strikethrough MRP, discount badge, stock status ("In Stock" / "Out of Stock"), wishlist heart icon, and Add to Cart button.
  - ProductDetails renders full gallery, image zoom, product code, description, specifications table, related products, available coupons, and delivery checker.
- **Write-Back Operations:** None on browse; Add to Cart writes to cart.
- **Status:** **VERIFIED**

---

### 1.4 Images & Variants
- **Customer Pages:** `ProductCard.jsx`, `ProductDetails.jsx`, `CartDrawer.jsx`.
- **API Client:** `resolveImageUrl(path)` resolves relative image paths against backend origin.
- **PHP Routes:** Images uploaded via `ProductImageController` and `VariantImageController`.
- **Services:** `ImageUploadService`, `ProductImageService`, `VariantImageService`, `ProductService`.
- **MySQL Tables:** `product_images`, `variant_images`, `product_variants`, `product_variant_values`.
- **Customer UI Rendering:**
  - Primary product images render correctly via `resolveImageUrl`.
  - Fallback to `/placeholder-product.svg` on image error.
- **Critical Flaw:**
  - **No Variant Selection Controls:** Although `ProductService::find` loads variant rows, attributes, and variant images, `ProductDetails.jsx` (lines 243–245) only reads `defaultVariant = product.variants.find(v => v.is_default) || product.variants[0]`. There are no variant dropdowns, size buttons, or color swatches for the customer to pick non-default variants.
- **Status:** **VERIFIED**

---

### 1.5 Search, Filters, Sorting & Pagination
- **Customer Pages:** [apps/storefront/src/pages/Shop.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/Shop.jsx), [apps/storefront/src/components/Navbar.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/Navbar.jsx).
- **API Client:** `Shop.jsx` binds URL search params to backend query string (`page`, `limit=12`, `channel=ecommerce`, `is_active=1`, `category_id`, `subcategory_id`, `sort`, `search`, `min_price`, `max_price`, `section`).
- **PHP Route:** `GET /api/products` (`public/index.php` line 143).
- **Controller & Service:** `ProductController::index` -> `ProductService::list`.
- **MySQL Implementation:**
  - Search: uses `MATCH(p.name, p.tags, p.short_description) AGAINST (:search IN NATURAL LANGUAGE MODE) OR p.name LIKE :search_like OR p.product_code LIKE :search_like` ([ProductService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/ProductService.php) lines 100–105).
  - Sorting: translates `price_asc`, `price_desc`, `name_asc`, `name_desc`, `best_sellers`, `popular`, `newest` into SQL `ORDER BY`.
  - Pagination: uses SQL `LIMIT :limit OFFSET :offset` with an exact `SELECT COUNT(*)` query.
- **Response Format:** Returns full pagination metadata (`page`, `limit`, `total`, `totalPages`, `hasNextPage`, `hasPreviousPage`).
- **Customer UI Rendering:** Shop page renders previous, next, and individual numeric page buttons, scrolling smoothly to top on page change.
- **Status:** **VERIFIED**

---

### 1.6 Hero Carousel & Promo Banners
- **Customer Pages:** `Home.jsx`, `PromotionalBannerCarousel.jsx`, `LowerPromotionalBanners.jsx`.
- **API Client:** `api.get('/banners?position=HOME_HERO&is_active=1')`, `api.get('/banners?position=HOME_MIDDLE&is_active=1')`.
- **PHP Route:** `GET /api/banners` (`public/index.php` line 319).
- **Controller & Service:** `BannerController::index` -> `BannerService::list`.
- **MySQL Tables:** `banners`, `banner_items`. Filters by `position`, `is_active = 1`, and active date ranges.
- **Customer UI Rendering:**
  - Hero carousel displays banner desktop and mobile images, titles, subtitles, dynamic badge texts, color themes, autoplay timer, and touch swipe listeners.
  - Banner CTAs navigate to category (`/products?category_id=X`), product (`/product/X`), or external URLs based on `target_type`.
- **Status:** **VERIFIED**

---

### 1.7 Price, MRP, Discounts, Offers & Coupons
- **Customer Pages:** `ProductCard.jsx`, `ProductDetails.jsx`, `CartDrawer.jsx`, `CheckoutModal.jsx`.
- **API Client:**
  - Available Coupons: `api.get('/coupons/available')`.
  - Active Offers: `api.get('/offers')`.
  - Flash Deal: `api.get('/offers/flash-deal')`.
- **PHP Routes:** `GET /api/coupons/available`, `GET /api/offers`, `GET /api/offers/flash-deal` (`public/index.php` lines 213, 241, 242).
- **Controllers & Services:** `CouponController::availableForCustomer`, `SettingsController::getOffers`, `SettingsController::getFlashDeal`, `PricingService::resolveUnitPrice`.
- **MySQL Tables:** `coupons`, `coupon_customers`, `offers`, `product_variants`.
- **Critical Flaws:**
  - **Hardcoded Fake Coupons in Cart Drawer:** [CartDrawer.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/CartDrawer.jsx) lines 69–79 hardcodes checks for `COMBO20`, `SAVE20`, `WELCOME10`, and `FIRST10`. It never calls `/api/coupons` or the backend coupon validator. Real coupons configured in admin fail, and fake coupons succeed locally.
  - **Delivery Fee & Threshold Inconsistency:** [OrderService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/OrderService.php) lines 23–24 hardcodes `FLAT_SHIPPING = '50.00'` and `FREE_SHIPPING_ABOVE = '500.00'`, completely ignoring the dynamic `delivery_settings` table (499.00 / 49.00) used by the frontend.
  - **Missing Tax Calculation on Frontend:** `CheckoutModal.jsx` computes grand total as `subtotal - discount + delivery` without taxes, whereas `OrderService.php` calculates inclusive/exclusive GST server-side.
- **Status:** **VERIFIED**

---

### 1.8 Registration, OTP Login, Google Login & Profile
- **Customer Pages:**
  - [apps/storefront/src/pages/customer/Register.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/customer/Register.jsx)
  - [apps/storefront/src/pages/customer/Login.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/customer/Login.jsx)
  - [apps/storefront/src/pages/customer/Profile.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/customer/Profile.jsx)
- **API Client:**
  - `POST /api/customers/otp/send`
  - `POST /api/customers/otp/verify`
  - `POST /api/customers/signup`
  - `POST /api/customers/otp/login`
  - `POST /api/customers/google-login`
  - `GET /api/customers/me`
- **PHP Routes:** `public/index.php` lines 59–65.
- **Controllers & Services:** `CustomerAuthController`, `OtpService`, `GoogleAuthService`, `ReferralService`.
- **MySQL Tables & Operations:**
  - `otp_verifications`: stores OTP requests and verification timestamps.
  - `customers`: stores customer records (`name`, `phone`, `email`, `password_hash`, `google_id`, `profile_photo_path`, `status`).
  - `referrals` / `referral_rewards`: generates unique customer referral code upon registration.
- **Response Format:** Issues JWT token (`token`) with claims `sub: customerId`, `type: 'customer'`.
- **Customer UI Rendering:**
  - JWT token saved in browser `sessionStorage` (`customer_jwt`). No customer business data stored in storage.
  - Profile page renders name, email, phone, membership date, Google avatar, and referral stats.
- **Status:** **VERIFIED**

---

### 1.9 Cart, Wishlist & Guest-to-Customer Merge
- **Customer Pages:** `CartDrawer.jsx`, `ProductDetails.jsx`, `ProductCard.jsx`, `Navbar.jsx`.
- **API Client:** [apps/storefront/src/lib/cart.js](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/lib/cart.js), [apps/storefront/src/lib/wishlist.js](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/lib/wishlist.js).
- **PHP Routes:**
  - Cart: `GET /api/cart`, `POST /api/cart/items`, `PUT /api/cart/items/{id}`, `DELETE /api/cart/items/{id}`, `DELETE /api/cart`, `POST /api/cart/merge` (`public/index.php` lines 227–233).
  - Wishlist: `GET /api/wishlist`, `POST /api/wishlist`, `DELETE /api/wishlist/{productId}`, `POST /api/wishlist/merge` (`public/index.php` lines 220–223).
- **Controllers & Services:** `CartController`, `CartService`, `WishlistController`.
- **MySQL Tables & Operations:**
  - `carts`, `cart_items`: resolved via JWT customer ID or `X-Session-ID` guest session header.
  - `wishlist`: resolved via customer ID or `session_id`.
  - Merge: upon customer login/signup, `POST /api/cart/merge` and `POST /api/wishlist/merge` transfer session items into customer account and purge session records.
- **Status:** **VERIFIED**

---

### 1.10 Addresses & Delivery
- **Customer Pages:** `CheckoutModal.jsx`, `ProductDetails.jsx`.
- **API Client:**
  - Pincode Check: `api.get('/delivery/check-pincode?pincode=...&product_id=...')`.
  - Addresses: `api.get('/customer/addresses')`, `api.post('/customer/addresses')`, `api.delete('/customer/addresses/{id}')`.
- **PHP Routes:** `GET /api/delivery/check-pincode`, `GET /api/customer/addresses`, `POST /api/customer/addresses` (`public/index.php` lines 67, 68, 301).
- **Controllers & Services:** `DeliveryController::checkPincode`, `CustomerAuthController::getAddresses`, `CustomerAuthController::storeAddress`.
- **MySQL Tables:** `customer_addresses`, `products`, `delivery_settings`.
- **Critical Flaw:**
  - **Saved Address Pre-Fill Mismatch:** In [CheckoutModal.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/CheckoutModal.jsx) lines 44–47, the client attempts to read `def.address_line_1` and `def.city`, whereas the database columns returned by `GET /api/customer/addresses` are `line1` and `city_district`. Saved addresses never pre-fill into checkout.
- **Status:** **VERIFIED**

---

### 1.11 Checkout & Order Placement
- **Customer Page:** [apps/storefront/src/components/CheckoutModal.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/CheckoutModal.jsx).
- **API Client:** `api.post('/orders/checkout', orderPayload)`.
- **PHP Route:** `POST /api/orders/checkout` (`public/index.php` line 247).
- **Controller & Service:** `OrderController::checkout` -> `OrderService::checkout`.
- **MySQL Tables & Operations (Intended Flow):**
  - Inserts into `orders`, `order_items`, `order_item_discounts`.
  - Reserves stock via `InventoryService::apply` (`movementType = 'ORDER_RESERVE'`, `movementDelta = reserved + qty`).
  - Records 20-minute reservation in `stock_reservations`.
  - Deducts coupon usage in `coupon_usages` and marks `referral_rewards.status = 'APPLIED'`.
- **Actual Runtime Behavior (Critical Breakage):**
  1. **Address Field Name Mismatch:** Frontend sends `address_line_1` and `city`; backend strictly validates `line1` and `city_district`. Backend throws `RuntimeException: Address field 'line1' is required`.
  2. **Failure Masked by Fake Order ID:** `CheckoutModal.jsx` catches the failure with `.catch(() => null)`. Because `res` is null, it falls through to:
     ```javascript
     const genId = 'KB-' + Math.floor(100000 + Math.random() * 900000);
     setConfirmedOrderId(genId);
     setOrderConfirmed(true);
     await clearCart();
     ```
  3. **Guest Checkout Bypasses Backend:** If `!token`, `CheckoutModal.jsx` never invokes the API, immediately executing the fake order generation code.
  4. **Home/Shop Checkout Missing Cart Items:** `Home.jsx` and `Shop.jsx` do not pass `cartData` to `<CheckoutModal>`. `items` is empty `[]`, which skips the API call entirely.
- **Status:** **VERIFIED (CRITICALLY BROKEN)**

---

### 1.12 Payments (If Configured)
- **Customer Page:** `CheckoutModal.jsx` renders radio options: `COD`, `UPI`, `CARD`.
- **API Client & Backend:** No real payment gateway integration exists.
- **PHP Route:** `POST /api/orders/{id}/confirm-payment` (`public/index.php` line 251).
- **Controller & Service:** `OrderController::confirmPayment` -> `OrderService::confirmPayment`.
- **Critical Security Flaw:**
  - `CheckoutModal.jsx` does not include `paymentMethod` in `orderPayload`.
  - `POST /api/orders/{id}/confirm-payment` takes no payload, transaction ID, or payment gateway signature.
  - Any customer can call `POST /api/orders/{id}/confirm-payment` with their own JWT token to mark any of their pending orders as `PAID` in MySQL without paying.
- **Status:** **VERIFIED (MOCK IMPLEMENTATION / INSECURE)**

---

### 1.13 Order History, Cancellation, Returns & Tracking
- **Customer Pages:** **NONE.** No customer order pages exist in `apps/storefront`.
- **Backend Routes (Existing but Orphaned):**
  - `GET /api/customers/orders` (`OrderController::myOrders`)
  - `GET /api/orders/{id}` (`OrderController::show`)
  - `POST /api/orders/{id}/cancel` (`OrderController::cancel`)
  - `GET /api/orders/{orderId}/delivery` (`DeliveryController::showForOrder`)
- **Storefront Gaps:**
  - [apps/storefront/src/App.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/App.jsx) contains no routes for `/orders`, `/orders/:id`, `/orders/track`, or `/orders/:id/cancel`.
  - [apps/storefront/src/components/Navbar.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/Navbar.jsx) has no link to customer orders.
  - [apps/storefront/src/pages/customer/Profile.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/customer/Profile.jsx) line 212 renders a "My Orders" tile, but its link target is `<Link to="/">` (redirects to Home).
- **Status:** **VERIFIED (COMPLETELY MISSING IN UI)**

---

### 1.14 Referral Codes & Rewards
- **Customer Pages:**
  - [apps/storefront/src/components/ReferralModal.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/ReferralModal.jsx)
  - [apps/storefront/src/pages/customer/Register.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/customer/Register.jsx) (referral code input)
  - [apps/storefront/src/pages/customer/Profile.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/customer/Profile.jsx) (referral code and reward percent card)
- **API Client:**
  - `GET /api/referral-settings`
  - `POST /api/customers/referral/apply`
  - `POST /api/referrals/validate`
  - `GET /api/customers/me`
- **PHP Routes:** `public/index.php` lines 74, 75, 84.
- **Controllers & Services:** `CustomerAuthController`, `ReferralController`, `ReferralService`.
- **MySQL Tables & Operations:**
  - `referrals`: links `referrer_customer_id` and `referred_customer_id`.
  - `referral_rewards`: tracks discount percentage and eligible rewards for both parties.
  - `referral_settings`: sets min order amount, max discount, and reward rates.
- **Customer UI Rendering:**
  - Copy referral code to clipboard.
  - Apply referral code modal with success message displaying discounts for both referrer and referee.
  - Referral card on customer profile page displays code, total referrals count, and reward percentage.
- **Status:** **VERIFIED**

---

## 2. In-Depth Verification Criteria

### 2.1 Backend Data vs Fake Fallbacks & Local Storage
- **Catalog & Authentication:** Real data from MySQL is utilized. No business data (products, prices, carts, addresses) is stored in `localStorage` or `sessionStorage`. Only the session JWT (`customer_jwt`) is stored in `sessionStorage`.
- **Cart & Wishlist:** Persisted in MySQL tables (`carts`, `cart_items`, `wishlist`) using guest session IDs stored in a temporary browser session cookie (`storefront_session_id`) and forwarded via `X-Session-ID`.
- **Checkout & Orders (Major Fallback):** Real backend order placement is completely bypassed due to validation errors and missing props, falling back to client-generated `KB-XXXXXX` random strings.

### 2.2 Field Name & Type Mismatches
1. **Address Line 1:** Frontend `address.address_line_1` vs Backend `address.line1`.
2. **City:** Frontend `address.city` vs Backend `address.city_district`.
3. **Address Loading:** Frontend `def.address_line_1` and `def.city` vs Backend response `line1` and `city_district`.
4. **Product Price on Details Page:** `ProductDetails.jsx` lines 248–249 uses fallback `|| 299` and `Math.round(retailPrice * 1.8)` instead of actual database column values.

### 2.3 Inactive & Deleted Products Filtering
- **Listing:** [ProductController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/ProductController.php) lines 40–47 checks `isStaff()`. If not staff, automatically sets `channel = 'ecommerce'` and `is_active = 1`. [ProductService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/ProductService.php) lines 26, 57–59 strictly filters `p.deleted_at IS NULL AND p.is_active = 1 AND p.is_ecommerce_enabled = 1`. Inactive products do not appear in listings.
- **Detail:** [ProductController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/ProductController.php) lines 59–61 rejects inactive or ecommerce-disabled products with a 404 for non-staff callers.
- **Categories:** [CategoryService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/CategoryService.php) filters `c.deleted_at IS NULL AND c.status = 'ACTIVE'`.

### 2.4 Server-Side Price, Discount, Tax & Stock Calculations
- **Server Calculations:** `PricingService::resolveUnitPrice` resolves price by customer type (`RETAIL` vs `WHOLESALE`). `OrderService::computeTotals` calculates line totals, product discounts, coupon discounts, referral rewards, inclusive/exclusive GST taxes, and shipping fees.
- **Correctness Discrepancies:**
  - `OrderService.php` uses hardcoded shipping constants (₹50 / ₹500 free threshold) instead of the database delivery settings (₹49 / ₹499 free threshold).
  - `CartDrawer.jsx` computes coupon discounts using hardcoded percentages (10%, 20%) entirely on the client side.

### 2.5 Stock Decrement, Cart & Order Logic Atomicity
- **Cart Additions:** [CartService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/CartService.php) does not check stock availability when adding items to `cart_items`. Customers can add arbitrarily large quantities.
- **Order Placement:** [OrderService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/OrderService.php) calls `InventoryService::apply` with `SELECT ... FOR UPDATE` inside a database transaction, enforcing `reserved <= on_hand`. If checkout were reachable, it would be atomic and prevent overselling.
- **Runtime Oversell Reality:** Because checkout currently fails and falls back to fake order IDs, stock is never decremented or reserved in MySQL.

### 2.6 Disconnected UI Controls
1. **Profile Navigation Tiles:** "My Orders", "Wishlist", and "Addresses" tiles on [apps/storefront/src/pages/customer/Profile.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/customer/Profile.jsx) lines 212–244 all link to `/` (Home page).
2. **Home Sections Dynamic Configuration:** `fetchHomeSections()` in `Home.jsx` line 8 is never called; sections are hardcoded in JSX.
3. **Checkout Payment Method:** Payment radios in `CheckoutModal.jsx` (COD / UPI / Card) do not pass the selected method to the API.

### 2.7 Authentication & IDOR Analysis
- **Customer Endpoints:** All customer data endpoints (`/api/customers/me`, `/api/customer/addresses`, `/api/customers/orders`, `/api/customers/referral/apply`) require valid JWT bearer tokens and bind queries to `claims['sub']`.
- **Address Ownership:** `updateAddress` and `deleteAddress` strictly check `WHERE id = :id AND customer_id = :cid`. One customer cannot read, update, or delete another customer's address.
- **Order Viewing:** `OrderController::show` checks `if ($claims['type'] === 'customer' && (int) $order['customer_id'] !== (int) $claims['sub']) { Response::error('Forbidden', 403); }`. One customer cannot view another customer's order.
- **Payment Confirmation Bypass:** `POST /api/orders/{id}/confirm-payment` allows any customer to mark their own order as `PAID` without payment gateway verification.

---

## 3. Phase 4 Findings Log

| ID | Severity | Title | Location (file::method) | Evidence | Impact | Verified or Suspected |
|---|---|---|---|---|---|---|
| FLOW-01 | Critical | Customer Checkout Blocked by Address Field Name Mismatch | `CheckoutModal.jsx::handlePlaceOrder` vs `OrderService.php::checkout` | [CheckoutModal.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/CheckoutModal.jsx) lines 114–115 sends `address_line_1` and `city`. [OrderService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/OrderService.php) lines 58–62 requires `line1` and `city_district`, throwing `RuntimeException: Address field 'line1' is required`. | Real database order placement fails 100% of the time for every customer. | VERIFIED |
| FLOW-02 | Critical | Fake Random Order Generator (`KB-XXXXXX`) Masks Order Creation Failures | `CheckoutModal.jsx::handlePlaceOrder` | [CheckoutModal.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/CheckoutModal.jsx) lines 122–138 catches backend checkout failure with `.catch(() => null)` and generates a client-side random ID: `KB-` + `Math.floor(100000 + Math.random() * 900000)`. | Customers see "Order Confirmed!" modal, but no order, line items, or customer address are stored in MySQL. Orders are lost. | VERIFIED |
| FLOW-03 | Critical | Missing `cartData` Prop on Home and Shop Triggers Instant Fake Order Fallback | `Home.jsx` line 548, `Shop.jsx` line 564 | [Home.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/Home.jsx) line 548 and [Shop.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/Shop.jsx) line 564 render `<CheckoutModal isOpen={isCheckoutOpen} onClose={...} />` without `cartData`. | `items` evaluates to empty `[]`. `if (token && items.length > 0)` evaluates to `false`, bypassing backend checkout and triggering fake order generation even for logged-in users. | VERIFIED |
| FLOW-04 | Critical | Complete Absence of Customer Order Journey (History, Tracking, Cancellation) | `apps/storefront/src/App.jsx`, `apps/storefront/src/pages/customer/Profile.jsx` line 212 | [App.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/App.jsx) contains zero order routes. [Profile.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/customer/Profile.jsx) line 212 links "My Orders" to `<Link to="/">`. Backend endpoints `/api/customers/orders`, `/api/orders/{id}`, `/api/orders/{id}/cancel` are never called. | Customers cannot view past orders, track deliveries, view invoices, or request cancellations after purchase. | VERIFIED |
| FLOW-05 | Critical | Absence of Variant Selection Controls on Product Details Page | `ProductDetails.jsx` lines 243–245 | [ProductDetails.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/ProductDetails.jsx) lines 243–245 hardcodes `product.variants.find((v) => v.is_default) || product.variants[0]`. No UI controls (size, color, weight) exist. Variant image galleries are ignored. | Customers cannot select or purchase any non-default variant (e.g. sizes, colors, packs). | VERIFIED |
| FLOW-06 | High | Insecure Payment Confirmation Endpoint Allowing Free Order Mark-As-Paid | `OrderController.php::confirmPayment`, `OrderService.php::confirmPayment` | [OrderController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/OrderController.php) lines 101–119 & [OrderService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/OrderService.php) lines 205–258 require no payment gateway reference or signature verification. Only checks customer ID ownership. | Any customer can call `POST /api/orders/{id}/confirm-payment` for their own order and mark it `PAID` without actually transferring funds. | VERIFIED |
| FLOW-07 | High | Hardcoded Client-Side Coupon Bypass in Cart Drawer | `CartDrawer.jsx::handleApplyCoupon` | [CartDrawer.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/CartDrawer.jsx) lines 69–79 hardcodes checks for `COMBO20`, `SAVE20`, `WELCOME10`, `FIRST10` and calculates discounts client-side. Does not query `/api/coupons`. | Legitimate database coupons fail in CartDrawer, while fake coupons apply locally and fail later during checkout. | VERIFIED |
| FLOW-08 | High | Shipping Fee & Free Shipping Threshold Backend/Database Discrepancy | `OrderService.php` lines 23–24, 542 vs `SettingsController.php` lines 48–66 | [OrderService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/OrderService.php) hardcodes `FLAT_SHIPPING = '50.00'` and `FREE_SHIPPING_ABOVE = '500.00'`. [SettingsController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/SettingsController.php) serves database values (499.00 / 49.00). | Orders between ₹499 and ₹500 show free delivery in UI, but backend adds ₹50 shipping, causing calculation mismatches. | VERIFIED |
| FLOW-09 | High | Saved Address Pre-Fill Broken in CheckoutModal Due to Column Name Mismatches | `CheckoutModal.jsx` lines 44–48 vs `CustomerAuthController.php::getAddresses` | [CheckoutModal.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/CheckoutModal.jsx) reads `def.address_line_1` and `def.city`. [CustomerAuthController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/CustomerAuthController.php) lines 606–609 returns `line1` and `city_district`. | Saved customer addresses fail to pre-fill into checkout form fields; fields remain blank. | VERIFIED |
| FLOW-10 | Medium | Cart Additions Lack Stock Availability Validation | `CartService.php::addItem` | [CartService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/CartService.php) lines 112–116 executes `INSERT INTO cart_items ... ON DUPLICATE KEY UPDATE quantity = quantity + :quantity2` without checking `inventory.available`. | Customers can add quantities exceeding physical on-hand inventory to their cart. | VERIFIED |
| FLOW-11 | Medium | Disconnected Navigation Tiles on Customer Profile Page | `Profile.jsx` lines 212–244 | [Profile.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/customer/Profile.jsx) lines 212–244 links "My Orders", "Wishlist", and "Addresses" tiles to `<Link to="/">`. | Customers clicking account tiles are unexpectedly redirected to the homepage. | VERIFIED |
| FLOW-12 | Medium | Hardcoded Price and MRP Fallbacks in Product Details Page | `ProductDetails.jsx` lines 248–249 | [ProductDetails.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/ProductDetails.jsx) lines 248–249 uses fallback `|| 299` and `Math.round(retailPrice * 1.8)`. | Products with price 0 or missing variants display fabricated ₹299 retail price and ₹538 MRP. | VERIFIED |
| FLOW-13 | Low | Dynamic Home Sections API Unused by Home Page | `Home.jsx` lines 8, 96–106 vs `HomeSectionController.php` | [Home.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/Home.jsx) imports `fetchHomeSections()` but never calls it; sections are hardcoded in JSX. | Admin configuring home section order or visibility in admin panel has no effect on storefront. | VERIFIED |
| FLOW-14 | Low | Selected Payment Method Not Passed in Checkout API Payload | `CheckoutModal.jsx` lines 104–120 | [CheckoutModal.jsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/CheckoutModal.jsx) gathers `formData.paymentMethod` but omits it from `orderPayload`. | Backend receives no record of customer's chosen payment method (COD vs UPI vs Card). | VERIFIED |

---

## 4. Priority Customer Journey Summary

1. **Browse Real Products:** **FUNCTIONAL.** Products, categories, banners, search, and pagination load real MySQL data. However, product details lack variant selection controls (FLOW-05), and price fallbacks to ₹299 on missing variants (FLOW-12).
2. **Register & Login:** **FUNCTIONAL.** Mobile OTP verification, password hashing, Google OAuth, and guest-to-customer cart/wishlist merge execute end-to-end. Plaintext OTP storage in database remains a concern (ARCH-05).
3. **Add to Cart:** **FUNCTIONAL.** Items persist in MySQL database `carts` and `cart_items` for both guest sessions and logged-in customers. Cart drawer lacks dynamic backend coupon integration (FLOW-07) and does not validate available stock (FLOW-10).
4. **Checkout:** **CRITICALLY BROKEN.** Blocked by address field mismatches (`address_line_1` vs `line1`), missing `cartData` props on Home/Shop, and saved address pre-fill mismatches. All checkouts fall back to fake random order IDs (`KB-XXXXXX`) without creating database orders (FLOW-01, FLOW-02, FLOW-03, FLOW-09).
5. **View Orders:** **NON-EXISTENT.** The customer storefront contains no order history page, order details page, cancellation flow, or delivery tracking interface (FLOW-04, FLOW-11).
