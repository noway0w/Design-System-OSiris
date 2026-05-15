<?php
/**
 * Platform SQLite (separate from api/users.db — nearby users map API).
 * Tables: users, projects, service_permissions
 */
declare(strict_types=1);

platform_bootstrap_local_env_file();

/**
 * Optional SSO / public URL overrides without php-fpm env[] or systemd.
 * File: public_html/api/.platform-sso.env (gitignored), readable by the php-fpm user.
 * Does not overwrite variables already set in the process environment.
 */
function platform_bootstrap_local_env_file(): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;
    $path = __DIR__ . '/.platform-sso.env';
    if (!is_readable($path)) {
        return;
    }
    $allowed = [
        'PLATFORM_SSO_GOOGLE_CLIENT_ID' => true,
        'PLATFORM_SSO_GOOGLE_CLIENT_SECRET' => true,
        'PLATFORM_SSO_STATE_SECRET' => true,
        'PLATFORM_PUBLIC_BASE_URL' => true,
        'PLATFORM_AUTH_COOKIE_SECRET' => true,
        'PLATFORM_MAIL_FROM' => true,
        'PLATFORM_SMTP_HOST' => true,
        'PLATFORM_SMTP_PORT' => true,
        'PLATFORM_SMTP_USER' => true,
        'PLATFORM_SMTP_PASS' => true,
        'PLATFORM_SMTP_TLS' => true,
        'PLATFORM_MAIL_DEV_EXPOSE_LINK' => true,
        'PLATFORM_MAIL_DEV_LOG' => true,
        'PLATFORM_RESEND_API_KEY' => true,
        'PLATFORM_MAIL_PROVIDER' => true,
    ];
    $raw = @file_get_contents($path);
    if (!is_string($raw) || $raw === '') {
        return;
    }
    foreach (explode("\n", $raw) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }
        $eq = strpos($line, '=');
        if ($eq === false) {
            continue;
        }
        $key = trim(substr($line, 0, $eq));
        $val = trim(substr($line, $eq + 1));
        if ($val !== '' && ($val[0] === '"' || $val[0] === "'") && strlen($val) > 1 && $val[strlen($val) - 1] === $val[0]) {
            $val = substr($val, 1, -1);
        }
        if ($key === '' || !isset($allowed[$key])) {
            continue;
        }
        if ((getenv($key) ?: '') !== '') {
            continue;
        }
        putenv($key . '=' . $val);
        $_ENV[$key] = $val;
    }
    if (is_readable(__DIR__ . '/platform-mail-secrets.php')) {
        require_once __DIR__ . '/platform-mail-secrets.php';
        platform_mail_bootstrap_secrets();
    }
}

function platform_db_path(): string
{
    return __DIR__ . '/platform.db';
}

function platform_pdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }
    $path = platform_db_path();
    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    $pdo->exec('PRAGMA foreign_keys = ON');
    platform_ensure_schema($pdo);
    platform_seed_if_empty($pdo);
    return $pdo;
}

function platform_ensure_schema(PDO $db): void
{
    $db->exec("
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  surname TEXT NOT NULL,
  ip TEXT,
  location TEXT,
  avatar_url TEXT,
  sso_provider_id TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
");
    platform_ensure_users_columns($db);
    $db->exec("
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_name TEXT NOT NULL,
  uploaded_file_paths TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
");
    $db->exec('CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);');
    $db->exec("
CREATE TABLE IF NOT EXISTS service_permissions (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  PRIMARY KEY (user_id, service_name)
);
");
    $db->exec('CREATE INDEX IF NOT EXISTS idx_service_permissions_service ON service_permissions(service_name);');
    try {
        $db->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_sso_unique ON users(sso_provider_id) WHERE sso_provider_id IS NOT NULL');
    } catch (PDOException $e) {
        // Older SQLite without partial unique: ignore
    }
    $db->exec("
CREATE TABLE IF NOT EXISTS platform_auth_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
");
    $db->exec('CREATE INDEX IF NOT EXISTS idx_platform_auth_tokens_user ON platform_auth_tokens(user_id);');
    $db->exec("
CREATE TABLE IF NOT EXISTS platform_rate_limits (
  ip TEXT NOT NULL,
  action TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, action, window_start)
);
");
}

/**
 * Older platform.db files may predate SSO columns; CREATE TABLE IF NOT EXISTS does not add them.
 */
function platform_ensure_users_columns(PDO $db): void
{
    $stmt = $db->query('PRAGMA table_info(users)');
    if ($stmt === false) {
        return;
    }
    $have = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $n = isset($row['name']) ? (string) $row['name'] : '';
        if ($n !== '') {
            $have[$n] = true;
        }
    }
    $add = [
        'ip' => 'TEXT',
        'location' => 'TEXT',
        'avatar_url' => 'TEXT',
        'sso_provider_id' => 'TEXT',
        'created_at' => 'INTEGER',
        'updated_at' => 'INTEGER',
        'account_status' => 'TEXT',
        'phone' => 'TEXT',
        'email_verified_at' => 'INTEGER',
    ];
    foreach ($add as $col => $typeSql) {
        if (isset($have[$col])) {
            continue;
        }
        if (!preg_match('/^[a-z_]+$/', $col)) {
            continue;
        }
        try {
            $db->exec('ALTER TABLE users ADD COLUMN ' . $col . ' ' . $typeSql);
        } catch (PDOException $e) {
            // duplicate / race: ignore
        }
    }
    try {
        $db->exec("UPDATE users SET created_at = strftime('%s','now') WHERE created_at IS NULL");
        $db->exec("UPDATE users SET updated_at = strftime('%s','now') WHERE updated_at IS NULL");
        $db->exec("UPDATE users SET account_status = 'active' WHERE account_status IS NULL OR account_status = ''");
    } catch (PDOException $e) {
        // columns may not exist on exotic schemas
    }
}

function platform_seed_if_empty(PDO $db): void
{
    $n = (int) $db->query('SELECT COUNT(*) FROM users')->fetchColumn();
    if ($n > 0) {
        return;
    }
    $email = getenv('PLATFORM_SEED_EMAIL') ?: 'admin@localhost';
    $plain = getenv('PLATFORM_SEED_PASSWORD') ?: 'Changeme!1';
    $hash = password_hash($plain, PASSWORD_DEFAULT);
    $stmt = $db->prepare('INSERT INTO users (name, surname, email, password_hash, ip, location, account_status, email_verified_at) VALUES (?,?,?,?,?,?,?,?)');
    $now = time();
    $stmt->execute(['Admin', 'User', $email, $hash, '127.0.0.1', 'seed', 'active', $now]);
    $uid = (int) $db->lastInsertId();
    platform_grant_default_permissions($db, $uid);
}

/** @return list<string> */
function platform_default_service_names(): array
{
    return ['dashboard', 'map-app', 'iris', '3Dobjscan', 'carscan', 'disable'];
}

function platform_grant_default_permissions(PDO $db, int $userId): void
{
    $ins = $db->prepare('INSERT OR IGNORE INTO service_permissions (user_id, service_name) VALUES (?,?)');
    foreach (platform_default_service_names() as $svc) {
        $ins->execute([$userId, $svc]);
    }
}

function platform_public_base_url(): string
{
    $e = getenv('PLATFORM_PUBLIC_BASE_URL');
    if (is_string($e) && $e !== '') {
        return rtrim($e, '/');
    }
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower((string) $_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https')
        || (isset($_SERVER['SERVER_PORT']) && (string) $_SERVER['SERVER_PORT'] === '443');
    $h = $_SERVER['HTTP_HOST'] ?? 'localhost';

    return ($https ? 'https://' : 'http://') . $h;
}

/* --- Google SSO: signed OAuth state (no session cookie on Google → app redirect) --- */

function platform_sso_normalize_next(string $next): string
{
    $next = trim($next);
    if ($next === '' || $next[0] !== '/' || str_starts_with($next, '//')) {
        return '/dashboard/';
    }

    return $next;
}

function platform_sso_state_signing_key(): string
{
    $env = getenv('PLATFORM_SSO_STATE_SECRET');
    if (is_string($env) && $env !== '') {
        return $env;
    }
    $cs = getenv('PLATFORM_SSO_GOOGLE_CLIENT_SECRET');
    if (is_string($cs) && $cs !== '') {
        return hash('sha256', 'platform-sso-oauth-state-v1|' . $cs, true);
    }

    return '';
}

function platform_sso_b64url_encode(string $raw): string
{
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function platform_sso_b64url_decode(string $s): string
{
    $b = strtr($s, '-_', '+/');
    $pad = strlen($b) % 4;
    if ($pad !== 0) {
        $b .= str_repeat('=', 4 - $pad);
    }
    $out = base64_decode($b, true);

    return is_string($out) ? $out : '';
}

function platform_sso_sign_state(string $next): string
{
    $next = platform_sso_normalize_next($next);
    $key = platform_sso_state_signing_key();
    if ($key === '') {
        return '';
    }
    $payload = [
        'v' => 1,
        'exp' => time() + 3600,
        'nonce' => bin2hex(random_bytes(16)),
        'next' => $next,
        'prov' => 'google',
    ];
    $json = json_encode($payload, JSON_UNESCAPED_SLASHES);
    if (!is_string($json)) {
        return '';
    }
    $sig = hash_hmac('sha256', $json, $key, true);

    return platform_sso_b64url_encode($json) . '.' . platform_sso_b64url_encode($sig);
}

/** @return array{next: string}|null */
function platform_sso_verify_state(string $state): ?array
{
    $key = platform_sso_state_signing_key();
    if ($key === '') {
        return null;
    }
    $parts = explode('.', $state, 2);
    if (count($parts) !== 2) {
        return null;
    }
    [$jsonB64, $sigB64] = $parts;
    $json = platform_sso_b64url_decode($jsonB64);
    $sig = platform_sso_b64url_decode($sigB64);
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
    if (($data['prov'] ?? '') !== 'google') {
        return null;
    }
    $next = platform_sso_normalize_next((string) ($data['next'] ?? '/dashboard/'));

    return ['next' => $next];
}
