# E-Commerce + POS + Admin Panel — Complete Business Logic & Implementation Prompt

## 1. Project Architecture

Build a complete commerce system with the following architecture:

### Web Applications

**A. Admin + POS WebApp**

- React.js
- Single web application
- Role-based access
- Admin Panel and POS Billing available inside the same application
- Admin can manage all masters, products, variants, customers, coupons, orders, delivery, refunds, reports and settings.
- Cashier can access only permitted POS/billing functionality.

**B. Customer E-Commerce WebApp**

- Separate React.js web application
- Customer signup/login
- Mobile-number-based authentication with OTP
- Product browsing
- Product variants
- Variant images
- Cart
- Coupons
- Referral discounts
- Checkout
- Orders
- Delivery tracking/status
- Profile
- Order history

### Backend

- PHP REST API
- Existing/common backend architecture should be reused where possible.
- JWT/session-based authentication according to the existing project architecture.
- Proper role-based authorization.
- All business rules must be enforced on the backend, not only in React.

### Database

- MySQL
- Admin, POS and E-commerce must use the same database.
- Do not duplicate product, inventory, customer, order or pricing data between applications.

## 2. CUSTOMER SIGNUP — MOBILE NUMBER + OTP

Customer registration must be based on mobile number.

### Signup Flow

Customer enters:
- Name
- Mobile Number
- Password
- Confirm Password
- Referral Code — optional

Flow:
1. Customer enters mobile number.
2. Clicks `Send OTP`.
3. Backend generates OTP.
4. OTP must be stored in database.
5. OTP must have:
   - OTP value/hash as appropriate
   - mobile number
   - created_at
   - expires_at
   - verification status
   - attempt count
6. Customer enters OTP.
7. Backend validates OTP.
8. If valid and not expired:
   - mark OTP as verified
   - allow account creation/login.
9. Invalid/expired OTP must not be accepted.
10. Add resend OTP with proper cooldown.
11. Add maximum OTP verification attempts.

Do not rely only on frontend validation.

## 3. REFERRAL CODE SYSTEM

Every registered customer must automatically receive a unique referral code.

Example: `Customer A, Referral Code: MADHAVI10`. Another customer can enter `Referral Code: MADHAVI10` during signup.

Database should maintain:
- customer_id
- referral_code
- referred_by_customer_id
- referral status
- referral created date
- referral reward/discount status

### Referral Rules

Admin must be able to configure referral settings.

Example: Referral Discount: 10%, Referred Customer Discount: 10%, Referrer Discount: 10%.

When Customer B successfully signs up using Customer A's referral code:
- Customer B becomes `referred customer`.
- Customer A becomes `referrer`.
- Both should receive the configured 10% referral benefit according to the configured business rules.

Do not blindly apply unlimited referral discounts. Create proper referral reward records so that:
- Same referral cannot be repeatedly rewarded.
- A customer cannot refer themselves.
- Referral reward can have status: Pending, Eligible, Applied, Cancelled, Expired.

Admin should be able to configure:
- Enable/Disable referral system
- Referrer discount %
- Referred customer discount %
- Maximum discount
- Minimum order amount
- Referral validity
- First-order-only option
- Reward trigger: Signup, First successful order, First delivered order

## 4. ADMIN — REFERRAL SETTINGS

Create: Admin Panel → Settings → Referral Settings

Options: Enable Referral, Referrer Discount %, Referred Customer Discount %, Maximum Discount Amount, Minimum Order Amount, First Order Only, Reward Trigger, Referral Expiry, Referral Code Prefix.

Also provide referral reports: Total referrals, Successful referrals, Pending referrals, Referral discounts given, Top referrers, Referral conversion.

## 5. PRODUCT MANAGEMENT

Admin must have a complete Product Management module.

Product creation should support basic product information: Product Name, Product Code, Category, Subcategory, Brand, Product Line, Unit, HSN Code, GST/Tax, Tax Type, Product Description, Short Description, Manufacturer, Manufacturing Date, Expiry Date, Country of Origin, Barcode, SKU, MRP, Selling Price, Cost Price, Status, Featured Product, Active/Inactive.

## 6. PRODUCT VARIANT SYSTEM

Products must support multiple variants.

Example:
```
T-Shirt
Variant 1: Size L, Color Blue, SKU TSH-L-BLU, Barcode 890xxxx, Price ₹799, Image blue-tshirt.jpg
Variant 2: Size XL, Color Orange, SKU TSH-XL-ORG, Barcode 890xxxx, Price ₹849, Image orange-tshirt.jpg
```

Do NOT treat variants as plain text only. Create a proper variant architecture.

Possible variant attributes: Size, Color, Material, Weight, Capacity, Storage, Pack Size, Custom attributes.

Admin should be able to create/manage variant attributes, e.g. Attribute: Size → Values: S, M, L, XL, XXL; Attribute: Color → Values: Blue, Black, Orange, Red, White.

Each variant can have: SKU, Barcode, Price, MRP, Cost Price, Stock, Weight, Tax, HSN Code, Manufacturing Date, Expiry Date, Variant Description, Variant Images, Status.

## 7. VARIANT IMAGE SYSTEM

Variant images are mandatory to support e-commerce properly.

Example: Blue + L → blue-front.jpg, blue-side.jpg, blue-back.jpg; Orange + XL → orange-front.jpg, orange-side.jpg, orange-back.jpg.

When customer selects Color → Blue, Size → L, the product gallery should automatically change to the images belonging to Blue + L. Do not show only generic product images.

## 8. CUSTOMER PRODUCT EXPERIENCE

The customer website should provide an e-commerce experience similar in usability and shopping flow to major Indian e-commerce platforms such as JioMart/Flipkart/Amazon. Do not copy their UI. Create an original modern UI with similar functionality.

Product Gallery supports: Main image, Multiple images, Thumbnail images, Swipe/slide, Mobile touch swipe, Zoom if practical, Variant-specific gallery.

When selecting another variant, images should update immediately.

## 9. PRODUCT DESCRIPTION

Product must have a main product description (rich text) and each variant can have its own variant description. Customer should see both product-level and variant-level information.

## 10. PRODUCT INVENTORY

Inventory must be variant-aware. Stock must be maintained against `product_id`, `variant_id`, `warehouse/store`.

Example: T-Shirt — Blue/L → 20, Blue/XL → 10, Orange/L → 15, Orange/XL → 5.

POS and E-commerce must use the same inventory.
- When POS sells: stock decreases.
- When online order is confirmed: stock decreases/reserved according to configured order flow.
- When order is cancelled/refunded according to business rules: stock should be restored where applicable.

## 11. PRODUCT EXCEL IMPORT

Product Management must support Excel import with a downloadable sample template. Excel should support fields such as: Product Name, Product Code, Category, Subcategory, Brand, Product Line, Description, Short Description, SKU, Barcode, HSN Code, Tax, Tax Type, MRP, Selling Price, Cost Price, Unit, Manufacturer, Manufacturing Date, Expiry Date, Variant Name, Variant SKU, Variant Barcode, Variant Description, Size, Color, Material, Variant Price, Variant MRP, Variant Cost Price, Variant Stock, Variant HSN, Variant Tax, Image URL, Status. (Exact columns can expand based on DB structure.)

### Import Logic

When importing:
- Validate required fields.
- Validate duplicate SKU.
- Validate duplicate barcode.
- Validate category.
- Validate subcategory.
- Auto-create missing masters only if enabled in settings.
- Show row-level validation errors.
- Do not partially import silently.
- Provide import preview before final confirmation.
- Show: Total rows, Successful rows, Failed rows, Error reason.

Allow downloading failed records/error report.

## 12. EXCEL EXPORT

Product Management should support Export Excel with options: All Products, Selected Products, Filtered Products, Category-wise, Brand-wise, Active Products, Inactive Products, Stock Report. Export should include product + variant information.

## 13. SAMPLE TEMPLATE DOWNLOAD

Add "Download Sample Template" — admin can download the correct Excel structure and use it for importing. Do not make admins manually create column names.

## 14. CUSTOMER-SPECIFIC COUPON SYSTEM

Admin should be able to create coupons with: Coupon Code, Coupon Name, Description, Discount Type (Percentage/Fixed Amount), Discount Value, Maximum Discount, Minimum Order Value, Start Date, End Date, Usage Limit, Per Customer Usage Limit, Product-specific, Category-specific, Brand-specific, Product Line-specific, Customer-specific, First Order Only, Active/Inactive.

## 15. CUSTOMER-SPECIFIC COUPONS

Admin must be able to select particular customers for a coupon. Only those customers should see/use the coupon. On customer website, "Available Coupons" should show coupons applicable to the currently logged-in customer only — customer should NOT see coupons that are not applicable to them.

## 16. COUPON VALIDATION

Coupon validation must happen in backend. Check: Customer eligibility, Coupon status, Start/end date, Usage limit, Customer usage limit, Minimum order, Product eligibility, Category eligibility, Brand eligibility, Variant eligibility, First-order condition, Referral restrictions, Maximum discount.

Never trust the discount amount sent by React. Backend must calculate the final discount.

## 17. ADMIN COUPON MANAGEMENT

Admin should see: Coupons → All Coupons, Active, Expired, Customer Specific, Product Specific, Category Specific.

Coupon detail should show: Total usage, Total discount given, Customers who used it, Orders associated with it.

## 18. ORDER MANAGEMENT

Admin Panel must have complete Order Management. Order list: Order ID, Customer, Date, Items, Amount, Payment Status, Order Status, Delivery Status, Refund Status.

Order statuses should support a configurable business flow such as: Pending, Confirmed, Processing, Packed, Shipped, Out for Delivery, Delivered, Cancelled, Returned, Refunded.

## 19. ADMIN ORDER EDITING

Admin must be able to edit order details according to permissions: Item quantity, Item price, Add item, Remove item, Discount, Coupon, Delivery charge, Tax where applicable, Address, Order status, Payment status, Delivery status.

All modifications must be recorded in an audit log, storing: Changed by, Date/time, Old value, New value, Reason.

## 20. ORDER PRICE EDIT RULE

Do not allow frontend-only price modifications. When admin changes an item price, backend must recalculate: Subtotal, Discount, Tax, Shipping, Grand Total — and update the order safely. Inventory must also be recalculated when quantity changes.

## 21. DELIVERY MANAGEMENT

Create a separate Delivery Management module. Admin can see: Order, Customer, Delivery Address, Phone, Delivery Partner, Delivery Status, Expected Delivery Date, Tracking Number, Delivery Notes.

Statuses: Pending, Assigned, Picked Up, In Transit, Out for Delivery, Delivered, Failed, Returned.

Admin can update delivery status.

## 22. DELIVERY + ORDER SYNCHRONIZATION

Order and delivery status must remain logically synchronized. Do not allow impossible status transitions without permission.

## 23. REFUND MANAGEMENT

Admin Dashboard should display: Total Sales, Total Orders, Total Refund Amount, Pending Refunds, Completed Refunds, Cancelled Orders.

Refund records should include: Order ID, Customer, Refund amount, Refund reason, Refund method, Refund status, Requested date, Processed date, Processed by.

## 24. ADMIN DASHBOARD

Create a premium dashboard.

Dashboard cards: Total Sales, Today's Sales, This Month Sales, Total Orders, Pending Orders, Completed Orders, Cancelled Orders, Refund Amount, Pending Refund Amount, Total Customers, New Customers, Total Products, Low Stock Products.

Sales charts: Daily sales, Weekly sales, Monthly sales, Order count, Refund amount.

Product analytics: Top Selling Products, Top Selling Categories, Top Selling Variants, Low Stock Products, Out of Stock Products.

Customer analytics: New Customers, Returning Customers, Top Customers, Referral Customers.

## 25. POS BILLING

Admin + POS must remain in the same React web application. POS should use the same Products, Variants, Customers, Inventory, Coupons, Pricing, Tax, Discounts, Orders, Invoice logic. Do not create separate POS product tables.

POS must support variant selection and should show the correct SKU, Barcode, Price, Stock, Tax, Image if configured.

## 26. POS + E-COMMERCE SHARED INVENTORY

If POS sells a variant, stock must immediately reflect in E-commerce, and vice versa. Use proper transactions/locking where necessary to avoid overselling.

## 27. CUSTOMER ACCOUNT

Customer website should provide: My Profile, My Orders, My Coupons, My Referral, My Addresses, Wishlist, Cart.

Referral page: Your Referral Code, Share Referral Code, Successful Referrals, Referral Rewards.

## 28. CUSTOMER ORDER PAGE

Customer should see: Order ID, Order Date, Items, Variant, Quantity, Price, Discount, Tax, Delivery Charge, Total, Payment Status, Order Status, Delivery Status. Product variant should be displayed clearly with the actual selected variant image.

## 29. DATABASE DESIGN

Design proper normalized MySQL tables. Expected entities include:

```
users
customers
customer_addresses
otp_verifications

referral_codes
referrals
referral_rewards
referral_settings

categories
subcategories
brands
product_lines
units
taxes
hsn_codes

products
product_images
product_variants
variant_attributes
variant_attribute_values
variant_images

inventory
inventory_transactions

coupons
coupon_customers
coupon_products
coupon_categories
coupon_usage

carts
cart_items

orders
order_items
order_item_variants
order_status_history

payments
refunds
refund_transactions

deliveries
delivery_status_history

audit_logs
```

Adapt table names to the existing database if equivalent structures already exist. Do not unnecessarily duplicate existing tables.

## 30. AUDIT LOGGING

Important admin actions must be logged, e.g.: Product Created/Updated, Variant Updated, Price Changed, Stock Changed, Order Edited/Cancelled, Refund Created, Coupon Created/Updated, Customer Updated, Referral Reward Applied.

Store: user_id, action, entity_type, entity_id, old_value, new_value, timestamp, IP if available.

## 31. ROLE-BASED ACCESS

Minimum roles:
- **Admin** — full access.
- **Cashier** — POS access and permitted customer/order functions.
- **Customer** — e-commerce customer functions only.

Backend must enforce permissions. Do not hide unauthorized features only through React UI.

## 32. SECURITY REQUIREMENTS

Implement: OTP expiry, OTP attempt limits, OTP resend cooldown, Password hashing, JWT/session security, API authorization, Role-based permissions, SQL injection protection, Input validation, File upload validation, Excel validation, Image upload validation, Coupon backend validation, Price backend validation, Inventory transaction safety.

Never trust price, discount, tax, stock, coupon amount, customer ID, role sent from frontend.

## 33. IMAGE UPLOAD

Product and variant image upload must support: Multiple images, Image preview, Delete, Reorder, Primary image, Variant-specific images, Product-level images.

Validate: File type, File size, File extension, Image dimensions where necessary.

## 34. CUSTOMER PRODUCT PAGE UX

Implement: Search, Category navigation, Subcategory, Filters, Sort, Product cards, Product images, Variant selection, Price, MRP, Discount, Stock availability, Offers, Coupons, Add to Cart, Buy Now, Wishlist, Product details, Similar products, Related products.

UI should be modern and premium. Do not clone JioMart — use it only as functional inspiration.

## 35. VARIANT UX

Example: Color [Blue][Orange][Black], Size [S][M][L][XL]. When selected (e.g. Blue + L), show that combination's images, SKU, price, stock, description. If a combination is unavailable (e.g. Blue + XL), show unavailable/disabled state. Do not allow invalid combinations to be added to cart.

## 36. CART

Cart item must store: product_id, variant_id, quantity, unit_price, discount, tax, final_price. Cart should revalidate product price and stock from backend before checkout.

## 37. CHECKOUT

Checkout should calculate: Items Total, Product Discount, Coupon Discount, Referral Discount, Tax, Delivery Charge, Grand Total. Backend must calculate final values — do not allow the frontend to directly determine payable amount.

## 38. DISCOUNT PRIORITY

Create a clear discount engine. Possible discounts: 1. Product discount, 2. Coupon discount, 3. Referral discount, 4. Other configured promotional discounts.

Admin should configure whether discounts can be combined (e.g. Coupon + Referral: Allowed Yes/No). The backend must enforce this.

## 39. PRODUCT IMPORT ERROR HANDLING

When importing Excel, show an Import Summary (Total/Successful/Failed rows) and per-row failure reasons (e.g. "Row 12: SKU already exists"). Allow "Download Error Excel".

## 40. ADMIN PRODUCT FILTERS

Search, Category filter, Subcategory filter, Brand filter, Product Line filter, Tax filter, Stock filter, Active/Inactive, Date filter, Variant filter.

## 41. ADMIN ORDER FILTERS

Search Order ID, Customer, Date, Payment status, Order status, Delivery status, Refund status, Amount range.

## 42. REPORTS

- **Sales** — Daily, Weekly, Monthly, Custom date.
- **Product** — Product sales, Variant sales, Category sales, Brand sales.
- **Inventory** — Current stock, Stock movement, Low stock, Out of stock.
- **Customer** — Customer purchases, Top customers, New customers, Returning customers.
- **Coupon** — Coupon usage, Discount amount, Customer-wise usage.
- **Referral** — Referrals, Referral conversions, Rewards, Referral discount amount.
- **Refund** — Refund amount, Refund count, Refund reasons.

All reports should support Excel export where practical.

## 43. UI/UX REQUIREMENT

Admin: modern dashboard, responsive layout, proper data tables, search/filter, modal/drawer forms, clear status badges, pagination, bulk actions, loading/empty/error states, confirmation dialogs.

Customer: mobile-first, responsive desktop, premium product cards, swipeable galleries, variant image selection, sticky cart/buy controls where appropriate, fast navigation, clear pricing, coupon visibility, order tracking.

Avoid unnecessary animations that affect performance.

## 44. IMPORTANT BUSINESS RULE

The Admin + POS webapp and Customer E-commerce webapp are separate frontend applications, but they must use the same Backend, Database, Products, Variants, Inventory, Customers, Orders, Coupons, Pricing, Taxes, Business Rules. There must NOT be separate product/inventory/order databases.

## 45. IMPLEMENTATION REQUIREMENT

Before writing code:
1. Inspect the existing repository.
2. Inspect current React structure.
3. Inspect PHP backend structure.
4. Inspect existing MySQL schema.
5. Identify reusable modules.
6. Do not duplicate existing business logic.
7. Do not break existing POS functionality.
8. Preserve existing invoice/business rules unless explicitly changed.
9. Identify missing tables/API endpoints before implementation.

Then implement in logical phases.

## 46. PHASED IMPLEMENTATION

- **Phase 1** — Database architecture and migrations.
- **Phase 2** — Backend APIs: Customer signup, OTP, Referral, Products, Variants, Images, Inventory, Coupons, Orders, Delivery, Refund, Dashboard, Excel import/export.
- **Phase 3** — Admin + POS React application.
- **Phase 4** — Customer E-commerce React application.
- **Phase 5** — Integration testing.
- **Phase 6** — Business-rule testing.
- **Phase 7** — UI/UX polishing.

## 47. TESTING REQUIREMENTS

- **Signup** — Valid mobile, Duplicate mobile, Invalid OTP, Expired OTP, Resend OTP, Maximum attempts.
- **Referral** — Valid referral, Invalid referral, Self referral, Duplicate referral, Referral reward, Referral expiry.
- **Product** — Product creation, Variant creation, Variant image, Multiple variants, Invalid SKU, Duplicate barcode.
- **Coupon** — Valid coupon, Expired coupon, Customer-specific coupon, Product-specific coupon, Minimum order, Usage limit, Coupon + referral combination.
- **Inventory** — POS sale, Online sale, Cancellation, Quantity edit, Overselling prevention.
- **Orders** — Create, Edit, Cancel, Refund, Delivery status, Admin price edit, Admin quantity edit.
- **Excel** — Valid import, Invalid import, Duplicate SKU, Missing category, Invalid tax, Export.

## 48. IMPORTANT DEVELOPMENT RULES

Do not implement only UI mockups. Every important feature must have: React UI → API → PHP Business Logic → MySQL.

Business rules must live in backend. Do not hardcode: Referral percentage, Coupon percentage, Tax, Product price, Discount, Stock, Order totals. These must come from database/configuration.

## 49. FINAL ACCEPTANCE CRITERIA

The implementation is considered complete only when:

**Customer** — Mobile signup works. OTP is stored and verified. Referral code works. Referral rewards work. Customer-specific coupons are visible. Product variants work. Variant-specific images work. Swipe gallery works. Cart works. Checkout works. Orders work. Order status works.

**Admin** — Dashboard shows sales/order/refund analytics. Products can be created. Variants can be created. Variant images can be uploaded. Product descriptions work. Variant descriptions work. Excel import works. Sample template works. Excel export works. Coupons work. Customer-specific coupons work. Referral settings work. Orders can be managed. Quantity/price editing works. Delivery management works. Refund management works.

**POS** — Same products are available. Same variants are available. Same inventory is used. Same pricing/tax logic is used. POS sales update online inventory. Online orders update POS inventory.

**Backend** — All business rules are validated server-side. Role permissions are enforced. Database transactions are used where required. Audit logs exist for critical admin changes. No duplicate product/order/inventory systems are created.

## 50. FINAL INSTRUCTION TO CLAUDE CODE

First inspect the existing project and provide a concise implementation assessment:
1. Existing architecture
2. Existing tables
3. Existing reusable modules
4. Missing tables
5. Missing APIs
6. Existing POS logic that must be preserved
7. Potential conflicts
8. Recommended implementation order

Then implement the above requirements without unnecessarily rewriting stable existing functionality. For every major implementation stage: update database schema, implement backend APIs, implement frontend, test API, test UI, test business logic, fix errors, verify integration.

Do not mark a feature as complete merely because the UI exists. Every feature must work end-to-end through: React → PHP API → MySQL → Response → React UI.

Maintain clean, modular, production-ready code throughout the project.
