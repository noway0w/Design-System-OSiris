<?php
/**
 * OSiris Points of Interest API - GET: list all POIs
 * Served from public_html root; DB at api/points-of-interest.db
 * Fallback: when DB fails or is empty, returns POIs from projects folder scan
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=300');

$ADMIN_ONLY_BRANDS = ['World is a village'];
function isAdminUser() {
    $config = @include __DIR__ . '/config.php';
    $adminIps = $config['ADMIN_IPS'] ?? ['195.139.147.156'];
    $adminIps = is_array($adminIps) ? $adminIps : [$adminIps];
    $clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $clientIp = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
    } elseif (!empty($_SERVER['HTTP_X_REAL_IP'])) {
        $clientIp = trim($_SERVER['HTTP_X_REAL_IP']);
    }
    return in_array($clientIp, $adminIps, true);
}

/**
 * Default POI list (matches projects in public_html/projects/)
 * Used when DB fails or returns empty
 */
function getFallbackPois() {
    $projectsBase = __DIR__ . '/projects';
    $slugToPoi = [
        'Autodesk Forma' => [
            ['Autodesk', 'Autodesk University', 'Autodesk', 37.80006, -122.39747, 'projects/Autodesk Forma/Autodesk.png'],
            ['Autodesk', 'Tjuvholmen allé 3, 0252 Oslo', 'Product Work', 59.908741, 10.722761, 'projects/Autodesk Forma/Autodesk.png'],
        ],
        'Mazars' => [['Mazars', '61 Rue Henri Regnault, 92400 Courbevoie', 'Product Work', 48.892050, 2.243972, 'projects/Mazars/Mazars.png']],
        'Blue Ocean sailing' => [['Blue Ocean Sailing', 'Le Marin 97290, Martinique', 'Freelance Work', 14.469999, -60.867442, 'projects/Blue Ocean sailing/Freelance.png']],
        'Biomerieux' => [['Biomerieux', 'Voie Romaine, 69290 Craponne, France', 'Product Work', 45.761267, 4.827994, 'projects/Biomerieux/Second-Design-Studio.png']],
        'Diasys' => [['Biosens Numerique', '6 Rue de Nice, 75011 Paris', 'Diasys', 48.859618012765964, 2.2985537993605583, 'projects/Diasys/Biosens.png']],
        'Renault' => [['Renault', "Place de l'Étoile, Paris", 'Freelance Work', 48.8738, 2.2950, 'projects/Renault/Freelance.png']],
        'Woodoo' => [['Woodoo', 'Tour Montparnasse, Paris', 'Product Work', 48.8422, 2.3219, 'projects/Woodoo/Freelance.png']],
    ];
    $pois = [];
    $id = 1;
    if (!is_dir($projectsBase)) return $pois;
    $dirs = scandir($projectsBase);
    foreach ($dirs as $slug) {
        if ($slug === '.' || $slug === '..' || $slug === 'FEATURED-PROJECT-STRUCTURE.md') continue;
        $path = $projectsBase . '/' . $slug;
        if (!is_dir($path)) continue;
        if (isset($slugToPoi[$slug])) {
            foreach ($slugToPoi[$slug] as $row) {
                if (!file_exists(__DIR__ . '/' . $row[5])) {
                    $icons = array_merge(
                        glob($path . '/*.png') ?: [],
                        glob($path . '/*.jpg') ?: [],
                        glob($path . '/*.jpeg') ?: [],
                        glob($path . '/*.gif') ?: []
                    );
                    $row[5] = !empty($icons) ? 'projects/' . $slug . '/' . basename($icons[0]) : 'brand/placeholder.png';
                }
                $pois[] = ['id' => $id++, 'brand' => $row[0], 'location' => $row[1], 'type' => $row[2], 'lat' => (float)$row[3], 'lng' => (float)$row[4], 'icon' => $row[5]];
            }
        } else {
            $icons = array_merge(
                glob($path . '/*.png') ?: [],
                glob($path . '/*.jpg') ?: [],
                glob($path . '/*.jpeg') ?: [],
                glob($path . '/*.gif') ?: []
            );
            $icon = !empty($icons) ? 'projects/' . $slug . '/' . basename($icons[0]) : 'brand/placeholder.png';
            $pois[] = ['id' => $id++, 'brand' => $slug, 'location' => '', 'type' => 'Project', 'lat' => 0.0, 'lng' => 0.0, 'icon' => $icon];
        }
    }
    return $pois;
}

$dbPath = __DIR__ . '/api/points-of-interest.db';
$pois = [];

try {
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    $db->exec('
        CREATE TABLE IF NOT EXISTS point_of_interest (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand TEXT NOT NULL,
            location TEXT NOT NULL,
            type TEXT NOT NULL,
            lat REAL NOT NULL,
            lng REAL NOT NULL,
            icon TEXT NOT NULL
        )
    ');

    $db->exec("UPDATE point_of_interest SET location = 'Tjuvholmen allé 3, 0252 Oslo', lat = 59.908741, lng = 10.722761 WHERE brand = 'Autodesk' AND location LIKE '%Tjuvholmen%'");
    $db->exec("UPDATE point_of_interest SET location = 'Autodesk University' WHERE brand = 'Autodesk' AND location LIKE '%Pier 9%'");
    $db->exec("UPDATE point_of_interest SET lat = 37.80006, lng = -122.39747 WHERE brand = 'Autodesk' AND location LIKE '%Pier 9%'");
    $db->exec("UPDATE point_of_interest SET lat = 48.892050, lng = 2.243972 WHERE brand = 'Mazars'");
    $db->exec("UPDATE point_of_interest SET lat = 48.859618012765964, lng = 2.2985537993605583 WHERE brand = 'Biosens Numerique'");
    $db->exec("UPDATE point_of_interest SET lat = 45.761267, lng = 4.827994 WHERE brand = 'Biomerieux'");
    $db->exec("UPDATE point_of_interest SET lat = 14.469999, lng = -60.867442 WHERE brand = 'Blue Ocean Sailing'");

    $hasNewPOIs = $db->query("SELECT 1 FROM point_of_interest WHERE brand = 'Autodesk' AND (location LIKE '%Pier 9%' OR location LIKE '%Autodesk University%') LIMIT 1")->fetch();
    if (!$hasNewPOIs) {
        $db->exec('DELETE FROM point_of_interest');
        $newSeed = [
            ['Autodesk', 'Autodesk University', 'Autodesk', 37.80006, -122.39747, 'projects/Autodesk Forma/Autodesk.png'],
            ['Autodesk', 'Tjuvholmen allé 3, 0252 Oslo', 'Product Work', 59.908741, 10.722761, 'projects/Autodesk Forma/Autodesk.png'],
            ['Mazars', '61 Rue Henri Regnault, 92400 Courbevoie', 'Product Work', 48.892050, 2.243972, 'projects/Mazars/Mazars.png'],
            ['Blue Ocean Sailing', 'Le Marin 97290, Martinique', 'Freelance Work', 14.469999, -60.867442, 'projects/Blue Ocean sailing/Freelance.png'],
            ['Biomerieux', 'Voie Romaine, 69290 Craponne, France', 'Product Work', 45.761267, 4.827994, 'projects/Biomerieux/Second-Design-Studio.png'],
            ['Biosens Numerique', '6 Rue de Nice, 75011 Paris', 'Diasys', 48.859618012765964, 2.2985537993605583, 'projects/Diasys/Biosens.png'],
            ['Renault', "Place de l'Étoile, Paris", 'Freelance Work', 48.8738, 2.2950, 'projects/Renault/Freelance.png'],
            ['Woodoo', 'Tour Montparnasse, Paris', 'Product Work', 48.8422, 2.3219, 'projects/Woodoo/Freelance.png'],
        ];
        $stmt = $db->prepare('INSERT INTO point_of_interest (brand, location, type, lat, lng, icon) VALUES (?, ?, ?, ?, ?, ?)');
        foreach ($newSeed as $row) {
            $stmt->execute($row);
        }
    }

    $stmt = $db->query('SELECT id, brand, location, type, lat, lng, icon FROM point_of_interest ORDER BY brand, location');
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $pois = array_map(function ($r) {
        return [
            'id' => (int)$r['id'],
            'brand' => $r['brand'],
            'location' => $r['location'],
            'type' => $r['type'],
            'lat' => (float)$r['lat'],
            'lng' => (float)$r['lng'],
            'icon' => $r['icon']
        ];
    }, $rows);
} catch (PDOException $e) {
    $pois = getFallbackPois();
}

if (empty($pois)) {
    $pois = getFallbackPois();
}

if (!isAdminUser()) {
    $pois = array_values(array_filter($pois, function ($p) use ($ADMIN_ONLY_BRANDS) {
        return !in_array($p['brand'] ?? '', $ADMIN_ONLY_BRANDS, true);
    }));
}

echo json_encode($pois);
