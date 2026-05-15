# Resume here — platform login, SSO, mail

Use this checklist when picking up **after a break** when live testing was paused (e.g. IONOS SMTP verification incomplete).

---

## Markdown reading order

1. **[PLATFORM_MAIL_SETUP.md](PLATFORM_MAIL_SETUP.md)** — Outbound mail: IONOS FR (`smtp.ionos.fr`), `ionos` vs `ionos-com`, Resend fallback, Gmail API (separate OAuth). Includes troubleshooting for `535` and secret file paths.
2. **[PLATFORM_AUTH_AND_SSO.md](PLATFORM_AUTH_AND_SSO.md)** — Email/password paths, SQLite, Google SSO endpoints, `.platform-sso.env`, session cookies (`auth_request` helpers).
3. **`public_html/api/platform-sso.env.example`** — Copy to gitignored `.platform-sso.env`; wire PHP-FPM. Passwords belong in `.platform-mail.secret`, not in tracked files.

Optional context: SSO must stay **sign-in only** (`openid email profile`). Do **not** add `gmail.send` to `auth-sso-start.php` login flow (causes Google `403 access_denied`). Use `auth-mail-google-*.php` or SMTP/Resend for sending.

---

## Where things were left off

- **Google SSO** was restored by keeping login scopes to **openid / email / profile** only (no Gmail send on the same OAuth).
- **IONOS SMTP** may still fail with **`535 Authentication credentials invalid`** until: real mailbox for `noreply@…`, password reset in panel, **`PLATFORM_SMTP_HOST`** matches contract (**`smtp.ionos.fr`** FR — see IONOS assistance), or you switch to **Resend**.
- **`append_env` in `setup-platform-mail.sh` does not overwrite** keys already present in `.platform-sso.env` — edit **`PLATFORM_SMTP_HOST`** manually if an old **`smtp.ionos.com`** line remains.

---

## Quick verification commands (SSH on app host)

```bash
php /home/OSiris/scripts/platform-smtp-diagnose.php
php /home/OSiris/scripts/test-platform-mail.php you@your-mail.com
sudo systemctl reload php-fpm   # after env/secret changes
```

Re-apply IONOS password (FR default host):

```bash
printf '%s' 'MAILBOX_PASSWORD' > /tmp/ionos-pass.txt
/home/OSiris/scripts/setup-platform-mail.sh ionos --file /tmp/ionos-pass.txt
rm -f /tmp/ionos-pass.txt
```

For **`smtp.ionos.com`** only: `setup-platform-mail.sh ionos-com …`

---

## Git / secrets

Never commit: `public_html/api/.platform-sso.env`, `.platform-mail.secret`, `.platform-smtp.secret`, `.platform-gmail-mail.json`, `api/.mail-outbox/` (these are gitignored).
