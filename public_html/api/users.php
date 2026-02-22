<?php
/**
 * OSiris Nearby Users API - GET: list all users
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, no-cache, must-revalidate');

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

$stmt = $db->query('SELECT id, ip, name, lat, lng, city, country, last_seen FROM users ORDER BY last_seen DESC');
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
$users = array_map(function ($r) {
    return [
        'id' => (int)($r['id'] ?? 0),
        'ip' => $r['ip'],
        'name' => $r['name'],
        'lat' => $r['lat'] ? (float)$r['lat'] : null,
        'lng' => $r['lng'] ? (float)$r['lng'] : null,
        'city' => $r['city'],
        'country' => $r['country'],
        'lastSeen' => (int)$r['last_seen']
    ];
}, $rows);
echo json_encode($users);
