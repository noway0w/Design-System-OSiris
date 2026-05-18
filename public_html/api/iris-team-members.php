<?php
/**
 * Team: list company members / update member role.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-rbac.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$actor = platform_require_session_user();
platform_require_capability($actor, 'can_manage_team');
$pdo = platform_pdo();
$companyId = $actor['company_id'] ?? null;
if ($companyId === null || $companyId === '') {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'No company assigned']);
    exit;
}
$companyId = (int) $companyId;

if ($method === 'GET') {
    $st = $pdo->prepare("SELECT u.id, u.name, u.surname, u.email, u.account_status, u.role_id,
            r.slug AS role_slug, r.label AS role_label
            FROM users u
            LEFT JOIN roles r ON r.id = u.role_id
            WHERE u.company_id = ? AND u.deleted_at IS NULL
            ORDER BY u.name, u.surname");
    $st->execute([$companyId]);
    $members = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $uid = (int) $row['id'];
        $perms = platform_user_service_map($pdo, $uid);
        $services = [];
        foreach (platform_service_catalog() as $svc) {
            $name = $svc['service_name'];
            $services[] = [
                'service_name' => $name,
                'label' => $svc['label'],
                'enabled' => !empty($perms[$name]),
            ];
        }
        $members[] = [
            'id' => $uid,
            'name' => platform_user_display_name($row),
            'email' => $row['email'],
            'account_status' => $row['account_status'],
            'role_id' => $row['role_id'] !== null ? (int) $row['role_id'] : null,
            'role_slug' => $row['role_slug'],
            'role_label' => $row['role_label'],
            'services' => $services,
        ];
    }
    $roles = $pdo->query("SELECT id, slug, label, rank FROM roles WHERE scope = 'company' ORDER BY rank DESC")
        ->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['ok' => true, 'members' => $members, 'roles' => $roles]);
    exit;
}

if ($method !== 'PATCH') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
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
$roleId = (int) ($body['role_id'] ?? 0);
if ($targetId < 1 || $roleId < 1) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'user_id and role_id required']);
    exit;
}

$target = platform_load_user_row($pdo, $targetId);
if (!$target || (int) ($target['company_id'] ?? 0) !== $companyId) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'User not found']);
    exit;
}

$rSt = $pdo->prepare("SELECT slug FROM roles WHERE id = ? AND scope = 'company' LIMIT 1");
$rSt->execute([$roleId]);
$slug = $rSt->fetchColumn();
if ($slug === false) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid company role']);
    exit;
}
if ($slug === 'company_owner' && (string) ($actor['role_slug'] ?? '') !== 'company_owner') {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Only owners can assign the Owner role']);
    exit;
}

$now = time();
$pdo->prepare('UPDATE users SET role_id = ?, updated_at = ? WHERE id = ?')->execute([$roleId, $now, $targetId]);
platform_audit_log($pdo, (int) $actor['id'], 'team_role_update', $targetId, ['role_id' => $roleId]);
echo json_encode(['ok' => true]);
