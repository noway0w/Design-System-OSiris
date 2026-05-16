# Resume here — platform login, SSO, mail

Use this checklist when picking up **after a break** or when verification emails do not arrive.

---

## Markdown reading order

1. **[PLATFORM_MAIL_SETUP.md](PLATFORM_MAIL_SETUP.md)** — **Resend (recommended)**, IONOS legacy, diagnostics.
2. **[PLATFORM_AUTH_AND_SSO.md](PLATFORM_AUTH_AND_SSO.md)** — Email/password, SQLite, Google SSO (do not change SSO scopes for mail).
3. **`public_html/api/platform-sso.env.example`** — Env template; secrets in `.platform-mail.secret`.

**SSO:** Sign-in only (`openid email profile`). Do **not** add `gmail.send` to `auth-sso-start.php`.

---

## Current production path: Resend

Outbound mail is configured via **Resend**, not IONOS SMTP.

```bash
# Option A — one-time key file (gitignored):
printf '%s' 're_YOUR_API_KEY' > /home/OSiris/.resend-api-key
chmod 600 /home/OSiris/.resend-api-key
/home/OSiris/scripts/apply-resend-key.sh

# Option B — temp file:
printf '%s' 're_YOUR_API_KEY' > /tmp/resend-key.txt
/home/OSiris/scripts/setup-platform-mail.sh resend --file /tmp/resend-key.txt
rm -f /tmp/resend-key.txt
sudo systemctl reload php-fpm
php /home/OSiris/scripts/platform-mail-status.php
php /home/OSiris/scripts/test-platform-mail.php idea080912@yopmail.com
```

Expect: `provider: resend`, `resend_key: yes`, test JSON `"ok": true, "mode": "resend"`.

Register at `/login/` should return `"emailSent": true` and **no** `verifyUrl` when mail works.

**Domain:** `noreply@guillaumelassiat.com` requires `guillaumelassiat.com` verified in Resend. Until then: `setup-platform-mail.sh resend-test` uses `onboarding@resend.dev`.

---

## Known pitfalls (fixed in setup script)

- **Empty `.platform-mail.secret`** (`PLATFORM_SMTP_PASS=` with no value) → all SMTP auth fails; UI still shows verification link from outbox fallback.
- **Old `append_env`** did not overwrite `PLATFORM_MAIL_PROVIDER=smtp` when switching to Resend — use current `setup-platform-mail.sh` (`set_env_key`).
- **Wrong IONOS host** (`smtp.ionos.com` vs FR `smtp.ionos.fr`) — only relevant if you return to IONOS SMTP.

---

## Quick commands

```bash
php /home/OSiris/scripts/platform-mail-status.php
php /home/OSiris/scripts/test-platform-mail.php idea080912@yopmail.com
php /home/OSiris/scripts/platform-resend-verify.php idea080912@yopmail.com
sudo systemctl reload php-fpm
```

---

## Git / secrets

Never commit: `.platform-sso.env`, `.platform-mail.secret`, `.platform-gmail-mail.json`, `api/.mail-outbox/`.
