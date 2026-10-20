<?php

/**
 * One-time: move existing local images (backend/public/uploads/...) to
 * Cloudflare R2, compressing them to the KB targets on the way, and
 * rewrite the DB paths to the R2 public URLs.
 *
 *   php database/migrate_images_to_r2.php --dry-run   (show what would change)
 *   php database/migrate_images_to_r2.php             (do it)
 *
 * Safe to re-run: rows already pointing at https:// URLs are skipped.
 * Local files are NOT deleted - remove backend/public/uploads yourself once
 * you've checked the site.
 */

declare(strict_types=1);

require dirname(__DIR__) . '/backend/vendor/autoload.php';

use App\Services\ImageUploadService;
use Dotenv\Dotenv;

Dotenv::createImmutable(dirname(__DIR__) . '/backend')->safeLoad();

$dryRun = in_array('--dry-run', $argv, true);

$pdo = new PDO(
    sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', $_ENV['DB_HOST'] ?? '127.0.0.1', $_ENV['DB_PORT'] ?? '3306', $_ENV['DB_NAME'] ?? 'unified_pos'),
    $_ENV['DB_USER'] ?? 'root',
    $_ENV['DB_PASS'] ?? '',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);

$uploader = new ImageUploadService();
if (!$uploader->usesR2()) {
    fwrite(STDERR, "R2 is not enabled. Set R2_ENABLED=true and the R2_* keys in backend/.env first.\n");
    exit(1);
}

// table => [column => isThumb]
$targets = [
    'product_images' => ['image_path' => false, 'thumb_path' => true],
    'variant_images' => ['image_path' => false, 'thumb_path' => true],
    'categories' => ['image_path' => false, 'thumb_path' => true],
    'subcategories' => ['image_path' => false, 'thumb_path' => true],
    'brands' => ['image_path' => false],
    'banners' => ['image_desktop_path' => false, 'image_mobile_path' => false],
    'home_sections' => ['image_path' => false],
    'top_offers' => ['image_path' => false],
    'products' => ['og_image_path' => false],
];

$publicDir = dirname(__DIR__) . '/backend/public';
$done = []; // local path => url (same file can be shared by several rows)
$stats = ['uploaded' => 0, 'rows' => 0, 'missing' => 0, 'failed' => 0];

foreach ($targets as $table => $columns) {
    $exists = $pdo->query("SHOW TABLES LIKE " . $pdo->quote($table))->fetchColumn();
    if (!$exists) {
        continue;
    }

    foreach ($columns as $column => $isThumb) {
        $hasColumn = $pdo->query("SHOW COLUMNS FROM `{$table}` LIKE " . $pdo->quote($column))->fetchColumn();
        if (!$hasColumn) {
            continue;
        }

        $rows = $pdo->query("SELECT id, `{$column}` AS p FROM `{$table}` WHERE `{$column}` IS NOT NULL AND `{$column}` <> '' AND `{$column}` NOT LIKE 'http%'")->fetchAll(PDO::FETCH_ASSOC);
        $update = $pdo->prepare("UPDATE `{$table}` SET `{$column}` = :url WHERE id = :id");

        foreach ($rows as $row) {
            $path = ltrim((string) $row['p'], '/');
            if (!str_starts_with($path, 'uploads/')) {
                continue; // e.g. /images/... bundled frontend assets
            }

            $local = "{$publicDir}/{$path}";
            if (!isset($done[$path])) {
                if (!is_file($local)) {
                    echo "  missing  {$table}#{$row['id']} {$column}: {$path}\n";
                    $stats['missing']++;
                    continue;
                }
                $key = substr($path, strlen('uploads/'));
                if ($dryRun) {
                    $done[$path] = "(R2) {$key}";
                } else {
                    try {
                        $done[$path] = $uploader->storeExisting($local, $key, $isThumb);
                        $stats['uploaded']++;
                    } catch (Throwable $e) {
                        echo "  FAILED   {$path}: {$e->getMessage()}\n";
                        $stats['failed']++;
                        continue;
                    }
                }
                printf("  %s %s (%d KB) -> %s\n", $dryRun ? 'would' : 'done ', $path, (int) ceil(filesize($local) / 1024), $done[$path]);
            }

            if (!$dryRun) {
                $update->execute(['url' => $done[$path], 'id' => $row['id']]);
            }
            $stats['rows']++;
        }
    }
}

printf(
    "\n%s: %d files uploaded, %d DB rows %s, %d missing locally, %d failed.\n",
    $dryRun ? 'DRY RUN' : 'Finished',
    $stats['uploaded'],
    $stats['rows'],
    $dryRun ? 'would be updated' : 'updated',
    $stats['missing'],
    $stats['failed'],
);
