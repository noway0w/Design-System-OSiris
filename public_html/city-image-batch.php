<?php
/**
 * OSiris City Image Batch Processor - Admin-only
 * Accepts 1-100 PNG files named city,country.png, center-crops to specified dimensions,
 * renames to City-CountryCode.png, saves to /home/OSiris/public_html/cities
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit;
}

$config = @include __DIR__ . '/config.php';
$adminIps = $config['ADMIN_IPS'] ?? ['195.139.147.156'];
$adminIps = is_array($adminIps) ? $adminIps : [$adminIps];

$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
    $clientIp = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
} elseif (!empty($_SERVER['HTTP_X_REAL_IP'])) {
    $clientIp = trim($_SERVER['HTTP_X_REAL_IP']);
}
if (!in_array($clientIp, $adminIps, true)) {
    http_response_code(403);
    echo json_encode(['error' => 'Admin access required']);
    exit;
}

$cropWidth = isset($_POST['cropWidth']) ? (int)$_POST['cropWidth'] : 0;
$cropHeight = isset($_POST['cropHeight']) ? (int)$_POST['cropHeight'] : 0;
if ($cropWidth < 1 || $cropWidth > 4096 || $cropHeight < 1 || $cropHeight > 4096) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid crop dimensions (1-4096)']);
    exit;
}

$destDir = __DIR__ . '/cities';
if (!is_dir($destDir)) {
    mkdir($destDir, 0755, true);
}

require_once __DIR__ . '/include/country-codes.php';

$files = [];
if (isset($_FILES['files']) && is_array($_FILES['files'])) {
    $f = $_FILES['files'];
    if (isset($f['name']) && is_array($f['name'])) {
        for ($i = 0; $i < count($f['name']); $i++) {
            if ($f['error'][$i] === UPLOAD_ERR_OK && $f['tmp_name'][$i]) {
                $files[] = [
                    'name' => $f['name'][$i],
                    'tmp_name' => $f['tmp_name'][$i],
                    'type' => $f['type'][$i] ?? '',
                ];
            }
        }
    } elseif (isset($f['name']) && is_string($f['name']) && $f['error'] === UPLOAD_ERR_OK) {
        $files[] = [
            'name' => $f['name'],
            'tmp_name' => $f['tmp_name'],
            'type' => $f['type'] ?? '',
        ];
    }
}

$pngFiles = [];
foreach ($files as $f) {
    $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
    if ($ext !== 'png') continue;
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = finfo_file($finfo, $f['tmp_name']);
    finfo_close($finfo);
    if ($mime !== 'image/png') continue;
    $pngFiles[] = $f;
}

$count = count($pngFiles);
if ($count < 1) {
    http_response_code(400);
    echo json_encode(['error' => 'At least 1 PNG file required']);
    exit;
}
if ($count > 100) {
    http_response_code(400);
    echo json_encode(['error' => 'Maximum 100 PNG files per batch']);
    exit;
}

$results = [];
foreach ($pngFiles as $f) {
    $origName = $f['name'];
    $result = ['file' => $origName, 'status' => 'error', 'error' => 'Unknown error'];
    try {
        $img = @imagecreatefrompng($f['tmp_name']);
        if (!$img) {
            $result['error'] = 'Invalid or corrupted PNG';
            $results[] = $result;
            continue;
        }
        $srcW = imagesx($img);
        $srcH = imagesy($img);
        if ($srcW < 1 || $srcH < 1) {
            imagedestroy($img);
            $result['error'] = 'Invalid image dimensions';
            $results[] = $result;
            continue;
        }
        $targetW = min($cropWidth, $srcW);
        $targetH = min($cropHeight, $srcH);
        $cropX = (int)floor(($srcW - $targetW) / 2);
        $cropY = (int)floor(($srcH - $targetH) / 2);
        $cropped = imagecrop($img, ['x' => $cropX, 'y' => $cropY, 'width' => $targetW, 'height' => $targetH]);
        imagedestroy($img);
        if (!$cropped) {
            $result['error'] = 'Crop failed';
            $results[] = $result;
            continue;
        }
        if ($targetW !== $cropWidth || $targetH !== $cropHeight) {
            $resized = imagescale($cropped, $cropWidth, $cropHeight);
            if ($resized) {
                imagedestroy($cropped);
                $cropped = $resized;
            }
        }
        $baseName = pathinfo($origName, PATHINFO_FILENAME);
        $parts = explode(',', $baseName, 2);
        $city = trim($parts[0] ?? '');
        $country = trim($parts[1] ?? '');
        if ($city === '' || $country === '') {
            imagedestroy($cropped);
            $result['error'] = 'Filename must be city,country.png';
            $results[] = $result;
            continue;
        }
        $cityFormatted = ucwords(strtolower($city));
        $fallback = strtoupper(substr(preg_replace('/\s+/', '', $country), 0, 2)) ?: 'XX';
        $countryCode = function_exists('countryToIso') ? countryToIso($country) : $fallback;
        $outputName = preg_replace('/[^a-zA-Z0-9\x{00C0}-\x{00FF}\s\-]/u', '', $cityFormatted);
        $outputName = preg_replace('/\s+/', '-', trim($outputName));
        $outputName = $outputName . '-' . $countryCode . '.png';
        if ($outputName === '-' || $outputName === '.png') {
            imagedestroy($cropped);
            $result['error'] = 'Invalid output name';
            $results[] = $result;
            continue;
        }
        $outPath = $destDir . '/' . $outputName;
        if (!is_writable($destDir)) {
            imagedestroy($cropped);
            $result['error'] = 'Cities dir not writable: ' . $destDir;
            $results[] = $result;
            continue;
        }
        imagealphablending($cropped, false);
        imagesavealpha($cropped, true);
        if (!imagepng($cropped, $outPath)) {
            imagedestroy($cropped);
            $testPath = $destDir . '/_write_test_' . uniqid();
            $testOk = (@file_put_contents($testPath, 'x') !== false);
            if ($testOk) @unlink($testPath);
            $result['error'] = 'imagepng failed. Plain write test: ' . ($testOk ? 'OK' : 'failed');
            $results[] = $result;
            continue;
        }
        imagedestroy($cropped);
        $result['status'] = 'success';
        $result['outputName'] = $outputName;
        unset($result['error']);
    } catch (Throwable $e) {
        $result['error'] = $e->getMessage();
    }
    $results[] = $result;
}

echo json_encode(['results' => $results]);
