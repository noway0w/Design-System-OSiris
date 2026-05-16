# Platform mail setup (verification & password reset)

**Stopping work and picking up later:** read markdown in order from [PLATFORM_AUTH_MAIL_RESUME.md](PLATFORM_AUTH_MAIL_RESUME.md).

## Resend (recommended — production)

Transactional mail for registration / password reset. **Does not use Google SSO.**

1. Create an API key at [resend.com](https://resend.com) (`re_…`).
2. **Verify domain** `guillaumelassiat.com` in Resend (DNS records they provide) so you can send as `noreply@guillaumelassiat.com`.
3. On the app server:

```bash
printf '%s' 're_YOUR_API_KEY' > /tmp/resend-key.txt
/home/OSiris/scripts/setup-platform-mail.sh resend --file /tmp/resend-key.txt
rm -f /tmp/resend-key.txt
sudo systemctl reload php-fpm
php /home/OSiris/scripts/platform-mail-status.php
php /home/OSiris/scripts/test-platform-mail.php idea080912@yopmail.com
```

The setup script **overwrites** `PLATFORM_MAIL_PROVIDER` and `PLATFORM_MAIL_FROM` in `.platform-sso.env` (older `append_env` behavior left `smtp` stuck).

**Smoke test without domain verification** (sends from Resend’s test address only):

```bash
/home/OSiris/scripts/setup-platform-mail.sh resend-test --file /tmp/resend-key.txt
```

Then switch to `resend` once the domain is verified.

**Secret file:** `public_html/api/.platform-mail.secret` must contain `PLATFORM_RESEND_API_KEY=re_…` (non-empty). php-fpm runs as `nginx` — the setup script sets `chgrp nginx` and ACL `u:nginx:r`.

---

## Gmail API send (optional, separate from login)

**Do not add `gmail.send` to the login SSO flow** — Google blocks it with `403 access_denied` until the app is verified.

Optional one-time setup (separate OAuth):

1. Enable **Gmail API** in Google Cloud Console.
2. Add redirect URI: `https://app.guillaumelassiat.com/api/auth-mail-google-callback.php`
3. Open: `https://app.guillaumelassiat.com/api/auth-mail-google-start.php`
4. Set `PLATFORM_MAIL_PROVIDER=gmail` in `.platform-sso.env`

## Gmail SMTP (App Password)

```bash
/home/OSiris/scripts/setup-platform-mail.sh gmail-app-password YOUR_16_CHAR_APP_PASSWORD
```

Create an app password: https://myaccount.google.com/apppasswords

## IONOS mailbox (legacy / optional)

**FR / IONOS Europe:** outgoing **`smtp.ionos.fr`** — [IONOS assistance](https://www.ionos.fr/assistance/email/microsoftr-outlook/configurer-manuellement-un-compte-de-messagerie-dans-microsoft-outlook-2016/).

**Important:** SMTP only works with a **real IONOS mailbox**, not a forwarder-only alias.

```bash
printf '%s' 'EXACT_PASSWORD_FROM_IONOS' > /tmp/ionos-pass.txt
/home/OSiris/scripts/setup-platform-mail.sh ionos --file /tmp/ionos-pass.txt
rm -f /tmp/ionos-pass.txt
php /home/OSiris/scripts/platform-smtp-diagnose.php
```

Do **not** pass passwords on the command line unquoted if they contain `!` or `@`.

---

## Diagnostics

```bash
php /home/OSiris/scripts/platform-mail-status.php
php /home/OSiris/scripts/platform-smtp-diagnose.php   # SMTP only
php /home/OSiris/scripts/test-platform-mail.php you@example.com
php /home/OSiris/scripts/platform-resend-verify.php pending@example.com
```

## Troubleshooting

| Symptom | Cause | Fix |
|--------|--------|-----|
| Verification link on screen, no email | Send failed → `verifyUrl` fallback in [`auth-register.php`](../public_html/api/auth-register.php) | Check `platform-mail-status.php`; fix Resend key / domain |
| `outbox_fallback_lines` growing | Failed sends logged to `api/.mail-outbox/` | Fix provider; successful sends do not append |
| `PLATFORM_SMTP_PASS=` empty in secret | Bad setup or empty `--file` | Re-run setup with non-empty secret |
| Resend HTTP 403/422 | Unverified `From` domain | Verify domain or use `resend-test` temporarily |
| Gmail API 403 on login | `gmail.send` on SSO | Keep SSO scopes to openid/email/profile only |
