<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Config;
use RuntimeException;

/**
 * Validates, compresses and stores an uploaded image.
 *
 * - MIME is sniffed from the bytes (never trusted from the client).
 * - With PHP GD: converted to WebP, resized, then compressed until it fits
 *   the KB target (IMAGE_MAIN_TARGET_KB / IMAGE_THUMB_TARGET_KB). Quality is
 *   lowered first; if it still doesn't fit, the image is scaled down too.
 * - Storage: Cloudflare R2 when R2_ENABLED=true (the DB then stores the full
 *   public https:// URL), otherwise public/uploads/ on local disk (the DB
 *   stores "uploads/..."). Frontends already accept both forms.
 */
final class ImageUploadService
{
    private const ALLOWED_MIME = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    private const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
    private const MAIN_MAX_DIMENSION = 1200;
    private const THUMB_MAX_DIMENSION = 300;

    private const START_QUALITY = 82;
    private const MIN_QUALITY = 35;
    private const QUALITY_STEP = 8;
    private const SCALE_STEP = 0.85;
    private const MIN_DIMENSION = 160;

    private ?R2Storage $r2;

    public function __construct(?R2Storage $r2 = null)
    {
        $this->r2 = $r2 ?? R2Storage::fromConfig();
        if ($this->r2 === null) {
            throw new RuntimeException('Cloudflare R2 is required for all image uploads. Local disk storage is disabled.');
        }
    }

    /**
     * @param array{tmp_name: string, size: int, error: int, name: string} $file
     * @return array{path: string, thumb_path: string, original_size: int, final_size: int}
     */
    public function store(array $file, string $subdir): array
    {
        if ($file['error'] !== UPLOAD_ERR_OK) {
            throw new RuntimeException('Upload failed');
        }

        if ($file['size'] > self::MAX_UPLOAD_BYTES) {
            throw new RuntimeException('Image must be 10MB or smaller');
        }

        $mime = mime_content_type($file['tmp_name']);
        if ($mime === false || !array_key_exists($mime, self::ALLOWED_MIME)) {
            throw new RuntimeException('Only JPG, PNG or WEBP images are allowed');
        }

        $raw = file_get_contents($file['tmp_name']);
        if ($raw === false) {
            throw new RuntimeException('Could not read uploaded image');
        }

        $subdir = trim($subdir, '/');
        $basename = bin2hex(random_bytes(16));
        $originalSize = strlen($raw);

        $image = $this->decode($raw);
        if ($image !== null) {
            $main = $this->compress($image, self::MAIN_MAX_DIMENSION, (int) Config::get('image.main_target_kb', 100));
            $thumb = $this->compress($image, self::THUMB_MAX_DIMENSION, (int) Config::get('image.thumb_target_kb', 30));
            imagedestroy($image);

            $mainPath = $this->put("{$subdir}/{$basename}.webp", $main, 'image/webp');
            try {
                $thumbPath = $this->put("{$subdir}/{$basename}-thumb.webp", $thumb, 'image/webp');
            } catch (\Throwable $e) {
                $this->delete($mainPath);
                throw $e;
            }

            return [
                'path' => $mainPath,
                'thumb_path' => $thumbPath,
                'original_size' => $originalSize,
                'final_size' => strlen($main),
            ];
        }

        // No GD (or undecodable image): store as-is, uncompressed.
        error_log('[ImageUploadService] GD not available - image stored WITHOUT compression. Enable extension=gd in php.ini.');
        $ext = self::ALLOWED_MIME[$mime];
        $mainPath = $this->put("{$subdir}/{$basename}.{$ext}", $raw, $mime);
        $thumbPath = $this->put("{$subdir}/{$basename}-thumb.{$ext}", $raw, $mime);

        return [
            'path' => $mainPath,
            'thumb_path' => $thumbPath,
            'original_size' => $originalSize,
            'final_size' => $originalSize,
        ];
    }

    /**
     * Compress an image that's already on disk and store it under $key
     * (used by the migrate-to-R2 script). Returns the stored path/URL.
     */
    public function storeExisting(string $localFile, string $key, bool $isThumb): string
    {
        $raw = file_get_contents($localFile);
        if ($raw === false) {
            throw new RuntimeException("Cannot read {$localFile}");
        }

        $image = $this->decode($raw);
        if ($image === null) {
            $mime = mime_content_type($localFile) ?: 'application/octet-stream';
            return $this->put($key, $raw, $mime);
        }

        $bytes = $isThumb
            ? $this->compress($image, self::THUMB_MAX_DIMENSION, (int) Config::get('image.thumb_target_kb', 30))
            : $this->compress($image, self::MAIN_MAX_DIMENSION, (int) Config::get('image.main_target_kb', 100));
        imagedestroy($image);

        $key = preg_replace('/\.(jpe?g|png|webp)$/i', '', $key) . '.webp';

        return $this->put($key, $bytes, 'image/webp');
    }

    public function delete(?string $path): void
    {
        if ($path === null || $path === '') {
            return;
        }

        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            $key = $this->r2?->keyFromUrl($path);
            if ($key !== null) {
                try {
                    $this->r2->delete($key);
                } catch (\Throwable $e) {
                    error_log('[ImageUploadService] R2 delete failed: ' . $e->getMessage());
                }
            }
            return; // external URL we don't own - leave it alone
        }

        $full = dirname(__DIR__, 2) . '/public/' . ltrim($path, '/');
        if (is_file($full)) {
            @unlink($full);
        }
    }

    public function usesR2(): bool
    {
        return true;
    }

    /** Store bytes strictly in Cloudflare R2; returns public CDN URL. */
    private function put(string $key, string $bytes, string $contentType): string
    {
        if ($this->r2 !== null) {
            return $this->r2->put($key, $bytes, $contentType);
        }

        throw new RuntimeException('Cloudflare R2 is required. Local disk uploads are permanently disabled.');
    }

    private function decode(string $raw): ?\GdImage
    {
        if (!extension_loaded('gd') || !function_exists('imagecreatefromstring')) {
            return null;
        }

        $image = @imagecreatefromstring($raw);
        if ($image === false) {
            return null;
        }

        // Palette PNGs can't be resampled into WebP correctly - make true colour.
        if (!imageistruecolor($image)) {
            imagepalettetotruecolor($image);
        }

        return $this->applyExifOrientation($image, $raw);
    }

    /** Phone photos store rotation in EXIF; GD ignores it, so rotate here. */
    private function applyExifOrientation(\GdImage $image, string $raw): \GdImage
    {
        if (!function_exists('exif_read_data') || !str_starts_with($raw, "\xFF\xD8")) {
            return $image;
        }

        $stream = fopen('php://memory', 'r+b');
        fwrite($stream, $raw);
        rewind($stream);
        $exif = @exif_read_data($stream);
        fclose($stream);

        $rotated = match ((int) ($exif['Orientation'] ?? 1)) {
            3 => imagerotate($image, 180, 0),
            6 => imagerotate($image, -90, 0),
            8 => imagerotate($image, 90, 0),
            default => null,
        };
        if ($rotated instanceof \GdImage) {
            imagedestroy($image);
            return $rotated;
        }

        return $image;
    }

    /**
     * Resize to fit $maxDimension, then lower quality (and if needed the
     * dimensions) until the WebP is at most $targetKb. Returns the bytes.
     */
    private function compress(\GdImage $source, int $maxDimension, int $targetKb): string
    {
        $targetBytes = max(1, $targetKb) * 1024;
        $srcW = imagesx($source);
        $srcH = imagesy($source);
        $longest = (int) min($maxDimension, max($srcW, $srcH));

        $best = null;
        while (true) {
            $scale = $longest / max($srcW, $srcH);
            $w = max(1, (int) round($srcW * $scale));
            $h = max(1, (int) round($srcH * $scale));

            $canvas = imagecreatetruecolor($w, $h);
            imagealphablending($canvas, false);
            imagesavealpha($canvas, true);
            imagecopyresampled($canvas, $source, 0, 0, 0, 0, $w, $h, $srcW, $srcH);

            for ($q = self::START_QUALITY; $q >= self::MIN_QUALITY; $q -= self::QUALITY_STEP) {
                ob_start();
                imagewebp($canvas, null, $q);
                $bytes = (string) ob_get_clean();

                if ($best === null || strlen($bytes) < strlen($best)) {
                    $best = $bytes;
                }
                if (strlen($bytes) <= $targetBytes) {
                    imagedestroy($canvas);
                    return $bytes;
                }
            }
            imagedestroy($canvas);

            $next = (int) floor($longest * self::SCALE_STEP);
            if ($next < self::MIN_DIMENSION || $next >= $longest) {
                return $best; // smallest we could get without wrecking the image
            }
            $longest = $next;
        }
    }
}
