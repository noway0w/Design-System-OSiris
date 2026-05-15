<?php
/**
 * POST JSON { token, password, confirmPassword? }
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST only']);
    exit;
}

require_once __DIR__ . '/platform-auth.php';

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

$token = trim((string) ($body['token'] ?? ''));
$password = (string) ($body['password'] ?? '');
$confirm = (string) ($body['confirmPassword'] ?? $password);

if ($token === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Reset token is required.']);
    exit;
}
if ($password !== $confirm) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Passwords do not match.']);
    exit;
}

$pwCheck = platform_password_valid($password);
if (!$pwCheck['ok']) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => $pwCheck['error'] ?? 'Invalid password']);
    exit;
}

$pdo = platform_pdo();
$consumed = platform_consume_auth_token($pdo, $token, 'password_reset');
if ($consumed === null) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'This reset link is invalid or has expired.']);
    exit;
}

$hash = password_hash($password, PASSWORD_DEFAULT);
if ($hash === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not update password.']);
    exit;
}

$pdo->prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    ->execute([$hash, time(), $consumed['user_id']]);

echo json_encode(['ok' => true, 'message' => 'Password updated. You can sign in now.']);
