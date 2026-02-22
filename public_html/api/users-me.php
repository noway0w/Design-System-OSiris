<?php
/**
 * OSiris Nearby Users API - GET current user role (Admin check)
 * Copy to: public_html/api/users-me.php
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, no-cache, must-revalidate');

$adminIp = '195.139.147.156';
$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
if (isset($_SERVER['HTTP_X_FORWARDED_FOR'])) {
    $clientIp = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
}
echo json_encode(['isAdmin' => ($clientIp === $adminIp)]);
