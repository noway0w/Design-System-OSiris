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

platform_activate_user($pdo, $consumed['user_id']);
header('Location: /login/?verified=1', true, 302);
exit;
