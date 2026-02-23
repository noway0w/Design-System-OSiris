<?php
/**
 * OSiris Nearby Users API - DELETE single user
 * Admin: can delete any user. User: can delete own profile only.
 * Replace public_html/api/users-delete.php with this file.
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$adminIps = ['195.139.147.156', '127.0.0.1'];
$config = @include dirname(__DIR__) . '/config.php';
if (is_array($config) && !empty($config['ADMIN_IPS'])) {
    $adminIps = is_array($config['ADMIN_IPS']) ? $config['ADMIN_IPS'] : [$config['ADMIN_IPS']];
}

$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
    $clientIp = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
} elseif (!empty($_SERVER['HTTP_X_REAL_IP'])) {
    $clientIp = trim($_SERVER['HTTP_X_REAL_IP']);
}

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
if ($id < 1) {
    http_response_code(400);
    echo json_encode(['error' => 'id required']);
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

$stmt = $db->prepare('SELECT ip FROM users WHERE id = ?');
$stmt->execute([$id]);
$row = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$row) {
    http_response_code(404);
    echo json_encode(['error' => 'User not found']);
    exit;
}

$isAdmin = in_array($clientIp, $adminIps, true);
$isOwnProfile = ($row['ip'] === $clientIp);
if (!$isAdmin && !$isOwnProfile) {
    http_response_code(403);
    echo json_encode([
        'error' => 'You can only delete your own profile',
        'debug' => ['clientIp' => $clientIp, 'adminIps' => $adminIps, 'targetUserIp' => $row['ip']]
    ]);
    exit;
}

$del = $db->prepare('DELETE FROM users WHERE id = ?');
$del->execute([$id]);
echo json_encode(['ok' => true]);
