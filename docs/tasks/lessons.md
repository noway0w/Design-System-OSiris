# OSiris – Lessons Learned

Per [AGENT_RULES.md](../AGENT_RULES.md): After ANY correction from the user, add the pattern here. Write rules that prevent the same mistake. Review at session start.

---

## Template

### [Date] – Short title

- **What happened**: 
- **Pattern to avoid**: 
- **Rule for next time**: 

### 2026-05-14 – Post-SSO redirect to login (session cookie not sent)

- **What happened**: After Google OAuth, users landed on `/login/?next=/dashboard/` because the next request to `/api/get_user_dashboard.php` had no usable `platform_user_id` in the PHP session (session cookie sometimes missing on the first hop after redirects).
- **Pattern to avoid**: Assuming `session_start()` + `Set-Cookie` on the OAuth callback response is always stored and replayed immediately by every browser/proxy stack.
- **Rule for next time**: Keep signed OAuth `state` independent of session for the Google round-trip; for the return hop, use a vetted fallback (signed HttpOnly `OSIRIS_PLATFORM_AUTH`) cleared on logout, document in [PLATFORM_AUTH_AND_SSO.md](../PLATFORM_AUTH_AND_SSO.md), and verify with DevTools (callback `Set-Cookie`, next API `Cookie`).

---

*Add new lessons above this line.*
