# Corintis — Feedback and Toasts

This document describes the feedback system in the Corintis 3D CAD Explorer: toasts for success, error, and info messages. Use it when modifying or extending user feedback behavior.

---

## 1. Overview

Corintis uses **toasts only** for user feedback. There is no full-screen error overlay. All success, error, and info messages appear as non-blocking toasts in the top-right corner.

**File:** `public_html/corintis/index.html`  
**Toast container:** `#toast-container` (fixed, top-right, z-index 60)  
**CSS:** `public_html/css/components/toast.css`  
**Variables:** `public_html/css/variables.css` (--toast-bg, --toast-border, --toast-title, etc.)

---

## 2. Toast Implementation

Corintis is a standalone page and does not load `map-app.js`. It defines its own `window.showToast` inline before the main script runs.

### API

```javascript
window.showToast({ type: 'success' | 'error' | 'info', message: string });
```

### Internal Helper

```javascript
function notifyToast(type, message) {
  if (!message) return;
  try {
    if (window.showToast) {
      window.showToast({ type, message });
    }
  } catch (_) { /* ignore */ }
}
```

### Behavior

- **Success toasts:** Auto-dismiss after 3 seconds.
- **Error toasts:** Stay until the user clicks the close button.
- **Info toasts:** Stay until the user clicks the close button.
- Toasts use Material Symbols for icons (`check_circle`, `delete`, `info`).
- Message content is HTML-escaped to prevent XSS.

---

## 3. Usage Sites

| Context | Type | Message |
|---------|------|---------|
| CFD analysis completed | success | "CFD analysis completed and streamlines loaded." |
| CFD sidecar started | success | "CFD sidecar started." |
| CAD file imported | success | "Imported {filename}" |
| Load CAD model first | error | "Load a CAD model first." |
| CFD server not running | error | "CFD service is not running. Start it: sudo systemctl start cfd-sidecar" |
| CFD analysis failed | error | (exception message) |
| CAD load/import failed | error | (exception message) |
| Analysis result unavailable | error | "Analysis result no longer available." |
| CFD sidecar stop requested | info | "CFD sidecar stop requested." |

---

## 4. Removed: Error Panel

Previously, a full-screen overlay (`#corintis-error`) displayed a centered card with title, message, and optional action buttons (e.g. "Start CFD server"). This was removed in favor of toast-only feedback.

- **Removed elements:** `#corintis-error`, `.corintis-error-msg`, `#corintis-error-actions`
- **Removed behavior:** `showError(msg, title, actionsHtml)` with action buttons
- **Current behavior:** `showError(msg)` only hides loading and shows an error toast

The "Start CFD server" button that appeared when the CFD sidecar was not running has been removed. Users must start the service via `sudo systemctl start cfd-sidecar` or another mechanism.

---

## 5. Dependencies

- **Toast CSS:** `../css/components/toast.css` (glassmorphism, slide-in animation)
- **Theme variables:** `../css/variables.css` (light/dark toast colors)
- **Material Symbols:** Loaded in Corintis head for toast icons
- **No map-app.js:** Corintis defines its own `showToast`; it does not use the map app's ToastManager

---

*End of Corintis Feedback and Toasts*
