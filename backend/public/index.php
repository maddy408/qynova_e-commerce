<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';
require_once dirname(__DIR__) . '/config/database.php';

use App\Controllers\AuthController;
use App\Controllers\CustomerAuthController;
use App\Controllers\InventoryController;
use App\Controllers\ProductController;
use App\Controllers\ReferralController;
use App\Controllers\VariantController;
use App\Helpers\Config;
use App\Helpers\Response;
use App\Helpers\Router;
use App\Middleware\CorsMiddleware;

CorsMiddleware::handle((array) Config::get('cors.allowed_origins', []));

$router = new Router();
$pdo = db();

$router->get('/api/health', function (): void {
    Response::json(['status' => 'ok', 'time' => date('c')]);
});

// Customer auth (ECOMMERCE_POS_ADMIN_SPEC.md section 2)
$customerAuth = new CustomerAuthController($pdo);
$router->post('/api/customers/otp/send', fn () => $customerAuth->sendOtp());
$router->post('/api/customers/otp/verify', fn () => $customerAuth->verifyOtp());
$router->post('/api/customers/signup', fn () => $customerAuth->signup());
$router->post('/api/customers/login', fn () => $customerAuth->login());
$router->post('/api/customers/otp/login', fn () => $customerAuth->loginWithOtp());
$router->get('/api/customers/me', fn () => $customerAuth->me());

// Staff auth (docs/DOCUMENTATION.md section 5)
$auth = new AuthController($pdo);
$router->post('/api/auth/login', fn () => $auth->login());
$router->get('/api/auth/me', fn () => $auth->me());

// Referral settings & report (ECOMMERCE_POS_ADMIN_SPEC.md sections 3-4)
$referral = new ReferralController($pdo);
$router->get('/api/referral-settings', fn () => $referral->getSettings());
$router->put('/api/referral-settings', fn () => $referral->updateSettings());
$router->get('/api/reports/referrals', fn () => $referral->report());

// Products & variants (ECOMMERCE_POS_ADMIN_SPEC.md sections 5-7)
$products = new ProductController($pdo);
$router->get('/api/products', fn () => $products->index());
$router->get('/api/products/{id}', fn ($id) => $products->show($id));
$router->post('/api/products', fn () => $products->store());
$router->put('/api/products/{id}', fn ($id) => $products->update($id));
$router->delete('/api/products/{id}', fn ($id) => $products->destroy($id));

$variants = new VariantController($pdo);
$router->get('/api/variant-attributes', fn () => $variants->indexAttributes());
$router->post('/api/variant-attributes', fn () => $variants->storeAttribute());
$router->post('/api/variant-attributes/{id}/values', fn ($id) => $variants->storeAttributeValue($id));
$router->post('/api/products/{id}/variants', fn ($id) => $variants->store($id));
$router->put('/api/variants/{id}', fn ($id) => $variants->update($id));
$router->get('/api/variants/lookup', fn () => $variants->lookup());

// Inventory (docs/DOCUMENTATION.md section 11)
$inventory = new InventoryController($pdo);
$router->get('/api/inventory/low-stock', fn () => $inventory->lowStock());
$router->get('/api/inventory/{variantId}', fn ($variantId) => $inventory->show($variantId));
$router->post('/api/inventory/adjustments', fn () => $inventory->storeAdjustment());

try {
    $router->dispatch($_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI'] ?? '/');
} catch (\Throwable $e) {
    $debug = (bool) Config::get('app.debug', false);
    error_log($e->getMessage() . "\n" . $e->getTraceAsString());
    Response::error($debug ? $e->getMessage() : 'Internal server error', 500);
}
