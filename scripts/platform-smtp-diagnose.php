#!/usr/bin/env php
<?php
/**
 * IONOS / SMTP connectivity diagnostic (does not print passwords).
 * Usage: php scripts/platform-smtp-diagnose.php [recipient@example.com]
 */
declare(strict_types=1);

require __DIR__ . '/../public_html/api/platform-mail.php';

$host = getenv('PLATFORM_SMTP_HOST') ?: '';
$user = getenv('PLATFORM_SMTP_USER') ?: '';
$pass = getenv('PLATFORM_SMTP_PASS') ?: '';
$to = $argv[1] ?? 'idea080912@yopmail.com';

echo "=== OSiris SMTP diagnostic ===\n";
echo "host: {$host}\n";
echo "user: {$user}\n";
echo "pass set: " . ($pass !== '' ? 'yes (len ' . strlen($pass) . ')' : 'NO') . "\n";
echo "from: " . platform_mail_from() . "\n";
echo "test recipient: {$to}\n\n";

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

$anyOk = false;
foreach ($profiles as $p) {
    echo "--- {$p['label']} ({$host}:{$p['port']}) ---\n";
    putenv('PLATFORM_SMTP_PORT=' . (string) $p['port']);
    putenv('PLATFORM_SMTP_TLS=' . $p['tls']);
    $ok = platform_send_mail_smtp($to, 'OSiris SMTP test', '<p>test</p>', 'test');
    if ($ok) {
        echo "OK: connected, authenticated, and accepted recipient {$to}\n\n";
        $anyOk = true;
    } else {
        echo "FAIL: see error_log (connect / AUTH / MAIL FROM / RCPT TO / DATA)\n";
        echo "  535 → wrong mailbox password\n";
        echo "  556 → IONOS rejected recipient domain (try another address, e.g. your Gmail)\n\n";
    }
}

if ($anyOk) {
    echo "SMTP is ready for verification emails from noreply@guillaumelassiat.com.\n";
    exit(0);
}

echo "No profile succeeded. If you only see 556, login works but IONOS blocks that recipient domain.\n";
echo "Try: php scripts/platform-smtp-diagnose.php you@gmail.com\n";
echo "Or confirm noreply@ is a full IONOS mailbox in the control panel.\n";
exit(1);
