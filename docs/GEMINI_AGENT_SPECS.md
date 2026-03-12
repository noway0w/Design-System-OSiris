# OSiris – Gemini Agent Specifications

Documentation for AI agents (e.g. Gemini) working on the OSiris Design System and Map App. Covers architecture, technical details, and integration.

---

## 1. Code Review & Architecture

### 1.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           OSiris Application Stack                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  Frontend (Browser)                                                          │
│  ├── map-app.html          Main SPA entry (Map Dashboard)                    │
│  ├── map-app.js            ~4100 LOC – core map, users, POI, widgets        │
│  ├── location-service.js   IP geolocation + GPS + reverse geocoding          │
│  ├── api-config.js         API base URLs and endpoint resolvers              │
│  ├── mapbox-config.js      Mapbox token (gitignored; use .example)           │
│  ├── theme-service.js      Dark/light mode                                   │
│  ├── i18n-service.js       i18next for locales (en/fr)                       │
│  └── design-system.html    Component documentation                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  Backend (PHP on VPS)                                                        │
│  ├── api/users.php         GET – list all users (SQLite)                     │
│  ├── api/users-register.php POST/GET – register/update user                  │
│  ├── api/users-delete.php  DELETE – delete user by ID                        │
│  ├── api/users-clear.php   POST – clear all users                            │
│  ├── api/users-me.php      GET – current user + isAdmin                      │
│  ├── api/profile-picture-upload.php  POST – upload profile picture           │
│  ├── points-of-interest.php GET – POI list (JSON)                            │
│  ├── projects-content.php  GET – project content                            │
│  ├── weather.php           GET – weather by city                             │
│  ├── city-image.php        GET – city image (Gemini API)                     │
│  ├── stock.php             GET – stock data (Alpha Vantage)                  │
│  └── users-widgets.php     GET – user widgets                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  External Services                                                           │
│  ├── Mapbox GL JS v3.18    Map, geocoding, reverse geocoding v6             │
│  ├── ipinfo.io / ip-api    IP geolocation                                    │
│  ├── Nominatim / BigDataCloud  Reverse geocoding fallbacks                   │
│  ├── Gemini API            City image generation (config.php)                 │
│  └── Alpha Vantage         Stock data                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Design Patterns

| Pattern | Usage |
|--------|--------|
| **Singleton-like state** | `appMap`, `mapDataState`, `mapLayerInfo`, `LocationService` hold global state |
| **Event-driven** | Mapbox events (`idle`, `moveend`, `zoomend`), heartbeat interval, gate submit |
| **API abstraction** | `getUsersListUrl()`, `getWeatherUrl()`, etc. in `api-config.js` – base URL from `window.OSIRIS_API_URL` |
| **Fallback chain** | Reverse geocoding: Mapbox v6 → Nominatim → BigDataCloud |
| **Progressive enhancement** | Map loads; gate overlay blocks until name + consent; then full init |

### 1.3 Key Modules (map-app.js)

| Module | Purpose |
|--------|---------|
| **User registration & heartbeat** | `registerUser()`, `refreshNearby()`, `startHeartbeat()` – 5s interval |
| **Map layers** | Buildings, topography, names, property boundaries, volumetric weather, live cloud, aurora, airports |
| **Bottom section tiles** | User tiles, POI tiles, widget tiles (weather/stock), Map Data tiles (draggable) |
| **Floating panels** | User profile, POI content, recommendations, widget detail |
| **Gate overlay** | Name input, honeypot, min-time (2.5s) bot filter, consent checkbox |
| **Location** | `LocationService.getIPLocation()`, GPS via `getAccurateLocation()`, reverse geocoding |

### 1.4 Data Flow

```
User visits /app or map-app.html
    → initMapApp() → initMap() (Mapbox globe)
    → initNameGateOverlay() if no osiris_user_name
    → Gate submit: validate → registerUser() → runPostGateInit()
    → refreshNearby() → fetchUsers() → renderNearbyTiles() → addUserTileMarkers()
    → Heartbeat every 5s: registerUser() → refreshNearby()
```

### 1.5 Code Review Guidelines

- **No nano** – Use vim, tee, heredoc, or Cursor/VS Code (see `.cursor/rules/no-nano.mdc`)
- **API base URL** – `window.OSIRIS_API_URL`; empty = same-origin (`api/users.php`, etc.)
- **Mapbox token** – `localStorage.getItem('mapbox_access_token')` or `window.MAPBOX_DEFAULT_TOKEN`
- **Session keys** – `osiris_user_name`, `osiris_authenticated` in sessionStorage
- **Admin** – `isAdmin` from `users-me.php`; `ADMIN_IPS` in config.php

---

## 2. Technical Documentation

### 2.1 File Structure

```
OSiris/
├── public_html/
│   ├── map-app.html           # Main map SPA
│   ├── app/index.html         # Redirect to map-app.html
│   ├── js/
│   │   ├── map-app.js         # Core app (~4100 LOC)
│   │   ├── map-app.min.js     # Minified build
│   │   ├── location-service.js
│   │   ├── api-config.js
│   │   ├── mapbox-config.js   # Token (gitignored)
│   │   ├── theme-service.js
│   │   └── i18n-service.js
│   ├── api/                   # PHP REST endpoints
│   ├── css/                   # Tailwind + component CSS
│   ├── data/
│   │   └── airports.csv       # Airport OACI codes for Map Data layer
│   ├── assets/map-data/       # Tile thumbnails (Airport.png, etc.)
│   ├── visuals-for-tiles/     # Source images for tiles
│   ├── locales/en|fr/         # i18n JSON
│   ├── config.php             # GEMINI_API_KEY, ALPHAVANTAGE_API_KEY, ADMIN_IPS
│   └── points-of-interest.json
├── package.json               # tailwind, esbuild, i18next
├── tailwind.config.js
└── docs/
    ├── AGENT_RULES.md          # Agent rules (plan mode, tasks, lessons)
    ├── GEMINI_AGENT_SPECS.md   # This file
    ├── PROJECT_OVERVIEW.md     # Project overview
    ├── README.md               # Docs index
    └── tasks/
        ├── todo.md             # Plans (per AGENT_RULES)
        └── lessons.md          # Lessons learned
```

### 2.2 Database Schema (SQLite – users.db)

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT NOT NULL,
    name TEXT NOT NULL,
    lat REAL,
    lng REAL,
    city TEXT,
    country TEXT,
    last_seen INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    widgets TEXT,           -- JSON array of widget configs
    profile_picture TEXT    -- URL or path
);
```

### 2.3 API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/users` or `users.php` | List all users |
| POST/GET | `/api/users` or `users-register.php` | Register/update user (name, ip, lat, lng, city, country, widgets) |
| DELETE | `/api/users/{id}` or `users-delete.php?id=` | Delete user |
| POST | `/api/users` or `users-clear.php` | Clear all users |
| GET | `/api/users/me` or `users-me.php` | Current user + isAdmin |
| GET | `points-of-interest.php` | POI list |
| GET | `weather.php` | Weather by city |
| GET | `city-image.php` | City image (Gemini) |
| GET | `stock.php` | Stock data (Alpha Vantage) |

### 2.4 Environment & Config

- **config.php** – `GEMINI_API_KEY`, `ALPHAVANTAGE_API_KEY`, `ADMIN_IPS` (env or defaults)
- **mapbox-config.js** – Token; copy from `mapbox-config.example.js`
- **api-config.js** – `window.OSIRIS_API_URL`; empty = same-origin

### 2.5 Build Commands

```bash
npm run build:css   # Tailwind → public_html/css/tailwind.css
npm run build:js    # esbuild map-app.js → map-app.min.js
npm run build       # Both
```

### 2.6 Map Data Tiles (State)

- **Keys**: `buildings`, `topography`, `names`, `propertyBoundaries`, `volumetricWeather`, `liveCloudCoverage`, `auroraNorthernLights`, `airports`
- **Persistence**: `localStorage` key `osiris_map_data_tile_order` – JSON array of tile order
- **Airports**: CSV at `data/airports.csv`; markers at zoom > 5; thumbnails in `assets/map-data/`

---

## 3. Integration Specs

### 3.1 Adding a New API Endpoint

1. Create `public_html/api/your-endpoint.php` (or add to existing).
2. Add headers: `Content-Type: application/json`, `Access-Control-Allow-Origin: *`.
3. Add resolver in `api-config.js`:
   ```javascript
   window.getYourEndpointUrl = function () {
     const base = window.OSIRIS_API_URL || '';
     return base ? `${base}/your-endpoint.php` : 'your-endpoint.php';
   };
   ```
4. Call from `map-app.js` via `fetch(getYourEndpointUrl())`.

### 3.2 Adding a New Map Data Tile

1. Add key to `mapDataState`, `mapDataTileOrder`, `valid` in `loadMapDataTileOrder`.
2. Add `thumbLight`, `thumbDark`, `icons`, `labels` in `renderMapDataTiles`.
3. Add `applyYourLayerState(state)` and call from `applyMapDataState`.
4. Add `case 'yourKey':` in `handleToggleChange` in `wireMapDataTiles`.
5. Add thumbnail images to `assets/map-data/` (e.g. `YourLayer.png`, `YourLayer-Dark-Mode.png`).

### 3.3 Adding a New External Service

- **Config**: Add key to `config.php` (e.g. `YOUR_API_KEY`).
- **Token**: Use `getenv()` or `$_ENV` in PHP; for client-side, pass via server-rendered script or config endpoint.
- **CORS**: Backend must allow `Access-Control-Allow-Origin: *` if called from browser.

### 3.4 Reverse Geocoding (GPS → City)

- **LocationService.reverseGeocode(lat, lng)** – Returns `{ city, country }` or `null`.
- **Chain**: Mapbox v6 → Nominatim → BigDataCloud.
- **Usage**: After GPS success in `getAccurateLocation()`, enrich `currentLocation`; then `registerUser()` propagates to DB and UI.

### 3.5 Gate Overlay Integration

- **Honeypot**: Hidden input `name="website"`; reject if filled.
- **Min time**: Require `(Date.now() - loadTime) >= 2500` ms before submit.
- **On submit**: Validate name, consent, honeypot, time → `registerUser()` → `setSession` → `runPostGateInit()`.

### 3.6 i18n

- **Locales**: `public_html/locales/` – `en/`, `fr/` with `common.json`, `map.json`.
- **i18next**: `i18n-service.js`; `t('key')` for translations.
- **Language switcher**: `components/language-switcher.js`.

### 3.7 Theme (Dark/Light)

- **Toggle**: `data-theme="dark"` or `data-theme="light"` on `<html>`.
- **Service**: `theme-service.js`; respects `prefers-color-scheme` by default.
- **Map**: `applyMapTheme()` in map-app.js syncs Mapbox style.

### 3.8 Deployment (VPS)

- **Web server**: Nginx or Apache; PHP-FPM for `.php`.
- **Document root**: `public_html/` or `/var/www/html/` (see `api/README-SERVER.md`).
- **Test**: `curl http://your-server/api/debug-users.php` → JSON.

---

## 4. Quick Reference

| Item | Value |
|------|-------|
| Mapbox GL JS | v3.18.1 |
| Map projection | Globe (default); Mercator for some layers |
| Heartbeat interval | 5000 ms |
| Gate min time | 2500 ms |
| Airports zoom min | 5 |
| Users DB | SQLite `api/users.db` |
| Admin check | `users-me.php` + `ADMIN_IPS` in config |

---

*End of Gemini Agent Specifications*
