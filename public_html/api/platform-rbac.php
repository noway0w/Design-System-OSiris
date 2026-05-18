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

/**
 * Ensure private upload root exists and is writable by the web server user.
 *
 * @return array{ok: bool, root: string, error?: string}
 */
function platform_ensure_user_files_storage_ready(): array
{
    $root = platform_user_files_storage_root();
    if (!is_dir($root)) {
        if (!@mkdir($root, 0775, true) && !is_dir($root)) {
            return ['ok' => false, 'root' => $root, 'error' => 'Could not create storage directory'];
        }
    }
    if (!is_writable($root)) {
        @chmod($root, 0775);
    }
    if (!is_writable($root)) {
        return [
            'ok' => false,
            'root' => $root,
            'error' => 'Storage directory is not writable by the web server (check permissions on ' . $root . ')',
        ];
    }

    return ['ok' => true, 'root' => $root];
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
function platform_user_has_company_context(array $user): bool
{
    if (($user['account_status'] ?? 'active') !== 'active') {
        return false;
    }
    $companyId = $user['company_id'] ?? null;
    if ($companyId !== null && $companyId !== '') {
        return true;
    }

    return (string) ($user['role_slug'] ?? '') === 'super_admin';
}

function platform_user_capabilities(array $user): array
{
    $slug = (string) ($user['role_slug'] ?? '');
    $active = ($user['account_status'] ?? 'active') === 'active';
    $superAdmin = $slug === 'super_admin';
    $companyOwner = $slug === 'company_owner';
    $companyAdmin = $slug === 'company_admin';
    $hasCompany = platform_user_has_company_context($user);
    $canManageProjectMeta = $active && ($companyOwner || $companyAdmin || $superAdmin);
    $canManageProjectRoster = $active && ($canManageProjectMeta || $slug === 'company_manager');

    return [
        'super_admin' => $superAdmin,
        'company_owner' => $companyOwner,
        'company_admin' => $companyAdmin,
        'company_manager' => $slug === 'company_manager',
        'company_user' => $slug === 'company_user',
        'can_manage_team' => $active && ($companyOwner || $companyAdmin || $superAdmin),
        'can_delete_team_users' => $active && ($companyOwner || $companyAdmin || $superAdmin),
        'can_purge_team_users' => $superAdmin && $active,
        'can_import_files' => $active,
        'can_access_projects' => $hasCompany,
        'can_create_project' => $hasCompany,
        'can_manage_project_roster' => $canManageProjectRoster,
        'can_manage_project_services' => $canManageProjectMeta,
        'can_delete_project' => $canManageProjectMeta,
        'can_promote_super_admin' => $superAdmin && platform_is_owner_email((string) ($user['email'] ?? '')),
        'is_platform_owner' => platform_is_owner_email((string) ($user['email'] ?? '')),
    ];
}

/** @return array<string, mixed>|null */
function platform_load_project_row(PDO $pdo, int $projectId, bool $includeDeleted = false): ?array
{
    $sql = 'SELECT * FROM projects WHERE id = ?';
    if (!$includeDeleted) {
        $sql .= ' AND deleted_at IS NULL';
    }
    $sql .= ' LIMIT 1';
    $st = $pdo->prepare($sql);
    $st->execute([$projectId]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    return $row ?: null;
}

function platform_require_actor_company_id(array $user): int
{
    $companyId = $user['company_id'] ?? null;
    if ($companyId !== null && $companyId !== '') {
        return (int) $companyId;
    }
    if ((string) ($user['role_slug'] ?? '') === 'super_admin') {
        return platform_default_company_id(platform_pdo());
    }
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'No company assigned']);
    exit;
}

/**
 * @return array<string, mixed>
 */
function platform_assert_project_in_company(PDO $pdo, int $projectId, int $companyId): array
{
    $project = platform_load_project_row($pdo, $projectId);
    if ($project === null || (int) ($project['company_id'] ?? 0) !== $companyId) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'Project not found']);
        exit;
    }

    return $project;
}

function platform_user_is_project_member(PDO $pdo, int $userId, int $projectId): bool
{
    $st = $pdo->prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ? LIMIT 1');
    $st->execute([$projectId, $userId]);

    return (bool) $st->fetchColumn();
}

/** Platform super_admin: global project visibility for oversight (not membership-gated). */
function platform_user_has_global_project_oversight(array $user): bool
{
    return !empty(platform_user_capabilities($user)['super_admin']);
}

/**
 * Load project for actor: super_admin may access any project; others require membership.
 *
 * @return array<string, mixed>
 */
function platform_require_project_access(PDO $pdo, array $actor, int $projectId): array
{
    if (platform_user_has_global_project_oversight($actor)) {
        $project = platform_load_project_row($pdo, $projectId);
        if ($project === null) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'Project not found']);
            exit;
        }

        return $project;
    }

    return platform_require_project_member($pdo, $actor, $projectId);
}

function platform_actor_company_id(array $user): ?int
{
    $companyId = $user['company_id'] ?? null;
    if ($companyId !== null && $companyId !== '') {
        return (int) $companyId;
    }
    if ((string) ($user['role_slug'] ?? '') === 'super_admin') {
        return platform_default_company_id(platform_pdo());
    }

    return null;
}

function platform_user_has_company_project_access(PDO $pdo, array $user, int $projectId): bool
{
    if (platform_user_has_global_project_oversight($user)) {
        return platform_load_project_row($pdo, $projectId) !== null;
    }
    $uid = (int) ($user['id'] ?? 0);
    if ($uid < 1) {
        return false;
    }
    $project = platform_load_project_row($pdo, $projectId);
    if ($project === null) {
        return false;
    }
    $companyId = platform_actor_company_id($user);
    if ($companyId === null || (int) ($project['company_id'] ?? 0) !== $companyId) {
        return false;
    }

    return platform_user_is_project_member($pdo, $uid, $projectId);
}

/**
 * @return array<string, mixed>
 */
function platform_require_project_member(PDO $pdo, array $actor, int $projectId): array
{
    $companyId = platform_require_actor_company_id($actor);
    $project = platform_assert_project_in_company($pdo, $projectId, $companyId);
    $uid = (int) ($actor['id'] ?? 0);
    if ($uid < 1 || !platform_user_is_project_member($pdo, $uid, $projectId)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Not a project member']);
        exit;
    }

    return $project;
}

function platform_user_can_read_file(PDO $pdo, array $user, array $fileRow): bool
{
    if (!empty($fileRow['deleted_at'])) {
        return false;
    }
    if (platform_user_has_global_project_oversight($user)) {
        return true;
    }
    $uid = (int) ($user['id'] ?? 0);
    $fileUserId = (int) ($fileRow['user_id'] ?? 0);
    $projectId = $fileRow['project_id'] ?? null;

    if ($projectId === null || $projectId === '') {
        return $uid > 0 && $uid === $fileUserId;
    }

    return platform_user_is_project_member($pdo, $uid, (int) $projectId);
}

function platform_user_can_write_file(PDO $pdo, array $user, ?int $projectId): bool
{
    if (($user['account_status'] ?? 'active') !== 'active') {
        return false;
    }
    if ($projectId === null || $projectId < 1) {
        return false;
    }

    return platform_user_has_company_project_access($pdo, $user, $projectId);
}

/**
 * @return array{where: string, params: list<int|string>}
 */
function platform_files_list_sql_for_user(array $user): array
{
    $uid = (int) ($user['id'] ?? 0);
    if ($uid < 1) {
        return ['where' => '1 = 0', 'params' => []];
    }
    $companyId = (int) ($user['company_id'] ?? 0);
    if ($companyId < 1 && (string) ($user['role_slug'] ?? '') === 'super_admin') {
        $companyId = platform_default_company_id(platform_pdo());
    }
    $where = 'f.deleted_at IS NULL AND (
        (f.project_id IS NULL AND f.user_id = ?)
        OR (
            f.project_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM project_members pm
                INNER JOIN projects p ON p.id = pm.project_id AND p.deleted_at IS NULL
                WHERE pm.project_id = f.project_id AND pm.user_id = ?
            )
        )';
    $params = [$uid, $uid];
    if ($companyId > 0) {
        $where .= ' AND (f.company_id IS NULL OR f.company_id = ?)';
        $params[] = $companyId;
    }
    $where .= ')';

    return ['where' => $where, 'params' => $params];
}

/** @return list<string> */
function platform_allowed_upload_extensions(): array
{
    return ['jpeg', 'jpg', 'png', 'iges', 'step', 'dxf', 'ifc', '3dm', 'dwg', 'glb', 'mp4', 'mov', 'avi'];
}

function platform_validate_upload_extension(string $filename): bool
{
    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    if ($ext === '') {
        return false;
    }

    return in_array($ext, platform_allowed_upload_extensions(), true);
}

/** @return list<array<string, mixed>> */
function platform_project_workspace_services(): array
{
    $out = [];
    foreach (platform_service_catalog() as $svc) {
        if (($svc['service_name'] ?? '') === 'dashboard') {
            continue;
        }
        $out[] = $svc;
    }

    return $out;
}

/**
 * @return list<string>
 */
function platform_nav_tabs_for_user(array $user): array
{
    $caps = platform_user_capabilities($user);
    $tabs = [];
    if (!empty($caps['can_access_projects'])) {
        $tabs[] = 'projects';
    }
    $tabs[] = 'home';
    if ($caps['super_admin']) {
        $tabs[] = 'super_admin';
    }
    if ($caps['can_manage_team']) {
        $tabs[] = 'team';
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

function platform_provision_independent_workspace(PDO $pdo, int $userId, string $displayName): int
{
    $now = time();
    $baseSlug = preg_replace('/[^a-z0-9]+/', '-', strtolower(trim($displayName))) ?: 'workspace';
    $baseSlug = trim($baseSlug, '-') ?: 'workspace';
    $slug = $baseSlug . '-' . $userId;
    $companyName = trim($displayName) !== '' ? trim($displayName) . ' Workspace' : 'My Workspace';

    $pdo->prepare('INSERT INTO companies (name, slug, created_at, updated_at) VALUES (?,?,?,?)')
        ->execute([$companyName, $slug, $now, $now]);
    $companyId = (int) $pdo->lastInsertId();

    platform_assign_user_rbac($pdo, $userId, $companyId, 'company_owner');

    $pdo->prepare('INSERT INTO projects (company_id, name, description, status, created_at, updated_at)
        VALUES (?,?,?,?,?,?)')
        ->execute([$companyId, 'General', 'Default collaboration project', 'active', $now, $now]);
    $projectId = (int) $pdo->lastInsertId();
    $pdo->prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, created_at) VALUES (?,?,?)')
        ->execute([$projectId, $userId, $now]);

    return $companyId;
}

function platform_apply_owner_or_company_defaults(PDO $pdo, int $userId, string $email): void
{
    if (platform_is_owner_email($email)) {
        platform_assign_user_rbac($pdo, $userId, null, 'super_admin');

        return;
    }
    $row = platform_load_user_row($pdo, $userId, true);
    $displayName = $row ? platform_user_display_name($row) : 'User';
    platform_provision_independent_workspace($pdo, $userId, $displayName);
}

function platform_soft_delete_user(PDO $pdo, int $userId): void
{
    $now = time();
    $pdo->prepare('UPDATE users SET deleted_at = ?, updated_at = ?, account_status = ? WHERE id = ?')
        ->execute([$now, $now, 'deleted', $userId]);
}

function platform_reactivate_user(PDO $pdo, int $userId): void
{
    $row = platform_load_user_row($pdo, $userId, true);
    if ($row === null) {
        return;
    }
    $verified = $row['email_verified_at'] ?? null;
    $status = ($verified !== null && $verified !== '') ? 'active' : 'pending';
    $now = time();
    $pdo->prepare('UPDATE users SET deleted_at = NULL, account_status = ?, updated_at = ? WHERE id = ?')
        ->execute([$status, $now, $userId]);
}

/** Why this team member cannot be removed; null if removal is allowed. */
function platform_team_remove_blocked_reason(array $actor, array $target): ?string
{
    $actorId = (int) ($actor['id'] ?? 0);
    $targetId = (int) ($target['id'] ?? 0);
    if ($targetId < 1 || $targetId === $actorId) {
        return 'Cannot delete your own account';
    }
    if ((string) ($target['role_slug'] ?? '') === 'super_admin' && !platform_is_owner_email((string) ($actor['email'] ?? ''))) {
        return 'Cannot remove a platform Super Admin';
    }

    return null;
}

function platform_hard_delete_user(PDO $pdo, int $userId): void
{
    $pdo->prepare('DELETE FROM platform_auth_tokens WHERE user_id = ?')->execute([$userId]);
    $pdo->prepare('DELETE FROM pending_project_invites WHERE user_id = ?')->execute([$userId]);
    $pdo->prepare('DELETE FROM project_members WHERE user_id = ?')->execute([$userId]);
    $pdo->prepare('DELETE FROM service_permissions WHERE user_id = ?')->execute([$userId]);
    $pdo->prepare('DELETE FROM user_files WHERE user_id = ?')->execute([$userId]);
    $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$userId]);
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
