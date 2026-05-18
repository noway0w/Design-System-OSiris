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

/**
 * Basic deliverability check: domain has MX or A records (not proof of inbox ownership).
 *
 * @return array{ok: bool, error?: string}
 */
function platform_email_domain_accepts_mail(string $email): array
{
    $at = strrpos($email, '@');
    if ($at === false || $at === strlen($email) - 1) {
        return ['ok' => false, 'error' => 'Invalid email address.'];
    }
    $domain = strtolower(substr($email, $at + 1));
    if ($domain === '' || !preg_match('/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i', $domain)) {
        return ['ok' => false, 'error' => 'Invalid email domain.'];
    }
    if (@checkdnsrr($domain, 'MX') || @checkdnsrr($domain, 'A')) {
        return ['ok' => true];
    }

    return ['ok' => false, 'error' => 'This email domain does not appear to accept mail. Check the address and try again.'];
}

function platform_user_is_active(?array $row): bool
{
    if (!$row) {
        return false;
    }
    if (!empty($row['deleted_at'])) {
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
function platform_peek_auth_token(PDO $pdo, string $token, ?string $expectedKind = null): ?array
{
    $hash = platform_token_hash($token);
    $st = $pdo->prepare('SELECT user_id, kind, expires_at, consumed_at FROM platform_auth_tokens WHERE token_hash = ? LIMIT 1');
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

    return ['user_id' => (int) $row['user_id'], 'kind' => (string) $row['kind']];
}

/** @return array{user_id: int, kind: string}|null */
function platform_consume_auth_token(PDO $pdo, string $token, ?string $expectedKind = null): ?array
{
    $peek = platform_peek_auth_token($pdo, $token, $expectedKind);
    if ($peek === null) {
        return null;
    }
    $hash = platform_token_hash($token);
    $pdo->prepare('UPDATE platform_auth_tokens SET consumed_at = strftime(\'%s\',\'now\') WHERE token_hash = ? AND consumed_at IS NULL')
        ->execute([$hash]);

    return $peek;
}

function platform_load_user_by_id(PDO $pdo, int $userId): ?array
{
    if (is_readable(__DIR__ . '/platform-rbac.php')) {
        require_once __DIR__ . '/platform-rbac.php';

        return platform_load_user_row($pdo, $userId);
    }
    $st = $pdo->prepare('SELECT id, name, surname, email, password_hash, account_status, email_verified_at FROM users WHERE id = ? LIMIT 1');
    $st->execute([$userId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
}

function platform_fulfill_pending_project_invites(PDO $pdo, int $userId): array
{
    if (!is_readable(__DIR__ . '/platform-rbac.php')) {
        return [];
    }
    require_once __DIR__ . '/platform-rbac.php';

    $st = $pdo->prepare('SELECT id, project_id, role_slug FROM pending_project_invites
        WHERE user_id = ? AND fulfilled_at IS NULL');
    $st->execute([$userId]);
    $projectIds = [];
    $now = time();
    $insMember = $pdo->prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, created_at) VALUES (?,?,?)');
    while ($row = $st->fetch(PDO::FETCH_ASSOC)) {
        $projectId = (int) $row['project_id'];
        $insMember->execute([$projectId, $userId, $now]);
        $roleSlug = trim((string) ($row['role_slug'] ?? ''));
        if ($roleSlug !== '' && in_array($roleSlug, ['company_admin', 'company_manager', 'company_user'], true)) {
            $user = platform_load_user_row($pdo, $userId);
            $companyId = $user['company_id'] ?? null;
            if ($companyId !== null && $companyId !== '') {
                platform_assign_user_rbac($pdo, $userId, (int) $companyId, $roleSlug);
            }
        }
        $pdo->prepare('UPDATE pending_project_invites SET fulfilled_at = ? WHERE id = ?')
            ->execute([$now, (int) $row['id']]);
        $projectIds[] = $projectId;
    }

    return $projectIds;
}

/** @return list<int> project IDs joined from pending invites */
function platform_activate_user(PDO $pdo, int $userId): array
{
    $now = time();
    $pdo->prepare('UPDATE users SET account_status = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?')
        ->execute(['active', $now, $now, $userId]);
    platform_grant_default_permissions($pdo, $userId);

    return platform_fulfill_pending_project_invites($pdo, $userId);
}
