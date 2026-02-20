<?php
/**
 * OSiris Nearby Users API - POST or GET: register/update user
 * (GET accepted as fallback when host blocks POST)
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method === 'GET') {
    $body = $_GET;
} elseif ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        parse_str($raw, $body);
        $body = $body ?: [];
    }
} else {
    http_response_code(405);
    echo json_encode(['error' => 'GET or POST only', 'received' => $method]);
    exit;
}

$name = trim($body['name'] ?? '');
if ($name === '') {
    http_response_code(400);
    echo json_encode(['error' => 'name required']);
    exit;
}

$dbPath = __DIR__ . '/users.db';
try {
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error']);
    exit;
}

$db->exec('
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        name TEXT NOT NULL,
        lat REAL,
        lng REAL,
        city TEXT,
        country TEXT,
        last_seen INTEGER NOT NULL,
        created_at INTEGER NOT NULL
    )
');

$now = (string)round(microtime(true) * 1000);
$ip = $body['ip'] ?? '';
$latVal = $body['lat'] ?? '';
$lngVal = $body['lng'] ?? '';
$lat = ($latVal !== '' && $latVal !== null) ? (float)$latVal : null;
$lng = ($lngVal !== '' && $lngVal !== null) ? (float)$lngVal : null;
$city = $body['city'] ?? null;
$country = $body['country'] ?? null;

$stmt = $db->prepare('SELECT id FROM users WHERE name = ?');
$stmt->execute([$name]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);

if ($row) {
    $up = $db->prepare('UPDATE users SET ip = ?, lat = ?, lng = ?, city = ?, country = ?, last_seen = ? WHERE id = ?');
    $up->execute([$ip, $lat, $lng, $city, $country, $now, $row['id']]);
} else {
    $ins = $db->prepare('INSERT INTO users (ip, name, lat, lng, city, country, last_seen, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $ins->execute([$ip, $name, $lat, $lng, $city, $country, $now, $now]);
}
echo json_encode(['ok' => true]);
