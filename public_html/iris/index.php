<?php
/**
 * Iris live feed — PHP entry so the platform top bar is always present (nginx: index.php before index.html).
 */
declare(strict_types=1);

$htmlPath = __DIR__ . '/index.html';
if (!is_readable($htmlPath)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Iris index.html missing';
    exit;
}

$html = file_get_contents($htmlPath);
if ($html === false) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Could not read Iris page';
    exit;
}

$topbarPath = __DIR__ . '/../includes/platform-topbar-static.html';
$topbar = is_readable($topbarPath) ? file_get_contents($topbarPath) : '';

// Remove any embedded static top bar from index.html (avoid duplicate ids).
$html = preg_replace(
    '/\s*<div id="platform-fixed-topbar-wrap"[\s\S]*?<\/div>\s*<\/div>\s*/',
    "\n",
    $html,
    1
) ?? $html;

if ($topbar !== false && $topbar !== '') {
    $html = preg_replace('/(<body[^>]*>)/', '$1' . "\n" . $topbar, $html, 1) ?? $html;
}

header('Content-Type: text/html; charset=utf-8');
echo $html;
