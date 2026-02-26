<?php
/**
 * OSiris Points of Interest API - GET: list all POIs
 * Served from public_html root; DB at api/points-of-interest.db
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=300');

$dbPath = __DIR__ . '/api/points-of-interest.db';

try {
    $db = new PDO('sqlite:' . $dbPath);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database error']);
    exit;
}

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

// Migration: fix Oslo address/coordinates (Tjuvholmen allé 3)
$db->exec("UPDATE point_of_interest SET location = 'Tjuvholmen allé 3, 0252 Oslo', lat = 59.908741, lng = 10.722761 WHERE brand = 'Autodesk' AND location LIKE '%Tjuvholmen%'");
// Migration: update Pier 9 location to Autodesk University
$db->exec("UPDATE point_of_interest SET location = 'Autodesk University' WHERE brand = 'Autodesk' AND location LIKE '%Pier 9%'");
// Migration: fix Pier 9 GPS 37°48'00.2"N 122°23'50.9"W = 37.80006, -122.39747
$db->exec("UPDATE point_of_interest SET lat = 37.80006, lng = -122.39747 WHERE brand = 'Autodesk' AND location LIKE '%Pier 9%'");
// Migration: fix Mazars coordinates (La Défense area)
$db->exec("UPDATE point_of_interest SET lat = 48.892050, lng = 2.243972 WHERE brand = 'Mazars'");
// Migration: fix Biosens Numerique (Diasys) coordinates
$db->exec("UPDATE point_of_interest SET lat = 48.859618012765964, lng = 2.2985537993605583 WHERE brand = 'Biosens Numerique'");
// Migration: fix Biomerieux coordinates (Voie Romaine, Craponne)
$db->exec("UPDATE point_of_interest SET lat = 45.761267, lng = 4.827994 WHERE brand = 'Biomerieux'");
// Migration: fix Blue Ocean Sailing coordinates (Le Marin, Martinique)
$db->exec("UPDATE point_of_interest SET lat = 14.469999, lng = -60.867442 WHERE brand = 'Blue Ocean Sailing'");

// Migration: replace old POIs with new 8 POIs (detect old data by absence of Pier 9)
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
        ['Renault', 'Place de l\'Étoile, Paris', 'Freelance Work', 48.8738, 2.2950, 'projects/Renault/Freelance.png'],
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
echo json_encode($pois);
