<?php
/**
 * Loads optional mail secrets from gitignored files (after .platform-sso.env).
 */
declare(strict_types=1);

function platform_mail_bootstrap_secrets(): void
{
    static $done = false;
    if ($done) {
        return;
    }
    $done = true;

    $paths = [
        __DIR__ . '/.platform-mail.secret',
        __DIR__ . '/.platform-smtp.secret',
    ];
    $allowed = [
        'PLATFORM_SMTP_PASS' => true,
        'PLATFORM_SMTP_USER' => true,
        'PLATFORM_SMTP_HOST' => true,
        'PLATFORM_SMTP_PORT' => true,
        'PLATFORM_MAIL_FROM' => true,
        'PLATFORM_RESEND_API_KEY' => true,
        'PLATFORM_MAIL_PROVIDER' => true,
    ];

    foreach ($paths as $path) {
        if (!is_readable($path)) {
            continue;
        }
        $raw = @file_get_contents($path);
        if (!is_string($raw) || $raw === '') {
            continue;
        }
        foreach (explode("\n", $raw) as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) {
                continue;
            }
            $eq = strpos($line, '=');
            if ($eq === false) {
                continue;
            }
            $key = trim(substr($line, 0, $eq));
            $val = trim(substr($line, $eq + 1));
            if ($val !== '' && ($val[0] === '"' || $val[0] === "'") && strlen($val) > 1 && $val[strlen($val) - 1] === $val[0]) {
                $val = substr($val, 1, -1);
            }
            if ($key === 'PLATFORM_SMTP_PASS') {
                $val = ltrim($val, "\xEF\xBB\xBF");
                $val = rtrim($val, "\r\n\0");
            }
            if ($key === '' || !isset($allowed[$key])) {
                continue;
            }
            if (function_exists('platform_env') && platform_env($key) !== '') {
                continue;
            }
            $_ENV[$key] = $val;
            putenv($key . '=' . $val);
        }
    }
}

/** @return array<string, mixed>|null */
function platform_gmail_mail_token_data(): ?array
{
    $path = __DIR__ . '/.platform-gmail-mail.json';
    if (!is_readable($path)) {
        return null;
    }
    $raw = @file_get_contents($path);
    if (!is_string($raw) || $raw === '') {
        return null;
    }
    $data = json_decode($raw, true);

    return is_array($data) ? $data : null;
}

function platform_gmail_mail_save_token(array $data): bool
{
    $path = __DIR__ . '/.platform-gmail-mail.json';
    $json = json_encode($data, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if (!is_string($json)) {
        return false;
    }

    return @file_put_contents($path, $json, LOCK_EX) !== false;
}
