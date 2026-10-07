<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';
require_once dirname(__DIR__) . '/config/database.php';

use App\Controllers\AuthController;
use App\Controllers\BannerController;
use App\Controllers\CartController;
use App\Controllers\CategoryController;
use App\Controllers\CouponController;
use App\Controllers\CustomerAuthController;
use App\Controllers\DashboardController;
use App\Controllers\DeliveryController;
use App\Controllers\HomeSectionController;
use App\Controllers\HoldBillController;
use App\Controllers\InventoryController;
use App\Controllers\InvoiceController;
use App\Controllers\MasterDataController;
use App\Controllers\OrderController;
use App\Controllers\ProductController;
use App\Controllers\ProductExportController;
use App\Controllers\ProductImageController;
use App\Controllers\ProductImportController;
use App\Controllers\PurchaseController;
use App\Controllers\ReferralController;
use App\Controllers\RefundController;
use App\Controllers\ReportExportController;
use App\Controllers\SubcategoryController;
use App\Controllers\UserController;
use App\Controllers\VariantController;
use App\Controllers\VariantImageController;
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

// Customer auth & management
$customerAuth = new CustomerAuthController($pdo);
$router->post('/api/customers/otp/send', fn () => $customerAuth->sendOtp());
$router->post('/api/customers/otp/verify', fn () => $customerAuth->verifyOtp());
$router->post('/api/customers/signup', fn () => $customerAuth->signup());
$router->post('/api/customers/login', fn () => $customerAuth->login());
$router->post('/api/customers/otp/login', fn () => $customerAuth->loginWithOtp());
$router->get('/api/customers/me', fn () => $customerAuth->me());
$router->get('/api/customers', fn () => $customerAuth->indexForStaff());
$router->put('/api/customers/{id}', fn ($id) => $customerAuth->updateForStaff($id));

// Staff auth (docs/DOCUMENTATION.md section 5)
$auth = new AuthController($pdo);
$router->post('/api/auth/login', fn () => $auth->login());
$router->get('/api/auth/me', fn () => $auth->me());

// Referral settings & report (ECOMMERCE_POS_ADMIN_SPEC.md sections 3-4)
$referral = new ReferralController($pdo);
$router->get('/api/referral-settings', fn () => $referral->getSettings());
$router->put('/api/referral-settings', fn () => $referral->updateSettings());
$router->get('/api/reports/referrals', fn () => $referral->report());

// Catalog masters (docs/DOCUMENTATION.md section 7)
$categories = new CategoryController($pdo);
$router->get('/api/categories', fn () => $categories->index());
$router->post('/api/categories', fn () => $categories->store());
$router->put('/api/categories/{id}', fn ($id) => $categories->update($id));
$router->delete('/api/categories/{id}', fn ($id) => $categories->destroy($id));

$subcategories = new SubcategoryController($pdo);
$router->get('/api/subcategories', fn () => $subcategories->index());
$router->post('/api/subcategories', fn () => $subcategories->store());
$router->put('/api/subcategories/{id}', fn ($id) => $subcategories->update($id));
$router->delete('/api/subcategories/{id}', fn ($id) => $subcategories->destroy($id));

$masters = new MasterDataController($pdo);
$router->get('/api/brands', fn () => $masters->indexBrands());
$router->post('/api/brands', fn () => $masters->storeBrand());
$router->put('/api/brands/{id}', fn ($id) => $masters->updateBrand($id));
$router->delete('/api/brands/{id}', fn ($id) => $masters->destroyBrand($id));
$router->get('/api/units', fn () => $masters->indexUnits());
$router->post('/api/units', fn () => $masters->storeUnit());
$router->get('/api/gst-rates', fn () => $masters->indexGstRates());
$router->post('/api/gst-rates', fn () => $masters->storeGstRate());
$router->put('/api/gst-rates/{id}', fn ($id) => $masters->updateGstRate($id));
$router->get('/api/hsn-codes', fn () => $masters->indexHsnCodes());
$router->post('/api/hsn-codes', fn () => $masters->storeHsnCode());
$router->put('/api/hsn-codes/{id}', fn ($id) => $masters->updateHsnCode($id));
$router->delete('/api/hsn-codes/{id}', fn ($id) => $masters->destroyHsnCode($id));
$router->get('/api/payment-methods', fn () => $masters->indexPaymentMethods());
$router->post('/api/payment-methods', fn () => $masters->storePaymentMethod());
$router->put('/api/payment-methods/{id}', fn ($id) => $masters->updatePaymentMethod($id));

// Returns (Sale Returns & Purchase Returns)
$returns = new \App\Controllers\ReturnsController($pdo);
$router->get('/api/returns/sales', fn () => $returns->indexSaleReturns());
$router->post('/api/returns/sales', fn () => $returns->storeSaleReturn());
$router->get('/api/returns/purchases', fn () => $returns->indexPurchaseReturns());
$router->post('/api/returns/purchases', fn () => $returns->storePurchaseReturn());

// Finance Management (Expense & Income)
$finance = new \App\Controllers\FinanceController($pdo);
$router->get('/api/finance', fn () => $finance->index());
$router->post('/api/finance', fn () => $finance->store());
$router->delete('/api/finance/{id}', fn ($id) => $finance->destroy($id));

// Products & variants (ECOMMERCE_POS_ADMIN_SPEC.md sections 5-7)
$products = new ProductController($pdo);
$router->get('/api/products', fn () => $products->index());
$router->post('/api/products', fn () => $products->store());

// Excel import/export (sections 11-13, 39-40) — registered before the
// /api/products/{id} GET route below, since "export" would otherwise
// bind to {id} (the router matches by registration order).
$productImport = new ProductImportController($pdo);
$router->get('/api/products/import/template', fn () => $productImport->template());
$router->post('/api/products/import/preview', fn () => $productImport->preview());
$router->post('/api/products/import', fn () => $productImport->commit());
$router->post('/api/products/import/error-report', fn () => $productImport->errorReport());

$productExport = new ProductExportController($pdo);
$router->get('/api/products/export/stock-report', fn () => $productExport->exportStockReport());
$router->get('/api/products/export', fn () => $productExport->export());

$router->get('/api/products/{id}', fn ($id) => $products->show($id));
$router->put('/api/products/{id}', fn ($id) => $products->update($id));
$router->delete('/api/products/{id}', fn ($id) => $products->destroy($id));
$router->put('/api/products/{id}/specifications', fn ($id) => $products->updateSpecifications($id));

// Product images (sections 8-10, 37-38) — real file upload, WebP
// compression, primary/reorder/delete. Registered before the generic
// /api/products/{id} routes above don't matter here (different method/
// suffix), but kept grouped with products for readability.
$productImages = new ProductImageController($pdo);
$router->post('/api/products/{id}/images', fn ($id) => $productImages->store($id));
$router->patch('/api/products/{id}/images/{imageId}/primary', fn ($id, $imageId) => $productImages->setPrimary($id, $imageId));
$router->put('/api/products/{id}/images/reorder', fn ($id) => $productImages->reorder($id));
$router->delete('/api/products/{id}/images/{imageId}', fn ($id, $imageId) => $productImages->destroy($id, $imageId));

$variants = new VariantController($pdo);
$router->get('/api/variant-attributes', fn () => $variants->indexAttributes());
$router->post('/api/variant-attributes', fn () => $variants->storeAttribute());
$router->post('/api/variant-attributes/{id}/values', fn ($id) => $variants->storeAttributeValue($id));
$router->post('/api/products/{id}/variants', fn ($id) => $variants->store($id));
$router->post('/api/products/{id}/variants/generate', fn ($id) => $variants->generateCombinations($id));
$router->put('/api/variants/{id}', fn ($id) => $variants->update($id));
$router->get('/api/variants/lookup', fn () => $variants->lookup());

// Variant images — each variant's own gallery, never mixed with another
// variant's (section 14-19 of the spec).
$variantImages = new VariantImageController($pdo);
$router->post('/api/variants/{id}/images', fn ($id) => $variantImages->store($id));
$router->patch('/api/variants/{id}/images/{imageId}/primary', fn ($id, $imageId) => $variantImages->setPrimary($id, $imageId));
$router->put('/api/variants/{id}/images/reorder', fn ($id) => $variantImages->reorder($id));
$router->delete('/api/variants/{id}/images/{imageId}', fn ($id, $imageId) => $variantImages->destroy($id, $imageId));

// Inventory (docs/DOCUMENTATION.md section 11)
$inventory = new InventoryController($pdo);
$router->get('/api/inventory', fn () => $inventory->index());
$router->get('/api/pos/products', fn () => $inventory->posIndex());
$router->get('/api/inventory/low-stock', fn () => $inventory->lowStock());
$router->get('/api/inventory/adjustments', fn () => $inventory->indexAdjustments());
$router->post('/api/inventory/adjustments', fn () => $inventory->storeAdjustment());
$router->post('/api/inventory/opening-stock', fn () => $inventory->saveOpeningStock());
$router->put('/api/inventory/{variantId}/threshold', fn ($variantId) => $inventory->setLowStockThreshold($variantId));
$router->get('/api/inventory/{variantId}', fn ($variantId) => $inventory->show($variantId));

// Coupons (ECOMMERCE_POS_ADMIN_SPEC.md sections 14-17)
$coupons = new CouponController($pdo);
$router->get('/api/coupons', fn () => $coupons->index());
$router->get('/api/coupons/available', fn () => $coupons->availableForCustomer());
$router->get('/api/coupons/{id}', fn ($id) => $coupons->show($id));
$router->post('/api/coupons', fn () => $coupons->store());
$router->put('/api/coupons/{id}', fn ($id) => $coupons->update($id));

// Cart (docs/DOCUMENTATION.md section 13)
$cart = new CartController($pdo);
$router->get('/api/cart', fn () => $cart->show());
$router->post('/api/cart/items', fn () => $cart->store());
$router->patch('/api/cart/items/{id}', fn ($id) => $cart->update($id));
$router->delete('/api/cart/items/{id}', fn ($id) => $cart->destroy($id));

// Orders & checkout (docs section 13/20; ECOMMERCE_POS_ADMIN_SPEC.md 18-20, 36-38)
$orders = new OrderController($pdo);
$router->post('/api/orders/preview', fn () => $orders->preview());
$router->post('/api/orders/checkout', fn () => $orders->checkout());
$router->get('/api/orders', fn () => $orders->index());
$router->get('/api/customers/orders', fn () => $orders->myOrders());
$router->get('/api/orders/{id}', fn ($id) => $orders->show($id));
$router->post('/api/orders/{id}/confirm-payment', fn ($id) => $orders->confirmPayment($id));
$router->post('/api/orders/{id}/cancel', fn ($id) => $orders->cancel($id));
$router->patch('/api/orders/{id}/status', fn ($id) => $orders->updateStatus($id));

$router->get('/api/products/price-settings', fn () => $products->getPriceSettings());
$router->put('/api/products/price-settings', fn () => $products->updatePriceSettings());

// Invoices (docs/DOCUMENTATION.md section 16) — POS billing + e-commerce
// invoices (the latter auto-created by OrderService::confirmPayment)
$invoices = new InvoiceController($pdo);
$router->get('/api/invoices', fn () => $invoices->index());
$router->get('/api/invoices/{id}', fn ($id) => $invoices->show($id));
$router->post('/api/invoices/pos-sale', fn () => $invoices->storePosSale());
$router->put('/api/invoices/{id}', fn ($id) => $invoices->update($id));
$router->post('/api/invoices/{id}/cancel', fn ($id) => $invoices->cancel($id));
$router->delete('/api/invoices/{id}', fn ($id) => $invoices->destroy($id));

// Hold Bills (POS sale pause/resume)
$holdBills = new HoldBillController($pdo);
$router->get('/api/hold-bills', fn () => $holdBills->index());
$router->post('/api/hold-bills', fn () => $holdBills->store());
$router->delete('/api/hold-bills/{id}', fn ($id) => $holdBills->destroy($id));

// Suppliers & purchases / GRN (docs/DOCUMENTATION.md section 11)
$purchases = new PurchaseController($pdo);
$router->get('/api/suppliers', fn () => $purchases->indexSuppliers());
$router->post('/api/suppliers', fn () => $purchases->storeSupplier());
$router->get('/api/purchases', fn () => $purchases->index());
$router->get('/api/purchases/{id}', fn ($id) => $purchases->show($id));
$router->post('/api/purchases', fn () => $purchases->store());
$router->post('/api/purchases/{id}/cancel', fn ($id) => $purchases->cancel($id));
$router->post('/api/purchases/{id}/returns', fn ($id) => $purchases->storeReturn($id));

// Delivery (ECOMMERCE_POS_ADMIN_SPEC.md sections 21-22)
$delivery = new DeliveryController($pdo);
$router->get('/api/deliveries', fn () => $delivery->index());
$router->get('/api/deliveries/{id}', fn ($id) => $delivery->show($id));
$router->get('/api/orders/{orderId}/delivery', fn ($orderId) => $delivery->showForOrder($orderId));
$router->post('/api/orders/{orderId}/delivery', fn ($orderId) => $delivery->store($orderId));
$router->patch('/api/deliveries/{id}/status', fn ($id) => $delivery->updateStatus($id));
$router->post('/api/shipping/webhook', fn () => $delivery->webhook());

// Refunds (ECOMMERCE_POS_ADMIN_SPEC.md section 23)
$refunds = new RefundController($pdo);
$router->get('/api/refunds', fn () => $refunds->index());
$router->get('/api/refunds/{id}', fn ($id) => $refunds->show($id));
$router->post('/api/refunds/{id}/process', fn ($id) => $refunds->process($id));
$router->post('/api/refunds/{id}/cancel', fn ($id) => $refunds->cancel($id));
$router->get('/api/reports/refunds', fn () => $refunds->summary());

// Banners + home sections (docs/DOCUMENTATION.md section 10)
$banners = new BannerController($pdo);
$router->get('/api/banners', fn () => $banners->index());
$router->post('/api/banners', fn () => $banners->store());
$router->put('/api/banners/reorder', fn () => $banners->reorder());
$router->get('/api/banners/{id}', fn ($id) => $banners->show($id));
$router->put('/api/banners/{id}', fn ($id) => $banners->update($id));
$router->delete('/api/banners/{id}', fn ($id) => $banners->destroy($id));
$router->post('/api/banners/{id}/image/desktop', fn ($id) => $banners->uploadDesktopImage($id));
$router->post('/api/banners/{id}/image/mobile', fn ($id) => $banners->uploadMobileImage($id));
$router->post('/api/banners/{id}/items', fn ($id) => $banners->addItem($id));
$router->delete('/api/banners/{id}/items/{itemId}', fn ($id, $itemId) => $banners->removeItem($id, $itemId));

$homeSections = new HomeSectionController($pdo);
$router->get('/api/home-sections', fn () => $homeSections->index());
$router->post('/api/home-sections', fn () => $homeSections->store());
$router->put('/api/home-sections/reorder', fn () => $homeSections->reorder());
$router->put('/api/home-sections/{id}', fn ($id) => $homeSections->update($id));
$router->post('/api/home-sections/{id}/image', fn ($id) => $homeSections->uploadImage($id));
$router->delete('/api/home-sections/{id}', fn ($id) => $homeSections->destroy($id));

// Admin dashboard (ECOMMERCE_POS_ADMIN_SPEC.md section 24; docs section 6)
$dashboard = new DashboardController($pdo);
$router->get('/api/dashboard/summary', fn () => $dashboard->summary());
$router->get('/api/dashboard/sales-chart', fn () => $dashboard->salesChart());
$router->get('/api/dashboard/product-analytics', fn () => $dashboard->productAnalytics());
$router->get('/api/dashboard/customer-analytics', fn () => $dashboard->customerAnalytics());
$router->get('/api/dashboard/recent-activity', fn () => $dashboard->recentActivity());

$reportExport = new ReportExportController($pdo);
$router->get('/api/reports/export/excel', fn () => $reportExport->exportExcel());

// Staff user management (docs/DOCUMENTATION.md section 3)
$users = new UserController($pdo);
$router->get('/api/users', fn () => $users->index());
$router->get('/api/roles', fn () => $users->indexRoles());
$router->post('/api/users', fn () => $users->store());
$router->put('/api/users/{id}', fn ($id) => $users->update($id));

try {
    $router->dispatch($_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI'] ?? '/');
} catch (\Throwable $e) {
    $debug = (bool) Config::get('app.debug', false);
    error_log($e->getMessage() . "\n" . $e->getTraceAsString());
    Response::error($debug ? $e->getMessage() : 'Internal server error', 500);
}
