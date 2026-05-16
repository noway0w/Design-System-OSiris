<?php
/**
 * POST JSON { "email": "...", "password": "..." } → { ok, user?, error? }
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'POST only']);
    exit;
}

require_once __DIR__ . '/platform-db.php';
require_once __DIR__ . '/platform-session.php';

$raw = file_get_contents('php://input') ?: '';
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

$email = trim((string) ($body['email'] ?? ''));
$password = (string) ($body['password'] ?? '');
if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'email and password required']);
    exit;
}

$pdo = platform_pdo();
$st = $pdo->prepare('SELECT id, name, surname, email, password_hash, account_status FROM users WHERE email = ? LIMIT 1');
$st->execute([$email]);
$row = $st->fetch(PDO::FETCH_ASSOC);
if (!$row || empty($row['password_hash']) || !password_verify($password, $row['password_hash'])) {
    http_response_code(401);
    echo json_encode(['ok' => false, 'error' => 'Invalid credentials']);
    exit;
}
if (($row['account_status'] ?? 'active') === 'pending') {
    http_response_code(403);
    echo json_encode([
        'ok' => false,
        'error' => 'Please verify your email before signing in. Check your inbox for the activation link.',
        'code' => 'pending_verify',
        'email' => $row['email'],
    ]);
    exit;
}

platform_session_set_user_id((int) $row['id']);
echo json_encode([
    'ok' => true,
    'user' => [
        'id' => (int) $row['id'],
        'name' => $row['name'],
        'surname' => $row['surname'],
        'email' => $row['email'],
    ],
]);
