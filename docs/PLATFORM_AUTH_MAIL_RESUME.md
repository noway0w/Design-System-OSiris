# Resume here — platform login, SSO, mail

Quick reference when working on **email/password registration** or outbound mail.

---

## Markdown reading order

1. **[PLATFORM_MAIL_SETUP.md](PLATFORM_MAIL_SETUP.md)** — IONOS SMTP (production), Resend alternative, diagnostics.
2. **[PLATFORM_AUTH_AND_SSO.md](PLATFORM_AUTH_AND_SSO.md)** — APIs, SQLite, Google SSO (do not change SSO scopes for mail).
3. **`public_html/api/platform-sso.env.example`** — Env template; secrets in `.platform-mail.secret`.

**SSO:** Sign-in only (`openid email profile`). Do **not** add `gmail.send` to `auth-sso-start.php`.

---

## Production status (verified)

| Item | Value |
|------|--------|
| Provider | `smtp` (IONOS) |
| From | `OSiris <noreply@guillaumelassiat.com>` |
| Host | `smtp.ionos.fr` (587 STARTTLS, 465 SSL) |
| User | `noreply@guillaumelassiat.com` |
| Password | `public_html/api/.platform-mail.secret` |
| Test | `php scripts/test-platform-mail.php idea080912@yopmail.com` → `"ok": true, "mode": "smtp"` |

Registration at `/login/` sends a verification link; user must click it before sign-in.

---

## Email ownership verification (product flow)

| Step | What happens |
|------|----------------|
| Register | Account `pending`; verification email to the address entered |
| Click link in inbox | `auth-verify-email.php` → account `active` |
| Sign in before verify | Blocked (`code: pending_verify`) |
| Resend | `/login/` → “Resend verification email” or `auth-resend-verify.php` |

Works for any deliverable address (Gmail, corporate domain, YOPmail for tests). Domain must have MX/A records at register time.

---

## IONOS setup (refresh password)

```bash
printf '%s' 'IONOS_MAILBOX_PASSWORD' > /tmp/ionos-pass.txt
/home/OSiris/scripts/setup-platform-mail.sh ionos --file /tmp/ionos-pass.txt
rm -f /tmp/ionos-pass.txt
php /home/OSiris/scripts/platform-smtp-diagnose.php idea080912@yopmail.com
sudo systemctl reload php-fpm
```

Register should return `"emailSent": true` and **no** on-screen `verifyUrl` when mail works.

---

## Quick commands

```bash
php /home/OSiris/scripts/platform-mail-status.php
php /home/OSiris/scripts/platform-smtp-diagnose.php idea080912@yopmail.com
php /home/OSiris/scripts/test-platform-mail.php idea080912@yopmail.com
php /home/OSiris/scripts/platform-resend-verify.php idea080912@yopmail.com
```

---

## Pitfalls (already fixed in code)

- **`setup-platform-mail.sh ionos --file`** — use script from repo (`orig_arg3` for path; password files without newline).
- **Wrong diagnose target** — `example.com` → IONOS 556; use a real test inbox.
- **Empty secret** — `PLATFORM_SMTP_PASS=` with no value.
- **On-screen verify link** — only when `PLATFORM_MAIL_DEV_EXPOSE_LINK=1` or send failed.

---

## GDPR / data retention (Phase 1 vs Phase 2)

**Phase 1 (current):**

- Users and files use **soft delete** (`deleted_at`); PII remains in SQLite for a future wipe.
- Auth/mail error paths log **`user_id`** only, not email addresses.
- No column-level encryption yet.

**Phase 2 (planned, not implemented):**

- Scripted erasure: anonymize or delete rows where `deleted_at` is set and retention period elapsed.
- Remove blobs under `data/platform-user-files/` for soft-deleted `user_files`.
- Optional export-before-delete for compliance requests.

---

## Git / secrets

Never commit: `.platform-sso.env`, `.platform-mail.secret`, `.platform-gmail-mail.json`, `api/.mail-outbox/`.
