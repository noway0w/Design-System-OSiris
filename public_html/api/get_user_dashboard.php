<?php
/**
 * GET: authenticated user + allowed service tiles for the dashboard bento.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-session.php';
require_once __DIR__ . '/platform-rbac.php';

$uid = platform_session_user_id();
if (!$uid) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
    exit;
}

$pdo = platform_pdo();
$user = platform_load_user_row($pdo, $uid);
if (!$user) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'User not found']);
    exit;
}

$allowed = platform_user_service_map($pdo, $uid);

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

$caps = platform_user_capabilities($user);
$navTabs = platform_nav_tabs_for_user($user);

echo json_encode([
    'ok' => true,
    'user' => [
        'id' => (int) $user['id'],
        'name' => $user['name'],
        'surname' => $user['surname'],
        'email' => $user['email'],
        'avatar_url' => $user['avatar_url'] ?? null,
        'display_name' => platform_user_display_name($user),
        'role' => [
            'slug' => $user['role_slug'] ?? null,
            'label' => $user['role_label'] ?? null,
        ],
        'company' => !empty($user['company_id']) ? [
            'id' => (int) $user['company_id'],
            'name' => $user['company_name'] ?? null,
        ] : null,
    ],
    'capabilities' => $caps,
    'nav_tabs' => $navTabs,
    'services' => $services,
]);
