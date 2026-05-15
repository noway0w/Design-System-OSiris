<?php
/**
 * One-time OAuth to authorize Gmail send for platform mail.
 * Add redirect URI in Google Cloud Console:
 *   https://app.guillaumelassiat.com/api/auth-mail-google-callback.php
 * Enable Gmail API on the same project as SSO.
 */
declare(strict_types=1);

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-mail-secrets.php';

platform_mail_bootstrap_secrets();

$clientId = getenv('PLATFORM_SSO_GOOGLE_CLIENT_ID') ?: '';
if ($clientId === '') {
    http_response_code(500);
    echo 'Google OAuth is not configured.';
    exit;
}

$state = platform_sso_sign_state('/dashboard/');
if ($state === '') {
    http_response_code(500);
    echo 'Could not sign OAuth state.';
    exit;
}

$redirectUri = platform_public_base_url() . '/api/auth-mail-google-callback.php';
$params = [
    'client_id' => $clientId,
    'redirect_uri' => $redirectUri,
    'response_type' => 'code',
    'scope' => 'https://www.googleapis.com/auth/gmail.send',
    'access_type' => 'offline',
    'prompt' => 'consent',
    'state' => $state,
];
header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params), true, 302);
exit;
