# Phase 1 Audit Report: Project Map & Architecture

**Date:** 2026-10-09  
**Auditor:** Antigravity (Advanced Agentic AI Assistant)  
**Project:** `qynova_e-commerce` (`unified_pos`)  
**Scope:** Phase 1 of 5 — Project Map, Architecture, Monorepo Structure, and Environment Consistency.

---

## Safety & Pre-Audit Verification

Before conducting the audit, repository state was verified in accordance with the Safety Rules:
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
- **Environment and Secret Handling:** Variable names were inspected without reading or printing secret values. No tokens, database passwords, API credentials, or customer data were printed or documented.
- **Operations:** Read-only inspection of source code, configuration files, and migrations. No destructive commands, migrations, or test queries modifying data were executed.

---

## 1. Folder-by-Folder Purpose, Language/Framework & Key Dependencies

| Folder / Path | Primary Purpose | Language & Framework | Key Dependencies | Verified Status |
|---|---|---|---|---|
| `apps/admin-pos` | Unified web interface combining Admin Panel (management of catalog, inventory, customers, deliveries, coupons, finance, reports) and POS Billing screen (`/sale`). | TypeScript, React 19, Vite 8, React Router v7, Tailwind CSS v4 | `react` (^19.2.8), `react-dom` (^19.2.8), `react-router-dom` (^7.18.4), `axios` (^1.20.0), `@tailwindcss/vite` (^4.3.3), `oxlint` (^1.81.0) | **VERIFIED** (traced in [package.json](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/package.json) and [App.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/App.tsx)) |
| `apps/storefront` | Customer-facing e-commerce storefront providing product browsing, cart drawer, checkout modal, customer OTP signup/login, order tracking, and content pages. *(Note: Documented as Next.js, but actually implemented as Vite React SPA)*. | JavaScript (JSX), React 19, Vite 6, React Router v7, Tailwind CSS v4 | `react` (^19.2.8), `react-dom` (^19.2.8), `react-router-dom` (^7.18.4), `axios` (^1.20.0), `tailwindcss` (^4.0.0), `@tailwindcss/vite` (^4.0.0) | **VERIFIED** (traced in [package.json](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/package.json) and [vite.config.js](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/vite.config.js)) |
| `backend` | Unified REST API serving both Admin-POS and Storefront. Encapsulates all pricing, inventory transactions, authentication, invoicing, and reporting logic. | PHP >= 8.1 (Custom architecture using PSR-4 autoloading; no external MVC framework like Laravel or Symfony) | `firebase/php-jwt` (^7.2), `vlucas/phpdotenv` (^5.6), `phpoffice/phpspreadsheet` (^5.10) | **VERIFIED** (traced in [composer.json](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/composer.json) and [public/index.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php)) |
| `database` | Schema definition, SQL migrations, seed scripts, and migration runner for the single MySQL database (`unified_pos`). | SQL, PHP | PDO MySQL driver, `vlucas/phpdotenv` | **VERIFIED** (traced in [database/migrate.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/database/migrate.php) and [database/migrations/](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/database/migrations/)) |
| `bridge` | Hardware bridge service placeholder for connecting local receipt thermal printers and WiFi barcode scanners on the shop LAN. | Node.js (Planned) | Currently contains only [bridge/README.md](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/bridge/README.md) (Unimplemented Phase 6+ module) | **VERIFIED** (empty directory aside from documentation) |
| `packages/shared` | Monorepo shared package stub meant for shared UI components, API client, and TypeScript interfaces. | TypeScript | Empty placeholder package; not referenced by either app | **VERIFIED** (traced in [packages/shared/package.json](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/packages/shared/package.json) and [packages/shared/src/index.ts](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/packages/shared/src/index.ts)) |
| `docs` | System specifications, business logic requirements, and feature definitions. | Markdown | N/A | **VERIFIED** (contains `DOCUMENTATION.md`, `ECOMMERCE_POS_ADMIN_SPEC.md`, `SHOP_FEATURES_REQUIREMENTS.md`) |
| Root / Scripts | Root automation and startup utilities (`start-backend.bat`, `migrate_0027.php`, `migrate_collections.php`, `migrate_quick_sale.php`). | Batch, PHP | Windows Command Line, PHP CLI | **VERIFIED** (traced in repo root) |

---

## 2. Backend Structure & Architectural Layers

The backend is structured under `backend/src/` into four namespaces: `App\Controllers`, `App\Services`, `App\Middleware`, and `App\Helpers`. There is no heavyweight framework; the architecture relies on PSR-4 autoloading via Composer.

### 2.1 Entry Point & Request Lifecycle
- **Entry File:** [backend/public/index.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php).
- **Execution Flow:**
  1. Built-in PHP server check (`php_sapi_name() === 'cli-server'`): returns `false` if requested URI points to an existing static file under `backend/public/` (lines 5–10).
  2. Autoloading initialized via `vendor/autoload.php` (line 12).
  3. Database helper loaded via `config/database.php` (line 13).
  4. Global CORS handling invoked via `CorsMiddleware::handle(...)` (line 48).
  5. `Router` initialized and database singleton `$pdo = db()` resolved (lines 50–51).
  6. Controller instances instantiated and routes registered via `$router->get()`, `$router->post()`, `$router->put()`, `$router->patch()`, `$router->delete()` (lines 53–355).
  7. Route dispatch: `$router->dispatch($_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI'] ?? '/')` wrapped in a global `try...catch (\Throwable $e)` block (lines 356–362).

### 2.2 Router
- **Location:** [backend/src/Helpers/Router.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Helpers/Router.php).
- **Implementation:** Maps HTTP methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) to regular expression routes. Dynamic URI segments such as `{id}` or `{slug}` are converted via `preg_replace('#\{[a-zA-Z_][a-zA-Z0-9_]*\}#', '([^/]+)', $path)` (line 39).
- **Dispatching:** Iterates over registered routes for the matching method; when a regex matches, captured parameters are passed to the handler callable. If no pattern matches, returns `Response::error('Route not found', 404)` (lines 43–57).
- **Limitation:** The router has **no built-in middleware pipeline or filter chain**. All authentication and permission checks must be manually called inside each controller action.

### 2.3 Middleware Chain
Because the router does not support middleware chaining, middleware operates in two distinct ways:
1. **Global CORS Middleware ([backend/src/Middleware/CorsMiddleware.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Middleware/CorsMiddleware.php)):**
   - Executed once at entry in `public/index.php` before route registration.
   - Evaluates incoming `$_SERVER['HTTP_ORIGIN']`. Checks whether it is listed in `config.cors.allowed_origins` or matches localhost/127.0.0.1 regex `#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#`.
   - Sends standard CORS headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials: true`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`).
   - Short-circuits HTTP `OPTIONS` preflight requests immediately with `http_response_code(204); exit;`.
2. **Imperative Authentication Middleware ([backend/src/Middleware/JwtAuthMiddleware.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Middleware/JwtAuthMiddleware.php)):**
   - Invoked manually within controller actions via `JwtAuthMiddleware::authenticate()`.
   - Reads the `Authorization: Bearer <token>` header via `Request::bearerToken()`.
   - Validates signature and expiration using `JwtHelper::verify($token)`.
   - Returns decoded token claims (`sub`, `type`, `role`, `permissions`, etc.) or immediately terminates execution with `Response::error('Unauthorized', 401)`.
3. **Imperative Permission Middleware ([backend/src/Middleware/PermissionMiddleware.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Middleware/PermissionMiddleware.php)):**
   - Invoked manually within controller actions via:
     - `PermissionMiddleware::require($claims, 'permission.code')`: verifies that `$claims['type'] === 'staff'` and that the permission code exists in `$claims['permissions']`.
     - `PermissionMiddleware::requireRole($claims, ...$roles)`: verifies staff role (e.g. `'ADMIN'`, `'CASHIER'`).
     - `PermissionMiddleware::requireCustomer($claims)`: verifies customer claim `$claims['type'] === 'customer'`.
   - Immediately terminates with `Response::error('Forbidden', 403)` on mismatch.

### 2.4 Controllers
- **Location:** `backend/src/Controllers/` (32 controller classes).
- **Role:** Parse incoming HTTP input (`Request::json()`, `$_GET`, route arguments), invoke authentication/authorization guards, delegate business workflows to corresponding Service classes, and formulate HTTP responses using `Response::json()` or `Response::error()`.

### 2.5 Services & Business Logic Layer
- **Location:** `backend/src/Services/` (30 service classes).
- **Role:** Encapsulates all transactional domain rules: pricing calculation, tax application, coupon validations, referral code processing, stock reservation, invoice numbering, refund generation, batch FEFO/FIFO consumption, and supplier purchase receipts.

### 2.6 Models & Repositories (Data Access Layer)
- **Status: VERIFIED (Absence of ORM / Dedicated Models):**
  - There is **no ORM** (such as Doctrine, Eloquent, or Propel) and **no dedicated Model or Repository class directory**.
  - All database interactions are performed directly inside the `Service` classes (and occasionally controllers) using raw SQL prepared statements via standard PHP `PDO` (`$this->pdo->prepare(...)`, `$stmt->execute(...)`, `$stmt->fetch()`).
  - Database connection is managed via a singleton helper function `db(): PDO` in [backend/config/database.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/config/database.php), configured with `PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION`, `PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC`, and `PDO::ATTR_EMULATE_PREPARES => false`.

### 2.7 Authentication Mechanism
The system implements dual independent identity models:
1. **Staff Identity (`users` table):**
   - Handled by [AuthController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/AuthController.php).
   - Validates email and `password_hash` via native `password_verify()`.
   - Joins `roles`, `role_permissions`, and `permissions` to fetch effective staff abilities.
   - Issues JWT token (`sub = user_id`, `type = 'staff'`, `role`, `permissions`) with TTL defaulting to 900 seconds (15 minutes).
2. **Customer Identity (`customers` table):**
   - Handled by [CustomerAuthController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/CustomerAuthController.php).
   - Primary login/registration uses 10-digit mobile number + 6-digit OTP ([OtpService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/OtpService.php)).
   - Password login and Google OAuth token verification ([GoogleAuthService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/GoogleAuthService.php)) are supported.
   - Issues JWT token (`sub = customer_id`, `type = 'customer'`, `phone`, `email`).
3. **Guest Session Identity:**
   - Storefront frontend generates a persistent 32-character hexadecimal guest session identifier transmitted via cookie `storefront_session_id` and custom header `X-Session-ID`.
   - The backend stores guest carts (`carts.session_id`) and guest wishlists (`wishlist.session_id`), merging them upon customer authentication.

### 2.8 Validation Approach
- **Mechanism:** Procedural, ad-hoc validation implemented directly in Controllers and Services.
- **Pattern:** Explicit checks using native PHP functions (`empty()`, `trim()`, `filter_var(..., FILTER_VALIDATE_EMAIL)`, `preg_match()`).
- On failure, services throw `RuntimeException` with descriptive validation messages, which controllers catch and translate to `Response::error($e->getMessage(), 422)`.
- No third-party validation library (e.g. Respect/Validation or Symfony Validator) is installed.

### 2.9 File Upload Handling
- **Service:** [ImageUploadService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/ImageUploadService.php).
- **Validation:**
  - Enforces `UPLOAD_ERR_OK`.
  - Enforces maximum file size of 5MB (`MAX_UPLOAD_BYTES = 5242880`).
  - Sniffs MIME type via `mime_content_type($file['tmp_name'])` against allowed types: `image/jpeg`, `image/png`, `image/webp`. Client-provided MIME types are ignored.
- **Storage & Processing:**
  - Files are given a cryptographically random 32-character hexadecimal name (`bin2hex(random_bytes(16))`).
  - Stored under `backend/public/uploads/{subdir}/` (e.g. `uploads/products`, `uploads/variants`, `uploads/categories`, `uploads/banners`).
  - If the PHP `gd` extension is available, images are automatically converted to WebP format, resized (main max dimension 1200px, thumbnail max dimension 300px), and iteratively compressed toward target sizes configured in `IMAGE_MAIN_TARGET_KB` (default 100KB) and `IMAGE_THUMB_TARGET_KB` (default 30KB).
  - If `gd` is unavailable, the raw file is moved with its native extension.

### 2.10 Error Handling
- **Application Level:** [backend/public/index.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/public/index.php) lines 356–362 wraps route dispatching in a `try...catch (\Throwable $e)` block. Unhandled exceptions are logged with stack trace via `error_log()`. Returns HTTP 500 JSON `{error: "Internal server error"}` (or `$e->getMessage()` if `app.debug` is enabled in config).
- **Controller Level:** Controllers explicitly catch:
  - `PDOException`: Specifically checking SQLSTATE 23000 to return HTTP 409 Conflict (`"A product with this code, slug, or SKU already exists"`).
  - `RuntimeException`: Returns HTTP 422 Unprocessable Entity with the business exception message.
- **Response Format:** Uniform JSON payload `{error: "<message>"}` generated by [Response::error()](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Helpers/Response.php), which immediately calls `exit;`.

---

## 3. Frontend-to-Backend Communication & Client Configuration

### 3.1 Admin + POS Frontend (`apps/admin-pos`)
- **API Client File:** [apps/admin-pos/src/lib/api.ts](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/lib/api.ts).
- **Base URL Resolution:**
  ```typescript
  export function getApiBaseUrl(): string {
    if (import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL.trim() !== '') {
      return import.meta.env.VITE_API_BASE_URL
    }
    if (typeof window !== 'undefined' && window.location.hostname) {
      return `http://${window.location.hostname}:8080/api`
    }
    return 'http://localhost:8080/api'
  }
  ```
- **Auth Token Handling:**
  - Token is stored in browser `localStorage` under key `admin_pos_token`.
  - Axios request interceptor attaches header: `Authorization: Bearer ${token}`.
  - Axios response interceptor intercepts HTTP 401, clears token, and redirects to `/login`.
- **Environment Status:** **Missing `.env` file.** The directory contains only `.env.example`. The application relies entirely on the hardcoded port `8080` fallback.

### 3.2 Storefront Frontend (`apps/storefront`)
- **API Client File:** [apps/storefront/src/lib/api.js](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/lib/api.js).
- **Base URL Resolution:**
  ```javascript
  export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api'
  ```
- **Auth Token & Guest Session Handling:**
  - Customer JWT token is stored in `sessionStorage` under key `customer_jwt` (or in memory fallback `window.__customer_jwt`).
  - Axios request interceptor attaches:
    - `Authorization: Bearer <token>` (if customer is logged in).
    - `X-Session-ID: <session_id>` (32-character hex ID stored in cookie `storefront_session_id`).
- **Environment Status:** File `apps/storefront/.env` exists and defines `VITE_API_BASE_URL` and `VITE_GOOGLE_CLIENT_ID`. However, `apps/storefront/.env.example` mistakenly defines Next.js format variables (`NEXT_PUBLIC_API_BASE_URL=http://localhost/unified-pos/backend/public`).

### 3.3 CORS Setup
- Defined in [backend/src/Middleware/CorsMiddleware.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Middleware/CorsMiddleware.php).
- Evaluates `CORS_ALLOWED_ORIGINS` from `backend/.env` (comma-separated list, e.g. `http://localhost:5173,http://localhost:5174,http://localhost:3000`).
- Regex fallback `#^https?://(localhost|127\.0\.0\.1)(:\d+)?$#` dynamically allows any local port.
- Headers allowed: `Content-Type, Authorization, X-Session-ID, X-Requested-With, Accept, Origin`.
- Credentials allowed: `Access-Control-Allow-Credentials: true`.

---

## 4. Analysis of `bridge/` and `packages/`

### 4.1 `bridge/` Directory
- **Current State:** **Unused / Empty Stub.**
- **Contents:** Contains only [bridge/README.md](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/bridge/README.md).
- **Intended Purpose:** A lightweight Node.js daemon meant to run on the local physical shop PC to relay ESC/POS print jobs over raw TCP sockets (`printer_ip:9100`) and capture WiFi barcode scanner keystrokes via WebSockets when the PHP backend is hosted in the cloud.
- **Usage:** Documented as an optional Phase 6+ component. No code or service exists in this repository.

### 4.2 `packages/` Directory (`packages/shared`)
- **Current State:** **Unused / Empty Placeholder.**
- **Contents:**
  - [packages/shared/package.json](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/packages/shared/package.json) defining `@unified-pos/shared` (version 0.0.0).
  - [packages/shared/src/index.ts](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/packages/shared/src/index.ts) containing only: `export const SHARED_PACKAGE_PLACEHOLDER = true;`.
- **Usage:** Neither `apps/admin-pos` nor `apps/storefront` declares `@unified-pos/shared` as a dependency in their `package.json`, nor do any source files import from it. The monorepo has no configured workspace tooling (e.g. npm workspaces, pnpm workspaces, or Turborepo).

---

## 5. Requirements & Business Rules Alignment (from `docs/`)

The documentation defines a three-tier hierarchy of specifications:
1. `docs/ECOMMERCE_POS_ADMIN_SPEC.md` — Current primary source of truth (2-app layout, mobile OTP auth, referral rewards, variant/coupon/order/delivery/refund rules).
2. `docs/DOCUMENTATION.md` — Original 40-section comprehensive build spec (rules for GST, invoices, inventory ledger, shipping pincodes, non-negotiables).
3. `docs/SHOP_FEATURES_REQUIREMENTS.md` — Initial customer brief.

### Key Business Rules Verified in Code
- **Single Central Database & Logic (VERIFIED):** Both Admin-POS and Storefront communicate with the same backend database; neither frontend computes pricing, tax, or discounts independently.
- **Append-Only Inventory Ledger (VERIFIED):** Triggers on `inventory_movements` prevent `UPDATE` or `DELETE` operations, preserving historical inventory audit trails.
- **Invoice Numbering Gap-Reuse (VERIFIED):** [InvoiceService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/InvoiceService.php) reuses deleted invoice gaps and preserves cancelled invoice numbers permanently using generated column `active_invoice_no`.
- **Delivery ↔ Order Status Synchronization (VERIFIED):** [DeliveryService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/DeliveryService.php) synchronizes order status across shipping stages (`ASSIGNED` → `PACKED`, `PICKED_UP`/`IN_TRANSIT` → `SHIPPED`, `OUT_FOR_DELIVERY`, `DELIVERED`).

### Deviations Between Specifications and Actual Code

| Documented Rule / Spec | Document Location | Actual Implementation in Code | Deviation Analysis | Status |
|---|---|---|---|---|
| **Storefront Architecture:** "apps/storefront Next.js (React) for SEO" | `DOCUMENTATION.md` Section 2, line 21; `README.md` line 40 | `apps/storefront` is built with **Vite 6 + React 19 SPA** ([package.json](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/package.json), [vite.config.js](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/vite.config.js)). Orphan `next-env.d.ts` exists. | Storefront has no server-side rendering (SSR) or static site generation (SSG). Search engine bots receive empty HTML shells, violating the core SEO requirement. | **VERIFIED** |
| **Shared Monorepo Package:** "packages/shared/ Shared UI components, API client, types" | `README.md` lines 42, 5; `DOCUMENTATION.md` Section 2 | `packages/shared/src/index.ts` contains only `export const SHARED_PACKAGE_PLACEHOLDER = true;` | Code duplication exists across frontends (API clients, session management, types) because shared package is completely unmaintained and unused. | **VERIFIED** |
| **Secure Mobile OTP Storage:** "OTP must have: OTP value/hash as appropriate ... do not rely only on frontend validation" | `ECOMMERCE_POS_ADMIN_SPEC.md` Section 2, lines 68–83 | `OtpService.php` line 41–48 explicitly stores raw 6-digit OTP string in `otp_verifications.otp_hash` without hashing. | Security vulnerability. OTPs are stored in plaintext in MySQL. | **VERIFIED** |
| **Backend Port Standard:** "php -S localhost:8000 -t backend/public" | `README.md` line 84 | `start-backend.bat` runs `php -S 0.0.0.0:8080`. Admin-POS defaults to port 8080; Storefront defaults to port 8000. | Incompatible local runtime configurations across documentation, scripts, and frontends. | **VERIFIED** |
| **Supplier Returns System:** Single unified purchase return flow with over-return checks | `DOCUMENTATION.md` Section 11; `PurchaseService.php` | Dual conflicting implementations: `PurchaseService::createReturn` vs `ReturnsController::storePurchaseReturn`. Frontend calls `ReturnsController`. | Bypasses over-return guard and inserts `NULL` into non-nullable foreign key column. | **VERIFIED** |

---

## 6. Local Execution Guide (from Scripts & Documentation)

*(Read-only documentation inspection; no services or data-altering commands were run).*

### 6.1 Backend API
- **Script:** [start-backend.bat](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/start-backend.bat).
  - Navigates to `backend/`.
  - Executes:
    ```cmd
    php -S 0.0.0.0:8080 -t public public/index.php
    ```
- **Manual Setup (from `README.md` / `backend/README.md`):**
  ```bash
  cd backend
  composer install
  copy .env.example .env
  # Note: Adjust DB credentials in .env
  php -S localhost:8080 -t public public/index.php
  # Health check:
  curl http://localhost:8080/api/health
  ```

### 6.2 Database Initialization
- **Prerequisite:** MySQL service running on host and port configured in `backend/.env`.
- **Execution (from repo root):**
  ```bash
  php database/migrate.php
  php database/seed.php
  ```

### 6.3 Admin + POS Frontend
- **Execution (from `apps/admin-pos`):**
  ```bash
  cd apps/admin-pos
  npm install
  copy .env.example .env
  npm run dev
  ```
- **Result:** Vite dev server starts on `http://localhost:5173` (or network host `0.0.0.0`).

### 6.4 Storefront Frontend
- **Execution (from `apps/storefront`):**
  ```bash
  cd apps/storefront
  npm install
  copy .env.example .env
  npm run dev
  ```
- **Result:** Vite dev server starts on `http://localhost:3000`.

---

## 7. Duplicate / Overlapping API Implementations & Shared Backend Code

### 7.1 Purchase Returns (Supplier Returns)
- **Implementation A (Original Service Layer):**
  - **Endpoint:** `POST /api/purchases/{id}/returns`
  - **Controller / Method:** [PurchaseController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/PurchaseController.php) line 292 (`storeReturn`)
  - **Service:** `PurchaseService::createReturn`
  - **Characteristics:** Transactional, updates `purchase_items.returned_quantity`, enforces SQL check constraint `returned_quantity <= quantity`, checks for over-return, and updates inventory movements.
- **Implementation B (New Returns Controller):**
  - **Endpoint:** `POST /api/returns/purchases`
  - **Controller / Method:** [ReturnsController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/ReturnsController.php) line 186 (`storePurchaseReturn`)
  - **Characteristics:** Directly writes to `purchase_returns` and `purchase_return_items` without calling `PurchaseService`. Binds `'purchase_item_id' => null`. Creates manual stock adjustment.
- **Which Implementation the Frontend Actually Calls:**
  - [apps/admin-pos/src/pages/ReturnsPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ReturnsPage.tsx) line 151 explicitly calls:
    ```typescript
    await api.post('/returns/purchases', { ... })
    ```
  - **Conclusion:** Frontend uses **Implementation B**, completely bypassing the validated `PurchaseService` logic in Implementation A.

### 7.2 Sale Returns & Customer Refunds
- **Implementation A (Order / Invoice Cancellation with Auto-Refund):**
  - **Endpoints:** `POST /api/orders/{id}/cancel`, `POST /api/invoices/{id}/cancel`
  - **Controller / Method:** `OrderController::cancel`, `InvoiceController::cancel`
  - **Service:** `RefundService::createForOrder`, `RefundService::createForInvoice`
  - **Characteristics:** Automatic `PENDING` refund generation upon cancellation of paid orders or invoices.
- **Implementation B (Ad-hoc POS Sale Returns):**
  - **Endpoint:** `POST /api/returns/sales`
  - **Controller / Method:** [ReturnsController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/ReturnsController.php) line 50 (`storeSaleReturn`)
  - **Characteristics:** Directly creates a record in `sale_returns` and `sale_return_items`, immediately restocks inventory, and creates a stock adjustment record.
- **Which Implementation the Frontend Actually Calls:**
  - Order details page calls `/api/orders/{id}/cancel`.
  - [apps/admin-pos/src/pages/ReturnsPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ReturnsPage.tsx) line 140 calls `/returns/sales`.

### 7.3 Shared Backend Code Affecting Both Apps
- **Catalog & Product Endpoints:** `GET /api/categories`, `GET /api/subcategories`, `GET /api/products`, `GET /api/products/{id}` are shared. [ProductController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/ProductController.php) lines 23–47 checks whether the caller is staff via `isStaff()`. If not staff, it automatically injects filters `channel = 'ecommerce'` and `is_active = 1`.
- **Shared Inventory Pool:** Both POS sale invoices (`POST /api/invoices/pos-sale`) and Storefront checkout (`POST /api/orders/checkout`) deduct from the same `inventory` table and `inventory_batches` records.

---

## 8. Environment Configuration Problems

1. **Missing `.env` File in `apps/admin-pos`:**
   - [apps/admin-pos](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos) does not have a `.env` file. Only `.env.example` exists.
   - The application relies on fallback code in `apps/admin-pos/src/lib/api.ts` targeting port `8080`.
2. **Mismatched Variable Names in `apps/storefront/.env.example`:**
   - `.env.example` defines `NEXT_PUBLIC_API_BASE_URL=http://localhost/unified-pos/backend/public`.
   - `apps/storefront` is built with Vite, which only exposes variables prefixed with `VITE_` (`import.meta.env.VITE_*`).
   - If a new developer creates `.env` from `.env.example`, the base URL is ignored, causing requests to fall back to `http://localhost:8000/api`.
3. **Conflicting Default Backend Ports:**
   - `start-backend.bat`: starts on port `8080`.
   - `README.md`: documents port `8000`.
   - `apps/admin-pos/src/lib/api.ts`: hardcoded fallback is port `8080`.
   - `apps/storefront/src/lib/api.js`: hardcoded fallback is port `8000`.
   - Starting the backend via `start-backend.bat` breaks Storefront when running without `.env`. Starting the backend via `README.md` breaks Admin-POS.
4. **CORS Configuration on Local Network / Device Testing:**
   - `backend/config/config.php` and `CorsMiddleware.php` only whitelist origins explicitly configured or matching `localhost` / `127.0.0.1`.
   - When testing POS hardware, barcode scanners, or mobile phones on the shop LAN (e.g. `http://192.168.1.X:5173`), requests are rejected with a CORS block unless `CORS_ALLOWED_ORIGINS` in `backend/.env` is updated.

---

## 9. Phase 1 Findings Log

| ID | Severity | Title | Location (file::method) | Evidence | Impact | Verified or Suspected |
|---|---|---|---|---|---|---|
| ARCH-01 | Medium | Storefront Framework Deviation (Vite SPA instead of Next.js SSR) | `apps/storefront/package.json::scripts` | [package.json](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/package.json) lines 6–10 define `"dev": "vite"`, dependencies list `vite: ^6.0.0`, `react-router-dom: ^7.18.4`. No Next.js binary or SSR runtime exists. Orphan `next-env.d.ts` remains. | Storefront lacks SSR/SSG required by `DOCUMENTATION.md` Section 2 for SEO. Search indexing will be impaired. | VERIFIED |
| ARCH-02 | High | Storefront Environment Example Mismatch (`NEXT_PUBLIC_` vs `VITE_`) | `apps/storefront/.env.example` | [apps/storefront/.env.example](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/.env.example) line 1 specifies `NEXT_PUBLIC_API_BASE_URL`. [api.js](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/lib/api.js) line 3 reads `import.meta.env.VITE_API_BASE_URL`. | Any setup derived from `.env.example` will fail to communicate with the backend, falling back to port 8000. | VERIFIED |
| ARCH-03 | Medium | Missing `.env` File in Admin-POS Application | `apps/admin-pos` | Workspace inspection confirmed absence of `apps/admin-pos/.env`. Only `.env.example` exists. | Frontend falls back to hardcoded `localhost:8080`. If backend runs on any other port or domain, API fails silently. | VERIFIED |
| ARCH-04 | High | Port Inconsistency across Startup Script, README, and Clients | `start-backend.bat`::line 4, `README.md`::line 84 | [start-backend.bat](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/start-backend.bat) line 4 specifies port `8080`. [README.md](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/README.md) line 84 specifies port `8000`. [api.js](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/storefront/src/lib/api.js) line 3 falls back to `8000`. [api.ts](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/lib/api.ts) line 12 falls back to `8080`. | Following different setup instructions results in broken API connectivity for either Storefront or Admin-POS. | VERIFIED |
| ARCH-05 | High | Plaintext OTP Storage in Database | `backend/src/Services/OtpService.php::requestOtp` | [OtpService.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Services/OtpService.php) lines 41–52: `INSERT INTO otp_verifications (phone, otp_hash, ...) VALUES (:phone, :otp, ...)`. Plain 6-digit OTP string stored without bcrypt or hash. | Compromise of DB read access exposes active OTPs, allowing customer account takeover. | VERIFIED |
| ARCH-06 | High | Conflicting Duplicate Migration Prefixes and Standalone DDL Scripts | `database/migrations/` | Duplicate prefixes exist: `0019_*` (2 files), `0020_*` (2 files), `0021_*` (2 files), `0022_*` (2 files), `0023_*` (2 files), `0024_*` (2 files), `0025_*` (2 files). Standalone scripts `migrate_0027.php`, `migrate_collections.php`, `migrate_quick_sale.php`, `run_migration_0020.php` execute schema alterations outside `database/migrate.php`. | Fresh database migrations can fail with duplicate column/table errors or out-of-order schema states. | VERIFIED |
| ARCH-07 | High | Schema Violation and Null Foreign Key in Purchase Returns | `backend/src/Controllers/ReturnsController.php::storePurchaseReturn` | [ReturnsController.php](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/backend/src/Controllers/ReturnsController.php) line 256 binds `'purchase_item_id' => null`. Schema in [0012_purchases.sql](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/database/migrations/0012_purchases.sql) line 85 defines `purchase_item_id BIGINT UNSIGNED NOT NULL`. | Under standard MySQL strict SQL mode, creating a supplier return via `/api/returns/purchases` throws a PDOException 500. | VERIFIED |
| ARCH-08 | Medium | Duplicate Purchase Return Implementations | `backend/src/Controllers/ReturnsController.php::storePurchaseReturn` vs `backend/src/Services/PurchaseService.php::createReturn` | Two implementations exist: `PurchaseService::createReturn` (with over-return check and item quantity sync) vs `ReturnsController::storePurchaseReturn` (ad-hoc stock adjustment). [ReturnsPage.tsx](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/apps/admin-pos/src/pages/ReturnsPage.tsx) line 151 calls the latter. | Bypasses over-return protection and causes divergent data models between `purchases` and `stock_adjustments`. | VERIFIED |
| ARCH-09 | Medium | Pricing Column Naming Discrepancy on Product Variants | `database/migrations/0027_customer_pricing_and_batches.sql` line 14 vs `backend/database/migrate_hold_bills.php` line 32 | `0027_customer_pricing_and_batches.sql` defines `normal_price DECIMAL(15,2)`, while `migrate_hold_bills.php` defines `customer_price DECIMAL(12,3)`. | Potential column reference errors or inconsistent pricing values across POS billing and customer price lists. | VERIFIED |
| ARCH-10 | Low | Inactive Placeholder Shared Monorepo Package | `packages/shared/src/index.ts` | [packages/shared/src/index.ts](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/packages/shared/src/index.ts) line 1 contains only `export const SHARED_PACKAGE_PLACEHOLDER = true;`. Not imported by either app. | Monorepo structure does not provide shared code; API client and data structures are duplicated. | VERIFIED |
| ARCH-11 | Low | Empty Hardware Bridge Directory | `bridge/README.md` | [bridge/README.md](file:///c:/Users/ramya/OneDrive/Documents/qynova_e-commerce/bridge/README.md) lines 1–15 document Phase 6+ thermal printer/scanner bridge. No executable code exists. | Hardware printing/scanning over LAN bridge is unavailable. | VERIFIED |
