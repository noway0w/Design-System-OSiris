<?php
/**
 * Outbound mail for verification and password reset.
 */
declare(strict_types=1);

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-mail-secrets.php';
require_once __DIR__ . '/platform-mail-smtp.php';
require_once __DIR__ . '/platform-mail-gmail.php';

platform_mail_bootstrap_secrets();

function platform_mail_from(): string
{
    $gmailFrom = platform_gmail_mail_from_address();
    if ($gmailFrom !== null && (getenv('PLATFORM_MAIL_PROVIDER') ?: '') === 'gmail') {
        return 'OSiris <' . $gmailFrom . '>';
    }
    $from = getenv('PLATFORM_MAIL_FROM');
    if (is_string($from) && $from !== '') {
        return $from;
    }

    return 'noreply@osiris.local';
}

function platform_smtp_configured(): bool
{
    $host = getenv('PLATFORM_SMTP_HOST') ?: '';
    $user = getenv('PLATFORM_SMTP_USER') ?: '';
    $pass = getenv('PLATFORM_SMTP_PASS') ?: '';

    return $host !== '' && $user !== '' && $pass !== '';
}

function platform_resend_configured(): bool
{
    $key = getenv('PLATFORM_RESEND_API_KEY') ?: '';

    return $key !== '';
}

function platform_mail_dev_log_enabled(): bool
{
    $v = getenv('PLATFORM_MAIL_DEV_LOG');

    return is_string($v) && in_array(strtolower($v), ['1', 'true', 'yes'], true);
}

function platform_mail_expose_verify_link(): bool
{
    $v = getenv('PLATFORM_MAIL_DEV_EXPOSE_LINK');

    return is_string($v) && in_array(strtolower($v), ['1', 'true', 'yes'], true);
}

function platform_mail_outbox_append(string $to, string $subject, string $textBody): void
{
    $dir = __DIR__ . '/.mail-outbox';
    if (!is_dir($dir)) {
        @mkdir($dir, 0770, true);
    }
    if (!is_dir($dir) || !is_writable($dir)) {
        return;
    }
    $line = date('c') . "\t{$to}\t{$subject}\t" . str_replace(["\r", "\n"], ' ', $textBody) . "\n";
    @file_put_contents($dir . '/' . date('Y-m-d') . '.log', $line, FILE_APPEND | LOCK_EX);
}

function platform_send_mail_resend(string $to, string $subject, string $htmlBody, string $textBody): bool
{
    $key = getenv('PLATFORM_RESEND_API_KEY') ?: '';
    $from = platform_mail_from();
    $payload = json_encode([
        'from' => $from,
        'to' => [$to],
        'subject' => $subject,
        'html' => $htmlBody,
        'text' => $textBody,
    ], JSON_UNESCAPED_SLASHES);
    if (!is_string($payload)) {
        return false;
    }
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Authorization: Bearer {$key}\r\nContent-Type: application/json\r\n",
            'content' => $payload,
            'timeout' => 20,
            'ignore_errors' => true,
        ],
    ]);
    $out = @file_get_contents('https://api.resend.com/emails', false, $ctx);
    $code = 0;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
        $code = (int) $m[1];
    }
    if ($code < 200 || $code >= 300) {
        error_log('platform_send_mail_resend: HTTP ' . $code . ' ' . (is_string($out) ? substr($out, 0, 300) : ''));

        return false;
    }

    return true;
}

/**
 * @return array{ok: bool, mode: string}
 */
function platform_send_mail(string $to, string $subject, string $htmlBody, string $textBody = ''): array
{
    if ($textBody === '') {
        $textBody = strip_tags(str_replace(['<br>', '<br/>', '<br />'], "\n", $htmlBody));
    }

    $provider = strtolower((string) (getenv('PLATFORM_MAIL_PROVIDER') ?: ''));
    if ($provider === 'resend' || ($provider === '' && platform_resend_configured())) {
        if (platform_send_mail_resend($to, $subject, $htmlBody, $textBody)) {
            return ['ok' => true, 'mode' => 'resend'];
        }
    }
    if ($provider === 'gmail' || ($provider === '' && platform_gmail_mail_configured())) {
        if (platform_send_mail_gmail_api($to, $subject, $htmlBody, $textBody)) {
            return ['ok' => true, 'mode' => 'gmail_api'];
        }
    }
    if ($provider === 'smtp' || ($provider === '' && platform_smtp_configured())) {
        if (platform_send_mail_smtp($to, $subject, $htmlBody, $textBody)) {
            return ['ok' => true, 'mode' => 'smtp'];
        }
    }

    $logDev = platform_mail_dev_log_enabled() || !platform_smtp_configured();
    error_log('[OSiris mail] To: ' . $to . ' | Subject: ' . $subject . "\n" . $textBody);
    platform_mail_outbox_append($to, $subject, $textBody);
    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'From: ' . platform_mail_from(),
    ];
    $sent = @mail($to, $subject, $htmlBody, implode("\r\n", $headers));
    if ($sent) {
        return ['ok' => true, 'mode' => 'mail'];
    }
    if ($logDev) {
        return ['ok' => false, 'mode' => 'dev_log'];
    }

    return ['ok' => false, 'mode' => 'none'];
}

function platform_mail_button(string $href, string $label): string
{
    $href = htmlspecialchars($href, ENT_QUOTES, 'UTF-8');
    $label = htmlspecialchars($label, ENT_QUOTES, 'UTF-8');

    return '<p style="margin:24px 0;"><a href="' . $href . '" style="display:inline-block;padding:12px 24px;background:#0a1422;color:#fff;text-decoration:none;border-radius:9999px;font-weight:600;">' . $label . '</a></p>';
}

function platform_verify_email_url(string $token): string
{
    return platform_public_base_url() . '/api/auth-verify-email.php?token=' . rawurlencode($token);
}

function platform_reset_email_url(string $token): string
{
    return platform_public_base_url() . '/login/reset/?token=' . rawurlencode($token);
}

/**
 * @return array{ok: bool, mode: string, verifyUrl: string}
 */
function platform_send_verify_email(string $to, string $token): array
{
    $url = platform_verify_email_url($token);
    $text = "Confirm your OSiris account:\n{$url}\n\nThis link expires in 48 hours.";
    $html = '<p>Confirm your OSiris account by clicking the button below. This link expires in 48 hours.</p>'
        . platform_mail_button($url, 'Confirm email')
        . '<p style="color:#666;font-size:12px;">If you did not create an account, you can ignore this message.</p>';
    $result = platform_send_mail($to, 'Confirm your OSiris account', $html, $text);
    $result['verifyUrl'] = $url;

    return $result;
}

/**
 * @return array{ok: bool, mode: string, resetUrl: string}
 */
function platform_send_reset_email(string $to, string $token): array
{
    $url = platform_reset_email_url($token);
    $text = "Reset your OSiris password:\n{$url}\n\nThis link expires in 1 hour.";
    $html = '<p>Reset your OSiris password using the button below. This link expires in 1 hour.</p>'
        . platform_mail_button($url, 'Reset password')
        . '<p style="color:#666;font-size:12px;">If you did not request a reset, you can ignore this message.</p>';
    $result = platform_send_mail($to, 'Reset your OSiris password', $html, $text);
    $result['resetUrl'] = $url;

    return $result;
}
