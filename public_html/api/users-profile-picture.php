<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit;
}
$raw = file_get_contents('php://input');
$body = json_decode($raw, true) ?: [];
$name = trim($body['name'] ?? '');
if ($name === '') {
    http_response_code(400);
    echo json_encode(['error' => 'name required']);
    exit;
}
$path = trim($body['profilePicture'] ?? $body['profile_picture'] ?? '');
$dbPath = __DIR__ . '/users.db';
try {
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error']);
    exit;
}
$cols = $db->query("PRAGMA table_info(users)")->fetchAll(PDO::FETCH_ASSOC);
$hasProfilePicture = false;
foreach ($cols as $c) {
    if (($c['name'] ?? '') === 'profile_picture') { $hasProfilePicture = true; break; }
}
if (!$hasProfilePicture) {
    $db->exec('ALTER TABLE users ADD COLUMN profile_picture TEXT');
}
$stmt = $db->prepare('UPDATE users SET profile_picture = ? WHERE name = ?');
$stmt->execute([$path === '' ? null : $path, $name]);
$check = $db->prepare('SELECT id FROM users WHERE name = ?');
$check->execute([$name]);
if (!$check->fetch() && $stmt->rowCount() === 0) {
    http_response_code(404);
    echo json_encode(['error' => 'User not found']);
    exit;
}
echo json_encode(['ok' => true, 'profilePicture' => $path ?: null]);
