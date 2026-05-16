# Platform mail setup (verification & password reset)

**Stopping work and picking up later:** read markdown in order from [PLATFORM_AUTH_MAIL_RESUME.md](PLATFORM_AUTH_MAIL_RESUME.md).

**Production (verified):** IONOS SMTP from **`noreply@guillaumelassiat.com`** via **`smtp.ionos.fr`** (port 587 STARTTLS or 465 SSL). Used for registration verification and password-reset emails. **Does not use Google SSO.**

---

## IONOS SMTP — production (noreply@guillaumelassiat.com)

**FR / IONOS Europe:** outgoing server **`smtp.ionos.fr`**, incoming IMAP **`imap.ionos.fr`** — see [IONOS assistance (Outlook manual setup)](https://www.ionos.fr/assistance/email/microsoftr-outlook/configurer-manuellement-un-compte-de-messagerie-dans-microsoft-outlook-2016/).

**Requirements:**

- **`noreply@guillaumelassiat.com`** must be a **real IONOS mailbox** (not a forwarder-only alias).
- Password lives in gitignored **`public_html/api/.platform-mail.secret`** (`PLATFORM_SMTP_PASS=…`).
- php-fpm runs as **`nginx`** — the setup script sets `chgrp nginx` and ACL `u:nginx:r` on the secret file.

### One-time setup

```bash
printf '%s' 'YOUR_IONOS_MAILBOX_PASSWORD' > /tmp/ionos-pass.txt
/home/OSiris/scripts/setup-platform-mail.sh ionos --file /tmp/ionos-pass.txt
rm -f /tmp/ionos-pass.txt
sudo systemctl reload php-fpm
```

Use **single quotes** if the password contains `!` or `@`. Do not pass the password on the command line unquoted.

### Verify delivery

```bash
php /home/OSiris/scripts/platform-mail-status.php
php /home/OSiris/scripts/platform-smtp-diagnose.php idea080912@yopmail.com
php /home/OSiris/scripts/test-platform-mail.php idea080912@yopmail.com
```

Expect:

- `smtp_configured: yes`, `pass yes (len …)`
- Diagnose: **OK** on 587 and/or 465 for your test recipient
- Test JSON: `"ok": true, "mode": "smtp"`

**Note:** `platform-smtp-diagnose.php` without an argument defaults to `idea080912@yopmail.com`. Do **not** use `diagnose@example.com` — IONOS often returns **556** (recipient domain rejected); that is **not** an authentication failure.

### Env (in `.platform-sso.env`)

```env
PLATFORM_MAIL_PROVIDER=smtp
PLATFORM_MAIL_FROM="OSiris <noreply@guillaumelassiat.com>"
PLATFORM_SMTP_HOST=smtp.ionos.fr
PLATFORM_SMTP_PORT=587
PLATFORM_SMTP_USER=noreply@guillaumelassiat.com
PLATFORM_SMTP_TLS=starttls
PLATFORM_MAIL_DEV_EXPOSE_LINK=0
```

Template: [`platform-sso.env.example`](../public_html/api/platform-sso.env.example).

---

## Alternative: Resend.com

Use if IONOS SMTP is unavailable or you prefer API sending.

```bash
printf '%s' 're_YOUR_API_KEY' > /tmp/resend-key.txt
/home/OSiris/scripts/setup-platform-mail.sh resend --file /tmp/resend-key.txt
rm -f /tmp/resend-key.txt
```

Verify domain `guillaumelassiat.com` in Resend for `noreply@…`, or use `resend-test` with `onboarding@resend.dev` for smoke tests only.

---

## Gmail API send (optional, separate from login)

**Do not add `gmail.send` to the login SSO flow** — Google returns `403 access_denied` until the app is verified.

Separate OAuth: `auth-mail-google-start.php` / `auth-mail-google-callback.php` — see env example.

## Gmail SMTP (App Password)

```bash
/home/OSiris/scripts/setup-platform-mail.sh gmail-app-password YOUR_16_CHAR_APP_PASSWORD
```

---

## Diagnostics

```bash
php /home/OSiris/scripts/platform-mail-status.php
php /home/OSiris/scripts/platform-smtp-diagnose.php [recipient@domain.com]
php /home/OSiris/scripts/test-platform-mail.php you@example.com
php /home/OSiris/scripts/platform-resend-verify.php pending@example.com
```

## Troubleshooting

| Symptom | Cause | Fix |
|--------|--------|-----|
| “Could not send verification email” on register | SMTP not configured or send failed | `platform-mail-status.php`; re-run `ionos --file` |
| `535 Authentication credentials invalid` | Wrong password or not a real mailbox | Reset password in IONOS panel; `setup-platform-mail.sh ionos --file` |
| `556 invalid DNS MX` on diagnose | IONOS rejected **recipient** domain (e.g. `example.com`) | Test with a real address: `platform-smtp-diagnose.php you@gmail.com` |
| Diagnose says “AUTH failed” (old script) | Mislabelled RCPT error | Pull latest `platform-smtp-diagnose.php` |
| `PLATFORM_SMTP_PASS=` empty | Empty `--file` or old `read` bug | Re-run setup; use `printf '%s'` without trailing newline issues |
| Verification link on screen only | `PLATFORM_MAIL_DEV_EXPOSE_LINK=1` or send failed | Keep `DEV_EXPOSE_LINK=0`; fix SMTP |
| `outbox_fallback_lines` growing | Failed sends in `api/.mail-outbox/` | Fix SMTP; successful sends do not append |
| Gmail API 403 on login | `gmail.send` on SSO | SSO scopes: `openid email profile` only |
