<?php
/**
 * CFD Sidecar Control API – Start/Stop/Status (local dev only)
 * Requires web server user to have Docker access (e.g. in docker group).
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, no-cache, must-revalidate');

$CFD_PORT = (int) (getenv('CFD_PORT') ?: 8090) ?: 8090;
$sidecarDir = realpath(__DIR__ . '/../../cfd-sidecar');
$action = $_GET['action'] ?? $_POST['action'] ?? '';

function jsonOut($data) {
  echo json_encode($data);
  exit;
}

function checkSidecarRunning($port) {
  $ctx = stream_context_create(['http' => ['timeout' => 2]]);
  $url = "http://127.0.0.1:{$port}/health";
  $r = @file_get_contents($url, false, $ctx);
  return $r !== false && strlen($r) > 0;
}

function stopSidecar($port) {
  $ctx = stream_context_create(['http' => ['timeout' => 2]]);
  $url = "http://127.0.0.1:{$port}/shutdown";
  @file_get_contents($url, false, $ctx);
}

if (!$sidecarDir || !is_dir($sidecarDir)) {
  http_response_code(500);
  jsonOut(['error' => 'cfd-sidecar directory not found']);
}

$nodeScript = $sidecarDir . '/server.js';
$runWithDocker = $sidecarDir . '/run-with-docker.sh';
if (!is_file($nodeScript)) {
  http_response_code(500);
  jsonOut(['error' => 'cfd-sidecar/server.js not found']);
}

switch ($action) {
  case 'status':
    $running = checkSidecarRunning($CFD_PORT);
    jsonOut(['running' => $running]);
    break;

  case 'start':
    if (checkSidecarRunning($CFD_PORT)) {
      jsonOut(['ok' => true, 'running' => true, 'message' => 'Already running']);
    }
    $logFile = '/tmp/cfd-sidecar.log';
    $nohup = trim((string) shell_exec('which nohup 2>/dev/null')) ?: '/usr/bin/nohup';
    $useRunWithDocker = is_executable($runWithDocker);
    $runCmd = $useRunWithDocker
      ? "cd " . escapeshellarg($sidecarDir) . " && ./run-with-docker.sh"
      : "cd " . escapeshellarg($sidecarDir) . " && CFD_USE_DOCKER=1 node server.js";
    if (function_exists('session_status') && session_status() === PHP_SESSION_ACTIVE) {
      session_write_close();
    }
    $cmd = $nohup . " sh -c " . escapeshellarg($runCmd) . " </dev/null >> " . escapeshellarg($logFile) . " 2>&1 &";
    exec($cmd);
    $maxWait = 30;
    $waited = 0;
    while ($waited < $maxWait) {
      sleep(1);
      $waited++;
      if (checkSidecarRunning($CFD_PORT)) {
        jsonOut(['ok' => true, 'running' => true]);
      }
    }
    $logTail = '';
    if (is_readable($logFile)) {
      $lines = @file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
      $logTail = $lines ? implode("\n", array_slice($lines, -15)) : '';
    }
    $err = 'Sidecar did not start within ' . $maxWait . 's.';
    if ($logTail) {
      $err .= ' Log: ' . preg_replace('/\s+/', ' ', trim($logTail));
    } else {
      $err .= ' Check /tmp/cfd-sidecar.log.';
    }
    $err .= ' Recommended: install as service: sudo cfd-sidecar/install-service.sh. Or run manually: cd cfd-sidecar && npm run start:docker';
    jsonOut(['ok' => false, 'running' => false, 'error' => $err]);
    break;

  case 'stop':
    if (!checkSidecarRunning($CFD_PORT)) {
      jsonOut(['ok' => true, 'running' => false, 'message' => 'Already stopped']);
    }
    stopSidecar($CFD_PORT);
    sleep(1);
    $running = checkSidecarRunning($CFD_PORT);
    jsonOut(['ok' => true, 'running' => $running]);
    break;

  default:
    http_response_code(400);
    jsonOut(['error' => 'Invalid action. Use ?action=status|start|stop']);
}
