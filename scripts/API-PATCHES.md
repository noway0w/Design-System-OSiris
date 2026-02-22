# API Patches for Role & Delete

Copy the PHP files and apply the edits below. The `public_html/api/` folder may have restricted write permissions.

## 1. Copy new files to `public_html/api/`

```bash
cp scripts/api-users-delete.php public_html/api/users-delete.php
cp scripts/api-users-me.php public_html/api/users-me.php
```

## 2. Edit `public_html/api/users.php`

Add `id` to the SELECT and response:

```php
$stmt = $db->query('SELECT id, ip, name, lat, lng, city, country, last_seen FROM users ORDER BY last_seen DESC');
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
$users = array_map(function ($r) {
    return [
        'id' => (int)($r['id'] ?? 0),
        'ip' => $r['ip'],
        'name' => $r['name'],
        'lat' => $r['lat'] ? (float)$r['lat'] : null,
        'lng' => $r['lng'] ? (float)$r['lng'] : null,
        'city' => $r['city'],
        'country' => $r['country'],
        'lastSeen' => (int)$r['last_seen']
    ];
}, $rows);
```

## 3. Edit `public_html/api/users-register.php`

- Add `role` column to CREATE TABLE (between name and lat)
- After CREATE TABLE, add migration:
  ```php
  try { $db->exec('ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT "User"'); } catch (PDOException $e) {}
  try { $db->exec("UPDATE users SET role = 'Admin' WHERE ip = '195.139.147.156'"); } catch (PDOException $e) {}
  ```
- Before the SELECT: `$role = ($ip === '195.139.147.156') ? 'Admin' : 'User';`
- In UPDATE: add `role` to SET and execute
- In INSERT: add `role` to columns and values

## 4. Edit `public_html/api/users-clear.php`

Add admin check after the headers block (before `$dbPath`):

```php
$adminIp = '195.139.147.156';
$clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
if (isset($_SERVER['HTTP_X_FORWARDED_FOR'])) {
    $clientIp = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
}
if ($clientIp !== $adminIp) {
    http_response_code(403);
    echo json_encode(['error' => 'Admin only']);
    exit;
}
```
