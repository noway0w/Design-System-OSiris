<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { exit(0); }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'POST only']);
    exit;
}
$name = trim($_POST['name'] ?? '');
if ($name === '') {
    http_response_code(400);
    echo json_encode(['error' => 'name required']);
    exit;
}
if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['error' => 'No file uploaded or upload error']);
    exit;
}
$file = $_FILES['file'];
$allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);
if (!in_array($mime, $allowed, true)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid file type. Use JPEG, PNG, GIF or WebP.']);
    exit;
}
if ($file['size'] > 5 * 1024 * 1024) {
    http_response_code(400);
    echo json_encode(['error' => 'File too large. Max 5 MB.']);
    exit;
}
$uploadDir = dirname(__DIR__) . '/uploads/profile-pictures';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}
$safeName = preg_replace('/[^a-zA-Z0-9_-]/', '_', $name);
$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)) ?: 'png';
if (!in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'], true)) { $ext = 'png'; }
$filename = $safeName . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
$path = $uploadDir . '/' . $filename;
if (!move_uploaded_file($file['tmp_name'], $path)) {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save file']);
    exit;
}
echo json_encode(['ok' => true, 'path' => 'uploads/profile-pictures/' . $filename]);
