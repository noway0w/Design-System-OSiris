<?php
/**
 * Shared PHP session + signed fallback cookie for platform auth (dashboard + nginx auth_request).
 * Fallback: some browsers/proxies mishandle PHP session cookies right after OAuth 302; the
 * OSIRIS_PLATFORM_AUTH cookie carries the same user id with an HMAC so APIs still authorize.
 */
declare(strict_types=1);

const PLATFORM_AUTH_COOKIE = 'OSIRIS_PLATFORM_AUTH';

function platform_request_is_secure(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string) $_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https')
        || (isset($_SERVER['SERVER_PORT']) && (string) $_SERVER['SERVER_PORT'] === '443');
}

function platform_auth_cookie_secret_binary(): string
{
    $env = getenv('PLATFORM_AUTH_COOKIE_SECRET');
    if (is_string($env) && $env !== '') {
        return hash('sha256', $env, true);
    }
    $cs = getenv('PLATFORM_SSO_GOOGLE_CLIENT_SECRET');
    if (is_string($cs) && $cs !== '') {
        return hash('sha256', 'platform-auth-cookie-v1|' . $cs, true);
    }

    return '';
}

function platform_auth_b64url_encode(string $raw): string
{
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function platform_auth_b64url_decode(string $s): string
{
    $b = strtr($s, '-_', '+/');
    $pad = strlen($b) % 4;
    if ($pad !== 0) {
        $b .= str_repeat('=', 4 - $pad);
    }
    $out = base64_decode($b, true);

    return is_string($out) ? $out : '';
}

function platform_auth_cookie_set_options(int $expires): array
{
    $p = session_get_cookie_params();
    $secure = platform_request_is_secure();
    $ss = $p['samesite'] ?? 'Lax';
    $opts = [
        'expires' => $expires,
        'path' => (string) ($p['path'] ?: '/'),
        'secure' => $secure,
        'httponly' => true,
        'samesite' => is_string($ss) && $ss !== '' ? $ss : 'Lax',
    ];
    $dom = (string) ($p['domain'] ?? '');
    if ($dom !== '') {
        $opts['domain'] = $dom;
    }

    return $opts;
}

function platform_auth_cookie_issue(int $userId): void
{
    if (headers_sent()) {
        return;
    }
    $key = platform_auth_cookie_secret_binary();
    if ($key === '') {
        return;
    }
    $exp = time() + 86400 * 14;
    $payload = json_encode(['v' => 1, 'uid' => $userId, 'exp' => $exp], JSON_UNESCAPED_SLASHES);
    if (!is_string($payload)) {
        return;
    }
    $sig = hash_hmac('sha256', $payload, $key, true);
    $val = platform_auth_b64url_encode($payload) . '.' . platform_auth_b64url_encode($sig);
    setcookie(PLATFORM_AUTH_COOKIE, $val, platform_auth_cookie_set_options($exp));
}

function platform_auth_cookie_clear(): void
{
    if (headers_sent()) {
        return;
    }
    setcookie(PLATFORM_AUTH_COOKIE, '', platform_auth_cookie_set_options(time() - 3600));
}

function platform_auth_cookie_user_id(): ?int
{
    $key = platform_auth_cookie_secret_binary();
    if ($key === '') {
        return null;
    }
    $raw = isset($_COOKIE[PLATFORM_AUTH_COOKIE]) ? (string) $_COOKIE[PLATFORM_AUTH_COOKIE] : '';
    if ($raw === '') {
        return null;
    }
    $parts = explode('.', $raw, 2);
    if (count($parts) !== 2) {
        return null;
    }
    $json = platform_auth_b64url_decode($parts[0]);
    $sig = platform_auth_b64url_decode($parts[1]);
    if ($json === '' || $sig === '') {
        return null;
    }
    $expect = hash_hmac('sha256', $json, $key, true);
    if (!hash_equals($expect, $sig)) {
        return null;
    }
    $data = json_decode($json, true);
    if (!is_array($data) || (int) ($data['v'] ?? 0) !== 1) {
        return null;
    }
    if ((int) ($data['exp'] ?? 0) < time()) {
        return null;
    }
    $uid = (int) ($data['uid'] ?? 0);

    return $uid > 0 ? $uid : null;
}

function platform_session_start(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $params = session_get_cookie_params();
    session_name('OSIRIS_PLATFORM_SID');
    $secure = platform_request_is_secure();
    $sameSite = 'Lax';
    $cookieParams = [
        'lifetime' => (int) ($params['lifetime'] ?: 0),
        'path' => '/',
        'secure' => $secure,
        'httponly' => true,
        'samesite' => $sameSite,
    ];
    $dom = (string) ($params['domain'] ?? '');
    if ($dom !== '') {
        $cookieParams['domain'] = $dom;
    }
    session_set_cookie_params($cookieParams);
    session_start();
}

function platform_session_user_id(): ?int
{
    platform_session_start();
    $id = $_SESSION['platform_user_id'] ?? null;
    if (is_numeric($id)) {
        $uid = (int) $id;
        if (!platform_session_user_is_active($uid)) {
            return null;
        }

        return $uid;
    }
    $fromCookie = platform_auth_cookie_user_id();
    if ($fromCookie !== null) {
        if (!platform_session_user_is_active($fromCookie)) {
            return null;
        }
        $_SESSION['platform_user_id'] = $fromCookie;

        return $fromCookie;
    }

    return null;
}

function platform_session_user_is_active(int $userId): bool
{
    static $cache = [];
    if (isset($cache[$userId])) {
        return $cache[$userId];
    }
    if (!function_exists('platform_pdo')) {
        require_once __DIR__ . '/platform-db.php';
    }
    try {
        $pdo = platform_pdo();
        $st = $pdo->prepare('SELECT account_status, deleted_at FROM users WHERE id = ? LIMIT 1');
        $st->execute([$userId]);
        $row = $st->fetch(PDO::FETCH_ASSOC);
        $status = (string) ($row['account_status'] ?? 'active');
        $deleted = $row['deleted_at'] ?? null;
        $cache[$userId] = $status === 'active' && ($deleted === null || $deleted === '');
    } catch (Throwable $e) {
        $cache[$userId] = true;
    }

    return $cache[$userId];
}

function platform_session_set_user_id(int $userId): void
{
    platform_session_start();
    try {
        session_regenerate_id(false);
    } catch (Throwable $e) {
        error_log('platform_session_set_user_id: session_regenerate_id failed: ' . $e->getMessage());
    }
    $_SESSION['platform_user_id'] = $userId;
    platform_auth_cookie_issue($userId);
}

function platform_session_logout(): void
{
    platform_session_start();
    $_SESSION = [];
    platform_auth_cookie_clear();
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        $ss = $p['samesite'] ?? 'Lax';
        $clear = [
            'expires' => time() - 42000,
            'path' => $p['path'],
            'secure' => (bool) $p['secure'],
            'httponly' => (bool) $p['httponly'],
            'samesite' => is_string($ss) && $ss !== '' ? $ss : 'Lax',
        ];
        if (($p['domain'] ?? '') !== '') {
            $clear['domain'] = (string) $p['domain'];
        }
        setcookie(session_name(), '', $clear);
    }
    session_destroy();
}
