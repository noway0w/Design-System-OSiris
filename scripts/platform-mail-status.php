#!/usr/bin/env php
<?php
/**
 * Mail configuration diagnostic (no secrets printed).
 * Usage: php scripts/platform-mail-status.php
 */
declare(strict_types=1);

require __DIR__ . '/../public_html/api/platform-mail.php';

$provider = strtolower((string) (getenv('PLATFORM_MAIL_PROVIDER') ?: ''));
$from = platform_mail_from();
$resendLen = strlen(getenv('PLATFORM_RESEND_API_KEY') ?: '');
$smtpPassLen = strlen(getenv('PLATFORM_SMTP_PASS') ?: '');
$smtpHost = getenv('PLATFORM_SMTP_HOST') ?: '';
$smtpUser = getenv('PLATFORM_SMTP_USER') ?: '';

echo "=== OSiris mail status ===\n";
echo "provider: " . ($provider !== '' ? $provider : '(unset)') . "\n";
echo "from: {$from}\n";
echo "resend_key: " . ($resendLen > 0 ? "yes (len {$resendLen})" : 'NO') . "\n";
echo "smtp: host={$smtpHost} user={$smtpUser} pass=" . ($smtpPassLen > 0 ? "yes (len {$smtpPassLen})" : 'NO') . "\n";
echo "smtp_configured: " . (platform_smtp_configured() ? 'yes' : 'no') . "\n";
echo "resend_configured: " . (platform_resend_configured() ? 'yes' : 'no') . "\n";
echo "gmail_api_configured: " . (platform_gmail_mail_configured() ? 'yes' : 'no') . "\n";
echo "dev_expose_link: " . (platform_mail_expose_verify_link() ? 'yes' : 'no') . "\n";

$outbox = __DIR__ . '/../public_html/api/.mail-outbox';
$lines = 0;
if (is_dir($outbox)) {
    foreach (glob($outbox . '/*.log') ?: [] as $log) {
        $n = @file($log, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        $lines += is_array($n) ? count($n) : 0;
    }
}
echo "outbox_fallback_lines: {$lines}\n";

if ($provider === 'resend' && $resendLen === 0) {
    echo "\nWARN: PLATFORM_MAIL_PROVIDER=resend but no API key loaded (check .platform-mail.secret + nginx ACL).\n";
    exit(1);
}
if ($provider === 'smtp' && $smtpPassLen === 0) {
    echo "\nWARN: PLATFORM_MAIL_PROVIDER=smtp but SMTP password is empty.\n";
    exit(1);
}

exit(0);
