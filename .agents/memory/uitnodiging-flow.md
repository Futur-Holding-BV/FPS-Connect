---
name: User invitation flow
description: How user invitations work — token, M365 Graph email, send-before-persist, RBAC, status transitions.
---

# User invitation flow (FireVault)

- Invite/resend generate a fresh 256-bit crypto token + 7-day expiry; an activation
  link `https://<REPLIT_DOMAINS[0]>/uitnodiging/<token>` is emailed via Microsoft 365
  Graph (client_credentials flow, app permission `Mail.Send`).
- **Send-before-persist:** the invite/resend routes attempt the email FIRST; only on a
  real send failure (configured but Graph errors) they return 502 and do NOT flip status
  to `uitgenodigd`. If M365 is not configured the email service returns `false` (graceful
  dev fallback, warns WITHOUT the token/link) and the status is still set.
  **Why:** prevents the UI showing "uitgenodigd" when delivery actually failed.
- **Never log the activation link/token** — it is a bearer credential.
- **RBAC:** all write/invite endpoints (`POST/PATCH/DELETE /gebruikers*`, both
  `uitnodigen` routes) are guarded by `requireRol("beheerder")`, not just `requireAuth`.
  Frontend gating alone is insufficient.
- Public routes (no auth): GET verify token (marks `uitnodiging_geopend_op`, checks
  expiry/accepted → 404/409/410), POST activate (sets password + language, then reuses
  existing 2FA setup via `session.pendingUserId`).
- Status → `geaccepteerd` happens at 2FA activeren + verify. Card colour: amber = niet
  uitgenodigd, purple = uitgenodigd.
- Required secrets: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `MAIL_FROM`.
