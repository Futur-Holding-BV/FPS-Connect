---
name: FireVault role-based access (RBAC)
description: How permissions and the hoofdbeheerder role work in FireVault, and why enforcement is client-side only.
---

# FireVault RBAC

FireVault is a demo with **no authentication**. The "current user" role is purely client-side: `RolContext` (localStorage key `fps_rol`), switched via the "Demo: portalkeuze" dropdown in the sidebar layouts. The server has no notion of who is calling, so all `/api/gebruikers` endpoints are unauthenticated.

## Decision: permissions are enforced in the UI only
**Why:** there is no login system; the server cannot identify the caller, so server-side RBAC is not possible without first building real auth. Enforcing in the UI is consistent with the rest of the app (the whole portal system is client-side).
**How to apply:** gate actions on `useRol()` in the page, not on the API. If the user ever asks for *enforced* security, that requires adding authentication first (see `replit-auth` / `clerk-auth` skills) — flag it as a larger piece of work.

## hoofdbeheerder (super admin) role
- A distinct role above `beheerder`. Can add/edit/**delete** any user.
- Regular `beheerder` (office) can add + edit users but **cannot delete**, and **cannot see or create** hoofdbeheerders.
**Why:** the product owner is the sole hoofdbeheerder and wants it invisible to other users. Do NOT expose the hoofdbeheerder option to non-hoofd viewers — that would defeat its exclusivity. "Beheerder may add users at any level" means the operational levels (beheerder/monteur/controleur/klant), not hoofdbeheerder.
**How to apply:** in the gebruikers page, `isHoofd = viewerRol === "hoofdbeheerder"` drives: hidden hoofdbeheerder column (`zichtbareRollen`), delete buttons, and the hoofdbeheerder option in the create/edit role dropdown.
