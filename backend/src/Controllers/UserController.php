<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\UserService;
use PDO;
use RuntimeException;

final class UserController
{
    private readonly UserService $users;

    public function __construct(private readonly PDO $pdo)
    {
        $this->users = new UserService($pdo);
    }

    public function index(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'users.manage');

        Response::json(['users' => $this->users->list()]);
    }

    public function indexRoles(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'users.manage');

        Response::json(['roles' => $this->users->listRoles()]);
    }

    public function store(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'users.manage');

        try {
            $id = $this->users->create(Request::json());
            Response::json(['id' => $id], 201);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function update(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'users.manage');

        try {
            $this->users->update((int) $id, Request::json());
            Response::json(['updated' => true]);
        } catch (RuntimeException $e) {
            Response::error($e->getMessage(), 422);
        }
    }
}
