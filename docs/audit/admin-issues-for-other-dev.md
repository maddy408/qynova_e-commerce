# Admin / Backend Setup Discrepancies for Admin Developer

## Overview

This document records the backend port and environment configuration discrepancies identified across `start-backend.bat`, `README.md`, and `apps/admin-pos/`. Per instructions, `apps/admin-pos/` and `start-backend.bat` were left untouched for the developer working on the Admin application.

---

## 1. Discrepancy: Backend Port Mismatch (`start-backend.bat` vs `README.md`)

- **`start-backend.bat` (Current Runtime Script):**
  - Specifies port **8080**:
    ```bat
    echo Starting Qynova Backend API on http://0.0.0.0:8080...
    php -S 0.0.0.0:8080 -t public public/index.php 2>nul || ... -S 0.0.0.0:8080 ...
    ```
- **`README.md` Lines 84–86 (Documentation):**
  - Instructs running on port **8000**:
    ```bash
    php -S localhost:8000 -t backend/public
    curl http://localhost:8000/api/health
    ```
  - Also note that the document instructs `-t backend/public` (assuming execution from repo root), while `start-backend.bat` executes `cd /d %~dp0backend` then `-t public public/index.php`.
- **Action Needed by Admin Developer:**
  - Update `README.md` lines 84-86 to port `8080` (or whichever standard port team standardizes on), matching `start-backend.bat`.

---

## 2. Discrepancy: Admin-POS Environment and Fallback Configuration

- **`apps/admin-pos/src/lib/api.ts` Lines 9–13:**
  - Currently falls back to port **8080**:
    ```typescript
    if (typeof window !== 'undefined' && window.location.hostname) {
      return `http://${window.location.hostname}:8080/api`
    }
    return 'http://localhost:8080/api'
    ```
- **`apps/admin-pos/.env.example` Line 1:**
  - Defines:
    ```
    VITE_API_BASE_URL=http://localhost:8080/api
    ```
- **Missing `.env` File (DEF-25):**
  - `apps/admin-pos/` contains only `.env.example`, not a `.env` file. Developers cloning or starting Admin-POS rely entirely on the fallback in `api.ts`.
- **Action Needed by Admin Developer:**
  - If backend runs on port 8080 (via `start-backend.bat`), Admin-POS's fallback already points to `http://localhost:8080/api`. Ensure `.env` is created or documented during local onboarding.
  - If backend port is changed, update `apps/admin-pos/src/lib/api.ts` and `apps/admin-pos/.env.example` accordingly.

---

## 3. Storefront Status (FYI)

- `apps/storefront/src/lib/api.js` has had its default fallback updated from `http://localhost:8000/api` to `http://localhost:8080/api` in both `API_BASE_URL` and `resolveImageUrl` to align with `start-backend.bat` and Admin-POS.

---

## 4. Admin Backend Bug: `ReturnsController::storePurchaseReturn` NOT NULL Violation (DB-02 / DEF-28)

- **File:** `backend/src/Controllers/ReturnsController.php`
- **Method:** `public function storePurchaseReturn(): void` (line 256)
- **Evidence:**
  ```php
  $this->pdo->prepare(
      'INSERT INTO purchase_return_items (
          purchase_return_id, purchase_item_id, product_id, variant_id, quantity, unit_price, line_total, reason
      ) VALUES (
          :return_id, :item_id, :product_id, :variant_id, :quantity, :unit_price, :line_total, :reason
      )'
  )->execute([
      'return_id' => $returnId,
      'item_id' => $item['purchase_item_id'] ?? null, // <-- purchase_item_id is NOT NULL in database schema!
  ```
- **Schema Constraint:** `database/migrations/0020_returns_finance_brand_categories.sql` line 34 defines:
  `purchase_item_id BIGINT UNSIGNED NOT NULL`
- **Impact:** Any purchase return created from the Admin panel crashes with a SQL PDOException error (`Column 'purchase_item_id' cannot be null`) whenever `purchase_item_id` is omitted in the request payload.

---

## 5. Admin Address Field Inconsistency: `address_line_1` vs `line1` (DEF-01 / DEF-13)

- **Files:** `apps/admin-pos/src/pages/customers/CustomerDetail.tsx`, `apps/admin-pos/src/pages/pos/CheckoutModal.tsx`
- **Method:** Customer address payload handlers and address form state
- **Evidence:** Admin forms save addresses with keys `address_line_1` and `city`, while the authoritative database table `customer_addresses` (created in `database/migrations/0002_customers.sql`) defines:
  ```sql
  line1 VARCHAR(255) NOT NULL,
  line2 VARCHAR(255) NULL,
  city_district VARCHAR(100) NOT NULL,
  ```
- **Impact:** Backend `OrderService::checkout` previously failed validation when `address_line_1` was sent instead of `line1`. A backward-compatible alias fallback has now been implemented on the customer-facing side, but Admin POS address editors should align to either use `line1`/`city_district` directly or preserve both.

---

## 6. Admin Inventory Movements Trigger vs Transactions Architecture (DB-04)

- **Files:** `database/migrations/0007_inventory.sql`, `database/migrations/0024_inventory_batches.sql`, `apps/admin-pos/src/pages/inventory/Batches.tsx`
- **Evidence:** Migration 0007 defines an append-only trigger on `inventory_movements` preventing updates/deletes. Migration 0024 introduced a completely separate table `inventory_transactions` without syncing movements.
- **Impact:** Batch adjustments performed in the Admin inventory batches interface do not log to `inventory_movements`, creating disjoint inventory audit ledgers.

