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
