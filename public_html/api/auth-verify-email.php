<?php
/**
 * GET ?token=... — activate pending account and redirect to login.
 */
declare(strict_types=1);

require_once __DIR__ . '/platform-auth.php';

$token = trim((string) ($_GET['token'] ?? ''));
if ($token === '') {
    header('Location: /login/?error=verify_missing', true, 302);
    exit;
}

$pdo = platform_pdo();
$consumed = platform_consume_auth_token($pdo, $token, 'email_verify');
if ($consumed === null) {
    header('Location: /login/?error=verify_invalid', true, 302);
    exit;
}

$joined = platform_activate_user($pdo, $consumed['user_id']);
$redirect = '/login/?verified=1';
if (count($joined) === 1) {
    $redirect .= '&project_id=' . (int) $joined[0];
} elseif (count($joined) > 1) {
    $redirect .= '&project_id=' . (int) $joined[0];
}
header('Location: ' . $redirect, true, 302);
exit;
