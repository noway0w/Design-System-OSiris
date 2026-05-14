<?php
/**
 * POST (or GET): destroy platform session.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

require_once __DIR__ . '/platform-session.php';

platform_session_logout();
echo json_encode(['ok' => true]);
