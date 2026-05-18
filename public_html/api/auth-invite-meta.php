<?php
/**
 * GET ?token=... — metadata for project invite signup (does not consume token).
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/platform-auth.php';
require_once __DIR__ . '/platform-rbac.php';

$token = trim((string) ($_GET['token'] ?? ''));
if ($token === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'token required']);
    exit;
}

$pdo = platform_pdo();
$peek = platform_peek_auth_token($pdo, $token, 'email_verify');
if ($peek === null) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'This invitation link is invalid or has expired.']);
    exit;
}

$user = platform_load_user_row($pdo, $peek['user_id']);
if ($user === null || ($user['account_status'] ?? '') !== 'pending') {
    http_response_code(409);
    echo json_encode(['ok' => false, 'error' => 'This invitation has already been used. Sign in instead.']);
    exit;
}

$st = $pdo->prepare('SELECT p.name AS project_name, u.name AS inviter_name, u.surname AS inviter_surname
    FROM pending_project_invites ppi
    INNER JOIN projects p ON p.id = ppi.project_id AND p.deleted_at IS NULL
    LEFT JOIN users u ON u.id = ppi.invited_by
    WHERE ppi.user_id = ? AND ppi.fulfilled_at IS NULL
    ORDER BY ppi.created_at DESC
    LIMIT 1');
$st->execute([(int) $user['id']]);
$inviteRow = $st->fetch(PDO::FETCH_ASSOC);

$inviterName = '';
if ($inviteRow) {
    $inviterName = trim((string) ($inviteRow['inviter_name'] ?? '') . ' ' . (string) ($inviteRow['inviter_surname'] ?? ''));
}

echo json_encode([
    'ok' => true,
    'email' => (string) ($user['email'] ?? ''),
    'name' => (string) ($user['name'] ?? ''),
    'surname' => (string) ($user['surname'] ?? ''),
    'project_name' => trim((string) ($inviteRow['project_name'] ?? '')) !== '' ? (string) $inviteRow['project_name'] : 'your project',
    'inviter_name' => $inviterName !== '' ? $inviterName : 'A teammate',
]);
