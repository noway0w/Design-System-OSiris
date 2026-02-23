<?php
/**
 * OSiris City Image API - Resolve city background images from local database
 * 1. Exact match: cities/{City}-{CountryCode}.png
 * 2. Closest city within 150km (e.g. Chennevières → Paris)
 * 3. Default placeholder if no match
 * No Gemini generation. Single image per city; dark mode via filter on frontend.
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Cache-Control: no-store, no-cache, must-revalidate');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$input = $method === 'POST' ? (json_decode(file_get_contents('php://input'), true) ?? []) : $_GET;
$city = trim($input['city'] ?? '');
$countryCode = strtoupper(substr(trim($input['countryCode'] ?? $input['country'] ?? ''), 0, 2));
$lat = isset($input['lat']) ? (float)$input['lat'] : null;
$lng = isset($input['lng']) ? (float)$input['lng'] : null;

// Require either (city + countryCode) or (lat + lng) for closest-city lookup
$hasCity = $city !== '' && $countryCode !== '';
$hasCoords = $lat !== null && $lng !== null && $lat >= -90 && $lat <= 90 && $lng >= -180 && $lng <= 180;
if (!$hasCity && !$hasCoords) {
    http_response_code(400);
    echo json_encode(['error' => 'city and countryCode required, or lat and lng for closest-city lookup']);
    exit;
}

$baseDir = __DIR__ . '/cities';
if (!is_dir($baseDir)) {
    mkdir($baseDir, 0755, true);
}

$safeCity = preg_replace('/[^a-zA-Z0-9\x{00C0}-\x{00FF}\s\-]/u', '', $city);
$safeCity = preg_replace('/\s+/', '-', trim($safeCity));
$key = $safeCity . '-' . $countryCode;

function haversineKm($lat1, $lng1, $lat2, $lng2) {
    $R = 6371;
    $dLat = deg2rad($lat2 - $lat1);
    $dLng = deg2rad($lng2 - $lng1);
    $a = sin($dLat/2)**2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng/2)**2;
    return $R * 2 * atan2(sqrt($a), sqrt(1-$a));
}

// Single image per city (no Clear/Dark distinction)
$imagePath = $baseDir . '/' . $key . '.png';
if (file_exists($imagePath)) {
    echo json_encode([
        'image' => 'cities/' . $key . '.png',
        'imageClear' => 'cities/' . $key . '.png',
        'imageDark' => 'cities/' . $key . '.png',
        'generated' => false,
        'fallbackCity' => null
    ]);
    exit;
}

$indexPath = $baseDir . '/cities-index.json';
$index = [];
if (file_exists($indexPath)) {
    $index = json_decode(file_get_contents($indexPath), true) ?: [];
}

// Closest city within 150km (e.g. Chennevières → Paris)
$closestKey = null;
$closestDist = 999999;
$radiusKm = 150;

if ($lat !== null && $lng !== null && $lat >= -90 && $lat <= 90 && $lng >= -180 && $lng <= 180) {
    foreach ($index as $k => $v) {
        $dlat = $v['lat'] ?? null;
        $dlng = $v['lng'] ?? null;
        if ($dlat === null || $dlng === null) continue;
        $dist = haversineKm($lat, $lng, $dlat, $dlng);
        if ($dist <= $radiusKm && $dist < $closestDist) {
            $imgPath = $baseDir . '/' . $k . '.png';
            if (file_exists($imgPath)) {
                $closestDist = $dist;
                $closestKey = $k;
            }
        }
    }
}

if ($closestKey !== null) {
    echo json_encode([
        'image' => 'cities/' . $closestKey . '.png',
        'imageClear' => 'cities/' . $closestKey . '.png',
        'imageDark' => 'cities/' . $closestKey . '.png',
        'generated' => false,
        'fallbackCity' => $closestKey
    ]);
    exit;
}

// Default placeholder
$placeholderPath = $baseDir . '/default.png';
if (!file_exists($placeholderPath)) {
    if (function_exists('imagecreatetruecolor')) {
        $img = imagecreatetruecolor(400, 400);
        imagefill($img, 0, 0, imagecolorallocate($img, 135, 206, 235));
        imagepng($img, $placeholderPath);
        imagedestroy($img);
    } else {
        $minPng = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAHDgWlWDMaagAAAABJRU5ErkJggg==');
        file_put_contents($placeholderPath, $minPng);
    }
}

echo json_encode([
    'image' => 'cities/default.png',
    'imageClear' => 'cities/default.png',
    'imageDark' => 'cities/default.png',
    'generated' => false,
    'placeholder' => true
]);
