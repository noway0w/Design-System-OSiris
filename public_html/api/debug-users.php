<?php
/**
 * Debug endpoint: check DB state (remove in production)
 * Visit: /api/debug-users.php
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$dbPath = __DIR__ . '/users.db';
$out = [
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
