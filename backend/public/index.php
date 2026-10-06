<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use App\Helpers\Response;
use App\Helpers\Router;
use App\Middleware\CorsMiddleware;

$config = require dirname(__DIR__) . '/config/config.php';

CorsMiddleware::handle($config['cors']['allowed_origins']);

$router = new Router();

$router->get('/api/health', function (): void {
    Response::json(['status' => 'ok', 'time' => date('c')]);
});

$router->dispatch($_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI'] ?? '/');
