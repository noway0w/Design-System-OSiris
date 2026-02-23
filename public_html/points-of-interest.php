<?php
/**
 * OSiris Points of Interest API - GET: list all POIs
 * Served from public_html root; DB at api/points-of-interest.db
 */
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: no-store, no-cache, must-revalidate');

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

$count = (int)$db->query('SELECT COUNT(*) FROM point_of_interest')->fetchColumn();

// Permanent POI: Mazars Florence UCOM Event (insert if not exists)
$mazarsFlorence = $db->query("SELECT 1 FROM point_of_interest WHERE brand = 'Mazars' AND location = 'Florence' AND type = 'UCOM Event' LIMIT 1")->fetch();
if (!$mazarsFlorence) {
    $db->prepare('INSERT INTO point_of_interest (brand, location, type, lat, lng, icon) VALUES (?, ?, ?, ?, ?, ?)')
        ->execute(['Mazars', 'Florence', 'UCOM Event', 43.7696, 11.2558, 'brand/mazars.png']);
}

if ($count === 0) {
    $icons = [
        'Autodesk' => 'brand/autodesk.png',
        'Woodoo' => 'brand/woodoo.png',
        'Freelance' => 'brand/freelance.png',
        'Mazars' => 'brand/mazars.png',
        'Second Design Studio' => 'brand/second-design-studio.png',
        'Biosens' => 'brand/biosens.png'
    ];
    $seed = [
        ['Autodesk', 'San Diego', 'Autodesk University', 32.7157, -117.1611],
        ['Autodesk', 'Las Vegas', 'Autodesk University', 36.1699, -115.1398],
        ['Autodesk', 'San Francisco', 'DevCon', 37.7749, -122.4194],
        ['Autodesk', 'Oslo Aker Brygge', 'Product Work', 59.9086, 10.7275],
        ['Autodesk', 'Paris Bercy', 'BIM World', 48.8356, 2.3868],
        ['Woodoo', 'Paris Montparnasse', 'Product work', 48.8422, 2.3219],
        ['Freelance', 'Auckland', 'Freelance work', -36.8509, 174.7645],
        ['Freelance', 'Sydney', 'Freelance work', -33.8688, 151.2093],
        ['Freelance', 'Singapour', 'Freelance work', 1.3521, 103.8198],
        ['Mazars', 'Paris la défense', 'Product work', 48.8919, 2.2386],
        ['Freelance', 'Switzerland', 'Freelance work', 46.8182, 8.2275],
        ['Freelance', 'Martinique', 'Freelance work', 14.6415, -61.0242],
        ['Freelance', 'Paris étoile', 'Freelance work', 48.8738, 2.2950],
        ['Freelance', 'Paris', 'Freelance work', 48.8566, 2.3522],
        ['Second Design Studio', 'Lyon', 'Product work', 45.7640, 4.8357],
        ['Biosens', 'Allemagne', 'Product work', 51.1657, 10.4515]
    ];
    $stmt = $db->prepare('INSERT INTO point_of_interest (brand, location, type, lat, lng, icon) VALUES (?, ?, ?, ?, ?, ?)');
    foreach ($seed as $row) {
        $icon = $icons[$row[0]] ?? 'brand/freelance.png';
        $stmt->execute([$row[0], $row[1], $row[2], $row[3], $row[4], $icon]);
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
