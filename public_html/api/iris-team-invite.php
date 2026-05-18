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
$companyId = (int) ($actor['company_id'] ?? 0);
if ($companyId < 1) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'No company assigned']);
    exit;
}

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

if (platform_load_user_by_email($pdo, $email, true)) {
    http_response_code(409);
    echo json_encode(['ok' => false, 'error' => 'An account with this email already exists']);
    exit;
}

$roleId = platform_role_id_by_slug($pdo, 'company_user');
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

$tok = platform_create_auth_token($pdo, $uid, 'email_verify', 48 * 3600);
if ($tok === null) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Could not create verification token']);
    exit;
}

$mail = platform_send_verify_email($email, $tok['token']);
if (empty($mail['ok'])) {
    error_log('iris-team-invite: email not delivered user_id=' . $uid . ' (mode=' . ($mail['mode'] ?? 'unknown') . ')');
}

platform_audit_log($pdo, (int) $actor['id'], 'team_invite', $uid);

echo json_encode([
    'ok' => true,
    'user_id' => $uid,
    'emailSent' => !empty($mail['ok']),
]);
