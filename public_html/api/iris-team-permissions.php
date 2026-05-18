<?php
/**
 * PATCH { user_id, service_name, enabled } — toggle service_permissions for company member.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'PATCH') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'PATCH only']);
    exit;
}

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-rbac.php';

$actor = platform_require_session_user();
platform_require_capability($actor, 'can_manage_team');
$pdo = platform_pdo();
$companyId = (int) ($actor['company_id'] ?? 0);
if ($companyId < 1) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'No company assigned']);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

$targetId = (int) ($body['user_id'] ?? 0);
$service = trim((string) ($body['service_name'] ?? ''));
$enabled = !empty($body['enabled']);

$allowedNames = array_column(platform_service_catalog(), 'service_name');
if ($targetId < 1 || $service === '' || !in_array($service, $allowedNames, true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid request']);
    exit;
}

$target = platform_load_user_row($pdo, $targetId);
if (!$target || (int) ($target['company_id'] ?? 0) !== $companyId) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'User not found']);
    exit;
}

if ($enabled) {
    $pdo->prepare('INSERT OR IGNORE INTO service_permissions (user_id, service_name) VALUES (?,?)')
        ->execute([$targetId, $service]);
} else {
    $pdo->prepare('DELETE FROM service_permissions WHERE user_id = ? AND service_name = ?')
        ->execute([$targetId, $service]);
}

platform_audit_log($pdo, (int) $actor['id'], 'team_permission_toggle', $targetId, [
    'service_name' => $service,
    'enabled' => $enabled,
]);

echo json_encode(['ok' => true]);
