# Platform authentication and Google SSO

**Stopping work and picking up later:** follow the markdown reading order in [PLATFORM_AUTH_MAIL_RESUME.md](PLATFORM_AUTH_MAIL_RESUME.md).

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
| Registration | `public_html/api/auth-register.php` | Creates `pending` user, sends email verification link |
| Email verify | `public_html/api/auth-verify-email.php` | GET `?token=` — activates account, grants default permissions |
| Forgot password | `public_html/api/auth-forgot-password.php` | POST email — sends reset link (generic response) |
| Reset password | `public_html/api/auth-reset-password.php` | POST token + new password |
| Mail helper | `public_html/api/platform-mail.php` | SMTP or dev log for verification / reset emails |
| Logout | `public_html/api/auth-logout.php` | Calls `platform_session_logout()` |
| SSO start | `public_html/api/auth-sso-start.php` | Redirects to Google with signed `state` |
| SSO callback | `public_html/api/auth-sso-callback.php` | Exchanges code, upserts user, `platform_session_set_user_id()`, redirects to `next` |
| Session check for nginx | `public_html/api/auth-verify.php` | Uses `platform_session_user_id()` for `auth_request` |
| Dashboard API | `public_html/api/get_user_dashboard.php` | Uses `platform_session_user_id()`; returns `capabilities` + `nav_tabs` |
| RBAC | `public_html/api/platform-rbac.php` | Companies, roles, capabilities, audit log |
| Auth service | `public_html/api/platform-auth-service.php` | Shared login/session helpers for thin HTTP adapters |

Login and dashboard UIs: `public_html/login/index.html`, `public_html/dashboard/index.html` (+ `dashboard/dashboard-admin.js` for admin tabs).

### Email verification (password registration)

Proves the subscriber **owns the inbox** they typed (works for any real address — YOPmail is only for testing).

1. **Register** → `auth-register.php` creates user with `account_status = pending`, checks domain has MX/A records, sends link via `platform_send_verify_email()`.
2. **User opens link** in that inbox → `auth-verify-email.php?token=…` sets account **active** and `email_verified_at`.
3. **Sign-in** is blocked until active (`auth-login.php` returns `code: pending_verify`).
4. **Resend** → POST `auth-resend-verify.php` or the “Resend verification email” control on `/login/`.

The on-screen verification link is shown **only** when `PLATFORM_MAIL_DEV_EXPOSE_LINK=1` (local dev). Production delivers mail via **IONOS SMTP** (`noreply@guillaumelassiat.com` / `smtp.ionos.fr`) — see [PLATFORM_MAIL_SETUP.md](PLATFORM_MAIL_SETUP.md).

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
| `PLATFORM_MAIL_FROM` | Optional | From address for verification / reset mail |
| `PLATFORM_SMTP_HOST` | Optional | SMTP host (enables SMTP sending when set) |
| `PLATFORM_SMTP_PORT` | Optional | SMTP port (default `587`) |
| `PLATFORM_SMTP_USER` / `PLATFORM_SMTP_PASS` | Optional | SMTP credentials |
| `PLATFORM_SMTP_TLS` | Optional | `1` / `true` for STARTTLS (default on) |
| `PLATFORM_MAIL_DEV_LOG` | Optional | `1` — log mail bodies to PHP `error_log` when SMTP is not configured |
| `PLATFORM_MAIL_DEV_EXPOSE_LINK` | Optional | `1` — return `verifyUrl` in API when email fails (production: `0`) |
| `PLATFORM_MAIL_PROVIDER` | Optional | `smtp` (IONOS), `resend`, or `gmail` |

When **SMTP is not configured**, failed sends are logged to `public_html/api/.mail-outbox/YYYY-MM-DD.log`. The login UI shows a **Verify your email** panel and **Resend verification email**; no admin/SMTP hints in user-facing copy.

**Setup guide:** [PLATFORM_MAIL_SETUP.md](PLATFORM_MAIL_SETUP.md) — **IONOS SMTP (production)**, Resend alternative, optional Gmail API (separate OAuth, not login SSO).

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
- App vhost uses **`index index.html`** only. Iris/CarScan top bar is injected by **`platform-shell-topbar.js`** in each `index.html` (do not use `index.php` under `^~` locations — nginx would serve PHP as plain text).
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
| Static HTML fragment | `public_html/includes/platform-topbar-static.html` | Optional; prefer JS shell |
| Iris / CarScan entry | `public_html/iris/index.html`, `public_html/carscan/index.html` | Load `platform-shell-topbar.js` (defer at end of body) |

**Iris / CarScan:** Do not add `index.php` in these folders — on hosts without PHP handling for app paths, nginx serves the file as plain text. Use `scripts/osiris-public-443-static-apps.inc` on `osiris.guillaumelassiat.com` if needed.

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

## 9. Registration and password reset

**Login UI:** [`public_html/login/index.html`](/home/OSiris/public_html/login/index.html) — glass split layout with in-page panels: **Sign in**, **Create account**, **Forgot password** ([`login-auth.js`](/home/OSiris/public_html/login/login-auth.js)).

**Reset UI:** [`public_html/login/reset/`](/home/OSiris/public_html/login/reset/) — two password fields; opened from email link `/login/reset/?token=...`.

### Registration flow

1. User submits register form → `POST /api/auth-register.php` (email syntax + domain MX/A check).
2. Row inserted with `account_status = pending` (no session).
3. Verification email from **`noreply@guillaumelassiat.com`** (IONOS SMTP) with link to `/api/auth-verify-email.php?token=...` (48h TTL).
4. UI shows **Verify your email** panel; user must open the link in that inbox.
5. On verify: `account_status = active`, `email_verified_at` set, `platform_grant_default_permissions`, redirect `/login/?verified=1`.
6. `POST /api/auth-login.php` returns **403** with `code: pending_verify` until verified.

Google SSO users are created as **active** with `email_verified_at` set in [`auth-sso-callback.php`](/home/OSiris/public_html/api/auth-sso-callback.php). New and linked users receive default company RBAC via `platform_apply_owner_or_company_defaults()` (owners → `super_admin`, others → `company_user` in the default company).

### Multi-tenant RBAC (Phase 1)

SQLite tables: `companies`, `roles`, `projects`, `project_members`, `user_files`, `admin_audit_log`. Users gain `company_id`, `role_id`, `deleted_at`, `public_display_name`.

**Legacy note:** an older per-user `projects` table (user_id, project_name) is renamed to `legacy_projects_archive` on migration. The active `projects` table is company-scoped (`company_id`, `name`, `description`, `status`, `deleted_at`).

**Project membership (strict):** A user sees or opens a project only if their `user_id` is in `project_members` for that `project_id`. This applies to **all company roles** (`company_owner`, `company_admin`, `company_manager`, `company_user`). **Exception:** platform `super_admin` bypasses membership and sees all projects globally on `GET /api/iris-projects.php`. On `POST /api/iris-projects.php`, the creator is auto-inserted into `project_members`.

**Independent signup:** non-platform-owner registrations receive a dedicated company workspace, `company_owner` role, a `General` project, and automatic project membership.

**Project services:** `project_services (project_id, service_name)` stores which workspace apps are enabled per project (`map-app`, `iris`, `3Dobjscan`, `carscan`, `disable` — not `dashboard`). Toggles via `PATCH /api/iris-project-services.php`.

**File rows (`user_files`):** `project_id` is required for new uploads. Legacy rows with `project_id IS NULL` are migrated to each company’s `General` project on schema init. Access is membership-based in `platform-rbac.php`.

| File type | Access |
|-----------|--------|
| Project file (`project_id` set) | Members of that project only |
| Legacy personal (`project_id` NULL, pre-migration) | Uploader only |

Upload: `POST /api/iris-files-upload.php` requires `project_id` and an allowed extension (`jpeg`, `jpg`, `png`, `iges`, `step`, `dxf`, `ifc`, `3dm`, `dwg`, `glb`, `mp4`, `mov`, `avi`). Max 50 MB.

On schema init, each company gets a `General` project with all company users in `project_members`; orphan `user_files` rows are assigned to that project.

**Capabilities (derived):**

| Capability | Who |
|------------|-----|
| `can_access_projects`, `can_create_project` | Active user with company context |
| `can_manage_team`, `can_delete_team_users` | `company_owner`, `company_admin`, `super_admin` |
| `can_purge_team_users` | `super_admin` only — hard-delete company users from DB |
| `can_manage_project_roster` | Owner, admin, **manager**, `super_admin` — add/remove project members, invites |
| `can_manage_project_services` | Owner, admin, `super_admin` — per-project app toggles |
| `can_delete_project` | Owner, admin, `super_admin` — soft-delete whole project |

| Role slug | Scope | Dashboard tab (typical) |
|-----------|--------|-------------------------|
| Any user with company | company | **Projects** (first tab), App services |
| `super_admin` | platform | Projects, App services, Super Admin |
| `company_owner` / `company_admin` | company | + Team |
| `company_manager` / `company_user` | company | Projects + App services only |

The standalone **Import Files** tab is removed; uploads happen inside the Project workspace UI.

**Platform owners** (`g.lassiat@gmail.com`, `admin@localhost`) are seeded as `super_admin` with `company_id = NULL`. Only those emails may call `POST /api/iris-admin-promote-super-admin.php`.

**APIs** (session + capability checks; `iris_*` prefix):

| Endpoint | Capability |
|----------|------------|
| `iris-admin-users.php` | `super_admin` |
| `iris-admin-promote-super-admin.php` | `can_promote_super_admin` |
| `iris-team-members.php`, `iris-team-permissions.php`, `iris-team-invite.php` | `can_manage_team` |
| `iris-team-members.php` DELETE | `can_delete_team_users` — soft-remove (`deleted_at`); body `{ permanent: true }` + `can_purge_team_users` — hard-delete row |
| `iris-team-members.php` POST `action=reactivate` / `purge` | `can_purge_team_users` (`super_admin`) |
| `iris-team-members.php` GET `?include_deleted=1` | `can_purge_team_users` — list soft-deleted company users |
| `iris-team-invite.php` POST body | optional `role_slug` (`company_admin`, `company_manager`, `company_user`; `company_owner` only if actor is owner) |
| `iris-projects.php` GET list | `can_access_projects` — only projects where actor is in `project_members`; each project includes `member_preview` (up to 3 `{ avatar_url, name }` from `users.avatar_url`) for dashboard cards |
| `iris-projects.php` GET `?project_id=` | compound JSON: `project`, `members` (with `avatar_url`), `pending_invites`, `services`, `files`, `can_manage_roster` |
| `iris-projects.php` POST | `can_create_project` — auto-adds creator to `project_members` |
| `iris-projects.php` DELETE | `can_delete_project` — soft-delete project (not membership-only) |
| `iris-project-members.php` | `can_access_projects` + membership; POST optional `role_slug`; POST/DELETE need `can_manage_project_roster`. DELETE removes `project_members` and open `pending_project_invites` (user account unchanged) |
| `iris-project-invite.php` | `can_manage_project_roster` — POST `{ project_id, email, name?, surname?, role_slug? }`; creates pending user or reactivates removed account; sends **Join [project] on OSiris** mail with `/login/?invite=TOKEN` |
| `iris-platform-mail-health.php` | `super_admin` GET — SMTP config diagnostic; `?send=1` sends test mail to signed-in user |
| `iris-project-services.php` PATCH | `can_manage_project_services` + membership; body `{ project_id, service_name, enabled }` |
| `auth-invite-meta.php` | GET `?token=` — metadata for project invite banner on `/login/` |
| `auth-complete-invite.php` | POST — set password for pending invitee; sends standard verify email after |
| `iris-files.php`, `iris-files-download.php` | `can_import_files` + membership rules |
| `iris-files-upload.php` | `can_import_files` + required `project_id` + extension whitelist |

`service_permissions` is unchanged for nginx `auth-verify.php` and app tiles; the Team tab toggles that table per member.

**Project invite email (new users):**

1. Admin uses **Team → Invite to project**, **Add user to project → Send invite**, or **Create project** (email in form is invited on submit).
2. `iris-project-invite.php` inserts `pending` user, `project_members`, `pending_project_invites`, and emails a link to `/login/?invite=TOKEN` (not `auth-verify-email.php` directly).
3. Invitee registers (password or Google SSO with invite in OAuth state) → `auth-complete-invite.php` / SSO callback → verify email → `platform_activate_user()` fulfills pending project membership.
4. Soft-deleted emails are **reactivated** on re-invite instead of returning “account removed”.
5. **Members list** (`iris-projects.php` detail) lists all `project_members` for the project (not filtered by `users.company_id`, so platform owners with `company_id` NULL appear). Each member includes `avatar_url` when set (Google SSO profile picture). Response includes `can_manage_roster`. Dashboard **Remove from project** / **Cancel invite** buttons call `DELETE iris-project-members.php` (owner, admin, manager, super_admin).

<!-- Dashboard App services tab: tiles in public_html/dashboard/index.html; SERVICE_TILE_SVGS under /assets/Dashboard_assets/. API returns full catalog with allowed=false for missing service_permissions; denied tiles are non-links with same svg art per service_name. -->

**Dashboard App services UI:** Sidebar label **App services** (internal tab id `home`, `data-dash-panel="home"`). [`get_user_dashboard.php`](/home/OSiris/public_html/api/get_user_dashboard.php) returns the **full** service catalog, each row with **`allowed`** (presence in [`service_permissions`](/home/OSiris/public_html/api/platform-db.php) for `service_name`). **Allowed:** `<a>` link tile, footer **Active**. **Denied:** `<div>` (not clickable), same **`/assets/Dashboard_assets/{service_name}.svg`** for icon + watermark as when allowed, badge **No access**, class **`dash-app-service-tile--denied`**. Artwork is **pure vector** (**A→`disable`**, **B→`iris`**, **C→`3Dobjscan`**, **D→`map-app`**, **E→`carscan`**). Slug SVGs are copied into [`Dashboard_assets`](/home/OSiris/public_html/assets/Dashboard_assets/) from [`dashboard/illustrations`](/home/OSiris/public_html/dashboard/illustrations/). Extra reference [`illustration-F.svg`](/home/OSiris/public_html/assets/Dashboard_assets/illustration-F.svg). UI reflects permissions; **`auth-verify.php`** continues to gate app entry server-side.

**Dashboard Projects UI:** Glassmorphic bento cards ([`dashboard-shell.css`](/home/OSiris/public_html/css/dashboard-shell.css), `renderProjects` in [`dashboard-admin.js`](/home/OSiris/public_html/dashboard/dashboard-admin.js)). List cards show real member avatars from `member_preview`; detail team rows use `avatar_url` with initials fallback on missing or broken images.

**Team tab (company users):** **Remove** soft-deletes; **Show removed users** + **Reactivate** / **Delete permanently** for `super_admin` only. Does not remove project memberships until purge (purge deletes `project_members` via FK cleanup in `platform_hard_delete_user`).

**Mail ops:** `GET /api/iris-platform-mail-health.php` (super_admin). Scripts: `scripts/fix-platform-mail-permissions.sh`, `scripts/fix-php-fpm-broken-mail-conf.sh` (php-fpm pool drops must be `644`, not `640`).

**Private file storage:** `/home/OSiris/data/platform-user-files/` (gitignored; not under `public_html/`). Override with env `PLATFORM_USER_FILES_ROOT`.

**GDPR Phase 1:** soft-delete only (`users.deleted_at`, `user_files.deleted_at`); auth logs use `user_id` instead of raw email. Phase 2: hard wipe scripts (see [PLATFORM_AUTH_MAIL_RESUME.md](PLATFORM_AUTH_MAIL_RESUME.md)).

### Password reset flow

1. Forgot panel → `POST /api/auth-forgot-password.php` (always generic success message).
2. Email link → `/login/reset/?token=...` → `POST /api/auth-reset-password.php` (1h TTL).
3. Success → `/login/?reset=ok`.

### Topbar identity (compact)

Shared bar [`.dash-topbar-identity`](/home/OSiris/public_html/css/dashboard-shell.css): smaller title, truncated email, email hidden below `640px` to fit the **3rem** fixed bar.

### Future improvements

- **Shell / header:** Further polish (mobile actions, optional search).
- **reCAPTCHA** on registration (placeholder UI only today).
- **Invite-only** or admin-approved registration if required later.

---

*End of document*
