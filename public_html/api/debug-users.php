<?php
/**
 * Debug endpoint: check DB state (remove in production)
 * Visit: /api/debug-users.php
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$dbPath = __DIR__ . '/users.db';
$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
    $clientIp = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
} elseif (!empty($_SERVER['HTTP_X_REAL_IP'])) {
    $clientIp = trim($_SERVER['HTTP_X_REAL_IP']);
}
$config = @include dirname(__DIR__) . '/config.php';
$adminIps = $config['ADMIN_IPS'] ?? ['195.139.147.156'];
$adminIps = is_array($adminIps) ? $adminIps : [$adminIps];

$out = [
    'yourIp' => $clientIp,
    'isAdmin' => in_array($clientIp, $adminIps, true),
    'adminIps' => $adminIps,
    'dbPath' => $dbPath,
    'dbExists' => file_exists($dbPath),
    'dbWritable' => is_writable(dirname($dbPath)),
    'count' => 0,
    'users' => [],
    'error' => null
];

try {
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $stmt = $db->query('SELECT name, ip, last_seen FROM users ORDER BY last_seen DESC LIMIT 20');
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $out['count'] = (int)$db->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $out['users'] = $rows;
} catch (Exception $e) {
    $out['error'] = $e->getMessage();
}

echo json_encode($out, JSON_PRETTY_PRINT);
