<?php
/**
 * GET: list accessible files. DELETE: soft-delete when permitted.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-rbac.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$actor = platform_require_session_user();
platform_require_capability($actor, 'can_import_files');
$pdo = platform_pdo();

if ($method === 'GET') {
    $scope = platform_files_list_sql_for_user($actor);
    $sql = 'SELECT f.id, f.user_id, f.project_id, f.original_name, f.mime_type, f.byte_size, f.created_at
        FROM user_files f WHERE ' . $scope['where'] . ' ORDER BY f.created_at DESC';
    $st = $pdo->prepare($sql);
    $st->execute($scope['params']);
    $files = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $files[] = [
            'id' => (int) $row['id'],
            'user_id' => (int) $row['user_id'],
            'project_id' => $row['project_id'] !== null ? (int) $row['project_id'] : null,
            'original_name' => $row['original_name'],
            'mime_type' => $row['mime_type'],
            'byte_size' => (int) $row['byte_size'],
            'created_at' => (int) $row['created_at'],
        ];
    }
    echo json_encode(['ok' => true, 'files' => $files]);
    exit;
}

if ($method === 'DELETE') {
    $raw = file_get_contents('php://input') ?: '';
    $body = json_decode($raw, true);
    $fileId = is_array($body) ? (int) ($body['id'] ?? 0) : (int) ($_GET['id'] ?? 0);
    if ($fileId < 1) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'id required']);
        exit;
    }
    $st = $pdo->prepare('SELECT id, user_id, company_id, project_id, deleted_at FROM user_files WHERE id = ? LIMIT 1');
    $st->execute([$fileId]);
    $fileRow = $st->fetch(PDO::FETCH_ASSOC);
    if (!$fileRow || !platform_user_can_read_file($pdo, $actor, $fileRow)) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'File not found']);
        exit;
    }
    $now = time();
    $pdo->prepare('UPDATE user_files SET deleted_at = ? WHERE id = ?')->execute([$now, $fileId]);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
