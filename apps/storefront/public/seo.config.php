<?php

// Storefront server-side SEO settings (used by index.php on the live server).
// The STOREFRONT_API_URL environment variable, if set, overrides api_url.
return [
    // Backend API base URL as reachable FROM the storefront server.
    // Same server: a local address is fastest, e.g. 'http://127.0.0.1:8080/api'.
    'api_url' => 'https://api.shopadams.in/api',
    // Give up on the API after this long and serve the plain app shell.
    'timeout_seconds' => 2.5,
    // Cache each page's SEO data this long (0 = no cache).
    'cache_seconds' => 300,
];
