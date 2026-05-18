<?php
/**
 * POST JSON { "email": "...", "password": "..." } → { ok, user?, error? }
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST only']);
    exit;
}

require_once __DIR__ . '/platform-auth-service.php';

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

$email = trim((string) ($body['email'] ?? ''));
$password = (string) ($body['password'] ?? '');
if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'email and password required']);
    exit;
}

$result = platform_auth_login($email, $password);
if (!$result['ok']) {
    $code = $result['code'] ?? null;
    if ($code === 'pending_verify') {
        http_response_code(403);
        echo json_encode([
            'ok' => false,
            'error' => $result['error'],
            'code' => 'pending_verify',
            'email' => $result['email'] ?? $email,
        ]);
        exit;
    }
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => $result['error']]);
    exit;
}

platform_auth_issue_session((int) $result['user']['id']);
echo json_encode(['ok' => true, 'user' => $result['user']]);
