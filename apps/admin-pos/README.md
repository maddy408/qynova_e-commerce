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
- Products: list (click a row to open it); an 8-step Create wizard
  (Basic Info / Classification / Images / Type & Variants / Inventory /
  E-commerce & Shipping / SEO & Visibility / Review & Save) with a
  category chip-picker (click a chip's star to set the primary category),
  a subcategory picker live-filtered to only subcategories mapped to the
  selected categories, and a Simple vs. Variable product type toggle.
  Images are staged client-side with a main-image picker; for Variable
  products, attribute values are picked as chips right in Create. Saving
  creates the product, its variant(s) (generating every attribute
  combination for Variable), uploads the staged images, and sets
  specifications — all in one submit, then redirects to the product's
  detail page for anything that needs further per-variant tuning.
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
- Stock Adjustments (`/stock-adjustments`): a searchable card grid of
  every product variant, each with a −/[count]/+ stepper (the input is
  also directly editable) initialized to its current system quantity.
  Only cards whose count actually changed get submitted; a sticky
  "N item(s) changed" bar appears with Discard/Stock Adjustment actions,
  and confirming asks for one shared reason, previews the diff per item,
  then submits all changed items in one call. Below that, the list of
  past adjustments (grouped by adjustment, with system/counted/
  difference per item) is unchanged. The frontend only ever sends
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

- Reports (`/reports`): pulls together the dashboard analytics endpoints
  that existed since Phase 2 but had no UI consuming them — a sales
  chart (daily/weekly/monthly, plain CSS bars, no charting library),
  top-selling products/categories, an estimated gross-profit card,
  customer analytics (one-time vs. returning, top customers), the
  referral report, the refund summary, and recent sales/orders.
- Sale (`/sale`): POS billing — customer picker (walk-in by default,
  search by name/phone), barcode/SKU/name search with Enter-adds-first-
  match, category pill filters, a product grid with live stock, a cart
  panel with qty steppers and a coupon code field, and a payment modal
  (method from the Payment Methods master, amount paid, partial-payment
  aware) that calls the existing `POST /api/invoices/pos-sale` and lands
  on the new invoice's print view. Pricing automatically follows the
  selected customer's type (RETAIL/WHOLESALE) server-side — there's no
  manual price-type toggle, unlike some POS UIs, because the backend
  already resolves that from the customer.
- Invoices (`/invoices`, `/invoices/:id`): a list (filterable by
  channel) and a print-formatted detail view with A4/Thermal (80mm)
  toggle, Print button, and a WhatsApp share link when the invoice has a
  customer phone number — mirroring the two-format tax-invoice layout
  common to POS systems. Print CSS hides the app chrome (sidebar,
  toolbar) so only the invoice itself prints.
- Payment Methods (`/payment-methods`): the master list Sale's payment
  modal and (eventually) other payment pickers read from — code, display
  name, active/inactive.
- Users (`/users`): staff account management — create cashiers and
  admins, assign a role, reset a password, deactivate (blocks login,
  keeps history — never a hard delete, same pattern as every other
  master in this app).
- Deliveries (`/deliveries`, `/deliveries/:id`): order fulfillment —
  list with a status filter, detail view with shipping address,
  courier/AWB/tracking link, full status history, and a status-update
  control. A "Create Delivery" / "View Delivery" card on the Order
  Detail page is the entry point (only shown once an order is PAID).
  Updating a delivery's status automatically moves the parent order's
  status too (e.g. marking a delivery ASSIGNED flips the order to
  PACKED) — that sync was already in the Phase 2 backend, this just
  gives it a screen.

Not built yet: editing a product's basic info/classification after
creation, and a non-coupon automatic discount engine — see
`docs/ECOMMERCE_POS_ADMIN_SPEC.md`.
