# Admin Product Features & Customer Storefront Flow Audit

This document details every product-related screen, field, master data dependency, SQL operation, API payload, customer endpoint, and customer UI component mapping across the Qynova platform.

---

## 1. Complete Product Feature Specification Table

| Admin Screen / Field | Payload Key | Table.Column | Type & Format | Required / Unique / Default | Derived / Backend Generated | Customer Endpoint | Customer Component | Status |
|---|---|---|---|---|---|---|---|---|
| **Basic Info: Product Name** | `name` | `products.name` | `VARCHAR(255)` | Required, Not Unique, No Default | Validated non-empty, trimmed | `GET /api/products`, `GET /api/products/{id}`, `GET /api/cart` | `Home.jsx`, `Shop.jsx`, `ProductDetails.jsx`, `ProductCard.jsx`, `CartDrawer.jsx`, `CheckoutModal.jsx` | VERIFIED |
| **Basic Info: URL Slug** | `slug` | `products.slug` | `VARCHAR(280)` | Required, UNIQUE | Auto-slugified via `slugify(name)`; deduplicated with `-1`, `-2` suffix | `GET /api/products`, `GET /api/products/{id}` | `Shop.jsx`, `ProductDetails.jsx`, `ProductCard.jsx` | VERIFIED |
| **Basic Info: Product Code** | `product_code` | `products.product_code` | `VARCHAR(50)` | Optional, UNIQUE if non-null, Default `NULL` | Stored as entered or `NULL` | `GET /api/products`, `GET /api/products/{id}`, `GET /api/cart` | `ProductCard.jsx`, `ProductDetails.jsx` | VERIFIED |
| **Basic Info: Short Description** | `short_description` | `products.short_description` | `VARCHAR(500)` | Optional, Default `NULL` | None | `GET /api/products`, `GET /api/products/{id}` | `ProductDetails.jsx` (hero subtitle), `Shop.jsx` (search match) | VERIFIED |
| **Basic Info: Full Description** | `description` | `products.description` | `TEXT` | Optional, Default `NULL` | Admin UI limits to 150 words | `GET /api/products/{id}` | `ProductDetails.jsx` (Description tab) | VERIFIED |
| **Basic Info: Bullet Points** | `bullet_points` | `products.bullet_points` | `JSON` | Optional, Default `NULL` | Filtered empty entries, JSON-encoded array | `GET /api/products/{id}` | `ProductDetails.jsx` (Key Highlights list) | VERIFIED |
| **Basic Info: Search Tags** | `tags` | `products.tags` | `VARCHAR(500)` | Optional, Default `NULL` | None (indexed in MySQL fulltext index) | `GET /api/products/{id}` (in `p.*`) | `Shop.jsx` (used in server FULLTEXT search) | VERIFIED |
| **Classification: Primary Category** | `primary_category_id` | `product_categories.is_primary` | `TINYINT(1)` | Required (>=1 cat selected), Default first | `is_primary = 1` for primary category | `GET /api/products/{id}` (`categories[].is_primary`) | `ProductDetails.jsx` (primary category badge & breadcrumb) | VERIFIED |
| **Classification: Additional Categories** | `category_ids` | `product_categories.category_id` | `INT UNSIGNED` | Required (>=1), Default `[]` | Syncs rows in junction table | `GET /api/products/{id}` (`categories` array) | `ProductDetails.jsx` | VERIFIED |
| **Classification: Subcategories** | `subcategory_ids` | `product_subcategories.subcategory_id` | `INT UNSIGNED` | Optional, Default `[]` | Syncs rows in junction table | `GET /api/products/{id}` (`subcategories` array) | `ProductDetails.jsx` (breadcrumbs) | VERIFIED |
| **Classification: Brand** | `brand_id` | `products.brand_id` | `INT UNSIGNED` | Optional, Default `NULL` | Foreign key to `brands.id` | `GET /api/products`, `GET /api/products/{id}`, `GET /api/cart` | `ProductCard.jsx`, `ProductDetails.jsx`, `CartDrawer.jsx` | VERIFIED |
| **Classification: Unit of Measurement** | `unit_id` | `products.unit_id` | `INT UNSIGNED` | Optional, Default `NULL` | Foreign key to `units.id` | `GET /api/products/{id}` (`unit_name`, `unit_short_code`) | NONE (returned by API, omitted in UI) | VERIFIED |
| **Tax: GST Rate** | `gst_rate_id` | `products.gst_rate_id`, `product_variants.gst_rate_id` | `INT UNSIGNED` | Optional, Default `NULL` | Foreign key to `gst_rates.id` | `GET /api/products/{id}` (`gst_percent`) | `ProductDetails.jsx` ("Inclusive of all applicable taxes") | VERIFIED |
| **Tax: HSN Code** | `hsn_code_id` | `products.hsn_code_id`, `product_variants.hsn_code_id` | `INT UNSIGNED` | Optional, Default `NULL` | Foreign key to `hsn_codes.id` | `GET /api/products/{id}` (`hsn_code`) | NONE (returned by API, omitted in UI) | VERIFIED |
| **Pricing: SKU** | `sku` | `product_variants.sku` | `VARCHAR(80)` | Required, UNIQUE | Auto-generated or user input | `GET /api/products/{id}` (`variants[].sku`), `GET /api/cart` | `ProductDetails.jsx` (SKU label), `CartDrawer.jsx` | VERIFIED |
| **Pricing: Barcode** | `barcode` | `product_variants.barcode` | `VARCHAR(80)` | Optional, UNIQUE if non-null, Default `NULL` | None | `GET /api/products/{id}` (`variants[].barcode`) | NONE (used in POS barcode lookup) | VERIFIED |
| **Pricing: MRP (Max Retail Price)** | `mrp` | `product_variants.mrp` | `DECIMAL(15,2)` | Required, Must be >= 0, Default `0.00` | Validated non-negative | `GET /api/products` (`mrp`), `GET /api/products/{id}` (`variants[].mrp`), `GET /api/cart` | `ProductCard.jsx`, `ProductDetails.jsx`, `CartDrawer.jsx` | VERIFIED |
| **Pricing: Selling Price (Retail Price)** | `retail_price` (or `sellingPrice`) | `product_variants.retail_price`, `normal_price` | `DECIMAL(15,2)` | Required, Must be >= 0, Default `0.00` | Validated non-negative | `GET /api/products` (`min_price`, `max_price`), `GET /api/products/{id}` (`variants[].retail_price`), `GET /api/cart` | `ProductCard.jsx`, `ProductDetails.jsx`, `CartDrawer.jsx`, `CheckoutModal.jsx` | VERIFIED |
| **Pricing: Customer Price (Retail Tier)** | `customer_price` | None (Admin schema discrepancy) | `DECIMAL(15,2)` | Optional | Admin attempts insert, crashes with 500 | None | None | VERIFIED (Admin Bug) |
| **Pricing: Wholesale Price** | `wholesale_price` | `product_variants.wholesale_price` | `DECIMAL(15,2)` | Optional, Default `NULL` | Used by `PricingService` for wholesale clients | `GET /api/products/{id}` (`variants[].wholesale_price`), `GET /api/cart` | NONE (for retail consumer storefront) | VERIFIED |
| **Pricing: Purchase / Cost Price** | `purchase_price` (or `costPrice`) | `product_variants.purchase_price` | `DECIMAL(15,2)` | Optional, Default `NULL` | Recorded in batches for margin calculation | `GET /api/products/{id}` (`variants[].purchase_price`) | NONE (merchant internal only) | VERIFIED |
| **Pricing: Discount Amount & %** | `discount_amount`, `discount_percent` | Derived dynamically (`mrp - retail_price`) | `DECIMAL(15,2)` / `INT` | Computed dynamically | `calcDiscount()` in React and SQL `((mrp - price)/mrp)*100` | Computed dynamically from `mrp` and `retail_price` | `ProductCard.jsx` (badge), `ProductDetails.jsx` (badge & savings) | VERIFIED |
| **Pricing: Show Discount Badge** | `show_discount` | `products.show_discount` | `TINYINT(1)` | Optional, Default `1` | Boolean cast | `GET /api/products`, `GET /api/products/{id}` | `ProductCard.jsx`, `ProductDetails.jsx` | VERIFIED |
| **Stock: Opening Stock** | `opening_stock` | `inventory.on_hand`, `inventory_batches.quantity` | `DECIMAL(15,3)` | Optional, Default `0.000` | Generates opening batch & inventory transaction | `GET /api/products` (`total_stock`), `GET /api/products/{id}` (`variants[].available`), `GET /api/cart` | `ProductCard.jsx`, `ProductDetails.jsx` ("In Stock" / "Out of Stock") | VERIFIED |
| **Stock: Low Stock Threshold** | `low_stock_threshold` | `inventory.low_stock_threshold` | `DECIMAL(15,3)` | Optional, Default `5.000` | Stored in `inventory` | `GET /api/products` (`low_stock_variant_count`), `GET /api/products/{id}` (`variants[].low_stock_threshold`) | `ProductDetails.jsx` ("Only X left in stock") | VERIFIED |
| **Stock: Batch Number** | `batch_no` | `inventory_batches.batch_no` | `VARCHAR(100)` | Optional, Default `'OPENING-001'` | Created in `inventory_batches` | Internal batch tracking | NONE | VERIFIED |
| **Dates: Manufacturing Date** | `manufacturing_date` | `product_variants.manufacturing_date`, `inventory_batches.manufacturing_date` | `DATE` | Optional, Default `NULL` | Stored as `YYYY-MM-DD` | `GET /api/products/{id}` (`variants[].manufacturing_date`) | NONE | VERIFIED |
| **Dates: Expiry Date** | `expiry_date` | `product_variants.expiry_date`, `inventory_batches.expiry_date` | `DATE` | Optional, Default `NULL` | Stored as `YYYY-MM-DD` | `GET /api/products/{id}` (`variants[].expiry_date`) | NONE | VERIFIED |
| **Shipping: Weight** | `weight_grams` | `products.weight_grams`, `product_variants.weight_grams` | `DECIMAL(10,2)` | Optional, Default `NULL` | Grams | `GET /api/products/{id}` | `ProductDetails.jsx` (Specifications tab) | VERIFIED |
| **Shipping: Dimensions (L x W x H)** | `length_cm`, `width_cm`, `height_cm` | `products.length_cm`, `products.width_cm`, `products.height_cm` | `DECIMAL(10,2)` | Optional, Default `NULL` | Centimeters | `GET /api/products/{id}` | `ProductDetails.jsx` (Specifications tab) | VERIFIED |
| **Shipping: Shipping Required** | `shipping_required` | `products.shipping_required` | `TINYINT(1)` | Optional, Default `1` | Boolean cast | `GET /api/products/{id}` | `ProductDetails.jsx` (Delivery tab) | VERIFIED |
| **Shipping: Cash On Delivery (COD)** | `cod_available` | `products.cod_available` | `TINYINT(1)` | Optional, Default `1` | Boolean cast | `GET /api/products/{id}` | `ProductDetails.jsx` (Delivery & Pincode checker) | VERIFIED |
| **Policy: Returnable** | `returnable` | `products.returnable` | `TINYINT(1)` | Optional, Default `1` | Boolean cast | `GET /api/products/{id}` | `ProductDetails.jsx` (Delivery & Returns tab) | VERIFIED |
| **Policy: Return Window Days** | `return_window_days` | `products.return_window_days` | `INT UNSIGNED` | Optional, Default `7` | Set to `NULL` if returnable is false | `GET /api/products/{id}` | `ProductDetails.jsx` (Delivery & Returns tab) | VERIFIED |
| **Policy: Replacement Available** | `replacement_available` | `products.replacement_available` | `TINYINT(1)` | Optional, Default `0` | Boolean cast | `GET /api/products/{id}` | `ProductDetails.jsx` (Delivery & Returns tab) | VERIFIED |
| **Policy: Refund Available** | `refund_available` | `products.refund_available` | `TINYINT(1)` | Optional, Default `1` | Boolean cast | `GET /api/products/{id}` | `ProductDetails.jsx` (Delivery & Returns tab) | VERIFIED |
| **Policy: Warranty Details** | `warranty_applicable`, `warranty_period`, `warranty_unit`, `warranty_description` | `products.warranty_applicable`, `warranty_period`, `warranty_unit`, `warranty_description` | `TINYINT(1)`, `INT`, `ENUM('DAYS','MONTHS','YEARS')`, `VARCHAR(500)` | Optional, Default `0`, `NULL` | Boolean & period details | `GET /api/products/{id}` | `ProductDetails.jsx` (Specifications tab) | VERIFIED |
| **Origin & Material** | `material`, `manufacturer`, `country_of_origin` | `products.material`, `products.manufacturer`, `products.country_of_origin` | `VARCHAR(150)`, `VARCHAR(100)` | Optional, Default `NULL` | Stored text strings | `GET /api/products/{id}` | `ProductDetails.jsx` (Specifications tab) | VERIFIED |
| **Status: Active Mode** | `statusMode` (`is_active`) | `products.is_active` | `TINYINT(1)` | Required, Default `1` | ACTIVE = 1, DRAFT/ARCHIVED = 0 | `GET /api/products`, `GET /api/products/{id}` | Shop/Home filters (inactive products 404 for non-staff) | VERIFIED |
| **Flags: Featured** | `is_featured` | `products.is_featured` | `TINYINT(1)` | Optional, Default `0` | Boolean cast | `GET /api/products?section=featured`, `GET /api/products/{id}` | `Home.jsx` (Featured section), `ProductDetails.jsx` (Badge) | VERIFIED |
| **Flags: Trending** | `is_trending` | `products.is_trending` | `TINYINT(1)` | Optional, Default `0` | Boolean cast | `GET /api/products?section=trending`, `GET /api/products/{id}` | `Home.jsx` (Trending section) | VERIFIED |
| **Flags: Deal / Discount** | `is_deal` | `products.is_deal` | `TINYINT(1)` | Optional, Default `0` | Boolean cast | `GET /api/products?section=deals`, `GET /api/products/{id}` | `Home.jsx` (Hot Deals section), `ProductDetails.jsx` (Badge) | VERIFIED |
| **Flags: Best Seller Override** | `is_best_seller_override` | `products.is_best_seller_override` | `TINYINT(1)` | Optional, Default `NULL` | Tri-state flag in DB | `GET /api/products?section=best_sellers` | `Home.jsx` (Best Sellers section) | VERIFIED |
| **Flags: New Arrival Override** | `is_new_arrival_override` | `products.is_new_arrival_override` | `TINYINT(1)` | Optional, Default `NULL` | Tri-state flag in DB | `GET /api/products?section=new_arrivals` | `Home.jsx` (New Arrivals section) | VERIFIED |
| **SEO: Meta Title & Description** | `meta_title`, `meta_description`, `seo_keywords` | `products.meta_title`, `products.meta_description`, `products.seo_keywords` | `VARCHAR(255)`, `VARCHAR(500)` | Optional, Default `NULL` | Stored metadata | `GET /api/products/{id}` | Document title / meta tags | VERIFIED |
| **Specifications Matrix** | `specifications` (`[{ name, value }]`) | `product_specifications` | `name VARCHAR(100)`, `value VARCHAR(255)`, `sort_order INT` | Optional, Default `[]` | Saved via `PUT /api/products/{id}/specifications` | `GET /api/products/{id}` (`specifications` array) | `ProductDetails.jsx` (Specifications tab table) | VERIFIED |
| **Variants: Attribute Options** | `attribute_value_ids` | `product_variant_values` | `variant_id BIGINT`, `attribute_value_id INT` | Required for Variable Products | Linked to `variant_attribute_values` | `GET /api/products/{id}` (`variants[].attribute_values`) | `ProductDetails.jsx` (Option pills, color swatches) | VERIFIED |
| **Variants: Description / Combination Title** | `variant_description` | `product_variants.variant_description` | `TEXT` | Optional, Default `NULL` | Attribute combination label (e.g. "Gold / Large") | `GET /api/products/{id}` (`variants[].variant_description`) | `ProductDetails.jsx` | VERIFIED |
| **Media: Main Product Images** | `file`, `is_primary` | `product_images` | `image_path VARCHAR(255)`, `thumb_path VARCHAR(255)`, `is_primary TINYINT(1)` | Optional, Default first is primary | Saved to disk `backend/public/uploads/products/{id}/` | `GET /api/products` (`primary_image`), `GET /api/products/{id}` (`images`), `GET /api/cart` | `Home.jsx`, `Shop.jsx`, `ProductCard.jsx`, `ProductDetails.jsx`, `CartDrawer.jsx`, `CheckoutModal.jsx` | VERIFIED |
| **Media: Variant-Specific Images** | `file`, `is_primary` | `variant_images` | `image_path VARCHAR(255)`, `thumb_path VARCHAR(255)`, `is_primary TINYINT(1)` | Optional, Default first is primary | Saved to disk `backend/public/uploads/variants/{id}/` | `GET /api/products/{id}` (`variants[].images`) | `ProductDetails.jsx` (changes displayed image when option clicked) | VERIFIED |

---

## 2. Order Admin Writes Tables In

Admin product persistence operates in this exact sequential transaction order:
1. **`products`**: Generates product record, derives unique URL slug from name.
2. **`product_categories`**: Deletes any existing links, inserts junction rows, marks `is_primary = 1` for the chosen primary category.
3. **`product_subcategories`**: Deletes existing links, inserts subcategory junction rows.
4. **`product_variants`**: Creates variant record with SKU, barcode, MRP, retail selling price (`retail_price`), `normal_price`, wholesale price, cost price, dates, and status.
5. **`product_variant_values`**: For variable products, links chosen attribute values (Color, Size, etc.) to the variant.
6. **`inventory`**: Inserts fast-lookup inventory cache row with initial `on_hand`, `reserved = 0`, `available = on_hand`, and `low_stock_threshold`.
7. **`inventory_batches`**: If opening stock > 0, creates opening batch record (`OPENING-001`) with purchase/cost price, retail price, MRP, manufacturing and expiry dates.
8. **`inventory_transactions`**: Writes audit transaction record of type `OPENING` with `qty`, `old_stock = 0`, `new_stock = qty`.
9. **`product_images`**: Multi-file multipart upload to `backend/public/uploads/products/{product_id}/`, records relative paths in DB.
10. **`variant_images`**: For each variant row with custom images, uploads files to `backend/public/uploads/variants/{variant_id}/`, records relative paths in DB.
11. **`product_specifications`**: Replaces custom specifications in `product_specifications` table with name, value, sort order.

---

## 3. Image File Storage & URL Resolution

- **Storage Location on Disk:**
  - Product main images: `backend/public/uploads/products/{productId}/{16_byte_hex_token}.webp` (and `-thumb.webp`)
  - Variant-specific images: `backend/public/uploads/variants/{variantId}/{16_byte_hex_token}.webp` (and `-thumb.webp`)
  - Category images: `backend/public/uploads/categories/{16_byte_hex_token}.webp`
  - Subcategory images: `backend/public/uploads/subcategories/{16_byte_hex_token}.webp`
- **Database Stored Path:**
  - Exact relative path starting with `uploads/`, for example:
    `uploads/products/101/0123456789abcdef0123456789abcdef.webp`
  - External CDN images (e.g. Unsplash demo URLs) are stored as absolute URLs starting with `http://` or `https://`.
- **Customer Storefront URL Resolution (`resolveImageUrl(path)`):**
  - If path starts with `http://`, `https://`, or `data:`, returns unchanged.
  - Otherwise, strips leading slash and prepends API origin (`http://localhost:8080/`), producing:
    `http://localhost:8080/uploads/products/101/0123456789abcdef0123456789abcdef.webp`.
