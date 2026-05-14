<?php
/**
 * GET: begin OAuth2/OIDC flow (Google). Requires env client id + secret.
 */
declare(strict_types=1);

require_once __DIR__ . '/platform-db.php';

$next = '/dashboard/';
try {
    $provider = strtolower(trim((string) ($_GET['provider'] ?? '')));
    $next = (string) ($_GET['next'] ?? '/dashboard/');
    if ($next === '' || $next[0] !== '/') {
        $next = '/dashboard/';
    }

    if ($provider !== 'google') {
        header('Location: /login/?error=sso_not_configured&next=' . rawurlencode($next), true, 302);
        exit;
    }

    $clientId = getenv('PLATFORM_SSO_GOOGLE_CLIENT_ID') ?: '';
    $clientSecret = getenv('PLATFORM_SSO_GOOGLE_CLIENT_SECRET') ?: '';
    if ($clientId === '' || $clientSecret === '') {
        header('Location: /login/?error=sso_not_configured&next=' . rawurlencode($next), true, 302);
        exit;
    }

    $state = platform_sso_sign_state($next);
    if ($state === '') {
        header('Location: /login/?error=sso_not_configured&next=' . rawurlencode($next), true, 302);
        exit;
    }

    $redirectUri = platform_public_base_url() . '/api/auth-sso-callback.php';
    $params = [
        'client_id' => $clientId,
        'redirect_uri' => $redirectUri,
        'response_type' => 'code',
        'scope' => 'openid email profile',
        'state' => $state,
        'access_type' => 'online',
        'include_granted_scopes' => 'true',
        // Always show Google account picker (avoids silent/hidden return when a Google session exists).
        'prompt' => 'select_account',
    ];
    $url = 'https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    header('Location: ' . $url, true, 302);
    exit;
} catch (Throwable $e) {
    error_log('auth-sso-start: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    header('Location: /login/?error=sso_server&next=' . rawurlencode($next), true, 302);
    exit;
}
