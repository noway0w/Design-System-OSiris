<?php
/**
 * POST JSON { email } — always returns generic success message.
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

$generic = 'If an account exists for this email, we sent a password reset link.';

if (!platform_rate_limit_check('forgot', 5)) {
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
$st = $pdo->prepare('SELECT id, email, password_hash, account_status FROM users WHERE email = ? LIMIT 1');
$st->execute([$email]);
$row = $st->fetch(PDO::FETCH_ASSOC);

if ($row && !empty($row['password_hash']) && platform_user_is_active($row)) {
    $uid = (int) $row['id'];
    $tok = platform_create_auth_token($pdo, $uid, 'password_reset', 3600);
    if ($tok !== null) {
        $mail = platform_send_reset_email($email, $tok['token']);
        if (empty($mail['ok'])) {
            error_log('auth-forgot-password: email not delivered user_id=' . $uid . ' (mode=' . ($mail['mode'] ?? 'unknown') . ')');
        }
    }
}

echo json_encode(['ok' => true, 'message' => $generic]);
