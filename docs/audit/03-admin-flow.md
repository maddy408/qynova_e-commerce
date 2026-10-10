# Phase 3 Audit Report: Admin-to-Database Flows

> **Document Status:** Complete Audit Report  
> **Environment:** PHP 8.2+ / MySQL 9.4 (`unified_pos` database)  
> **Audit Type:** Read-Only Source Code & Implementation Audit  
> **Date:** October 9, 2026  
> **Codebase Target:** `apps/admin-pos/` (Frontend React/Vite SPA), `backend/src/` (PHP PSR-4 REST API), `database/` (MySQL schema)

---

## 1. Executive Summary & Audit Methodology

This report details **Phase 3 of 5** of the comprehensive system audit for the `qynova_e-commerce` platform. The scope of this phase is strictly focused on auditing the complete end-to-end operational pipeline connecting the Administrative & POS frontend (`apps/admin-pos`) through the backend API (`backend/src/`) to the MySQL database (`unified_pos`).

### Methodological Protocol
Every feature requested in the audit specification was traced continuously through code across six distinct architectural hops:
1. **Admin UI Page / Component:** User interface forms, tables, modals, input handlers, and React state.
2. **API Client & Request Dispatch:** Axios client (`apps/admin-pos/src/lib/api.ts`), HTTP method, endpoint URL, query parameters, and JSON / multipart payload.
3. **Backend Route & Dispatch:** Routing registration in `backend/public/index.php`, HTTP verb binding, parameter extraction.
4. **Middleware & Authorization:** Token parsing, `JwtAuthMiddleware`, and role/permission gates (`PermissionMiddleware`).
5. **Controller & Service Business Logic:** Validation rules, database query execution, transaction boundaries (`beginTransaction` / `commit` / `rollBack`), and error handlers.
6. **Database Schema & Data Persistence:** Affected MySQL tables, columns read/written, primary/foreign key constraints, and soft delete clauses (`deleted_at`).

Every finding is labeled based on direct code inspection as **VERIFIED** (traced in concrete lines of code) or **MISSING** (feature or component does not exist in the codebase).

---

## 2. Master Findings Table

| ID | Severity | Title | Location (file::method) | Evidence | Impact | Status |
|---|---|---|---|---|---|---|
| **ADM-01** | **High** | Staff Customer Endpoints Lack Permission Verification | [CustomerAuthController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/CustomerAuthController.php#L461-L554) (`indexForStaff`, `createForStaff`, `updateForStaff`) | Calls `JwtAuthMiddleware::authenticate()` but omits `PermissionMiddleware::require()` or `requireRole()`. | Any authenticated user possessing a customer JWT can view all customer PII, create accounts, and switch customer pricing tiers (Retail vs Wholesale). | **VERIFIED** |
| **ADM-02** | **High** | Variant SKU Edit in Admin Detail Page Silently Ignored by Backend | [VariantService.php::updateVariant](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/VariantService.php#L144-L167) vs [ProductDetailPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductDetailPage.tsx#L245) | `ProductDetailPage.tsx:245` submits `{ sku, mrp, retail_price }`, but `VariantService.php:146-150` excludes `sku` from `$fields`. | SKU edits submitted by administrators in the UI modal are silently dropped and never saved to MySQL. | **VERIFIED** |
| **ADM-03** | **High** | Product Detail Page Lacks Form or API Call to Edit Core Product Attributes | [ProductDetailPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductDetailPage.tsx) (entire component) | Backend route `PUT /api/products/{id}` exists in [ProductController.php:87](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/ProductController.php#L87), but `ProductDetailPage.tsx` has zero UI controls and never invokes `api.put('/products/...')`. | Once created, administrators cannot edit product title, description, categories, brand, dimensions, return policy, SEO, or active flags from the admin UI. | **VERIFIED** |
| **ADM-04** | **High** | Promotional Offers Feature Completely Lacks Admin UI & Mutation Endpoints | [SettingsController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/SettingsController.php#L90-L119) (`getOffers`, `getFlashDeal`) | Table `offers` has public read endpoints (`GET /api/offers`, `GET /api/offers/flash-deal`), but has zero Admin UI pages and zero `POST`/`PUT`/`DELETE` API endpoints. | Administrators have no way to create, edit, activate, or schedule promotional offers or flash deals without executing manual SQL queries. | **VERIFIED** (Admin MISSING) |
| **ADM-05** | **Medium** | Image URL Helper Prepends Backend Origin Unconditionally, Breaking Seeded Absolute URLs | [ProductsPage.tsx:9-11](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductsPage.tsx#L9-L11), [BannersPage.tsx:8-10](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/BannersPage.tsx#L8-L10), [CategoriesPage.tsx:9-11](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CategoriesPage.tsx#L9-L11) | `imageUrl(path) => `${API_ORIGIN}/${path}`` without checking if `path` begins with `http://` or `https://`. Seed data in `0025_seed_product_images.sql` and `0003_banners_seed.sql` uses Unsplash URLs. | Produces malformed URLs like `http://localhost:8080/https://images.unsplash.com/...`, breaking image previews across all catalog and banner tables for seeded data. | **VERIFIED** |
| **ADM-06** | **Medium** | Product Creation Orchestrates 5 to 10 Client-Side HTTP Calls Without Distributed Rollback | [ProductCreatePage.tsx::handleSubmit](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductCreatePage.tsx#L427-L558) | React sequentially dispatches `POST /products`, multiple `POST /variants`, multiple `POST /inventory/adjustments`, multiple image uploads, and `PUT /specifications`. | If any subsequent call fails (network drop, validation error), the base product and previous variants remain committed, leaving orphaned unpriced/unstocked records. | **VERIFIED** |
| **ADM-07** | **Medium** | Multi-Step Mutations Omit Database Transactions | [ProductService.php::create](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/ProductService.php#L266-L345), [ProductController.php::updatePriceSettings](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/ProductController.php#L148-L177), [SubcategoryService.php::update](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/SubcategoryService.php#L132-L165) | `create()` performs `INSERT INTO products` followed by category/subcategory inserts with no `beginTransaction()`. `updatePriceSettings` runs batch `UPDATE` queries in a non-transactional loop. | Partial database writes on failures; inconsistent category mappings and orphaned records. | **VERIFIED** |
| **ADM-08** | **Medium** | Severe N+1 Query Loops in Admin Master Listings | [SubcategoryService.php:56-59](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/SubcategoryService.php#L56-L59), [MasterDataController.php:32-41](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/MasterDataController.php#L32-L41), [BannerService.php:58-62](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/BannerService.php#L58-L62), [CustomerAuthController.php:484-488](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/CustomerAuthController.php#L484-L488) | `SELECT category_id FROM category_subcategory` executed per subcategory; `SELECT c.id FROM brand_categories` executed per brand; correlated subqueries executed per customer row. | Causes linear database query degradation as catalog and customer database volumes increase. | **VERIFIED** |
| **ADM-09** | **Medium** | Hardcoded `LIMIT 200` Without Pagination Parameters in Orders, Customers, Adjustments | [OrderService.php:422](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/OrderService.php#L422), [CustomerAuthController.php:488](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/CustomerAuthController.php#L488), [InventoryService.php:269](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/InventoryService.php#L269) | Queries append `LIMIT 200` with no `LIMIT :limit OFFSET :offset` logic or `page` calculation. | As soon as an e-commerce store exceeds 200 orders, customers, or stock adjustments, records past 200 become completely invisible in the admin dashboard. | **VERIFIED** |
| **ADM-10** | **Low** | Coupons UI Lacks Start and End Date Inputs; Price Adjustment UI Lacks MRP Input | [CouponsPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CouponsPage.tsx) (form fields), [PriceAdjustmentPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/PriceAdjustmentPage.tsx) | Schema columns `coupons.start_at` and `coupons.end_at` exist in DB, but `CouponsPage.tsx` has no date pickers. `PriceAdjustmentPage.tsx` displays MRP as read-only. | Inability to schedule coupons with valid date windows; inability to modify MRP in batch price adjustments. | **VERIFIED** |

---

## 3. End-to-End Tracing by Feature

### 3.1 Products
* **Admin Page / Component:**
  - Listing: [ProductsPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductsPage.tsx)
  - Creation: [ProductCreatePage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductCreatePage.tsx)
  - Detail & Variants: [ProductDetailPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductDetailPage.tsx)
* **API Client & Method:**
  - Listing: `api.get('/products', { params: { limit: 100 } })` ([ProductsPage.tsx:19](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductsPage.tsx#L19))
  - Creation: `api.post('/products', payload)` ([ProductCreatePage.tsx:430](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductCreatePage.tsx#L430))
  - Detail: `api.get('/products/${id}')` ([ProductDetailPage.tsx:42](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductDetailPage.tsx#L42))
  - Delete: `api.delete('/products/${p.id}')` ([ProductsPage.tsx:28](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductsPage.tsx#L28))
* **Payload Dispatched:**
  ```json
  {
    "name": "string",
    "slug": "string|undefined",
    "product_code": "string|null",
    "short_description": "string|null",
    "description": "string|null",
    "bullet_points": ["string"],
    "tags": "string|null",
    "brand_id": 1,
    "unit_id": 1,
    "category_ids": [1, 2],
    "primary_category_id": 1,
    "subcategory_ids": [5],
    "weight_grams": 500,
    "length_cm": 10, "width_cm": 10, "height_cm": 5,
    "returnable": true, "return_window_days": 7,
    "replacement_available": false, "refund_available": true,
    "shipping_required": true, "cod_available": true,
    "meta_title": "string", "meta_description": "string",
    "is_featured": false, "is_active": true, "show_discount": true
  }
  ```
* **PHP Route & Middleware:**
  - `GET /api/products` -> [index.php:143](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L143) -> `ProductController::index` (No auth required; detects staff token via `isStaff()` heuristic).
  - `POST /api/products` -> [index.php:144](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L144) -> `ProductController::store` (`JwtAuthMiddleware::authenticate()` + `PermissionMiddleware::require($claims, 'catalog.manage')`).
  - `GET /api/products/{id}` -> [index.php:162](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L162) -> `ProductController::show`.
  - `PUT /api/products/{id}` -> [index.php:163](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L163) -> `ProductController::update` (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
  - `DELETE /api/products/{id}` -> [index.php:164](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L164) -> `ProductController::destroy` (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
* **Controller & Service Methods:**
  - `ProductController::store()` invokes [ProductService::create()](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/ProductService.php#L266).
  - Generates unique slug using `uniqueSlug()`.
  - Encodes bullet points via `json_encode()`.
  - Executes `INSERT INTO products`.
  - Invokes `syncCategories()` and `syncSubcategories()`.
* **Database Tables & Columns Written:**
  - `products`: `name`, `slug`, `product_code`, `brand_id`, `unit_id`, `hsn_code_id`, `gst_rate_id`, `short_description`, `description`, `bullet_points`, `tags`, `material`, `length_cm`, `width_cm`, `height_cm`, `weight_grams`, `manufacturer`, `country_of_origin`, `meta_title`, `meta_description`, `seo_keywords`, `expiry_applicable`, `warranty_applicable`, `warranty_period`, `warranty_unit`, `warranty_description`, `returnable`, `return_window_days`, `replacement_available`, `refund_available`, `shipping_required`, `cod_available`, `is_active`, `is_pos_enabled`, `is_ecommerce_enabled`, `is_featured`, `is_trending`, `is_deal`, `show_discount`.
  - Junction: `product_categories` (`product_id, category_id, is_primary`), `product_subcategories` (`product_id, subcategory_id`).
* **Transaction & Soft Delete:**
  - `ProductService::create()` lacks a transaction wrapper (**ADM-07**).
  - Soft delete executed via `UPDATE products SET deleted_at = NOW() WHERE id = :id` ([ProductService.php:415](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/ProductService.php#L415)).
* **Response & Error Handling:**
  - Returns `{"id": 123}` with HTTP status `201 Created`.
  - SQL duplicate key constraint violations (SQLSTATE 23000) caught and mapped to `409 Conflict` ("A product with this code, slug, or SKU already exists"). Missing required names return `422 Unprocessable Entity`.
* **Observed Gaps:**
  - Product-level `gst_rate_id` and `hsn_code_id` inputs in [ProductCreatePage.tsx:478-479](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductCreatePage.tsx#L478-L479) are only dispatched to the variant creation endpoint and never passed in `POST /products`, leaving `products.gst_rate_id` and `products.hsn_code_id` as `NULL`.
  - `ProductDetailPage.tsx` never calls `PUT /api/products/{id}` (**ADM-03**).

---

### 3.2 Categories
* **Admin Page / Component:** [CategoriesPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CategoriesPage.tsx)
* **API Client & Method:**
  - List: `api.get('/categories')` ([CategoriesPage.tsx:35](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CategoriesPage.tsx#L35))
  - Create: `api.post('/categories', { name, description })` ([CategoriesPage.tsx:86](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CategoriesPage.tsx#L86))
  - Update: `api.put('/categories/${id}', { name, description })` ([CategoriesPage.tsx:83](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CategoriesPage.tsx#L83))
  - Status Toggle: `api.put('/categories/${id}', { status: 'ACTIVE'|'INACTIVE' })` ([CategoriesPage.tsx:123](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CategoriesPage.tsx#L123))
  - Delete: `api.delete('/categories/${id}')` ([CategoriesPage.tsx:114](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CategoriesPage.tsx#L114))
  - Image: `api.post('/categories/${id}/image', formData)` ([CategoriesPage.tsx:93](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CategoriesPage.tsx#L93))
  - Remove Image: `api.delete('/categories/${id}/image')` ([CategoriesPage.tsx:97](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CategoriesPage.tsx#L97))
* **PHP Route & Middleware:**
  - `GET /api/categories` -> [index.php:90](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L90) -> `CategoryController::index` (Public endpoint).
  - `POST /api/categories` -> [index.php:92](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L92) -> `CategoryController::store` (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
  - `PUT /api/categories/{id}` -> [index.php:93](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L93) -> `CategoryController::update` (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
  - `DELETE /api/categories/{id}` -> [index.php:94](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L94) -> `CategoryController::destroy` (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
* **Controller & Service Methods:**
  - [CategoryController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/CategoryController.php) delegates to [CategoryService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/CategoryService.php).
  - Creates slug with regex `uniqueSlug()`.
* **Database Persistence:**
  - Table: `categories`.
  - Columns written: `name`, `slug`, `description`, `sort_order`, `status`, `image_path`, `thumb_path`, `deleted_at`.
  - Soft delete: `UPDATE categories SET deleted_at = NOW(), status = 'INACTIVE' WHERE id = :id` ([CategoryService.php:118](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/CategoryService.php#L118)).
* **Response & Errors:**
  - Create returns `{"id": 45}`, status `201`.
  - Update returns `{"updated": true}`.
  - Duplicate name returns `409 Conflict` ("A category with this name already exists").

---

### 3.3 Subcategories
* **Admin Page / Component:** [SubcategoriesPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/SubcategoriesPage.tsx)
* **API Client & Method:**
  - List: `api.get('/subcategories')`
  - Create: `api.post('/subcategories', { name, description, category_ids })`
  - Update: `api.put('/subcategories/${id}', { name, description, category_ids })`
  - Delete: `api.delete('/subcategories/${id}')`
  - Upload Image: `api.post('/subcategories/${id}/image', formData)`
* **PHP Route & Middleware:**
  - `GET /api/subcategories` -> [index.php:99](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L99) -> `SubcategoryController::index` (Public endpoint).
  - `POST /api/subcategories` -> [index.php:101](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L101) -> `SubcategoryController::store` (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
  - `PUT /api/subcategories/{id}` -> [index.php:102](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L102) -> `SubcategoryController::update` (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
  - `DELETE /api/subcategories/{id}` -> [index.php:103](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L103) -> `SubcategoryController::destroy` (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
* **Controller & Service Methods:**
  - [SubcategoryController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/SubcategoryController.php) -> [SubcategoryService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/SubcategoryService.php).
  - `create()` validates `$categoryIds !== []`, starts transaction, inserts into `subcategories`, and invokes `syncCategories()`.
  - `update()` runs field update and `syncCategories()` **without** a transaction (**ADM-07**).
* **Database Persistence:**
  - Tables: `subcategories` (`name, slug, description, sort_order, status, image_path, thumb_path, deleted_at`), `category_subcategory` (`category_id, subcategory_id`).
  - Soft delete: `UPDATE subcategories SET deleted_at = NOW(), status = 'INACTIVE' WHERE id = :id`.
* **Query Performance Issue:**
  - In [SubcategoryService::list](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/SubcategoryService.php#L56-L59), looping through all subcategories to fetch `category_id` from `category_subcategory` creates an **N+1 query problem** (**ADM-08**).

---

### 3.4 Brands
* **Admin Page / Component:** [BrandsPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/BrandsPage.tsx)
* **API Client & Method:**
  - List: `api.get('/brands')` ([BrandsPage.tsx:26](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/BrandsPage.tsx#L26))
  - Create: `api.post('/brands', { name, description, category_ids })` ([BrandsPage.tsx:78](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/BrandsPage.tsx#L78))
  - Update: `api.put('/brands/${editingBrand.id}', { name, description, category_ids })` ([BrandsPage.tsx:72](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/BrandsPage.tsx#L72))
  - Delete: `api.delete('/brands/${id}')` ([BrandsPage.tsx:96](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/BrandsPage.tsx#L96))
* **PHP Route & Middleware:**
  - `GET /api/brands` -> [index.php:108](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L108) -> `MasterDataController::indexBrands` (Public endpoint).
  - `POST /api/brands` -> [index.php:109](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L109) -> `MasterDataController::storeBrand` (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
  - `PUT /api/brands/{id}` -> [index.php:110](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L110) -> `MasterDataController::updateBrand` (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
  - `DELETE /api/brands/{id}` -> [index.php:111](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L111) -> `MasterDataController::destroyBrand` (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
* **Database Persistence:**
  - Tables: `brands` (`id, name, description, deleted_at`), `brand_categories` (`brand_id, category_id`).
  - Both `storeBrand` and `updateBrand` use explicit `beginTransaction()` and `commit()`.
  - Soft delete: `UPDATE brands SET deleted_at = NOW() WHERE id = :id`.
* **Query Inefficiency:**
  - [MasterDataController::indexBrands](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/MasterDataController.php#L32-L41) executes a separate query `SELECT c.id, c.name FROM brand_categories bc JOIN categories c...` for every single brand in a PHP `foreach` loop (**ADM-08**).

---

### 3.5 Prices & MRP
* **Admin Page / Component:**
  - Batch Pricing: [PriceAdjustmentPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/PriceAdjustmentPage.tsx)
  - Product Variant Pricing: [ProductDetailPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductDetailPage.tsx#L245)
* **API Client & Method:**
  - Load Batch Prices: `api.get('/products/price-settings')` ([PriceAdjustmentPage.tsx:35](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/PriceAdjustmentPage.tsx#L35))
  - Save Batch Prices: `api.put('/products/price-settings', { items })` ([PriceAdjustmentPage.tsx:61](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/PriceAdjustmentPage.tsx#L61))
  - Save Variant Single Price: `api.put('/variants/${variant.id}', { sku, mrp, retail_price })` ([ProductDetailPage.tsx:245](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductDetailPage.tsx#L245))
* **PHP Route & Middleware:**
  - `GET /api/products/price-settings` -> [index.php:159](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L159) -> `ProductController::getPriceSettings` (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
  - `PUT /api/products/price-settings` -> [index.php:160](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L160) -> `ProductController::updatePriceSettings` (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
  - `PUT /api/variants/{id}` -> [index.php:183](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L183) -> `VariantController::update` (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
* **Database Persistence:**
  - Table: `product_variants`.
  - Columns written in batch: `retail_price`, `wholesale_price`, `customer_price`.
  - Columns written in single variant update: `barcode`, `mrp`, `retail_price`, `wholesale_price`, `customer_price`, `purchase_price`, `min_selling_price`, `discount_percent`, `discount_amount`, `manufacturing_date`, `expiry_date`, `weight_grams`, `hsn_code_id`, `gst_rate_id`, `variant_description`, `is_default`, `status`.
* **Identified Vulnerabilities & Gaps:**
  - `VariantService::updateVariant` ignores `sku` completely (**ADM-02**).
  - `ProductController::updatePriceSettings` runs batch updates in a loop without a database transaction (**ADM-07**).
  - `getPriceSettings` has no pagination and loads all variants into memory in a single query (**ADM-09**).
  - MRP cannot be edited via `PriceAdjustmentPage.tsx` (**ADM-10**).

---

### 3.6 Stock & Inventory
* **Admin Page / Component:**
  - Inventory Adjustments & Opening Stock: [StockAdjustmentsPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/StockAdjustmentsPage.tsx)
  - Purchases / GRN Stock Inflow: [PurchasesPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/PurchasesPage.tsx)
* **API Client & Method:**
  - List Inventory: `api.get('/inventory', { params: { page, limit, search } })` ([StockAdjustmentsPage.tsx:107](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/StockAdjustmentsPage.tsx#L107))
  - List Adjustments: `api.get('/inventory/adjustments')` ([StockAdjustmentsPage.tsx:140](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/StockAdjustmentsPage.tsx#L140))
  - Save Opening Stock: `api.post('/inventory/opening-stock', { items: payload })` ([StockAdjustmentsPage.tsx:170](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/StockAdjustmentsPage.tsx#L170))
  - Save Adjustment: `api.post('/inventory/adjustments', { reason, items: [{ variant_id, counted_qty }] })` ([StockAdjustmentsPage.tsx:248](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/StockAdjustmentsPage.tsx#L248))
  - Create Purchase (GRN): `api.post('/purchases', purchasePayload)`
* **PHP Route & Middleware:**
  - `GET /api/inventory` -> [index.php:197](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L197) -> `InventoryController::index` (`inventory.view`).
  - `GET /api/inventory/adjustments` -> [index.php:200](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L200) -> `InventoryController::indexAdjustments` (`inventory.view`).
  - `POST /api/inventory/adjustments` -> [index.php:201](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L201) -> `InventoryController::storeAdjustment` (`inventory.adjust`).
  - `POST /api/inventory/opening-stock` -> [index.php:202](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L202) -> `InventoryController::saveOpeningStock` (`inventory.adjust`).
  - `POST /api/purchases` -> [index.php:290](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L290) -> `PurchaseController::store` (`purchases.manage`).
* **Controller & Service Methods:**
  - `InventoryController::storeAdjustment()` -> [InventoryService::createAdjustment()](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/InventoryService.php#L296).
  - Starts transaction. Inserts into `stock_adjustments`. Calculates difference: `$difference = bcsub($countedQty, $systemQty, 3)`. Inserts into `stock_adjustment_items`.
  - Calls `apply()`, updating `inventory.on_hand` and creating `inventory_movements` with `STOCK_ADJUSTMENT_IN` / `STOCK_ADJUSTMENT_OUT`.
  - Purchases flow: [PurchaseService::createPurchase()](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/PurchaseService.php#L145) updates `inventory.on_hand` and writes `movement_type = 'PURCHASE'`.
* **Database Tables Written:**
  - `stock_adjustments`, `stock_adjustment_items`, `inventory`, `inventory_movements`, `purchases`, `purchase_items`, `inventory_batches` (opening only).
* **Observed Gaps:**
  - [PurchaseService::createPurchase()](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/PurchaseService.php#L324-L338) never calls `BatchService` or writes to `inventory_batches`. Batches are completely omitted during purchase GRN receipt.

---

### 3.7 Product Images
* **Admin Page / Component:**
  - Staging: [ProductCreatePage.tsx:534-544](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductCreatePage.tsx#L534-L544)
  - Gallery Management: [ProductDetailPage.tsx:102-145](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductDetailPage.tsx#L102-L145) (`ProductImagesSection`)
* **API Client & Method:**
  - Upload Product Image: `api.post('/products/${id}/images', formData, { headers: { 'Content-Type': 'multipart/form-data' } })`
  - Set Primary: `api.patch('/products/${id}/images/${imageId}/primary')`
  - Reorder: `api.put('/products/${id}/images/reorder', { ordered_ids: [1, 2, 3] })`
  - Delete: `api.delete('/products/${id}/images/${imageId}')`
  - Variant Image Upload: `api.post('/variants/${variantId}/images', formData)`
* **PHP Route & Middleware:**
  - Registered in [index.php:172-175](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L172-L175) -> [ProductImageController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/ProductImageController.php) (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
  - Variant routes in [index.php:189-192](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L189-L192) -> [VariantImageController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/VariantImageController.php) (`JwtAuthMiddleware::authenticate()` + `catalog.manage`).
* **Validation & Storage Pipeline ([ImageUploadService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/ImageUploadService.php)):**
  - Validation: `UPLOAD_ERR_OK`, max file size `5MB` (`5 * 1024 * 1024`), MIME verified via `mime_content_type()` against `image/jpeg`, `image/png`, `image/webp`.
  - Directory: `backend/public/uploads/products/{productId}/` or `backend/public/uploads/variants/{variantId}/`.
  - File Naming: `bin2hex(random_bytes(16))` (32 hex characters) with `.webp` extension.
  - Image Processing: If PHP GD extension is installed, resizes main image to max dimension `1200px` (WebP target 100KB) and thumbnail to `300px` (WebP target 30KB). Fallback copies raw file without GD.
* **Database Tables Written:**
  - `product_images`: `product_id, image_path, thumb_path, sort_order, is_primary`.
  - `variant_images`: `variant_id, image_path, thumb_path, sort_order, is_primary`.
* **URL Construction Defect:**
  - Prepending `${API_ORIGIN}/${path}` fails for seeded external URLs (**ADM-05**).

---

### 3.8 Banners / Hero Carousel
* **Admin Page / Component:** [BannersPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/BannersPage.tsx)
* **API Client & Method:**
  - List: `api.get('/banners')` ([BannersPage.tsx:36](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/BannersPage.tsx#L36))
  - Create: `api.post('/banners', bannerData)`
  - Update / Toggle: `api.put('/banners/${id}', { is_active: 0|1 })` ([BannersPage.tsx:49](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/BannersPage.tsx#L49))
  - Delete: `api.delete('/banners/${id}')` ([BannersPage.tsx:55](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/BannersPage.tsx#L55))
  - Upload Desktop: `api.post('/banners/${id}/image/desktop', formData)`
  - Upload Mobile: `api.post('/banners/${id}/image/mobile', formData)`
  - Add Attached Product: `api.post('/banners/${id}/items', { product_id, offer_text })`
* **PHP Route & Middleware:**
  - `GET /api/banners` -> [index.php:319](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L319) -> `BannerController::index` (Public endpoint).
  - `POST /api/banners` -> [index.php:320](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L320) -> `BannerController::store` (`JwtAuthMiddleware::authenticate()` + `banners.manage`).
  - `PUT /api/banners/{id}` -> [index.php:323](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L323) -> `BannerController::update` (`JwtAuthMiddleware::authenticate()` + `banners.manage`).
  - `DELETE /api/banners/{id}` -> [index.php:324](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L324) -> `BannerController::destroy` (`JwtAuthMiddleware::authenticate()` + `banners.manage`).
* **Database Persistence:**
  - Tables: `banners` (`title, subtitle, description, position, color_theme, discount_text, cta_text, image_desktop_path, image_mobile_path, target_type, target_id, target_url, starts_at, ends_at, sort_order, is_active`), `banner_items` (`banner_id, product_id, offer_text, sort_order`).
  - Target Types Supported: `PRODUCT`, `CATEGORY`, `SUBCATEGORY`, `BRAND`, `COUPON`, `EXTERNAL_URL`, `NONE`.
  - Delete is hard delete (`DELETE FROM banners WHERE id = :id`), cascades to `banner_items`, and unlinks image files from disk.

---

### 3.9 Coupons
* **Admin Page / Component:** [CouponsPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CouponsPage.tsx)
* **API Client & Method:**
  - List: `api.get('/coupons')` ([CouponsPage.tsx:58](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CouponsPage.tsx#L58))
  - Create: `api.post('/coupons', couponPayload)` ([CouponsPage.tsx:91](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CouponsPage.tsx#L91))
  - Toggle Status: `api.put('/coupons/${coupon.id}', { status: 'ACTIVE'|'INACTIVE' })` ([CouponsPage.tsx:117](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CouponsPage.tsx#L117))
* **PHP Route & Middleware:**
  - `GET /api/coupons` -> [index.php:212](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L212) -> `CouponController::index` (`coupons.manage`).
  - `POST /api/coupons` -> [index.php:215](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L215) -> `CouponController::store` (`coupons.manage`).
  - `PUT /api/coupons/{id}` -> [index.php:216](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L216) -> `CouponController::update` (`coupons.manage`).
* **Database Persistence:**
  - Tables: `coupons`, `coupon_products`, `coupon_categories`, `coupon_brands`, `coupon_customers`, `coupon_usages`.
  - Columns written: `code`, `name`, `description`, `discount_type`, `discount_value`, `max_discount_amount`, `min_order_amount`, `start_at`, `end_at`, `usage_limit`, `per_customer_usage_limit`, `first_order_only`, `can_combine_with_product_offer`, `can_combine_with_referral`, `status`.
* **Identified Gaps:**
  - `CouponsPage.tsx` form omits date pickers for `start_at` and `end_at` (**ADM-10**).
  - Admin UI does not have an edit modal to modify existing coupon rules; only creation and status toggle are available.

---

### 3.10 Offers
* **Current Status:** **MISSING IN ADMIN**
* **Detailed Findings:**
  - In MySQL, table `offers` exists with columns: `id`, `title`, `subtitle`, `banner_image`, `discount_label`, `offer_type`, `discount_type`, `discount_value`, `min_order_value`, `max_discount_amount`, `coupon_code`, `start_datetime`, `end_datetime`, `target_category_id`, `target_product_ids`, `is_active`, `created_at`, `updated_at`.
  - Backend has two public storefront endpoints: `GET /api/offers` and `GET /api/offers/flash-deal` in [SettingsController.php:90-119](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/SettingsController.php#L90-L119).
  - **There are zero administrative endpoints (`POST /api/offers`, `PUT /api/offers/{id}`, `DELETE /api/offers/{id}`).**
  - **There is no Admin UI page or component in `apps/admin-pos` to manage offers.**
  - Note: [HomeSectionsPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/HomeSectionsPage.tsx) defines a `'DEALS'` home section type, but marks it explicitly as un-wired (`const UNWIRED = ['BEST_SELLERS', 'COMBOS', 'DEALS']`, line 14).

---

### 3.11 Referral Settings
* **Admin Page / Component:** [ReferralSettingsPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ReferralSettingsPage.tsx)
* **API Client & Method:**
  - Fetch Settings: `api.get('/referral-settings')` ([ReferralSettingsPage.tsx:30](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ReferralSettingsPage.tsx#L30))
  - Fetch Report: `api.get('/reports/referrals')` ([ReferralSettingsPage.tsx:31](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ReferralSettingsPage.tsx#L31))
  - Update Settings: `api.put('/referral-settings', settings)` ([ReferralSettingsPage.tsx:42](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ReferralSettingsPage.tsx#L42))
* **PHP Route & Middleware:**
  - `GET /api/referral-settings` -> [index.php:84](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L84) -> `ReferralController::getSettings` (Unauthenticated public endpoint).
  - `PUT /api/referral-settings` -> [index.php:85](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L85) -> `ReferralController::updateSettings` (`JwtAuthMiddleware::authenticate()` + `settings.manage`).
  - `GET /api/reports/referrals` -> [index.php:86](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L86) -> `ReferralController::report` (`JwtAuthMiddleware::authenticate()` + `reports.financial.view`).
* **Database Persistence:**
  - Table: `referral_settings` (Singleton record `WHERE id = 1`).
  - Columns written: `is_enabled`, `referrer_discount_percent`, `referred_discount_percent`, `max_discount_amount`, `min_order_amount`, `first_order_only`, `reward_trigger`, `referral_validity_days`, `referral_code_prefix`.
  - Related reporting tables: `referrals`, `referral_rewards`, `customers`.

---

### 3.12 Customers
* **Admin Page / Component:** [CustomersPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CustomersPage.tsx)
* **API Client & Method:**
  - List & Search: `api.get('/customers', { params: { search, type } })` ([CustomersPage.tsx:35](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CustomersPage.tsx#L35))
  - Update Customer & Price Tier: `api.put('/customers/${id}', { name, email, customer_type, status })` ([CustomersPage.tsx:58](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CustomersPage.tsx#L58))
* **PHP Route & Middleware:**
  - `GET /api/customers` -> [index.php:71](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L71) -> `CustomerAuthController::indexForStaff`.
  - `POST /api/customers` -> [index.php:72](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L72) -> `CustomerAuthController::createForStaff`.
  - `PUT /api/customers/{id}` -> [index.php:73](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L73) -> `CustomerAuthController::updateForStaff`.
* **Critical Authorization Flaw ([CustomerAuthController.php:461-595](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/CustomerAuthController.php#L461-L595)):**
  - **All three staff endpoints call `JwtAuthMiddleware::authenticate()` but completely omit `PermissionMiddleware::require()` or `PermissionMiddleware::requireRole()`.**
  - Any customer with a valid JWT token can invoke `GET /api/customers` to inspect customer PII and invoke `PUT /api/customers/{id}` to elevate their own or others' tier to `WHOLESALE` (**ADM-01**).
* **Database Persistence:**
  - Table: `customers`. Columns: `name`, `phone`, `email`, `customer_type` (`RETAIL` / `WHOLESALE`), `status` (`ACTIVE` / `INACTIVE`).
  - Query contains hardcoded `LIMIT 200` without pagination parameters (**ADM-09**).

---

### 3.13 Orders
* **Admin Page / Component:**
  - Listing: [OrdersPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/OrdersPage.tsx)
  - Detail & Fulfillment: [OrderDetailPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/OrderDetailPage.tsx)
* **API Client & Method:**
  - List: `api.get('/orders', { params: { status } })` ([OrdersPage.tsx:33](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/OrdersPage.tsx#L33))
  - Detail: `api.get('/orders/${id}')` ([OrderDetailPage.tsx:63](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/OrderDetailPage.tsx#L63))
  - Status Update: `api.patch('/orders/${id}/status', { status: nextStatus })` ([OrderDetailPage.tsx:91](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/OrderDetailPage.tsx#L91))
  - Cancel: `api.post('/orders/${id}/cancel', { reason })`
  - Create Delivery: `api.post('/orders/${id}/delivery', {})` ([OrderDetailPage.tsx:77](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/OrderDetailPage.tsx#L77))
* **PHP Route & Middleware:**
  - `GET /api/orders` -> [index.php:248](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L248) -> `OrderController::index` (`orders.manage`).
  - `GET /api/orders/{id}` -> [index.php:250](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L250) -> `OrderController::show` (Staff: `orders.manage`; Customer: ownership check).
  - `PATCH /api/orders/{id}/status` -> [index.php:253](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L253) -> `OrderController::updateStatus` (`orders.manage`).
  - `POST /api/orders/{id}/cancel` -> [index.php:252](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L252) -> `OrderController::cancel` (`orders.manage` or customer owner).
  - `POST /api/orders/{orderId}/delivery` -> [index.php:305](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php#L305) -> `DeliveryController::store` (`delivery.manage`).
* **Controller & Service Methods ([OrderService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/OrderService.php)):**
  - `updateStatus()` updates `orders.status`, inserts a record into `order_status_history`, and if status is `'DELIVERED'`, invokes `InvoiceService::createFromOrder()`.
  - **Multi-step update lacks a database transaction wrapper** (**ADM-07**).
  - In `DeliveryService::createForOrder()`, orders with `payment_status !== 'PAID'` are rejected ([DeliveryService.php:49](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/DeliveryService.php#L49)), blocking delivery creation for all COD (Cash on Delivery) orders.
* **Database Tables Persisted:**
  - `orders`, `order_items`, `order_status_history`, `stock_reservations`, `deliveries`, `invoices`, `refunds`.
  - Order listing has hardcoded `LIMIT 200` with no pagination parameters (**ADM-09**).

---

## 4. Cross-Cutting Analysis

### 4.1 Admin Fields Not Saved to MySQL
1. **Variant SKU in Detail Modal:** In [ProductDetailPage.tsx:245](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductDetailPage.tsx#L245), editing variant details submits `{ sku, mrp, retail_price }`. However, [VariantService::updateVariant](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/VariantService.php#L146-L150) explicitly excludes `sku` from its whitelist `$fields`, discarding the edited SKU without notifying the administrator.
2. **Product-Level Tax & HSN Codes:** In [ProductCreatePage.tsx:430-458](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductCreatePage.tsx#L430-L458), product-level fields `gstRateId` and `hsnCodeId` are not included in the payload sent to `POST /products`. They are only supplied to the child variants, leaving `products.gst_rate_id` and `products.hsn_code_id` set to `NULL` in the database.
3. **Coupon Date Range:** The MySQL schema for `coupons` includes `start_at` and `end_at`. [CouponsPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CouponsPage.tsx) provides no input fields for dates, meaning all created coupons have `start_at = NULL` and `end_at = NULL`.

### 4.2 Columns Saved But Never Returned by Any API
1. **Product Physical & Warranty Attributes:** `material`, `manufacturer`, `country_of_origin`, and `warranty_description` are saved in `products`, but are never returned in `ProductService::list` and are not typed in the frontend client.
2. **Redundant Purchase Payment Column:** In `purchases`, migration `0022_purchase_payment_update.sql` introduced `amount_paid` alongside the existing `paid_amount`. Both columns are populated on purchase creation, but `amount_paid` is never returned in API responses.

### 4.3 Authorization & Security Gaps
1. **Critical Privilege Escalation in Customer Management:** `CustomerAuthController::indexForStaff`, `createForStaff`, and `updateForStaff` call `JwtAuthMiddleware::authenticate()` but do not check for staff role or permissions. A customer bearer token can query all customers and modify customer records.
2. **Unauthenticated Referral Settings:** `GET /api/referral-settings` has no authentication check, publicly exposing the store's referral business configuration.
3. **Heuristic Staff Check in Product Catalog:** `ProductController::index` and `show` rely on an ad-hoc `isStaff()` method that inspects `claims['role']` without role or permission enforcement.

### 4.4 Image Upload Validation & URL Construction
1. **Server-Side Validation:** Handled centrally by [ImageUploadService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/ImageUploadService.php). Verifies MIME types (`image/jpeg`, `image/png`, `image/webp`), enforces a 5MB limit, and uses randomized 32-character hexadecimal filenames to prevent path traversal.
2. **Missing Metadata Sanitization on Fallback:** When the PHP GD extension is unavailable, raw uploaded files are moved via `move_uploaded_file()` or `copy()` without stripping EXIF metadata or validating inner image byte headers.
3. **URL Prepending Flaw:** Multiple admin pages ([ProductsPage.tsx:9-11](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductsPage.tsx#L9-L11), [BannersPage.tsx:8-10](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/BannersPage.tsx#L8-L10), [CategoriesPage.tsx:9-11](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/CategoriesPage.tsx#L9-L11)) define `imageUrl(path)` by concatenating `${API_ORIGIN}/${path}`. When database seed paths contain absolute URLs (such as Unsplash URLs), the resulting URLs fail to load.

### 4.5 Missing Transactions, Missing Pagination & Query Inefficiencies
1. **Non-Atomic Product Creation:** [ProductCreatePage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ProductCreatePage.tsx) performs 5 to 10 sequential client-side HTTP calls to create a product, variants, inventory adjustments, images, and specifications without an orchestrating backend transaction.
2. **Missing Database Transactions:** Multi-step backend mutations like `ProductService::create` (category linking), `ProductController::updatePriceSettings` (bulk price updates), `SubcategoryService::update`, and `OrderService::updateStatus` run without `beginTransaction()`.
3. **Hardcoded Limits Without Pagination:** `orders`, `customers`, `stock_adjustments`, and `price-settings` queries use hardcoded limits (`LIMIT 200` or no limit) rather than dynamic pagination (`page`, `limit`, `offset`), preventing access to older records once the record count exceeds 200.
4. **N+1 Query Inefficiencies:** `SubcategoryService::list`, `MasterDataController::indexBrands`, `BannerService::list`, and `CustomerAuthController::indexForStaff` perform queries in loops or use correlated subqueries per row.
