---
name: Toewijzingen API velden
description: Correcte veldnamen voor het Toewijzing OpenAPI schema in FPS Brandpreventie.
---

## Toewijzing schema (gegenereerd)
```ts
interface Toewijzing {
  id: number;
  gebouw_id: number;
  gebruiker_id: number;
  naam: string;       // ← gebruiker_naam bestaat NIET
  email?: string;
  rol: string;        // ← gebruiker_rol bestaat NIET
  aangemaakt_op: string;
}
interface ToewijzingInput {
  gebruiker_id: number;  // enige veld
}
```

**Why:** Eerder foutief `t.gebruiker_naam` en `t.gebruiker_rol` gebruikt — Vite HMR faalde op type-mismatch. Correct is `t.naam` en `t.rol`.

**How to apply:** Bij gebruik van `useListGebouwToewijzingen()` altijd `t.naam` en `t.rol` gebruiken.
