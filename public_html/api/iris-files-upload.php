<?php
/**
 * POST multipart file field "file" — store under private root, metadata in user_files.
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

$upload = $_FILES['file'];
if (($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Upload failed']);
    exit;
}

$maxBytes = 50 * 1024 * 1024;
$size = (int) ($upload['size'] ?? 0);
if ($size < 1 || $size > $maxBytes) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'File must be between 1 byte and 50 MB']);
    exit;
}

$original = basename((string) ($upload['name'] ?? 'file'));
$original = preg_replace('/[^\w.\- ()]/u', '_', $original) ?: 'file';
$mime = (string) ($upload['type'] ?? 'application/octet-stream');

$root = platform_user_files_storage_root();
$userDir = $root . '/' . $uid;
if (!is_dir($userDir) && !@mkdir($userDir, 0750, true) && !is_dir($userDir)) {
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
$companyId = $actor['company_id'] ?? null;
$now = time();
$pdo = platform_pdo();
$ins = $pdo->prepare('INSERT INTO user_files (user_id, company_id, original_name, storage_path, mime_type, byte_size, sha256, created_at)
    VALUES (?,?,?,?,?,?,?,?)');
$ins->execute([
    $uid,
    $companyId !== null && $companyId !== '' ? (int) $companyId : null,
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
        'original_name' => $original,
        'byte_size' => $size,
        'created_at' => $now,
    ],
]);
