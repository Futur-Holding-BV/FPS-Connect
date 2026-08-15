# NAV_01 — fase 0: goedkeuringspunten (welke schermen/tabbladen krijgen een label)

**Datum:** 11 augustus 2026 · **gemeten op commit:** `73eea85` (main). Alles gemeten in code/migraties; aannames staan expliciet gemarkeerd.

## 1. Hoe de motor beleidsregels selecteert

`goedkeuring_beleidsregels.document_type` is een vrije tekstkolom (geen enum) — `lib/db/src/schema/goedkeuring.ts:25-31`. Selectie gebeurt op documenttype + werkmaatschappij + bedragband. Statusbron voor een label: **`GET /goedkeuring/object/:object_type/:object_id`** (meest recente aanvraag of `null`) — `routes/goedkeuring.ts:889-937`.

## 2. Documenttypen die aantoonbaar in de code bestaan

| # | document_type | Waar in de code | Beleidsregel geseed? |
|---|---|---|---|
| 1 | `opdracht_akkoord` | `routes/opdrachten.ts` (akkoord-vastleggen toetst de band) | **JA** — migratie `0047` (≥ €10.000, vier-ogen, goedkeuring-niveau 3) |
| 2 | `algemene_inkoop` | `routes/algemene-inkoop.ts:126-150` | nee (alleen via beheer-API aan te maken) |
| 3 | `inkoopbon` | `routes/werkvoorbereiding.ts:1570-1594` | nee |
| 4 | `verkoop_factuur` | `routes/facturen.ts:61-68` | nee |
| 5 | `inkoop_factuur` | `routes/facturen.ts:61-68` | nee |
| 6 | `creditnota` | `routes/facturen.ts:61-68` | nee |
| 7 | `prijsafwijking` | `routes/facturen.ts:61-68` | nee |
| 8 | `weekstaat` | alleen frontend: `pages/uren/weekstaten.tsx:223-226` (GoedkeuringWidget) | nee — **frontend-only type**, geen backend-seed gevonden |

NB: de akkoord**gronden** (`ondertekening`/`opdrachtbevestiging`/`vrijgave_pl` uit `akkoordPoort.ts`) zijn géén documenttypen; de documentbibliotheek-flow in `beheer/documenten-tab.tsx` (concept→ter_goedkeuring→goedgekeurd) is een **aparte** flow, niet de generieke motor — die krijgt in NAV_01 géén label.

## 3. Schermen/tabbladen die een `GoedkeuringLabel` krijgen

| document_type | Scherm / tabblad |
|---|---|
| `opdracht_akkoord` | Opdrachtpagina → akkoordkaart (`pages/opdrachten/akkoord-kaart.tsx`) |
| `algemene_inkoop` | Algemene inkoop → tab "Wacht op goedkeuring" (`pages/algemene-inkoop/index.tsx`) |
| `inkoopbon` | Opdrachtpagina → tab Inkoopplanning (`pages/opdrachten/inkoopplanning-tab.tsx`) |
| factuurtypen (4×) | Factuurdetail / financiële module (`routes/facturen.ts` levert status; frontend factuurpagina's) |
| `weekstaat` | Uren → Weekstaten (`pages/uren/weekstaten.tsx`) — mits er ooit een beleidsregel voor wordt ingericht |

**Alleen deze plekken.** Overige tabbladen (47 paginabestanden met tabs) hebben geen goedkeuringsplicht en krijgen conform de opdracht **géén** label (afwezig, niet grijs).

## 4. Afwijkingen / besluiten voor René

1. Alleen `opdracht_akkoord` heeft vandaag een geseede beleidsregel; de andere typen bestaan pas als er via Beheer → Goedkeuringsbeleid een regel wordt aangemaakt. Het label toont dus alleen iets waar écht een aanvraag bestaat of vereist is — de server bepaalt dat (`mag_goedkeuren`/aanvraagstatus), de frontend leidt niets af.
2. **Besluit weekstaat (15 aug 2026):** `weekstaat` krijgt een generiek `GoedkeuringLabel` in de weekstatenlijst. Er wordt **geen** beleidsregel geseed — René richt die desgewenst zelf in via Beheer → Goedkeuringsbeleid. Het label toont dan vanzelf. Loon/salarisgoedkeuring (aparte weekstaat-goedkeuren-flow) loopt bewust buiten de generieke motor.
3. Loon/salaris (SEPA e.d.) loopt **niet** via de generieke motor (audit-/documenttypen, geen governance) — geen label.
