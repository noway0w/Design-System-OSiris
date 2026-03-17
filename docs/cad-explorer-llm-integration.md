## 3D CAD Explorer – LLM & Panel Integration

### Overview

This document captures how the web-based 3D CAD Explorer (`public_html/corintis/index.html`) integrates with LLMs and how the floating panels are structured. It is meant to make future agent and UI changes easier to reason about.

### Panels and Layout

- **Header**
  - Left side:
    - `Back to Map` link (back to `map-app.html`).
    - `Reset panels` button (`corintis-reset-panels`), which snaps all floating panels back to **left-aligned, stacked, collapsed** state.
  - Right side:
    - Currently intentionally minimal (no CFD or Import controls; those live in floating panels).

- **Floating panels (`corintis-floating-panel` elements)**
  - Created and managed in the inline script in `corintis/index.html` via `createFloatingPanel(...)` and `initFloatingPanels()`.
  - Alignment:
    - `corintisPanelAlign` defaults to `'left'`.
    - `resetPanelsToInitial()` also sets `corintisPanelAlign = 'left'` and re-runs `layoutCorintisPanels()`.
  - Panels:
    - `Layers`: hierarchy of parts/layers with visibility toggles.
    - `Loaded files`:
      - Contains the **Import CAD** file input.
      - Shows loaded CAD entries and lets the user switch active file or delete entries.
    - `Internal Inspection`: clipping/sectioning controls.
    - `Visual rendering`: ghost/exterior toggles and opacity slider.
    - `Analysis`: **single home for all CFD controls and status**:
      - Velocity vector inputs (`cfd-vx`, `cfd-vy`, `cfd-vz`).
      - CFD status text and `Start` / `Stop` sidecar controls.
      - `Run Analysis` and `Re-do` buttons, wired to `triggerAnalysis()` and `removeFlowLines() + triggerAnalysis()`.
    - `Models`:
      - Read-only list of Ollama models installed on the VPS, annotated with which are effectively usable and which are disabled due to RAM constraints.
      - No actions; purely informational for the operator.
    - `CAD AI Assistant`:
      - Chat UI backed by the local Ollama HTTP API via `public_html/api/openclaw-chat.php`.
      - Sends the current CAD context (`getCurrentCadContext()`) along with the user’s message.

### LLM Bridge (Ollama-only, no tools)

- **File**: `public_html/api/openclaw-chat.php`
- Role: HTTP bridge between the CAD AI floating panel and the local Ollama server.
- Behavior:
  - Accepts `POST` JSON: `{ "message": string, "context": any }`.
  - Builds a combined prompt:
    - User message.
    - Pretty-printed `[CAD context]` JSON (layers, active file, clipping state, camera pose).
  - Calls Ollama via the **OpenAI-compatible** HTTP API:
    - URL: `http://127.0.0.1:11434/v1/chat/completions`
    - Model: `qwen2.5:0.5b` (tiny model that fits this VPS RAM).
    - `stream = false` – returns a single completion.
  - Parses the response and returns JSON:
    - On success: `{ "ok": true, "reply": "<assistant text>" }`
    - On error: `{ "ok": false, "error": "Ollama API error: …" }` with appropriate HTTP status.
- Notes:
  - This path **does not use OpenClaw tools or cloud models**; it is intentionally “Ollama-only, no tools”.
  - All UI-level “actions” (e.g. running CFD) are controlled **by the frontend**, which can interpret reply text and call local JS functions (`triggerAnalysis()`, etc.) if desired.

### Toasts and User Feedback

- The CAD explorer uses a top-right toast system exposed via `window.showToast(...)` (defined in the shared JS for the site).
- To keep UX consistent:
  - `showError(...)` in `corintis/index.html`:
    - Still controls the in-page error overlay.
    - Now also calls `notifyToast('error', msg)` to emit a toast.
  - **CAD Import**:
    - On success, cad import handler calls `notifyToast('success', "Imported <filename>")`.
    - On failure, it funnels through `showError(...)`, which triggers an error toast.
  - **CFD Analysis**:
    - On success, `triggerAnalysis()` calls `notifyToast('success', 'CFD analysis completed and streamlines loaded.')`.
    - Starting and stopping the CFD sidecar also send success/info toasts; failures send error toasts.
  - Other flows that call `showError(...)` automatically gain toast coverage.

### VPS Model Constraints

- The VPS has limited RAM (~2–3 GiB free), which is **insufficient** for larger Ollama models:
  - `glm-4.7-flash`, `llama3.3`, and `llama3.2:3b` require far more memory and are unusable for interactive CAD chat.
  - Even `phi3:mini` was borderline; `qwen2.5:0.5b` is the only stable choice tested so far.
- The **Models** panel exists to make this explicit:
  - It lists the installed models and marks which are disabled due to RAM limits.
  - The CAD explorer intentionally does **not** expose a model-switching UI; it is fixed to a tiny model for stability.

### Design Intent

- Keep the CAD explorer UI:
  - **Clean**: header shows only navigation and panel layout control (no analysis/import clutter).
  - **Discoverable**: all CAD/CFD controls live in clearly labeled floating panels.
  - **Safe**: LLM runs in a constrained, local-only mode; heavy models are documented but not exposed.
  - **Consistent**: all user-facing feedback uses the global toast pattern in addition to inline status where appropriate.

