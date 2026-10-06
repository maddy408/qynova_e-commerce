<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Config;
use RuntimeException;

/**
 * Validates and stores an uploaded image: MIME-sniffed (not trusted from
 * the client), converted to WebP, resized, and iteratively re-encoded at
 * falling quality until it's under the configured target size — the
 * compression pipeline docs/DOCUMENTATION.md section 8 originally called
 * for but that was never wired to any upload endpoint (there wasn't one).
 * Random filenames under public/uploads/, outside any executable path.
 */
final class ImageUploadService
{
    private const ALLOWED_MIME = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    private const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
    private const MAIN_MAX_DIMENSION = 1200;
    private const THUMB_MAX_DIMENSION = 300;

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
            throw new RuntimeException('Image must be 5MB or smaller');
        }

        $mime = mime_content_type($file['tmp_name']);
        if ($mime === false || !array_key_exists($mime, self::ALLOWED_MIME)) {
            throw new RuntimeException('Only JPG, PNG or WEBP images are allowed');
        }

        $image = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($file['tmp_name']),
            'image/png' => @imagecreatefrompng($file['tmp_name']),
            'image/webp' => @imagecreatefromwebp($file['tmp_name']),
            default => false,
        };

        if ($image === false) {
            throw new RuntimeException('Could not read image file');
        }

        $dir = dirname(__DIR__, 2) . "/public/uploads/{$subdir}";
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("Could not create upload directory");
        }

        $basename = bin2hex(random_bytes(16));
        $mainRelative = "uploads/{$subdir}/{$basename}.webp";
        $thumbRelative = "uploads/{$subdir}/{$basename}-thumb.webp";

        $originalSize = $file['size'];
        $finalSize = $this->saveResizedWebp(
            $image,
            dirname(__DIR__, 2) . "/public/{$mainRelative}",
            self::MAIN_MAX_DIMENSION,
            (int) Config::get('image.main_target_kb', 100),
        );
        $this->saveResizedWebp(
            $image,
            dirname(__DIR__, 2) . "/public/{$thumbRelative}",
            self::THUMB_MAX_DIMENSION,
            (int) Config::get('image.thumb_target_kb', 30),
        );

        imagedestroy($image);

        return [
            'path' => $mainRelative,
            'thumb_path' => $thumbRelative,
            'original_size' => $originalSize,
            'final_size' => $finalSize,
        ];
    }

    public function delete(?string $relativePath): void
    {
        if ($relativePath === null) {
            return;
        }

        $full = dirname(__DIR__, 2) . "/public/{$relativePath}";
        if (is_file($full)) {
            @unlink($full);
        }
    }

    /** @param \GdImage $source */
    private function saveResizedWebp(\GdImage $source, string $destPath, int $maxDimension, int $targetKb): int
    {
        $width = imagesx($source);
        $height = imagesy($source);
        $scale = min(1.0, $maxDimension / max($width, $height));
        $newWidth = max(1, (int) round($width * $scale));
        $newHeight = max(1, (int) round($height * $scale));

        $resized = imagecreatetruecolor($newWidth, $newHeight);
        imagealphablending($resized, false);
        imagesavealpha($resized, true);
        imagecopyresampled($resized, $source, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);

        $quality = 80;
        do {
            imagewebp($resized, $destPath, $quality);
            $size = filesize($destPath);
            $quality -= 10;
        } while ($size !== false && $size > $targetKb * 1024 && $quality >= 40);

        imagedestroy($resized);

        return filesize($destPath) ?: 0;
    }
}
