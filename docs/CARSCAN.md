# CarScan (SpeedVision) on OSiris

This document describes the **in-browser car camera** UI under `/carscan/`, the **YOLO-based analysis** sidecar, and how they tie into nginx. It is the deployment and maintenance record for the CarScan stack; upstream SpeedVision is noted in `public_html/carscan/UPSTREAM_NOTE.md`.

## Architecture

- **Static UI:** `public_html/carscan/` — custom `index.html` with `getUserMedia` (front/rear cameras), `MediaStreamTrack` stop on toggle, and frame submission to the API (HTTP `POST` by default; WebSocket optional).
- **Analysis service:** `speedvision-service/` — FastAPI on **127.0.0.1:9001** (systemd: `speedvision-carscan.service`), loads Ultralytics YOLO weights from `CARSCAN_WEIGHTS` (default: `yolov8n.pt` in the `carscan` web folder when paths resolve).
- **Nginx (site config):** `scripts/app-guillaumelassiat-nginx.conf` — `location` blocks proxy `/api/carscan/` and `/api/carscan/ws` to the sidecar, and deny or restrict direct access to `.py` and model weights under `/carscan/`. Snippet-only copy: `scripts/carscan-nginx-snippets.conf`.

## Environment and systemd (user)

- **Unit file (in repo):** `scripts/speedvision-carscan.service` — can be installed to `~/.config/systemd/user/speedvision-carscan.service` (a copy also lives under `.config/systemd/user/` in this workspace for reference).
- **Useful environment variables:** `CARSCAN_WEIGHTS` (path to `.pt` file), `HOST` / `PORT` (defaults 127.0.0.1:9001), and service `WorkingDirectory` so relative paths to weights resolve.

```bash
systemctl --user daemon-reload
systemctl --user enable --now speedvision-carscan.service
systemctl --user status speedvision-carscan.service
curl -sS 127.0.0.1:9001/health
```

## Nginx on the VPS

After editing the app server block, test and reload (paths depend on your OS layout):

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## UI ↔ API

The page calls **same-origin** paths (no full URL in the default path-based mode): `/api/carscan/health` and `/api/carscan/ingest`. For WebSocket analysis, the reverse proxy should expose something like `/api/carscan/ws` to the service’s internal `/ws` (see `server.py` and nginx `proxy_pass` rules).

**Optional `window` overrides:** `CARSCAN_API` (base URL) and `CARSCAN_USE_WS` (default off; HTTP frame POST is the reliable fallback, especially on WebKit / strict URL parsing).

## Monorepo note: optional upstream `git` dir

To avoid a **gitlink/embedded repository** (which would not commit real files under `carscan/`), the clone’s **`.git`** may live on disk as `public_html/.carscan-upstream-vendor.git/` (not tracked). To run `git` commands against the original upstream remote from this tree:

`GIT_DIR=public_html/.carscan-upstream-vendor.git GIT_WORK_TREE=public_html/carscan git status`

To pull: same `GIT_DIR` / `GIT_WORK_TREE` and `git pull`, or move that folder back to `public_html/carscan/.git` temporarily. Re-clone from upstream is always an option; see `UPSTREAM_NOTE.md`.

## Publishing as a **separate** GitHub project (CarScan-only)

The canonical site lives inside this monorepo. To push **only** the CarScan web tree and a small `speedvision-service` mirror to a **new** empty GitHub repository:

1. On GitHub: create an empty repository (e.g. `OCarScan`), **without** a README if you will push an existing history.
2. From the machine with the repo, either:
   - **Filter/subtree (advanced):** use `git subtree split` on `public_html/carscan` after the nested `carscan/.git` is ignored/removed for that export; or
   - **Practical:** copy `public_html/carscan/` (without `.git`), `speedvision-service/`, and this `docs/CARSCAN.md` into a fresh `git init` directory, commit, add `origin`, and `git push -u origin main`.
3. Add your license and a short root `README.md` in the new repo that points to upstream SpeedVision and this deployment doc.

`gh repo create` is optional if the GitHub CLI is installed; otherwise the GitHub **web UI** + `git remote add` + `git push` is enough.

## Related files (quick index)

| Area | Path |
|------|------|
| Web UI | `public_html/carscan/index.html` |
| Upstream note | `public_html/carscan/UPSTREAM_NOTE.md` |
| API service | `speedvision-service/server.py`, `engine.py` |
| Nginx (full vhost) | `scripts/app-guillaumelassiat-nginx.conf` |
| Nginx (snippets) | `scripts/carscan-nginx-snippets.conf` |
| Systemd (template) | `scripts/speedvision-carscan.service` |
