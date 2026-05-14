<?php
/**
 * Nginx auth_request target: 204 = allow, 401 = deny.
 * Expects HTTP_X_ORIGINAL_URI (set by nginx fastcgi_param).
 * Direct browser access without the header returns 404.
 */
declare(strict_types=1);

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-session.php';

header('Cache-Control: no-store');

$original = $_SERVER['HTTP_X_ORIGINAL_URI'] ?? '';
if ($original === '' || $original === '/') {
    http_response_code(404);
    echo 'Not found';
    exit;
}

$uid = platform_session_user_id();
if (!$uid) {
    http_response_code(401);
    exit;
}

$path = parse_url($original, PHP_URL_PATH) ?: '';
$path = '/' . ltrim($path, '/');

// Dashboard: any authenticated user
if (str_starts_with($path, '/dashboard')) {
    http_response_code(204);
    exit;
}

$service = platform_uri_to_service($path);
if ($service === null) {
    http_response_code(401);
    exit;
}

$pdo = platform_pdo();
$st = $pdo->prepare('SELECT 1 FROM service_permissions WHERE user_id = ? AND service_name = ? LIMIT 1');
$st->execute([$uid, $service]);
if ($st->fetchColumn()) {
    http_response_code(204);
    exit;
}

http_response_code(401);
exit;

/**
 * @return string|null service_name or null if path is not a protected app prefix
 */
function platform_uri_to_service(string $path): ?string
{
    $checks = [
        '/map-app' => 'map-app',
        '/iris' => 'iris',
        '/carscan' => 'carscan',
        '/3Dobjscan' => '3Dobjscan',
        '/disable' => 'disable',
    ];
    foreach ($checks as $prefix => $name) {
        if ($path === $prefix || str_starts_with($path, $prefix . '/')) {
            return $name;
        }
    }
    return null;
}
