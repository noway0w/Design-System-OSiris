<?php
/**
 * GET ?id= — stream file when owned by session user.
 */
declare(strict_types=1);

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-rbac.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'GET only']);
    exit;
}

$actor = platform_require_session_user();
platform_require_capability($actor, 'can_import_files');
$uid = (int) $actor['id'];
$fileId = (int) ($_GET['id'] ?? 0);
if ($fileId < 1) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'id required']);
    exit;
}

$pdo = platform_pdo();
$st = $pdo->prepare('SELECT original_name, storage_path, mime_type FROM user_files
    WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1');
$st->execute([$fileId, $uid]);
$row = $st->fetch(PDO::FETCH_ASSOC);
if (!$row) {
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'File not found']);
    exit;
}

$root = platform_user_files_storage_root();
$abs = $root . '/' . ltrim((string) $row['storage_path'], '/');
$realRoot = realpath($root);
$realFile = realpath($abs);
if ($realRoot === false || $realFile === false || !str_starts_with($realFile, $realRoot . DIRECTORY_SEPARATOR)) {
    http_response_code(404);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'File not found']);
    exit;
}

$mime = (string) ($row['mime_type'] ?: 'application/octet-stream');
$name = (string) $row['original_name'];
header('Content-Type: ' . $mime);
header('Content-Disposition: attachment; filename="' . str_replace('"', '', $name) . '"');
header('Content-Length: ' . (string) filesize($realFile));
header('Cache-Control: no-store');
readfile($realFile);
exit;
