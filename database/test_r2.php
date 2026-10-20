<?php
// Quick R2 check: php database/test_r2.php
// Uploads a small compressed test image to R2, prints its public URL, then deletes it.
declare(strict_types=1);
require dirname(__DIR__) . '/backend/vendor/autoload.php';

use App\Services\ImageUploadService;

echo 'GD (compression): ' . (extension_loaded('gd') ? 'ON' : 'OFF - enable extension=gd in php.ini') . PHP_EOL;
echo 'cURL: ' . (extension_loaded('curl') ? 'ON' : 'OFF - enable extension=curl in php.ini') . PHP_EOL;

$tmp = tempnam(sys_get_temp_dir(), 'r2t');
$img = imagecreatetruecolor(1600, 1200);
for ($i = 0; $i < 3000; $i++) {
    imagefilledellipse($img, random_int(0, 1600), random_int(0, 1200), 60, 60, imagecolorallocate($img, random_int(0, 255), random_int(0, 255), random_int(0, 255)));
}
imagejpeg($img, $tmp, 95);

$svc = new ImageUploadService();
if (!$svc->usesR2()) {
    exit("R2 is not enabled in backend/.env\n");
}

$r = $svc->store(['tmp_name' => $tmp, 'size' => filesize($tmp), 'error' => UPLOAD_ERR_OK, 'name' => 'test.jpg'], 'test');
printf("Uploaded OK: %d KB -> %d KB\n  %s\n  %s\n", intdiv($r['original_size'], 1024), intdiv($r['final_size'], 1024), $r['path'], $r['thumb_path']);
echo "Open the first URL in your browser now to check it is public. Press Enter to delete the test files...";
fgets(STDIN);
$svc->delete($r['path']);
$svc->delete($r['thumb_path']);
@unlink($tmp);
echo "Deleted. R2 is working.\n";
