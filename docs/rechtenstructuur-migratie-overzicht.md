# Migratie-overzicht Centrale Rechtenstructuur

Gegenereerd op: 2026-07-03
Basis: Task #180 — Centrale Rechtenstructuur

---

## 1. Totaal API-routes

**879 route-definities** over **82 routebestanden** (excl. `index.ts`).

---

## 2. Gebruik PermissieService (req.permissies)

**Directe object-level aanroepen via `req.permissies!.magBijGebouw()`:**

| Bestand | Aanroepen |
|---|---|
| `voorzieningen.ts` | 27 |
| `gebouwen.ts` | 5 |
| `inspecties.ts` | 2 |
| **Totaal** | **34** |

**Indirect via fast-path in `requireBevoegdheid`:** elke module die `requireBevoegdheid` als middleware gebruikt, slaat nu de extra DB-query over zolang `req.permissies` al geladen is. Dat betreft alle 54+ modules met `requireBevoegdheid`-aanroepen.

---

## 3. Nog oude permissiecontroles

Één module gebruikt nog de legacy-route:

**`onderhoud.ts` (2 aanroepen):**

```
await magBijGebouw(req.session.userId!, doelGebouw)
```

Dit is een asynchrone, eigen DB-query via `utils/rol` — niet via `req.permissies`. Dit raakt `POST /onderhoud` (aanmaken) en `PATCH /onderhoud/:id` (bewerken).

---

## 4. Modules volledig gemigreerd (object-level)

| Module | Status |
|---|---|
| Spots (`voorzieningen.ts`) | Volledig — 27 checks via `req.permissies` |
| Gebouwen (`gebouwen.ts`) | Volledig — 5 checks via `req.permissies` |
| Inspecties (`inspecties.ts`) | Volledig — 2 checks via `req.permissies` |

---

## 5. Modules gedeeltelijk gemigreerd

| Module | Module-level | Object-level |
|---|---|---|
| Onderhoud (`onderhoud.ts`) | `requireBevoegdheid` (centraal, fast-path) | 2 legacy `magBijGebouw` (eigen DB-query) |

Alle overige modules hebben uitsluitend module-level gating via `requireBevoegdheid` en geen object-level gebouwscoping. Dat is architecturaal correct voor die modules (ze bevatten geen per-gebouw-data of hebben al een andere filtering).

---

## 6. Hardcoded rolcontroles

Er zijn hardcoded `rol === "..."` vergelijkingen aanwezig in 8 routebestanden:

| Bestand | Patroon | Aanroepen |
|---|---|---|
| `uren.ts` | `info?.rol === "hoofdbeheerder"` als fallback naast inline bevoegdheids-query | 12× |
| `werkdag.ts` | `req.session.rol === "hoofdbeheerder"` | 2× |
| `gebouwen.ts` | `rol === "beheerder" \|\| "hoofdbeheerder"` binnen handler | 2× |
| `gebruikers.ts` | `rol === "hoofdbeheerder"` | 2× |
| `online-gebruikers.ts` | `rol === "klant"` voor scope-filter | 1× |
| `golive.ts` | `rol === "hoofdbeheerder"` | 1× |
| `toolbox.ts` | `g.rol === "hoofdbeheerder"` | 1× |
| `mod-calculatie.ts` | `b.rol === "gebruiker"` op betrokken-object | 1× |
| `opdrachten.ts` | `b.rol === "gebruiker"` op betrokken-object | 1× |

`uren.ts` is het meest afwijkende: die module heeft geen `requireBevoegdheid`-middleware maar bouwt per handler een eigen `isManager`-vlag op via een directe DB-query én een hardcoded hoofdbeheerder-fallback — volledig buiten alle centrale infrastructuur.

---

## 7. Dubbele autorisatiesystemen

Er bestaan momenteel **drie parallelle lagen** die niet geïntegreerd zijn:

| Laag | Staat | Actief in productie |
|---|---|---|
| `requireBevoegdheid` (module-level, middleware) | Centraal, fast-path via `req.permissies` na Task #180 | Ja — 54+ modules |
| `req.permissies!.magBijGebouw()` (object-level, gesynchroniseerd) | Centraal, in-memory | Ja — 3 modules |
| Hardcoded `rol ===` checks | Verspreid, buiten middleware | Ja — 8 modules |
| `requireObjectRecht()` (DB-gestuurde object-rechten) | Volledig gebouwd | **Nul productie-routes** |
| `uren.ts` inline bevoegdheids-query | Eigen DB-query per handler | Ja — buiten alle middleware |

`requireObjectRecht` is compleet beschikbaar (middleware, DB-tabel, CRUD-routes, beheer-UI) maar wordt nergens in een productie-route aangeroepen — de rechten die een beheerder via `/beheer/object-rechten` instelt, hebben momenteel geen enkel effect op de toegang.

---

## 8. Frontend en backend synchroon?

**Module-level gating:** ja, synchroon.
- Frontend `useBevoegdheid` leest profielen/bevoegdheden uit dezelfde `profielen`-tabel.
- Backend `requireBevoegdheid` valideert via `req.permissies` (na Task #180 met fast-path, geen extra DB-ronde).

**Object-level gating:** gedeeltelijk.
- Backend: `req.permissies!.magBijGebouw()` is actief in 3 modules. De gebouwtoewijzing-scoping werkt.
- Frontend: er is geen equivalent van `requireObjectRecht`. De `object_rechten`-tabel heeft geen frontend-representatie buiten de beheer-pagina. Rechten die een beheerder instelt, zijn op de frontend niet zichtbaar en op de backend niet actief.

**Overige:** `uren.ts` heeft geen frontend-equivalent voor zijn inline bevoegdheids-logica — een mismatch die zichtbaar kan worden als een gebruiker via de UI toegang krijgt die de backend vervolgens weigert (of omgekeerd).

---

## Samenvatting

| Vraag | Antwoord |
|---|---|
| Totaal routes | 879 definities / 82 bestanden |
| Volledig via PermissieService | 3 modules (34 aanroepen, object-level) + 54+ modules (module-level fast-path) |
| Nog oude controles | `onderhoud.ts` — 2 legacy `magBijGebouw` |
| Volledig gemigreerd (object-level) | Gebouwen, Spots, Inspecties |
| Gedeeltelijk gemigreerd | Onderhoud |
| Hardcoded rolcontroles | 8 bestanden, meest uitgesproken in `uren.ts` (12×) |
| Dubbele systemen | 3 lagen actief; `requireObjectRecht` gebouwd maar inactief |
| Frontend/backend synchroon | Module-level: ja. Object-level: nee — `requireObjectRecht` heeft geen frontend-effect |
