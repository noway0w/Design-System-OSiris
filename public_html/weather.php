<?php
/**
 * OSiris Weather API - Proxy to Open-Meteo
 * - action=search: Geocoding (city search)
 * - action=forecast: Current weather by lat/lng
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, no-cache, must-revalidate');

$action = $_GET['action'] ?? '';
$name = trim($_GET['name'] ?? '');
$lat = isset($_GET['lat']) ? (float)$_GET['lat'] : null;
$lng = isset($_GET['lng']) ? (float)$_GET['lng'] : null;

if ($action === 'search') {
    if (strlen($name) < 2) {
        http_response_code(400);
        echo json_encode(['error' => 'name requires 2+ characters']);
        exit;
    }
    $url = 'https://geocoding-api.open-meteo.com/v1/search?' . http_build_query([
        'name' => $name,
        'count' => 10,
        'format' => 'json',
        'language' => 'en'
    ]);
} elseif ($action === 'forecast') {
    if ($lat === null || $lng === null || $lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
        http_response_code(400);
        echo json_encode(['error' => 'lat and lng required, valid ranges']);
        exit;
    }
    $url = 'https://api.open-meteo.com/v1/forecast?' . http_build_query([
        'latitude' => $lat,
        'longitude' => $lng,
        'current' => 'temperature_2m,relative_humidity_2m,weather_code',
        'format' => 'json'
    ]);
} else {
    http_response_code(400);
    echo json_encode(['error' => 'action must be search or forecast']);
    exit;
}

$ctx = stream_context_create([
    'http' => ['timeout' => 15],
    'ssl' => ['verify_peer' => true]
]);
$raw = @file_get_contents($url, false, $ctx);
if ($raw === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Weather service unavailable']);
    exit;
}

$data = json_decode($raw, true);
if ($data === null) {
    http_response_code(502);
    echo json_encode(['error' => 'Invalid response from weather service']);
    exit;
}

if ($action === 'search') {
    $results = $data['results'] ?? [];
    echo json_encode(['results' => $results]);
} else {
    $current = $data['current'] ?? [];
    echo json_encode([
        'temperature' => $current['temperature_2m'] ?? null,
        'humidity' => $current['relative_humidity_2m'] ?? null,
        'weatherCode' => (int)($current['weather_code'] ?? 0)
    ]);
}
