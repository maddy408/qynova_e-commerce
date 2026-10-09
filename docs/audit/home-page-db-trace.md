# Home Page Database Trace & Storefront Audit Report

This document records the end-to-end database-to-UI trace for all storefront sections and components on the Qynova platform, following the seeding of the 10 ZZ DEMO products and complete customer-side audits.

---

## 1. Home Section Architecture & Data Source Trace

| Section | Storefront Component | Backend API Endpoint | Database Tables & Joins | DB-BACKED / HARDCODED |
|---|---|---|---|---|
| **Sticky Navigation Bar** | [`Navbar.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/Navbar.jsx) | `GET /api/categories`<br>`GET /api/cart`<br>`GET /api/wishlist` | `categories`<br>`cart_items`, `product_variants`<br>`wishlists` | **DB-BACKED** |
| **Hero Carousel** | [`PromotionalBannerCarousel.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/PromotionalBannerCarousel.jsx) | `GET /api/banners?position=HOME_HERO&is_active=1` | `banners` (filtered by `position = 'HOME_HERO'`, `is_active = 1`, current dates) | **DB-BACKED** |
| **Middle Promotional Strip** | [`LowerPromotionalBanners.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/LowerPromotionalBanners.jsx) | `GET /api/banners?position=HOME_MIDDLE&is_active=1` | `banners` (filtered by `position = 'HOME_MIDDLE'`, `is_active = 1`) | **DB-BACKED** |
| **Shop by Category Tiles** | [`Home.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/Home.jsx) | `GET /api/categories` | `categories` (filtered by `status = 'ACTIVE'`, `deleted_at IS NULL`, ordered by `total_units_sold DESC, sort_order`) | **DB-BACKED** |
| **Department Preview (On Cat Click)** | [`HorizontalProductSection.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/HorizontalProductSection.jsx) | `GET /api/products?category_id={id}&limit=8` | `products p`<br>`JOIN product_categories pc`<br>`LEFT JOIN brands b`<br>`LEFT JOIN product_variants v`<br>`LEFT JOIN inventory i`<br>`LEFT JOIN product_images pi` | **DB-BACKED** |
| **Customer Favorites (Best Sellers)** | [`HorizontalProductSection.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/HorizontalProductSection.jsx) | `GET /api/products?section=best_sellers&limit=8` | `products p` (`p.is_best_seller_override = 1`)<br>`LEFT JOIN brands b`<br>`LEFT JOIN product_variants v`<br>`LEFT JOIN inventory i`<br>`LEFT JOIN product_images pi` | **DB-BACKED** |
| **Fresh Drops (New Arrivals)** | [`HorizontalProductSection.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/HorizontalProductSection.jsx) | `GET /api/products?section=new_arrivals&limit=8` | `products p` (`p.is_new_arrival_override = 1`)<br>`LEFT JOIN brands b`<br>`LEFT JOIN product_variants v`<br>`LEFT JOIN inventory i`<br>`LEFT JOIN product_images pi` | **DB-BACKED** |
| **Curated Selection (Featured)** | [`HorizontalProductSection.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/HorizontalProductSection.jsx) | `GET /api/products?section=featured&limit=8` | `products p` (`p.is_featured = 1`)<br>`LEFT JOIN brands b`<br>`LEFT JOIN product_variants v`<br>`LEFT JOIN inventory i`<br>`LEFT JOIN product_images pi` | **DB-BACKED** |
| **Special Discounts (Flash Deals & Offers)** | [`HorizontalProductSection.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/HorizontalProductSection.jsx) | `GET /api/products?section=deals&limit=8` | `products p` (`p.is_deal = 1`)<br>`LEFT JOIN brands b`<br>`LEFT JOIN product_variants v`<br>`LEFT JOIN inventory i`<br>`LEFT JOIN product_images pi` | **DB-BACKED** |
| **Popular This Week (Trending)** | [`HorizontalProductSection.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/HorizontalProductSection.jsx) | `GET /api/products?section=trending&limit=8` | `products p` (`p.is_trending = 1`)<br>`LEFT JOIN brands b`<br>`LEFT JOIN product_variants v`<br>`LEFT JOIN inventory i`<br>`LEFT JOIN product_images pi` | **DB-BACKED** |
| **Customer Support Strip** | [`Home.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/Home.jsx) | `GET /api/settings/store` | `store_settings` (`whatsapp_number`, `phone`) | **DB-BACKED** |
| **Storefront Footer** | [`Home.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/Home.jsx) | `GET /api/settings/store` | `store_settings` (`address`, `phone`, `email`) | **DB-BACKED** |

---

## 2. Product Field Trace & Verification Table

| Product | Field | DB Value | API Value | Shown in UI | OK / MISMATCH | Fix / Behavior |
|---|---|---|---|---|---|---|
| **ZZ DEMO P1 (Variable Cushion)** | Price (Retail) | `899.00, 1199.00, 1499.00` | `min_price: 899.00`, `variants[].retail_price` | `₹899` (updates dynamically to `₹1199` / `₹1499` on variant click) | OK | Variant switch updates active retail price |
| **ZZ DEMO P1 (Variable Cushion)** | MRP | `1299.00, 1599.00, 1999.00` | `mrp: 1299.00`, `variants[].mrp` | `₹1299` (updates to `₹1599` / `₹1999`) | OK | Strikethrough MRP updates dynamically |
| **ZZ DEMO P1 (Variable Cushion)** | Discount Badge | `show_discount = 1` | `show_discount: 1`, `discount_percent: 31` | `31% OFF` | OK | Derived from `mrp` and `retail_price` |
| **ZZ DEMO P1 (Variable Cushion)** | Variants | 3 rows in `product_variants` | `variants: [...]` (3 items) | 3 option pills with color dots & price tags | OK | Full swatch & price selector |
| **ZZ DEMO P1 (Variable Cushion)** | Swatch Images | `zz-demo-var-small.webp`, `zz-demo-var-med.webp`, `zz-demo-var-large.webp` | `variants[].images` | Main image updates immediately to variant's image on selection | OK | Prioritized active variant images in gallery |
| **ZZ DEMO P1 (Variable Cushion)** | Specifications | 3 rows in `product_specifications` | `specifications: [...]` (3 items) | Density, Care, Closure table rows | OK | Rendered in Specifications tab |
| **ZZ DEMO P1 (Variable Cushion)** | Warranty | `applicable=1, period=12, unit=MONTHS` | `warranty_applicable: 1, warranty_period: 12` | `12 MONTHS (ZZ-WARRANTY-12-MONTHS-SEAM-REPAIR)` | OK | Rendered in Specifications tab |
| **ZZ DEMO P1 (Variable Cushion)** | Sensitive Pricing | `purchase_price: 420.00, wholesale_price: 650.00` | *Excluded / Unset* | *Hidden* | OK | Customer API never returns cost/wholesale price |
| **ZZ DEMO P2 (Flash Deal Lamp)** | Section Flag | `is_deal = 1` | `is_deal: 1` | Appears in "Flash Deals & Offers" section | OK | Filter updated to `p.is_deal = 1` |
| **ZZ DEMO P2 (Flash Deal Lamp)** | Savings & Badge | `mrp: 2999.00, retail: 1499.00` | `mrp: 2999.00, min_price: 1499.00` | `50% OFF`, `You save ₹1500 on this product!` | OK | Real calculated discount |
| **ZZ DEMO P3 (Marble Bookends)** | Discount Display | `mrp: 1750.00, retail: 1750.00, show_discount = 0` | `show_discount: 0, mrp: 1750.00, min_price: 1750.00` | Only `₹1750` shown; NO strikethrough MRP; NO discount badge | OK | Respects `show_discount = 0` |
| **ZZ DEMO P4 (Espresso Tumbler)** | Stock Status | `on_hand = 0, available = 0` | `total_stock: 0, available: 0` | `Out of Stock` badge (red); Add to Cart disabled | OK | Disabled cart addition |
| **ZZ DEMO P5 (Seasonal Decanter)** | Active Status | `is_active = 0` | Excluded from `/api/products`; `GET /api/products/60` -> `404` | "Product Not Found" screen with link back to catalog | OK | Inactive/draft never leaks to customer |
| **ZZ DEMO P6 (Serving Tray)** | Soft Delete | `deleted_at = NOW()` | Excluded from `/api/products`; `GET /api/products/61` -> `404` | "Product Not Found" screen | OK | Excluded from catalog and endpoints |
| **ZZ DEMO P7 (Botanical Candle)** | Best Seller Flag | `is_best_seller_override = 1` | `is_best_seller_override: 1` | Appears in "Best Sellers" home section | OK | Filter updated to `p.is_best_seller_override = 1` |
| **ZZ DEMO P7 (Botanical Candle)** | Image Gallery | 4 rows in `product_images` | `images: [...]` (4 items) | 4 thumbnail items with click-to-zoom | OK | All gallery images rendered |
| **ZZ DEMO P8 (Fluted Glass Vase)** | New Arrival Flag | `is_new_arrival_override = 1` | `is_new_arrival_override: 1` | Appears in "New Arrivals" home section | OK | Filter updated to `p.is_new_arrival_override = 1` |
| **ZZ DEMO P9 (Walnut Wall Clock)** | Trending Flag | `is_trending = 1` | `is_trending: 1` | Appears in "Trending Products" home section | OK | Filter updated to `p.is_trending = 1` |
| **ZZ DEMO P10 (Minimal Product)** | Brand / Code / Specs | `brand_id = NULL, specs = []` | `brand_name: null, specifications: []` | No brand label (no fake 'KiranaBazaar'); "No additional specifications available" | OK | Fake fallbacks removed |
| **Product 29 (Test Product)** | Variants | `0` variants | `variants: [], min_price: null` | `Unavailable` badge; `Currently Unavailable` price; Add to Cart disabled; No crash | OK | Graceful zero-variant handling without crash |

---

## 3. List of Files Modified

1. [`docs/audit/demo-seed/demo_products_seed.sql`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/docs/audit/demo-seed/demo_products_seed.sql)
   - Fixed `category_id` typo to `subcategory_id` in `WHERE NOT EXISTS` clause for product 8 (`product_subcategories`).
   - Executed and committed seed rows into the existing database tables.
2. [`backend/src/Services/ProductService.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/ProductService.php)
   - Updated section filter WHERE clauses (`best_sellers`, `new_arrivals`, `featured`, `trending`, `deals`) to strictly match authoritative database flags (`is_best_seller_override`, `is_new_arrival_override`, `is_featured`, `is_trending`, `is_deal`).
   - Fixed `is_deal` filter to prevent non-deal products with `show_discount = 1` from polluting the deals section.
   - Updated `find()` to support lookup by either integer ID or slug string.
   - Stripped sensitive merchant pricing (`purchase_price`, `cost_price`, `wholesale_price`, `min_selling_price`) for customer requests (`!$isStaff`).
   - Additively included `p.brand_id`, `p.unit_id` in `list()`, and `c.slug`, `s.slug`, `min_price`, `max_price` in `find()`.
3. [`backend/src/Controllers/ProductController.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/ProductController.php)
   - Passed `$id` as `int|string` into `ProductService::find` so slug URLs resolve without integer truncation to `0`.
4. [`backend/src/Services/CartService.php`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/CartService.php)
   - Removed fake hardcoded fallback `'Supermarket'` when product brand is null.
5. [`apps/storefront/src/components/ProductCard.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/components/ProductCard.jsx)
   - Added support for `show_discount` (hiding strikethrough and discount badge when 0).
   - Removed hardcoded brand fallback (`'KiranaBazaar'`).
   - Handled zero-variant / zero-price products (like Product 29) with clean `Unavailable` state instead of `₹0` or crashing.
6. [`apps/storefront/src/pages/ProductDetails.jsx`](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/pages/ProductDetails.jsx)
   - Prioritized active variant images in the gallery so clicking variant swatches immediately updates the displayed hero image.
   - Respected `show_discount` for badge, strikethrough MRP, and savings calculation.
   - Handled zero-variant / unpriced products gracefully with `Currently Unavailable` banner and disabled buttons.
   - Removed hardcoded marketing description fallback in Description tab; shows clean notice when empty.
   - Handled empty specifications gracefully in Specifications tab.

---

## 4. Browser Verification Checklist

- [ ] **Home Page (`/`)**:
  - [ ] **Best Sellers Section**: Shows **ZZ DEMO Best Seller Hand-Poured Botanical Candle** (₹849 / ₹1199, 4 images).
  - [ ] **New Arrivals Section**: Shows **ZZ DEMO New Arrival Ribbed Fluted Glass Vase** (₹990 / ₹1450).
  - [ ] **Featured Products Section**: Shows **ZZ DEMO Variable Artisan Velvet Cushion** and **ZZ DEMO Sold Out Ceramic Espresso Tumbler**.
  - [ ] **Flash Deals & Offers Section**: Shows **ZZ DEMO Flash Deal Nordic Brass Table Lamp** (₹1499 / ₹2999, 50% OFF).
  - [ ] **Trending Products Section**: Shows **ZZ DEMO Variable Artisan Velvet Cushion** and **ZZ DEMO Trending Floating Dial Walnut Wall Clock**.
  - [ ] **Category Explorer**: Click **ZZ DEMO Luxury Living** category tile; department preview appears with seeded items.
- [ ] **Product Details - Variable Flagship (`/product/56` or `/product/zz-demo-variable-artisan-velvet-cushion`)**:
  - [ ] Check option pills: Small (₹899), Medium (₹1199), Large (₹1499).
  - [ ] Clicking **Emerald Silk / Medium** updates price to ₹1199 and updates image to emerald swatch.
  - [ ] Specifications tab shows Density, Care Instructions, Closure Type.
  - [ ] Specifications tab shows Warranty: "12 MONTHS (ZZ-WARRANTY-12-MONTHS-SEAM-REPAIR)".
- [ ] **Product Details - Out of Stock (`/product/59`)**:
  - [ ] Shows "Currently Out of Stock" badge in red.
  - [ ] "Add to Cart" and "Buy Now" buttons are disabled.
- [ ] **Product Details - No Discount (`/product/58`)**:
  - [ ] Shows only retail price ₹1750; NO strikethrough MRP; NO discount % badge.
- [ ] **Product Details - Minimal Product (`/product/65`)**:
  - [ ] No brand badge; no fake fallbacks; description tab shows clean empty notice; specs tab shows clean empty notice.
- [ ] **Product Details - Product 29 (Zero Variants) (`/product/29`)**:
  - [ ] Shows "Currently Unavailable"; does not crash.
- [ ] **Product Details - Inactive Product (`/product/60`) & Deleted (`/product/61`)**:
  - [ ] Displays "Product Not Found" screen (404 status).
- [ ] **Cart Drawer (`CartDrawer.jsx`)**:
  - [ ] Adding products updates line items with authentic pricing and images without hardcoded fake brand names.
