# Admin + POS

React (Vite) app — Admin Panel and POS Billing in one app with role-based
access (ECOMMERCE_POS_ADMIN_SPEC.md section 1). Talks to the backend at
`VITE_API_BASE_URL` (see `.env.example`); never computes money values
itself — every price/discount/tax/total shown comes straight from the
API response.

## Stack

- React 19 + Vite + TypeScript
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- `react-router-dom` for routing
- `axios` for API calls (auth token attached by a request interceptor in
  `src/lib/api.ts`; a 401 response clears the token and redirects to
  `/login`)

## Structure

```
src/
  lib/
    api.ts       axios instance, token storage, apiErrorMessage() helper
    auth.tsx     AuthProvider/useAuth — current user, login/logout, permission check
    types.ts     shared TS types matching backend API shapes
  components/
    ui.tsx       Button/TextField/Select/Modal/Card/Badge/... primitives
    Layout.tsx   sidebar + topbar shell (used by every authenticated route)
  pages/         one file per route
```

## Setup

```bash
npm install
copy .env.example .env   # point VITE_API_BASE_URL at your backend
npm run dev
```

Sign in with the seeded admin login (`database/seed/0001_seed.sql`):
`admin@example.com` / `Admin@123`.

## Built so far

- Auth: login, session restore via `/api/auth/me`, logout, role/
  permission-aware nav.
- Dashboard: live summary cards from `/api/dashboard/summary`.
- Categories: list, create, activate/deactivate.
- Subcategories: list, create with multi-category mapping (checkbox
  list against `category_subcategory`), activate/deactivate.
- Products: list (click a row to open it); a sectioned Create screen
  (Basic Info/Classification/Pricing & Tax/Specifications) with a
  category chip-picker (click a chip's star to set the primary category),
  a subcategory picker live-filtered to only subcategories mapped to the
  selected categories, bullet points, and a Simple vs. Variable product
  type toggle — then redirects to the product's detail page.
- Product detail page (`/products/:id`): everything that needs a real
  product ID first —
  - **Product images**: drag-drop or click-to-browse upload, set
    primary, delete (promotes the next image to primary automatically).
  - **Variants** (variable products): pick attribute values as chips,
    "Generate Combinations" creates the full cartesian product in one
    call (skips any combination that already exists rather than
    erroring), inline price editing per row, and a **per-variant "Manage
    Images" modal** — scoped to exactly that variant's own gallery,
    never another variant's.
  - **Specifications**: free-form name/value rows, saved as a whole list.
  - Simple products get an inline Pricing & Inventory card instead of
    the variant table (SKU/MRP/price directly, stock shown read-only
    from the real inventory ledger).

- Sidebar nav is grouped (Catalog / Sales / Inventory / Marketing) now
  that the page count has grown past a flat list.
- Coupons (`/coupons`): list + create modal — code, name, discount
  type/value, min order, max discount, usage limits, first-order-only,
  can-combine-with-referral, and a category multi-select. The backend
  always re-validates and recomputes the discount at checkout; this form
  only sets the rules.
- Orders (`/orders`, `/orders/:id`): list with a status filter and
  clickable rows; detail page shows items, status history, totals,
  shipping address, and status-update/cancel actions (disabled once an
  order is CANCELLED/DELIVERED/REFUNDED).
- Suppliers (`/suppliers`): simple list + create modal.
- Purchases (`/purchases`): list + create form — pick a supplier, then
  scan/type a SKU or barcode and press Enter to add a line (reuses
  `/api/variants/lookup`, the same endpoint POS billing will use).
- Stock Adjustments (`/stock-adjustments`): list of past adjustments
  (grouped by adjustment, with system/counted/difference per item) +
  the same scan-based create flow. The frontend only ever sends
  `variant_id` and `counted_qty` — `product_id` is resolved server-side
  from the variant's own inventory row (see `database/README.md` for
  the bug this fixed).
- Referral Settings (`/referral-settings`): settings form (enable
  toggle, discount percentages, caps, reward trigger, validity,
  code prefix) plus a live report panel from `/api/reports/referrals`.

- Banners (`/banners`): card grid with a thumbnail, position/target
  badges, and a "Manage" modal per banner — desktop/mobile image upload,
  editing the title/position/link target (product, category,
  subcategory, brand, coupon, or an external URL), and attaching
  products to the banner's landing page with per-product offer text.
- Home Sections (`/home-sections`): ordered list (↑/↓ reorder) of home
  page layout blocks. Best Sellers/Combos/Deals are selectable but
  flagged "not wired up yet" in the UI — those have no backend yet
  either (see `database/README.md`).
- Tax (`/tax`): GST rates and HSN codes, previously only reachable
  through Excel import's auto-create. Creating a GST rate only asks for
  the name, the overall %, and tax mode — CGST/SGST/IGST are
  auto-computed with the same half/half/full split
  `ProductImportService` already uses, rather than asking the admin to
  type three more numbers that are almost always derived from the first.

Not built yet: editing a product's basic info/classification after
creation, POS billing screens, a unified Reports page, and a non-coupon
automatic discount engine — see `docs/ECOMMERCE_POS_ADMIN_SPEC.md`.
