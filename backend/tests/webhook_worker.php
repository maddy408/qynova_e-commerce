<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';
putenv('APP_ENV=testing');
$_ENV['APP_ENV'] = 'testing';

// Arguments:
// argv[1]: Header name (e.g., HTTP_X_WEBHOOK_SECRET, HTTP_AUTHORIZATION, or NONE)
// argv[2]: Header value
// argv[3]: Server secret override (e.g., "UNSET", "custom_secret", or omit to use .env)
$headerName = $argv[1] ?? 'NONE';
$headerValue = $argv[2] ?? '';
$envSecret = $argv[3] ?? null;

if ($envSecret !== null) {
    if ($envSecret === 'UNSET') {
        putenv('SHIPPING_WEBHOOK_SECRET=');
        $_ENV['SHIPPING_WEBHOOK_SECRET'] = '';
    } else {
        putenv("SHIPPING_WEBHOOK_SECRET={$envSecret}");
        $_ENV['SHIPPING_WEBHOOK_SECRET'] = $envSecret;
    }
}

if ($headerName !== 'NONE' && $headerValue !== '') {
    $_SERVER[$headerName] = $headerValue;
}

require dirname(__DIR__) . '/config/database.php';

$pdo = db();
$controller = new \App\Controllers\DeliveryController($pdo);

register_shutdown_function(function () {
    $code = http_response_code();
    fwrite(STDERR, "HTTP_CODE:{$code}\n");
});

$controller->webhook();
