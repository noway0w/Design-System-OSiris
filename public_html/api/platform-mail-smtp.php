<?php
/**
 * SMTP client for platform mail (OVH / Gmail / generic).
 */
declare(strict_types=1);

function platform_smtp_read_response($fp): array
{
    $lines = [];
    while (true) {
        $line = @fgets($fp, 8192);
        if (!is_string($line)) {
            break;
        }
        $lines[] = $line;
        if (strlen($line) >= 4 && $line[3] === ' ') {
            break;
        }
    }
    $last = $lines ? $lines[count($lines) - 1] : '';
    $code = (int) substr($last, 0, 3);

    return ['code' => $code, 'lines' => $lines, 'last' => $last];
}

function platform_smtp_expect($fp, array $okCodes, string $step): bool
{
    $r = platform_smtp_read_response($fp);
    if (!in_array($r['code'], $okCodes, true)) {
        error_log('platform_smtp ' . $step . ' failed: ' . trim($r['last']));

        return false;
    }

    return true;
}

function platform_mail_extract_address(string $from): string
{
    if (preg_match('/<([^>]+)>/', $from, $m)) {
        return trim($m[1]);
    }

    return trim($from);
}

function platform_smtp_cmd($fp, string $cmd, array $okCodes, string $step): bool
{
    @fwrite($fp, $cmd . "\r\n");

    return platform_smtp_expect($fp, $okCodes, $step);
}

function platform_smtp_authenticate($fp, string $user, string $pass): bool
{
    if (platform_smtp_cmd($fp, 'AUTH LOGIN', [334], 'auth-login')
        && platform_smtp_cmd($fp, base64_encode($user), [334], 'auth-user')
        && platform_smtp_cmd($fp, base64_encode($pass), [235], 'auth-pass')) {
        return true;
    }
    $plain = base64_encode("\0{$user}\0{$pass}");

    return platform_smtp_cmd($fp, 'AUTH PLAIN ' . $plain, [235], 'auth-plain');
}

function platform_send_mail_smtp(string $to, string $subject, string $htmlBody, string $textBody): bool
{
    $host = getenv('PLATFORM_SMTP_HOST') ?: '';
    $port = (int) (getenv('PLATFORM_SMTP_PORT') ?: 587);
    $user = getenv('PLATFORM_SMTP_USER') ?: '';
    $pass = getenv('PLATFORM_SMTP_PASS') ?: '';
    $from = platform_mail_from();
    if ($host === '' || $user === '' || $pass === '') {
        error_log('platform_send_mail_smtp: missing host, user, or pass');

        return false;
    }

    $tlsMode = strtolower((string) (getenv('PLATFORM_SMTP_TLS') ?: 'starttls'));
    $useSsl = in_array($tlsMode, ['ssl', 'smtps', '465'], true) || $port === 465;
    $remote = ($useSsl ? 'ssl://' : '') . $host . ':' . $port;
    $errno = 0;
    $errstr = '';
    $fp = @stream_socket_client($remote, $errno, $errstr, 20, STREAM_CLIENT_CONNECT);
    if (!$fp) {
        error_log('platform_send_mail_smtp connect failed: ' . $errstr . " ({$remote})");

        return false;
    }
    stream_set_timeout($fp, 20);

    if (!platform_smtp_expect($fp, [220], 'greeting')) {
        fclose($fp);

        return false;
    }
    $ehloHost = 'app.guillaumelassiat.com';
    if (!platform_smtp_cmd($fp, 'EHLO ' . $ehloHost, [250], 'ehlo')) {
        fclose($fp);

        return false;
    }
    if (!$useSsl && !in_array($tlsMode, ['0', 'false', 'no', 'off'], true)) {
        if (!platform_smtp_cmd($fp, 'STARTTLS', [220], 'starttls')) {
            fclose($fp);

            return false;
        }
        $crypto = STREAM_CRYPTO_METHOD_TLS_CLIENT;
        if (defined('STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT')) {
            $crypto |= STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT;
        }
        if (!@stream_socket_enable_crypto($fp, true, $crypto)) {
            error_log('platform_send_mail_smtp: STARTTLS crypto failed');
            fclose($fp);

            return false;
        }
        if (!platform_smtp_cmd($fp, 'EHLO ' . $ehloHost, [250], 'ehlo-tls')) {
            fclose($fp);

            return false;
        }
    }
    if (!platform_smtp_authenticate($fp, $user, $pass)) {
        fclose($fp);

        return false;
    }
    $fromAddr = platform_mail_extract_address($from);
    if (!platform_smtp_cmd($fp, 'MAIL FROM:<' . $fromAddr . '>', [250], 'mail-from')) {
        fclose($fp);

        return false;
    }
    if (!platform_smtp_cmd($fp, 'RCPT TO:<' . $to . '>', [250, 251], 'rcpt-to')) {
        fclose($fp);

        return false;
    }
    if (!platform_smtp_cmd($fp, 'DATA', [354], 'data')) {
        fclose($fp);

        return false;
    }

    $boundary = 'b_' . bin2hex(random_bytes(8));
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $msg = 'From: ' . $from . "\r\n"
        . 'To: ' . $to . "\r\n"
        . 'Subject: ' . $encodedSubject . "\r\n"
        . 'MIME-Version: 1.0' . "\r\n"
        . 'Content-Type: multipart/alternative; boundary="' . $boundary . '"' . "\r\n\r\n"
        . '--' . $boundary . "\r\n"
        . "Content-Type: text/plain; charset=UTF-8\r\n\r\n"
        . $textBody . "\r\n\r\n"
        . '--' . $boundary . "\r\n"
        . "Content-Type: text/html; charset=UTF-8\r\n\r\n"
        . $htmlBody . "\r\n\r\n"
        . '--' . $boundary . "--\r\n";
    @fwrite($fp, $msg . "\r\n.\r\n");
    if (!platform_smtp_expect($fp, [250], 'data-end')) {
        fclose($fp);

        return false;
    }
    platform_smtp_cmd($fp, 'QUIT', [221], 'quit');
    fclose($fp);

    return true;
}
