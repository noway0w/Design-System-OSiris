<?php
/**
 * OSiris Users Widgets API
 * GET ?name=UserName - return widgets for user
 * POST/PATCH - body: { name, widgets: [...] } - update user widgets
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$dbPath = __DIR__ . '/api/users.db';

try {
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error']);
    exit;
}

$cols = $db->query("PRAGMA table_info(users)")->fetchAll(PDO::FETCH_ASSOC);
$hasWidgets = false;
foreach ($cols as $c) {
    if (($c['name'] ?? '') === 'widgets') {
        $hasWidgets = true;
        break;
    }
}
if (!$hasWidgets) {
    $db->exec('ALTER TABLE users ADD COLUMN widgets TEXT');
}

$method = $_SERVER['REQUEST_METHOD'] ?? '';

if ($method === 'GET') {
    $name = trim($_GET['name'] ?? '');
    if ($name === '') {
        http_response_code(400);
        echo json_encode(['error' => 'name required']);
        exit;
    }
    $stmt = $db->prepare('SELECT widgets FROM users WHERE name = ?');
    $stmt->execute([$name]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $widgetsRaw = $row['widgets'] ?? null;
    $widgets = ($widgetsRaw !== null && $widgetsRaw !== '') ? json_decode($widgetsRaw, true) : null;
    echo json_encode(['widgets' => is_array($widgets) ? $widgets : []]);
    exit;
}

if ($method === 'POST' || $method === 'PATCH') {
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON body']);
        exit;
    }
    $name = trim($body['name'] ?? '');
    $widgets = $body['widgets'] ?? null;
    if ($name === '') {
        http_response_code(400);
        echo json_encode(['error' => 'name required']);
        exit;
    }
    if (!is_array($widgets)) {
        http_response_code(400);
        echo json_encode(['error' => 'widgets must be array']);
        exit;
    }
    $stmt = $db->prepare('SELECT id FROM users WHERE name = ?');
    $stmt->execute([$name]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'User not found']);
        exit;
    }
    $json = json_encode($widgets);
    $up = $db->prepare('UPDATE users SET widgets = ? WHERE id = ?');
    $up->execute([$json, $row['id']]);
    echo json_encode(['ok' => true, 'widgets' => $widgets]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
