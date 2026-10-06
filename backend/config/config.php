<?php

declare(strict_types=1);

use Dotenv\Dotenv;

Dotenv::createImmutable(dirname(__DIR__))->safeLoad();

date_default_timezone_set($_ENV['TIMEZONE'] ?? 'Asia/Kolkata');

return [
    'app' => [
        'env' => $_ENV['APP_ENV'] ?? 'local',
        'debug' => ($_ENV['APP_DEBUG'] ?? 'false') === 'true',
    ],
    'cors' => [
        'allowed_origins' => array_filter(array_map(
            'trim',
            explode(',', $_ENV['CORS_ALLOWED_ORIGINS'] ?? '')
        )),
    ],
    'jwt' => [
        'secret' => $_ENV['JWT_SECRET'] ?? '',
        'access_ttl' => (int) ($_ENV['JWT_ACCESS_TTL'] ?? 900),
        'refresh_ttl' => (int) ($_ENV['JWT_REFRESH_TTL'] ?? 1209600),
    ],
    'google' => [
        'client_id' => $_ENV['GOOGLE_CLIENT_ID'] ?? '',
        'client_secret' => $_ENV['GOOGLE_CLIENT_SECRET'] ?? '',
    ],
    'razorpay' => [
        'key_id' => $_ENV['RAZORPAY_KEY_ID'] ?? '',
        'key_secret' => $_ENV['RAZORPAY_KEY_SECRET'] ?? '',
        'webhook_secret' => $_ENV['RAZORPAY_WEBHOOK_SECRET'] ?? '',
    ],
    'shipping' => [
        'provider' => $_ENV['SHIPPING_PROVIDER'] ?? 'mock',
    ],
    'fcm' => [
        'enabled' => ($_ENV['FCM_ENABLED'] ?? 'false') === 'true',
        'project_id' => $_ENV['FIREBASE_PROJECT_ID'] ?? '',
        'service_account_path' => $_ENV['FIREBASE_SERVICE_ACCOUNT_PATH'] ?? '',
    ],
    'image' => [
        'main_target_kb' => (int) ($_ENV['IMAGE_MAIN_TARGET_KB'] ?? 100),
        'thumb_target_kb' => (int) ($_ENV['IMAGE_THUMB_TARGET_KB'] ?? 30),
    ],
];
