<?php

declare(strict_types=1);

namespace App\Services;

use App\Helpers\Config;
use RuntimeException;

/**
 * Validates and stores an uploaded image: MIME-sniffed (not trusted from
 * the client). When the PHP GD extension is available, images are converted
 * to WebP, resized, and iteratively compressed. When GD is not loaded,
 * images are safely stored with randomized names directly.
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

        $dir = dirname(__DIR__, 2) . "/public/uploads/{$subdir}";
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("Could not create upload directory");
        }

        $basename = bin2hex(random_bytes(16));
        $ext = self::ALLOWED_MIME[$mime];
        $originalSize = $file['size'];

        // Check if GD extension is loaded and functional
        $hasGd = extension_loaded('gd') && function_exists('imagecreatetruecolor');

        if ($hasGd) {
            $image = match ($mime) {
                'image/jpeg' => function_exists('imagecreatefromjpeg') ? @imagecreatefromjpeg($file['tmp_name']) : false,
                'image/png' => function_exists('imagecreatefrompng') ? @imagecreatefrompng($file['tmp_name']) : false,
                'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($file['tmp_name']) : false,
                default => false,
            };

            if ($image !== false) {
                $mainRelative = "uploads/{$subdir}/{$basename}.webp";
                $thumbRelative = "uploads/{$subdir}/{$basename}-thumb.webp";

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
        }

        // Direct storage fallback if GD is absent or image creation fails
        $mainRelative = "uploads/{$subdir}/{$basename}.{$ext}";
        $thumbRelative = "uploads/{$subdir}/{$basename}-thumb.{$ext}";
        $mainFullPath = dirname(__DIR__, 2) . "/public/{$mainRelative}";
        $thumbFullPath = dirname(__DIR__, 2) . "/public/{$thumbRelative}";

        if (!move_uploaded_file($file['tmp_name'], $mainFullPath) && !copy($file['tmp_name'], $mainFullPath)) {
            throw new RuntimeException('Could not save uploaded image file');
        }

        @copy($mainFullPath, $thumbFullPath);
        $finalSize = filesize($mainFullPath) ?: $originalSize;

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
