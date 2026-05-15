<?php
/**
 * GET: OAuth2 redirect target (Google). Exchanges code, creates/links user, opens session.
 */
declare(strict_types=1);

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-session.php';

function sso_redirect_login(string $code, string $next): void
{
    $q = http_build_query(['error' => $code, 'next' => $next]);
    header('Location: /login/?' . $q, true, 302);
    exit;
}

function http_post_form(string $url, array $fields): array
{
    $body = http_build_query($fields);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
            CURLOPT_TIMEOUT => 20,
        ]);
        $out = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        return [$code, is_string($out) ? $out : ''];
    }
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $body,
            'timeout' => 20,
        ],
    ]);
    $out = @file_get_contents($url, false, $ctx);
    $code = 0;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
        $code = (int) $m[1];
    }

    return [$code, is_string($out) ? $out : ''];
}

function http_get_json(string $url, string $bearer): ?array
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $bearer],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 20,
        ]);
        $out = curl_exec($ch);
        curl_close($ch);
    } else {
        $ctx = stream_context_create([
            'http' => [
                'header' => "Authorization: Bearer {$bearer}\r\n",
                'timeout' => 20,
            ],
        ]);
        $out = @file_get_contents($url, false, $ctx);
    }
    if (!is_string($out) || $out === '') {
        return null;
    }
    $j = json_decode($out, true);

    return is_array($j) ? $j : null;
}

$stateRaw = (string) ($_GET['state'] ?? '');
$verified = $stateRaw !== '' ? platform_sso_verify_state($stateRaw) : null;
$next = platform_sso_normalize_next($verified['next'] ?? '/dashboard/');

try {

if (isset($_GET['error']) && (string) $_GET['error'] !== '') {
    sso_redirect_login('sso_denied', $next);
}

$code = (string) ($_GET['code'] ?? '');
if ($verified === null || $code === '') {
    sso_redirect_login('sso_state', $next);
}

$clientId = getenv('PLATFORM_SSO_GOOGLE_CLIENT_ID') ?: '';
$clientSecret = getenv('PLATFORM_SSO_GOOGLE_CLIENT_SECRET') ?: '';
if ($clientId === '' || $clientSecret === '') {
    sso_redirect_login('sso_not_configured', $next);
}

$redirectUri = platform_public_base_url() . '/api/auth-sso-callback.php';
[$httpCode, $raw] = http_post_form('https://oauth2.googleapis.com/token', [
    'code' => $code,
    'client_id' => $clientId,
    'client_secret' => $clientSecret,
    'redirect_uri' => $redirectUri,
    'grant_type' => 'authorization_code',
]);
if ($httpCode < 200 || $httpCode >= 300) {
    sso_redirect_login('sso_token', $next);
}
$tok = json_decode($raw, true);
$access = is_array($tok) && isset($tok['access_token']) ? (string) $tok['access_token'] : '';
if ($access === '') {
    sso_redirect_login('sso_token', $next);
}

$info = http_get_json('https://openidconnect.googleapis.com/v1/userinfo', $access);
if (!$info) {
    sso_redirect_login('sso_userinfo', $next);
}
$sub = (string) ($info['sub'] ?? '');
$email = trim((string) ($info['email'] ?? ''));
if ($sub === '' || $email === '') {
    sso_redirect_login('sso_email', $next);
}

$ssoId = 'google:' . $sub;
$given = trim((string) ($info['given_name'] ?? ''));
$family = trim((string) ($info['family_name'] ?? ''));
if ($given === '') {
    $given = strstr($email, '@', true) ?: 'User';
}
if ($family === '') {
    $family = ' ';
}
$avatar = trim((string) ($info['picture'] ?? ''));

$pdo = platform_pdo();
$row = null;
$st = $pdo->prepare('SELECT id, email, sso_provider_id FROM users WHERE sso_provider_id = ? LIMIT 1');
$st->execute([$ssoId]);
$row = $st->fetch(PDO::FETCH_ASSOC);
if (!$row) {
    $st2 = $pdo->prepare('SELECT id, email, sso_provider_id FROM users WHERE email = ? LIMIT 1');
    $st2->execute([$email]);
    $row = $st2->fetch(PDO::FETCH_ASSOC);
}

if ($row) {
    $uid = (int) $row['id'];
    $now = time();
    $up = $pdo->prepare('UPDATE users SET sso_provider_id = ?, name = ?, surname = ?, avatar_url = COALESCE(NULLIF(?, \'\'), avatar_url), account_status = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?');
    $up->execute([$ssoId, $given, $family, $avatar, 'active', $now, $now, $uid]);
    platform_grant_default_permissions($pdo, $uid);
    platform_session_set_user_id($uid);
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    header('Location: ' . $next, true, 302);
    exit;
}

$randomPw = password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT);
if ($randomPw === false) {
    sso_redirect_login('sso_token', $next);
}
$now = time();
$ins = $pdo->prepare('INSERT INTO users (name, surname, email, password_hash, ip, location, avatar_url, sso_provider_id, account_status, email_verified_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
$ins->execute([$given, $family, $email, $randomPw, $_SERVER['REMOTE_ADDR'] ?? '', 'google-oauth', $avatar !== '' ? $avatar : null, $ssoId, 'active', $now]);
$uid = (int) $pdo->lastInsertId();
platform_grant_default_permissions($pdo, $uid);
platform_session_set_user_id($uid);
if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}
header('Location: ' . $next, true, 302);
exit;
} catch (Throwable $e) {
    error_log('auth-sso-callback: ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    sso_redirect_login('sso_server', $next);
}
