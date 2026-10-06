UNIFIED POS + E-COMMERCE SYSTEM
Complete Documentation and Claude Build Prompt (single document, top to bottom)
Project: one shop (single branch) selling accessories, gifts, toys and related products. Stack: ReactJS + PHP
REST API + MySQL. Notifications: Firebase Cloud Messaging (push) + email + SMS/WhatsApp adapters.
Payments: Razorpay. Shipping tracking: third-party API through an adapter. Architecture: three separate
React apps (Admin panel, POS billing, Storefront) -> ONE PHP backend -> ONE MySQL database.
How to use this document as a prompt
You are a senior full-stack engineer. Build a NEW project from scratch, following every section below in order.
Work phase by phase (section 27), test each phase, then commit and push to Git. This document is the single
source of truth: where a rule says "backend", the PHP API decides, never React.
Decisions already taken
Topic 	Decision
Product Line 	Removed completely. Replaced by multi-category + multi-subcategory mapping
(section 7)
Guest mode 	Guests can browse, search, add to cart and wishlist. Login is required when creating
the order (section 4). Orders without login are not supported
Notifications 	Firebase Cloud Messaging (push) is the main channel, email as backup,
SMS/WhatsApp through mock adapter until a provider is bought (section 18)
Storefront
framework
Next.js (React) for SEO. Admin and POS are plain React (Vite)
COD 	Off by default (setting)
Wholesale
customer type
Kept in the backend, hidden from the storefront unless enabled
Branches 	Single branch only. No branch, route or city logic anywhere
1. Overview and Architecture
The system is one unified business platform. POS and E-Commerce are two sales channels that use the same
backend pricing, discount, coupon, GST, inventory, payment, invoice and ledger logic. They must never keep
separate calculations.
Central principle: One database + one backend business logic + multiple React interfaces.
System Overview
The system is a single unified business platform containing:

ADMIN
|
MASTER / SETTINGS
|
COMMON BUSINESS LOGIC
|
+-------------+-------------+
| 	|
POS 	E-COMMERCE
| 	|
SALES 	ORDERS
| 	|
+-------------+-------------+
|
INVENTORY
|
PAYMENTS / CUSTOMER CREDIT
|
INVOICES
|
RETURNS / CANCEL
|
REPORTS / P&L
There must be one common backend business logic. POS and E-Commerce must not maintain separate
pricing, inventory, discount, GST, coupon or financial calculations.
Final Business Flow
ADMIN
┌────────┴────────┐
MASTERS 	SETTINGS
|
PRODUCT / CUSTOMER
|
PRICING / DISCOUNT
|
COUPON
|
COMMON BACKEND
┌──────┴──────┐
POS 	E-COMMERCE
| 	|
SALES 	ORDERS
└──────┬──────┘
INVENTORY
PAYMENT / CREDIT
INVOICES
RETURNS / CANCEL
EXPENSE / INCOME
PROFIT & LOSS
REPORTS

2. Technology Stack and Project Structure
Technology Stack
Frontend
ReactJS, React Router, Axios / Fetch API
Context API / Redux Toolkit where required
Responsive UI, POS keyboard navigation, PDF / Excel export support
Backend
PHP REST API, MySQL
PDO / prepared statements
JWT / secure authentication
Role-based authorization
Transaction-based business operations
Database
MySQL
DECIMAL(15,2) for all monetary values
Foreign keys, proper indexes
Soft-delete where historical data must be retained
Project Structure (monorepo)
Monorepo:
unified-pos/
├── apps/
│ ├── admin/ 	# React: Admin panel (own build, own login, own routes)
│ ├── pos/ 	# React PWA: POS billing (cashier), keyboard + hardware optimized
│ └── storefront/ # React: E-commerce for customers
├── backend/ 	# ONE PHP REST API
├── packages/shared/ # shared UI components, API client, types (no business logic)
├── database/ 	# migrations + seed (single MySQL database)
├── docs/DOCUMENTATION.md # this document
├── bridge/ 	# optional local print/scanner bridge (see section 3)
└── README.md
Admin, POS and Storefront are three independent apps. Each can be deployed on its own URL (e.g.
admin.x.com, pos.x.com, shop.x.com).
All three call the same PHP backend and the same MySQL database. Pricing, GST, coupon, inventory,
ledger logic lives ONLY in backend services.
Backend enforces role per endpoint. Admin app accepts only ADMIN, POS app accepts only CASHIER (and
ADMIN), storefront accepts only CUSTOMER.
Si l b h 	b h id 	t O t 	tti 	d

Single branch: remove any branch_id concept. One store, one settings record.
3. User Roles
Roles and Permissions
ADMIN
Admin has complete access. Admin can manage: Dashboard, Products, Categories, Brands, Subcategorys,
Units, GST, HSN/SAC, Customers, Suppliers, Pricing, Discounts, Coupons, Purchases, Inventory, POS, E-
Commerce, Orders, Invoices, Payments, Customer Credit, Returns, Expenses, Income, Reports, Profit & Loss,
Users, Roles, Permissions, Settings, Audit Logs.
CASHIER
Cashier can access only permitted POS operations.
Cashier can: Login, Search products, Scan barcode, Add products to cart, Change quantity, Select customer,
Apply permitted discount, Apply permitted coupon, Create invoice, Accept payment, Print invoice, View
permitted sales, Process permitted returns.
Cashier cannot: Manage users, Manage roles, Change system settings, Change product cost, Change
inventory directly, Modify financial configuration, Access unrestricted reports, Change coupon rules, Change
pricing master.
Backend must enforce these permissions. Hiding buttons in React is NOT sufficient.
CUSTOMER
Customer can access only E-Commerce.
Customer can: Register, Login, Browse products, Search products, Filter products, View product details, Add
to cart, Apply eligible coupon, Checkout, Manage address, Make payment, View orders, View order status,
Request return, View profile.
Customer must never access: Admin, POS, Purchase cost, Profit, Internal inventory adjustment, Supplier
information, Internal financial reports.
4. Guest Mode (browse as guest, login when creating the order)
Guest mode lets a visitor use the store without an account until they actually place an order.
Guest CAN: open home, categories, subcategories, search and filter, view product pages, check pincode
delivery and shipping estimate, view combos, deals and banners, add items to the cart, add items to the
wishlist, preview a coupon (public coupons only), read CMS pages and FAQ, send the contact form.
Guest CANNOT: place an order, use Buy Now to pay, make payment, see order history or tracking, save
addresses, edit a profile, receive push notifications, use customer-specific coupons, or see wholesale prices.
Storage and pricing for guests
Guest cart and guest wishlist live in browser storage and hold only {variant_id, quantity} (never
prices).
Prices, offers, shipping and totals for a guest cart come from a public, rate-limited, backend-priced
endpoint: POST /api/cart/preview with items and an optional coupon code . It prices as a retail guest.

p 	p 	p 	p 	p _ 	p 	g
Coupon result here is only a preview.
Login gate (the important flow)
1. Guest presses Proceed to Checkout, Buy Now or Place Order and there is no valid session.
2. The app opens the login/register screen (email or phone + password, or Continue with Google) and
remembers return_to (checkout step, or the Buy Now item).
3. After a successful login the backend merges the guest cart and wishlist into the account:
same variant in both: quantities are added, then capped to available stock;
wishlist: duplicates removed;
merge is idempotent (a retry never doubles quantities).
4. The customer returns to the same checkout step. If price, offer, coupon or stock changed during the
merge, show a clear message before payment.
5. Backend rule: every order and payment endpoint requires authentication (HTTP 401 otherwise). The
backend never creates an order for an anonymous caller.
Settings: guest_browsing_enabled (default ON). There is no guest-checkout option.
5. Authentication and Login
Role-based login pages and Continue with Google
Each app has its own login page: Admin login, Cashier login, Customer login. Each has:
Email/phone + password login
Continue with Google button
Google login implementation:
Use Google Identity Services on the frontend to get an ID token. Send it to POST /api/auth/google .
Backend verifies the ID token (signature, aud = our client ID, iss , exp , email_verified ). Never trust
frontend-sent profile fields.
Fetch from Google what is available: sub (google_id), email , name , picture . Phone number is NOT
reliably provided by Google, so if it is missing, set phone = NULL and profile_completed = false .
New user via Google (storefront): auto-create a user with role CUSTOMER, store username (generated
from name, unique), email, name, google_id, and profile photo. Download the Google profile picture on
the server, compress to WebP (section 4) and store it locally, so the app does not depend on Google's
URL.
After first Google login, if phone is missing, show a "Complete your profile" step to collect mobile number
(optional OTP verification, configurable in settings). Do not block browsing, but require phone before
checkout.
Admin and Cashier via Google: NEVER auto-create. Only allow login if the Google email already exists in
users with role ADMIN or CASHIER (created by admin). Otherwise return Forbidden. Reason: otherwise
anyone could become staff.
If an existing user has the same email, link the google_id to that account instead of creating a duplicate.
Issue JWT (short lived access token + refresh token) Audit log LOGIN

Issue JWT (short-lived access token + refresh token). Audit log LOGIN .
Config in .env.example : GOOGLE_CLIENT_ID , GOOGLE_CLIENT_SECRET .
6. Admin Dashboard
Dashboard
Dashboard should show: Today's Sales, Today's Orders, Today's Collection, Customer Outstanding, Low Stock
Products, Total Products, Active Customers, Pending Orders, Cancelled Orders, Returns, Expenses, Income,
Gross Profit, Net Profit, Recent Sales, Recent Orders.
All dashboard values must come from backend APIs.
7. Master Modules (Categories, Subcategories, Brands, Units, GST)
Masters
7.1 Brand Master
Fields: Brand Name, Description, Status. Same duplicate and soft-delete rules apply.
7.2 Unit Master
Examples: PCS, BOX, KG, GRAM, LITRE, ML, PACK.
7.3 GST / HSN Master
Fields: GST %, HSN/SAC, CGST, SGST, IGST, Tax Inclusive / Exclusive. Backend calculates GST. Frontend must
not be treated as the source of truth for GST calculations.
Categories and Subcategories (many-to-many)
Rules
One product can belong to multiple categories and multiple subcategories, chosen at product
creation/edit time.
One subcategory can belong to multiple categories (example: "Kids" under both "Toys" and "Gift Items").
Exactly one primary category per product (used for canonical URL, breadcrumbs and report attribution).
Validation (backend): every selected subcategory must be mapped to at least one of the product's
selected categories. If a category is removed from a product, subcategories that no longer have a selected
parent category are removed automatically (UI shows a confirmation).
Category and subcategory names are unique case-insensitively (subcategory names are global, because a
subcategory can be shared). Support Create, Edit, Activate, Deactivate, Soft Delete, sort order, image, slug.
Soft-delete or unlink is blocked (or requires reassignment) while active products depend on the mapping.
Tables
categories (id, name, slug UNIQUE, description, image_path, sort_order, status, deleted_at, created_a
UNIQUE KEY uq_cat_name (name)) 	-- use a case-insensitive collation (utf8mb4_uni
subcategories (id, name, slug UNIQUE, description, image_path, sort_order, status, deleted_at, create
UNIQUE KEY uq_sub_name (name))
category_subcategory (category_id, subcategory_id, sort_order,
PRIMARY KEY (category id subcategory id) FKs) 	-- subcategory <-> many c

PRIMARY KEY (category_id, subcategory_id), FKs) 	subcategory < > many c
product_categories (product_id, category_id, is_primary TINYINT(1),
PRIMARY KEY (product_id, category_id), FKs) 	-- product <-> many categ
product_subcategories (product_id, subcategory_id,
PRIMARY KEY (product_id, subcategory_id), FKs) 	-- product <-> many subca
Enforce one primary per product in the service layer and with a unique generated column ( primary_flag =
IF(is_primary, product_id, NULL) ).
Admin UI
Product form: multi-select Categories (chips, choose primary), then multi-select Subcategories filtered to
the subcategories mapped to the chosen categories, grouped by category.
Subcategory master: multi-select Parent categories for each subcategory.
Category master: shows its subcategories and product count.
Behaviour
Storefront /category/:slug and /category/:slug/:subSlug list every product mapped to that
category/subcategory. A product shows under all its categories, but its canonical URL uses the primary
category (no SEO duplicate penalty).
Coupons and discounts: "category" and "subcategory" applicability match if any of the product's
categories/subcategories match.
Reports: revenue by category uses the primary category so totals reconcile with total sales. An optional
"any category" view is allowed but must be labelled "totals may overlap".
Product import columns: Categories (separated by | ), Primary Category , Subcategories (separated
by | ). Missing masters auto-created with case-insensitive check.
Seed categories: Hair Accessories, Jewellery & Fashion Accessories, Gift Items, Toys, Bags & Pouches,
Beauty Accessories, Storage & Utility Products, Combo Offers (managed by section 10). Subcategories are
added by admin.
8. Products, Variants, Pricing and Images
Product Master and Variants
Product (shared info): name, slug, short description, full description, material, dimensions (length, width,
height, unit) and weight, tags, image gallery (first = primary; every image goes through section 8 WebP
compression), SEO (meta title, meta description, OG image), flags is_active , is_pos_enabled ,
is_ecommerce_enabled , is_featured , show_discount , optional manual is_best_seller /
is_new_arrival overrides, manufacturing and expiry date where relevant, category + subcategory mappings
(section 7), manual related products.
Variant (sellable unit): product_variants (id, product_id, sku UNIQUE, barcode UNIQUE NULL,
color_name, color_hex, design_name, size_label, mrp, retail_price, wholesale_price,
purchase_price, min_selling_price, image_path, is_default, status, deleted_at) . Stock is per
variant (section 11).
Storefront product page shows: gallery, name, current price with original price and offer badge (section 8
rules), description, material, size/dimensions, colour/design selector (changes price, image, stock), stock

rules), description, material, size/dimensions, colour/design selector (changes price, image, stock), stock
message (In stock / Only N left (when stock <= low-stock threshold) / Out of stock), quantity selector (max
= available stock), Add to Cart, Buy Now, pincode check (section 13), related products.
Related products: manual list first, then automatic fill from products sharing the same category/subcategory
(primary category first), excluding inactive/out-of-stock, limit 8.
PRODUCT PRICE FLOW
Each product can have: Purchase Price, MRP, Retail Price, Wholesale Price, Minimum Selling Price.
Example: MRP ₹100, Retail ₹95, Wholesale ₹85, Purchase ₹70.
Retail customer: ₹95
Wholesale customer: ₹85
Purchase price must never be exposed to customers.
SHOW DISCOUNT / OFFER
Product create/edit page must contain a toggle: Show Discount / Offer [ ON / OFF ].
Example: MRP = ₹12, Selling Price = ₹9, Show Discount = ON. Customer display: ₹12 ₹9 25% OFF .
Discount Amount = 12 - 9 = ₹3
Discount % = (3 / 12) × 100 = 25%
If toggle is OFF: show ₹9 only, no "25% OFF" badge.
Important: Show Discount is only a display/offer visibility control. It must NOT change the actual selling price.
Backend response should provide: mrp , selling_price , discount_amount , discount_percentage ,
show_discount . Frontend should display these values rather than independently deciding business-critical
pricing.
If MRP = Selling Price there is no discount. If Selling Price > MRP, do not show a negative discount.
WHOLESALE CUSTOMER FLOW
Customer Master: Customer Type = Retail or Wholesale. Wholesale customers can be mapped to a wholesale
price configuration.
Example: MRP ₹100, Retail ₹95, Wholesale ₹85. Retail customer pays ₹95, wholesale customer pays ₹85.
Price selection must happen in PHP backend. React must not be allowed to modify the final price. Wholesale
price should not automatically be displayed as a public "offer".
PRICING MASTER
Pricing master manages MRP, Retail Price, Wholesale Price. Backend determines the applicable price based
on: Product + Customer + Customer Type + Configured Pricing.
Product Image Compression to WebP
On every product image upload (and banner, profile photo), backend converts to WebP with GD or
Imagick, resizes (max 1200px longest side for the main image, plus 300px thumbnail), strips EXIF, and
i 	li ( 	80 	d 	40) il h fil i d h 	i i KB ( i 	d f l 100

iterates quality (start 80, step down to 40) until the file is under the target size in KB (settings: default 100
KB main, 30 KB thumbnail).
Validate MIME by content (not extension), max upload size 5 MB, random filenames, store under
uploads/ outside executable paths, store path + size in DB.
Optional client-side pre-compress before upload (canvas to WebP) to save bandwidth, but the backend is
the source of truth.
Return original size, final size and compression ratio in the API response.
9. Discounts and Coupons
DISCOUNT MASTER
Discount types: Percentage, Fixed Amount.
Possible applicability: Product, Category, Brand, Customer, Customer Type, Minimum Quantity, Minimum
Order Amount, Date Range.
No Route/City conditions. Discount stacking must not happen automatically.
COUPON SYSTEM
Coupon fields: Coupon Code, Coupon Name, Discount Type, Discount Value, Applicability, Minimum Purchase
Amount, Maximum Discount, Start Date, End Date, Total Usage Limit, Per Customer Usage Limit, Customer
Eligibility, Customer Type, Active / Inactive, Can Combine With Product Offer.
COUPON APPLICABILITY
Coupon can apply to: Entire Order, Specific Product, Specific Category, Specific Brand, Specific Subcategory,
Specific Customer, Customer Type.
Example: SAVE100, Fixed Discount ₹100, Minimum Purchase ₹1000. Cart ₹999: rejected. Cart ₹1000: accepted.
COUPON VALIDATION
Coupon must be validated twice.
When applying coupon, backend checks: Code exists, Active, Date valid, Customer eligible, Minimum
purchase reached, Usage limit available, Product/category/subcategory/brand matches, Customer type
matches.
During checkout, backend validates everything again. Frontend coupon calculation is only a preview.
PRODUCT OFFER + COUPON
Product offer and coupon are separate concepts. Example: MRP ₹100, Selling ₹90, Product Offer ON, Coupon
₹10.
Whether both can apply depends on "Can Combine With Product Offer". If disabled, coupon cannot
additionally discount the product offer. If enabled, both can be applied according to backend rules. Never
allow accidental double discounting.
Coupon Logic with Partial Cancellation (CRITICAL)
Base coupon rules are in the sections above. Add this rule set, implemented in one CouponService used by

checkout, order cancellation, invoice cancellation and sales return.
Principle: a coupon is valid only while its conditions still hold for the items that remain. After every item
cancel/return, re-validate the coupon against the remaining items.
Allocation: store the coupon discount allocated per order item (proportional to item net amount, rounded
with DECIMAL, the last item absorbs rounding difference) in order_item_discounts .
Algorithm on cancelling/returning one or more items:
1. Compute remaining_subtotal = sum of remaining items' amounts (after product offer, before coupon).
2. Re-check the coupon's minimum_purchase , applicability (product/category/brand/line/customer type),
validity and max discount against the remaining items.
3. If the coupon is still valid: recalculate discount (fixed stays as is; percentage recalculates on remaining,
capped by max discount).
4. If the coupon is no longer valid: coupon discount becomes 0 (revoked). The customer now owes the full
price of the remaining items.
5. new_payable = remaining_subtotal + GST - valid coupon discount.
6. refund_amount = amount_already_paid - new_payable . (Never use "cancelled item price" directly as the
refund.) If the result is negative, never charge extra automatically; flag it for admin review and block the
action with a clear message.
7. Update order totals, ledger, payment/refund record, stock, audit log (store old and new coupon discount,
reason COUPON_REVOKED_MIN_PURCHASE ).
8. Show the user a clear message such as: "Coupon SAVE400 is no longer applicable because your remaining
items total ₹500, below the ₹1000 minimum. Remaining items are charged at full price."
9. Before confirming a cancellation, show a preview (API POST /api/orders/{id}/cancel-preview ) with:
items to cancel, coupon still valid or not, new payable, refund amount. Cancellation requires the user to
confirm the preview.
Worked example (must be an automated test):
3 items totalling ₹1500 (₹500 + ₹500 + ₹500). Coupon: ₹400 off, minimum ₹1000. Paid = ₹1100.
Cancel 1 item: remaining ₹1000, still ≥ ₹1000, so coupon stays. New payable ₹600. Refund ₹500.
Cancel another: remaining ₹500, below ₹1000, so coupon revoked. New payable ₹500. Refund = ₹1100 -
₹500 = ₹600 (not ₹500).
Cancelling directly 2 items from the start: remaining ₹500, coupon revoked, refund ₹600. The remaining
item must NEVER show payment "₹100".
Same logic applies to POS sales return and invoice partial returns, and to purchase of a percentage
coupon (recalculate on remaining).
Edge tests: coupon max discount cap, per-customer usage limit not double-counted after partial cancel,
full cancel restores usage count (configurable), product-specific coupon where the cancelled item is the
only eligible item, rounding on 3-way split, double-click/duplicate cancel request (idempotent).
10. Offers, Combos, Deals, Banners and Home Sections
Combo Offers and Deals

Combo offers: combos (id, name, slug, image_path, combo_price, start_at, end_at, status) and
combo_items (combo_id, variant_id, quantity) . Combo price is set by admin and enforced by
backend; "You save ₹X" is computed. Combo availability = the lowest floor(available / quantity)
across components. When sold, the combo expands into component order items with the combo price
allocated proportionally (so GST, COGS and inventory are correct). Default: a combo is cancelled/returned
as a whole (setting can allow per-component). Combos appear under the "Combo Offers" category page
and home section.
Deals (festival, flash, limited-time): deals (id, name, type FESTIVAL|FLASH|LIMITED, discount_id,
start_at, end_at, show_countdown, banner_id, status) and deal_products . Price and countdown
are time-evaluated by the backend, so a deal ends exactly at end_at even if no cron runs. Deal prices are
shown with the offer badge rules of section 8 and can be linked to a banner (section 10).
Stacking stays controlled (section 9): deal, product offer and coupon never stack unless the configured
flags allow it.
Banners and Discount Items Mapping
Admin, Settings, Banner Management:
Banner fields: title, image (auto WebP compress, desktop and mobile versions), position (home hero,
home middle, category page, popup), start/end date, sort order, active.
Mapping: a banner links to a target type: product | category | brand | subcategory | coupon |
discount_group | external_url | none .
Discount items inside a banner: banner_items table to attach specific products (and optional per-banner
display offer text) to a banner. Clicking a banner opens a landing page listing those items with the offer
shown. Visibility only: pricing still comes from backend.
Storefront home page renders active banners by position and schedule. Backend API: GET /api/banners?
position= .
Settings also holds: store info (single branch), GST/invoice header/footer, hardware (section 3), payment
methods (section 5), shipping provider (section 6), image size targets (section 4), coupon behaviour flags
(section 7), Google login toggles (section 2).
Home Page Sections
home_sections (id, type
BANNER|CATEGORIES|BEST_SELLERS|NEW_ARRIVALS|FEATURED|COMBOS|DEALS|CUSTOM, title, item_limit,
sort_order, status) .
Best sellers: by product_stats.units_sold_30d (or manual flag). New arrivals: created within
new_arrival_days (setting, default 30) or manual flag. Featured: is_featured , with sort order.
product_stats (product_id, units_sold_30d, orders_30d, wishlist_count, view_count,
updated_at) is refreshed by a scheduled job and on order events.
Home also has: logo and brand name, search bar, category tiles, banners (section 10), clear "Shop Now /
View Products" buttons, floating WhatsApp button, mobile-first layout.
11. Purchases and Inventory

PURCHASE FLOW
Supplier -> Purchase -> Purchase Items -> GST / Amount Calculation
-> Inventory Increase -> Supplier Payable -> Purchase Complete
Every stock change creates a stock movement.
Inventory, Inventory History and Transactions (strict design)
Principles
1. One door: all stock changes go through a single InventoryService . No controller, SQL script or other
service may update the stock tables directly.
2. Stock is per variant. Quantities are DECIMAL(15,3) (supports KG/LITRE units).
3. Every stock change writes an immutable ledger row in the same DB transaction as the business change. If
either fails, everything rolls back.
4. The current-stock table is a fast cache of the ledger and must always reconcile with it.
Tables
inventory (
id, variant_id UNIQUE, product_id,
on_hand DECIMAL(15,3) NOT NULL DEFAULT 0,
reserved DECIMAL(15,3) NOT NULL DEFAULT 0,
available DECIMAL(15,3) AS (on_hand - reserved) STORED,
low_stock_threshold DECIMAL(15,3) DEFAULT 5,
updated_at,
CHECK (on_hand >= 0), CHECK (reserved >= 0), CHECK (reserved <= on_hand)
)
inventory_movements ( 	-- inventory history, append-only
id BIGINT PK, variant_id, product_id,
movement_type ENUM('OPENING_STOCK','PURCHASE','PURCHASE_RETURN','SALE','SALE_RETURN',
'ORDER_RESERVE','ORDER_RESERVE_RELEASE','ORDER_CONFIRM','ORDER_CANCEL',
'INVOICE_CANCEL','STOCK_ADJUSTMENT_IN','STOCK_ADJUSTMENT_OUT','DAMAGE','EXPIRED_
on_hand_delta DECIMAL(15,3), reserved_delta DECIMAL(15,3),
on_hand_before DECIMAL(15,3), on_hand_after DECIMAL(15,3),
reserved_before DECIMAL(15,3), reserved_after DECIMAL(15,3),
unit_cost DECIMAL(15,2) NULL,
reference_type ENUM('INVOICE','ORDER','PURCHASE','SALES_RETURN','PURCHASE_RETURN','ADJUSTMENT','RES
reference_id BIGINT, reference_item_id BIGINT NULL,
channel ENUM('POS','ECOMMERCE','ADMIN','SYSTEM'),
reason VARCHAR(255) NULL, note TEXT NULL,
user_id NULL, idempotency_key VARCHAR(100) UNIQUE,
created_at DATETIME(3),
INDEX (variant_id, created_at), INDEX (reference_type, reference_id), INDEX (movement_type, created
)
stock_reservations (
id, order_id, variant_id, quantity,
status ENUM('ACTIVE','CONSUMED','RELEASED','EXPIRED'),
expires_at, created_at, updated_at
)

)
stock_adjustments (id, adjustment_no, reason, status, created_by, approved_by, created_at) -- heade
stock_adjustment_items (id, adjustment_id, variant_id, system_qty, counted_qty, difference_qty)
Block UPDATE and DELETE on inventory_movements using DB triggers. Corrections are made by a new
reversing movement, never by editing history.
InventoryService contract
apply(variant_id, movement_type, on_hand_delta, reserved_delta, reference_type, reference_id,
user_id, channel, reason?, idempotency_key)
Inside the caller's open transaction: SELECT ... FROM inventory WHERE variant_id = ? FOR UPDATE (when
many variants are involved, lock in ascending variant_id order to avoid deadlocks) -> validate (no negative
on_hand, reserved <= on_hand, enough available) -> update inventory -> insert inventory_movements
with before/after. A duplicate idempotency_key returns the original result without applying twice.
Flows
Event 	Effect
Opening stock / Purchase 	on_hand + qty (OPENING_STOCK / PURCHASE)
POS sale 	on_hand - qty (SALE) in the invoice transaction
E-commerce checkout (online
payment)
reserved + qty (ORDER_RESERVE), reservation with expiry
Payment success 	on_hand - qty and reserved - qty (ORDER_CONFIRM), reservation
CONSUMED
Payment failed / abandoned /
expired
reserved - qty (ORDER_RESERVE_RELEASE), reservation
RELEASED/EXPIRED (scheduled job)
Order cancel (before dispatch) on_hand + qty (ORDER_CANCEL), partial cancel per item (section 9)
Invoice cancel 	on_hand + qty (INVOICE_CANCEL)
Sales return 	on_hand + qty (SALE_RETURN), only if item is resellable; damaged goes
to DAMAGE
Purchase return 	on_hand - qty (PURCHASE_RETURN)
Manual adjustment / stock
count
STOCK_ADJUSTMENT_IN/OUT through stock_adjustments with reason
and approval
Damage / expiry write-off 	DAMAGE / EXPIRED_WRITE_OFF
Integrity checks (automated)
I i t i 	h d 	( h d d l ) d 	d 	( 	d d l ) f 	h

Invariant: inventory.on_hand = SUM(on_hand_delta) and reserved = SUM(reserved_delta) for each
variant, and each movement's before equals the previous movement's after .
Nightly reconciliation job writes mismatches to audit_logs and shows an admin dashboard alert. No
auto-fix without admin approval.
Concurrency test: POS and e-commerce buying the last unit at the same time, only one succeeds.
Low-stock alerts when available <= low_stock_threshold .
Admin screens: Current stock (on hand, reserved, available), Inventory history per variant (filters: date, type,
channel, user, reference; export PDF/Excel; click a row to open the source invoice/order/purchase), Stock
adjustment with count sheet, Low stock, Reservation list (active and expired).
Money transactions (separate from DB transactions)
payment_transactions (
id, order_id NULL, invoice_id NULL, customer_id,
txn_type ENUM('PAYMENT','REFUND'), method ENUM('CASH','UPI','CARD','NETBANKING','WALLET','CREDIT'),
gateway ENUM('RAZORPAY','OFFLINE'), gateway_order_id, gateway_payment_id, gateway_refund_id,
amount DECIMAL(15,2), currency CHAR(3) DEFAULT 'INR',
status ENUM('INITIATED','PENDING','SUCCESS','FAILED','REFUNDED'),
failure_reason, idempotency_key UNIQUE, webhook_event_id UNIQUE NULL,
raw_payload JSON, created_by NULL, created_at, updated_at
)
payment_transaction_events (id, payment_transaction_id, from_status, to_status, source, payload JSON,
Every payment attempt, success, failure and refund is a row; webhooks are idempotent through
webhook_event_id .
payments (section 14) holds the settled business record; customer_ledger (section 17) stays in sync in
the same DB transaction.
Use the same DB transaction for: invoice/order + items + payment + inventory movement + ledger +
audit log. All-or-nothing with rollback (section 23).
12. POS Billing and Hardware
POS FLOW
Cashier Login -> Search / Scan Product -> Add to Cart -> Change Quantity
-> Select Customer -> Determine Customer Type -> Backend Determines Price
-> Apply Product Discount -> Apply Coupon -> Calculate GST
-> Calculate Final Total -> Validate Stock -> Create Invoice Number
-> Create Invoice -> Create Invoice Items -> Record Payment
-> Reduce Inventory -> Update Customer Ledger -> Complete Sale -> Print Invoice
All critical steps must run inside backend transactions.
POS KEYBOARD
POS must support UP, DOWN, LEFT, RIGHT, ENTER. Keyboard navigation should be optimized for fast billing.
Barcode scanner should support Barcode, SKU, Product Name.

Thermal Printer and Barcode Scanner
Build a hardware module in the POS app plus a Settings, Hardware page in admin (stored in the DB).
Thermal printer (ESC/POS), support 58mm and 80mm paper:
Bluetooth: use Web Bluetooth API (works on Chrome desktop/Android over HTTPS; not on iOS Safari).
Pair once, remember device, auto-reconnect, chunked writes (about 100 bytes per write).
USB: WebUSB as an extra option.
WiFi / LAN printer (IP:9100): browsers cannot open raw TCP sockets. So implement the WiFi path through
backend or a local bridge: POST /api/print/receipt makes PHP send ESC/POS bytes to
printer_ip:9100 through a socket, when the server is on the same LAN. If the server is cloud-hosted,
use bridge/ (small Node.js service on the shop PC that receives print jobs from POS over
WebSocket/HTTP and forwards to the printer).
Build a reusable ESC/POS receipt builder (header/logo, items, GST breakup, totals, payment, footer, QR
optional, cut command, cash drawer kick optional).
Fallback: browser print with 80mm/58mm CSS if no printer connected.
Settings: printer type (BT/WiFi/USB/Browser), IP, port, paper width, characters per line, test print button,
auto-print after sale ON/OFF.
Barcode scanner:
Keyboard-wedge (HID) mode (default for most Bluetooth and USB scanners): global keystroke listener
that detects scanner input by speed (for example under 50ms between chars, terminated by Enter) so it
works even when the search box is not focused, without breaking normal typing.
WiFi scanner: most send data over TCP or HTTP. Support through the bridge/ service, which forwards
scanned codes to POS over WebSocket. Document the scanner-side configuration.
Camera scanner fallback on mobile (BarcodeDetector API, with a library fallback).
Scan lookup order: barcode, SKU, then product name. Beep/visual feedback, "product not found"
handling.
Honestly document in README what each connection mode needs and its browser limitations.
13. Storefront (E-Commerce)
E-COMMERCE FLOW
Browse as Guest or Customer -> Search / Filter -> Product Details
-> Add To Cart -> Cart -> Apply Coupon -> Proceed to Checkout
-> LOGIN REQUIRED if guest (section 4) -> Merge guest cart -> Select Address
-> Delivery Details -> Payment -> Backend Revalidates -> Stock Validation
-> Price Validation -> Coupon Validation -> GST Calculation -> Create Order
-> Reserve / Reduce Stock -> Create Order Items -> Payment Record
-> Generate Invoice -> Order Confirmation
E-COMMERCE PRODUCT VISIBILITY
A product appears in E-Commerce only when is_active = true AND is_ecommerce_enabled = true AND
valid price exists .

p
POS visibility: is_active = true AND is_pos_enabled = true .
POS and E-Commerce visibility are independent.
CART VALIDATION
At checkout backend must verify: Product exists, Product active, Product enabled for channel, Customer
exists, Customer type, Applicable price, Current stock, Product offer, Coupon, GST, Subtotal, Final total. The
frontend cannot submit an arbitrary price or total.
Cart, Buy Now and Checkout
Cart is stored server-side for logged-in customers: carts (id, customer_id, status) and cart_items
(id, cart_id, variant_id, quantity, UNIQUE(cart_id, variant_id)) . No price is stored; every cart
read returns backend-calculated price, offer, coupon, shipping, GST and total. Guest cart lives in browser
storage and is merged on login.
Quantity is always capped to available stock; backend returns a clear message when capped.
Buy Now: creates a one-item temporary checkout session (does not touch the saved cart), then follows
the normal checkout and revalidation.
Checkout collects: name, mobile, email, full address, city/district, state, pincode. Saved addresses:
customer_addresses (id, customer_id, name, phone, line1, line2, city_district, state,
pincode, is_default) .
Wishlist
Behaviour
Customer can add and remove products (specific variant) to the wishlist from product cards and the
product page. Wishlist page lists all saved items.
Each wishlist item has a quantity (default 1, editable on the wishlist page).
Move to cart: moves the item with its quantity to the cart (single item, or "Move all"). Rules:
1. If the item is already in the cart, quantities are merged.
2. Final quantity is capped to available stock; the customer sees a message like "Only 2 available, 2
added to cart".
3. If out of stock, "Move to cart" is disabled and the item shows "Out of stock" (optional "notify me when
back in stock").
4. After a successful move the item is removed from the wishlist (setting wishlist_remove_after_move ,
default ON).
5. Wishlist never reserves stock.
Each wishlist item shows the current price (backend-priced for this customer, including offers), original
price/offer badge, and availability. If price dropped since it was added ( price_when_added ), show "Price
dropped".
Guest wishlist is kept in browser storage and merged into the account on login (no duplicates).
Tables

wishlists (id, customer_id UNIQUE, created_at)
wishlist_items (id, wishlist_id, product_id, variant_id, quantity INT DEFAULT 1,
price_when_added DECIMAL(15,2), created_at,
UNIQUE KEY uq_wl_variant (wishlist_id, variant_id))
API
GET /api/wishlist 	-> items with live price, availability, max_quantity
POST /api/wishlist 	{variant_id, quantity}
PATCH /api/wishlist/items/{id} 	{quantity}
DELETE /api/wishlist/items/{id}
POST /api/wishlist/items/{id}/move-to-cart {quantity?}
POST /api/wishlist/move-all-to-cart
POST /api/wishlist/merge 	{guest_items[]}
Admin dashboard: "Most wishlisted products" (from product_stats.wishlist_count ).
Shipping, Pincode Check and Order Statuses
Pincode check: serviceable_pincodes (pincode PK, district, state, is_serviceable,
delivery_days_min, delivery_days_max, shipping_charge_override NULL) . Product page and cart
show "Delivery available, 3 to 5 days" or "Not deliverable to this pincode". Checkout is blocked for non-
serviceable pincodes. Admin can bulk import pincodes (CSV). Later the shipping provider API (section 15)
can replace this data.
Shipping charge is calculated only by the backend from shipping_rules (id, type
FLAT|FREE_ABOVE|BY_WEIGHT|BY_PINCODE, config JSON, priority, active) . Cart and checkout show
the shipping line. Setting: GST on shipping ON/OFF.
Free-shipping offers: (a) free above an order amount, (b) a coupon of type FREE_SHIPPING , (c) deal-
based free shipping. Backend decides; frontend only displays.
Partial cancel and shipping (extends section 9): once an order is paid, never charge the customer extra. If
a partial cancel drops the order below a free-shipping threshold, default policy is keep free shipping
(configurable to "charge shipping, deduct from refund"). If the whole order is cancelled before shipment,
shipping is refunded.
Order statuses: PENDING, CONFIRMED, PROCESSING, PACKED, SHIPPED, OUT_FOR_DELIVERY,
DELIVERED, CANCELLED, RETURN_REQUESTED, RETURNED, REFUNDED. Payment status is separate:
PENDING, PAID, FAILED, PARTIALLY_REFUNDED, REFUNDED.
Every status change is written to order_status_history (id, order_id, from_status, to_status,
changed_by, source ADMIN|SYSTEM|SHIPPING_WEBHOOK|CUSTOMER, note, created_at) (append-only).
The section 15 provider status mapping includes OUT_FOR_DELIVERY.
Search, Filters and Sorting
Search by name, SKU, tags and description using MySQL FULLTEXT plus a LIKE fallback for partial words,
with an autocomplete suggestions endpoint.
Filters: category, subcategory, price range, availability (in stock only), colour, on offer. Sort: newest, price
low-high, price high-low, popularity ( units_sold_30d ).
Server-side pagination; indexes on category/subcategory mapping tables price created at status

Server side pagination; indexes on category/subcategory mapping tables, price, created_at, status.
All price and availability values in listings come from the backend (never calculated in React).
14. Payments
PAYMENT SYSTEM
Payment methods can include: Cash, UPI, Card, Credit.
Payment record: Invoice / Order ID, Customer, Amount, Payment Method, Reference Number, Payment
Status, Date, Created By.
Razorpay Online Payment
Flow: Cart, Checkout page, Pay Online (Razorpay) or other enabled methods.
1. Frontend sends cart + address + coupon_code (NO prices) to POST /api/orders/checkout .
2. Backend revalidates everything, creates our orders row with status PENDING and payment_status =
PENDING , reserves stock, then calls Razorpay Orders API to create a Razorpay order. Amount (in paise) is
computed only by the backend.
3. Frontend opens Razorpay Checkout using the returned razorpay_order_id and public key id.
4. On success, frontend posts razorpay_payment_id , razorpay_order_id , razorpay_signature to POST
/api/payments/razorpay/verify . Backend verifies HMAC_SHA256(order_id + "|" + payment_id,
key_secret) with hash_equals , then marks the order CONFIRMED, creates the payment record,
generates the invoice.
5. Webhook POST /api/payments/razorpay/webhook : verify X-Razorpay-Signature against the raw body,
handle payment.captured , payment.failed , refund.processed . Idempotent (the same event twice
must not double-process).
6. Failed or abandoned payment: auto-release reserved stock after N minutes (cron or scheduled job).
7. Refunds (on cancel/return) go through Razorpay Refund API, stored in payments with reference.
Provide sample config in .env.example (test mode):
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxx
Also add backend/services/RazorpayService.php (createOrder, verifySignature, verifyWebhook, refund)
and a working test-mode sample end to end. Admin settings page to enable/disable Razorpay, COD, UPI etc.
15. Orders, Cancellation and Tracking
ORDER CANCELLATION
Validate Order -> Check Current Status -> Change To CANCELLED
-> Restore Stock -> Reverse Payment Effect -> Reverse Customer Credit if applicable
-> Refund if applicable -> Create Audit Log
Cancellation must not happen twice.

Order Tracking with Third-Party Shipping API
Order statuses as in the related sections, but tracking data must be dynamic (from a third-party API such
as Shiprocket, Delhivery or similar aggregator, which we will buy later).
Implement a provider-agnostic ShippingProviderInterface (createShipment, cancelShipment,
getTracking, parseWebhook) with:
MockShippingProvider (default, works now, simulates status progression for testing)
ShiprocketProvider sample adapter (auth token, create order, AWB, track by AWB) with placeholders
for credentials
Config in .env.example : SHIPPING_PROVIDER=mock , SHIPROCKET_EMAIL , SHIPROCKET_PASSWORD
(placeholders).
Tables: shipments (order_id, provider, awb, courier, status, tracking_url, eta) and tracking_events
(shipment_id, status, location, description, event_time, raw_payload).
Update via webhook endpoint plus a polling cron as backup. Map provider statuses to our order statuses
in one mapping table/config (admin editable in settings).
Storefront order page shows a live timeline (status, location, time, courier, AWB, tracking link). Admin can
create a shipment and see events.
16. Invoices
INVOICE NUMBERING
Normal sequence: INV-1, INV-2, INV-3, INV-4.
Deleted invoice: if invoice 2 is soft-deleted (1 active, 2 deleted, 3 active, 4 active), the next invoice is INV-2.
Deleted invoice numbers can be reused.
Multiple deleted gaps: 1 active, 2 deleted, 3 deleted, 4 active. Next: INV-2, then INV-3, then INV-5. The
lowest available deleted gap must be reused first.
Cancelled invoice: if invoice 5 is cancelled, INV-5 = CANCELLED and must NEVER be reused. A cancelled
invoice remains a valid historical transaction.
INVOICE DELETE
Invoice deletion is soft delete. Store: status = d , deleted_at , deleted_by .
Deleted invoices should not appear in normal: Invoice list, Sales reports, Dashboard, P&L, Customer
outstanding. Historical/audit information should remain available where required.
INVOICE CANCELLATION
Validate invoice -> Check not already cancelled -> Set CANCELLED
-> Restore inventory -> Reverse payment effect -> Reverse customer credit
-> Store cancellation reason -> Store cancelled_by -> Store cancelled_at -> Audit log
Cancelled invoice number must never be reused.
17. Returns, Customer Credit and Ledger

CUSTOMER CREDIT
For credit sale: Invoice Total ₹5,000, Paid ₹2,000, Outstanding ₹3,000.
Customer ledger must record: Opening Balance, Credit Sale, Payment, Sales Return, Adjustment, Invoice
Cancellation. Every transaction must update the outstanding balance correctly.
SALES RETURN
Original Invoice -> Select Items -> Enter Return Quantity
-> Validate Sold Quantity -> Check Previous Returns -> Calculate Return Amount
-> Restore Inventory -> Create Return Record -> Adjust Customer Ledger
-> Refund / Adjust Payment
Customer cannot return more than eligible quantity.
PURCHASE RETURN
Original Purchase -> Select Product -> Return Quantity -> Validate
-> Reduce Inventory -> Create Purchase Return -> Update Supplier Payable
-> Refund / Adjustment
18. Notifications (Firebase Cloud Messaging + Email + SMS/WhatsApp)
Channels
Channel 	Provider 	Status
PUSH 	Firebase Cloud Messaging (FCM): web push for
browsers and installed PWA
Active
EMAIL 	SMTP 	Active (also fallback when a user has
no active push token)
SMS /
WHATSAPP
Adapter interface with Mock provider 	Mock until a provider is purchased
Firebase setup (what the owner must create)
1. Create a Firebase project. Add a Web app; copy the web config.
2. Cloud Messaging, Web Push certificates: generate the VAPID key pair.
3. Project settings, Service accounts: generate a private key JSON for the backend (FCM HTTP v1). Store it
outside the web root and never commit it.
Environment variables (sample, put placeholders in .env.example )
Frontend (storefront, admin, POS: public values, safe in the browser):
NEXT_PUBLIC_FIREBASE_API_KEY=your_web_api_key 	# VITE_FIREBASE_* for the Vite apps
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=yourproject.firebaseapp.com
NEXT PUBLIC FIREBASE PROJECT ID 	j t

NEXT_PUBLIC_FIREBASE_PROJECT_ID=yourproject
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=yourproject.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000
NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:xxxxxxxx
NEXT_PUBLIC_FIREBASE_VAPID_KEY=your_vapid_public_key
Backend (secret):
FCM_ENABLED=true
FIREBASE_PROJECT_ID=yourproject
FIREBASE_SERVICE_ACCOUNT_PATH=/secure/path/firebase-service-account.json
Client implementation
firebase-messaging-sw.js at the site root (service worker) handles background messages and
notificationclick (opens the deep link, for example the order page).
App uses firebase/messaging : getToken with the VAPID key, onMessage for foreground (in-app toast).
Permission prompt UX: never on first visit. Ask after login or right after the first order ("Get order updates
on this device?"). Provide a toggle in My Account, Notification settings. Handle "denied" gracefully (fall
back to email).
iOS note (document in README): web push works only when the site is installed to the Home Screen as a
PWA (iOS 16.4 and later). HTTPS is mandatory.
Device tokens
device_tokens (id, user_id, role ENUM('ADMIN','CASHIER','CUSTOMER'), token VARCHAR(512) UNIQUE,
platform ENUM('WEB','ANDROID','IOS'), user_agent, is_active TINYINT(1) DEFAULT 1,
last_seen_at, created_at)
POST /api/devices/register {token, platform} after login and permission grant; DELETE
/api/devices/{token} on logout (mark inactive). Guests have no tokens.
Maximum 10 active devices per user (oldest deactivated). When FCM returns UNREGISTERED or
INVALID_ARGUMENT, mark the token inactive.
Sending (backend)
NotificationService builds the message from a template, then queues it. A worker/cron sends through
FCM HTTP v1 ( https://fcm.googleapis.com/v1/projects/{project}/messages:send ) using an OAuth2
access token from the service account (use kreait/firebase-php or google/auth ).
Payload: notification title and body plus data: {event, order_id, url} .
Retries: 3 attempts with backoff. If the user has no active push token, send the email instead. A failed
notification must never fail or roll back an order, payment or stock change.
Events
Customer: ORDER_CONFIRMED, PAYMENT_FAILED, PACKED, SHIPPED, OUT_FOR_DELIVERY, DELIVERED,
CANCELLED, PARTIAL_CANCEL_REFUND (includes coupon-revoked message), REFUND_PROCESSED,
BACK_IN_STOCK (wishlist item), WISHLIST_PRICE_DROP (optional).

Staff (ADMIN/CASHIER devices): NEW_ORDER, ORDER_CANCELLED, RETURN_REQUESTED, LOW_STOCK,
NEW_CONTACT_MESSAGE, PAYMENT_FAILED.
Marketing (opt-in only): offers/festival campaigns through FCM topic offers . Admin can send a
campaign (title, body, image, deep link). Marketing needs explicit opt-in; transactional messages do not.
Tables
notification_templates (id, event, channel ENUM('PUSH','EMAIL','SMS','WHATSAPP'), title, body, active
notification_queue (id, user_id, channel, event, payload JSON, status ENUM('PENDING','SENT','FAILED')
notification_logs (id, queue_id, status, provider_response, created_at)
notification_preferences (user_id PK, push TINYINT, email TINYINT, sms TINYINT, whatsapp TINYINT, mar
Admin screens
Settings, Notifications: Firebase configuration status (green/red), Send test notification to my device,
template editor with preview, queue and log viewer, campaign sender.
19. Customer Support, CMS Pages and Site Settings
Support, CMS Pages and Site Settings
pages (id, slug UNIQUE, title, content_html (sanitized), seo_title, seo_description,
status) for: About Us, Shipping Policy, Return/Refund Policy, Privacy Policy, Terms & Conditions. Admin
edits them with a rich-text editor.
faqs (id, question, answer, sort_order, status) and a public FAQ page. contact_messages (id,
name, email, phone, message, status NEW|READ|REPLIED, created_at) with a Contact Us form (rate-
limited, spam-protected) and an admin inbox.
Site settings (extends section 10): brand name, logo, favicon, brand colours, contact number, support
email, address, WhatsApp number (floating button and wa.me link with a prefilled message), social links,
Google Analytics ID, Meta Pixel ID.
Storefront pages: Home, Shop / All Products, Categories, Product Details, Cart, Checkout, My Account,
Wishlist, Order Tracking, About, Contact, FAQ, Shipping Policy, Return/Refund Policy, Privacy Policy, Terms
& Conditions.
20. Finance, Reports and Import
PROFIT & LOSS
Sales Revenue - COGS = Gross Profit
Gross Profit - Expenses = Net Profit
Reports must correctly handle: Sales, Returns, Cancelled invoices, Deleted invoices, COGS, Expenses, Income.
No Route/City filters. Reports can filter by: Date, Product, Category, Brand, Subcategory, Customer.
EXPENSE MODULE
Fields: Expense Category, Amount, Description, Payment Method, Date, Created By. Expenses affect P&L.

INCOME MODULE
Fields: Income Category, Amount, Description, Payment Method, Date, Created By. Income should be
separately reported.
REPORTS
Sales: Sales Summary, Invoice Report, Product Sales, Category Sales, Brand Sales, Subcategory Sales,
Customer Sales
Inventory: Current Stock, Low Stock, Stock Movement, Purchase Movement, Sales Movement, Purchase
Return, Sales Return
Finance: Payments, Customer Outstanding, Supplier Outstanding, Expenses, Income, Profit & Loss
E-Commerce: Orders, Pending Orders, Delivered Orders, Cancelled Orders, Returns, Customer Purchases
There must be no Route/City report.
DATE FILTER
Reports should support: Today, Yesterday, This Week, This Month, Last Month, Custom Date Range. Timezone:
Asia/Kolkata.
PDF / EXCEL
Relevant reports must support: PDF export, Excel export, Date filters, Search filters, Selected-row export where
applicable. Exported data must come from backend filtered results.
PRODUCT IMPORT
Excel / CSV import can contain: Product, SKU, Barcode, Category, Brand, Subcategory, Unit, GST, HSN,
Purchase Price, MRP, Retail Price, Wholesale Price, Opening Stock.
If missing masters are allowed to be auto-created (Category, Brand, Subcategory, Unit, GST), they must be
created safely with case-insensitive duplicate checking.
21. Database Design
Single MySQL database. Tables, grouped:
Access: users (with google_id, profile_photo, phone, role, profile_completed), roles, permissions,
role_permissions, device_tokens
Catalog: categories, subcategories, category_subcategory, products, product_variants, product_images,
product_categories, product_subcategories, related_products, brands, units, gst_rates, hsn_codes,
product_stats
Customers: customers, customer_addresses, customer_price_lists, customer_price_list_items, carts,
cart_items, wishlists, wishlist_items
Suppliers and purchases: suppliers, purchases, purchase_items, purchase_returns, purchase_return_items
Pricing and offers: pricing, discounts, coupons, coupon_products, coupon_categories,
coupon_subcategories, coupon_brands, coupon_customers, coupon_customer_types, coupon_usages,
combos, combo_items, deals, deal_products, banners, banner_items, home_sections
Inventory: inventory, inventory_movements, stock_reservations, stock_adjustments,
t k dj t t it

stock_adjustment_items
Sales: orders, order_items, order_item_discounts, order_status_history, order_returns, order_return_items,
invoices, invoice_items, shipments, tracking_events
Money: payments, payment_transactions, payment_transaction_events, customer_ledger, supplier_ledger,
expenses, income
Shipping: serviceable_pincodes, shipping_rules
Notifications: notification_templates, notification_queue, notification_logs, notification_preferences
Content and settings: pages, faqs, contact_messages, settings, audit_logs
Do not create Product Line, Route, City or Branch tables.
DATABASE RULES
All money fields: DECIMAL(15,2). Do not use floating-point values for financial calculations.
Important indexes: SKU, Barcode, Product Name, Category ID, Brand ID, Subcategory ID, Customer ID, Invoice
Number, Order Number, Status, Created Date.
Use Foreign Keys, Unique Constraints, Indexes, Transactions.
22. API Structure
Auth 	/api/auth (login, register, google, refresh, logout) /api/users /api/roles /api/permi
Devices 	/api/devices/register /api/devices/{token}
Catalog 	/api/products /api/variants /api/categories /api/subcategories /api/brands /api/unit
Storefront /api/shop/products /api/shop/search /api/shop/suggest /api/shop/categories /api/banne
/api/cart/preview (public) /api/cart /api/pincode/check /api/shipping/estimate
Wishlist /api/wishlist /api/wishlist/items/{id} /api/wishlist/items/{id}/move-to-cart /api/wish
Customers /api/customers /api/addresses /api/suppliers
Offers 	/api/pricing /api/discounts /api/coupons /api/combos /api/deals
Inventory /api/inventory /api/inventory-movements /api/stock-adjustments /api/stock-reservations
Purchases /api/purchases /api/purchase-returns
Sales 	/api/orders /api/orders/checkout /api/orders/{id}/cancel-preview /api/orders/{id}/canc
/api/invoices /api/invoice-cancel /api/invoice-delete
Payments /api/payments /api/payments/razorpay/verify /api/payments/razorpay/webhook /api/custom
Shipping /api/shipments /api/tracking /api/shipping/webhook /api/serviceable-pincodes /api/shi
Finance 	/api/expenses /api/income
Reports 	/api/reports /api/dashboard
Print 	/api/print/receipt
Notify 	/api/notifications /api/notification-templates /api/notification-preferences /api/noti
Content 	/api/pages /api/faqs /api/contact
Settings /api/settings /api/audit-logs /sitemap.xml /robots.txt
Every route enforces authentication and role on the backend. Only the catalog read, search, banners, home
sections, cart/preview , pincode/check , shipping/estimate , CMS and contact routes are public (rate-
limited).
23. Security, Audit, Errors, Concurrency and Non-Functional Requirements
BACKEND SECURITY

PHP backend must never trust frontend values for: Selling price, Wholesale price, Discount, Coupon discount,
GST, Stock, Grand total, Credit amount. Backend must recalculate them.
Example: React sends product_id , quantity , coupon_code , customer_id . PHP calculates: Applicable Price,
Discount, Coupon, GST, Stock, Grand Total.
TRANSACTION MANAGEMENT
Critical operations must use: BEGIN, Validate, Perform all related operations, COMMIT. If any operation fails:
ROLLBACK.
Required for: Sale, Purchase, Invoice, Invoice cancellation, Invoice deletion where financial effects exist, Sales
return, Purchase return, Order creation, Order cancellation, Payment, Inventory adjustment, Customer ledger
updates.
CONCURRENCY
For simultaneous POS and E-Commerce sales, stock validation + stock update must be atomic. Prevent "POS
sells last item AND E-Commerce sells the same last item at the same time". Use database transaction/locking
strategy.
AUDIT LOG
Audit actions: LOGIN, CREATE_PRODUCT, UPDATE_PRODUCT, DELETE_PRODUCT, CREATE_INVOICE,
UPDATE_INVOICE, DELETE_INVOICE, CANCEL_INVOICE, PAYMENT, PURCHASE, STOCK_ADJUSTMENT,
PRICE_CHANGE, CREATE_COUPON, UPDATE_COUPON, DELETE_COUPON, CANCEL_ORDER, RETURN.
Store: User, Action, Reference, Old Data where required, New Data where required, IP where appropriate,
Date/Time.
ERROR HANDLING
Backend should return clear errors for: Insufficient Stock, Invalid Coupon, Expired Coupon, Coupon Usage
Limit Reached, Product Inactive, Product Not Found, Customer Not Found, Invoice Already Cancelled, Invoice
Already Deleted, Invalid Return Quantity, Payment Exceeds Balance, Unauthorized, Forbidden, Duplicate SKU,
Duplicate Barcode. React should display user-friendly messages.
Design, Performance, SEO, Analytics, Backup and Security
Design: clean, professional, mobile-first responsive layout (mobile, tablet, desktop); consistent brand
colours from settings; readable fonts; professional product cards; sticky header and cart where useful;
simple checkout (few steps, saved addresses).
Performance: WebP images (section 8) with lazy loading and responsive sizes, code splitting, API
pagination and caching headers; target Lighthouse mobile performance of at least 85 on home and
product pages.
SEO: unique slug, meta title/description, canonical URL (primary category), Open Graph tags, JSON-LD
Product (price, availability) and BreadcrumbList , auto-generated sitemap.xml and robots.txt .
Because plain React single-page apps index poorly, build the storefront with Next.js (React) using
SSR/SSG; the Admin and POS apps remain plain React.
Analytics: Google Analytics 4 and Meta Pixel loaded from settings IDs, with purchase and add-to-cart
events (respect a cookie-consent banner).

Backup and security: daily automated MySQL dump (kept 14 days, plus weekly kept 8 weeks) and
uploads backup, restore procedure documented and tested; HTTPS only; security headers (CSP, HSTS, X-
Frame-Options); login and coupon rate limiting; password hashing (Argon2id/bcrypt); input validation and
output escaping; CSRF protection where cookies are used; uploads validated by content type; audit logs
for admin actions.
24. Customer Requirements Coverage (match with this flow)
Customer document vs this system
Status: OK = already part of the base flow. ADDED = missing in the first flow and now included.
# Customer requirement 	Status 	Where
1 	Home: logo, brand name, search, categories,
banners, WhatsApp button, mobile-friendly
Banners OK, rest ADDED 	section 10,
section 19
1 	Home: best sellers, new arrivals, featured sections ADDED 	section 10
2 	Product categories (Hair Accessories, Jewellery &
Fashion, Gift Items, Toys, Bags & Pouches, Beauty,
Storage & Utility, Combo Offers)
ADDED (seed data +
subcategories)
section 7,
section 10
3 	Product page: images, name, price,
discount/original price, description
OK 	section 8
3 	Material details, size/dimensions, colours/designs ADDED 	section 8
3 	Stock availability, quantity selector, Add to Cart 	OK (display rules added) 	section 8,
section 13
3 	Buy Now button 	ADDED 	section 13
3 	Delivery / pincode availability check 	ADDED 	section 13
3 	Related products 	ADDED 	section 8
4 	Cart: items, quantity, remove, subtotal, coupon,
final total
OK 	section 13,
section 9
4 	Cart: shipping charge display 	ADDED 	section 13
5 	Checkout: name, mobile, email, address,
city/district, state, pincode, summary, payment
(UPI, card, others)
OK (address fields defined) 	section 13,
section 14
5 	Guest mode (not in customer document) 	ADDED on owner request:
browse as guest, login
required when creating the
order
section 13
6 	O d 	fi ti 	i 	d ID 	t 	OK 	ti 13

6 	Order confirmation, unique order ID, payment
status
OK 	section 13,
section 14
6 	Packed, Shipped, Out-for-delivery, Delivered
statuses
Out-for-delivery ADDED 	section 13
6 	Customer notification for order updates 	ADDED (Firebase push + email
fallback)
section 18
7 	Registration/login, profile, saved addresses, order
history, logout
OK 	section 5,
section 3
7 /
8
Wishlist (add, remove, move to cart, current price
and availability)
ADDED (with quantity) 	section 13
9 	Discount banners, coupon codes 	OK 	section 10,
section 9
9 	Combo offers, festival offers, limited-time deals,
free-shipping offers
ADDED 	section 10,
section 13
10 WhatsApp button, contact number, contact form,
FAQ, return/refund info, shipping info
ADDED 	section 19
11 Admin: products, images, categories, prices,
discounts/coupons, stock, orders, status, customer
details, banners, dashboard
OK 	section 6,
section 7,
section 10
12 Search + filters (category, price, availability) + sort
(newest, price, popularity)
ADDED 	section 13
13 Pages: Home, Shop, Categories, Product, Cart,
Checkout, My Account, Wishlist, Tracking, About,
Contact, FAQ, Shipping, Return/Refund, Privacy,
Terms
ADDED (CMS pages) 	section 19
14 Design requirements (mobile-first, fast, clean) 	ADDED as acceptance criteria 	section 23
15 Secure auth, secure payment, database, inventory,
orders, image upload, responsive
OK 	section 5,
section 8,
section 14
15 Basic SEO, website analytics, backup and security 	ADDED 	section 23
Decisions taken: guest mode with login at order creation; Firebase push notifications; Next.js storefront for
SEO; COD off; SMS/WhatsApp mock until a provider is bought; wholesale hidden from storefront. Change any
of these in the Decisions table at the top.
25. Testing
TESTING FLOW

Product tests: Create, Edit, Activate, Deactivate, Delete, Duplicate SKU, Duplicate Barcode, MRP, Selling Price,
Show Discount ON/OFF.
Required test: MRP ₹12, Selling ₹9, Show Discount ON, expected ₹12 ₹9 25% OFF . Turn OFF: ₹9 , no discount
badge.
WHOLESALE TEST
Product MRP ₹100, Retail ₹95, Wholesale ₹85. Retail customer: ₹95. Wholesale customer: ₹85. Frontend must
not be able to change the backend price.
COUPON TEST
Coupon SAVE100, Discount ₹100, Minimum Purchase ₹1000. Cart ₹999: rejected. Cart ₹1000: ₹100 discount.
INVOICE GAP TEST
Initial: 1, 2, 3, 4 all active. Delete invoice 2, next invoice is 2. Delete invoice 3, next invoice is 3. Then 5. Cancel
invoice 5, next is 6. Invoice 5 must never be reused.
Category, Inventory, Transactions, Wishlist, Combo, Shipping, Status, CMS tests
1. Category mapping: product in 2 categories and 3 subcategories appears under both category pages and
the right subcategory pages; subcategory shared by 2 categories lists products from both; removing a
category prunes orphan subcategories; the primary category drives breadcrumbs and report totals;
category/subcategory coupon matches by any mapping.
2. Inventory: ledger after equals the next row's before ; inventory.on_hand equals the sum of
movements; update/delete on inventory_movements is rejected; reserve then pay (CONFIRM) and reserve
then expire (RELEASE) both end with correct stock; cancel and return restore stock exactly once; same
idempotency key twice changes nothing; last-unit race between POS and e-commerce; stock never
negative.
3. Transactions: a forced failure after payment insert but before ledger insert rolls everything back; duplicate
Razorpay webhook does not double-process; refund creates a REFUND row and ledger entry.
4. Wishlist: add, change quantity, move to cart with quantity; merge with an existing cart line; cap by stock
with message; out-of-stock disabled; price shown equals backend price for retail vs wholesale customer;
guest merge without duplicates.
5. Combo: price enforced by backend; availability from lowest component; stock deducted per component;
whole-combo cancel restores all components.
6. Shipping/pincode: non-serviceable pincode blocks checkout; free shipping at threshold; partial-cancel
policy does not charge extra.
7. Status: OUT_FOR_DELIVERY from the provider webhook updates the order, writes order_status_history
and queues a notification.
8. CMS/SEO: all 16 customer pages reachable; sitemap lists active products; product page returns server-
rendered HTML with JSON-LD.
Guest mode and notification tests
1. Guest browses, adds to cart and wishlist without login; the guest preview endpoint returns backend prices;
a tampered price in the request is ignored

a tampered price in the request is ignored.
2. Guest presses Proceed to Checkout / Buy Now: login screen opens; after login the cart and wishlist merge
(summed, capped by stock, no duplicates), the same checkout step resumes, and a retry of the merge
does not double quantities.
3. Calling /api/orders/checkout without a token returns 401. No order row is created.
4. Wholesale price and customer-specific coupons are never shown to a guest.
5. Push: device token registers after login; ORDER_CONFIRMED reaches the device; an invalid token is
marked inactive; with no active token the email is sent; a failing FCM call does not roll back the order;
admin test notification works; marketing push respects opt-in; logout deactivates the token.
26. Non-Negotiable Rules
Core rules
1. ReactJS frontend.
2. PHP REST API backend.
3. MySQL database.
4. One common business logic for POS and E-Commerce.
5. No Route logic.
6. No City logic.
7. No Route/City dependency anywhere.
8. If a legacy-reference/ folder is provided, reuse compatible working logic; otherwise this is a fresh build.
9. Do not rewrite working modules unnecessarily.
10. Product must support MRP and Selling Price.
11. Product must have Show Discount/Offer toggle.
12. Toggle ON displays calculated offer.
13. Toggle OFF hides discount badge.
14. Toggle does not change actual price.
15. Retail and Wholesale customer types.
16. Wholesale pricing must be backend controlled.
17. Coupon rules must be flexible.
18. Coupon minimum purchase supported.
19. Maximum coupon discount supported.
20. Coupon validity supported.
21. Usage limits supported.
22. Per-customer usage limits supported.
23. Product/category/subcategory/brand/customer/customer-type/order coupons supported.
24. Product offer + coupon combination must be configurable.
25. Backend validates coupons.

26. Frontend must never be trusted for financial values.
27. Inventory must be shared between POS and E-Commerce.
28. Inventory must remain synchronized.
29. Payments and customer ledger must remain synchronized.
30. P&L must be accurate.
31. Deleted invoices are soft-deleted.
32. Deleted invoice numbers can be reused.
33. Lowest deleted invoice gap must be reused first.
34. Cancelled invoice numbers must never be reused.
35. Cancelled invoices remain historical transactions.
36. Returns must validate original quantities.
37. Order cancellation must restore stock correctly.
38. Customer cannot access Admin/POS. Guests cannot place orders.
39. Cashier permissions must be enforced by backend.
40. Critical operations must use database transactions.
41. Financial values use DECIMAL(15,2).
42. Audit logs must record important changes.
43. No duplicate business logic.
44. No unnecessary destruction of existing data.
45. Test complete business flows before finalizing.
Additional security and logic rules
Frontend is never trusted for money values. Backend recalculates everything.
Prepared statements (PDO) everywhere, input validation, CORS locked to our three app origins, rate
limiting on login and coupon-apply endpoints, secrets only in .env .
DECIMAL(15,2) for money, transactions + row locking for stock ( SELECT ... FOR UPDATE ).
One shared business-logic layer for POS and storefront.
Invoice numbering rules exactly as in section 16 and the invoice gap test.
46. Guests can browse and build a cart, but an order can be created only by an authenticated customer.
47. All stock changes go through the single InventoryService and always write an immutable movement row.
48. Product Line does not exist anywhere. Categories and subcategories are many-to-many with products.
49. Notifications are asynchronous and must never break order, payment or stock operations.
50. Firebase service-account JSON and all secrets stay in the server environment, never in Git or in the
frontend.
27. Implementation Order, Environment and Git Delivery
Implementation order

Follow this order. Run tests and commit after each phase.
1. Repository setup: monorepo skeleton, .env.example files, README, CI lint/test, first Git push (see the Git
delivery steps below).
2. Database foundation: migrations and seed (admin, cashier, sample customer, seed categories, sample
products). Create catalog, category mapping, variants, inventory, ledger and transaction tables first.
3. Backend foundation: authentication (password, Google, JWT), roles and permissions, WebP image service,
InventoryService , pricing, coupon (with partial-cancel logic), shipping and settings services.
4. Admin app: masters, multi-select category/subcategory product form, variants, pricing, discounts,
coupons, combos, deals, banners, home sections, customers, inventory screens, shipping rules, pincodes,
CMS pages, FAQ, settings (hardware, Razorpay, Firebase, shipping provider).
5. Shared financial logic: invoices, payments, payment transactions, customer ledger, returns, cancellation,
inventory, P&L.
6. POS app: billing, keyboard navigation, scanner, thermal printing, returns and cancellation.
7. Storefront (Next.js): guest browsing, login gate, catalogue, search and filters, wishlist, cart, Buy Now,
pincode check, coupon, checkout, Razorpay, orders, tracking, cancellation with preview, My Account.
8. Notifications: Firebase setup, device tokens, templates, queue and worker, admin test button, email
fallback.
9. Shipping adapter and cron jobs: mock provider, webhooks, reservation expiry, reconciliation, backups.
10. Reports and exports: all reports, PDF and Excel.
11. Security, SEO and performance review: authorization checks on every route, SQL injection, rate limits,
headers, Lighthouse, sitemap, structured data.
12. Full end-to-end test run (section 25), then final README and handover.
Environment files
Create .env.example files (placeholders only) for the backend and each app:
# backend/.env.example
APP_ENV=local
DB_HOST=127.0.0.1
DB_NAME=unified_pos
DB_USER=
DB_PASS=
JWT_SECRET=
TIMEZONE=Asia/Kolkata
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
SHIPPING_PROVIDER=mock
SHIPROCKET_EMAIL=
SHIPROCKET PASSWORD

SHIPROCKET_PASSWORD=
FCM_ENABLED=true
FIREBASE_PROJECT_ID=
FIREBASE_SERVICE_ACCOUNT_PATH=
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=
IMAGE_MAIN_TARGET_KB=100
IMAGE_THUMB_TARGET_KB=30
Each frontend app has its own .env.example with the API base URL, GOOGLE_CLIENT_ID and the Firebase
public values from section 18. .gitignore must exclude every .env , the Firebase service-account JSON,
uploads/ , node_modules/ , vendor/ and build output.
Git: create repository and push
At the end of Phase 1 and after every phase:
1. git init , .gitignore (node_modules, vendor, .env , uploads, build output). Never commit secrets.
2. Create the GitHub repo and push, preferably with GitHub CLI: gh repo create unified-pos --private -
-source=. --remote=origin --push
3. If gh is not authenticated or available, stop and tell me exactly which command or token you need. Do
not skip pushing silently, and do not invent a remote URL.
4. Use feature commits per phase ( feat: ... ), push to main .
5. Finish with a summary: what is done, how to run each app, test results, and anything that needs my keys
(Google, Razorpay, shipping provider).
Start now with step 1 and ask me only if something blocks you.

