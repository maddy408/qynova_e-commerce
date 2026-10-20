<?php

declare(strict_types=1);

namespace App\Services;

use RuntimeException;
use ZipArchive;

/**
 * Extracts an admin-uploaded "images.zip" (Excel import's filename-based
 * image resolution: the Excel cell holds a plain filename like
 * "tshirt.jpg", the admin uploads this zip alongside the Excel file, and
 * ProductImportService looks the filename up here instead of downloading
 * a URL). Flattened by design: every entry is written to the destination
 * directory under its own basename only, regardless of whatever folder
 * structure the zip stored it under — this is also what makes it
 * zip-slip-proof, since a "../../etc/passwd" or an absolute-path entry
 * name can never escape the destination directory when only its
 * basename is ever used to build the output path. Non-image entries
 * (a README, a folder entry, ...) are skipped rather than failing the
 * whole import. If two entries share a basename, the later one wins —
 * documented in the sample template's instructions, not treated as an
 * error, since that is rare and recoverable (re-zip without the clash).
 */
final class SafeZipExtractor
{
    private const MAX_ENTRIES = 2000;
    private const MAX_TOTAL_BYTES = 500 * 1024 * 1024;
    private const MAX_FILE_BYTES = 10 * 1024 * 1024;
    private const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

    /** @return string path to a fresh temp directory of flattened image files — caller must cleanup() it */
    public function extract(string $zipPath): string
    {
        $zip = new ZipArchive();
        $opened = $zip->open($zipPath);

        if ($opened !== true) {
            throw new RuntimeException('Could not read the uploaded file as a ZIP archive');
        }

        if ($zip->numFiles > self::MAX_ENTRIES) {
            $zip->close();
            throw new RuntimeException('Images ZIP has too many entries (max ' . self::MAX_ENTRIES . ')');
        }

        $destDir = sys_get_temp_dir() . '/product-import-images-' . bin2hex(random_bytes(8));
        if (!mkdir($destDir, 0775, true)) {
            $zip->close();
            throw new RuntimeException('Could not create a temp directory for image extraction');
        }

        $totalBytes = 0;

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if ($name === false || str_ends_with($name, '/')) {
                continue; // directory entry
            }

            $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
            if (!in_array($ext, self::ALLOWED_EXTENSIONS, true)) {
                continue; // skip non-image entries instead of failing the whole zip
            }

            $stat = $zip->statIndex($i);
            $size = (int) ($stat['size'] ?? 0);

            if ($size > self::MAX_FILE_BYTES) {
                continue;
            }

            $totalBytes += $size;
            if ($totalBytes > self::MAX_TOTAL_BYTES) {
                $zip->close();
                $this->cleanup($destDir);
                throw new RuntimeException('Images ZIP contents exceed the total size limit (' . (int) (self::MAX_TOTAL_BYTES / 1024 / 1024) . 'MB)');
            }

            $contents = $zip->getFromIndex($i);
            if ($contents === false) {
                continue;
            }

            // basename() only — see class docblock on why this is the
            // zip-slip defense, not an incidental detail.
            file_put_contents($destDir . '/' . basename(str_replace('\\', '/', $name)), $contents); // some Windows zip tools store \ separators
        }

        $zip->close();

        return $destDir;
    }

    /**
     * Finds the file an Excel cell refers to inside an extracted ZIP dir.
     * Only the file name counts (folders / C:\ paths ignored), case-insensitive.
     */
    public static function findInDir(string $dir, string $token): ?string
    {
        $wanted = basename(str_replace('\\', '/', trim($token)));
        if ($wanted === '' || $wanted === '.' || $wanted === '..') {
            return null;
        }
        if (is_file($dir . '/' . $wanted)) {
            return $dir . '/' . $wanted;
        }
        foreach (@scandir($dir) ?: [] as $entry) {
            if ($entry !== '.' && $entry !== '..' && strcasecmp($entry, $wanted) === 0) {
                return $dir . '/' . $entry;
            }
        }

        return null;
    }

    public function cleanup(string $dir): void
    {
        foreach (glob($dir . '/*') ?: [] as $file) {
            @unlink($file);
        }
        @rmdir($dir);
    }
}
