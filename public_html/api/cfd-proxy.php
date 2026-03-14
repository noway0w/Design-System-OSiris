<?php
/**
 * CFD Sidecar Proxy – Forward requests to localhost:8090 (same-origin, avoids mixed content / Private Network Access).
 * Use when Corintis is served from HTTPS or a different host than the browser.
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, no-cache, must-revalidate');

$CFD_PORT = (int) (getenv('CFD_PORT') ?: 8090) ?: 8090;
$base = 'http://127.0.0.1:' . $CFD_PORT;
$path = isset($_GET['path']) ? $_GET['path'] : '';

if (!preg_match('#^/(health|run-cfd|streamlines/[a-zA-Z0-9_]+)$#', $path)) {
  http_response_code(400);
  echo json_encode(['error' => 'Invalid path. Use ?path=/health, /run-cfd, or /streamlines/case_xxx']);
  exit;
}

$url = $base . $path;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
  $ctx = stream_context_create(['http' => ['timeout' => 30]]);
  $r = @file_get_contents($url, false, $ctx);
  if ($r === false) {
    http_response_code(503);
    echo json_encode(['error' => 'CFD sidecar unreachable at ' . $base . '. Start it: sudo systemctl start cfd-sidecar (or cd cfd-sidecar && npm run start:docker)']);
    exit;
  }
  $h = isset($http_response_header) ? $http_response_header : [];
  foreach ($h as $line) {
    if (stripos($line, 'Content-Type:') === 0) {
      header($line);
      break;
    }
  }
  echo $r;
  exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && $path === '/run-cfd') {
  $post = $_POST ?? [];
  foreach ($_FILES ?? [] as $name => $file) {
    if (isset($file['error']) && $file['error'] === UPLOAD_ERR_OK && is_uploaded_file($file['tmp_name'])) {
      $post[$name] = new CURLFile($file['tmp_name'], $file['type'] ?? 'application/octet-stream', $file['name'] ?? 'geometry.stl');
    }
  }

  $ch = curl_init($url);
  curl_setopt($ch, CURLOPT_POST, true);
  curl_setopt($ch, CURLOPT_POSTFIELDS, $post);
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_TIMEOUT, 600);
  $r = curl_exec($ch);
  $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
  curl_close($ch);

  if ($r === false) {
    http_response_code(503);
    echo json_encode(['error' => 'CFD sidecar unreachable. Start it: sudo systemctl start cfd-sidecar (or cd cfd-sidecar && npm run start:docker)']);
    exit;
  }

  http_response_code($code >= 100 ? $code : 200);
  echo $r;
  exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
exit;
