<?php
// Simple bridge between the browser and the local OpenClaw agent.
// Expects a JSON POST body: { "message": string, "context": mixed }
// Returns: { "ok": bool, "reply"?: string, "error"?: string }

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Empty request body']);
    exit;
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON payload']);
    exit;
}

$message = isset($payload['message']) ? trim((string)$payload['message']) : '';
$context = isset($payload['context']) ? $payload['context'] : null;

if ($message === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Message is required']);
    exit;
}

// Build a simple combined prompt that includes lightweight CAD context.
$contextSnippet = '';
if ($context !== null) {
    $contextSnippet = "\n\n[CAD context]\n" . json_encode($context, JSON_PRETTY_PRINT);
}

$prompt = $message . $contextSnippet;

// Call the local OpenClaw agent.
// IMPORTANT: force HOME to /var/lib/nginx so the php-fpm/nginx user
// uses its own OpenClaw config and workspace under /var/lib/nginx.
$cmd = 'HOME=/var/lib/nginx /home/OSiris/.npm-global/bin/openclaw agent --agent main --local -m ' . escapeshellarg($prompt);

$descriptorSpec = [
    1 => ['pipe', 'w'], // stdout
    2 => ['pipe', 'w'], // stderr
];

$process = proc_open($cmd, $descriptorSpec, $pipes);

if (!is_resource($process)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Failed to start OpenClaw process']);
    exit;
}

// Read output with a basic timeout to avoid hanging PHP workers indefinitely.
stream_set_blocking($pipes[1], true);
stream_set_blocking($pipes[2], true);

$stdout = stream_get_contents($pipes[1]);
$stderr = stream_get_contents($pipes[2]);

fclose($pipes[1]);
fclose($pipes[2]);

$exitCode = proc_close($process);

if ($exitCode !== 0) {
    http_response_code(500);
    $msg = $stderr !== '' ? $stderr : 'OpenClaw exited with code ' . $exitCode;
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

// For now, return the raw stdout as the reply.
$reply = trim($stdout);

echo json_encode([
    'ok' => true,
    'reply' => $reply,
]);

