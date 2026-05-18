<?php
/**
 * Super Admin: list / update / soft-delete users.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-rbac.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$actor = platform_require_session_user();
platform_require_capability($actor, 'super_admin');
$pdo = platform_pdo();

if ($method === 'GET') {
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $limit = min(100, max(10, (int) ($_GET['limit'] ?? 25)));
    $offset = ($page - 1) * $limit;
    $q = trim((string) ($_GET['q'] ?? ''));

    $where = 'u.deleted_at IS NULL';
    $params = [];
    if ($q !== '') {
        $where .= ' AND (u.email LIKE ? OR u.name LIKE ? OR u.surname LIKE ?)';
        $like = '%' . $q . '%';
        $params = [$like, $like, $like];
    }
    $countSt = $pdo->prepare("SELECT COUNT(*) FROM users u WHERE {$where}");
    $countSt->execute($params);
    $total = (int) $countSt->fetchColumn();

    $sql = "SELECT u.id, u.name, u.surname, u.email, u.account_status, u.company_id, u.role_id,
            u.sso_provider_id, u.created_at, r.slug AS role_slug, r.label AS role_label,
            c.name AS company_name
            FROM users u
            LEFT JOIN roles r ON r.id = u.role_id
            LEFT JOIN companies c ON c.id = u.company_id
            WHERE {$where}
            ORDER BY u.id DESC LIMIT ? OFFSET ?";
    $st = $pdo->prepare($sql);
    $i = 1;
    foreach ($params as $p) {
        $st->bindValue($i++, $p);
    }
    $st->bindValue($i++, $limit, PDO::PARAM_INT);
    $st->bindValue($i, $offset, PDO::PARAM_INT);
    $st->execute();
    $users = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $users[] = [
            'id' => (int) $row['id'],
            'name' => platform_user_display_name($row),
            'email' => $row['email'],
            'account_status' => $row['account_status'],
            'company_id' => $row['company_id'] !== null ? (int) $row['company_id'] : null,
            'company_name' => $row['company_name'],
            'role_id' => $row['role_id'] !== null ? (int) $row['role_id'] : null,
            'role_slug' => $row['role_slug'],
            'role_label' => $row['role_label'],
            'auth_provider' => platform_user_auth_provider_label($row),
            'created_at' => (int) ($row['created_at'] ?? 0),
        ];
    }

    $roles = $pdo->query('SELECT id, slug, scope, label, rank FROM roles ORDER BY rank DESC')->fetchAll(PDO::FETCH_ASSOC);
    $companies = $pdo->query('SELECT id, name, slug FROM companies WHERE deleted_at IS NULL ORDER BY name')->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'ok' => true,
        'users' => $users,
        'roles' => $roles,
        'companies' => $companies,
        'page' => $page,
        'limit' => $limit,
        'total' => $total,
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

$target = platform_load_user_row($pdo, $targetId);
if (!$target) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'User not found']);
    exit;
}

if ($method === 'DELETE') {
    if ($targetId === (int) $actor['id']) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Cannot delete your own account']);
        exit;
    }
    platform_soft_delete_user($pdo, $targetId);
    platform_audit_log($pdo, (int) $actor['id'], 'user_soft_delete', $targetId);
    echo json_encode(['ok' => true]);
    exit;
}

if ($method === 'PATCH') {
    $roleId = isset($body['role_id']) ? (int) $body['role_id'] : null;
    $companyId = array_key_exists('company_id', $body)
        ? ($body['company_id'] === null ? null : (int) $body['company_id'])
        : null;

    if ($roleId !== null) {
        $rSt = $pdo->prepare('SELECT slug, scope FROM roles WHERE id = ? LIMIT 1');
        $rSt->execute([$roleId]);
        $role = $rSt->fetch(PDO::FETCH_ASSOC);
        if (!$role) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'Invalid role']);
            exit;
        }
        if ($role['slug'] === 'super_admin' && !platform_is_owner_email((string) $target['email'])) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'error' => 'Super Admin can only be assigned via promote endpoint for owner emails']);
            exit;
        }
        if ($role['scope'] === 'platform') {
            $companyId = null;
        } elseif ($companyId === null) {
            $companyId = $target['company_id'] !== null ? (int) $target['company_id'] : platform_default_company_id($pdo);
        }
        $now = time();
        $pdo->prepare('UPDATE users SET role_id = ?, company_id = ?, updated_at = ? WHERE id = ?')
            ->execute([$roleId, $companyId, $now, $targetId]);
    } elseif ($companyId !== null) {
        $now = time();
        $pdo->prepare('UPDATE users SET company_id = ?, updated_at = ? WHERE id = ?')
            ->execute([$companyId, $now, $targetId]);
    }

    platform_audit_log($pdo, (int) $actor['id'], 'user_update', $targetId, [
        'role_id' => $roleId,
        'company_id' => $companyId,
    ]);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
