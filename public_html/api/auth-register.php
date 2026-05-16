<?php
/**
 * POST JSON { name, surname, email, phone?, password, confirmPassword, termsAccepted }
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

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

if (!platform_rate_limit_check('register', 5)) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'error' => 'Too many attempts. Please try again later.']);
    exit;
}

$name = trim((string) ($body['name'] ?? ''));
$surname = trim((string) ($body['surname'] ?? ''));
$email = strtolower(trim((string) ($body['email'] ?? '')));
$phone = trim((string) ($body['phone'] ?? ''));
$password = (string) ($body['password'] ?? '');
$confirm = (string) ($body['confirmPassword'] ?? '');
$terms = !empty($body['termsAccepted']);

if ($name === '' || $surname === '' || $email === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Name, surname, and email are required.']);
    exit;
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid email address.']);
    exit;
}
$domainCheck = platform_email_domain_accepts_mail($email);
if (!$domainCheck['ok']) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => $domainCheck['error'] ?? 'Invalid email address.']);
    exit;
}
if (!$terms) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'You must accept the terms to continue.']);
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
$st = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
$st->execute([$email]);
if ($st->fetch(PDO::FETCH_ASSOC)) {
    http_response_code(409);
    echo json_encode(['ok' => false, 'error' => 'An account with this email already exists.']);
    exit;
}

$hash = password_hash($password, PASSWORD_DEFAULT);
if ($hash === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not create account.']);
    exit;
}

$ins = $pdo->prepare('INSERT INTO users (name, surname, email, password_hash, phone, ip, location, account_status) VALUES (?,?,?,?,?,?,?,?)');
$ins->execute([
    $name,
    $surname,
    $email,
    $hash,
    $phone !== '' ? $phone : null,
    platform_client_ip(),
    'register',
    'pending',
]);
$uid = (int) $pdo->lastInsertId();

$tok = platform_create_auth_token($pdo, $uid, 'email_verify', 48 * 3600);
if ($tok === null) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not create verification token.']);
    exit;
}

$mail = platform_send_verify_email($email, $tok['token']);
$emailSent = !empty($mail['ok']);
if (!$emailSent) {
    error_log('auth-register: email not delivered to ' . $email . ' (mode=' . ($mail['mode'] ?? 'unknown') . ')');
}

$response = [
    'ok' => true,
    'needsEmailVerification' => true,
    'email' => $email,
    'emailSent' => $emailSent,
    'message' => $emailSent
        ? 'We sent a verification link to your email. Open it to activate your account before signing in.'
        : 'Your account was created, but we could not send the verification email. Tap "Resend verification email" below.',
];

if (!$emailSent && platform_mail_expose_verify_link() && !empty($mail['verifyUrl'])) {
    $response['verifyUrl'] = $mail['verifyUrl'];
}

echo json_encode($response);
