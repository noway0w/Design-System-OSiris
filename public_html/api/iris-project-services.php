<?php
/**
 * Project allowed services: PATCH toggle service_name for a project.
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
platform_require_capability($actor, 'can_manage_project_services');
$pdo = platform_pdo();
$companyId = platform_require_actor_company_id($actor);
$actorId = (int) $actor['id'];

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

$projectId = (int) ($body['project_id'] ?? 0);
$serviceName = trim((string) ($body['service_name'] ?? ''));
$enabled = !empty($body['enabled']);

if ($projectId < 1 || $serviceName === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'project_id and service_name required']);
    exit;
}

$allowed = array_column(platform_project_workspace_services(), 'service_name');
if (!in_array($serviceName, $allowed, true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid service_name']);
    exit;
}

platform_require_project_access($pdo, $actor, $projectId);

if ($enabled) {
    $now = time();
    $pdo->prepare('INSERT OR IGNORE INTO project_services (project_id, service_name, created_at) VALUES (?,?,?)')
        ->execute([$projectId, $serviceName, $now]);
} else {
    $pdo->prepare('DELETE FROM project_services WHERE project_id = ? AND service_name = ?')
        ->execute([$projectId, $serviceName]);
}

platform_audit_log($pdo, $actorId, 'project_service_toggle', null, [
    'project_id' => $projectId,
    'service_name' => $serviceName,
    'enabled' => $enabled,
]);

echo json_encode(['ok' => true]);
