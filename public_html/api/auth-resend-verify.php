<?php
/**
 * POST JSON { "email": "..." } — resend verification for pending accounts.
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

if (!platform_rate_limit_check('resend_verify', 5)) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'error' => 'Too many attempts. Please try again later.']);
    exit;
}

$email = strtolower(trim((string) ($body['email'] ?? '')));
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Valid email is required.']);
    exit;
}

$pdo = platform_pdo();
$st = $pdo->prepare('SELECT id, account_status FROM users WHERE email = ? LIMIT 1');
$st->execute([$email]);
$row = $st->fetch(PDO::FETCH_ASSOC);

if (!$row || ($row['account_status'] ?? '') !== 'pending') {
    echo json_encode([
        'ok' => true,
        'message' => 'If a pending account exists for this email, a verification message was sent.',
    ]);
    exit;
}

$uid = (int) $row['id'];
$tok = platform_create_auth_token($pdo, $uid, 'email_verify', 48 * 3600);
if ($tok === null) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not create verification token.']);
    exit;
}

$mail = platform_send_verify_email($email, $tok['token']);
$emailSent = !empty($mail['ok']);

$response = [
    'ok' => true,
    'emailSent' => $emailSent,
    'message' => $emailSent
        ? 'Verification email sent. Open the link in that inbox to activate your account.'
        : 'We could not send the verification email. Please try again in a few minutes.',
];
if (!$emailSent && platform_mail_expose_verify_link() && !empty($mail['verifyUrl'])) {
    $response['verifyUrl'] = $mail['verifyUrl'];
}

echo json_encode($response);
