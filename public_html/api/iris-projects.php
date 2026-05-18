<?php
/**
 * Projects: GET list or detail, POST create, DELETE soft-delete.
 * Company users: strict project_members visibility.
 * Platform super_admin: global visibility across all companies.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-rbac.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$actor = platform_require_session_user();
$pdo = platform_pdo();
$caps = platform_user_capabilities($actor);
$isSuperAdmin = !empty($caps['super_admin']);
$companyId = platform_require_actor_company_id($actor);
$actorId = (int) $actor['id'];

if ($method === 'GET') {
    platform_require_capability($actor, 'can_access_projects');
    $detailId = (int) ($_GET['project_id'] ?? 0);
    if ($detailId > 0) {
        $project = platform_require_project_access($pdo, $actor, $detailId);
        $projectCompanyId = (int) ($project['company_id'] ?? 0);

        $stMembers = $pdo->prepare("SELECT u.id, u.name, u.surname, u.email, u.account_status, r.label AS role_label
            FROM project_members pm
            INNER JOIN users u ON u.id = pm.user_id AND u.deleted_at IS NULL
            LEFT JOIN roles r ON r.id = u.role_id
            WHERE pm.project_id = ?
            ORDER BY u.name, u.surname");
        $stMembers->execute([$detailId]);
        $members = [];
        foreach ($stMembers->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $members[] = [
                'id' => (int) $row['id'],
                'name' => platform_user_display_name($row),
                'email' => $row['email'],
                'account_status' => (string) ($row['account_status'] ?? ''),
                'role_label' => $row['role_label'],
            ];
        }

        $stPending = $pdo->prepare('SELECT u.id, u.name, u.surname, u.email, u.account_status, ppi.created_at
            FROM pending_project_invites ppi
            INNER JOIN users u ON u.id = ppi.user_id AND u.deleted_at IS NULL
            WHERE ppi.project_id = ? AND ppi.fulfilled_at IS NULL
            ORDER BY ppi.created_at DESC');
        $stPending->execute([$detailId]);
        $pendingInvites = [];
        foreach ($stPending->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $pendingInvites[] = [
                'id' => (int) $row['id'],
                'name' => platform_user_display_name($row),
                'email' => $row['email'],
                'account_status' => (string) ($row['account_status'] ?? ''),
                'invited_at' => (int) ($row['created_at'] ?? 0),
            ];
        }

        $enabledSt = $pdo->prepare('SELECT service_name FROM project_services WHERE project_id = ?');
        $enabledSt->execute([$detailId]);
        $enabledMap = [];
        foreach ($enabledSt->fetchAll(PDO::FETCH_COLUMN) as $name) {
            $enabledMap[(string) $name] = true;
        }
        $services = [];
        foreach (platform_project_workspace_services() as $svc) {
            $sn = (string) $svc['service_name'];
            $services[] = [
                'service_name' => $sn,
                'label' => $svc['label'],
                'enabled' => !empty($enabledMap[$sn]),
            ];
        }

        if ($isSuperAdmin) {
            $filesSt = $pdo->prepare('SELECT f.id, f.original_name, f.mime_type, f.byte_size, f.created_at
                FROM user_files f
                WHERE f.project_id = ? AND f.deleted_at IS NULL
                ORDER BY f.created_at DESC');
            $filesSt->execute([$detailId]);
        } else {
            $scope = platform_files_list_sql_for_user($actor);
            $filesSql = 'SELECT f.id, f.original_name, f.mime_type, f.byte_size, f.created_at
                FROM user_files f
                WHERE f.project_id = ? AND ' . $scope['where'] . '
                ORDER BY f.created_at DESC';
            $filesSt = $pdo->prepare($filesSql);
            $filesSt->execute(array_merge([$detailId], $scope['params']));
        }
        $files = [];
        foreach ($filesSt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $files[] = [
                'id' => (int) $row['id'],
                'original_name' => $row['original_name'],
                'mime_type' => $row['mime_type'],
                'byte_size' => (int) $row['byte_size'],
                'created_at' => (int) ($row['created_at'] ?? 0),
            ];
        }

        $companyName = null;
        if ($isSuperAdmin && $projectCompanyId > 0) {
            $coSt = $pdo->prepare('SELECT name FROM companies WHERE id = ? LIMIT 1');
            $coSt->execute([$projectCompanyId]);
            $companyName = $coSt->fetchColumn() ?: null;
        }

        echo json_encode([
            'ok' => true,
            'project' => [
                'id' => (int) $project['id'],
                'name' => $project['name'],
                'description' => $project['description'],
                'status' => $project['status'],
                'created_at' => (int) ($project['created_at'] ?? 0),
                'company_id' => $projectCompanyId,
                'company_name' => $companyName,
            ],
            'members' => $members,
            'pending_invites' => $pendingInvites,
            'services' => $services,
            'files' => $files,
        ]);
        exit;
    }

    if ($isSuperAdmin) {
        $st = $pdo->query("SELECT p.id, p.name, p.description, p.status, p.created_at, p.company_id,
                c.name AS company_name,
                (SELECT COUNT(*) FROM project_members pm2 WHERE pm2.project_id = p.id) AS member_count
                FROM projects p
                INNER JOIN companies c ON c.id = p.company_id AND c.deleted_at IS NULL
                WHERE p.deleted_at IS NULL
                ORDER BY c.name COLLATE NOCASE, p.name COLLATE NOCASE");
    } else {
        $st = $pdo->prepare("SELECT p.id, p.name, p.description, p.status, p.created_at, p.company_id,
                (SELECT COUNT(*) FROM project_members pm2 WHERE pm2.project_id = p.id) AS member_count
                FROM projects p
                INNER JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ?
                WHERE p.company_id = ? AND p.deleted_at IS NULL
                ORDER BY p.name COLLATE NOCASE");
        $st->execute([$actorId, $companyId]);
    }
    $projects = [];
    $rows = $isSuperAdmin ? $st->fetchAll(PDO::FETCH_ASSOC) : $st->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as $row) {
        $item = [
            'id' => (int) $row['id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'status' => $row['status'],
            'created_at' => (int) ($row['created_at'] ?? 0),
            'member_count' => (int) ($row['member_count'] ?? 0),
            'company_id' => (int) ($row['company_id'] ?? 0),
        ];
        if ($isSuperAdmin && isset($row['company_name'])) {
            $item['company_name'] = $row['company_name'];
        }
        $projects[] = $item;
    }
    echo json_encode(['ok' => true, 'projects' => $projects]);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    $body = [];
}

if ($method === 'POST') {
    platform_require_capability($actor, 'can_create_project');
    $name = trim((string) ($body['name'] ?? ''));
    $description = trim((string) ($body['description'] ?? ''));
    if ($name === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'name required']);
        exit;
    }
    $now = time();
    $ins = $pdo->prepare('INSERT INTO projects (company_id, name, description, status, created_at, updated_at)
        VALUES (?,?,?,?,?,?)');
    $ins->execute([
        $companyId,
        $name,
        $description !== '' ? $description : null,
        'active',
        $now,
        $now,
    ]);
    $projectId = (int) $pdo->lastInsertId();
    $pdo->prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, created_at) VALUES (?,?,?)')
        ->execute([$projectId, $actorId, $now]);
    platform_audit_log($pdo, $actorId, 'project_create', null, ['project_id' => $projectId]);

    echo json_encode([
        'ok' => true,
        'project' => [
            'id' => $projectId,
            'name' => $name,
            'description' => $description !== '' ? $description : null,
            'status' => 'active',
            'created_at' => $now,
            'member_count' => 1,
        ],
    ]);
    exit;
}

if ($method === 'DELETE') {
    platform_require_capability($actor, 'can_manage_project_roster');
    $projectId = (int) ($body['project_id'] ?? 0);
    if ($projectId < 1) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'project_id required']);
        exit;
    }
    $project = platform_require_project_access($pdo, $actor, $projectId);
    $projectCompanyId = (int) ($project['company_id'] ?? 0);
    $now = time();
    if ($isSuperAdmin) {
        $pdo->prepare('UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?')
            ->execute([$now, $now, $projectId]);
    } else {
        $pdo->prepare('UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ? AND company_id = ?')
            ->execute([$now, $now, $projectId, $projectCompanyId]);
    }
    platform_audit_log($pdo, $actorId, 'project_soft_delete', null, ['project_id' => $projectId]);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
