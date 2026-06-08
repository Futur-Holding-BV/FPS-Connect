---
name: Rol-filter backend
description: Backend visibiliteitsfilter voor monteur/controleur in inspecties en onderhoud routes.
---

## Patroon
```ts
const TOEGEWEZEN_ROLLEN = ["monteur", "controleur"];

async function toegewezenGebouwIds(userId: number): Promise<number[]> {
  const rows = await db.select({ gebouwId: gebouwToewijzingenTable.gebouwId })
    .from(gebouwToewijzingenTable)
    .where(eq(gebouwToewijzingenTable.gebruikerId, userId));
  return rows.map(r => r.gebouwId);
}

// In GET handler:
if (gebruiker && TOEGEWEZEN_ROLLEN.includes(gebruiker.rol)) {
  const gebouwIds = await toegewezenGebouwIds(userId);
  all = all.filter(i =>
    i.inspecteurId === userId ||            // direct toegewezen
    (i.gebouwId != null && gebouwIds.includes(i.gebouwId))  // gebouw toegewezen
  );
}
```

**Why:** Monteurs/controleurs mogen alleen zien wat aan hen is toegewezen (direct of via gebouwtoewijzing). Beheerders zien alles.

**How to apply:** Zelfde patroon in `inspecties.ts` (filter op `inspecteurId`) en `onderhoud.ts` (filter op `toegewezenAanId`). Import `gebouwToewijzingenTable` from `@workspace/db`.
