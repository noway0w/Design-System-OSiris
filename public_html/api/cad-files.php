<?php
/**
 * OSiris CAD Files API – store and delete CAD files on server
 * GET: list files | POST: upload file | DELETE: remove file by id
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$storageDir = __DIR__ . '/cad-storage';
$manifestFile = $storageDir . '/manifest.json';

function ensureStorage() {
    global $storageDir;
    if (!is_dir($storageDir)) {
        mkdir($storageDir, 0755, true);
    }
}

function loadManifest() {
    global $manifestFile;
    if (!file_exists($manifestFile)) {
        return ['files' => []];
    }
    $raw = file_get_contents($manifestFile);
    $data = json_decode($raw, true);
    return is_array($data) ? $data : ['files' => []];
}

function saveManifest($data) {
    global $manifestFile;
    ensureStorage();
    file_put_contents($manifestFile, json_encode($data, JSON_PRETTY_PRINT));
}

// GET – list files
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $data = loadManifest();
    $list = [];
    foreach ($data['files'] ?? [] as $id => $meta) {
        $list[] = [
            'id' => $id,
            'name' => $meta['name'] ?? '',
            'format' => $meta['format'] ?? 'iges',
            'createdAt' => $meta['createdAt'] ?? 0
        ];
    }
    echo json_encode(['files' => $list]);
    exit;
}

// DELETE – remove file by id
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $id = $_GET['id'] ?? null;
    if (empty($id)) {
        $input = json_decode(file_get_contents('php://input'), true) ?: [];
        $id = $input['id'] ?? null;
    }
    if (empty($id)) {
        http_response_code(400);
        echo json_encode(['error' => 'id required']);
        exit;
    }
    $id = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $id);
    $data = loadManifest();
    if (!isset($data['files'][$id])) {
        http_response_code(404);
        echo json_encode(['error' => 'File not found']);
        exit;
    }
    $filename = $data['files'][$id]['filename'] ?? $id;
    $path = $storageDir . '/' . basename($filename);
    if (file_exists($path)) {
        unlink($path);
    }
    unset($data['files'][$id]);
    saveManifest($data);
    echo json_encode(['ok' => true]);
    exit;
}

// POST – upload file
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $id = $_POST['id'] ?? null;
    $name = $_POST['name'] ?? 'file';
    $format = $_POST['format'] ?? 'iges';
    if (empty($id)) {
        $id = (string) (time() . rand(100, 999));
    }
    $id = preg_replace('/[^a-zA-Z0-9_-]/', '', (string) $id);
    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['error' => 'No file uploaded']);
        exit;
    }
    ensureStorage();
    $ext = pathinfo($name, PATHINFO_EXTENSION) ?: 'bin';
    $filename = $id . '.' . $ext;
    $path = $storageDir . '/' . $filename;
    if (!move_uploaded_file($_FILES['file']['tmp_name'], $path)) {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to save file']);
        exit;
    }
    $data = loadManifest();
    $data['files'][$id] = [
        'name' => $name,
        'format' => $format,
        'filename' => $filename,
        'createdAt' => time()
    ];
    saveManifest($data);
    echo json_encode(['ok' => true, 'id' => $id]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
