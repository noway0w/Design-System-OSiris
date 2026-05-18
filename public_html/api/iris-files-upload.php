<?php
/**
 * POST multipart file field "file" — store under private root, metadata in user_files.
 * Requires project_id and an allowed file extension.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST only']);
    exit;
}

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-rbac.php';

$actor = platform_require_session_user();
platform_require_capability($actor, 'can_import_files');
$uid = (int) $actor['id'];

if (empty($_FILES['file']) || !is_array($_FILES['file'])) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'file required']);
    exit;
}

$projectIdRaw = $_POST['project_id'] ?? null;
if ($projectIdRaw === null || $projectIdRaw === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'project_id required']);
    exit;
}
$projectId = (int) $projectIdRaw;
if ($projectId < 1) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid project_id']);
    exit;
}

$upload = $_FILES['file'];
if (($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Upload failed']);
    exit;
}

$original = basename((string) ($upload['name'] ?? 'file'));
$original = preg_replace('/[^\w.\- ()]/u', '_', $original) ?: 'file';
if (!platform_validate_upload_extension($original)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'File type not allowed']);
    exit;
}

$maxBytes = 50 * 1024 * 1024;
$size = (int) ($upload['size'] ?? 0);
if ($size < 1 || $size > $maxBytes) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'File must be between 1 byte and 50 MB']);
    exit;
}

$pdo = platform_pdo();
if (!platform_user_can_write_file($pdo, $actor, $projectId)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

$project = platform_load_project_row($pdo, $projectId);
if ($project === null) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Project not found']);
    exit;
}
$companyId = (int) $project['company_id'];

$mime = (string) ($upload['type'] ?? 'application/octet-stream');
$storage = platform_ensure_user_files_storage_ready();
if (!$storage['ok']) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Storage unavailable']);
    exit;
}
$root = $storage['root'];
$userDir = $root . '/' . $uid;
if (!is_dir($userDir) && !@mkdir($userDir, 0775, true) && !is_dir($userDir)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Storage unavailable']);
    exit;
}

$token = bin2hex(random_bytes(16));
$rel = $uid . '/' . $token . '_' . $original;
$abs = $root . '/' . $rel;
if (!move_uploaded_file((string) $upload['tmp_name'], $abs)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not save file']);
    exit;
}

$sha = hash_file('sha256', $abs) ?: null;
$now = time();
$ins = $pdo->prepare('INSERT INTO user_files (user_id, company_id, project_id, original_name, storage_path, mime_type, byte_size, sha256, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)');
$ins->execute([
    $uid,
    $companyId,
    $projectId,
    $original,
    $rel,
    $mime,
    $size,
    $sha,
    $now,
]);

echo json_encode([
    'ok' => true,
    'file' => [
        'id' => (int) $pdo->lastInsertId(),
        'project_id' => $projectId,
        'original_name' => $original,
        'byte_size' => $size,
        'created_at' => $now,
    ],
]);
