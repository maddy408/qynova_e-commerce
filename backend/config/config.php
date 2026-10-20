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
        'access_ttl' => (int) ($_ENV['JWT_ACCESS_TTL'] ?? 31536000),
        'refresh_ttl' => (int) ($_ENV['JWT_REFRESH_TTL'] ?? 31536000),
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
        'webhook_secret' => $_ENV['SHIPPING_WEBHOOK_SECRET'] ?? '',
    ],
    'fcm' => [
        'enabled' => ($_ENV['FCM_ENABLED'] ?? 'false') === 'true',
        'project_id' => $_ENV['FIREBASE_PROJECT_ID'] ?? '',
        'service_account_path' => $_ENV['FIREBASE_SERVICE_ACCOUNT_PATH'] ?? '',
    ],
    'redis' => [
        'enabled' => filter_var($_ENV['REDIS_ENABLED'] ?? false, FILTER_VALIDATE_BOOLEAN),
        'host' => $_ENV['REDIS_HOST'] ?? '127.0.0.1',
        'port' => (int) ($_ENV['REDIS_PORT'] ?? 6379),
        'password' => !empty($_ENV['REDIS_PASSWORD']) ? $_ENV['REDIS_PASSWORD'] : null,
        'queue_name' => $_ENV['REDIS_QUEUE_NAME'] ?? 'adams:push_queue',
        'timeout' => (float) ($_ENV['REDIS_TIMEOUT'] ?? 1.5),
    ],
    'image' => [
        'main_target_kb' => (int) ($_ENV['IMAGE_MAIN_TARGET_KB'] ?? 100),
        'thumb_target_kb' => (int) ($_ENV['IMAGE_THUMB_TARGET_KB'] ?? 30),
    ],
    'r2' => [
        'enabled' => filter_var($_ENV['R2_ENABLED'] ?? false, FILTER_VALIDATE_BOOLEAN),
        'account_id' => $_ENV['R2_ACCOUNT_ID'] ?? '',
        'access_key_id' => $_ENV['R2_ACCESS_KEY_ID'] ?? '',
        'secret_access_key' => $_ENV['R2_SECRET_ACCESS_KEY'] ?? '',
        'bucket' => $_ENV['R2_BUCKET'] ?? '',
        // public base URL for the bucket: https://pub-xxxx.r2.dev or a custom domain
        'public_url' => $_ENV['R2_PUBLIC_URL'] ?? '',
        // optional override; defaults to https://<account_id>.r2.cloudflarestorage.com
        'endpoint' => $_ENV['R2_ENDPOINT'] ?? '',
    ],
];
