<?php
// Simple bridge between the browser and the local Ollama model (no tools).
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

// Call the local Ollama HTTP API directly (no tools).
// Requires Ollama running on 127.0.0.1:11434 and the model pulled (e.g. phi3:mini).
$ollamaUrl = 'http://127.0.0.1:11434/v1/chat/completions';
$model = 'qwen2.5:0.5b'; // smallest available Ollama model on this VPS

$body = [
    'model' => $model,
    'messages' => [
        [
            'role' => 'user',
            'content' => $prompt,
        ],
    ],
    'stream' => false,
];

$ch = curl_init($ollamaUrl);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));

$response = curl_exec($ch);
$curlErrNo = curl_errno($ch);
$curlErr = curl_error($ch);
$statusCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($curlErrNo !== 0) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Ollama HTTP error: ' . $curlErr]);
    exit;
}

$resp = json_decode($response, true);
if (!is_array($resp)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Invalid Ollama response']);
    exit;
}

if ($statusCode < 200 || $statusCode >= 300) {
    $errField = isset($resp['error']) ? $resp['error'] : null;
    if (is_array($errField)) {
        $errMsg = json_encode($errField);
    } else {
        $errMsg = $errField ?: ('HTTP ' . $statusCode);
    }
    http_response_code($statusCode);
    echo json_encode(['ok' => false, 'error' => 'Ollama API error: ' . $errMsg]);
    exit;
}

$reply = '';
if (isset($resp['choices'][0]['message']['content'])) {
    $reply = (string)$resp['choices'][0]['message']['content'];
} elseif (isset($resp['message']['content'])) {
    // Some Ollama versions may return a single message
    $reply = (string)$resp['message']['content'];
}

echo json_encode([
    'ok' => true,
    'reply' => trim($reply),
]);

