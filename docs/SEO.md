# Storefront SEO (shopadams.in)

## How it works
- The storefront is a React single-page app. `apps/storefront/public/index.php` (copied into `dist/` by `npm run build`)
  fills in, per URL, the title, meta description, canonical, Open Graph/WhatsApp preview, JSON-LD
  (Product + price/stock/ratings/return policy, BreadcrumbList, ItemList, OnlineStore, WebSite search box)
  and a plain-HTML copy of the page. Data comes from `GET /api/seo/render` (backend `SeoService`).
- URLs: `/product/<slug>`, `/category/<slug>`, `/category/<slug>/<sub-slug>`.
  Old `/product/<id>` and `/products?category_id=` links 301-redirect to them.
- Search / sort / filter pages and cart/login/profile/orders are `noindex`. The admin panel is `noindex` too.
- Generated files on the storefront domain: `/robots.txt`, `/sitemap.xml` (+ image sitemap parts),
  `/feeds/google-merchant.xml` (Google Shopping free listings, one item per variant).
- Empty SEO fields are auto-generated from product/category data. Admins can override them:
  Product > Edit > Google SEO, Categories/Subcategories > Edit > Google SEO (incl. long "SEO text").

## Deploy (same PHP server as the API)
1. `php database/migrate.php` (adds 0048 import history + 0049 category SEO fields).
2. backend `.env`: `SITE_URL=https://shopadams.in` (and `SITE_NAME=` if the brand differs from Store Settings).
3. Edit `apps/storefront/public/seo.config.php` → `api_url` (a local URL like `http://127.0.0.1/api` is fastest).
4. `cd apps/storefront && npm run build`, upload everything inside `dist/` (incl. `.htaccess`, `index.php`) to the
   web root of shopadams.in. Nginx: see `apps/storefront/nginx-seo.conf.example`.
5. HTTPS on, one host only (redirect www -> shopadams.in).
6. Check: open `https://shopadams.in/product/<slug>` → View Source shows the product title & JSON-LD;
   test in https://search.google.com/test/rich-results

## Google setup (this is where you actually compete)
- **Search Console**: verify shopadams.in, submit `https://shopadams.in/sitemap.xml`.
- **Merchant Center** (free listings in Google Shopping): add feed `https://shopadams.in/feeds/google-merchant.xml`
  (daily fetch). Fill barcodes (GTIN) on variants where products have them - big boost.
- **Google Business Profile** for the store address/city (local "near me" searches, Maps).
- Admin Store Settings: fill store name, city, address, phone, social links - used in titles & structured data.
- Content: write unique product descriptions (not copied from Amazon/Flipkart), 150-300 words of SEO text per
  category, collect real customer reviews (shown as stars in Google).
- Speed: keep images on R2 (already compressed); the main JS bundle is >500 KB - code-splitting would help mobile scores.
