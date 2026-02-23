<?php
/**
 * OSiris Nearby Users API - GET current user role (Admin check)
 * Copy to: public_html/api/users-me.php
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, no-cache, must-revalidate');

$config = @include dirname(__DIR__) . '/config.php';
$adminIps = $config['ADMIN_IPS'] ?? ['195.139.147.156'];
$adminIps = is_array($adminIps) ? $adminIps : [$adminIps];

$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
    $clientIp = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
} elseif (!empty($_SERVER['HTTP_X_REAL_IP'])) {
    $clientIp = trim($_SERVER['HTTP_X_REAL_IP']);
}
echo json_encode(['isAdmin' => in_array($clientIp, $adminIps, true)]);
