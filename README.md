# Unified POS + E-Commerce System

One shop (single branch) selling accessories, gifts, toys and related
products. One PHP REST API + one MySQL database, shared by three
independent frontends. Full spec: [docs/DOCUMENTATION.md](docs/DOCUMENTATION.md)
(and the shorter source brief at [docs/SHOP_FEATURES_REQUIREMENTS.md](docs/SHOP_FEATURES_REQUIREMENTS.md)).

## Architecture

```
apps/admin        React (Vite) — admin panel, own login, own routes
apps/pos          React (Vite) PWA — cashier billing, keyboard + hardware optimized
apps/storefront   Next.js — customer-facing e-commerce (SSR/SSG for SEO)
backend/          ONE PHP REST API (PDO, JWT auth, role-based authorization)
packages/shared/  Shared UI components, API client, types — no business logic
database/         Migrations + seed for the single MySQL database
bridge/           Optional local print/scanner bridge (Node.js, shop PC)
docs/             Full specification this build follows
```

Pricing, GST, coupon, inventory and ledger logic live **only** in the
backend. All three apps call the same API and the same database; none of
them may compute money values independently.

## Non-negotiable rules (see docs section 26 for the full list)

- No Product Line, Route, City or Branch concept anywhere.
- Frontend is never trusted for selling price, discount, coupon, GST, stock
  or grand total — the backend recalculates everything.
- All stock changes go through one `InventoryService`, each writing an
  immutable `inventory_movements` row.
- Critical operations (sale, purchase, invoice, cancellation, return,
  payment) run inside DB transactions.
- Deleted invoice numbers are reused (lowest gap first); cancelled invoice
  numbers are never reused.

## Setup

### Backend

```bash
cd backend
composer install
copy .env.example .env        # edit DB_*, JWT_SECRET, etc.
mysql -u root -p -e "CREATE DATABASE unified_pos CHARACTER SET utf8mb4;"
# migrations land in Phase 2 — see database/README.md
php -S localhost:8000 -t public   # or serve public/ via Apache/XAMPP
curl http://localhost:8000/api/health
```

### Admin / POS (Vite)

```bash
cd apps/admin   # or apps/pos
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

Phase 1 (section 27): monorepo skeleton, three app shells, backend skeleton
with a working `/api/health` route, env examples, this README. Database
schema, auth, and every feature module land in the following phases, in
the order defined in docs section 27.
