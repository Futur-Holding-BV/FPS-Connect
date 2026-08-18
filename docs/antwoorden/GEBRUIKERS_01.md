# GEBRUIKERS_01 — antwoorden

Datum: 18-08-2026 · Commit: zie changelog

## 1. Waar de lijst van tien vandaan kwam

**Meting.** Het scherm "Kies een functie" zit in het gebruikersbeheer
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

**Fix.** De keuzelijst rendert nu rechtstreeks `GET /profielen` — één bron met
de vaste presets (door de server geseed) én de zelfgemaakte profielen. Een
nieuw profiel verschijnt vanzelf. "Hoofdbeheerder" staat er als aparte
systeemrol bij (alleen zichtbaar voor hoofdbeheerders). De losse
"Financieel"-knop zonder bevoegdheden is daarmee vervallen; wie Financieel
nodig heeft kiest een echt profiel (bijv. Administratie of Externe
boekhouder) of maakt er één aan.

## 2. Profielen bewerken deed niets

**Meting matrixscherm.** Het staat wél op main:
`artifacts/firevault/src/pages/beheer/rollen-rechten.tsx`, route
`/beheer/rollen-rechten`. De legenda-woorden staan er als afkortingen
("L=Lezen W=Wijzigen A=Aanmaken B=Beheer —=Geen toegang"), vandaar dat een
zoektocht op de voluit geschreven reeks niets vond. Het komt gewoon via de
normale deploy op productie.

**Werkelijke oorzaak van "er gebeurt niets".** In de bewerkdialoog van de
kaartweergave (`beheer/profielen.tsx`) stond `<SelectItem value="">` voor
"Geen categorie". Radix Select verbiedt een lege string als item-waarde en
gooit een runtime-error zodra de dialooginhoud rendert. Gevolg: potlood
klikken → dialoog begint te renderen → crash → er verschijnt niets. Dit raakt
systeem- én zelfgemaakte profielen gelijk. Gefixt met een sentinel-waarde
(`__geen__` ↔ `null`).

**Let op:** hetzelfde `SelectItem value=""`-patroon staat nog op negen andere
plekken (o.a. inspecties/detail, beheer/meldingen, veiligheid/lmra,
opdrachten/inkoopplanning-tab, snagstream). Buiten scope van deze opdracht;
niet stilzwijgend aangepast. Aanbeveling: als losse opdracht in één keer
vegen.

**Welk scherm kan vervallen.** Geen van beide hoeft weg, want ze deden nooit
hetzelfde: de matrix (`/beheer/rollen-rechten`) is een leesoverzicht, de
kaartweergave (`/beheer/profielen`) is de enige bewerkplek. De "Bewerken"-link
in de matrix linkte alleen generiek naar de kaartenpagina — verwarrend. Die
link opent nu direct de bewerkdialoog van het betreffende profiel
(`/beheer/profielen?profiel=<id>`). Wil je toch één scherm, dan is de matrix
de kandidaat om te laten vervallen; bewerken blijft hoe dan ook op één plek.

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

De onboarding heeft nu een veld **Contract-einddatum** (zichtbaar bij alles
behalve "vast") en maakt bij afronden direct een arbeidsovereenkomst aan
(start = in dienst sinds, einddatum, CAO, uren; bij oproep bandbreedte vanaf
0 uur). Daarmee pikt de bestaande bewaking (120/90/75/60/30-dagen,
aanzegtermijn ≥ 6 maanden, ketenregeling) het contract vanzelf op — oproep en
bepaalde_tijd tellen daar als tijdelijk.

**Toets echte geval** (oproep, 0 uur, 6 maanden): zie
`docs/metingen/GEBRUIKERS_01-toets.md`.

## 4. Jonge medewerkers (alleen meting, niets gebouwd)

**Wat er is.** Geboortedatum is een gewoon HRM-veld (`medewerkers.geboortedatum`,
tekst): opslag, tonen op de personeelskaart, import (ook als dedupe-sleutel),
CV-extractie, en een leeftijd-tussen-haakjes-weergave in de onboarding
(`berekenLeeftijd`, puur informatief). Verjaardagsmomenten gebruiken bewust
alleen dag+maand (AVG). In de wervingsmodule is leeftijd juist een *verboden*
kenmerk voor AI-oordelen (discriminatiefilter).

**Wat er niet is.** Nergens een regel, validatie, planningscheck of
veiligheidsbeperking op medewerkerleeftijd: geen minderjarigheidscheck, geen
Arbeidstijdenwet-limieten voor 16/17-jarigen (max. werktijden, verboden
nachtdiensten), geen beperking op toegestane werkzaamheden of gevaarlijk werk,
niets in planning/werkdagmodule, niets in veiligheid/LMRA. De vaste werktijden
in documentopmaak (07:30–16:30) zijn leeftijdsonafhankelijk. Kortom: een
16-jarige wordt nu behandeld als elke andere medewerker; wil je bewaking op
jeugd-arbeidsregels, dan is dat volledig nieuwbouw. Beslissing aan jou.

## Scope-afwijkingen

- Bovengrens contracturen server 40→48 gelijkgetrokken met het scherm
  (gemeld hierboven, geen stilzwijgende wijziging).
- De losse "Financieel"-knop zonder profiel is vervallen door de overstap op
  één profielenbron (§1).
