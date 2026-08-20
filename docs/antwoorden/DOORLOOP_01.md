# Antwoorden bij DOORLOOP_01 — uitgevoerd op 8 augustus 2026

Opdrachtbron: `docs/opdrachten/doorloop-01.md`. Uitgevoerd: punt 1
en 2 uit §6 (vandaag-lijst). Punten 4–6 zijn als vervolgtaken voorgesteld.

## §1.1 — Import afgesloten (GEMETEN, was open)

Alle vier de routes in `routes/import.ts` hadden inderdaad geen enkele
bevoegdheidscontrole. Nu:

| Route | Vereist nu |
|---|---|
| POST /import/preview | `systeem:2` |
| POST /import/uitvoeren | `systeem:2` |
| GET /import/logs | `systeem:1` |
| GET /import/template/:type | `systeem:1` |

Keuze voor `systeem`: import overschrijft gegevens over meerdere modules heen
(eenheidsprijzen, historische facturen, projecten) en hangt in de PWA onder
Instellingen → Beheer. Dat is systeembeheer, geen module-recht.

## §1.2 — Calculaties afgesloten (GEMETEN, was open)

Alle tien routes in `routes/calculaties.ts` eisten alleen een sessie. Nu:
lezen (lijst, detail, regels) = `calculaties:1`; schrijven (aanmaken, wijzigen,
verwijderen, regels, AI-regels) = `calculaties:2`. Hoofdbeheerder passeert
zoals altijd.

## §2 — Beoordeling per regel: gat of bedoeld

| Route | Oordeel | Onderbouwing (nagerekend) |
|---|---|---|
| `uitvoerder` sessie/bericht/bevestigen | **bedoeld** | elke handler bindt aan `monteurId === gebruikerId` (r. 81/133/170/304); andermans sessie geeft 403 |
| `systeem` helpdesk/feedback/muis | **bedoeld** | terugkoppeling hoort open te staan voor elke ingelogde |
| `hrm` PATCH /verlofaanvragen/:id | **gat → gedicht** | veldwijzigingen eisten al `personeel:2` en status loopt via de WorkflowEngine, maar `reden`/`opmerking` zonder status kon iedereen op andermans aanvraag zetten — nu alleen eigen aanvraag of `personeel:2` |
| `werkdag` status werkorder | **bedoeld** | handler eist eigenaarschap (`medewerkerId`-match) of hoofdbeheerder |
| `pbm` foto-inspectie | **gat → gedicht** | zusterroute (handmatige inspectie) eiste al `toolbox:2`; foto-route nu ook |
| `materiaal-aanvragen` indienen | **deels gat → gedicht** | de aanvraag was aan de sessie-gebruiker gebonden, maar kon aan élke opdracht worden gehangen — nu alleen opdrachten waar je op bent ingepland (kantoor met `offertes:2` en hoofdbeheerder mogen alles) |
| `inbox` antwoord via token | **bedoeld** | klantroute met eigen token, zoals het document zelf al vermoedde |
| `POST /mijn/verlofaanvragen`, `/mijn/ziekmeldingen` | **bedoeld** | basislaag APP_01 §4 |

## Review-bevindingen (architect) en wat ermee is gedaan

1. **Verlofaanvraag-gat** (hierboven) — gedicht en met een negatieve test bewezen.
2. **Materiaal-aanvraag-scope** (hierboven) — gedicht en bewezen.
3. **UI-gating PWA**: de importpagina toont voor `systeem:1` (alleen-lezen) nu een
   uitleg en een uitgeschakelde upload; de knoppen "Template downloaden" en
   "Importeren" op de eenheidsprijzenpagina verschijnen alleen met systeem-recht
   (het standaard Calculatie-profiel liep anders tegen een 403).
4. **Multer-volgorde**: op `/import/preview` staat de bevoegdheidscheck vóór de
   upload-middleware — een onbevoegde upload wordt geweigerd voordat het
   bestand (max 50 MB) wordt ingelezen.

## Meegevonden: `req.session.gebruikerId` bestond niet

Tijdens het bewijzen bleek dat ~21 handlers in 8 routebestanden (pbm,
meldingen, uitvoerder, opname, hrm, offertes, magazijn, materiaal-aanvragen)
`req.session.gebruikerId` lazen — een sessieveld dat nergens wordt gezet (de
sessie kent alleen `userId`). Die handlers gaven daardoor altijd 401, voor web
én mobiel. Alle usages omgezet naar `req.session.userId`. Dit verklaart
vermoedelijk eerdere "doet niets"-meldingen rond o.a. materiaal-aanvragen en
PBM-acties.

## Bewijs (GEMETEN)

`scripts/src/bewijs-doorloop01-autorisatie.ts` — 13/13 groen: monteur zonder
rechten krijgt 403 op alle import-, calculatie- en foto-inspectieroutes én op
andermans verlofaanvraag en een niet-toegewezen opdracht; medewerker met
`calculaties:2` + `systeem:1` kan calculaties en importlogs lezen maar géén
import uitvoeren.

## Meegenomen: typecheck-drift na de drie taakmerges van vandaag

Na de merges compileerde de api-server niet meer (stale lib-declarations +
ontbrekende import van de push-helper in `factuurstroomService.ts`). Beide
hersteld; monorepo-typecheck weer groen.

## Rest van §6 (voorgesteld als vervolgtaken)

- **Vier inkoopmodellen uitzoeken vóór INKOOP_01** (onderzoek, geen bouw).
- **Transacties** op de tien routebestanden uit §1.3, te beginnen bij facturen
  en werkvoorbereiding.
- **`inspecties`**: eerst vaststellen of het dubbelt met de kwartaalcontrole
  en de spot-controles; pas daarna (niet) afmaken.
- §1.4 en §3.5 zijn al opgelost door WERKBAK_01.
