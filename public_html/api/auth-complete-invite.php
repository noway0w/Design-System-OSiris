<?php
/**
 * POST { token, password, confirmPassword, name?, surname?, termsAccepted }
 * Complete a pending project invite: set password, send verification email.
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
require_once __DIR__ . '/platform-mail.php';
require_once __DIR__ . '/platform-rbac.php';

if (!platform_rate_limit_check('complete_invite', 10)) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'error' => 'Too many attempts. Try again later.']);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

$token = trim((string) ($body['token'] ?? ''));
$password = (string) ($body['password'] ?? '');
$confirm = (string) ($body['confirmPassword'] ?? '');
$name = trim((string) ($body['name'] ?? ''));
$surname = trim((string) ($body['surname'] ?? ''));
$terms = !empty($body['termsAccepted']);

if ($token === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invitation token required']);
    exit;
}
if (!$terms) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'You must accept the Terms of Service']);
    exit;
}
if (strlen($password) < 8 || !preg_match('/\d/', $password) || !preg_match('/[^a-zA-Z0-9]/', $password)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Password must be at least 8 characters with one number and one symbol']);
    exit;
}
if ($password !== $confirm) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Passwords do not match']);
    exit;
}

$pdo = platform_pdo();
$peek = platform_peek_auth_token($pdo, $token, 'email_verify');
if ($peek === null) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'This invitation link is invalid or has expired.']);
    exit;
}

$userId = $peek['user_id'];
$user = platform_load_user_row($pdo, $userId);
if ($user === null || ($user['account_status'] ?? '') !== 'pending') {
    http_response_code(409);
    echo json_encode(['ok' => false, 'error' => 'This invitation has already been used. Sign in instead.']);
    exit;
}

if ($name === '') {
    $name = trim((string) ($user['name'] ?? 'Invited'));
}
if ($surname === '') {
    $surname = trim((string) ($user['surname'] ?? 'User'));
}
if ($name === '') {
    $name = 'Invited';
}
if ($surname === '') {
    $surname = 'User';
}

$hash = password_hash($password, PASSWORD_DEFAULT);
if ($hash === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not save password']);
    exit;
}

$now = time();
platform_consume_auth_token($pdo, $token, 'email_verify');
$pdo->prepare('UPDATE users SET name = ?, surname = ?, password_hash = ?, updated_at = ? WHERE id = ?')
    ->execute([$name, $surname, $hash, $now, $userId]);

$tok = platform_create_auth_token($pdo, $userId, 'email_verify', 48 * 3600);
if ($tok === null) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not create verification token']);
    exit;
}

$email = (string) ($user['email'] ?? '');
$mail = platform_send_verify_email($email, $tok['token']);
$emailSent = !empty($mail['ok']);

$response = [
    'ok' => true,
    'email' => $email,
    'emailSent' => $emailSent,
    'message' => $emailSent
        ? 'Account created. Check your email to verify your address, then sign in.'
        : 'Account created. Use “Resend verification email” if you did not receive the message.',
];

if (!$emailSent && platform_mail_expose_verify_link() && !empty($mail['verifyUrl'])) {
    $response['verifyUrl'] = $mail['verifyUrl'];
}

echo json_encode($response);
