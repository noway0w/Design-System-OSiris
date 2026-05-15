<?php
/**
 * OAuth callback: store Gmail send refresh token for platform mail.
 */
declare(strict_types=1);

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-mail-secrets.php';
require_once __DIR__ . '/platform-mail-gmail.php';

function mail_google_fail(string $msg): void
{
    header('Location: /login/?error=mail_google&mail_msg=' . rawurlencode($msg), true, 302);
    exit;
}

$stateRaw = (string) ($_GET['state'] ?? '');
$verified = $stateRaw !== '' ? platform_sso_verify_state($stateRaw) : null;
if ($verified === null) {
    mail_google_fail('Invalid OAuth state');
}

if (isset($_GET['error']) && (string) $_GET['error'] !== '') {
    mail_google_fail('Authorization denied');
}

$code = (string) ($_GET['code'] ?? '');
if ($code === '') {
    mail_google_fail('Missing authorization code');
}

$cfg = platform_gmail_mail_client_config();
if ($cfg === null) {
    mail_google_fail('Google OAuth not configured');
}

$redirectUri = platform_public_base_url() . '/api/auth-mail-google-callback.php';
$body = http_build_query([
    'code' => $code,
    'client_id' => $cfg['client_id'],
    'client_secret' => $cfg['client_secret'],
    'redirect_uri' => $redirectUri,
    'grant_type' => 'authorization_code',
]);
$ctx = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
        'content' => $body,
        'timeout' => 20,
    ],
]);
$raw = @file_get_contents('https://oauth2.googleapis.com/token', false, $ctx);
if (!is_string($raw) || $raw === '') {
    mail_google_fail('Token exchange failed');
}
$tok = json_decode($raw, true);
if (!is_array($tok) || empty($tok['refresh_token'])) {
    mail_google_fail('No refresh token (try again with prompt=consent)');
}

$data = [
    'refresh_token' => (string) $tok['refresh_token'],
    'email' => '',
    'updated_at' => time(),
];
if (!platform_gmail_mail_save_token($data)) {
    mail_google_fail('Could not save token file (check api/ permissions)');
}

header('Location: /login/?mail_google=ok', true, 302);
exit;
