<?php
/**
 * GET — mail configuration diagnostic for platform super_admin (no secrets exposed).
 * Optional ?send=1 sends a test message to the signed-in user's email.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'GET only']);
    exit;
}

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-rbac.php';
require_once __DIR__ . '/platform-mail.php';

$actor = platform_require_session_user();
if (empty(platform_user_capabilities($actor)['super_admin'])) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

platform_mail_ensure_bootstrapped();
$apiDir = __DIR__;
$payload = [
    'ok' => true,
    'provider' => platform_env('PLATFORM_MAIL_PROVIDER') ?: '(auto)',
    'smtp_configured' => platform_smtp_configured(),
    'mail_configured' => platform_mail_is_configured(),
    'readable' => [
        'platform_sso_env' => is_readable($apiDir . '/.platform-sso.env'),
        'platform_mail_secret' => is_readable($apiDir . '/.platform-mail.secret'),
    ],
    'smtp_host_set' => platform_env('PLATFORM_SMTP_HOST') !== '',
    'smtp_user_set' => platform_env('PLATFORM_SMTP_USER') !== '',
    'smtp_pass_set' => platform_env('PLATFORM_SMTP_PASS') !== '',
];

if (isset($_GET['send']) && (string) $_GET['send'] === '1') {
    $to = (string) ($actor['email'] ?? '');
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'No valid email on your account']);
        exit;
    }
    $subject = 'OSiris mail test ' . gmdate('Y-m-d H:i:s') . ' UTC';
    $html = '<p>If you received this, outbound mail from the web server is working.</p>';
    $payload['test_send'] = platform_send_mail($to, $subject, $html);
}

echo json_encode($payload);
