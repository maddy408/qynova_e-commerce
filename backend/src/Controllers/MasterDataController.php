<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use PDO;
use PDOException;

/**
 * Small masters (brands, units) that don't warrant their own
 * service/controller pair the way categories/subcategories do — just
 * list + create, used to populate the product form's dropdowns.
 */
final class MasterDataController
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function indexBrands(): void
    {
        Response::json(['brands' => $this->pdo->query(
            "SELECT * FROM brands WHERE deleted_at IS NULL ORDER BY name"
        )->fetchAll()]);
    }

    public function storeBrand(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $name = trim((string) (Request::json()['name'] ?? ''));
        if ($name === '') {
            Response::error('Name is required', 422);
        }

        try {
            $this->pdo->prepare('INSERT INTO brands (name) VALUES (:name)')->execute(['name' => $name]);
            Response::json(['id' => (int) $this->pdo->lastInsertId()], 201);
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                Response::error('A brand with this name already exists', 409);
            }
            throw $e;
        }
    }

    public function indexUnits(): void
    {
        Response::json(['units' => $this->pdo->query(
            "SELECT * FROM units WHERE status = 'ACTIVE' ORDER BY name"
        )->fetchAll()]);
    }

    public function storeUnit(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $body = Request::json();
        $name = trim((string) ($body['name'] ?? ''));
        $shortCode = trim((string) ($body['short_code'] ?? ''));

        if ($name === '' || $shortCode === '') {
            Response::error('name and short_code are required', 422);
        }

        try {
            $this->pdo->prepare('INSERT INTO units (name, short_code) VALUES (:name, :code)')
                ->execute(['name' => $name, 'code' => $shortCode]);
            Response::json(['id' => (int) $this->pdo->lastInsertId()], 201);
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                Response::error('A unit with this name or code already exists', 409);
            }
            throw $e;
        }
    }

    public function indexGstRates(): void
    {
        Response::json(['gst_rates' => $this->pdo->query(
            "SELECT * FROM gst_rates WHERE status = 'ACTIVE' ORDER BY gst_percent"
        )->fetchAll()]);
    }

    public function indexHsnCodes(): void
    {
        Response::json(['hsn_codes' => $this->pdo->query('SELECT * FROM hsn_codes ORDER BY code')->fetchAll()]);
    }
}
