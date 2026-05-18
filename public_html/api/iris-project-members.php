<?php
/**
 * Project membership: GET list (with is_member), POST add, DELETE remove.
 * Actor must be a project member; roster changes require can_manage_project_roster.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-rbac.php';
require_once __DIR__ . '/platform-mail.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$actor = platform_require_session_user();
platform_require_capability($actor, 'can_access_projects');
$pdo = platform_pdo();
$companyId = platform_require_actor_company_id($actor);
$actorId = (int) $actor['id'];

if ($method === 'GET') {
    $projectId = (int) ($_GET['project_id'] ?? 0);
    if ($projectId < 1) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'project_id required']);
        exit;
    }
    $project = platform_require_project_access($pdo, $actor, $projectId);
    $projectCompanyId = (int) ($project['company_id'] ?? 0);
    $st = $pdo->prepare("SELECT u.id, u.name, u.surname, u.email, r.slug AS role_slug, r.label AS role_label,
            CASE WHEN pm.user_id IS NOT NULL THEN 1 ELSE 0 END AS is_member
            FROM users u
            LEFT JOIN roles r ON r.id = u.role_id
            LEFT JOIN project_members pm ON pm.project_id = ? AND pm.user_id = u.id
            WHERE u.deleted_at IS NULL AND (u.company_id = ? OR pm.user_id IS NOT NULL)
            ORDER BY u.name, u.surname");
    $st->execute([$projectId, $projectCompanyId]);
    $users = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $users[] = [
            'id' => (int) $row['id'],
            'name' => platform_user_display_name($row),
            'email' => $row['email'],
            'role_slug' => $row['role_slug'],
            'role_label' => $row['role_label'],
            'is_member' => !empty($row['is_member']),
        ];
    }
    $rolesSt = $pdo->query("SELECT id, slug, label FROM roles WHERE slug IN ('company_admin','company_manager','company_user') ORDER BY rank DESC");
    $roles = [];
    if ($rolesSt !== false) {
        foreach ($rolesSt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $roles[] = [
                'id' => (int) $r['id'],
                'slug' => $r['slug'],
                'label' => $r['label'],
            ];
        }
    }
    echo json_encode([
        'ok' => true,
        'project' => [
            'id' => (int) $project['id'],
            'name' => $project['name'],
        ],
        'users' => $users,
        'roles' => $roles,
    ]);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

$projectId = (int) ($body['project_id'] ?? 0);
$targetUserId = (int) ($body['user_id'] ?? 0);
if ($projectId < 1 || $targetUserId < 1) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'project_id and user_id required']);
    exit;
}

$project = platform_require_project_access($pdo, $actor, $projectId);
$projectCompanyId = (int) ($project['company_id'] ?? 0);

$target = platform_load_user_row($pdo, $targetUserId);
if (!$target) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'User not found']);
    exit;
}
$alreadyMember = platform_user_is_project_member($pdo, $targetUserId, $projectId);
$targetCompanyId = $target['company_id'] ?? null;
$targetCompanyInt = ($targetCompanyId !== null && $targetCompanyId !== '') ? (int) $targetCompanyId : null;
if (!$alreadyMember && ($targetCompanyInt === null || $targetCompanyInt !== $projectCompanyId)) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'User not found in this organization']);
    exit;
}

if ($method === 'POST' || $method === 'DELETE') {
    platform_require_capability($actor, 'can_manage_project_roster');
}

if ($method === 'POST') {
    $roleSlug = trim((string) ($body['role_slug'] ?? ''));
    $allowedRoles = ['company_admin', 'company_manager', 'company_user'];
    if ($roleSlug !== '' && in_array($roleSlug, $allowedRoles, true)) {
        platform_assign_user_rbac($pdo, $targetUserId, $projectCompanyId, $roleSlug);
    }
    $now = time();
    $check = $pdo->prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1');
    $check->execute([$projectId, $targetUserId]);
    $wasMember = (bool) $check->fetchColumn();
    $pdo->prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, created_at) VALUES (?,?,?)')
        ->execute([$projectId, $targetUserId, $now]);
    platform_audit_log($pdo, $actorId, 'project_member_add', $targetUserId, [
        'project_id' => $projectId,
        'role_slug' => $roleSlug !== '' ? $roleSlug : null,
    ]);
    $emailSent = false;
    if (!$wasMember && ($target['account_status'] ?? '') === 'active') {
        $inviterName = platform_user_display_name($actor);
        $mail = platform_send_project_added_email((string) $target['email'], (string) $project['name'], $inviterName);
        $emailSent = !empty($mail['ok']);
    }
    echo json_encode(['ok' => true, 'emailSent' => $emailSent]);
    exit;
}

if ($method === 'DELETE') {
    $pdo->prepare('DELETE FROM project_members WHERE project_id = ? AND user_id = ?')
        ->execute([$projectId, $targetUserId]);
    platform_audit_log($pdo, $actorId, 'project_member_remove', $targetUserId, ['project_id' => $projectId]);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
