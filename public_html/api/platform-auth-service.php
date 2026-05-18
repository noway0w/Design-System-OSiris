<?php
/**
 * Central auth operations (credentials, activation) — HTTP adapters stay thin.
 */
declare(strict_types=1);

require_once __DIR__ . '/platform-auth.php';
require_once __DIR__ . '/platform-rbac.php';

/**
 * @return array{ok: true, user: array<string, mixed>}|array{ok: false, error: string, code?: string, email?: string}
 */
function platform_auth_login(string $email, string $password): array
{
    $pdo = platform_pdo();
    $row = platform_load_user_by_email($pdo, $email);
    if (!$row || empty($row['password_hash']) || !password_verify($password, (string) $row['password_hash'])) {
        return ['ok' => false, 'error' => 'Invalid credentials'];
    }
    if (($row['account_status'] ?? 'active') === 'pending') {
        return [
            'ok' => false,
            'error' => 'Please verify your email before signing in. Check your inbox for the activation link.',
            'code' => 'pending_verify',
            'email' => $row['email'],
        ];
    }
    if (!platform_user_is_active($row)) {
        return ['ok' => false, 'error' => 'Invalid credentials'];
    }

    return ['ok' => true, 'user' => platform_auth_public_user($row)];
}

/**
 * @return array<string, mixed>
 */
function platform_auth_public_user(array $row): array
{
    $caps = platform_user_capabilities($row);

    return [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'surname' => $row['surname'],
        'email' => $row['email'],
        'role' => [
            'slug' => $row['role_slug'] ?? null,
            'label' => $row['role_label'] ?? null,
            'scope' => $row['role_scope'] ?? null,
        ],
        'company' => !empty($row['company_id']) ? [
            'id' => (int) $row['company_id'],
            'name' => $row['company_name'] ?? null,
            'slug' => $row['company_slug'] ?? null,
        ] : null,
        'capabilities' => $caps,
    ];
}

function platform_auth_issue_session(int $userId): void
{
    require_once __DIR__ . '/platform-session.php';
    platform_session_set_user_id($userId);
}
