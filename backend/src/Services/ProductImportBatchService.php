<?php

declare(strict_types=1);

namespace App\Services;

use PDO;
use RuntimeException;

/**
 * Product import history ("recent ZIP uploads"): list past imports, rename
 * them / add a note, view the images each one added, replace or remove a
 * single image, replace the whole ZIP, or delete all images an import added.
 *
 * Deleting an import only removes the IMAGES it added (from storage/R2 and
 * from the products). Products and variants themselves are never touched.
 */
final class ProductImportBatchService
{
    private const TYPES = ['product' => 'product_images', 'variant' => 'variant_images'];

    public function __construct(
        private readonly PDO $pdo,
        private readonly ImageUploadService $uploader = new ImageUploadService(),
    ) {
    }

    /** @return list<array<string, mixed>> */
    public function list(int $limit = 50): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT b.*, u.name AS created_by_name,
                    (SELECT COUNT(*) FROM product_images pi WHERE pi.import_batch_id = b.id)
                  + (SELECT COUNT(*) FROM variant_images vi WHERE vi.import_batch_id = b.id) AS image_count,
                    (SELECT COALESCE(pi.thumb_path, pi.image_path) FROM product_images pi
                      WHERE pi.import_batch_id = b.id ORDER BY pi.id LIMIT 1) AS preview_image
               FROM product_import_batches b
               LEFT JOIN users u ON u.id = b.created_by
              ORDER BY b.created_at DESC, b.id DESC
              LIMIT ' . max(1, min(200, $limit))
        );
        $stmt->execute();

        return array_map(fn (array $r) => $this->castBatch($r), $stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    /** @return array<string, mixed> batch + its images */
    public function get(int $id): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT b.*, u.name AS created_by_name FROM product_import_batches b
               LEFT JOIN users u ON u.id = b.created_by WHERE b.id = :id'
        );
        $stmt->execute(['id' => $id]);
        $batch = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($batch === false) {
            throw new RuntimeException('Import not found');
        }

        $batch = $this->castBatch($batch);
        $batch['images'] = $this->images($id);
        $batch['image_count'] = count($batch['images']);

        return $batch;
    }

    public function update(int $id, ?string $name, ?string $note): void
    {
        $this->assertExists($id);

        $sets = [];
        $params = ['id' => $id];
        if ($name !== null) {
            $name = trim($name);
            if ($name === '') {
                throw new RuntimeException('Name cannot be empty');
            }
            $sets[] = 'name = :name';
            $params['name'] = mb_substr($name, 0, 190);
        }
        if ($note !== null) {
            $sets[] = 'note = :note';
            $params['note'] = trim($note) === '' ? null : trim($note);
        }
        if ($sets !== []) {
            $this->pdo->prepare('UPDATE product_import_batches SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
        }
    }

    /**
     * Deletes every image this import added (DB rows + files in R2/disk)
     * and removes the import from the history. Products stay.
     *
     * @return array{deleted_images: int}
     */
    public function delete(int $id): array
    {
        $this->assertExists($id);
        $images = $this->images($id);

        $this->pdo->beginTransaction();
        try {
            foreach ($images as $img) {
                $this->pdo->prepare('DELETE FROM ' . self::TYPES[$img['type']] . ' WHERE id = :id')->execute(['id' => $img['id']]);
            }
            foreach ($images as $img) {
                $this->ensurePrimary($img['type'], $img['owner_id']);
            }
            $this->pdo->prepare('DELETE FROM product_import_batches WHERE id = :id')->execute(['id' => $id]);
            $this->pdo->commit();
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }

        $this->deleteFilesIfUnused(array_merge(array_column($images, 'image_path'), array_column($images, 'thumb_path')));

        return ['deleted_images' => count($images)];
    }

    /**
     * Replace the import's images with the files from a new ZIP, matched by
     * the original filename used in the Excel. Files not in the new ZIP keep
     * their current image.
     *
     * @return array{replaced: list<string>, not_in_zip: list<string>}
     */
    public function replaceZip(int $id, string $imagesDir, ?string $zipName, ?int $zipSize): array
    {
        $this->assertExists($id);
        $images = $this->images($id);

        $byFilename = [];
        foreach ($images as $img) {
            $byFilename[(string) $img['source_filename']][] = $img;
        }

        $replaced = [];
        $notInZip = [];
        $oldPaths = [];
        $newPaths = [];

        try {
            foreach ($byFilename as $filename => $rows) {
                $local = $filename === '' ? null : SafeZipExtractor::findInDir($imagesDir, $filename);
                if ($local === null) {
                    $notInZip[] = $filename;
                    continue;
                }

                $stored = $this->uploader->store(
                    ['tmp_name' => $local, 'size' => (int) filesize($local), 'error' => UPLOAD_ERR_OK, 'name' => basename($local)],
                    'products',
                );
                $newPaths[] = $stored['path'];
                $newPaths[] = $stored['thumb_path'];

                foreach ($rows as $img) {
                    $this->pdo->prepare('UPDATE ' . self::TYPES[$img['type']] . ' SET image_path = :p, thumb_path = :t WHERE id = :id')
                        ->execute(['p' => $stored['path'], 't' => $stored['thumb_path'], 'id' => $img['id']]);
                    $oldPaths[] = $img['image_path'];
                    $oldPaths[] = $img['thumb_path'];
                }
                $replaced[] = $filename;
            }
        } catch (\Throwable $e) {
            // Rows already switched keep their new image; nothing is lost.
            $this->deleteFilesIfUnused($oldPaths);
            throw $e;
        }

        if ($replaced !== []) {
            $this->pdo->prepare('UPDATE product_import_batches SET zip_filename = :z, zip_size_bytes = :s WHERE id = :id')
                ->execute(['z' => $zipName, 's' => $zipSize, 'id' => $id]);
        }
        $this->deleteFilesIfUnused($oldPaths);

        return ['replaced' => $replaced, 'not_in_zip' => $notInZip];
    }

    /** @param array{tmp_name: string, size: int, error: int, name: string} $file */
    public function replaceImage(int $batchId, string $type, int $imageId, array $file): array
    {
        $img = $this->findImage($batchId, $type, $imageId);
        $stored = $this->uploader->store($file, 'products');

        $this->pdo->prepare('UPDATE ' . self::TYPES[$type] . ' SET image_path = :p, thumb_path = :t WHERE id = :id')
            ->execute(['p' => $stored['path'], 't' => $stored['thumb_path'], 'id' => $imageId]);
        $this->deleteFilesIfUnused([$img['image_path'], $img['thumb_path']]);

        return ['image_path' => $stored['path'], 'thumb_path' => $stored['thumb_path']];
    }

    public function removeImage(int $batchId, string $type, int $imageId): void
    {
        $img = $this->findImage($batchId, $type, $imageId);
        $this->pdo->prepare('DELETE FROM ' . self::TYPES[$type] . ' WHERE id = :id')->execute(['id' => $imageId]);
        $this->ensurePrimary($type, (int) $img['owner_id']);
        $this->deleteFilesIfUnused([$img['image_path'], $img['thumb_path']]);
    }

    /** @return list<array<string, mixed>> */
    private function images(int $batchId): array
    {
        $stmt = $this->pdo->prepare(
            "SELECT 'product' AS type, pi.id, pi.product_id AS owner_id, pi.product_id, NULL AS variant_id,
                    p.name AS product_name, NULL AS sku, pi.source_filename, pi.image_path, pi.thumb_path, pi.is_primary
               FROM product_images pi JOIN products p ON p.id = pi.product_id
              WHERE pi.import_batch_id = :b1
             UNION ALL
             SELECT 'variant' AS type, vi.id, vi.variant_id AS owner_id, v.product_id, vi.variant_id,
                    p.name AS product_name, v.sku, vi.source_filename, vi.image_path, vi.thumb_path, vi.is_primary
               FROM variant_images vi
               JOIN product_variants v ON v.id = vi.variant_id
               JOIN products p ON p.id = v.product_id
              WHERE vi.import_batch_id = :b2
             ORDER BY product_name, type, id"
        );
        $stmt->execute(['b1' => $batchId, 'b2' => $batchId]);

        return array_map(static function (array $r): array {
            foreach (['id', 'owner_id', 'product_id', 'variant_id'] as $k) {
                $r[$k] = $r[$k] === null ? null : (int) $r[$k];
            }
            $r['is_primary'] = (bool) $r['is_primary'];

            return $r;
        }, $stmt->fetchAll(PDO::FETCH_ASSOC));
    }

    /** @return array<string, mixed> */
    private function findImage(int $batchId, string $type, int $imageId): array
    {
        if (!isset(self::TYPES[$type])) {
            throw new RuntimeException('Image type must be "product" or "variant"');
        }
        foreach ($this->images($batchId) as $img) {
            if ($img['type'] === $type && $img['id'] === $imageId) {
                return $img;
            }
        }
        throw new RuntimeException('Image not found in this import');
    }

    /** After removing images, make sure the product/variant still has a main image if it has any. */
    private function ensurePrimary(string $type, int $ownerId): void
    {
        $table = self::TYPES[$type];
        $col = $type === 'product' ? 'product_id' : 'variant_id';

        $has = $this->pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE {$col} = :o AND is_primary = 1");
        $has->execute(['o' => $ownerId]);
        if ((int) $has->fetchColumn() > 0) {
            return;
        }
        $this->pdo->prepare("UPDATE {$table} SET is_primary = 1 WHERE {$col} = :o ORDER BY sort_order, id LIMIT 1")
            ->execute(['o' => $ownerId]);
    }

    /** One stored file can be shared by several rows (same photo reused) - only delete when nothing uses it. */
    private function deleteFilesIfUnused(array $paths): void
    {
        $check = $this->pdo->prepare(
            'SELECT (SELECT COUNT(*) FROM product_images WHERE image_path = :a OR thumb_path = :b)
                  + (SELECT COUNT(*) FROM variant_images WHERE image_path = :c OR thumb_path = :d)'
        );
        foreach (array_unique(array_filter($paths)) as $path) {
            $check->execute(['a' => $path, 'b' => $path, 'c' => $path, 'd' => $path]);
            if ((int) $check->fetchColumn() === 0) {
                $this->uploader->delete($path);
            }
        }
    }

    private function assertExists(int $id): void
    {
        $stmt = $this->pdo->prepare('SELECT 1 FROM product_import_batches WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if ($stmt->fetchColumn() === false) {
            throw new RuntimeException('Import not found');
        }
    }

    /** @param array<string, mixed> $r */
    private function castBatch(array $r): array
    {
        foreach (['id', 'total_rows', 'successful_rows', 'failed_rows', 'created_by', 'zip_size_bytes', 'image_count'] as $k) {
            if (array_key_exists($k, $r)) {
                $r[$k] = $r[$k] === null ? null : (int) $r[$k];
            }
        }

        return $r;
    }
}
