<?php
/**
 * Multi-tenant RBAC helpers (companies, roles, capabilities).
 */
declare(strict_types=1);

require_once __DIR__ . '/platform-db.php';

/** @return list<string> */
function platform_owner_emails(): array
{
    return ['g.lassiat@gmail.com', 'admin@localhost'];
}

function platform_normalize_email(string $email): string
{
    return strtolower(trim($email));
}

function platform_is_owner_email(string $email): bool
{
    return in_array(platform_normalize_email($email), platform_owner_emails(), true);
}

function platform_user_files_storage_root(): string
{
    $env = getenv('PLATFORM_USER_FILES_ROOT');
    if (is_string($env) && $env !== '') {
        return rtrim($env, '/');
    }

    return '/home/OSiris/data/platform-user-files';
}

function platform_role_id_by_slug(PDO $pdo, string $slug): ?int
{
    static $cache = [];
    if (isset($cache[$slug])) {
        return $cache[$slug];
    }
    $st = $pdo->prepare('SELECT id FROM roles WHERE slug = ? LIMIT 1');
    $st->execute([$slug]);
    $id = $st->fetchColumn();
    $cache[$slug] = $id !== false ? (int) $id : null;

    return $cache[$slug];
}

function platform_default_company_id(PDO $pdo): int
{
    static $id = null;
    if ($id !== null) {
        return $id;
    }
    $st = $pdo->query("SELECT id FROM companies WHERE slug = 'default' AND deleted_at IS NULL LIMIT 1");
    $row = $st ? $st->fetchColumn() : false;
    if ($row === false) {
        $now = time();
        $pdo->prepare('INSERT INTO companies (name, slug, created_at, updated_at) VALUES (?,?,?,?)')
            ->execute(['Default', 'default', $now, $now]);
        $id = (int) $pdo->lastInsertId();
    } else {
        $id = (int) $row;
    }

    return $id;
}

/** @return array<string, mixed>|null */
function platform_load_user_row(PDO $pdo, int $userId, bool $includeDeleted = false): ?array
{
    $sql = 'SELECT u.*, r.slug AS role_slug, r.scope AS role_scope, r.label AS role_label, r.rank AS role_rank,
            c.name AS company_name, c.slug AS company_slug
            FROM users u
            LEFT JOIN roles r ON r.id = u.role_id
            LEFT JOIN companies c ON c.id = u.company_id AND c.deleted_at IS NULL
            WHERE u.id = ?';
    if (!$includeDeleted) {
        $sql .= ' AND u.deleted_at IS NULL';
    }
    $sql .= ' LIMIT 1';
    $st = $pdo->prepare($sql);
    $st->execute([$userId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
}

/** @return array<string, mixed>|null */
function platform_load_user_by_email(PDO $pdo, string $email, bool $includeDeleted = false): ?array
{
    $sql = 'SELECT u.*, r.slug AS role_slug, r.scope AS role_scope
            FROM users u
            LEFT JOIN roles r ON r.id = u.role_id
            WHERE u.email = ?';
    if (!$includeDeleted) {
        $sql .= ' AND u.deleted_at IS NULL';
    }
    $sql .= ' LIMIT 1';
    $st = $pdo->prepare($sql);
    $st->execute([platform_normalize_email($email)]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
}

function platform_user_display_name(array $user): string
{
    $pub = trim((string) ($user['public_display_name'] ?? ''));
    if ($pub !== '') {
        return $pub;
    }
    $n = trim((string) ($user['name'] ?? '') . ' ' . (string) ($user['surname'] ?? ''));

    return $n !== '' ? $n : 'User';
}

function platform_user_auth_provider_label(array $user): string
{
    $sso = trim((string) ($user['sso_provider_id'] ?? ''));
    if ($sso !== '') {
        return str_starts_with($sso, 'google:') ? 'Google' : 'SSO';
    }
    if (!empty($user['password_hash'])) {
        return 'Email';
    }

    return '—';
}

/**
 * @return array<string, bool>
 */
function platform_user_capabilities(array $user): array
{
    $slug = (string) ($user['role_slug'] ?? '');
    $active = ($user['account_status'] ?? 'active') === 'active';
    $superAdmin = $slug === 'super_admin';
    $companyOwner = $slug === 'company_owner';
    $companyAdmin = $slug === 'company_admin';

    return [
        'super_admin' => $superAdmin,
        'company_owner' => $companyOwner,
        'company_admin' => $companyAdmin,
        'company_manager' => $slug === 'company_manager',
        'company_user' => $slug === 'company_user',
        'can_manage_team' => $active && ($companyOwner || $companyAdmin),
        'can_import_files' => $active,
        'can_promote_super_admin' => $superAdmin && platform_is_owner_email((string) ($user['email'] ?? '')),
        'is_platform_owner' => platform_is_owner_email((string) ($user['email'] ?? '')),
    ];
}

/**
 * @return list<string>
 */
function platform_nav_tabs_for_user(array $user): array
{
    $caps = platform_user_capabilities($user);
    $tabs = ['home'];
    if ($caps['super_admin']) {
        $tabs[] = 'super_admin';
    }
    if ($caps['can_manage_team']) {
        $tabs[] = 'team';
    }
    if ($caps['can_import_files']) {
        $tabs[] = 'files';
    }

    return $tabs;
}

function platform_require_session_user(): array
{
    require_once __DIR__ . '/platform-session.php';
    $uid = platform_session_user_id();
    if (!$uid) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
        exit;
    }
    $pdo = platform_pdo();
    $user = platform_load_user_row($pdo, $uid);
    if (!$user) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Unauthorized']);
        exit;
    }

    return $user;
}

function platform_require_capability(array $user, string $capability): void
{
    $caps = platform_user_capabilities($user);
    if (empty($caps[$capability])) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Forbidden']);
        exit;
    }
}

function platform_assign_user_rbac(PDO $pdo, int $userId, ?int $companyId, string $roleSlug): void
{
    $roleId = platform_role_id_by_slug($pdo, $roleSlug);
    if ($roleId === null) {
        return;
    }
    $now = time();
    $pdo->prepare('UPDATE users SET company_id = ?, role_id = ?, updated_at = ? WHERE id = ?')
        ->execute([$companyId, $roleId, $now, $userId]);
}

function platform_apply_owner_or_company_defaults(PDO $pdo, int $userId, string $email): void
{
    if (platform_is_owner_email($email)) {
        platform_assign_user_rbac($pdo, $userId, null, 'super_admin');

        return;
    }
    platform_assign_user_rbac($pdo, $userId, platform_default_company_id($pdo), 'company_user');
}

function platform_soft_delete_user(PDO $pdo, int $userId): void
{
    $now = time();
    $pdo->prepare('UPDATE users SET deleted_at = ?, updated_at = ?, account_status = ? WHERE id = ?')
        ->execute([$now, $now, 'deleted', $userId]);
}

function platform_audit_log(PDO $pdo, int $actorId, string $action, ?int $targetUserId = null, ?array $meta = null): void
{
    $json = $meta !== null ? json_encode($meta, JSON_UNESCAPED_SLASHES) : null;
    if ($json === false) {
        $json = null;
    }
    $pdo->prepare('INSERT INTO admin_audit_log (actor_user_id, action, target_user_id, meta_json, created_at) VALUES (?,?,?,?,?)')
        ->execute([$actorId, $action, $targetUserId, $json, time()]);
}

/** @return list<array<string, mixed>> */
function platform_service_catalog(): array
{
    return [
        ['service_name' => 'dashboard', 'label' => 'Dashboard'],
        ['service_name' => 'map-app', 'label' => 'Map'],
        ['service_name' => 'iris', 'label' => 'OSiris'],
        ['service_name' => '3Dobjscan', 'label' => 'Modly'],
        ['service_name' => 'carscan', 'label' => 'CarScan'],
        ['service_name' => 'disable', 'label' => 'CAD Explorer'],
    ];
}

function platform_user_service_map(PDO $pdo, int $userId): array
{
    $st = $pdo->prepare('SELECT service_name FROM service_permissions WHERE user_id = ?');
    $st->execute([$userId]);
    $map = [];
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $name) {
        $map[(string) $name] = true;
    }

    return $map;
}
