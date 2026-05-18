<?php
/**
 * GET: JSON list of user_files grouped by project — only projects with CAD Explorer enabled
 * (project_services.service_name = 'disable') and files with CAD-viewer extensions.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-rbac.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'GET only']);
    exit;
}

$actor = platform_require_session_user();
platform_require_capability($actor, 'can_import_files');
$uid = (int) $actor['id'];
$pdo = platform_pdo();

$perm = $pdo->prepare('SELECT 1 FROM service_permissions WHERE user_id = ? AND service_name = ? LIMIT 1');
$perm->execute([$uid, 'disable']);
if (!$perm->fetchColumn()) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'CAD Explorer access not enabled for your account']);
    exit;
}

$oversight = platform_user_has_global_project_oversight($actor);

$sql = 'SELECT f.id, f.original_name, f.byte_size, f.created_at, f.project_id, p.name AS project_name
    FROM user_files f
    INNER JOIN projects p ON p.id = f.project_id AND p.deleted_at IS NULL
    INNER JOIN project_services ps ON ps.project_id = f.project_id AND ps.service_name = ?
    WHERE f.deleted_at IS NULL AND f.project_id IS NOT NULL';
$params = ['disable'];

if (!$oversight) {
    $sql .= ' AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = f.project_id AND pm.user_id = ?)';
    $params[] = $uid;
}

$companyId = platform_actor_company_id($actor);
if ($companyId !== null && $companyId > 0) {
    $sql .= ' AND (f.company_id IS NULL OR f.company_id = ?)';
    $params[] = $companyId;
}

$sql .= ' ORDER BY p.name COLLATE NOCASE ASC, f.created_at DESC';

$st = $pdo->prepare($sql);
$st->execute($params);

$map = [];
foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
    $name = (string) ($row['original_name'] ?? '');
    if ($name === '' || !platform_is_cad_explorer_upload_filename($name)) {
        continue;
    }
    $pid = (int) $row['project_id'];
    if (!isset($map[$pid])) {
        $map[$pid] = [
            'project_id' => $pid,
            'project_name' => (string) ($row['project_name'] ?? ''),
            'files' => [],
        ];
    }
    $map[$pid]['files'][] = [
        'id' => (int) $row['id'],
        'original_name' => $name,
        'byte_size' => (int) ($row['byte_size'] ?? 0),
        'created_at' => (int) ($row['created_at'] ?? 0),
    ];
}

$projects = array_values($map);
usort($projects, static function (array $a, array $b): int {
    return strcasecmp((string) ($a['project_name'] ?? ''), (string) ($b['project_name'] ?? ''));
});

foreach ($projects as &$pr) {
    usort($pr['files'], static function (array $a, array $b): int {
        return ($b['created_at'] ?? 0) <=> ($a['created_at'] ?? 0);
    });
}
unset($pr);

echo json_encode(['ok' => true, 'projects' => $projects], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
