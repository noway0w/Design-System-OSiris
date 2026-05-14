<?php
/**
 * GET: public JSON describing available sign-in methods (password + optional SSO).
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/platform-db.php';

$next = isset($_GET['next']) ? (string) $_GET['next'] : '/dashboard/';
if ($next === '' || $next[0] !== '/') {
    $next = '/dashboard/';
}
$nextEnc = rawurlencode($next);

$googleId = getenv('PLATFORM_SSO_GOOGLE_CLIENT_ID') ?: '';
$googleSecret = getenv('PLATFORM_SSO_GOOGLE_CLIENT_SECRET') ?: '';
$googleOk = is_string($googleId) && $googleId !== '' && is_string($googleSecret) && $googleSecret !== '';

$providers = [];
if ($googleOk) {
    $providers[] = [
        'id' => 'google',
        'label' => 'Google',
        'startUrl' => '/api/auth-sso-start.php?provider=google&next=' . $nextEnc,
    ];
}

$exampleCallback = platform_public_base_url() . '/api/auth-sso-callback.php';

echo json_encode([
    'passwordLogin' => true,
    'sso' => [
        'configured' => count($providers) > 0,
        'providers' => $providers,
        'hint' => count($providers) > 0
            ? null
            : 'SSO is not configured. Set PLATFORM_SSO_GOOGLE_CLIENT_ID and PLATFORM_SSO_GOOGLE_CLIENT_SECRET on the server (and PLATFORM_PUBLIC_BASE_URL if needed). In Google Cloud Console, add this authorized redirect URI:',
        'redirectUriExample' => $exampleCallback,
    ],
], JSON_UNESCAPED_SLASHES);
