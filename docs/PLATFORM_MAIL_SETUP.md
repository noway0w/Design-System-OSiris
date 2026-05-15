# Platform mail setup (verification & password reset)

**Stopping work and picking up later:** read markdown in order from [PLATFORM_AUTH_MAIL_RESUME.md](PLATFORM_AUTH_MAIL_RESUME.md).

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

## IONOS mailbox (noreply@guillaumelassiat.com)

**FR / IONOS Europe:** use outgoing server **`smtp.ionos.fr`** (port **465** SSL or **587** STARTTLS), matching [IONOS assistance — Outlook / serveur sortant](https://www.ionos.fr/assistance/email/microsoftr-outlook/configurer-manuellement-un-compte-de-messagerie-dans-microsoft-outlook-2016/) (incoming IMAP is `imap.ionos.fr`; we only need SMTP for the app).

**Other IONOS regions** sometimes use **`smtp.ionos.com`**. The setup script defaults to `.fr` for `ionos`; use `ionos-com` for `.com` (see script help).

**Important:** SMTP only works with a **real IONOS mailbox**, not a pure forwarder/alias. If IONOS only forwards `noreply@` to another inbox, you cannot send mail as that address — use Resend below or a full mailbox like `contact@guillaumelassiat.com`.

If you see `535 Authentication credentials invalid` on both port 587 and 465, the password does not match IONOS or the address cannot send. Reset the password in the IONOS control panel, then:

```bash
printf '%s' 'EXACT_PASSWORD_FROM_IONOS' > /tmp/ionos-pass.txt
/home/OSiris/scripts/setup-platform-mail.sh ionos --file /tmp/ionos-pass.txt
rm -f /tmp/ionos-pass.txt
php /home/OSiris/scripts/platform-smtp-diagnose.php
```

Do **not** pass the password on the command line without quotes if it contains `!` or `@` — bash will corrupt it.

After `setup-platform-mail.sh ionos`, check `public_html/api/.platform-sso.env`: **`PLATFORM_SMTP_HOST`** should be `smtp.ionos.fr` (FR) or `smtp.ionos.com` if you used `ionos-com`. Ports **587** (STARTTLS) and **465** (SSL) are both tried by `platform-smtp-diagnose.php`. User: full email `noreply@guillaumelassiat.com`. Password: `public_html/api/.platform-mail.secret`.

If you already had `PLATFORM_SMTP_HOST` in `.platform-sso.env`, the script does not overwrite it — edit the line to `smtp.ionos.fr` (or re-add after removing the old line) and reload PHP-FPM.

## Alternative: Resend.com (fastest if IONOS keeps failing)

```bash
/home/OSiris/scripts/setup-platform-mail.sh resend re_YOUR_API_KEY
```

## Troubleshooting

- Links still on screen only → SMTP/Gmail not configured; check `api/.mail-outbox/` logs or PHP error log.
- Gmail API 403 → enable Gmail API in Cloud Console.
- SMTP auth failed → wrong password or need App Password (not normal Gmail password).
