<?php
/**
 * Shared helpers: password rules, auth tokens, rate limits.
 */
declare(strict_types=1);

require_once __DIR__ . '/platform-db.php';

function platform_client_ip(): string
{
    $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if (is_string($xff) && $xff !== '') {
        $parts = explode(',', $xff);
        $first = trim($parts[0]);
        if ($first !== '') {
            return $first;
        }
    }

    return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
}

/** @return array{ok: bool, error?: string} */
function platform_password_valid(string $password): array
{
    if (strlen($password) < 8) {
        return ['ok' => false, 'error' => 'Password must be at least 8 characters.'];
    }
    if (!preg_match('/\d/', $password)) {
        return ['ok' => false, 'error' => 'Password must include at least one number.'];
    }
    if (!preg_match('/[^a-zA-Z0-9]/', $password)) {
        return ['ok' => false, 'error' => 'Password must include at least one symbol.'];
    }

    return ['ok' => true];
}

function platform_user_is_active(?array $row): bool
{
    if (!$row) {
        return false;
    }
    $status = (string) ($row['account_status'] ?? 'active');

    return $status === 'active';
}

function platform_rate_limit_check(string $action, int $maxPerHour = 5): bool
{
    $pdo = platform_pdo();
    $ip = platform_client_ip();
    $window = (int) floor(time() / 3600);
    $st = $pdo->prepare('SELECT hit_count FROM platform_rate_limits WHERE ip = ? AND action = ? AND window_start = ?');
    $st->execute([$ip, $action, $window]);
    $count = (int) ($st->fetchColumn() ?: 0);
    if ($count >= $maxPerHour) {
        return false;
    }
    $up = $pdo->prepare('INSERT INTO platform_rate_limits (ip, action, window_start, hit_count) VALUES (?,?,?,1)
        ON CONFLICT(ip, action, window_start) DO UPDATE SET hit_count = hit_count + 1');
    $up->execute([$ip, $action, $window]);

    return true;
}

function platform_token_hash(string $token): string
{
    return hash('sha256', $token);
}

/**
 * @return array{token: string, expires_at: int}|null
 */
function platform_create_auth_token(PDO $pdo, int $userId, string $kind, int $ttlSeconds): ?array
{
    if (!in_array($kind, ['email_verify', 'password_reset'], true)) {
        return null;
    }
    $pdo->prepare('DELETE FROM platform_auth_tokens WHERE user_id = ? AND kind = ? AND consumed_at IS NULL')
        ->execute([$userId, $kind]);
    $token = bin2hex(random_bytes(32));
    $hash = platform_token_hash($token);
    $expires = time() + $ttlSeconds;
    $ins = $pdo->prepare('INSERT INTO platform_auth_tokens (user_id, kind, token_hash, expires_at) VALUES (?,?,?,?)');
    $ins->execute([$userId, $kind, $hash, $expires]);

    return ['token' => $token, 'expires_at' => $expires];
}

/** @return array{user_id: int, kind: string}|null */
function platform_consume_auth_token(PDO $pdo, string $token, ?string $expectedKind = null): ?array
{
    $hash = platform_token_hash($token);
    $st = $pdo->prepare('SELECT id, user_id, kind, expires_at, consumed_at FROM platform_auth_tokens WHERE token_hash = ? LIMIT 1');
    $st->execute([$hash]);
    $row = $st->fetch(PDO::FETCH_ASSOC);
    if (!$row || $row['consumed_at'] !== null) {
        return null;
    }
    if ((int) $row['expires_at'] < time()) {
        return null;
    }
    if ($expectedKind !== null && (string) $row['kind'] !== $expectedKind) {
        return null;
    }
    $pdo->prepare('UPDATE platform_auth_tokens SET consumed_at = strftime(\'%s\',\'now\') WHERE id = ?')
        ->execute([(int) $row['id']]);

    return ['user_id' => (int) $row['user_id'], 'kind' => (string) $row['kind']];
}

function platform_load_user_by_id(PDO $pdo, int $userId): ?array
{
    $st = $pdo->prepare('SELECT id, name, surname, email, password_hash, account_status, email_verified_at FROM users WHERE id = ? LIMIT 1');
    $st->execute([$userId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
}

function platform_activate_user(PDO $pdo, int $userId): void
{
    $now = time();
    $pdo->prepare('UPDATE users SET account_status = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?')
        ->execute(['active', $now, $now, $userId]);
    platform_grant_default_permissions($pdo, $userId);
}
