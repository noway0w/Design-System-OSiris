<?php
/**
 * GET: authenticated user + allowed service tiles for the dashboard bento.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-session.php';

$uid = platform_session_user_id();
if (!$uid) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
    exit;
}

$pdo = platform_pdo();
$st = $pdo->prepare('SELECT id, name, surname, email, avatar_url FROM users WHERE id = ? LIMIT 1');
$st->execute([$uid]);
$user = $st->fetch(PDO::FETCH_ASSOC);
if (!$user) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'User not found']);
    exit;
}

$svc = $pdo->prepare('SELECT service_name FROM service_permissions WHERE user_id = ?');
$svc->execute([$uid]);
$allowed = [];
foreach ($svc->fetchAll(PDO::FETCH_COLUMN) as $name) {
    $allowed[(string) $name] = true;
}

$catalog = [
    [
        'service_name' => 'map-app',
        'title' => 'Map',
        'subtitle' => 'Live tracking dashboard',
        'url' => '/map-app/',
        'icon' => 'map',
        'accent' => 'from-sky-500/20 to-blue-600/10',
    ],
    [
        'service_name' => 'iris',
        'title' => 'OSiris',
        'subtitle' => 'Face and video',
        'url' => '/iris/',
        'icon' => 'face',
        'accent' => 'from-violet-500/20 to-purple-600/10',
    ],
    [
        'service_name' => 'carscan',
        'title' => 'CarScan',
        'subtitle' => 'SpeedVision capture',
        'url' => '/carscan/',
        'icon' => 'directions_car',
        'accent' => 'from-emerald-500/20 to-teal-600/10',
    ],
    [
        'service_name' => '3Dobjscan',
        'title' => 'Modly',
        'subtitle' => '3D mesh generation',
        'url' => '/3Dobjscan/',
        'icon' => 'view_in_ar',
        'accent' => 'from-amber-500/20 to-orange-600/10',
    ],
    [
        'service_name' => 'disable',
        'title' => 'CAD Explorer',
        'subtitle' => '3D CAD viewer',
        'url' => '/disable/',
        'icon' => 'architecture',
        'accent' => 'from-slate-500/20 to-slate-700/10',
    ],
];

$services = [];
foreach ($catalog as $c) {
    if (!empty($allowed[$c['service_name']])) {
        $services[] = $c;
    }
}

echo json_encode([
    'ok' => true,
    'user' => [
        'id' => (int) $user['id'],
        'name' => $user['name'],
        'surname' => $user['surname'],
        'email' => $user['email'],
        'avatar_url' => $user['avatar_url'],
    ],
    'services' => $services,
]);
