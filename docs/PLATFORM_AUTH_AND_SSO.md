# Platform authentication and Google SSO

<!-- Agent note: client-side shell is documented in §8; roadmap items in §9. -->

This document describes the PHP-based login and SSO stack used on the OSiris **app** host (for example `app.guillaumelassiat.com`): `/login/`, `/dashboard/`, `auth_request` helpers for other apps, and Google OAuth.

For nginx snippets and WebSocket rules for the iris stack, see the Cursor rule **OSiris platform** and `scripts/app-guillaumelassiat-nginx.conf`.

---

## 1. Components

| Piece | Path | Role |
|--------|------|------|
| Env bootstrap | `public_html/api/platform-db.php` | Loads `.platform-sso.env`, SQLite helpers, `platform_public_base_url()`, OAuth `state` sign/verify |
| Session + fallback cookie | `public_html/api/platform-session.php` | PHP session `OSIRIS_PLATFORM_SID`; signed HttpOnly `OSIRIS_PLATFORM_AUTH` |
| Password login | `public_html/api/auth-login.php` | Validates credentials, calls `platform_session_set_user_id()` |
| Logout | `public_html/api/auth-logout.php` | Calls `platform_session_logout()` |
| SSO start | `public_html/api/auth-sso-start.php` | Redirects to Google with signed `state` |
| SSO callback | `public_html/api/auth-sso-callback.php` | Exchanges code, upserts user, `platform_session_set_user_id()`, redirects to `next` |
| Session check for nginx | `public_html/api/auth-verify.php` | Uses `platform_session_user_id()` for `auth_request` |
| Dashboard API | `public_html/api/get_user_dashboard.php` | Uses `platform_session_user_id()` |

Login and dashboard UIs: `public_html/login/index.html`, `public_html/dashboard/index.html`.

---

## 2. Environment file

**File:** `public_html/api/.platform-sso.env` (gitignored; do not commit secrets).

Loaded by `platform_bootstrap_local_env_file()` in `platform-db.php` when PHP runs as the web user. Only keys in the allowlist are applied (see that function for the authoritative list).

Typical keys:

| Variable | Required for SSO | Notes |
|----------|------------------|--------|
| `PLATFORM_SSO_GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `PLATFORM_SSO_GOOGLE_CLIENT_SECRET` | Yes | Used for token exchange; also used to derive the auth-cookie signing key if `PLATFORM_AUTH_COOKIE_SECRET` is unset |
| `PLATFORM_SSO_STATE_SECRET` | Recommended | HMAC secret for OAuth `state` (avoids relying on session for the Google round-trip) |
| `PLATFORM_PUBLIC_BASE_URL` | Optional | Canonical site URL for OAuth `redirect_uri` if auto-detection is wrong behind proxies |
| `PLATFORM_AUTH_COOKIE_SECRET` | Optional | Dedicated secret for `OSIRIS_PLATFORM_AUTH`; if empty, key is derived from `PLATFORM_SSO_GOOGLE_CLIENT_SECRET` |

**Permissions:** The file must be readable by the php-fpm user (often `nginx`). If you use POSIX ACLs, ensure the **mask** still allows that user to read after `chmod` (ordering: set ACL for `nginx`, then `chmod 600` if needed, or set mask explicitly).

The SQLite DB used for platform users (`platform.db` or path defined in code) must be **writable** by the same user for SSO user create/update.

---

## 3. Session cookie (`OSIRIS_PLATFORM_SID`)

- PHP session name: `OSIRIS_PLATFORM_SID`.
- **SameSite=Lax**, **HttpOnly**, **Secure** when the request is considered HTTPS (see `platform_request_is_secure()` in `platform-session.php`: `HTTPS`, `X-Forwarded-Proto`, port `443`).
- `platform_session_set_user_id()` calls `session_regenerate_id(false)` then stores `platform_user_id` in `$_SESSION`.

Nginx must pass **`HTTPS`** and **`HTTP_X_FORWARDED_PROTO`** (or equivalent) to PHP so secure cookies and redirect URLs match the browser.

---

## 4. Fallback auth cookie (`OSIRIS_PLATFORM_AUTH`)

Some browsers or timing after a **302 chain** (Google → callback → app) do not attach the new PHP session cookie on the **first** same-site request to `/api/get_user_dashboard.php` or similar. That produced a redirect loop to `/login/?next=/dashboard/`.

**Mitigation:** a second cookie stores a **signed** payload `{ v, uid, exp }` (14-day expiry), HMAC-SHA256, HttpOnly, SameSite=Lax, path/domain aligned with `session_get_cookie_params()` so it matches the session cookie scope.

| Function | Behavior |
|----------|----------|
| `platform_session_set_user_id()` | Sets session and issues `OSIRIS_PLATFORM_AUTH` |
| `platform_session_user_id()` | Reads session first; if empty, verifies the cookie and hydrates `$_SESSION['platform_user_id']` |
| `platform_session_logout()` | Clears session and clears `OSIRIS_PLATFORM_AUTH` |

Logout from `auth-logout.php` clears both.

---

## 5. OAuth `state` (no session on the Google hop)

The `state` parameter is signed (see `platform_sso_*` in `platform-db.php`) so the callback can validate CSRF and recover `next` without depending on PHP session surviving the redirect to Google.

---

## 6. Nginx

- Reference configs: `scripts/app-guillaumelassiat-nginx.conf`, `scripts/osiris-nginx-auth-protected-apps.inc`.
- **`index index.php index.html`** in the app vhost so `/iris/` and `/carscan/` run `index.php` (platform top bar injection) before static `index.html`.
- Protected app paths (`/map-app/`, `/iris/`, `/carscan/`, `/disable/`, `/3Dobjscan/`, `/dashboard/`) live in **`osiris-nginx-auth-protected-apps.inc` only**. Do **not** duplicate those `location` blocks in `app-guillaumelassiat-nginx.conf` — nginx will fail with `duplicate location "/3Dobjscan"` (or similar).
- Deploy: `sudo cp /home/OSiris/scripts/app-guillaumelassiat-nginx.conf /etc/nginx/conf.d/app-guillaumelassiat-nginx.conf` then `sudo nginx -t && sudo systemctl reload nginx`.
- Internal auth subrequest locations should set **`HTTPS`** and **`HTTP_X_FORWARDED_PROTO`** before `fastcgi_pass`, and pass **`HTTP_COOKIE`** so PHP sees session and auth cookies.
- **Warning:** `conflicting server name "…" on 0.0.0.0:80, ignored` means two `server` blocks share the same `server_name` on port 80; nginx uses one and ignores the other. Clean up duplicate `:80` server blocks to avoid confusion.

After deploying PHP changes on production, **`systemctl reload php-fpm`** (exact unit name may vary) so OPcache picks up updates.

---

## 7. Verification checklist

1. After SSO, the **`auth-sso-callback.php`** response should include **`Set-Cookie`** for the session and, when secrets are configured, for **`OSIRIS_PLATFORM_AUTH`**.
2. The next **`GET /api/get_user_dashboard.php`** (or **`auth-verify.php`**) should send **`Cookie`** including at least one of those cookies; the API should return **200** with user payload, not **401**.
3. **Logout** removes both cookies and subsequent API calls return **401**.

---

## 8. Shared app top bar (`platform-shell-topbar.js`)

Sub-apps load `public_html/css/dashboard-shell.css` and `public_html/js/platform-shell-topbar.js`, which calls `GET /api/get_user_dashboard.php` and either hydrates `#platform-topbar-mount` (dashboard) or shows a fixed bar (`#platform-fixed-topbar-wrap`).

| Piece | Path | Role |
|--------|------|------|
| Shell script | `public_html/js/platform-shell-topbar.js` | Skeleton bar, fetch user, `OSirisPlatformTopbar.mountLeading()` for app controls (Map menu + Discover) |
| Styles | `public_html/css/dashboard-shell.css` | 3-zone layout, `--platform-topbar-*` theme vars (`html.light` / `html.dark`), leading 48×48 slot |
| Static HTML fragment | `public_html/includes/platform-topbar-static.html` | Markup injected by PHP entry points |
| Iris entry | `public_html/iris/index.php` | Strips any embedded bar from `index.html`, injects fragment after `<body>` |
| CarScan entry | `public_html/carscan/index.php` | Same as Iris |

**Iris / CarScan:** `index.html` must not embed the bar (avoids duplicate ids). Nginx serves `index.php` first; scripts at end of body: `theme-service.js` → `ThemeService.init()` → `platform-shell-topbar.js`.

**Other apps:** Map moves `#general-menu-wrapper` and `#bottom-panel-toggle` into `#platform-topbar-leading`. Disable and 3Dobjscan use `theme-service.js` + the shell script; the bar is injected on `body` when missing, or kept when present.

**Theme:** Top bar background and text follow `html.light` / `html.dark` (same as Map via `ThemeService`). `syncPlatformTheme()` in the shell script runs on load and on `osiris-theme-change`.

**Z-index:** `.platform-app-topbar-wrap` uses a high stacking value so the bar stays above legacy in-page overlays (for example Iris modals).

**Layout offsets (below the fixed bar):** In `dashboard-shell.css`, when `body.platform-shell--with-topbar` is set:

| App | Selector | Offset |
|-----|----------|--------|
| Map | `#top-bar-overlay` | `top: var(--platform-topbar-height)`; `padding-top: 1.25rem` (GPS “Location Active” chip) |
| 3D CAD Explorer (`/disable/`) | `#corintis-app-toolbar` | `margin-top: 1.25rem` (back / reset panels / theme row) |

Map uses `body:has(#map-app-root) { padding-top: 0 }` so only the overlay is offset, not the full viewport.

**Map static assets under `/map-app/`:** POI logos (`projects/…`), avatars (`pict/`, `uploads/…`), and gallery media must use root-absolute URLs. `public_html/js/api-config.js` exposes `resolvePublicAssetUrl()`; `map-app.js` uses `assetUrl()` when setting `src` / marker images so paths resolve to `/projects/…` not `/map-app/projects/…`.

---

## 9. Future improvements (UI and auth)

Planned follow-ups (not implemented yet):

- **Shell / header:** Further polish (mobile actions, optional search) beyond the current 3-zone bar and Map leading controls.
- **Login page:** Refresh the **sign-in** UI for consistency with the glass dashboard shell and clearer SSO vs. email paths.
- **Registration:** Add a **self-service sign-up** flow (or invite-only registration) wired to the platform user store, with appropriate validation and admin controls.
- **Forgotten password:** Add **password reset** (email token or magic link) for users who sign in with email and password (not required for SSO-only accounts).

---

*End of document*
