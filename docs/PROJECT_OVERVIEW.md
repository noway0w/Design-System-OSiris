# OSiris – Project Overview for Gemini Agent

This document defines and explains the OSiris project for AI agents (e.g. Gemini). Use it to understand the project's purpose, architecture, and how to work with it.

---

## 1. Project Definition

**OSiris** is a web-based platform that combines:

1. **Live Tracking Map Dashboard** – A Mapbox-powered map app with user presence, POIs, widgets, and map data layers.
2. **Corintis 3D CAD Explorer** – A standalone Three.js SPA for viewing and inspecting CAD files (IGES, STEP, DXF, IFC).

Both share the same design system (OSiris Design System) and are served from `public_html/`. Corintis is feature-flagged via `?corintis` in the map app URL.

---

## 2. Purpose & Goals

| Component | Purpose |
|-----------|---------|
| **Map App** | Real-time map dashboard: show users on a globe, POIs, weather/stock widgets, map data tiles (buildings, topography, airports, etc.), with dark/light theme and i18n (en/fr). |
| **Corintis** | Web-based 3D CAD viewer: import IGES, STEP, DXF, IFC files; inspect layers; toggle ghost/opacity; internal inspection; floating draggable panels; optional on-demand CFD (OpenFOAM) flow lines via local sidecar. |
| **Design System** | Shared CSS variables, Tailwind, neumorphic/glassmorphism styling, dark mode, typography. |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OSiris Platform                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  map-app.html (?corintis)                                                    │
│       │                                                                      │
│       ├── initGeneralMenu()                                                  │
│       ├── initCorintisEntryIfFlagged()  ← only when ?corintis in URL         │
│       │         │                                                           │
│       │         └── Appends "Corintis 3D" link → /corintis/index.html         │
│       │                                                                      │
│       └── Map App: map-app.js (~4100 LOC)                                    │
│             • Mapbox GL JS (globe)                                           │
│             • Users, POIs, widgets, map data tiles                           │
│             • Gate overlay, heartbeat, location service                      │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  /corintis/index.html  (standalone SPA – no map-app.js)                      │
│       │                                                                      │
│       ├── Three.js + OrbitControls                                           │
│       ├── occt-import-js (IGES, STEP)                                        │
│       ├── dxf-parser (DXF)                                                   │
│       ├── web-ifc-three (IFC, local WASM at corintis/wasm/web-ifc.wasm)      │
│       ├── Floating panels: Layers, Loaded files, Internal Inspection, Visual  │
│       └── IndexedDB: corintis-cad-repository (file storage)                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Key Entry Points & URLs

| URL | Description |
|-----|-------------|
| `/` or `/index.html` | Redirects to `map-app.html` on production domain |
| `/map-app.html` | Main map dashboard |
| `/map-app.html?corintis` | Map dashboard with "Corintis 3D" menu entry |
| `/corintis/index.html` | 3D CAD Explorer (standalone) |
| `/design-system.html` | Design system documentation |
| `/city-image-processor.html` | City image processor (Gemini API) |

---

## 5. File Structure (Essential Paths)

```
OSiris/
├── public_html/
│   ├── map-app.html              # Map SPA entry
│   ├── index.html                # Redirect / design system
│   ├── design-system.html        # Component docs
│   ├── city-image-processor.html
│   ├── app/index.html            # Redirect to map-app
│   ├── js/
│   │   ├── map-app.js            # Core map app (~4100 LOC)
│   │   ├── location-service.js   # IP + GPS + reverse geocoding
│   │   ├── api-config.js         # API base URLs
│   │   ├── mapbox-config.js      # Mapbox token (gitignored)
│   │   ├── theme-service.js      # Dark/light
│   │   └── i18n-service.js       # i18next
│   ├── css/                      # Tailwind, variables, components
│   ├── api/                      # PHP REST endpoints
│   ├── corintis/
│   │   ├── index.html            # 3D CAD Explorer SPA
│   │   └── wasm/
│   │       └── web-ifc.wasm      # IFC parsing (local)
│   ├── glb/                      # 3D assets
│   ├── locales/en|fr/            # i18n JSON
│   └── config.php                # GEMINI_API_KEY, etc.
├── docs/
│   ├── AGENT_RULES.md            # Agent rules (plan mode, tasks, lessons)
│   ├── GEMINI_AGENT_SPECS.md     # Technical specs (map app, API, integration)
│   ├── PROJECT_OVERVIEW.md       # This file
│   ├── README.md                 # Docs index and structure
│   └── tasks/
│       ├── todo.md               # Plans with checkable items (per AGENT_RULES)
│       └── lessons.md            # Lessons learned after corrections
├── package.json
└── tailwind.config.js
```

---

## 6. Corintis 3D CAD Explorer – Details

### 6.1 Supported Formats

| Format | Library | Notes |
|--------|---------|-------|
| IGES | occt-import-js | WASM-based |
| STEP | occt-import-js | WASM-based |
| DXF | dxf-parser | JS |
| IFC | web-ifc-three | Local WASM at `corintis/wasm/web-ifc.wasm` |

### 6.2 Floating Panels

- **Layers** – Toggle visibility of layers per loaded file.
- **Loaded files** – List of imported files; select active; delete; auto-expand on add.
- **Internal Inspection** – Cross-section / clipping plane controls.
- **Visual** – Ghost mode, opacity slider.

Panels are draggable, collapsible, and re-align off-screen. "Reset panels" restores initial layout.

### 6.3 File Loading Flow

1. User clicks "Import CAD" (hidden file input).
2. File picker opens; user selects IGES/STEP/DXF/IFC.
3. `change` event → `file.arrayBuffer()` → `addFileToLoadedList()`.
4. `addFileToLoadedList()` parses file, pushes to `loadedFiles`, calls `updateLoadedFilesPanel()`.
5. Loaded files panel auto-expands when a file is added.
6. Files can be stored in IndexedDB (`corintis-cad-repository`) for persistence.

### 6.4 Styling

- Uses map-app dark theme (glassmorphism, backdrop-blur).
- CSS variables from `../css/variables.css`.
- Tailwind from `../css/tailwind.css`.

---

## 7. Map App – Summary

- **Mapbox GL JS v3.18** – Globe projection.
- **Users** – Register, heartbeat (5s), show on map.
- **POIs** – Points of interest with content panels.
- **Widgets** – Weather, stock (Alpha Vantage).
- **Map Data Tiles** – Buildings, topography, names, property boundaries, volumetric weather, live cloud, aurora, airports.
- **Gate overlay** – Name input, consent, honeypot, min-time (2.5s).
- **Location** – IP geolocation, GPS, reverse geocoding (Mapbox → Nominatim → BigDataCloud).

See `docs/GEMINI_AGENT_SPECS.md` for full technical details.

---

## 8. Conventions & Constraints

| Item | Rule |
|------|------|
| **Editor** | Never use `nano`; use vim, tee, heredoc, or Cursor/VS Code |
| **API base** | `window.OSIRIS_API_URL`; empty = same-origin |
| **Mapbox token** | `localStorage.getItem('mapbox_access_token')` or `window.MAPBOX_DEFAULT_TOKEN` |
| **Session** | `osiris_user_name`, `osiris_authenticated` in sessionStorage |
| **Corintis isolation** | No imports from map-app.js; standalone page |
| **Feature flag** | `?corintis` (not `?curintis`) for Corintis menu entry |

---

## 9. Build Commands

```bash
npm run build:css   # Tailwind → public_html/css/tailwind.css
npm run build:js    # esbuild map-app.js → map-app.min.js
npm run build       # Both
```

---

## 10. Related Documentation

| Document | Purpose |
|----------|---------|
| **AGENT_RULES.md** | Agent rules: plan mode, subagents, task management, lessons. |
| **docs/tasks/todo.md** | Plans with checkable items (per AGENT_RULES). |
| **docs/tasks/lessons.md** | Lessons learned after corrections. |
| **GEMINI_AGENT_SPECS.md** | API endpoints, database schema, integration patterns, code review guidelines. |
| **.cursor/plans/** | Implementation plans (e.g. Corintis 3D CAD Integration). |

---

*End of Project Overview*
