<?php
/**
 * GET: list own files. DELETE: soft-delete own file.
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
$uid = (int) $actor['id'];

if ($method === 'GET') {
    $st = $pdo->prepare('SELECT id, original_name, mime_type, byte_size, created_at
        FROM user_files WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC');
    $st->execute([$uid]);
    $files = [];
    foreach ($st->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $files[] = [
            'id' => (int) $row['id'],
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
    $st = $pdo->prepare('SELECT id FROM user_files WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1');
    $st->execute([$fileId, $uid]);
    if (!$st->fetchColumn()) {
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
