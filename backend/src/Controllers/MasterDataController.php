<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Helpers\Request;
use App\Helpers\Response;
use App\Middleware\JwtAuthMiddleware;
use App\Middleware\PermissionMiddleware;
use App\Services\ImageUploadService;
use PDO;
use PDOException;

/**
 * Small masters (brands, units) that don't warrant their own
 * service/controller pair the way categories/subcategories do — just
 * list + create, used to populate the product form's dropdowns.
 */
final class MasterDataController
{
    private readonly ImageUploadService $images;

    public function __construct(private readonly PDO $pdo, ?ImageUploadService $images = null)
    {
        $this->images = $images ?? new ImageUploadService();
    }

    private function isStaff(): bool
    {
        $token = Request::bearerToken();
        if ($token === null) {
            return false;
        }
        try {
            $claims = \App\Helpers\JwtHelper::verify($token);
            return isset($claims['role']) && !empty($claims['role']);
        } catch (\Throwable) {
            return false;
        }
    }

    public function indexBrands(): void
    {
        $isStaff = $this->isStaff();
        $isTopOnly = isset($_GET['is_top_brand']) && ($_GET['is_top_brand'] === '1' || $_GET['is_top_brand'] === 'true');

        $where = ["b.deleted_at IS NULL"];
        if (!$isStaff) {
            $where[] = "b.status = 'ACTIVE'";
        }
        if ($isTopOnly) {
            $where[] = "b.is_top_brand = 1";
        }
        $whereSql = implode(' AND ', $where);
        $orderSql = $isTopOnly ? "b.sort_order ASC, b.name ASC" : "b.name ASC";

        $brandSql = "SELECT b.*,
                     (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id AND p.deleted_at IS NULL) AS product_count,
                     (SELECT MIN(v.retail_price) FROM products p JOIN product_variants v ON v.product_id = p.id WHERE p.brand_id = b.id AND p.deleted_at IS NULL AND v.deleted_at IS NULL) AS min_price
                     FROM brands b WHERE {$whereSql} ORDER BY {$orderSql}";

        $brands = $this->pdo->query($brandSql)->fetchAll();

        foreach ($brands as &$brand) {
            $brand['is_top_brand'] = (int) ($brand['is_top_brand'] ?? 0);
            $catSql = $isStaff
                ? "SELECT c.id, c.name FROM brand_categories bc
                   JOIN categories c ON c.id = bc.category_id
                   WHERE bc.brand_id = :id AND c.deleted_at IS NULL"
                : "SELECT c.id, c.name FROM brand_categories bc
                   JOIN categories c ON c.id = bc.category_id
                   WHERE bc.brand_id = :id AND c.deleted_at IS NULL AND c.status = 'ACTIVE'";

            $catStmt = $this->pdo->prepare($catSql);
            $catStmt->execute(['id' => $brand['id']]);
            $categories = $catStmt->fetchAll();
            $brand['categories'] = $categories;
            $brand['category_ids'] = array_map(fn ($c) => (int) $c['id'], $categories);
        }
        unset($brand);

        Response::json(['brands' => $brands]);
    }

    public function indexTopBrands(): void
    {
        $brandSql = "SELECT b.id, b.name, b.description, b.image_path, b.is_top_brand, b.offer_text, b.sort_order,
                     (SELECT COUNT(*) FROM products p WHERE p.brand_id = b.id AND p.deleted_at IS NULL AND p.is_active = 1) AS product_count,
                     (SELECT MIN(v.retail_price) FROM products p JOIN product_variants v ON v.product_id = p.id WHERE p.brand_id = b.id AND p.deleted_at IS NULL AND p.is_active = 1 AND v.deleted_at IS NULL AND v.status = 'ACTIVE') AS min_price
                     FROM brands b
                     WHERE b.deleted_at IS NULL AND b.status = 'ACTIVE' AND b.is_top_brand = 1
                     ORDER BY b.sort_order ASC, b.name ASC
                     LIMIT 12";

        $brands = $this->pdo->query($brandSql)->fetchAll();
        foreach ($brands as &$brand) {
            $brand['is_top_brand'] = (int) ($brand['is_top_brand'] ?? 0);
        }
        unset($brand);

        Response::json(['brands' => $brands]);
    }

    public function storeBrand(): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $isMultipart = !empty($_POST) || !empty($_FILES);
        $body = $isMultipart ? $_POST : Request::json();

        $name = trim((string) ($body['name'] ?? ''));
        $description = trim((string) ($body['description'] ?? ''));
        $isTopBrand = !empty($body['is_top_brand']) && ($body['is_top_brand'] === '1' || $body['is_top_brand'] === 1 || $body['is_top_brand'] === true || $body['is_top_brand'] === 'true') ? 1 : 0;
        $offerText = trim((string) ($body['offer_text'] ?? ''));
        $sortOrder = (int) ($body['sort_order'] ?? 0);

        $rawCatIds = $body['category_ids'] ?? [];
        if (is_string($rawCatIds)) {
            $decoded = json_decode($rawCatIds, true);
            $categoryIds = is_array($decoded) ? $decoded : array_filter(array_map('intval', explode(',', $rawCatIds)));
        } else {
            $categoryIds = (array) $rawCatIds;
        }

        if ($name === '') {
            Response::error('Name is required', 422);
        }

        $imagePath = null;
        $file = $_FILES['image'] ?? $_FILES['file'] ?? null;
        if ($file !== null && is_array($file) && !empty($file['tmp_name'])) {
            try {
                $stored = $this->images->store($file, 'brands');
                $imagePath = $stored['path'];
            } catch (\Throwable $e) {
                Response::error($e->getMessage(), 422);
            }
        } elseif (!empty($body['image_path'])) {
            $imagePath = trim((string) $body['image_path']);
        }

        try {
            $this->pdo->beginTransaction();
            $stmt = $this->pdo->prepare('INSERT INTO brands (name, description, image_path, is_top_brand, offer_text, sort_order) VALUES (:name, :desc, :img, :top, :offer, :sort)');
            $stmt->execute([
                'name' => $name,
                'desc' => $description ?: null,
                'img' => $imagePath ?: null,
                'top' => $isTopBrand,
                'offer' => $offerText ?: null,
                'sort' => $sortOrder,
            ]);
            $brandId = (int) $this->pdo->lastInsertId();

            if (!empty($categoryIds)) {
                $insCat = $this->pdo->prepare('INSERT INTO brand_categories (brand_id, category_id) VALUES (:b_id, :c_id)');
                foreach ($categoryIds as $catId) {
                    $insCat->execute(['b_id' => $brandId, 'c_id' => (int) $catId]);
                }
            }

            $this->pdo->commit();
            Response::json(['id' => $brandId, 'image_path' => $imagePath, 'message' => 'Brand created successfully'], 201);
        } catch (PDOException $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            if ((int) $e->getCode() === 23000) {
                Response::error('A brand with this name already exists', 409);
            }
            throw $e;
        }
    }

    public function updateBrand(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $stmt = $this->pdo->prepare('SELECT * FROM brands WHERE id = :id AND deleted_at IS NULL');
        $stmt->execute(['id' => (int) $id]);
        $existing = $stmt->fetch();
        if (!$existing) {
            Response::error('Brand not found', 404);
        }

        $isMultipart = !empty($_POST) || !empty($_FILES);
        $body = $isMultipart ? $_POST : Request::json();

        $name = trim((string) ($body['name'] ?? $existing['name']));
        $description = trim((string) ($body['description'] ?? $existing['description'] ?? ''));
        $isTopBrand = isset($body['is_top_brand'])
            ? (!empty($body['is_top_brand']) && ($body['is_top_brand'] === '1' || $body['is_top_brand'] === 1 || $body['is_top_brand'] === true || $body['is_top_brand'] === 'true') ? 1 : 0)
            : (int) $existing['is_top_brand'];
        $offerText = isset($body['offer_text']) ? trim((string) $body['offer_text']) : (string) ($existing['offer_text'] ?? '');
        $sortOrder = isset($body['sort_order']) ? (int) $body['sort_order'] : (int) ($existing['sort_order'] ?? 0);

        $rawCatIds = $body['category_ids'] ?? null;
        if ($rawCatIds !== null) {
            if (is_string($rawCatIds)) {
                $decoded = json_decode($rawCatIds, true);
                $categoryIds = is_array($decoded) ? $decoded : array_filter(array_map('intval', explode(',', $rawCatIds)));
            } else {
                $categoryIds = (array) $rawCatIds;
            }
        } else {
            $categoryIds = null;
        }

        if ($name === '') {
            Response::error('Name is required', 422);
        }

        $imagePath = $existing['image_path'];
        $file = $_FILES['image'] ?? $_FILES['file'] ?? null;
        if ($file !== null && is_array($file) && !empty($file['tmp_name'])) {
            try {
                $stored = $this->images->store($file, 'brands');
                $imagePath = $stored['path'];
                if (!empty($existing['image_path']) && $existing['image_path'] !== $imagePath) {
                    $this->images->delete($existing['image_path']);
                }
            } catch (\Throwable $e) {
                Response::error($e->getMessage(), 422);
            }
        } elseif (!empty($body['remove_image'])) {
            if (!empty($existing['image_path'])) {
                $this->images->delete($existing['image_path']);
            }
            $imagePath = null;
        } elseif (array_key_exists('image_path', $body)) {
            $imagePath = $body['image_path'] ? trim((string) $body['image_path']) : null;
        }

        try {
            $this->pdo->beginTransaction();
            $stmt = $this->pdo->prepare('UPDATE brands SET name = :name, description = :desc, image_path = :img, is_top_brand = :top, offer_text = :offer, sort_order = :sort WHERE id = :id');
            $stmt->execute([
                'name' => $name,
                'desc' => $description ?: null,
                'img' => $imagePath ?: null,
                'top' => $isTopBrand,
                'offer' => $offerText ?: null,
                'sort' => $sortOrder,
                'id' => (int) $id,
            ]);

            // Sync brand_categories if provided
            if ($categoryIds !== null) {
                $this->pdo->prepare('DELETE FROM brand_categories WHERE brand_id = :id')->execute(['id' => (int) $id]);
                if (!empty($categoryIds)) {
                    $insCat = $this->pdo->prepare('INSERT INTO brand_categories (brand_id, category_id) VALUES (:b_id, :c_id)');
                    foreach ($categoryIds as $catId) {
                        $insCat->execute(['b_id' => (int) $id, 'c_id' => (int) $catId]);
                    }
                }
            }

            $this->pdo->commit();
            Response::json(['message' => 'Brand updated successfully', 'image_path' => $imagePath]);
        } catch (PDOException $e) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            if ((int) $e->getCode() === 23000) {
                Response::error('A brand with this name already exists', 409);
            }
            throw $e;
        }
    }

    public function uploadBrandImage(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $file = $_FILES['file'] ?? $_FILES['image'] ?? null;
        if (!isset($file) || !is_array($file) || empty($file['tmp_name'])) {
            Response::error('A file upload named "file" or "image" is required', 422);
        }

        $stmt = $this->pdo->prepare('SELECT * FROM brands WHERE id = :id AND deleted_at IS NULL');
        $stmt->execute(['id' => (int) $id]);
        $brand = $stmt->fetch();
        if (!$brand) {
            Response::error('Brand not found', 404);
        }

        try {
            $stored = $this->images->store($file, 'brands');
            $this->pdo->prepare('UPDATE brands SET image_path = :path WHERE id = :id')
                ->execute(['path' => $stored['path'], 'id' => (int) $id]);

            if (!empty($brand['image_path']) && $brand['image_path'] !== $stored['path']) {
                $this->images->delete($brand['image_path']);
            }

            Response::json(['image_path' => $stored['path']]);
        } catch (\Throwable $e) {
            Response::error($e->getMessage(), 422);
        }
    }

    public function removeBrandImage(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $stmt = $this->pdo->prepare('SELECT * FROM brands WHERE id = :id AND deleted_at IS NULL');
        $stmt->execute(['id' => (int) $id]);
        $brand = $stmt->fetch();
        if (!$brand) {
            Response::error('Brand not found', 404);
        }

        if (!empty($brand['image_path'])) {
            $this->images->delete($brand['image_path']);
        }

        $this->pdo->prepare('UPDATE brands SET image_path = NULL WHERE id = :id')->execute(['id' => (int) $id]);
        Response::json(['message' => 'Brand image removed successfully']);
    }

    public function toggleTopBrand(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $stmt = $this->pdo->prepare('SELECT id, is_top_brand FROM brands WHERE id = :id AND deleted_at IS NULL');
        $stmt->execute(['id' => (int) $id]);
        $brand = $stmt->fetch();
        if (!$brand) {
            Response::error('Brand not found', 404);
        }

        $newVal = ((int) $brand['is_top_brand'] === 1) ? 0 : 1;
        $this->pdo->prepare('UPDATE brands SET is_top_brand = :top WHERE id = :id')
            ->execute(['top' => $newVal, 'id' => (int) $id]);

        Response::json(['id' => (int) $id, 'is_top_brand' => $newVal]);
    }

    public function destroyBrand(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        $this->pdo->prepare('UPDATE brands SET deleted_at = NOW() WHERE id = :id')->execute(['id' => (int) $id]);
        Response::json(['message' => 'Brand deleted successfully']);
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

    public function updateUnit(string $id): void
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
            $stmt = $this->pdo->prepare('UPDATE units SET name = :name, short_code = :code WHERE id = :id');
            $stmt->execute(['name' => $name, 'code' => $shortCode, 'id' => (int) $id]);

            if ($stmt->rowCount() === 0) {
                Response::error('Unit not found', 404);
            }

            Response::json(['message' => 'Unit updated successfully']);
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                Response::error('A unit with this name or code already exists', 409);
            }
            throw $e;
        }
    }

    public function destroyUnit(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        try {
            $stmt = $this->pdo->prepare('DELETE FROM units WHERE id = :id');
            $stmt->execute(['id' => (int) $id]);

            if ($stmt->rowCount() === 0) {
                Response::error('Unit not found', 404);
            }

            Response::json(['message' => 'Unit deleted successfully']);
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                Response::error('Cannot delete unit because it is used by products or variants', 409);
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

    public function destroyGstRate(string $id): void
    {
        $claims = JwtAuthMiddleware::authenticate();
        PermissionMiddleware::require($claims, 'catalog.manage');

        try {
            $stmt = $this->pdo->prepare('DELETE FROM gst_rates WHERE id = :id');
            $stmt->execute(['id' => (int) $id]);

            if ($stmt->rowCount() === 0) {
                Response::error('GST rate not found', 404);
            }

            Response::json(['message' => 'GST rate deleted successfully']);
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                Response::error('Cannot delete GST rate because it is used by products or variants', 409);
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
