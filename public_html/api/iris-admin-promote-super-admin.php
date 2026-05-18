<?php
/**
 * POST { email } — platform owners only; grants super_admin.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST only']);
    exit;
}

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-rbac.php';

$actor = platform_require_session_user();
platform_require_capability($actor, 'can_promote_super_admin');

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

$email = platform_normalize_email((string) ($body['email'] ?? ''));
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Valid email required']);
    exit;
}

if (!platform_is_owner_email($email)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Only platform owner emails can be promoted to Super Admin']);
    exit;
}

$pdo = platform_pdo();
$target = platform_load_user_by_email($pdo, $email);
if (!$target) {
    http_response_code(404);
    echo json_encode(['ok' => false, 'error' => 'User not found']);
    exit;
}

platform_assign_user_rbac($pdo, (int) $target['id'], null, 'super_admin');
platform_audit_log($pdo, (int) $actor['id'], 'promote_super_admin', (int) $target['id']);

echo json_encode(['ok' => true, 'user_id' => (int) $target['id']]);
