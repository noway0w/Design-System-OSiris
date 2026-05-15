#!/usr/bin/env php
<?php
/**
 * Resend verification email / print link for a pending user.
 * Usage: php scripts/platform-resend-verify.php idea080905@yopmail.com
 */
declare(strict_types=1);

$email = strtolower(trim($argv[1] ?? ''));
if ($email === '') {
    fwrite(STDERR, "Usage: php scripts/platform-resend-verify.php email@example.com\n");
    exit(1);
}

require __DIR__ . '/../public_html/api/platform-auth.php';
require __DIR__ . '/../public_html/api/platform-mail.php';

$pdo = platform_pdo();
$st = $pdo->prepare('SELECT id, account_status FROM users WHERE email = ? LIMIT 1');
$st->execute([$email]);
$row = $st->fetch(PDO::FETCH_ASSOC);
if (!$row) {
    fwrite(STDERR, "No user for {$email}\n");
    exit(1);
}
if (($row['account_status'] ?? '') !== 'pending') {
    fwrite(STDERR, "User is not pending (status={$row['account_status']})\n");
    exit(1);
}

$tok = platform_create_auth_token($pdo, (int) $row['id'], 'email_verify', 48 * 3600);
if ($tok === null) {
    fwrite(STDERR, "Could not create token\n");
    exit(1);
}

$mail = platform_send_verify_email($email, $tok['token']);
echo json_encode($mail, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
exit(!empty($mail['ok']) ? 0 : 1);
