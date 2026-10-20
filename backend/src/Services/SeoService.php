<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Config;
use PDO;

/**
 * Storefront SEO: for any storefront URL, builds what search engines and
 * link previews (Google, Bing, WhatsApp, Facebook) need BEFORE JavaScript
 * runs — <title>, meta description, canonical, robots, Open Graph/Twitter
 * tags, JSON-LD structured data (Product with offers/ratings/return policy,
 * BreadcrumbList, ItemList, Organization, WebSite search box) and a plain,
 * crawlable HTML version of the page content.
 *
 * Also generates sitemap.xml (+ image sitemap), robots.txt and a Google
 * Merchant Center product feed (free Google Shopping listings).
 *
 * Admin-entered meta_title / meta_description are used when present;
 * otherwise strong defaults are generated from product/category data.
 */
final class SeoService
{
    private const PRODUCTS_PER_SITEMAP = 5000;
    private const CATEGORY_PAGE_SIZE = 12; // matches the storefront grid

    private const PRIVATE_PREFIXES = ['/cart', '/login', '/register', '/profile', '/orders', '/customer', '/wishlist', '/payment', '/checkout'];

    private string $siteUrl;
    private string $assetUrl;
    private ?array $store = null;
    private ?array $delivery = null;

    public function __construct(private readonly PDO $pdo)
    {
        $this->siteUrl = rtrim((string) Config::get('seo.site_url', 'https://shopadams.in'), '/');
        $this->assetUrl = rtrim((string) (Config::get('seo.asset_url', '') ?: $this->siteUrl), '/');
    }

    // ------------------------------------------------------------------
    // Page rendering
    // ------------------------------------------------------------------

    /**
     * @param array<string, string> $query
     * @return array{status: int, redirect: ?string, head: string, body: string}
     */
    public function render(string $path, array $query = []): array
    {
        $path = '/' . trim(rawurldecode(parse_url($path, PHP_URL_PATH) ?: '/'), '/');
        $path = $path === '/' ? '/' : rtrim($path, '/');

        foreach (self::PRIVATE_PREFIXES as $prefix) {
            if ($path === $prefix || str_starts_with($path, $prefix . '/')) {
                return $this->page(200, [
                    'title' => $this->siteName(),
                    'description' => $this->defaultDescription(),
                    'robots' => 'noindex, nofollow',
                    'canonical' => null,
                ]);
            }
        }

        if ($path === '/') {
            return $this->home();
        }
        if (preg_match('#^/product/([^/]+)$#', $path, $m)) {
            return $this->product($m[1]);
        }
        if (preg_match('#^/category/([^/]+)(?:/([^/]+))?$#', $path, $m)) {
            return $this->category($m[1], $m[2] ?? null, (int) ($query['page'] ?? 1), $query);
        }
        if (in_array($path, ['/products', '/shop', '/catalog'], true)) {
            return $this->productsListing($query);
        }
        if (preg_match('#^/(?:pages|policy)/([^/]+)$#', $path, $m)) {
            return $this->contentPage($m[1]);
        }

        return $this->notFound();
    }

    private function home(): array
    {
        $store = $this->store();
        $name = $this->siteName();
        $tagline = trim((string) ($store['tagline'] ?? ''));
        $city = trim((string) ($store['city'] ?? ''));

        $title = $name . ' - ' . ($tagline !== '' ? $tagline : 'Online Shopping for Daily Essentials')
            . ($city !== '' ? " in {$city}" : '');
        $description = $this->defaultDescription();

        $categories = $this->pdo->query(
            "SELECT id, name, slug, image_path FROM categories WHERE status = 'ACTIVE' AND deleted_at IS NULL ORDER BY sort_order, name LIMIT 60"
        )->fetchAll(PDO::FETCH_ASSOC);
        $featured = $this->productCards('p.is_featured = 1 OR p.is_trending = 1 OR p.is_deal = 1', [], 24);
        if (count($featured) < 8) {
            $featured = $this->productCards('1 = 1', [], 24);
        }

        $jsonLd = [
            $this->organizationLd(),
            [
                '@context' => 'https://schema.org',
                '@type' => 'WebSite',
                'name' => $name,
                'url' => $this->siteUrl . '/',
                'potentialAction' => [
                    '@type' => 'SearchAction',
                    'target' => ['@type' => 'EntryPoint', 'urlTemplate' => $this->siteUrl . '/products?search={search_term_string}'],
                    'query-input' => 'required name=search_term_string',
                ],
            ],
        ];

        $body = '<h1>' . $this->e($name) . '</h1>';
        if ($tagline !== '') {
            $body .= '<p>' . $this->e($tagline) . '</p>';
        }
        $body .= '<p>' . $this->e($description) . '</p>';
        $body .= $this->categoryLinksHtml($categories, 'Shop by category');
        $body .= $this->productGridHtml($featured, 'Popular products');

        return $this->page(200, [
            'title' => $title,
            'description' => $description,
            'canonical' => $this->siteUrl . '/',
            'og_type' => 'website',
            'image' => $this->absoluteImage($store['logo'] ?? null) ?? $this->siteUrl . '/images/logo.png',
            'jsonld' => $jsonLd,
            'body' => $body,
        ]);
    }

    private function product(string $idOrSlug): array
    {
        $product = (new ProductService($this->pdo))->find($idOrSlug, false);
        if ($product === null || !(int) $product['is_active'] || !(int) $product['is_ecommerce_enabled'] || empty($product['variants'])) {
            return $this->notFound();
        }

        $slug = (string) $product['slug'];
        $canonical = $this->siteUrl . '/product/' . rawurlencode($slug);
        if ($slug !== '' && $idOrSlug !== $slug) {
            return ['status' => 301, 'redirect' => $canonical, 'head' => '', 'body' => ''];
        }

        $name = (string) $product['name'];
        $brand = trim((string) ($product['brand_name'] ?? ''));
        $variants = $product['variants'];
        $default = $variants[0];
        $prices = array_map(fn ($v) => (float) $v['retail_price'], $variants);
        $minPrice = min($prices);
        $maxPrice = max($prices);
        $mrp = (float) ($default['mrp'] ?? 0);
        $inStock = false;
        foreach ($variants as $v) {
            if ($this->variantInStock($v)) {
                $inStock = true;
                break;
            }
        }

        [$primaryCat, $sub] = $this->primaryCategory($product);
        $city = trim((string) ($this->store()['city'] ?? ''));

        $images = [];
        foreach (array_merge($product['images'] ?? [], ...array_map(fn ($v) => $v['images'] ?? [], $variants)) as $img) {
            $url = $this->absoluteImage($img['image_path'] ?? null);
            if ($url !== null && !in_array($url, $images, true)) {
                $images[] = $url;
            }
        }
        $ogImage = $this->absoluteImage($product['og_image_path'] ?? null) ?? ($images[0] ?? null);

        // Title: admin's meta_title, else "Brand Name - Buy Online at Best Price in City | Store"
        $title = trim((string) ($product['meta_title'] ?? ''));
        if ($title === '') {
            $title = ($brand !== '' && stripos($name, $brand) === false ? "{$brand} {$name}" : $name)
                . ' - Buy Online at Best Price' . ($city !== '' ? " in {$city}" : '');
        }
        $title = $this->withSiteName($title);

        $description = trim((string) ($product['meta_description'] ?? ''));
        if ($description === '') {
            $lead = trim((string) ($product['short_description'] ?? '')) ?: $this->plain((string) ($product['description'] ?? ''));
            $priceText = 'Buy ' . $name . ' online for ₹' . $this->money($minPrice)
                . ($mrp > $minPrice ? ' (MRP ₹' . $this->money($mrp) . ', save ' . (int) round((1 - $minPrice / $mrp) * 100) . '%)' : '')
                . '.';
            $description = $this->truncate($priceText . ' ' . $lead . ' ' . $this->deliveryPitch(), 300);
        }

        $reviews = $this->reviews((int) $product['id']);
        $breadcrumbs = [['Home', $this->siteUrl . '/']];
        if ($primaryCat) {
            $breadcrumbs[] = [$primaryCat['name'], $this->categoryUrl($primaryCat['slug'])];
            if ($sub) {
                $breadcrumbs[] = [$sub['name'], $this->categoryUrl($primaryCat['slug'], $sub['slug'])];
            }
        }
        $breadcrumbs[] = [$name, $canonical];

        $jsonLd = [$this->productLd($product, $canonical, $images, $reviews), $this->breadcrumbLd($breadcrumbs)];

        // Crawlable body
        $body = $this->breadcrumbHtml($breadcrumbs);
        $body .= '<article itemscope><h1>' . $this->e($name) . '</h1>';
        if ($brand !== '') {
            $body .= '<p>Brand: ' . $this->e($brand) . '</p>';
        }
        foreach (array_slice($images, 0, 6) as $i => $src) {
            $body .= '<img src="' . $this->e($src) . '" alt="' . $this->e($name . ($i ? ' image ' . ($i + 1) : '')) . '" width="400" height="400" loading="' . ($i ? 'lazy' : 'eager') . '" style="max-width:100%;height:auto">';
        }
        $body .= '<p><strong>Price: ₹' . $this->money($minPrice) . ($maxPrice > $minPrice ? ' – ₹' . $this->money($maxPrice) : '') . '</strong>'
            . ($mrp > $minPrice ? ' <s>MRP ₹' . $this->money($mrp) . '</s>' : '')
            . ' · ' . ($inStock ? 'In stock' : 'Out of stock') . '</p>';
        if (!empty($product['short_description'])) {
            $body .= '<p>' . $this->e((string) $product['short_description']) . '</p>';
        }
        if (!empty($product['bullet_points']) && is_array($product['bullet_points'])) {
            $body .= '<ul>';
            foreach ($product['bullet_points'] as $point) {
                if (is_string($point) && trim($point) !== '') {
                    $body .= '<li>' . $this->e($point) . '</li>';
                }
            }
            $body .= '</ul>';
        }
        if (count($variants) > 1) {
            $body .= '<h2>Available options</h2><ul>';
            foreach ($variants as $v) {
                $body .= '<li>' . $this->e($this->variantLabel($v) ?: (string) $v['sku']) . ' – ₹' . $this->money((float) $v['retail_price'])
                    . ($this->variantInStock($v) ? '' : ' (out of stock)') . '</li>';
            }
            $body .= '</ul>';
        }
        if (!empty($product['description'])) {
            $body .= '<h2>Product description</h2><div>' . $this->safeHtml((string) $product['description']) . '</div>';
        }
        if (!empty($product['specifications'])) {
            $body .= '<h2>Specifications</h2><table>';
            foreach ($product['specifications'] as $spec) {
                $label = $spec['spec_key'] ?? $spec['name'] ?? $spec['label'] ?? '';
                $value = $spec['spec_value'] ?? $spec['value'] ?? '';
                if ($label !== '' && $value !== '') {
                    $body .= '<tr><th>' . $this->e((string) $label) . '</th><td>' . $this->e((string) $value) . '</td></tr>';
                }
            }
            $body .= '</table>';
        }
        if ($reviews['count'] > 0) {
            $body .= '<h2>Customer reviews</h2><p>Rated ' . $reviews['average'] . ' out of 5 by ' . $reviews['count'] . ' customer(s).</p>';
            foreach ($reviews['items'] as $r) {
                $body .= '<blockquote><strong>' . $this->e((string) ($r['title'] ?: $r['rating'] . '/5')) . '</strong> – '
                    . $this->e($this->truncate((string) $r['comment'], 300)) . ' <cite>' . $this->e((string) $r['customer_name']) . '</cite></blockquote>';
            }
        }
        $body .= '</article>';
        if ($primaryCat) {
            $related = $this->productCards(
                'EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = :cat) AND p.id <> :self',
                ['cat' => $primaryCat['id'], 'self' => $product['id']],
                12,
            );
            $body .= $this->productGridHtml($related, 'More in ' . $primaryCat['name']);
        }

        return $this->page(200, [
            'title' => $title,
            'description' => $description,
            'keywords' => $product['seo_keywords'] ?? ($product['tags'] ?? null),
            'canonical' => $canonical,
            'og_type' => 'product',
            'image' => $ogImage,
            'image_alt' => $name,
            'extra_meta' => [
                ['property', 'product:price:amount', $this->money($minPrice, false)],
                ['property', 'product:price:currency', 'INR'],
                ['property', 'product:availability', $inStock ? 'in stock' : 'out of stock'],
                ['property', 'product:brand', $brand],
            ],
            'jsonld' => $jsonLd,
            'body' => $body,
        ]);
    }

    /** @param array<string, string> $query */
    private function category(string $catSlug, ?string $subSlug, int $page, array $query): array
    {
        $cat = $this->fetchOne("SELECT * FROM categories WHERE slug = :s AND status = 'ACTIVE' AND deleted_at IS NULL", ['s' => $catSlug]);
        if ($cat === null) {
            return $this->notFound();
        }
        $sub = null;
        if ($subSlug !== null) {
            $sub = $this->fetchOne("SELECT * FROM subcategories WHERE slug = :s AND status = 'ACTIVE' AND deleted_at IS NULL", ['s' => $subSlug]);
            if ($sub === null) {
                return ['status' => 301, 'redirect' => $this->categoryUrl($catSlug), 'head' => '', 'body' => ''];
            }
        }

        $entity = $sub ?? $cat;
        $label = $sub ? $sub['name'] : $cat['name'];
        $page = max(1, $page);

        $where = 'EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_id = :cat)';
        $params = ['cat' => $cat['id']];
        if ($sub) {
            $where .= ' AND EXISTS (SELECT 1 FROM product_subcategories ps WHERE ps.product_id = p.id AND ps.subcategory_id = :sub)';
            $params['sub'] = $sub['id'];
        }

        $stats = $this->fetchOne(
            "SELECT COUNT(DISTINCT p.id) AS total, MIN(v.retail_price) AS min_price
               FROM products p JOIN product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL AND v.status = 'ACTIVE'
              WHERE {$this->publicProductWhere()} AND {$where}",
            $params,
        ) ?? ['total' => 0, 'min_price' => null];
        $total = (int) $stats['total'];
        $totalPages = max(1, (int) ceil($total / self::CATEGORY_PAGE_SIZE));
        if ($page > $totalPages) {
            return $this->notFound();
        }

        $products = $this->productCards($where, $params, self::CATEGORY_PAGE_SIZE, ($page - 1) * self::CATEGORY_PAGE_SIZE);
        $brands = $this->fetchAll(
            "SELECT b.name, COUNT(*) c FROM products p JOIN brands b ON b.id = p.brand_id
              WHERE {$this->publicProductWhere()} AND {$where} GROUP BY b.id, b.name ORDER BY c DESC LIMIT 5",
            $params,
        );
        $brandNames = array_column($brands, 'name');
        $city = trim((string) ($this->store()['city'] ?? ''));

        $baseUrl = $sub ? $this->categoryUrl($cat['slug'], $sub['slug']) : $this->categoryUrl($cat['slug']);
        $canonical = $baseUrl . ($page > 1 ? '?page=' . $page : '');
        $filtered = array_diff_key($query, ['page' => 1]) !== [];

        $title = trim((string) ($entity['meta_title'] ?? ''));
        if ($title === '') {
            $title = ($sub ? "{$sub['name']} - {$cat['name']}" : $label) . ' - Buy Online at Best Prices' . ($city !== '' ? " in {$city}" : '');
        }
        if ($page > 1) {
            $title .= " - Page {$page}";
        }
        $title = $this->withSiteName($title);

        $description = trim((string) ($entity['meta_description'] ?? ''));
        if ($description === '') {
            $description = 'Shop ' . ($total > 0 ? $total . ' ' : '') . $label . ' products online'
                . ($stats['min_price'] !== null ? ' starting at ₹' . $this->money((float) $stats['min_price']) : '')
                . ($brandNames !== [] ? '. Top brands: ' . implode(', ', $brandNames) : '')
                . '. ' . $this->deliveryPitch();
        }
        $description = $this->truncate($description, 300);

        $breadcrumbs = [['Home', $this->siteUrl . '/'], [$cat['name'], $this->categoryUrl($cat['slug'])]];
        if ($sub) {
            $breadcrumbs[] = [$sub['name'], $baseUrl];
        }

        $itemList = [
            '@context' => 'https://schema.org',
            '@type' => 'ItemList',
            'name' => $label,
            'numberOfItems' => $total,
            'itemListElement' => array_map(fn ($p, $i) => [
                '@type' => 'ListItem',
                'position' => ($page - 1) * self::CATEGORY_PAGE_SIZE + $i + 1,
                'url' => $this->productUrl($p['slug']),
                'name' => $p['name'],
            ], $products, array_keys($products)),
        ];
        $collection = [
            '@context' => 'https://schema.org',
            '@type' => 'CollectionPage',
            'name' => $label,
            'description' => $description,
            'url' => $canonical,
        ];

        $body = $this->breadcrumbHtml($breadcrumbs) . '<h1>' . $this->e($label) . '</h1>';
        $intro = trim((string) ($entity['description'] ?? ''));
        if ($intro !== '') {
            $body .= '<p>' . $this->e($intro) . '</p>';
        }
        if (!$sub) {
            $subs = $this->fetchAll(
                "SELECT s.name, s.slug FROM subcategories s JOIN category_subcategory cs ON cs.subcategory_id = s.id
                  WHERE cs.category_id = :cat AND s.status = 'ACTIVE' AND s.deleted_at IS NULL ORDER BY s.sort_order, s.name",
                ['cat' => $cat['id']],
            );
            if ($subs !== []) {
                $body .= '<nav><h2>' . $this->e($cat['name']) . ' categories</h2><ul>';
                foreach ($subs as $s) {
                    $body .= '<li><a href="' . $this->e($this->categoryUrl($cat['slug'], $s['slug'])) . '">' . $this->e($s['name']) . '</a></li>';
                }
                $body .= '</ul></nav>';
            }
        }
        $body .= $this->productGridHtml($products, null);
        if ($totalPages > 1) {
            $body .= '<nav aria-label="Pages"><ul>';
            for ($i = 1; $i <= $totalPages; $i++) {
                $body .= '<li><a href="' . $this->e($baseUrl . ($i > 1 ? '?page=' . $i : '')) . '">Page ' . $i . '</a></li>';
            }
            $body .= '</ul></nav>';
        }
        // Long-form, keyword-rich copy written by admin (category landing text) - placed after products, like big marketplaces do.
        if (!empty($entity['seo_content'])) {
            $body .= '<section><h2>About ' . $this->e($label) . '</h2>' . $this->paragraphs((string) $entity['seo_content']) . '</section>';
        }

        return $this->page(200, [
            'title' => $title,
            'description' => $description,
            'keywords' => $entity['seo_keywords'] ?? null,
            'canonical' => $canonical,
            // filtered/sorted variants of a category are not separate pages
            'robots' => $filtered ? 'noindex, follow' : null,
            'image' => $this->absoluteImage($entity['image_path'] ?? null) ?? $this->absoluteImage($cat['image_path'] ?? null) ?? ($products[0]['image'] ?? null),
            'jsonld' => [$collection, $itemList, $this->breadcrumbLd($breadcrumbs)],
            'body' => $body,
        ]);
    }

    /** @param array<string, string> $query */
    private function productsListing(array $query): array
    {
        // Old ID-based category URLs -> permanent redirect to the slug URL.
        if (!empty($query['category_id']) || !empty($query['subcategory_id'])) {
            $cat = !empty($query['category_id'])
                ? $this->fetchOne("SELECT slug FROM categories WHERE id = :id AND status = 'ACTIVE' AND deleted_at IS NULL", ['id' => (int) $query['category_id']])
                : null;
            $sub = !empty($query['subcategory_id'])
                ? $this->fetchOne("SELECT id, slug FROM subcategories WHERE id = :id AND status = 'ACTIVE' AND deleted_at IS NULL", ['id' => (int) $query['subcategory_id']])
                : null;
            if ($cat === null && $sub !== null) {
                $cat = $this->fetchOne(
                    "SELECT c.slug FROM categories c JOIN category_subcategory cs ON cs.category_id = c.id
                      WHERE cs.subcategory_id = :sub AND c.status = 'ACTIVE' AND c.deleted_at IS NULL ORDER BY c.sort_order LIMIT 1",
                    ['sub' => $sub['id']],
                );
            }
            if ($cat !== null) {
                $rest = array_diff_key($query, ['category_id' => 1, 'subcategory_id' => 1]);
                $url = $this->categoryUrl($cat['slug'], $sub['slug'] ?? null) . ($rest !== [] ? '?' . http_build_query($rest) : '');

                return ['status' => 301, 'redirect' => $url, 'head' => '', 'body' => ''];
            }
        }

        $isSearch = trim((string) ($query['search'] ?? '')) !== '';
        $filtered = $query !== [];
        $title = $isSearch ? 'Search results for "' . $this->truncate((string) $query['search'], 60) . '"' : 'All Products - Shop Online at Best Prices';

        $body = '<h1>' . $this->e($title) . '</h1>';
        if (!$filtered) {
            $categories = $this->fetchAll("SELECT id, name, slug, image_path FROM categories WHERE status = 'ACTIVE' AND deleted_at IS NULL ORDER BY sort_order, name");
            $body .= $this->categoryLinksHtml($categories, 'Categories') . $this->productGridHtml($this->productCards('1 = 1', [], 24), null);
        }

        return $this->page(200, [
            'title' => $this->withSiteName($title),
            'description' => $this->defaultDescription(),
            'canonical' => $this->siteUrl . '/products',
            // search results & filter combinations must not be indexed (thin/duplicate content)
            'robots' => $filtered ? 'noindex, follow' : null,
            'body' => $body,
        ]);
    }

    private function contentPage(string $slug): array
    {
        $page = $this->fetchOne('SELECT * FROM pages WHERE slug = :s AND is_active = 1', ['s' => $slug]);
        if ($page === null) {
            return $this->notFound();
        }
        $text = $this->plain((string) $page['content']);

        return $this->page(200, [
            'title' => $this->withSiteName((string) $page['title']),
            'description' => $this->truncate($text, 160),
            'canonical' => $this->siteUrl . '/pages/' . rawurlencode($slug),
            'body' => '<h1>' . $this->e((string) $page['title']) . '</h1><div>' . $this->safeHtml((string) $page['content']) . '</div>',
        ]);
    }

    private function notFound(): array
    {
        return $this->page(404, [
            'title' => $this->withSiteName('Page not found'),
            'description' => $this->defaultDescription(),
            'robots' => 'noindex, follow',
            'canonical' => null,
            'body' => '<h1>Page not found</h1><p><a href="' . $this->e($this->siteUrl . '/') . '">Go to the home page</a></p>',
        ]);
    }

    // ------------------------------------------------------------------
    // sitemap.xml, robots.txt, Google Merchant feed
    // ------------------------------------------------------------------

    public function robotsTxt(): string
    {
        $lines = ['User-agent: *', 'Allow: /'];
        foreach (self::PRIVATE_PREFIXES as $p) {
            $lines[] = 'Disallow: ' . $p;
        }
        $lines[] = 'Disallow: /*?*search=';
        $lines[] = 'Disallow: /*?*sort=';
        $lines[] = 'Disallow: /*?*min_price=';
        $lines[] = 'Disallow: /*?*max_price=';
        $lines[] = '';
        $lines[] = 'Sitemap: ' . $this->siteUrl . '/sitemap.xml';

        return implode("\n", $lines) . "\n";
    }

    /** sitemap.xml = sitemap index pointing at the parts below. */
    public function sitemapIndex(): string
    {
        $total = (int) $this->pdo->query("SELECT COUNT(*) FROM products p WHERE {$this->publicProductWhere()}")->fetchColumn();
        $parts = ['sitemap-pages.xml', 'sitemap-categories.xml'];
        for ($i = 1; $i <= max(1, (int) ceil($total / self::PRODUCTS_PER_SITEMAP)); $i++) {
            $parts[] = "sitemap-products-{$i}.xml";
        }
        $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
        foreach ($parts as $part) {
            $xml .= '  <sitemap><loc>' . $this->x($this->siteUrl . '/' . $part) . '</loc><lastmod>' . date('Y-m-d') . "</lastmod></sitemap>\n";
        }

        return $xml . "</sitemapindex>\n";
    }

    /** @return ?string null when the part doesn't exist */
    public function sitemapPart(string $part): ?string
    {
        $urls = [];
        if ($part === 'pages') {
            $urls[] = ['loc' => $this->siteUrl . '/', 'priority' => '1.0', 'changefreq' => 'daily'];
            $urls[] = ['loc' => $this->siteUrl . '/products', 'priority' => '0.6', 'changefreq' => 'daily'];
            foreach ($this->fetchAll('SELECT slug, updated_at FROM pages WHERE is_active = 1') as $p) {
                $urls[] = ['loc' => $this->siteUrl . '/pages/' . rawurlencode($p['slug']), 'lastmod' => $p['updated_at'], 'priority' => '0.3'];
            }
        } elseif ($part === 'categories') {
            $cats = $this->fetchAll(
                "SELECT c.id, c.slug, c.updated_at, c.image_path FROM categories c
                  WHERE c.status = 'ACTIVE' AND c.deleted_at IS NULL
                    AND EXISTS (SELECT 1 FROM product_categories pc JOIN products p ON p.id = pc.product_id WHERE pc.category_id = c.id AND {$this->publicProductWhere()})"
            );
            foreach ($cats as $c) {
                $urls[] = ['loc' => $this->categoryUrl($c['slug']), 'lastmod' => $c['updated_at'], 'priority' => '0.8', 'changefreq' => 'daily',
                    'images' => array_filter([$this->absoluteImage($c['image_path'])])];
                $subs = $this->fetchAll(
                    "SELECT s.slug, s.updated_at FROM subcategories s JOIN category_subcategory cs ON cs.subcategory_id = s.id
                      WHERE cs.category_id = :cat AND s.status = 'ACTIVE' AND s.deleted_at IS NULL
                        AND EXISTS (SELECT 1 FROM product_subcategories ps JOIN product_categories pc ON pc.product_id = ps.product_id AND pc.category_id = :cat2
                                    JOIN products p ON p.id = ps.product_id WHERE ps.subcategory_id = s.id AND {$this->publicProductWhere()})",
                    ['cat' => $c['id'], 'cat2' => $c['id']],
                );
                foreach ($subs as $s) {
                    $urls[] = ['loc' => $this->categoryUrl($c['slug'], $s['slug']), 'lastmod' => $s['updated_at'], 'priority' => '0.7', 'changefreq' => 'daily'];
                }
            }
        } elseif (preg_match('/^products-(\d+)$/', $part, $m)) {
            $offset = ((int) $m[1] - 1) * self::PRODUCTS_PER_SITEMAP;
            $rows = $this->fetchAll(
                "SELECT p.id, p.slug, p.name, p.updated_at,
                        (SELECT pi.image_path FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order LIMIT 1) AS image
                   FROM products p WHERE {$this->publicProductWhere()} ORDER BY p.id LIMIT " . self::PRODUCTS_PER_SITEMAP . " OFFSET {$offset}"
            );
            if ($rows === [] && (int) $m[1] > 1) {
                return null;
            }
            foreach ($rows as $r) {
                $urls[] = ['loc' => $this->productUrl($r['slug']), 'lastmod' => $r['updated_at'], 'priority' => '0.9', 'changefreq' => 'weekly',
                    'images' => array_filter([$this->absoluteImage($r['image'])]), 'image_title' => $r['name']];
            }
        } else {
            return null;
        }

        $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
            . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">' . "\n";
        foreach ($urls as $u) {
            $xml .= '  <url><loc>' . $this->x($u['loc']) . '</loc>';
            if (!empty($u['lastmod'])) {
                $xml .= '<lastmod>' . date('Y-m-d', strtotime((string) $u['lastmod'])) . '</lastmod>';
            }
            if (!empty($u['changefreq'])) {
                $xml .= '<changefreq>' . $u['changefreq'] . '</changefreq>';
            }
            if (!empty($u['priority'])) {
                $xml .= '<priority>' . $u['priority'] . '</priority>';
            }
            foreach ($u['images'] ?? [] as $img) {
                $xml .= '<image:image><image:loc>' . $this->x($img) . '</image:loc>'
                    . (!empty($u['image_title']) ? '<image:title>' . $this->x($u['image_title']) . '</image:title>' : '') . '</image:image>';
            }
            $xml .= "</url>\n";
        }

        return $xml . "</urlset>\n";
    }

    /**
     * Google Merchant Center feed (RSS 2.0 + g: namespace). Submit
     * {site}/feeds/google-merchant.xml in Merchant Center to get FREE
     * product listings in Google Shopping / Search - one item per variant.
     */
    public function merchantFeed(): string
    {
        $store = $this->store();
        $delivery = $this->delivery();
        $shippingPrice = (float) ($delivery['delivery_charge'] ?? 0);

        $rows = $this->fetchAll(
            "SELECT p.id AS product_id, p.slug, p.name, p.short_description, p.description, b.name AS brand,
                    v.id AS variant_id, v.sku, v.barcode, v.mrp, v.retail_price, i.available
               FROM products p
               JOIN product_variants v ON v.product_id = p.id AND v.deleted_at IS NULL AND v.status = 'ACTIVE'
                    AND (v.expiry_date IS NULL OR v.expiry_date >= CURRENT_DATE())
               LEFT JOIN brands b ON b.id = p.brand_id
               LEFT JOIN inventory i ON i.variant_id = v.id
              WHERE {$this->publicProductWhere()}
              ORDER BY p.id, v.is_default DESC, v.id"
        );

        $imgStmt = $this->pdo->prepare(
            'SELECT image_path FROM variant_images WHERE variant_id = :v ORDER BY is_primary DESC, sort_order LIMIT 5'
        );
        $pImgStmt = $this->pdo->prepare(
            'SELECT image_path FROM product_images WHERE product_id = :p ORDER BY is_primary DESC, sort_order LIMIT 5'
        );
        $catStmt = $this->pdo->prepare(
            'SELECT c.name FROM product_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.product_id = :p ORDER BY pc.is_primary DESC LIMIT 1'
        );
        $variantNames = $this->pdo->prepare(
            'SELECT GROUP_CONCAT(vav.value ORDER BY va.id SEPARATOR " / ") FROM product_variant_values pvv
               JOIN variant_attribute_values vav ON vav.id = pvv.attribute_value_id
               JOIN variant_attributes va ON va.id = vav.attribute_id WHERE pvv.variant_id = :v'
        );

        $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
            . '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>' . "\n"
            . '<title>' . $this->x($this->siteName()) . '</title><link>' . $this->x($this->siteUrl . '/') . '</link>'
            . '<description>' . $this->x((string) ($store['description'] ?? $this->defaultDescription())) . "</description>\n";

        foreach ($rows as $r) {
            $imgStmt->execute(['v' => $r['variant_id']]);
            $images = $imgStmt->fetchAll(PDO::FETCH_COLUMN);
            if ($images === []) {
                $pImgStmt->execute(['p' => $r['product_id']]);
                $images = $pImgStmt->fetchAll(PDO::FETCH_COLUMN);
            }
            $images = array_values(array_filter(array_map(fn ($i) => $this->absoluteImage($i), $images)));
            if ($images === []) {
                continue; // Google rejects items without an image
            }
            $catStmt->execute(['p' => $r['product_id']]);
            $category = (string) ($catStmt->fetchColumn() ?: '');
            $variantNames->execute(['v' => $r['variant_id']]);
            $variantLabel = (string) ($variantNames->fetchColumn() ?: '');

            $mrp = (float) $r['mrp'];
            $price = (float) $r['retail_price'];
            $title = trim(($r['brand'] && stripos((string) $r['name'], (string) $r['brand']) === false ? $r['brand'] . ' ' : '') . $r['name']
                . ($variantLabel !== '' ? ' - ' . $variantLabel : ''));
            $desc = trim((string) ($r['short_description'] ?: $this->plain((string) $r['description']))) ?: $title;
            $gtin = preg_match('/^\d{8}$|^\d{12,14}$/', (string) $r['barcode']) ? (string) $r['barcode'] : null;

            $xml .= '<item>'
                . '<g:id>' . $this->x((string) $r['sku']) . '</g:id>'
                . '<g:item_group_id>' . (int) $r['product_id'] . '</g:item_group_id>'
                . '<g:title>' . $this->x($this->truncate($title, 150)) . '</g:title>'
                . '<g:description>' . $this->x($this->truncate($desc, 5000)) . '</g:description>'
                . '<g:link>' . $this->x($this->productUrl($r['slug']) . '?variant=' . (int) $r['variant_id']) . '</g:link>'
                . '<g:image_link>' . $this->x($images[0]) . '</g:image_link>';
            foreach (array_slice($images, 1) as $extra) {
                $xml .= '<g:additional_image_link>' . $this->x($extra) . '</g:additional_image_link>';
            }
            $xml .= '<g:availability>' . ((float) ($r['available'] ?? 0) > 0 ? 'in_stock' : 'out_of_stock') . '</g:availability>'
                . '<g:price>' . $this->money($mrp > $price ? $mrp : $price, false) . ' INR</g:price>'
                . ($mrp > $price ? '<g:sale_price>' . $this->money($price, false) . ' INR</g:sale_price>' : '')
                . '<g:condition>new</g:condition>'
                . ($r['brand'] ? '<g:brand>' . $this->x((string) $r['brand']) . '</g:brand>' : '')
                . ($gtin ? '<g:gtin>' . $gtin . '</g:gtin>' : '<g:mpn>' . $this->x((string) $r['sku']) . '</g:mpn>')
                . (!$gtin && !$r['brand'] ? '<g:identifier_exists>no</g:identifier_exists>' : '')
                . ($category !== '' ? '<g:product_type>' . $this->x($category) . '</g:product_type>' : '')
                . '<g:shipping><g:country>IN</g:country><g:price>' . $this->money($shippingPrice, false) . ' INR</g:price></g:shipping>'
                . "</item>\n";
        }

        return $xml . "</channel></rss>\n";
    }

    // ------------------------------------------------------------------
    // JSON-LD builders
    // ------------------------------------------------------------------

    private function productLd(array $product, string $url, array $images, array $reviews): array
    {
        $brand = trim((string) ($product['brand_name'] ?? ''));
        $delivery = $this->delivery();
        $validUntil = date('Y-m-d', strtotime('+30 days'));

        $offers = [];
        foreach ($product['variants'] as $v) {
            $offer = [
                '@type' => 'Offer',
                'sku' => (string) $v['sku'],
                'url' => $url . (count($product['variants']) > 1 ? '?variant=' . (int) $v['id'] : ''),
                'priceCurrency' => 'INR',
                'price' => $this->money((float) $v['retail_price'], false),
                'priceValidUntil' => $validUntil,
                'itemCondition' => 'https://schema.org/NewCondition',
                'availability' => $this->variantInStock($v) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
                'seller' => ['@type' => 'Organization', 'name' => $this->siteName()],
                'shippingDetails' => [
                    '@type' => 'OfferShippingDetails',
                    'shippingDestination' => ['@type' => 'DefinedRegion', 'addressCountry' => 'IN'],
                    'shippingRate' => [
                        '@type' => 'MonetaryAmount',
                        'currency' => 'INR',
                        'value' => (float) $v['retail_price'] >= (float) ($delivery['free_delivery_threshold'] ?? INF)
                            ? 0 : (float) ($delivery['delivery_charge'] ?? 0),
                    ],
                ],
            ];
            if ((float) ($v['mrp'] ?? 0) > (float) $v['retail_price']) {
                $offer['priceSpecification'] = [
                    '@type' => 'UnitPriceSpecification',
                    'priceType' => 'https://schema.org/ListPrice',
                    'price' => $this->money((float) $v['mrp'], false),
                    'priceCurrency' => 'INR',
                ];
            }
            if ((int) ($product['returnable'] ?? 0) === 1 && (int) ($product['return_window_days'] ?? 0) > 0) {
                $offer['hasMerchantReturnPolicy'] = [
                    '@type' => 'MerchantReturnPolicy',
                    'applicableCountry' => 'IN',
                    'returnPolicyCategory' => 'https://schema.org/MerchantReturnFiniteReturnWindow',
                    'merchantReturnDays' => (int) $product['return_window_days'],
                    'returnMethod' => 'https://schema.org/ReturnByMail',
                ];
            } else {
                $offer['hasMerchantReturnPolicy'] = [
                    '@type' => 'MerchantReturnPolicy',
                    'applicableCountry' => 'IN',
                    'returnPolicyCategory' => 'https://schema.org/MerchantReturnNotPermitted',
                ];
            }
            $offers[] = $offer;
        }

        $default = $product['variants'][0];
        $ld = [
            '@context' => 'https://schema.org',
            '@type' => 'Product',
            'name' => (string) $product['name'],
            'url' => $url,
            'image' => $images,
            'description' => $this->truncate(
                trim((string) ($product['short_description'] ?? '')) ?: $this->plain((string) ($product['description'] ?? '')) ?: (string) $product['name'],
                5000,
            ),
            'sku' => (string) $default['sku'],
            'offers' => count($offers) === 1 ? $offers[0] : $offers,
        ];
        if (!empty($product['product_code'])) {
            $ld['mpn'] = (string) $product['product_code'];
        }
        if (preg_match('/^\d{8}$|^\d{12,14}$/', (string) ($default['barcode'] ?? ''))) {
            $ld['gtin'] = (string) $default['barcode'];
        }
        if ($brand !== '') {
            $ld['brand'] = ['@type' => 'Brand', 'name' => $brand];
        }
        if (!empty($product['country_of_origin'])) {
            $ld['countryOfOrigin'] = (string) $product['country_of_origin'];
        }
        if (!empty($product['weight_grams'])) {
            $ld['weight'] = ['@type' => 'QuantitativeValue', 'value' => (float) $product['weight_grams'], 'unitCode' => 'GRM'];
        }
        // Only real, approved customer reviews - never invented.
        if ($reviews['count'] > 0) {
            $ld['aggregateRating'] = [
                '@type' => 'AggregateRating',
                'ratingValue' => $reviews['average'],
                'reviewCount' => $reviews['count'],
                'bestRating' => 5,
                'worstRating' => 1,
            ];
            $ld['review'] = array_map(fn ($r) => [
                '@type' => 'Review',
                'author' => ['@type' => 'Person', 'name' => (string) $r['customer_name']],
                'datePublished' => date('Y-m-d', strtotime((string) $r['created_at'])),
                'reviewRating' => ['@type' => 'Rating', 'ratingValue' => (int) $r['rating'], 'bestRating' => 5],
                'name' => (string) ($r['title'] ?? ''),
                'reviewBody' => $this->truncate((string) $r['comment'], 1000),
            ], $reviews['items']);
        }

        return $ld;
    }

    /** @param list<array{0: string, 1: string}> $crumbs */
    private function breadcrumbLd(array $crumbs): array
    {
        return [
            '@context' => 'https://schema.org',
            '@type' => 'BreadcrumbList',
            'itemListElement' => array_map(fn ($c, $i) => ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $c[0], 'item' => $c[1]], $crumbs, array_keys($crumbs)),
        ];
    }

    private function organizationLd(): array
    {
        $s = $this->store();
        $ld = [
            '@context' => 'https://schema.org',
            '@type' => 'OnlineStore',
            'name' => $this->siteName(),
            'url' => $this->siteUrl . '/',
            'logo' => $this->absoluteImage($s['logo'] ?? null) ?? $this->siteUrl . '/images/logo.png',
        ];
        if (!empty($s['description'])) {
            $ld['description'] = (string) $s['description'];
        }
        if (!empty($s['phone']) || !empty($s['email'])) {
            $ld['contactPoint'] = array_filter([
                '@type' => 'ContactPoint',
                'contactType' => 'customer service',
                'telephone' => $s['phone'] ?: null,
                'email' => $s['email'] ?: null,
                'areaServed' => 'IN',
                'availableLanguage' => ['en', 'hi'],
            ]);
        }
        if (!empty($s['address']) || !empty($s['city'])) {
            $ld['address'] = array_filter([
                '@type' => 'PostalAddress',
                'streetAddress' => $s['address'] ?: null,
                'addressLocality' => $s['city'] ?: null,
                'addressRegion' => $s['state'] ?: null,
                'postalCode' => $s['pincode'] ?: null,
                'addressCountry' => 'IN',
            ]);
        }
        $sameAs = array_values(array_filter([$s['facebook_url'] ?? null, $s['instagram_url'] ?? null, $s['youtube_url'] ?? null]));
        if ($sameAs !== []) {
            $ld['sameAs'] = $sameAs;
        }

        return $ld;
    }

    // ------------------------------------------------------------------
    // HTML helpers
    // ------------------------------------------------------------------

    /**
     * @param array{title: string, description: string, canonical?: ?string, robots?: ?string, keywords?: ?string,
     *   og_type?: string, image?: ?string, image_alt?: string, extra_meta?: list<array{0: string, 1: string, 2: string}>,
     *   jsonld?: list<array<string, mixed>>, body?: string} $m
     */
    private function page(int $status, array $m): array
    {
        $siteName = $this->siteName();
        $title = $this->truncate($m['title'], 120);
        $desc = $this->truncate($m['description'], 300);
        $canonical = array_key_exists('canonical', $m) ? $m['canonical'] : null;
        $image = $m['image'] ?? ($this->siteUrl . '/images/logo.png');
        $robots = $m['robots'] ?? 'index, follow, max-image-preview:large, max-snippet:-1';

        $h = '<title data-seo="ssr">' . $this->e($title) . "</title>\n";
        $tags = [
            ['name', 'description', $desc],
            ['name', 'robots', $robots],
            ['name', 'keywords', (string) ($m['keywords'] ?? '')],
            ['property', 'og:site_name', $siteName],
            ['property', 'og:type', $m['og_type'] ?? 'website'],
            ['property', 'og:title', $title],
            ['property', 'og:description', $desc],
            ['property', 'og:locale', 'en_IN'],
            ['property', 'og:image', (string) $image],
            ['property', 'og:image:alt', (string) ($m['image_alt'] ?? $title)],
            ['name', 'twitter:card', 'summary_large_image'],
            ['name', 'twitter:title', $title],
            ['name', 'twitter:description', $desc],
            ['name', 'twitter:image', (string) $image],
        ];
        if ($canonical) {
            $tags[] = ['property', 'og:url', $canonical];
        }
        foreach (array_merge($tags, $m['extra_meta'] ?? []) as [$attr, $key, $value]) {
            if (trim((string) $value) !== '') {
                $h .= '<meta data-seo="ssr" ' . $attr . '="' . $this->e($key) . '" content="' . $this->e((string) $value) . "\">\n";
            }
        }
        if ($canonical) {
            $h .= '<link data-seo="ssr" rel="canonical" href="' . $this->e($canonical) . "\">\n";
        }
        foreach ($m['jsonld'] ?? [] as $ld) {
            $h .= '<script data-seo="ssr" type="application/ld+json">'
                . json_encode($ld, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP)
                . "</script>\n";
        }

        $body = '';
        if (!empty($m['body'])) {
            $body = '<div data-seo="ssr" style="max-width:1100px;margin:0 auto;padding:16px;font-family:system-ui,-apple-system,sans-serif;color:#1e293b;line-height:1.5">'
                . '<header><a href="' . $this->e($this->siteUrl . '/') . '" style="font-weight:700;font-size:20px;color:#004b87;text-decoration:none">' . $this->e($siteName) . '</a></header>'
                . '<main>' . $m['body'] . '</main></div>';
        }

        return ['status' => $status, 'redirect' => null, 'head' => $h, 'body' => $body];
    }

    /** @param list<array<string, mixed>> $products */
    private function productGridHtml(array $products, ?string $heading): string
    {
        if ($products === []) {
            return '';
        }
        $html = $heading !== null ? '<h2>' . $this->e($heading) . '</h2>' : '';
        $html .= '<ul style="list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px">';
        foreach ($products as $p) {
            $html .= '<li><a href="' . $this->e($this->productUrl($p['slug'])) . '" style="color:inherit;text-decoration:none">'
                . ($p['image'] ? '<img src="' . $this->e($p['image']) . '" alt="' . $this->e($p['name']) . '" width="160" height="160" loading="lazy" style="width:100%;height:auto;aspect-ratio:1;object-fit:contain">' : '')
                . '<span style="display:block;font-size:14px">' . $this->e($p['name']) . '</span>'
                . '<span style="font-weight:700">₹' . $this->money((float) $p['min_price']) . '</span>'
                . ((float) $p['mrp'] > (float) $p['min_price'] ? ' <s style="color:#64748b;font-size:12px">₹' . $this->money((float) $p['mrp']) . '</s>' : '')
                . '</a></li>';
        }

        return $html . '</ul>';
    }

    /** @param list<array<string, mixed>> $categories */
    private function categoryLinksHtml(array $categories, string $heading): string
    {
        if ($categories === []) {
            return '';
        }
        $html = '<nav><h2>' . $this->e($heading) . '</h2><ul>';
        foreach ($categories as $c) {
            $html .= '<li><a href="' . $this->e($this->categoryUrl($c['slug'])) . '">' . $this->e($c['name']) . '</a></li>';
        }

        return $html . '</ul></nav>';
    }

    /** @param list<array{0: string, 1: string}> $crumbs */
    private function breadcrumbHtml(array $crumbs): string
    {
        $parts = [];
        foreach ($crumbs as $i => [$name, $url]) {
            $parts[] = $i === count($crumbs) - 1 ? '<span>' . $this->e($name) . '</span>' : '<a href="' . $this->e($url) . '">' . $this->e($name) . '</a>';
        }

        return '<nav aria-label="Breadcrumb" style="font-size:13px">' . implode(' › ', $parts) . '</nav>';
    }

    // ------------------------------------------------------------------
    // Data helpers
    // ------------------------------------------------------------------

    private function publicProductWhere(): string
    {
        return "p.deleted_at IS NULL AND p.is_active = 1 AND p.is_ecommerce_enabled = 1
            AND (p.expiry_date IS NULL OR p.expiry_date >= CURRENT_DATE())
            AND EXISTS (SELECT 1 FROM product_variants pv WHERE pv.product_id = p.id AND pv.deleted_at IS NULL AND pv.status = 'ACTIVE'
                        AND (pv.expiry_date IS NULL OR pv.expiry_date >= CURRENT_DATE()))";
    }

    /** @return list<array{id: int, name: string, slug: string, image: ?string, min_price: float, mrp: float}> */
    private function productCards(string $where, array $params, int $limit, int $offset = 0): array
    {
        $rows = $this->fetchAll(
            "SELECT p.id, p.name, p.slug,
                    (SELECT MIN(v.retail_price) FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL AND v.status = 'ACTIVE') AS min_price,
                    (SELECT v.mrp FROM product_variants v WHERE v.product_id = p.id AND v.deleted_at IS NULL AND v.status = 'ACTIVE' ORDER BY v.is_default DESC, v.id LIMIT 1) AS mrp,
                    (SELECT COALESCE(pi.thumb_path, pi.image_path) FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.is_primary DESC, pi.sort_order LIMIT 1) AS image
               FROM products p
              WHERE {$this->publicProductWhere()} AND ({$where})
              ORDER BY p.is_featured DESC, p.updated_at DESC, p.id DESC
              LIMIT " . max(1, $limit) . ' OFFSET ' . max(0, $offset),
            $params,
        );

        return array_map(fn ($r) => [
            'id' => (int) $r['id'],
            'name' => (string) $r['name'],
            'slug' => (string) $r['slug'],
            'image' => $this->absoluteImage($r['image']),
            'min_price' => (float) $r['min_price'],
            'mrp' => (float) $r['mrp'],
        ], $rows);
    }

    /** @return array{0: ?array, 1: ?array} primary category + first subcategory under it */
    private function primaryCategory(array $product): array
    {
        $cats = $product['categories'] ?? [];
        if ($cats === []) {
            return [null, null];
        }
        usort($cats, fn ($a, $b) => (int) $b['is_primary'] <=> (int) $a['is_primary']);
        $cat = $cats[0];
        $sub = null;
        foreach ($product['subcategories'] ?? [] as $s) {
            $linked = $this->fetchOne('SELECT 1 AS ok FROM category_subcategory WHERE category_id = :c AND subcategory_id = :s', ['c' => $cat['id'], 's' => $s['id']]);
            if ($linked !== null) {
                $sub = $s;
                break;
            }
        }

        return [$cat, $sub];
    }

    /** @return array{count: int, average: float, items: list<array<string, mixed>>} */
    private function reviews(int $productId): array
    {
        $agg = $this->fetchOne(
            "SELECT COUNT(*) AS c, AVG(rating) AS a FROM customer_reviews WHERE product_id = :p AND status = 'APPROVED' AND deleted_at IS NULL",
            ['p' => $productId],
        );
        $count = (int) ($agg['c'] ?? 0);
        if ($count === 0) {
            return ['count' => 0, 'average' => 0.0, 'items' => []];
        }
        $items = $this->fetchAll(
            "SELECT customer_name, rating, title, comment, created_at FROM customer_reviews
              WHERE product_id = :p AND status = 'APPROVED' AND deleted_at IS NULL ORDER BY helpful_count DESC, created_at DESC LIMIT 5",
            ['p' => $productId],
        );

        return ['count' => $count, 'average' => round((float) $agg['a'], 1), 'items' => $items];
    }

    private function variantInStock(array $v): bool
    {
        return (float) ($v['available'] ?? 0) > 0;
    }

    private function variantLabel(array $v): string
    {
        $values = array_filter(array_map(fn ($a) => $a['value'] ?? null, $v['attribute_values'] ?? []));
        if ($values !== []) {
            return implode(' / ', $values);
        }

        return trim(implode(' ', array_filter([$v['size_label'] ?? null, $v['color_name'] ?? null, $v['design_name'] ?? null])));
    }

    private function store(): array
    {
        if ($this->store === null) {
            try {
                $this->store = $this->pdo->query('SELECT * FROM store_settings WHERE is_active = 1 ORDER BY id LIMIT 1')->fetch(PDO::FETCH_ASSOC) ?: [];
            } catch (\Throwable) {
                $this->store = [];
            }
        }

        return $this->store;
    }

    private function delivery(): array
    {
        if ($this->delivery === null) {
            try {
                $this->delivery = $this->pdo->query('SELECT * FROM delivery_settings WHERE is_active = 1 ORDER BY id LIMIT 1')->fetch(PDO::FETCH_ASSOC) ?: [];
            } catch (\Throwable) {
                $this->delivery = [];
            }
        }

        return $this->delivery;
    }

    private function siteName(): string
    {
        $fromEnv = trim((string) Config::get('seo.site_name', ''));
        if ($fromEnv !== '') {
            return $fromEnv;
        }
        $name = trim((string) ($this->store()['store_name'] ?? ''));

        return $name !== '' ? $name : 'Shop Adams';
    }

    private function withSiteName(string $title): string
    {
        $suffix = ' | ' . $this->siteName();
        // keep titles around Google's ~60 char display width when possible
        if (mb_strlen($title . $suffix) > 70 && mb_strlen($title) <= 70) {
            return $title;
        }

        return $title . $suffix;
    }

    private function defaultDescription(): string
    {
        $s = $this->store();
        $desc = trim((string) ($s['description'] ?? ''));
        if ($desc === '') {
            $desc = 'Shop groceries, daily essentials, beauty, home and gift items online at the best prices.';
        }

        return $this->truncate($desc . ' ' . $this->deliveryPitch(), 300);
    }

    private function deliveryPitch(): string
    {
        $d = $this->delivery();
        $city = trim((string) ($this->store()['city'] ?? ''));
        $free = (float) ($d['free_delivery_threshold'] ?? 0);
        $parts = [];
        $parts[] = 'Fast home delivery' . ($city !== '' ? " in {$city}" : '');
        if ($free > 0) {
            $parts[] = 'free delivery above ₹' . $this->money($free);
        }

        return implode(', ', $parts) . '.';
    }

    private function productUrl(string $slug): string
    {
        return $this->siteUrl . '/product/' . rawurlencode($slug);
    }

    private function categoryUrl(string $catSlug, ?string $subSlug = null): string
    {
        return $this->siteUrl . '/category/' . rawurlencode($catSlug) . ($subSlug ? '/' . rawurlencode($subSlug) : '');
    }

    private function absoluteImage(mixed $path): ?string
    {
        $path = trim((string) $path);
        if ($path === '') {
            return null;
        }
        if (preg_match('#^https?://#i', $path)) {
            return $path;
        }
        if (str_starts_with($path, '/images/')) {
            return $this->siteUrl . $path; // storefront's own bundled images
        }

        return $this->assetUrl . '/' . ltrim($path, '/');
    }

    private function fetchOne(string $sql, array $params = []): ?array
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row === false ? null : $row;
    }

    /** @return list<array<string, mixed>> */
    private function fetchAll(string $sql, array $params = []): array
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    private function money(float $value, bool $pretty = true): string
    {
        if (!$pretty) {
            return number_format($value, 2, '.', '');
        }

        return fmod($value, 1.0) === 0.0 ? number_format($value, 0, '.', ',') : number_format($value, 2, '.', ',');
    }

    private function plain(string $html): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags(str_replace(['<br', '</p>', '</li>'], [' <br', ' </p>', ' </li>'], $html)), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
    }

    /** Keeps simple formatting tags only - admin text is never output raw. */
    private function safeHtml(string $html): string
    {
        $clean = strip_tags($html, '<p><br><ul><ol><li><strong><b><em><i><h2><h3><h4><table><thead><tbody><tr><th><td>');
        // drop every attribute (on*, style, href=javascript:...) from the allowed tags
        return (string) preg_replace('#<(\w+)\b[^>]*>#', '<$1>', $clean);
    }

    /** Plain admin text -> escaped <p> paragraphs (blank line = new paragraph). */
    private function paragraphs(string $text): string
    {
        $out = '';
        foreach (preg_split('/\R\s*\R/u', trim($text)) ?: [] as $para) {
            if (trim($para) !== '') {
                $out .= '<p>' . nl2br($this->e(trim($para)), false) . '</p>';
            }
        }

        return $out;
    }

    private function truncate(string $text, int $max): string
    {
        $text = trim((string) preg_replace('/\s+/u', ' ', $text));
        if (mb_strlen($text) <= $max) {
            return $text;
        }
        $cut = mb_substr($text, 0, $max - 1);
        $space = mb_strrpos($cut, ' ');

        return rtrim($space !== false && $space > $max * 0.6 ? mb_substr($cut, 0, $space) : $cut, ' ,.;:-') . '…';
    }

    private function e(string $s): string
    {
        return htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    private function x(string $s): string
    {
        return htmlspecialchars($s, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }
}
