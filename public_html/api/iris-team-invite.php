<?php
/**
 * POST { email, name?, surname? } — invite user into actor's company (pending + verify email).
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST only']);
    exit;
}

require_once __DIR__ . '/platform-auth.php';
require_once __DIR__ . '/platform-mail.php';
require_once __DIR__ . '/platform-rbac.php';

$actor = platform_require_session_user();
platform_require_capability($actor, 'can_manage_team');
$pdo = platform_pdo();
$companyId = platform_require_actor_company_id($actor);

if (!platform_rate_limit_check('team_invite', 20)) {
    http_response_code(429);
    echo json_encode(['ok' => false, 'error' => 'Too many invites. Try again later.']);
    exit;
}

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

$email = platform_normalize_email((string) ($body['email'] ?? ''));
$name = trim((string) ($body['name'] ?? 'Invited'));
$surname = trim((string) ($body['surname'] ?? 'User'));
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Valid email required']);
    exit;
}

$roleSlug = trim((string) ($body['role_slug'] ?? ''));
if ($roleSlug === '' && !empty($body['role_id'])) {
    $rSt = $pdo->prepare("SELECT slug FROM roles WHERE id = ? AND scope = 'company' LIMIT 1");
    $rSt->execute([(int) $body['role_id']]);
    $found = $rSt->fetchColumn();
    $roleSlug = $found !== false ? (string) $found : '';
}
if ($roleSlug === '') {
    $roleSlug = 'company_user';
}

$allowedInvite = ['company_admin', 'company_manager', 'company_user', 'company_owner'];
if (!in_array($roleSlug, $allowedInvite, true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid role']);
    exit;
}
if ($roleSlug === 'company_owner' && (string) ($actor['role_slug'] ?? '') !== 'company_owner') {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Only owners can invite with the Owner role']);
    exit;
}

$existing = platform_load_user_by_email($pdo, $email, true);
if ($existing !== null) {
    $existingCo = (int) ($existing['company_id'] ?? 0);
    if ($existingCo > 0 && $existingCo !== $companyId) {
        http_response_code(409);
        echo json_encode(['ok' => false, 'error' => 'This email belongs to another organization']);
        exit;
    }
    if (($existing['account_status'] ?? '') === 'active' && empty($existing['deleted_at'])) {
        http_response_code(409);
        echo json_encode(['ok' => false, 'error' => 'An account with this email already exists']);
        exit;
    }
    $uid = (int) $existing['id'];
    $now = time();
    $pdo->prepare('UPDATE users SET deleted_at = NULL, account_status = ?, name = ?, surname = ?, company_id = ?, updated_at = ? WHERE id = ?')
        ->execute(['pending', $name, $surname, $companyId, $now, $uid]);
    platform_assign_user_rbac($pdo, $uid, $companyId, $roleSlug);
    platform_grant_default_permissions($pdo, $uid);
    $tok = platform_create_auth_token($pdo, $uid, 'email_verify', 48 * 3600);
    if ($tok === null) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Could not create verification token']);
        exit;
    }
    $coName = 'OSiris';
    $coSt = $pdo->prepare('SELECT name FROM companies WHERE id = ? LIMIT 1');
    $coSt->execute([$companyId]);
    $found = $coSt->fetchColumn();
    if (is_string($found) && $found !== '') {
        $coName = $found;
    }
    $mail = platform_send_project_invite_email($email, $tok['token'], $coName, platform_user_display_name($actor));
    if (empty($mail['ok'])) {
        error_log('iris-team-invite: email not delivered user_id=' . $uid . ' to=' . $email);
    }
    platform_audit_log($pdo, (int) $actor['id'], 'team_invite', $uid);
    echo json_encode([
        'ok' => true,
        'user_id' => $uid,
        'emailSent' => !empty($mail['ok']),
        'signupUrl' => platform_project_invite_signup_url($tok['token']),
        'message' => !empty($mail['ok'])
            ? 'Invitation email sent to ' . $email . '.'
            : 'Invite saved but email could not be sent. Share the signup link manually.',
    ]);
    exit;
}

$roleId = platform_role_id_by_slug($pdo, $roleSlug);
if ($roleId === null) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid role']);
    exit;
}

$randomPw = password_hash(bin2hex(random_bytes(24)), PASSWORD_DEFAULT);
if ($randomPw === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not create invite']);
    exit;
}

$ins = $pdo->prepare('INSERT INTO users (name, surname, email, password_hash, ip, location, account_status, company_id, role_id) VALUES (?,?,?,?,?,?,?,?,?)');
$ins->execute([
    $name,
    $surname,
    $email,
    $randomPw,
    platform_client_ip(),
    'team-invite',
    'pending',
    $companyId,
    $roleId,
]);
$uid = (int) $pdo->lastInsertId();
platform_grant_default_permissions($pdo, $uid);

$tok = platform_create_auth_token($pdo, $uid, 'email_verify', 48 * 3600);
if ($tok === null) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not create verification token']);
    exit;
}

$coName = 'OSiris';
$coSt = $pdo->prepare('SELECT name FROM companies WHERE id = ? LIMIT 1');
$coSt->execute([$companyId]);
$found = $coSt->fetchColumn();
if (is_string($found) && $found !== '') {
    $coName = $found;
}
$signupUrl = platform_project_invite_signup_url($tok['token']);
$mail = platform_send_project_invite_email($email, $tok['token'], $coName, platform_user_display_name($actor));
if (empty($mail['ok'])) {
    error_log('iris-team-invite: email not delivered user_id=' . $uid . ' to=' . $email . ' mode=' . ($mail['mode'] ?? 'unknown'));
}

platform_audit_log($pdo, (int) $actor['id'], 'team_invite', $uid);

echo json_encode([
    'ok' => true,
    'user_id' => $uid,
    'emailSent' => !empty($mail['ok']),
    'signupUrl' => $signupUrl,
    'message' => !empty($mail['ok'])
        ? 'Invitation email sent to ' . $email . '. They can create their account via the link.'
        : 'User created but email could not be sent. Share the signup link manually.',
]);
