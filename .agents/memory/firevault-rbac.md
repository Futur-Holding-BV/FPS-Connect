---
name: FireVault role-based access (RBAC)
description: How permissions and the hoofdbeheerder role work in FireVault, and why enforcement is client-side only.
---

# FireVault RBAC

FireVault now has **real authentication** (see `firevault-auth.md`). The current user comes from the logged-in session, and `useRol()` derives the role from that account (no more localStorage role switcher). Data routes are gated server-side with `requireAuth`.

## Permissions: server-gated auth + UI role checks
**Why:** access now requires a logged-in session, so data routes are protected server-side. Fine-grained *capability* checks (who may delete, who sees hoofdbeheerder) are still applied in the UI on top of that.
**How to apply:** `useRol()` returns the authenticated account's role; gate capability/visibility in the page on it. The route-level `requireAuth` only checks "logged in", not role — if the user asks for per-role *endpoint* authorization, that still needs to be added in the route handlers.

## hoofdbeheerder (super admin) role
- A distinct role above `beheerder`. Can add/edit/**delete** any user.
- Regular `beheerder` (office) can add + edit users but **cannot delete**, and **cannot see or create** hoofdbeheerders.
**Why:** the product owner is the sole hoofdbeheerder and wants it invisible to other users. Do NOT expose the hoofdbeheerder option to non-hoofd viewers — that would defeat its exclusivity. "Beheerder may add users at any level" means the operational levels (beheerder/monteur/controleur/klant), not hoofdbeheerder.
**How to apply:** in the gebruikers page, `isHoofd = viewerRol === "hoofdbeheerder"` drives: hidden hoofdbeheerder column (`zichtbareRollen`), delete buttons, and the hoofdbeheerder option in the create/edit role dropdown.
