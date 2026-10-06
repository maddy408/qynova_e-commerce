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

    /** `?all=1` (the Tax admin page) also returns INACTIVE rates so they can be reactivated; everyone else only wants ACTIVE ones for a dropdown. */
    public function indexGstRates(): void
    {
        $where = isset($_GET['all']) ? '1=1' : "status = 'ACTIVE'";
        Response::json(['gst_rates' => $this->pdo->query(
            "SELECT * FROM gst_rates WHERE {$where} ORDER BY gst_percent"
        )->fetchAll()]);
    }

    public function storeGstRate(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $body = Request::json();
        $name = trim((string) ($body['name'] ?? ''));
        $percent = $body['gst_percent'] ?? null;

        if ($name === '' || !is_numeric($percent)) {
            Response::error('name and a numeric gst_percent are required', 422);
        }

        $taxMode = ($body['tax_mode'] ?? 'EXCLUSIVE') === 'INCLUSIVE' ? 'INCLUSIVE' : 'EXCLUSIVE';
        // Same half/half/full split ProductImportService uses when it
        // auto-creates a GST rate during Excel import — intrastate sales
        // split the rate evenly across CGST+SGST, interstate charges the
        // full rate as IGST. Caller can still override any of the three.
        $half = (string) ((float) $percent / 2);

        try {
            $this->pdo->prepare(
                'INSERT INTO gst_rates (name, gst_percent, cgst_percent, sgst_percent, igst_percent, tax_mode, status)
                 VALUES (:name, :percent, :cgst, :sgst, :igst, :mode, :status)'
            )->execute([
                'name' => $name,
                'percent' => $percent,
                'cgst' => $body['cgst_percent'] ?? $half,
                'sgst' => $body['sgst_percent'] ?? $half,
                'igst' => $body['igst_percent'] ?? $percent,
                'mode' => $taxMode,
                'status' => ($body['status'] ?? 'ACTIVE') === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
            ]);
            Response::json(['id' => (int) $this->pdo->lastInsertId()], 201);
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                Response::error('A GST rate with this name already exists', 409);
            }
            throw $e;
        }
    }

    public function updateGstRate(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $body = Request::json();
        $fields = ['name', 'gst_percent', 'cgst_percent', 'sgst_percent', 'igst_percent', 'tax_mode', 'status'];
        $sets = [];
        $params = ['id' => $id];

        foreach ($fields as $field) {
            if (array_key_exists($field, $body)) {
                $sets[] = "{$field} = :{$field}";
                $params[$field] = $body[$field];
            }
        }

        if ($sets === []) {
            Response::json(['updated' => true]);
        }

        try {
            $stmt = $this->pdo->prepare('UPDATE gst_rates SET ' . implode(', ', $sets) . ' WHERE id = :id');
            $stmt->execute($params);

            if ($stmt->rowCount() === 0) {
                Response::error('GST rate not found', 404);
            }

            Response::json(['updated' => true]);
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                Response::error('A GST rate with this name already exists', 409);
            }
            throw $e;
        }
    }

    public function indexHsnCodes(): void
    {
        Response::json(['hsn_codes' => $this->pdo->query('SELECT * FROM hsn_codes ORDER BY code')->fetchAll()]);
    }

    /** `?all=1` also returns INACTIVE methods for the Payment Methods admin page; everyone else only wants ACTIVE ones for a dropdown. */
    public function indexPaymentMethods(): void
    {
        $where = isset($_GET['all']) ? '1=1' : 'is_active = 1';
        Response::json(['payment_methods' => $this->pdo->query(
            "SELECT * FROM payment_methods WHERE {$where} ORDER BY sort_order, name"
        )->fetchAll()]);
    }

    public function storePaymentMethod(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'payment_methods.manage');

        $body = Request::json();
        $code = mb_strtoupper(trim((string) ($body['code'] ?? '')));
        $name = trim((string) ($body['name'] ?? ''));

        if ($code === '' || $name === '') {
            Response::error('code and name are required', 422);
        }

        try {
            $this->pdo->prepare(
                'INSERT INTO payment_methods (code, name, sort_order, is_active) VALUES (:code, :name, :sort_order, :is_active)'
            )->execute([
                'code' => $code,
                'name' => $name,
                'sort_order' => (int) ($body['sort_order'] ?? 0),
                'is_active' => (int) (bool) ($body['is_active'] ?? true),
            ]);
            Response::json(['id' => (int) $this->pdo->lastInsertId()], 201);
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                Response::error('A payment method with this code already exists', 409);
            }
            throw $e;
        }
    }

    public function updatePaymentMethod(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'payment_methods.manage');

        $body = Request::json();
        $fields = ['name', 'sort_order', 'is_active'];
        $sets = [];
        $params = ['id' => $id];

        foreach ($fields as $field) {
            if (array_key_exists($field, $body)) {
                $sets[] = "{$field} = :{$field}";
                $params[$field] = $field === 'is_active' ? (int) (bool) $body[$field] : $body[$field];
            }
        }

        if ($sets === []) {
            Response::json(['updated' => true]);
        }

        $stmt = $this->pdo->prepare('UPDATE payment_methods SET ' . implode(', ', $sets) . ' WHERE id = :id');
        $stmt->execute($params);

        if ($stmt->rowCount() === 0) {
            Response::error('Payment method not found', 404);
        }

        Response::json(['updated' => true]);
    }

    public function storeHsnCode(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $body = Request::json();
        $code = trim((string) ($body['code'] ?? ''));

        if ($code === '') {
            Response::error('code is required', 422);
        }

        try {
            $this->pdo->prepare('INSERT INTO hsn_codes (code, description) VALUES (:code, :description)')
                ->execute(['code' => $code, 'description' => $body['description'] ?? null]);
            Response::json(['id' => (int) $this->pdo->lastInsertId()], 201);
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                Response::error('This HSN code already exists', 409);
            }
            throw $e;
        }
    }

    public function updateHsnCode(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $body = Request::json();
        $fields = ['code', 'description'];
        $sets = [];
        $params = ['id' => $id];

        foreach ($fields as $field) {
            if (array_key_exists($field, $body)) {
                $sets[] = "{$field} = :{$field}";
                $params[$field] = $body[$field];
            }
        }

        if ($sets === []) {
            Response::json(['updated' => true]);
        }

        try {
            $stmt = $this->pdo->prepare('UPDATE hsn_codes SET ' . implode(', ', $sets) . ' WHERE id = :id');
            $stmt->execute($params);

            if ($stmt->rowCount() === 0) {
                Response::error('HSN code not found', 404);
            }

            Response::json(['updated' => true]);
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                Response::error('This HSN code already exists', 409);
            }
            throw $e;
        }
    }

    public function destroyHsnCode(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $stmt = $this->pdo->prepare('DELETE FROM hsn_codes WHERE id = :id');
        $stmt->execute(['id' => $id]);

        if ($stmt->rowCount() === 0) {
            Response::error('HSN code not found', 404);
        }

        Response::json(['deleted' => true]);
    }
}
