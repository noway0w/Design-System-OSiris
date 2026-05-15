#!/usr/bin/env php
<?php
/**
 * CLI: php scripts/test-platform-mail.php recipient@example.com
 */
declare(strict_types=1);

$to = $argv[1] ?? '';
if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) {
    fwrite(STDERR, "Usage: php scripts/test-platform-mail.php you@example.com\n");
    exit(1);
}

require __DIR__ . '/../public_html/api/platform-mail.php';

$token = bin2hex(random_bytes(8));
$result = platform_send_verify_email($to, $token);

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n";
exit(!empty($result['ok']) ? 0 : 1);
