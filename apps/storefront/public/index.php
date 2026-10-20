<?php

/**
 * Storefront server entry (production only - `npm run dev` doesn't use it).
 *
 * Vite builds a single-page app whose HTML is the same empty shell for
 * every URL. Search engines and link previews (WhatsApp, Facebook, Bing,
 * Google's first pass) then see no product, no price, no title. This file
 * serves that shell with the real SEO for the requested URL filled in:
 * <title>, meta description, canonical, Open Graph, JSON-LD and a plain
 * HTML version of the page (replaced by the React app as soon as it loads).
 *
 * The SEO data comes from the backend API (/api/seo/render). If the API is
 * slow or down, the plain shell is served - the site never breaks.
 *
 * Also serves /robots.txt, /sitemap.xml, /sitemap-*.xml and
 * /feeds/google-merchant.xml from the API on this (the storefront's) domain.
 */

declare(strict_types=1);

$config = is_file(__DIR__ . '/seo.config.php') ? (array) require __DIR__ . '/seo.config.php' : [];
$apiUrl = rtrim((string) (getenv('STOREFRONT_API_URL') ?: ($config['api_url'] ?? 'https://api.shopadams.in/api')), '/');
$timeout = (float) ($config['timeout_seconds'] ?? 2.5);
$cacheTtl = (int) ($config['cache_seconds'] ?? 300);

$requestUri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
$path = (string) (parse_url($requestUri, PHP_URL_PATH) ?: '/');
$queryString = (string) (parse_url($requestUri, PHP_URL_QUERY) ?? '');

/** GET from the API with a short timeout; returns [status, body, contentType] or null. */
$fetch = static function (string $url) use ($timeout): ?array {
    if (!function_exists('curl_init')) {
        $ctx = stream_context_create(['http' => ['timeout' => $timeout, 'ignore_errors' => true]]);
        $body = @file_get_contents($url, false, $ctx);
        if ($body === false) {
            return null;
        }
        $status = 200;
        foreach ($http_response_header ?? [] as $h) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) {
                $status = (int) $m[1];
            }
        }

        return [$status, $body, 'application/octet-stream'];
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => $timeout,
        CURLOPT_TIMEOUT => max($timeout, 2.0),
        CURLOPT_HTTPHEADER => ['Accept: application/json, application/xml, text/plain'],
    ]);
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $type = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
    curl_close($ch);

    return $body === false ? null : [$status, (string) $body, $type];
};

// ---- robots.txt / sitemaps / merchant feed (whitelisted names only) -------------
$special = (string) ($_GET['__seo'] ?? '');
if ($special !== '') {
    $allowed = $special === 'robots.txt' || $special === 'sitemap.xml' || $special === 'google-merchant.xml'
        || preg_match('/^sitemap-[a-z0-9-]{1,40}\.xml$/', $special) === 1;
    $result = $allowed ? $fetch($apiUrl . '/seo/' . $special) : null;
    if ($result === null || $result[0] !== 200) {
        http_response_code($allowed && $result !== null ? $result[0] : 404);
        header('Content-Type: text/plain; charset=utf-8');
        echo $special === 'robots.txt' ? "User-agent: *\nAllow: /\n" : 'Not found';
        exit;
    }
    header('Content-Type: ' . ($special === 'robots.txt' ? 'text/plain' : 'application/xml') . '; charset=utf-8');
    header('Cache-Control: public, max-age=3600');
    echo $result[1];
    exit;
}

// ---- HTML pages --------------------------------------------------------------
$shell = @file_get_contents(__DIR__ . '/index.html');
if ($shell === false) {
    http_response_code(500);
    echo 'Storefront build (index.html) is missing next to index.php.';
    exit;
}

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');

// Small file cache so busy pages don't hit the API on every request.
$cacheDir = sys_get_temp_dir() . '/storefront-seo-cache';
$cacheFile = $cacheDir . '/' . sha1($path . '?' . $queryString) . '.json';
$seo = null;
if ($cacheTtl > 0 && is_file($cacheFile) && (time() - (int) filemtime($cacheFile)) < $cacheTtl) {
    $seo = json_decode((string) @file_get_contents($cacheFile), true);
}
if (!is_array($seo)) {
    $result = $fetch($apiUrl . '/seo/render?' . http_build_query(['path' => $path, 'query' => $queryString]));
    $decoded = $result !== null && $result[0] === 200 ? json_decode($result[1], true) : null;
    if (is_array($decoded) && isset($decoded['status'])) {
        $seo = $decoded;
        if ($cacheTtl > 0) {
            if (!is_dir($cacheDir)) {
                @mkdir($cacheDir, 0775, true);
            }
            @file_put_contents($cacheFile, json_encode($seo), LOCK_EX);
        }
    }
}

if (!is_array($seo)) {
    echo $shell; // API unavailable - plain app shell, still fully working
    exit;
}

if (!empty($seo['redirect']) && in_array((int) $seo['status'], [301, 302, 308], true)) {
    header('Location: ' . $seo['redirect'], true, (int) $seo['status']);
    exit;
}

http_response_code((int) $seo['status'] ?: 200);

$html = $shell;
if (!empty($seo['head'])) {
    $html = (string) preg_replace('#<title>.*?</title>\s*#s', '', $html, 1);
    $html = (string) preg_replace('#</head>#i', $seo['head'] . '</head>', $html, 1);
}
if (!empty($seo['body'])) {
    // Swap the loading spinner inside #root for the crawlable page content;
    // React replaces it as soon as the app mounts.
    $replaced = preg_replace('#<div id="root">.*</div>(\s*)</body>#s', '<div id="root">' . str_replace(['\\', '$'], ['\\\\', '\\$'], (string) $seo['body']) . '</div>$1</body>', $html, 1);
    if (is_string($replaced)) {
        $html = $replaced;
    }
}

echo $html;
