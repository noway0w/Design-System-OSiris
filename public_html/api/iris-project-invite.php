<?php
/**
 * POST { project_id, email, name?, surname?, role_slug? }
 * Invite a user to a project: existing company members are added immediately;
 * new users receive account creation + verify email and join the project after activation.
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
platform_require_capability($actor, 'can_manage_project_roster');
$pdo = platform_pdo();
$companyId = platform_require_actor_company_id($actor);
$actorId = (int) $actor['id'];

if (!platform_rate_limit_check('project_invite', 30)) {
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

$projectId = (int) ($body['project_id'] ?? 0);
$email = platform_normalize_email((string) ($body['email'] ?? ''));
$name = trim((string) ($body['name'] ?? 'Invited'));
$surname = trim((string) ($body['surname'] ?? 'User'));
if ($projectId < 1) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'project_id required']);
    exit;
}
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Valid email required']);
    exit;
}

$project = platform_require_project_access($pdo, $actor, $projectId);
$projectCompanyId = (int) ($project['company_id'] ?? 0);
if ($projectCompanyId !== $companyId) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

$roleSlug = trim((string) ($body['role_slug'] ?? 'company_user'));
$allowedRoles = ['company_admin', 'company_manager', 'company_user'];
if (!in_array($roleSlug, $allowedRoles, true)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid role']);
    exit;
}

/**
 * @return never
 */
function iris_project_invite_finish_pending(
    PDO $pdo,
    array $actor,
    int $targetId,
    string $email,
    int $projectId,
    array $project,
    string $roleSlug,
    int $actorId,
    string $name,
    string $surname,
    bool $reactivated
): void {
    $companyId = platform_require_actor_company_id($actor);
    platform_assign_user_rbac($pdo, $targetId, $companyId, $roleSlug);
    $now = time();
    $pdo->prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, created_at) VALUES (?,?,?)')
        ->execute([$projectId, $targetId, $now]);
    $pdo->prepare('INSERT OR IGNORE INTO pending_project_invites (project_id, user_id, role_slug, invited_by, created_at)
        VALUES (?,?,?,?,?)')
        ->execute([$projectId, $targetId, $roleSlug, $actorId, $now]);
    $tok = platform_create_auth_token($pdo, $targetId, 'email_verify', 48 * 3600);
    $signupUrl = null;
    $emailSent = false;
    $mailMode = null;
    if ($tok !== null) {
        $inviterName = platform_user_display_name($actor);
        $signupUrl = platform_project_invite_signup_url($tok['token']);
        $mail = platform_send_project_invite_email($email, $tok['token'], (string) $project['name'], $inviterName);
        $emailSent = !empty($mail['ok']);
        $mailMode = $mail['mode'] ?? null;
        if (!$emailSent) {
            error_log('iris-project-invite: signup email not delivered user_id=' . $targetId . ' to=' . $email . ' mode=' . ($mailMode ?? 'unknown'));
        }
    } else {
        error_log('iris-project-invite: could not create verify token user_id=' . $targetId);
    }
    $message = $emailSent
        ? 'Invitation email sent to ' . $email . '. They can create their account via the link (check spam if needed).'
        : 'Invite saved for ' . $email . ' but the email could not be sent. Copy the signup link below.';
    if ($reactivated) {
        $message = ($emailSent ? 'Account reactivated. ' : 'Account reactivated; email not sent. ')
            . $message;
    }
    $payload = [
        'ok' => true,
        'user_id' => $targetId,
        'added_to_project' => true,
        'needs_verification' => true,
        'emailSent' => $emailSent,
        'signupUrl' => $signupUrl,
        'message' => $message,
    ];
    if (!$emailSent && !empty(platform_user_capabilities($actor)['super_admin'])) {
        $payload['mailConfigured'] = platform_mail_is_configured();
        $payload['mailMode'] = $mailMode;
    }
    echo json_encode($payload);
    exit;
}

$existing = platform_load_user_by_email($pdo, $email, true);
if ($existing !== null) {
    $targetCo = (int) ($existing['company_id'] ?? 0);
    if ($targetCo > 0 && $targetCo !== $companyId) {
        http_response_code(409);
        echo json_encode(['ok' => false, 'error' => 'This email belongs to another organization']);
        exit;
    }
    $targetId = (int) $existing['id'];
    $wasRemoved = (($existing['account_status'] ?? '') === 'deleted') || !empty($existing['deleted_at']);
    if ($wasRemoved) {
        $now = time();
        $pdo->prepare('UPDATE users SET deleted_at = NULL, account_status = ?, name = ?, surname = ?, company_id = ?, updated_at = ? WHERE id = ?')
            ->execute(['pending', $name, $surname, $companyId, $now, $targetId]);
        iris_project_invite_finish_pending($pdo, $actor, $targetId, $email, $projectId, $project, $roleSlug, $actorId, $name, $surname, true);
    }
    if (($existing['account_status'] ?? '') !== 'active') {
        iris_project_invite_finish_pending($pdo, $actor, $targetId, $email, $projectId, $project, $roleSlug, $actorId, $name, $surname, false);
    }
    platform_assign_user_rbac($pdo, $targetId, $companyId, $roleSlug);
    $now = time();
    $pdo->prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, created_at) VALUES (?,?,?)')
        ->execute([$projectId, $targetId, $now]);
    $inviterName = platform_user_display_name($actor);
    $mail = platform_send_project_added_email($email, (string) $project['name'], $inviterName);
    if (empty($mail['ok'])) {
        error_log('iris-project-invite: added-member email not delivered user_id=' . $targetId . ' to=' . $email);
    }
    echo json_encode([
        'ok' => true,
        'user_id' => $targetId,
        'added_to_project' => true,
        'needs_verification' => false,
        'emailSent' => !empty($mail['ok']),
        'message' => !empty($mail['ok'])
            ? 'User already has an OSiris account. Notification sent to ' . $email . '.'
            : 'User added to the project. (Notification email could not be sent to ' . $email . '.)',
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

try {
    $ins = $pdo->prepare('INSERT INTO users (name, surname, email, password_hash, ip, location, account_status, company_id, role_id)
        VALUES (?,?,?,?,?,?,?,?,?)');
    $ins->execute([
        $name,
        $surname,
        $email,
        $randomPw,
        platform_client_ip(),
        'project-invite',
        'pending',
        $companyId,
        $roleId,
    ]);
    $uid = (int) $pdo->lastInsertId();
} catch (PDOException $e) {
    if (strpos($e->getMessage(), 'UNIQUE') === false && strpos($e->getMessage(), 'unique') === false) {
        throw $e;
    }
    $existing = platform_load_user_by_email($pdo, $email, true);
    if ($existing === null) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Could not create invite']);
        exit;
    }
    $uid = (int) $existing['id'];
}

platform_grant_default_permissions($pdo, $uid);
platform_audit_log($pdo, $actorId, 'project_invite', $uid, ['project_id' => $projectId]);

$userRow = platform_load_user_row($pdo, $uid);
if ($userRow !== null && (($userRow['account_status'] ?? '') !== 'active' || !empty($userRow['deleted_at']))) {
    if (!empty($userRow['deleted_at']) || ($userRow['account_status'] ?? '') === 'deleted') {
        $now = time();
        $pdo->prepare('UPDATE users SET deleted_at = NULL, account_status = ?, name = ?, surname = ?, company_id = ?, updated_at = ? WHERE id = ?')
            ->execute(['pending', $name, $surname, $companyId, $now, $uid]);
    }
    iris_project_invite_finish_pending($pdo, $actor, $uid, $email, $projectId, $project, $roleSlug, $actorId, $name, $surname, false);
}

platform_assign_user_rbac($pdo, $uid, $companyId, $roleSlug);
$now = time();
$pdo->prepare('INSERT OR IGNORE INTO project_members (project_id, user_id, created_at) VALUES (?,?,?)')
    ->execute([$projectId, $uid, $now]);
$inviterName = platform_user_display_name($actor);
$mail = platform_send_project_added_email($email, (string) $project['name'], $inviterName);
echo json_encode([
    'ok' => true,
    'user_id' => $uid,
    'added_to_project' => true,
    'needs_verification' => false,
    'emailSent' => !empty($mail['ok']),
    'message' => !empty($mail['ok'])
        ? 'User already has an OSiris account. Notification sent to ' . $email . '.'
        : 'User added to the project. (Notification email could not be sent.)',
]);
