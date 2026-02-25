<?php
/**
 * OSiris Projects Content API - GET: list media files for a project
 * ?slug=... or ?brand=... &location=... (for Autodesk: SF->Ecosystem, Oslo->Monetization)
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, no-cache, must-revalidate');

$projectsBase = __DIR__ . '/projects';
$slug = isset($_GET['slug']) ? trim($_GET['slug']) : '';
$location = isset($_GET['location']) ? trim($_GET['location']) : '';

$slugMap = [
    'Autodesk' => 'Autodesk Forma',
    'Mazars' => 'Mazars',
    'Blue Ocean Sailing' => 'Blue Ocean sailing',
    'Biomerieux' => 'Biomerieux',
    'Biosens Numerique' => 'Diasys',
    'Renault' => 'Renault',
    'Woodoo' => 'Woodoo',
];

if (!$slug && isset($_GET['brand'])) {
    $slug = $slugMap[trim($_GET['brand'])] ?? '';
}

$subfolder = null;
if ($slug === 'Autodesk Forma' && $location) {
    $loc = strtolower($location);
    if (strpos($loc, 'autodesk university') !== false || strpos($loc, 'san francisco') !== false || strpos($loc, 'pier 9') !== false) {
        $subfolder = 'Ecosystem Autodesk Appstore in product ESRI';
    } elseif (strpos($loc, 'oslo') !== false || strpos($loc, 'tjuvholmen') !== false) {
        $subfolder = 'Contextual Data and Monetization';
    }
}

if (!$slug) {
    echo json_encode(['error' => 'Missing slug or brand', 'hero' => null, 'videos' => [], 'images' => []]);
    exit;
}

$contentPath = $projectsBase . '/' . $slug . '/content';
$scanPath = $subfolder ? $contentPath . '/' . $subfolder : $contentPath;
$result = ['hero' => null, 'videos' => [], 'images' => []];

if (!is_dir($scanPath)) {
    $scanPath = $contentPath;
}
if (!is_dir($scanPath)) {
    echo json_encode($result);
    exit;
}

$baseUrl = 'projects/' . $slug . '/content/';
$prefix = $subfolder ? $subfolder . '/' : '';

function scanMedia($dir, $baseUrl, $prefix = '') {
    $media = ['videos' => [], 'images' => [], 'heroCandidates' => []];
    if (!is_dir($dir)) return $media;
    $entries = scandir($dir);
    foreach ($entries as $e) {
        if ($e === '.' || $e === '..' || $e === '.DS_Store') continue;
        $full = $dir . '/' . $e;
        $rel = $prefix . $e;
        if (is_dir($full)) {
            $sub = scanMedia($full, $baseUrl, $rel . '/');
            $media['videos'] = array_merge($media['videos'], $sub['videos']);
            $media['images'] = array_merge($media['images'], $sub['images']);
            $media['heroCandidates'] = array_merge($media['heroCandidates'], $sub['heroCandidates'] ?? []);
        } else {
            $ext = strtolower(pathinfo($e, PATHINFO_EXTENSION));
            $url = $baseUrl . $rel;
            if (in_array($ext, ['mp4', 'webm'])) {
                $media['videos'][] = $url;
            } elseif (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'])) {
                $media['images'][] = $url;
                if (stripos($e, 'hero') !== false) $media['heroCandidates'][] = $url;
            }
        }
    }
    return $media;
}

$scanned = scanMedia($scanPath, $baseUrl, $prefix);
$result['videos'] = $scanned['videos'];
$result['images'] = $scanned['images'];
$result['hero'] = !empty($scanned['heroCandidates']) ? $scanned['heroCandidates'][0] : (!empty($scanned['images']) ? $scanned['images'][0] : null);

/* Optional content.json: heroStatement, quote, intro, facts, featuredLabel, tags,
   heroCaption, heroSubcaption, quoteAuthor, quoteRole, quoteAvatar, keyFigures, websiteUrl, mission */
$projectRoot = $projectsBase . '/' . $slug;
$contentJsonPath = $projectRoot . '/content.json';
if ($slug === 'Autodesk Forma' && $subfolder) {
    $contentKey = ($subfolder === 'Ecosystem Autodesk Appstore in product ESRI') ? 'ecosystem' : 'monetization';
    $contentJsonPath = $projectRoot . '/content-' . $contentKey . '.json';
    if (!file_exists($contentJsonPath)) $contentJsonPath = $projectRoot . '/content.json';
}
if (file_exists($contentJsonPath)) {
    $raw = @file_get_contents($contentJsonPath);
    if ($raw) {
        $parsed = @json_decode($raw, true);
        if (is_array($parsed)) {
            $keys = ['heroStatement', 'quote', 'intro', 'facts', 'featuredLabel', 'tags',
                'heroCaption', 'heroSubcaption', 'quoteAuthor', 'quoteRole', 'quoteAvatar',
                'keyFigures', 'websiteUrl', 'mission', 'process', 'kpi', 'galleryMetadata', 'heroImage'];
            foreach ($keys as $k) {
                if (isset($parsed[$k])) $result[$k] = $parsed[$k];
            }
            if (!empty($parsed['heroImage']) && !empty($result['images'])) {
                $heroFile = $parsed['heroImage'];
                foreach ($result['images'] as $img) {
                    if (substr($img, -strlen($heroFile)) === $heroFile) {
                        $result['hero'] = $img;
                        break;
                    }
                }
            }
        }
    }
}

echo json_encode($result);
