<?php
/**
 * Send mail via Gmail API using a stored OAuth refresh token.
 */
declare(strict_types=1);

require_once __DIR__ . '/platform-mail-secrets.php';

function platform_gmail_mail_client_config(): ?array
{
    $clientId = getenv('PLATFORM_SSO_GOOGLE_CLIENT_ID') ?: '';
    $clientSecret = getenv('PLATFORM_SSO_GOOGLE_CLIENT_SECRET') ?: '';
    if ($clientId === '' || $clientSecret === '') {
        return null;
    }

    return ['client_id' => $clientId, 'client_secret' => $clientSecret];
}

function platform_gmail_mail_refresh_access_token(string $refreshToken): ?string
{
    $cfg = platform_gmail_mail_client_config();
    if ($cfg === null) {
        return null;
    }
    $body = http_build_query([
        'client_id' => $cfg['client_id'],
        'client_secret' => $cfg['client_secret'],
        'refresh_token' => $refreshToken,
        'grant_type' => 'refresh_token',
    ]);
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $body,
            'timeout' => 20,
        ],
    ]);
    $raw = @file_get_contents('https://oauth2.googleapis.com/token', false, $ctx);
    if (!is_string($raw) || $raw === '') {
        return null;
    }
    $j = json_decode($raw, true);
    $access = is_array($j) ? (string) ($j['access_token'] ?? '') : '';

    return $access !== '' ? $access : null;
}

function platform_gmail_mail_raw_message(string $from, string $to, string $subject, string $htmlBody, string $textBody): string
{
    $boundary = 'b_' . bin2hex(random_bytes(8));
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

    return "From: {$from}\r\n"
        . "To: {$to}\r\n"
        . "Subject: {$encodedSubject}\r\n"
        . "MIME-Version: 1.0\r\n"
        . "Content-Type: multipart/alternative; boundary=\"{$boundary}\"\r\n\r\n"
        . "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n{$textBody}\r\n\r\n"
        . "--{$boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n{$htmlBody}\r\n\r\n"
        . "--{$boundary}--";
}

function platform_send_mail_gmail_api(string $to, string $subject, string $htmlBody, string $textBody): bool
{
    $tokenData = platform_gmail_mail_token_data();
    if ($tokenData === null) {
        return false;
    }
    $refresh = (string) ($tokenData['refresh_token'] ?? '');
    if ($refresh === '') {
        return false;
    }
    $access = platform_gmail_mail_refresh_access_token($refresh);
    if ($access === null) {
        error_log('platform_send_mail_gmail_api: could not refresh access token');

        return false;
    }
    $from = platform_mail_from();
    $raw = platform_gmail_mail_raw_message($from, $to, $subject, $htmlBody, $textBody);
    $payload = json_encode(['raw' => rtrim(strtr(base64_encode($raw), '+/', '-_'), '=')], JSON_UNESCAPED_SLASHES);
    if (!is_string($payload)) {
        return false;
    }
    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Authorization: Bearer {$access}\r\nContent-Type: application/json\r\n",
            'content' => $payload,
            'timeout' => 20,
            'ignore_errors' => true,
        ],
    ]);
    $url = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
    $out = @file_get_contents($url, false, $ctx);
    $code = 0;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
        $code = (int) $m[1];
    }
    if ($code < 200 || $code >= 300) {
        error_log('platform_send_mail_gmail_api: HTTP ' . $code . ' ' . (is_string($out) ? substr($out, 0, 500) : ''));

        return false;
    }

    return true;
}

function platform_gmail_mail_configured(): bool
{
    $data = platform_gmail_mail_token_data();

    return $data !== null && (string) ($data['refresh_token'] ?? '') !== '';
}

function platform_gmail_mail_store_oauth_tokens(array $tok, string $senderEmail): void
{
    $refresh = (string) ($tok['refresh_token'] ?? '');
    if ($refresh === '') {
        return;
    }
    platform_gmail_mail_save_token([
        'refresh_token' => $refresh,
        'email' => $senderEmail,
        'updated_at' => time(),
    ]);
}

function platform_gmail_mail_from_address(): ?string
{
    $data = platform_gmail_mail_token_data();
    if ($data === null) {
        return null;
    }
    $email = trim((string) ($data['email'] ?? ''));

    return $email !== '' ? $email : null;
}
