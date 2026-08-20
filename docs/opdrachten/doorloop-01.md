# DOORLOOP_01 — Doorloop van FPS Connect

**Gemaakt voor:** René Vink · **Datum:** 8 augustus 2026 · **Door:** Claude, op commit van 8 augustus
**Aanleiding:** *"Elke keer als ik een onderdeel benoem kom jij met best belangrijke tekortkomingen. De app is zo groot dat ik ze niet allemaal handmatig langs kan. Kun jij dan niet alles langslopen."*

---

## 0. Wat dit document wel en niet is

**Wel gemeten:** bestaat iets · zit het achter een rechtencontrole · zit er een transactie omheen · is er een AI-prompt en waarmee wordt die gevoed · gebeurt er iets met datums · bestaan er meerdere wegen naar hetzelfde.

**Niet gemeten:** of de bedrijfslogica klopt. Of een berekening goed afrondt of de juiste opslag pakt, is niet uit code af te lezen zonder hem te draaien.

**Elke bevinding heeft een vindplaats.** Reken ze na voordat er iets op wordt gebouwd — ik heb vandaag zelf een fout gemaakt door op één tabel te concluderen (`contract-bewaking`, zie §5).

**Eén controle is bewust weggelaten.** Een test op "dode routes" leverde onbruikbare uitkomsten: de frontend roept de API aan via een gegenereerde client (`lib/api-client-react`), niet via letterlijke paden. Elke uitkomst van die test zou ruis zijn geweest.

**Omvang van het systeem:** 112 routebestanden · **282 databasetabellen** · twee frontends.

---

## 1. Wat je vandaag zou doorzetten — de vier zwaarste

### 1.1 — Importeren staat open voor iedereen

`routes/import.ts` — **geen enkele van de vier routes heeft een bevoegdheidscontrole.** `POST /import/uitvoeren` (r. 80), `GET /import/logs` (r. 284) en `GET /import/template/:type` (r. 532) vereisen alleen dat je bent ingelogd.

Via die route komen onder meer **eenheidsprijzen**, historische facturen en historische projecten binnen. Elke ingelogde medewerker — een monteur, een uitzendkracht — kan in principe je prijzenbibliotheek overschrijven.

*Vindplaats: `artifacts/api-server/src/routes/import.ts`, r. 38, 80, 284, 532.*

### 1.2 — Calculaties: zes schrijfroutes zonder modulerecht

`routes/calculaties.ts` — aanmaken, wijzigen en verwijderen van een calculatie én van calculatieregels vereisen alleen een geldige sessie, geen `calculaties`-recht.

Dit is de module waar je prijzen in staan.

*Vindplaats: `calculaties.ts` r. 103, 170, 207, 235, 276, 321.*

### 1.3 — Facturen: 56 schrijfacties in de route, nul transacties

`routes/facturen.ts` doet 56 schrijfacties zonder één `db.transaction`. De factuurstroom-service (`services/factuurstroomService.ts`) gebruikt ze **wel**, dus het is niet overal fout — maar de routes zelf niet.

Waar meer dan één tabel wordt gewijzigd, kan de helft slagen en de helft mislukken. Bij facturen betekent dat een statuswijziging zonder bijbehorende regel, of andersom.

**Zelfde patroon, zelfde risico:** `werkvoorbereiding.ts` (36 schrijfacties, 0 transacties) · `mod-calculatie.ts` (36, 0) · `werk-inbox.ts` (20, 0) · `inbox.ts` (16, 0) · `planning-module.ts` (15, 0) · `salarisarchief.ts` (13, 0) · `contract-bewaking.ts` (13, 0) · `workflow.ts` (11, 0) · `snagstream.ts` (10, 0) · `import.ts` (10, 0).

Dit is een uitbreiding van punt 13 uit `technische-schuld.md`, dat toen op acht routes is opgelost.

### 1.4 — Bewaking bestaat, maar gaat niet vanzelf af

`routes/contract-bewaking.ts` maakt signaleringen aan op 120, 90, 75, 60 en 30 dagen, plus ketenregel en aanzegtermijn — **maar alleen wanneer iemand die route aanroept.** Geen verwijzing in de opstartcode, geen geplande taak.

Hetzelfde geldt voor de Poortwachter-mijlpalen, verlopende certificaten en keuringen. Wordt opgelost door `WERKBAK_01`.

---

## 2. Overige schrijfroutes zonder modulerecht

Alleen ingelogd zijn is genoeg voor:

| Module | Routes |
|---|---|
| `uitvoerder` | sessie starten · bericht sturen · bevestigen (r. 54, 159, 290) |
| `systeem` | helpdesk · feedback · muis-gebeurtenissen (r. 89, 155, 179) |
| `hrm` | `PATCH /verlofaanvragen/:id` (r. 2167) — **let op: dit is het wijzigen van andermans aanvraag** |
| `werkdag` | status van een werkdagitem (r. 148) |
| `pbm` | foto-inspectie (r. 325) |
| `materiaal-aanvragen` | aanvraag indienen (r. 262) |
| `inbox` | antwoord op een aanvraag via token (r. 1114) — **waarschijnlijk terecht**, want dat is een klantroute met eigen token |

`POST /mijn/verlofaanvragen` en `POST /mijn/ziekmeldingen` staan hier ook in maar zijn **terecht** zonder modulerecht: dat is de basislaag uit `APP_01` §4 — je eigen aanvraag indienen.

**Beoordeel per regel of het gat is of bedoeld.** Niet alles wat hier staat is fout; `systeem`/feedback bijvoorbeeld hoort waarschijnlijk open te staan.

---

## 3. Meerdere wegen naar hetzelfde — de duurste soort schuld

Dit is het patroon dat bij de medewerker-onboarding drie consolidatierondes in drie dagen kostte. Gemeten over 282 tabellen:

**3.1 — Inkoop bestaat in vier modellen naast elkaar:**
- `inkoopplannen` + `inkoopplan_regels` (werkvoorbereiding)
- `inkoopbonnen` + `inkoopbon_regels` (werkvoorbereiding)
- `magazijn_inkooporders` + `magazijn_inkooporder_regels` (magazijn)
- `mod_calc_inkoop_items` (calculatie)

Vier plekken waar een inkoop kan bestaan. `INKOOP_01` gaat ervan uit dat elke inkoop via één inkoopopdracht met werknummer loopt — **dat kan niet zolang er vier wegen zijn.** Dit hoort vóór `INKOOP_01` uitgezocht te worden.

**3.2 — Opdrachten in twee modellen:** `opdrachten` en `crm_opdrachten`. Plus de al bekende spanning tussen `projecten` en de projectvelden op `gebouwen`.

**3.3 — Contracten in vier modellen:** `onderhoudscontracten` · `financiele_contracten` · `offerte_klant_contracten` · `arbeidsovereenkomsten` (die laatste terecht apart). Plus `offerte_contract_adviezen`.

**3.4 — Documenten in dertien tabellen:** `documenten` · `document_koppelingen` · `document_goedkeuringen` · `document_logboek` · `document_toepassingen` · `document_classificatie_correcties` · `document_studio_modellen` · `dossier_documenten` · `financiele_documenten` · `financiele_document_log` · `medewerker_documenten` · `org_bedrijfsdocumenten` · `salarisdocument_audit`.

Niet allemaal fout — een loonstrookje hoort ergens anders dan een bouwtekening. Maar dertien is genoeg om te controleren of hier één begrip in stukken is gevallen.

**3.5 — Elf plekken voor meldingen en taken**, zoals eerder vastgesteld: `crm_taken` · `hrm_onboarding_taken` · `uitvoeringsplan_taken` · `gebruikers_meldingen` · `gereedschap_meldingen` · `veiligheid_meldingen` · `wagenpark_meldingen` · `ziekmeldingen` · `contract_signaleringen` · `factuur_signalen` · `financiele_contract_signaleringen`. Wordt aangepakt door `WERKBAK_01`.

---

## 4. Modules zonder bewaking of AI

**Geen enkele AI-prompt:** `wagenpark` · `dossiers` · `abonnementen` · `contracten`.

**Nul bewakingstermen ondanks datumvelden:** `inspecties` (513 r.) · `gebouwen` (1.875 r.) · `dossiers` (435 r.) · `abonnementen` (110 r.).

**`inspecties` is de meest opvallende:** het type `periodiek` bestaat, maar er is geen keuringstermijn, geen volgende datum en geen signaal. René heeft aangegeven dat "inspectie" voor hem een vaag begrip is — **controleer daarom eerst of het overlapt met de kwartaalcontrole in de monteur-app of met de controles op voorzieningen en spots.** Is dat zo, dan is het geen module om af te maken maar een dubbeling om op te ruimen.

**`onderhoud` (248 r.) is bewust karig gelaten** — er zijn nog weinig onderhoudscontracten. Niet aanpakken.

---

## 5. Twee correcties op mijn eerdere bevindingen

**5.1 — Contractbewaking bestaat wél.** Ik schreef in `HRM_01` §2.2 dat aanzegtermijn en contractverloop ontbreken. Fout: `contracten.ts` heeft `arbeidsovereenkomsten` met einddatum, `contract_signaleringen` met alle termijnen inclusief ketenregel en aanzegtermijn, en `contract_besluiten`. Ik keek naar `medewerker_aanstellingen` en concludeerde te snel. **§2.2 van `HRM_01` vervalt.**

**5.2 — `veiligheid.ts` leek nul routes te hebben.** Vals alarm: dat bestand gebruikt `veiligheidRouter.get(...)` in plaats van `router.get(...)`. De routes bestaan en hebben hun rechtencontrole.

---

## 6. Wat ik zou doen, in volgorde

1. **`import.ts` en `calculaties.ts` afsluiten** — kleinste ingreep, grootste risico weg. Vandaag.
2. **De overige routes uit §2 beoordelen**: gat of bedoeld. Levert een korte lijst op.
3. **`WERKBAK_01`** — lost §1.4 en §3.5 tegelijk op.
4. **De vier inkoopmodellen uitzoeken** vóór `INKOOP_01` gebouwd wordt.
5. **Transacties** op de tien modules uit §1.3, te beginnen bij facturen en werkvoorbereiding.
6. **`inspecties`**: eerst bepalen of het een dubbeling is, dan pas of het afgemaakt moet worden.

Punten 1 en 2 zijn klein. Punt 4 is een onderzoek, geen bouwopdracht — en het blokkeert een opdracht die al klaarstaat.

---

## 7. Wat dit document niet vervangt

Een doorloop op code vindt wat er structureel mis is. Hij vindt niet wat er inhoudelijk mis is — een verkeerde normtijd, een offerte die de verkeerde opslag pakt, een rapport dat niet klopt.

Dat komt alleen boven water door het te gebruiken. De monteurskant is 25.000 regels die nog nooit op een telefoon hebben gedraaid; dat is het grootste ongemeten stuk van het systeem.
