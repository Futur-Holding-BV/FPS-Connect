# AKKOORD_01 — Antwoorden en bevindingen

## 2026-08-10 · gemeten op `77bbf11` (main) — fase 0

### Getoetste aannames uit de opdracht

| Aanname (opdracht) | Gemeten |
|---|---|
| §1.1 `POST /uren` toetst geen offerte/calculatie/opdracht-status | **klopt** (`routes/uren.ts` r.724-880: uurcode, HRM-weekvergrendeling, overwerkslot; geen statuscontrole) |
| §1.1b uren zonder opdracht altijd toegestaan | **klopt** (`toetsUurcode` r.686 → `{ok:true}` bij `opdrachtId == null`) |
| §1.2 `maakConceptInkoopbon` zonder statuscontrole | **klopt** (`lib/inkoopbonService.ts` r.38-85; leest `opdrachten.offerteId` zonder toets). Twee aanroepplaatsen: `werkvoorbereiding.ts` r.1300-1309 (handmatig) en `materiaal-aanvragen.ts` r.455-500 (automatisch, MATERIAAL_01 fase 3) |
| §1.3 offertestatussen; geen status `definitief` | **klopt** (`workflow-configs.ts` r.160-236) |
| §1.4 terugzetten op `offertes: 2` | **klopt** (`afgewezen→concept` r.221 en `ingetrokken→concept` r.234 beide `offertes: 2`; vanuit `ondertekend` geen terugweg) |
| §2 `opdrachtenTable` heeft geen akkoordveld | **klopt** (`lib/db/src/schema/opdrachten.ts` r.10-36); het omschrijvingsveld heet `omschrijving`, niet `werkomschrijving` |
| §5 `documentIntelligence.ts`: geen categorie `opdrachtbevestiging`, alleen factuur-extractie, geen voorwaarden-extractie | **klopt** (categorieën r.26-53; `contract`→CRM r.227; `FactuurStroomVelden` + `onzekere_velden` r.902-938) |
| §6 goedkeuringsmotor per documenttype+bedragsband bestaat; haak op offerte-verzenden met `bedragInclBtw` | **klopt** (`goedkeuring-engine.ts` r.399-443, r.587-604; `workflow-configs.ts` r.189-205) |

### Afwijkingen die de opdracht moet weten

1. **"De opdracht ontstaat bij ondertekening (`portaal.ts` r.528)" klopt niet.** De portaalroute maakt bij ondertekening een **project** aan (r.518-554), geen opdracht. De opdracht ontstaat handmatig via `POST /offertes/:id/maak-opdracht` (`routes/opdrachten.ts` r.139-182, recht `offertes: 2`). Gevolg voor het model: grond A (ondertekende offerte) wordt bij het aanmaken van de opdracht automatisch vastgelegd als de gekoppelde offerte `ondertekend` is — er is geen bestaand aanmaakmoment "bij ondertekening" om op mee te liften.
2. **Voorwaardensets zijn vrije tekst.** `offerte_voorwaarden_sets` heeft alleen naam/versie/tekst/actief (`offertes.ts` r.29-39); gestructureerde velden (betaaltermijn, garantie, meerwerk, oplevering, boete/korting) bestaan er niet. Wel op de offerte zelf: `betalingstermijnDagen`, `betaalwijze`, `factuurSchema` (r.100-103) en `voorwaardenSetId`+`voorwaardenSnapshot` (r.106-108). De condities uit §4 komen dus als gestructureerde velden op de **opdracht** (bron per grond), met verwijzing naar de voorwaardenset; er komt géén tweede voorwaardenopslag.
3. **Schema-commentaar `opdrachten.ts` r.7-9** ("aangemaakt wanneer offerte status 'akkoord' of 'ondertekend' wordt") beschrijft niet-bestaand gedrag; wordt opgeruimd (conform §2-opmerking).
4. **Dev-database bevat 0 urenregels** — de §3.2-meting kan alleen op productie; opgeleverd via hoofdbeheerder-meetendpoint (zie `docs/metingen/AKKOORD_01_uren_zonder_opdracht.md`).

### Vastgelegde keuzes (agent, binnen de door de opdracht geboden ruimte)

- **§3.3 materiaal-aanvraag zonder akkoord:** gekozen voor **weigeren van de goedkeuring met een heldere melding** (422, tekst noemt dat het akkoord op de opdracht ontbreekt en hoe dat vast te leggen). Motivering: de poort is er juist om verplichtingen zónder akkoord te voorkomen; goedkeuren-zonder-bon met alleen een signaal laat het gat bestaan en creëert een stille uitzondering op "goedkeuring ⇒ bon" uit MATERIAAL_01 fase 3. Er wordt níet ook een signaalvariant gebouwd.
- **§6 bedrag:** de band gebruikt **inclusief btw** (`bedragInclBtw`), gelijk aan de bestaande offerte-haak — één maatstaf in de hele motor, geen tweede definitie.

### Besluit nodig van René (niet zelf ingevuld)

- **§6.2 preset "Bedrijfsleider"** — voorstel voor de bevoegdheden (op basis van de bestaande presets Projectleider en Directie): projecten 2 (lezen mét bedragen), offertes 3, calculatie 2, inkoop 3, personeel 1, financieel 1, goedkeuring 3 (vereist om te mogen goedkeuren, `goedkeuring-engine.ts` r.499-531), overige modules 0. **Wordt pas gebouwd/geactiveerd na akkoord.** Tot die tijd wordt de €10.000-beleidsregel voorbereid maar niet gezaaid.
