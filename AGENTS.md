# AGENTS.md

## Cursor Cloud specific instructions

### Project Overview

OSiris is a PHP/HTML/CSS/JS web application with two products:
- **Design System** — a modular CSS component library (root `index.html` + `osiris.css`)
- **Web Application** — a full-stack app under `public_html/` with a Mapbox-powered map dashboard, access gate, and resume page, backed by PHP REST APIs and SQLite

There are no package managers, build tools, linters, or automated tests in this codebase. All frontend dependencies are loaded via CDN.

### Running Services

Start both Nginx and PHP-FPM to serve the application:

```bash
sudo php-fpm8.3 --daemonize
sudo nginx
```

The app is served at `http://localhost` with root at `/workspace/public_html`.

To stop services:
```bash
sudo nginx -s stop
sudo pkill php-fpm8.3
```

### Nginx Configuration

The Nginx config lives at `/etc/nginx/sites-available/osiris` (symlinked to `sites-enabled`). It routes PHP requests to PHP-FPM via the socket at `/run/php/php8.3-fpm.sock`. After editing, validate with `sudo nginx -t` and reload with `sudo nginx -s reload`.

### Config Files

Three config files must exist (not tracked by git):
- `public_html/config.php` — copy from `config.example.php` (API keys for Gemini/AlphaVantage; optional)
- `public_html/js/mapbox-config.js` — copy from `mapbox-config.example.js` (Mapbox token; required for map rendering)
- `public_html/js/api-config.js` — already committed; uses same-origin relative paths by default

### Database

SQLite databases are auto-created in `public_html/api/` on first API call. The `api/` directory must be writable by the `www-data` user (PHP-FPM).

### Key API Endpoints

- `GET /api/users.php` — list users (creates table if missing)
- `POST /api/users-register.php` — register a user
- `GET /api/debug-users.php` — debug DB state
- `GET /points-of-interest.php` — POI data (auto-seeded)
- `GET /weather.php?action=search&q=Paris` — weather search proxy
- `GET /stock.php?action=quote&symbol=AAPL` — stock quote proxy

### Access Gate

The map app is protected by an access code. Use code `GuillaumeLassiat2026` on `access-gate.html` to reach `map-app.html`.

### Gotchas

- The Mapbox map will not render without a valid token in `mapbox-config.js`. The app gracefully shows a token input dialog instead.
- The `api/` directory permissions must allow `www-data` to write; run `sudo chown -R www-data:www-data /workspace/public_html/api && sudo chmod 775 /workspace/public_html/api` if DB writes fail.
- No linting or automated tests exist in this project.
