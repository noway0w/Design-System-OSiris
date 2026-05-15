#!/usr/bin/env php
<?php
/**
 * IONOS / SMTP connectivity diagnostic (does not print passwords).
 * Usage: php scripts/platform-smtp-diagnose.php
 */
declare(strict_types=1);

require __DIR__ . '/../public_html/api/platform-mail.php';

$host = getenv('PLATFORM_SMTP_HOST') ?: '';
$user = getenv('PLATFORM_SMTP_USER') ?: '';
$pass = getenv('PLATFORM_SMTP_PASS') ?: '';

echo "=== OSiris SMTP diagnostic ===\n";
echo "host: {$host}\n";
echo "user: {$user}\n";
echo "pass set: " . ($pass !== '' ? 'yes (len ' . strlen($pass) . ')' : 'NO') . "\n";
echo "from: " . platform_mail_from() . "\n\n";

if ($host === '' || $user === '' || $pass === '') {
    echo "FAIL: Missing PLATFORM_SMTP_HOST, PLATFORM_SMTP_USER, or PLATFORM_SMTP_PASS\n";
    echo "  Host/user: public_html/api/.platform-sso.env\n";
    echo "  Password:  public_html/api/.platform-mail.secret\n";
    exit(1);
}

$profiles = [
    ['label' => '587 STARTTLS', 'port' => 587, 'tls' => 'starttls'],
    ['label' => '465 SSL', 'port' => 465, 'tls' => 'ssl'],
];

foreach ($profiles as $p) {
    echo "--- {$p['label']} ({$host}:{$p['port']}) ---\n";
    putenv('PLATFORM_SMTP_PORT=' . $p['port']);
    putenv('PLATFORM_SMTP_TLS=' . $p['tls']);
    $ok = platform_send_mail_smtp('diagnose@example.com', 'OSiris SMTP test', '<p>test</p>', 'test');
    echo $ok ? "AUTH+send pipeline: OK\n\n" : "AUTH failed (see error_log above)\n\n";
}

echo "If all profiles show AUTH failed with 535:\n";
echo "  1. In IONOS, confirm noreply@guillaumelassiat.com is a real MAILBOX (not only a forwarder).\n";
echo "  2. Reset that mailbox password in IONOS and run:\n";
echo "     /home/OSiris/scripts/setup-platform-mail.sh ionos --file /path/to/pass.txt\n";
echo "  3. Or use Resend: /home/OSiris/scripts/setup-platform-mail.sh resend re_xxx\n";
