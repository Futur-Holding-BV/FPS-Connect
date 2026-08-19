# GEBRUIKERS_01 — antwoorden

Datum: 18-08-2026 (v1) → 19-08-2026 (v2 definitief) · Commit: zie changelog

## Status

**DEFINITIEF — v2 volledig uitgevoerd en bewezen.**
Alle beslispoorten doorlopen, alle metingen groen, contract-scenario hertoets
19-08-2026 volledig geslaagd.

---

## V2-beslispoort functie ↔ profiel (19-08-2026)

De verplichte inventaris vóór de niet-destructieve consolidatie staat in
`docs/metingen/GEBRUIKERS_01-functie-profiel-inventaris.md`, gemeten op commit
`1ea45b820660` in development én productie.

**GEMETEN:** er bestonden vier bestaande functierijen — Algemene Administratie
en Project Administratie, elk dubbel per werkmaatschappij — met expliciete
`profiel_id`-koppeling. De overige zestien systeemprofielen hadden geen
functie-tegenhanger. De acht afwijkende namen uit de v2-tekst bestonden niet in
de database of `PRESETS`-code en zijn bewust niet aangemaakt.

### Besluit René 19-08-2026 — goedgekeurd en uitgevoerd

René heeft de voorgestelde niet-destructieve consolidatie goedgekeurd ná de
verplichte inventaris in
`docs/metingen/GEBRUIKERS_01-functie-profiel-inventaris.md`.

**Uitvoering:**

- Alle functies gelden globaal voor alle vier werkmaatschappijen (FPS Bouw,
  FPS Bouw en Renovatie, FPS Brandpreventie, FPS Onderhoud). Geen BV-kenmerk
  per functie; de werkmaatschappij staat op de medewerker/aanstelling.
- **IDs 8 en 9** (dubbele `Project administratie` en `Algemene Administratie`
  van FPS Bouw) zijn inactief gemaakt — niet verwijderd.
- **IDs 10 en 11** (FPS Brandpreventie-varianten) zijn behouden als de leidende
  functies, zonder BV-koppeling.
- **Zestien nieuwe functies** aangemaakt en expliciet via `functies.profiel_id`
  gebonden aan de reeds bestaande echte profielmatrices. Zie de volledige
  rechtenlijst in de inventarisdoc.
- Acht speculatieve namen (Backoffice Medewerker, Financieel Assistent, enz.)
  zijn niet aangemaakt.
- Migratie 0101 is niet-destructief uitgevoerd met snapshot en inverse
  dry-run. Dev-migratie: 51/51 PASS. Rollback dry-run: 8/8 (altijd ROLLBACK).
  Drift: 0. Rename/change-controles: groen. Volledige typecheck: groen.
  Functienaam-helper unit-tests: 6/6.
- De echte API-hertoets bewijst bovendien dat legacy functie-, profiel-,
  herkomst- en accountrechtenmutaties met HTTP 410 zijn gesloten.
- De browserhertoets bewijst aanmaken/bewerken, inline functie-aanmaak,
  rechtenpreview, redirects, één Functiehuis-ingang en het ontbreken van een
  fysieke verwijderactie.

Bewijs: `docs/metingen/GEBRUIKERS_01-v2-bewijs.md`.

### Resulterende architectuur

Profielen zijn voortaan technische rechtenmatrices achter functies — geen
zichtbaar tweede gebruikersconcept. De enige beheerplek is
**Personeel → Functiehuis**. De oude profiel-, rollen- en objectrechtenpagina's
zijn verwijderd; routes sturen door. Instellingen bevat nog één item
"Functiehuis".

Functie aanmaken/bewerken omvat de volledige rechtenmatrix. Vanuit
"Aanstelling toevoegen" kan een functie inline worden aangemaakt, waarna direct
selecteren en rechten inzien mogelijk is.

### Effectieve rechten en audit

Effectieve rechten = optelling van actieve functiebasisrechten uit de hoofd-
aanstelling plus alle nevenafspraken, met per-module afwijkingen per persoon als
override. Elke afwijking legt reden, actor en tijdstip vast in een
append-only auditlog. `apply` overschrijft nooit stilzwijgend afwijkingen; een
expliciete reset vereist een opgegeven reden.

### Autorisatiehardening na code-review

Een gerichte review vond dat `personeel:2` aanvankelijk voldoende was om via
het Functiehuis een willekeurige rechtenmatrix te maken en die functie daarna
via HRM toe te wijzen. Dat vormde een privilege-escalatie.

De definitieve serverregel is nu:

- hoofdbeheerder en `gebruikers:4` mogen iedere functiematrix beheren;
- andere HRM-schrijvers mogen per module nooit een hoger niveau maken,
  wijzigen, toewijzen of verwijderen dan zij zelf effectief bezitten;
- bij een functiewissel controleert de server zowel de oude als de nieuwe
  functie, zodat een beperkte actor ook geen hogere rechten van een ander kan
  afnemen;
- algemene routepoorten, declaraties, toolbox, Slim Upload, veiligheid,
  import, social, Go Live en de AI-adviseur beslissen op effectieve
  functierechten; het oude accountmatrixveld is daar geen autorisatie- of
  doelgroepbron meer.

De live regressieproef met een echt `personeel:2`-account bewijst:

1. functie met `gebruikers:4` maken → HTTP 403;
2. een bestaande hoger gerechtigde functie aan zichzelf koppelen via
   `POST /medewerkers` → HTTP 403;
3. vervangen/verwijderen, accountverplaatsing, (de)activering via status of
   dienstdata, offboarding, medewerkerverwijdering, hoofd-/nevenaanstellingen
   en goedkeuring van een AI-indienstdatum → allemaal HTTP 403;
4. medewerker en AI-voorstel blijven na de weigering ongewijzigd.

Bewijs: `scripts/src/verificatie-gebruikers01-autorisatie.ts`.

### Functietitels / veldstatus

Hardcoded auth/titellijsten zijn verwijderd. `is_uitvoerend_veld` komt nu uit
actieve functies. Runtime-queries voor planning, toegang en notificaties op
projectleider, werkvoorbereider, toolbox-rol en bouwrol gebruiken
functies/aanstellingen — niet meer `users.functietitels`. De tijdelijke
API-responsnaam `functietitels` blijft voor clientcompatibiliteit, maar wordt
live uit actuele HRM-functies gevuld; de legacy databasekolom is geen
runtimebron meer.

---

## 1. Waar de lijst van tien vandaan kwam

**Meting.** Het scherm "Kies een functie" zat in het gebruikersbeheer
(`artifacts/firevault/src/pages/gebruikers/index.tsx`). De lijst was een
**hardcoded array** (`FUNCTIE_GROEPEN`, 12 vaste namen) en gebruikte de
profielen-API alleen om bij een gekozen naam de bevoegdheden op te zoeken.
Voor niet-hoofdbeheerders werd "Hoofdbeheerder" weggefilterd → 11 knoppen; de
waargenomen "tien" komt overeen met die hardcoded set (de telling kan per rol
en versie één verschillen). Afwijking t.o.v. de bron: de 18 presets in
`lib/permissies` én alle zelfgemaakte DB-profielen ontbraken — precies de acht
genoemde presets (Onderhoudsmonteur, Externe inhuur, Planner, Calculatie,
Directie, Administratie, Wagenparkbeheerder, Magazijnbeheerder) plus alle
eigen profielen. Twee knoppen ("Hoofdbeheerder", "Financieel") hadden zelfs
géén profielkoppeling (`presetNaam: null`), dus "Financieel" gaf lege
bevoegdheden mee.

**Fix (v1).** De keuzelijst renderde direct `GET /profielen` — één bron. Dit
gebruikersbeheer-scherm bestaat in v2 niet meer: zie §V2 hierboven. De
"Financieel"-knop zonder bevoegdheden is definitief vervallen.

---

## 2. Profielen bewerken deed niets

**Werkelijke oorzaak.** In de bewerkdialoog van de kaartweergave
(`beheer/profielen.tsx`) stond `<SelectItem value="">` voor "Geen categorie".
Radix Select verbiedt een lege string als item-waarde en gooit een
runtime-error zodra de dialooginhoud rendert. Gevolg: potlood klikken →
dialoog begint te renderen → crash → er verschijnt niets. Dit raakte
systeem- én zelfgemaakte profielen gelijk. Gefixt met een sentinel-waarde
(`__geen__` ↔ `null`).

**Noot voor overige locaties.** Hetzelfde `SelectItem value=""`-patroon stond
op negen andere plekken (inspecties/detail, beheer/meldingen, veiligheid/lmra,
opdrachten/inkoopplanning-tab, snagstream). Buiten scope van deze taak; niet
stilzwijgend aangepast. Aanbeveling: in één keer vegen als losse opdracht.

**Schermen nu verwijderd.** De tabelweergave (`beheer/rollen-rechten.tsx`) en
de kaartweergave (`beheer/profielen.tsx`) zijn in v2 verwijderd. Routes sturen
door. De matrix bestond op `main` — legenda als afkortingen
("L=Lezen W=Wijzigen A=Aanmaken B=Beheer —=Geen toegang"), waardoor een
zoektocht op de voluit geschreven reeks niets vond. De kaartweergave was de
enige bewerkplek; de "Bewerken"-link in de matrix linkte alleen generiek naar
de kaartenpagina — verwarrend. Nu is alles geconsolideerd in Functiehuis.

---

## 3. Contractvorm en nul contracturen

**Wat er wegviel bij nul uren.** Twee blokkades: (a) de server weigerde de
héle medewerker-aanmaak bij `contracturen_per_week <= 0` (en ook bij > 40,
terwijl het scherm tot 48 toestond); (b) het AI-voorstelpad en de payload
behandelden `0`/lege string als "geen waarde" (falsy checks), waardoor het
urenveld stil wegviel. Beide gefixt: geldig bereik is nu **0 t/m 48** op
scherm én server, en `0` wordt overal expliciet als waarde doorgegeven.

**Vertaaltabel.** Er bestond er géén: de onboarding schreef `dienstverband`
alleen naar de personeelskaart en maakte nooit een arbeidsovereenkomst aan,
dus de contractbewaking zag nieuwe medewerkers helemaal niet. De enige
bestaande vertaling zat andersom (contract-extractie → aanstellingsformulier:
`onbepaalde_tijd→vast`, `bepaalde_tijd→tijdelijk`, rest→null — oproep viel
daar dus weg). Nieuwe, nu geldende tabel (onboarding → bewaking):

| Onboarding (`dienstverband`) | Bewaking (`contracttype`) |
|---|---|
| vast | onbepaalde_tijd (einddatum altijd leeg) |
| tijdelijk | bepaalde_tijd |
| oproep | oproep |
| stage | stage |
| zzp / payroll / detachering / directie | geen arbeidsovereenkomst (bewust: geen eigen contract) |

De onboarding heeft een veld **Contract-einddatum** (zichtbaar bij alles
behalve "vast") en maakt bij afronden direct een arbeidsovereenkomst aan
(start = in dienst sinds, einddatum, CAO, uren; bij oproep bandbreedte vanaf
0 uur). Daarmee pikt de bestaande bewaking (120/90/75/60/30-dagen,
aanzegtermijn ≥ 6 maanden, ketenregeling) het contract vanzelf op — oproep en
bepaalde_tijd tellen daar als tijdelijk.

**Hertoets 19-08-2026 — alle scenario's PASS:**

| Stap | Scenario | Uitkomst |
|---|---|---|
| 1 | Ingelogd | PASS |
| 2 | GET /functies-v2: 18 globale functies, alle met expliciete rechtenkoppeling | PASS |
| 3 | V2-functie bewerken; legacy functie/profiel/account/herkomstrechtenmutaties geven 410 | PASS |
| 4 | POST oproep + 0 uur + einddatum 2027-02-19 | PASS |
| 5 | Kaart: dienstverband=oproep, uren=0 | PASS |
| 6 | Contractbewaking: type=oproep, einddatum-bewaking actief | PASS |
| 7 | Negatieve uren geweigerd (400) | PASS |
| 8 | Concept-medewerker zonder startdatum: nog geen contract | PASS |
| 9 | Wizard-afronding: exact één contract; herhaalde PATCH geen tweede | PASS |
| 10 | `personeel:2` kan geen functie met `gebruikers:4` maken | PASS (403) |
| 11 | `personeel:2` kan geen hoger gerechtigde functie aan zichzelf koppelen | PASS (403, fail-closed) |
| 12 | Alle HRM-vervang-/intrek-/verplaats-/wizardpaden voor hogere functierechten | PASS (403, geen gedeeltelijke mutatie) |

Volledig toetsrapport: `docs/metingen/GEBRUIKERS_01-toets.md`.

---

## 4. Jonge medewerkers — gecorrigeerde meting

**Eerdere conclusie was achterhaald door parallelle werkzaamheden.**

De eerdere v1-versie van dit antwoorddoc stelde dat er nergens een
leeftijdsregel, validatie of planningscheck bestaat. Die conclusie is stale:
parallel aan deze taak zijn de volgende implementaties tot stand gekomen:

- `artifacts/api-server/src/lib/jongeWerknemerRegel.ts` — codeert de
  ATW-beperkingen voor jeugdige medewerkers.
- `planning-module.ts` — controleert plannen voor medewerkers onder 18 jaar en
  rapporteert overtredingen.
- `BIAE compliance-monitoring.ts` — signaleert actieve medewerkers onder 18.

In het kader van GEBRUIKERS_01 is niets extra's gebouwd op dit vlak. René
beslist over verdere beleidstoepassing en eventueel vervolg.

**Wat nog steeds geldt:** geboortedatum is opgeslagen als HRM-veld
(`medewerkers.geboortedatum`), beschikbaar op de personeelskaart, bij import
(ook als dedupe-sleutel), CV-extractie en als informatief leeftijdslabel in de
onboarding (`berekenLeeftijd`). Verjaardagsmomenten gebruiken bewust alleen
dag+maand (AVG). In de wervingsmodule is leeftijd een *verboden* kenmerk voor
AI-oordelen (discriminatiefilter).

---

## Scope-afwijkingen

- Bovengrens contracturen server 40→48 gelijkgetrokken met het scherm
  en OpenAPI (0..48; gemeld hierboven, geen stilzwijgende wijziging).
- De losse "Financieel"-knop zonder profiel is vervallen door de overstap op
  Functiehuis (§V2).
- Acht speculatieve functienamen uit de v2-tekst zijn bewust niet aangemaakt
  (niet in database of PRESETS aangetroffen).
