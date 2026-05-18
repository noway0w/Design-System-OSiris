<?php
/**
 * Team: list company members, update role, remove / reactivate / purge users.
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
$companyId = platform_require_actor_company_id($actor);
$actorId = (int) $actor['id'];
$caps = platform_user_capabilities($actor);
$isSuperAdmin = !empty($caps['super_admin']);
$canRemoveUsers = !empty($caps['can_delete_team_users']);
$canPurgeUsers = !empty($caps['can_purge_team_users']);

if ($method === 'GET') {
    $includeDeleted = $canPurgeUsers && (string) ($_GET['include_deleted'] ?? '') === '1';
    $sql = "SELECT u.id, u.name, u.surname, u.email, u.account_status, u.role_id, u.deleted_at,
            r.slug AS role_slug, r.label AS role_label
            FROM users u
            LEFT JOIN roles r ON r.id = u.role_id
            WHERE u.company_id = ?";
    if (!$includeDeleted) {
        $sql .= ' AND u.deleted_at IS NULL';
    }
    $sql .= ' ORDER BY u.deleted_at IS NOT NULL, u.name, u.surname';
    $st = $pdo->prepare($sql);
    $st->execute([$companyId]);
    $members = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $uid = (int) $row['id'];
        $isDeleted = !empty($row['deleted_at']) || ($row['account_status'] ?? '') === 'deleted';
        $blockReason = platform_team_remove_blocked_reason($actor, $row);
        $perms = $isDeleted ? [] : platform_user_service_map($pdo, $uid);
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
            'is_deleted' => $isDeleted,
            'can_remove' => $canRemoveUsers && !$isDeleted && $blockReason === null && !$canPurgeUsers,
            'can_reactivate' => $canPurgeUsers && $isDeleted && $blockReason === null,
            'can_purge' => $canPurgeUsers && $blockReason === null,
        ];
    }
    $roles = $pdo->query("SELECT id, slug, label, rank FROM roles WHERE scope = 'company' ORDER BY rank DESC")
        ->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode([
        'ok' => true,
        'members' => $members,
        'roles' => $roles,
        'can_manage_deleted' => $canPurgeUsers,
        'can_remove_users' => $canRemoveUsers,
        'can_purge_users' => $canPurgeUsers,
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

$targetId = (int) ($body['user_id'] ?? 0);
if ($targetId < 1) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'user_id required']);
    exit;
}

$target = platform_load_user_row($pdo, $targetId, true);
if (!$target || (int) ($target['company_id'] ?? 0) !== $companyId) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'User not found']);
    exit;
}

$blockReason = platform_team_remove_blocked_reason($actor, $target);
if ($blockReason !== null) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => $blockReason]);
    exit;
}

if ($method === 'DELETE') {
    $permanent = !empty($body['permanent']);
    if ($permanent) {
        if (!$canPurgeUsers) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'error' => 'Forbidden']);
            exit;
        }
        $wasActive = empty($target['deleted_at']) && ($target['account_status'] ?? '') !== 'deleted';
        if ($wasActive) {
            platform_soft_delete_user($pdo, $targetId);
        }
        platform_hard_delete_user($pdo, $targetId);
        platform_audit_log($pdo, $actorId, 'team_user_purge', $targetId, $wasActive ? ['was_active' => true] : null);
        echo json_encode(['ok' => true, 'message' => 'User permanently deleted.']);
        exit;
    }
    if (!$canRemoveUsers) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Forbidden']);
        exit;
    }
    if (!empty($target['deleted_at']) || ($target['account_status'] ?? '') === 'deleted') {
        echo json_encode(['ok' => true, 'message' => 'User already removed']);
        exit;
    }
    platform_soft_delete_user($pdo, $targetId);
    platform_audit_log($pdo, $actorId, 'team_user_soft_delete', $targetId);
    echo json_encode(['ok' => true, 'message' => 'User removed from the team.']);
    exit;
}

if ($method === 'POST') {
    $action = trim((string) ($body['action'] ?? ''));
    if ($action === 'reactivate') {
        if (!$canPurgeUsers) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'error' => 'Forbidden']);
            exit;
        }
        if (empty($target['deleted_at']) && ($target['account_status'] ?? '') !== 'deleted') {
            echo json_encode(['ok' => true, 'message' => 'User is already active']);
            exit;
        }
        platform_reactivate_user($pdo, $targetId);
        platform_grant_default_permissions($pdo, $targetId);
        platform_audit_log($pdo, $actorId, 'team_user_reactivate', $targetId);
        echo json_encode(['ok' => true, 'message' => 'User reactivated.']);
        exit;
    }
    if ($action === 'purge') {
        if (!$canPurgeUsers) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'error' => 'Forbidden']);
            exit;
        }
        $wasActive = empty($target['deleted_at']) && ($target['account_status'] ?? '') !== 'deleted';
        if ($wasActive) {
            platform_soft_delete_user($pdo, $targetId);
        }
        platform_hard_delete_user($pdo, $targetId);
        platform_audit_log($pdo, $actorId, 'team_user_purge', $targetId, $wasActive ? ['was_active' => true] : null);
        echo json_encode(['ok' => true, 'message' => 'User permanently deleted.']);
        exit;
    }
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Unknown action']);
    exit;
}

if ($method !== 'PATCH') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$roleId = (int) ($body['role_id'] ?? 0);
if ($roleId < 1) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'role_id required']);
    exit;
}

if (!empty($target['deleted_at']) || ($target['account_status'] ?? '') === 'deleted') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Reactivate this user before changing their role']);
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
platform_audit_log($pdo, $actorId, 'team_role_update', $targetId, ['role_id' => $roleId]);
echo json_encode(['ok' => true]);
