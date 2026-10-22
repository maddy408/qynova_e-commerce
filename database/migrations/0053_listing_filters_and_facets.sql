-- 0053_listing_filters_and_facets.sql
-- Left-side filter sidebar task: the listing endpoint gains several new
-- filter dimensions (rating, discount, country of origin, new-arrivals,
-- per-attribute and per-spec facets) and a facets computation alongside
-- it. No new product-level columns are needed — rating/review_count are
-- already computed from customer_reviews, discount from mrp vs
-- retail_price, "new" from created_at, and product_specifications
-- already holds the Gender/Fabric/Pattern/etc. facets — this migration
-- only adds the indexes those new query shapes actually need.
--
-- brand_id and product_id already carry indexes via their existing
-- foreign keys / primary-key-adjacent indexes, so they're not repeated
-- here.

ALTER TABLE products
    ADD INDEX idx_products_country_of_origin (country_of_origin),
    ADD INDEX idx_products_created_at (created_at);

-- Powers both "filter by spec value" (WHERE name = ... AND value IN
-- (...)) and "facet: distinct values + counts for this spec name".
ALTER TABLE product_specifications
    ADD INDEX idx_product_specifications_name_value (name, value);
