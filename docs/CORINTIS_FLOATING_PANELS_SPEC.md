# Corintis Floating Panels — Specification for Gemini Agent

This document describes the floating panel system in the Corintis 3D CAD Explorer. Use it when modifying, extending, or debugging the floating panels.

---

## 1. Overview

Floating panels are draggable, resizable UI panels overlaid on the 3D canvas. Panels are opened via a left-hand sidebar (icon buttons) and closed via a header close button. Closed panels are fully hidden (`display: none`). Multiple panels can be open at once. Position and size persist in `localStorage` until the user clicks Reset or reloads the page.

**File:** `public_html/corintis/index.html`  
**Container:** `#corintis-floating-panels` (absolute, inset-0, pointer-events-none, z-10)  
**Sidebar:** `#corintis-panel-sidebar` (absolute, left edge, z-30)

---

## 2. Panel Order (Initial & Reset)

Panels are created and laid out in this order:

| Order | Panel ID | Title | Material Symbol Icon |
|-------|----------|-------|----------------------|
| 1 | `loaded` | Loaded files | `folder_open` |
| 2 | `layers` | Layers | `layers` |
| 3 | `inspection` | Internal Inspection | `content_cut` |
| 4 | `visual` | Visual rendering | `visibility` |
| 5 | `analysis` | Analysis | `science` |
| 6 | `models` | Models | `neurology` |
| 7 | `ai` | CAD AI Assistant | `smart_toy` |

---

## 3. Constants

```javascript
const PANEL_GAP = 10;              // px between stacked panels
const PANEL_HEADER_H = 40;         // px header height
const PANEL_BODY_MAX_H = 320;      // px max body height (standard panels)
const PANEL_AI_BODY_MAX_H = 420;   // px max body height (AI panel only)
const PANEL_Z = 40;                // base z-index
const PANEL_ANCHOR_TOP = 76;       // px from top for default stack
const PANEL_SIDEBAR_WIDTH = 56;    // px sidebar width
const PANEL_ANCHOR_OFFSET = 68;    // 12 + PANEL_SIDEBAR_WIDTH (panels start right of sidebar)
const PANEL_STORAGE_KEY = 'corintis_panel_positions';
const PANEL_MIN_W = 192;           // 12rem min width
const PANEL_MAX_W_OFFSET = 32;     // 2rem subtracted from viewport for max width
const PANEL_MIN_H = 80;            // min height when resizing
```

---

## 4. localStorage Schema

**Key:** `corintis_panel_positions`

**Value:** JSON object (only visible panels are saved):
```json
{
  "loaded": { "top": 76, "left": 68, "width": 256, "height": 120 },
  "layers": { "top": 206, "left": 68, "width": 256, "height": 80 },
  ...
}
```

- `top`, `left`: viewport coordinates (px)
- `width`, `height`: panel dimensions (px)

---

## 5. CSS Classes & Structure

### Sidebar
```html
<div id="corintis-panel-sidebar" class="corintis-sidebar">
  <button type="button" class="corintis-sidebar-btn [corintis-sidebar-btn-active]" data-panel-id="loaded" title="Loaded files">
    <span class="material-symbols-outlined">folder_open</span>
  </button>
  <!-- ... 6 more buttons for layers, inspection, visual, analysis, models, ai -->
</div>
```
- Glassmorphism: `backdrop-blur-md`, `background: rgba(15, 23, 42, 0.85)` (dark), `rgba(248, 250, 252, 0.4)` (light)
- Active state: `.corintis-sidebar-btn-active` when panel is open

### Panel structure
```html
<div class="corintis-floating-panel" data-panel-id="loaded" style="display: none|flex;">
  <div class="corintis-floating-panel-header">  <!-- draggable -->
    <div>...icon + title...</div>
    <button class="close-btn">...</button>  <!-- Material Symbol: close -->
  </div>
  <div class="corintis-floating-panel-body" style="max-height: 320px;">
    <div class="p-3">...body content...</div>
  </div>
  <div class="corintis-resize-handle corintis-resize-handle-r" data-edge="r"></div>
  <div class="corintis-resize-handle corintis-resize-handle-b" data-edge="b"></div>
  <div class="corintis-resize-handle corintis-resize-handle-l" data-edge="l"></div>
  <div class="corintis-resize-handle corintis-resize-handle-t" data-edge="t"></div>
  <div class="corintis-resize-handle corintis-resize-handle-br" data-edge="br"></div>
</div>
```
- Closed: `display: none`
- Open: `display: flex`

### Resize handles
- `r` = right edge (ew-resize)
- `b` = bottom edge (ns-resize)
- `l` = left edge (ew-resize)
- `t` = top edge (ns-resize)
- `br` = bottom-right corner (nwse-resize)

### Special rules
- `.corintis-floating-panel[data-panel-id="ai"] .corintis-floating-panel-body` has `max-height: 420px !important`

---

## 6. Core Functions

### `createFloatingPanel(id, title, icon, bodyHtml)`
Creates a panel DOM element. Panels start hidden (`display: none`). Close button calls `setPanelOpen(panel, false)`.

### `setPanelOpen(panel, open)`
Shows (`display: flex`) or hides (`display: none`) the panel. Updates sidebar button `.corintis-sidebar-btn-active`. If opening, runs `layoutCorintisPanels(false)`.

### `isPanelOpen(panel)`
Returns true if `panel.style.display !== 'none'`.

### `getPanelHeight(panel)`
Returns computed height (header + body). AI panel uses `PANEL_AI_BODY_MAX_H`.

### `layoutCorintisPanels(forceDefault = false)`
- Only operates on **visible** panels (filtered by `isPanelOpen`).
- If `forceDefault` or no saved positions: stack panels vertically from `PANEL_ANCHOR_TOP`, left-aligned at `PANEL_ANCHOR_OFFSET`.
- If saved positions exist: restore `top`, `left`, `width`, `height` from localStorage.
- Always updates `z-index` per panel order.

### `loadPanelPositions()` / `savePanelPositions()`
Read/write `corintis_panel_positions` from/to localStorage. `savePanelPositions()` only saves visible panels.

### `resetPanelsToInitial()`
1. Clear localStorage.
2. Hide all panels via `setPanelOpen(p, false)`.
3. Remove `.corintis-sidebar-btn-active` from all sidebar buttons.

### `realignPanelsToLeft()`
Called when any panel is dragged off-screen. Clears storage and runs `layoutCorintisPanels(true)`.

---

## 7. User Interactions

### Sidebar toggle
- **Target:** `.corintis-sidebar-btn[data-panel-id="..."]`
- **Action:** Toggle panel visibility via `setPanelOpen(panel, !isPanelOpen(panel))`. Multiple panels can be open.

### Close
- **Target:** `.close-btn` in panel header
- **Action:** `setPanelOpen(panel, false)` — hide panel, update sidebar active state.

### Drag
- **Target:** `.corintis-floating-panel-header` (exclude `.close-btn`)
- **State:** `window._corintisPanelDrag = { panel, startX, startY, startLeft, startTop }`
- **On end:** If any panel off-screen → `realignPanelsToLeft()`; else → `savePanelPositions()`

### Resize
- **Target:** `.corintis-resize-handle[data-edge="..."]`
- **State:** `window._corintisPanelResize = { panel, edge, startX, startY, startW, startH, startLeft, startTop }`
- **Edges:** `r`, `l`, `b`, `t`, `br` (corner does both width and height)
- **On end:** `savePanelPositions()`

---

## 8. Reset Button

**ID:** `corintis-reset-panels`  
**Action:** Calls `resetPanelsToInitial()` → hide all panels, clear storage, clear sidebar active state.

---

## 9. Panel Content IDs (for wiring)

| Panel ID | Key element IDs |
|----------|-----------------|
| `loaded` | `#import-cad-input`, `#corintis-loaded-files-list` |
| `layers` | `#corintis-layers-list` |
| `inspection` | `#clipping-enable`, `#clipping-slider`, `.clipping-axis-btn` |
| `visual` | `#ghost-mode-toggle`, `#opacity-slider`, `#opacity-value` |
| `analysis` | `#cfd-vx`, `#cfd-vy`, `#cfd-vz`, `#corintis-run-cfd`, `#corintis-redo-cfd`, etc. |
| `models` | `#corintis-models-list` |
| `ai` | `#corintis-ai-messages`, `#corintis-ai-form`, `#corintis-ai-input`, `#corintis-ai-status` |

See [CORINTIS_AI_PANEL_SPEC.md](CORINTIS_AI_PANEL_SPEC.md) for detailed AI panel layout, styling, and behavior.

---

## 10. Behavior Summary

| Event | Behavior |
|-------|----------|
| Page load | All panels hidden; sidebar visible |
| User clicks sidebar icon | Toggle panel visibility; if opening, run `layoutCorintisPanels(false)` |
| User clicks close button | Hide panel, update sidebar |
| User drags panel | Update `top`/`left`; on end, save to localStorage (or realign if off-screen) |
| User resizes panel | Update `width`/`height`; on end, save to localStorage |
| User clicks Reset | Hide all panels, clear storage, clear sidebar active state |
| Any panel off-screen after drag | `realignPanelsToLeft()` — clear storage, default stack |

---

## 11. Dark Mode

Panels use `html.dark` / `.dark` for:
- Background: `rgba(15, 23, 42, 0.85)`
- Border: `rgba(255, 255, 255, 0.08)`
- Header: `rgba(30, 41, 59, 0.6)`
- Body: `rgba(15, 23, 42, 0.5)`

---

## 12. Dependencies

- `ThemeService` (theme-service.js) for dark mode
- Tailwind CSS (`tailwind.css`, `variables.css`)
- Material Symbols Outlined (Google Fonts)
- Container: `#corintis-floating-panels` must exist in DOM
