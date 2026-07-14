# Uitvoeringsmodule — Architectuurplan

**Datum:** 13 juli 2026  
**Doelgroep:** 4–10 monteurs/timmermannen, 1 werkvoorbereider, projectadministratie, 1 projectleider  
**Werkgebied:** brandveiligheidsverbeteringen in utiliteits- en woongebouwen (brandwerende deuren, kozijnen, glas, brandkleppen, manchetten, coatings, kitten, multidisks)  
**Opdrachtvormen:** hoofdaannemer voor gebouweigenaar, of onderaannemer voor bouwbedrijf/installateur

---

## Het kernprobleem

Brandveiligheidswerkzaamheden zijn niet één grote klus, maar een mozaïek van kleine interventies verspreid over een gebouw — soms honderden spots. Dat maakt afwijkingen bijna onzichtbaar totdat ze al financieel schade hebben aangericht:

- Spot X kost 4u meer dan begroot → verdwijnt in de ruis
- Bewoner van appartement 14 werkt pas mee op de allerlaatste dag → team rijdt twee keer
- Meerwerk (extra kozijn bleek afwijkend type) → wordt mondeling afgesproken, vergeten in offerte
- Inkoop sloeg een goedkoper product in → ETA ontbreekt, montage stopt halverwege

De uitvoeringsmodule lost dit op door **elke spot als meetpunt** te gebruiken: voortgang, afwijkingen, meerwerk en wachttijd worden realtime zichtbaar — niet als handmatige rapportage, maar als bijproduct van het werk dat monteurs toch al doen.

---

## Principes

1. **Monteurs registreren één keer, het systeem leidt er alles uit af.** Geen dubbele administratie. Een foto en een statuswijziging volstaan; de module berekent voortgang, signaleert afwijkingen en stuurt de PL automatisch bij.
2. **AI signaleert, een mens beslist altijd.** AI herkent patronen (meerwerk, vertraging, kwaliteitsafwijking) en stelt voor — een mens accordeert voordat er actie volgt (meerwerkopdracht, herplanning, klantmelding).
3. **Spot = minimale eenheid van voortgang.** Elke spot heeft een geplande uren en materiaallijst uit de calculatie. De afwijking per spot is de waarheid, niet een schatting van de monteur aan het eind van de dag.
4. **PL heeft een cockpit, geen inbox.** Informatie wordt geaggregeerd en geprioriteerd aangeboden — niet als losse berichten of telefoontjes.

---

## Module-architectuur

```
Werkvoorbereiding
   ↓ PIM-model (stappen, materialen, ETA's)
   ↓ Begroting (uren per spottype × aantal)
   ↓ Inkooploading (via Offerte Intelligence)
   
Uitvoering (dagelijks)
   ↓ Monteur: spot afronden, foto, afwijking of meerwerk melden
   ↓ AI: foto-analyse kwaliteit, tijdafwijking signalering
   ↓ PL: live cockpit (voortgang %, meerwerk-wachtrij, bewoner-blokkers)
   
Afsluiting
   ↓ Facturatie-trigger (termijn bereikt of % gereed)
   ↓ Nacalculatie → FIE leereffect
   ↓ Opleverdossier + opleverrapport
```

---

## Onderdelen

### 1. Dagelijkse planningsbrief (AI)

**Probleem:** Planning is niet optimaal — monteurs rijden te veel, wachten op toegang, of beginnen aan een nieuwe klus terwijl een andere wacht op bewonersmedewerking.

**Oplossing:** Elke ochtend genereert het systeem een geprioriteerde werkvolgorde per monteur, rekening houdend met:
- Gebouwlocatie en reistijd (Google Maps koppeling — al gebouwd)
- Bewoner-beschikbaarheidsvensters (nieuw: bewoner geeft voorkeurstijden op via portaallink)
- Spottype clustering (brandkleppen in één vlucht doen voor die stelling staat)
- Openstaande afwijkingen die een extra bezoek vereisen (monteur maakt het direct goed)

**Output:** Een geprioriteerde spotlijst in de monteur-app met reisroute. Beheerder/PL kan herordenen. Wijzigingen worden direct doorgestuurd naar alle betrokkenen.

**Integraties:** Planning-module, Google Maps embed (al gebouwd), monteur-app werkdag-scherm (al gebouwd).

---

### 2. Voortgangsmeting per spot — de echte voortgang

**Probleem:** "Het is bijna klaar" betekent niets. De PL heeft geen grip.

**Oplossing:** Voortgang wordt berekend vanuit spot-statussen — niet op basis van een percentage dat iemand opgeeft.

```
Spot-statussen (al bestaand, worden uitgebreid):
  voorbereiding → ingepland → gestart → gereed_wacht_inspectie → opgeleverd

Voortgang% = (opgeleverde spots / totale spots) × 100
Uren% = (geboekte uren / begrote uren) × 100
```

Als voortgang% ver achterblijft bij uren%, is er een productiviteitsafwijking. Het systeem signaleert dit automatisch aan de PL.

**Bewoner-blokker bijhouden:** Als een spot niet gestart kan worden omdat een bewoner niet thuis is, markeert de monteur dit als "bewoner niet bereikbaar". Het systeem:
- Houdt bij welke spots geblokkeerd zijn
- Aggregeert per verdieping/vleugel
- Stelt de PL voor: "Overweeg een extra dag voor vleugel C — 8 spots geblokkeerd"
- Stelt de klant-contactpersoon op de hoogte via een gestandaardiseerde melding

---

### 3. Meerwerk-signalering (AI)

**Probleem:** Meerwerk wordt mondeling afgesproken, te laat gecalculeerd, en soms helemaal niet gefactureerd.

**Oplossing:** Drie bronnen van meerwerk-signalen, elk met een eigen flow:

**A. Monteur meldt actief meerwerk**  
Monteur ziet iets wat niet in de opdracht staat (kozijn heeft een derde schanier, was niet zichtbaar in tekening). Meldt dit in de app als afwijking-type "meerwerk", met foto en omschrijving.

Flow:
1. Monteur meldt → spot krijgt badge "meerwerk gesignaleerd"
2. PL ontvangt melding in cockpit (niet in e-mail)
3. PL beoordeelt foto + omschrijving en accordeert of verwerpt
4. Bij akkoord: automatische meerwerkopdracht aangemaakt, calculatie bijgewerkt, Governance-flow gestart voor akkoord opdrachtgever
5. Pas ná akkoord opdrachtgever mag monteur doorgaan (of PL slaat over met reden)

**B. AI herkent afwijkend spottype uit foto**  
Bij foto-analyse vergelijkt AI het spottype uit de opdracht met wat er op de foto staat. Als er een significante afwijking is ("dit is een stalen kozijn, opdracht zegt hout"), markeert het systeem de spot als "verificatie vereist".

**C. Tijdsoverschrijding per spot**  
Als een spot meer dan 150% van de begrote tijd kost, vraagt het systeem de monteur om een reden (één keuze: complexer dan verwacht / bewoner-vertraging / materiaalprobleem / anders). Deze reden gaat direct naar de PL.

---

### 4. Inkoop-bewakingskoppeling

**Probleem:** Inkoop krijgt te weinig aandacht, duurder ingekocht dan begroot, ETA ontbreekt waardoor montage stopt.

**Oplossing:** De werkvoorbereider ziet bij elk PIM-model welke materialen nog niet zijn ingekocht of bevestigd:

- **Inkoopstatus per artikel:** besteld / ontvangen / niet ingekocht / afwijkende prijs
- **ETA-alarm:** Als een artikel geen bevestigde leverdatum heeft en de uitvoering begint binnen 5 werkdagen, stuurt het systeem een melding aan de werkvoorbereider
- **Prijsafwijking-flag:** Als de inkoopprijs meer dan X% boven de calculatieprijs ligt, wordt dit automatisch gemeld. De werkvoorbereider besluit: door-calculeren, alternatief zoeken, of meerwerk-flow starten
- **Leverancierskoppeling:** Inkoopbonnen zijn al gekoppeld aan de Governance-motor (al gebouwd in Task #623). De uitvoeringsmodule koppelt dit terug naar de spotplanning: "Spot 47 (manchet DN200) staat ingepland op woensdag, maar manchet is niet bevestigd ontvangen."

---

### 5. PL-cockpit — de dagelijkse samenvatting

**Probleem:** PL is niet dagelijks op locatie, krijgt slechte terugkoppeling, moet zelf actief informatie ophalen.

**Oplossing:** Een scherm dat de PL's dag begint met drie dingen:

**Blok A — Vandaag**
- Welke monteurs zijn ingepland, op welk gebouw
- Hoeveel spots gepland / verwacht gereed vandaag
- Live voortgang zodra monteurs foto's uploaden

**Blok B — Signalen (actie vereist)**
- Meerwerk-aanvragen die wachten op PL-akkoord (met foto, één klik om te accorderen)
- Bewoner-blokkers die al X dagen open staan
- Tijdsoverschrijdingen boven drempel
- Inkoopalarm (materiaal niet bevestigd, uitvoering begint snel)

**Blok C — Status richting opdrachtgever**
- Voortgang% per gebouw (klaar voor klantrapportage?)
- Openstaande meerwerk-akkoorden van opdrachtgever
- Facturatiemomenten die eraan komen (op basis van voortgang%)

De PL ontvangt één dagelijkse AI-samenvatting (via het interne berichtensysteem, niet e-mail) met alleen de punt die actie vereisen. Geen roman — maximaal 5 punten.

---

### 6. Termijnfacturatie op basis van voortgang

**Probleem:** Geen inzicht in voortgang versus facturatie — te vroeg of te laat factureren.

**Oplossing:** Koppel de facturatie-termijnen direct aan voortgang%-drempels:

```
Termijnfacturatie-configuratie (per opdracht):
  Aanbetaling: 30% bij ondertekening (al via offerte/portaal)
  Termijn 1: 30% bij voortgang ≥ 40%
  Termijn 2: 30% bij voortgang ≥ 80%
  Slotnota: 10% bij oplevering goedgekeurd
```

Wanneer de drempel bereikt wordt, genereert het systeem een concept-factuur en legt die voor aan de projectadministratie voor controle — geen handmatig bijhouden meer.

Voor onderaannemerswerk: termijnen volgen de contractafspraken van de hoofdaannemer. De projectadministratie kan andere drempels instellen per opdracht.

---

### 7. Bewoners-coördinatie

**Probleem:** Bewoners die pas meewerken als de rest al klaar is kosten veel extra tijd. Geen gestructureerde communicatie.

**Oplossing:** Een eenvoudige bewonerslijst per gebouw (nieuw datamodel):

- Per appartement/ruimte: naam bewoner, contactgegeven (optioneel), voorkeurstijden, taalvoorkeur
- Status: bereikbaar / gecontacteerd / afspraak gemaakt / gereed / niet bereikbaar
- De projectadministratie beheert de lijst; monteurs updaten de status via de app

**AI-inzicht:** Na drie weken uitvoering signaleert het systeem: "Vleugel B heeft 6 onbereikbare bewoners. Op basis van het patroon (nooit thuis 's ochtends) stel ik voor: een avondafspraak-sessie in te plannen." De PL beslist.

**Klantcommunicatie:** Als de PL de opdrachtgever wil informeren over vertraging door bewoners, genereert AI een concept-melding (zakelijk, feitelijk, zonder schuld): "Op datum X zijn Y appartementen nog niet bereikbaar geweest. Wij verwachten dat dit de oplevering met Z werkdagen verlengt." PL past aan en verstuurt via het portaal.

---

## Integratie-overzicht

| Module | Koppeling uitvoering |
|---|---|
| **Werkvoorbereiding / PIM** | PIM-model bepaalt stappen en materialen per spot; uitvoering registreert afwijkingen terug |
| **Calculatie / offerte** | Begrote uren en materiaalkosten = referentie; nacalculatie vergelijkt na afloop |
| **FIE (Financial Intelligence)** | Nacalculatie-trigger bij afsluiting (al gebouwd #630); leereffect voor toekomstige kalkels |
| **Planning** | Dagelijkse werkvolgorde per monteur; herplannen bij bewoner-blokkers |
| **Inkoop / inkoopbonnen** | ETA-bewaking per materiaal, prijsafwijking-signalering, Governance-gate (al gebouwd) |
| **Governance & Approval Engine** | Meerwerk-akkoord flow (opdrachtgever accordeert via portaal), grote inkopen boven drempel |
| **Facturatie** | Voortgang% triggert concept-factuur aan projectadministratie |
| **Dossier / DMS** | ETA's en certificaten altijd beschikbaar per spot; foto's worden automatisch aan dossierkoppeling toegevoegd |
| **Opleverrapport** | Wordt samengesteld op basis van spot-statussen + foto's; al gebouwd (V1.4) |
| **Monteur-app** | Primaire invoer vanuit het veld; offline-first; foto-analyse AI |
| **Klantportaal (FPS One)** | Voortgangsrapportage, meerwerk-akkoord, bewonersmelding richting opdrachtgever |

---

## AI-functionaliteit — overzicht

| AI-functie | Input | Output | Mens beslist? |
|---|---|---|---|
| Foto-kwaliteitsanalyse | Foto monteur + referentiefoto uit PIM | Akkoord / twijfel / niet akkoord + annotatie | Ja, bij twijfel/afkeuring |
| Meerwerk-herkenning | Foto + spottype uit opdracht | "Spottype wijkt af: X in plaats van Y" | Ja |
| Tijdsafwijking-analyse | Geboekte uren vs. begroot per spot | Signaal + reden-picker voor monteur | Nee (automatisch) |
| Bewoner-patroonanalyse | Blokker-log per appartement | Voorstel voor alternatieve planning | Ja |
| Dagelijkse PL-samenvatting | Alle signalen van de dag | Geprioriteerde briefing in cockpit | Nee (automatisch) |
| Klantmelding-concept | Vertragingsoorzaak + duur | Concept-tekst voor PL om te controleren | Ja |
| Facturatie-trigger | Voortgang% bereikt drempel | Concept-factuur voor projectadministratie | Ja |
| Planning-optimalisatie | Openstaande spots + reistijd + bewoner-status | Geprioriteerde werkvolgorde | Ja (PL kan herordenen) |

---

## Bouwvolgorde (aanbevolen)

Elke fase is een zelfstandig, terugdraaibaar increment:

**Fase 1 — Cockpit & voortgangsmeting (web, minimaal frontend)**
- PL-cockpit met live voortgang% per opdracht/gebouw
- Spot-statussen vertalen naar voortgang (al gedeeltelijk gebouwd)
- Tijdsafwijking-signalering (drempel configureerbaar)
- Bewoner-blokker registratie in monteur-app

**Fase 2 — Meerwerk-flow**
- Meerwerk-meldscherm in monteur-app (foto + type + omschrijving)
- Meerwerk-wachtrij in PL-cockpit
- Governance-gate: akkoord PL → akkoord opdrachtgever via portaal
- Calculatie bijwerken na akkoord

**Fase 3 — Inkoop-bewaking**
- ETA-status per artikel per opdracht (werkvoorbereider beheert)
- Alarm bij uitvoering binnen 5 werkdagen zonder bevestigde levering
- Prijsafwijking-signalering gekoppeld aan inkoopbon-governance

**Fase 4 — Facturatie-koppeling**
- Voortgang%-drempels per opdracht configureren
- Automatische concept-factuur-aanmaak bij drempelbereiking
- Projectadministratie-controle voor versturen

**Fase 5 — Bewoners-coördinatie & AI-planning**
- Bewonerslijst per gebouw (nieuw datamodel)
- Patroonanalyse onbereikbare bewoners
- AI-dagelijkse PL-briefing
- Klantmelding-generator bij vertraging

**Fase 6 — Klantportaal-uitvoeringskaart**
- Opdrachtgever ziet live voortgang% en foto-impressie
- Meerwerk-akkoord via portaal (Governance al gebouwd)
- Bewonersmelding via portaal

---

## Wat er al staat (niet opnieuw bouwen)

- Spot-registratie + foto-upload monteur-app
- Spot-statussen en spotflow web + mobiel
- PIM-model stappen en VGE-guidance (deels)
- Plattegrond SVG-editor + renderer
- Nacalculatie-koppeling FIE (Task #630)
- Governance-motor voor meerwerk-akkoord (Task #621/#623)
- Inkoopbon-governance gate (Task #623)
- Opleverrapport-generator (V1.4)
- Facturatie-module basis
- Monteur-app offline-first infrastructuur

---

## Openstaande vragen voor bespreking

1. **Bewoners-contactbeheer:** Wie beheert de bewonerslijst — projectadministratie of de opdrachtgever zelf via het portaal? (Bepaalt datamodel en privacygrondslag)
2. **Meerwerk-drempel:** Welk bedrag of aantal uren is "klein meerwerk" (PL accordeert direct) versus "groot meerwerk" (opdrachtgever-akkoord verplicht via Governance)?
3. **Termijnfacturatie-structuur:** Werken jullie nu altijd met vaste termijnen, of ook met nacalculatie achteraf (urenadministratie × tarief)?
4. **Onderaannemers-verschil:** Bij onderaannemerschap: wie is de contactpersoon voor meerwerk-akkoord — de hoofdaannemer of de uiteindelijke opdrachtgever? Heeft dit een aparte workflow nodig?
5. **PL-cockpit prioriteit:** Is één scherm voor alle lopende opdrachten tegelijk de wens, of één scherm per opdracht?
