# FACTUUR_02 — De factuurstroom: van mail tot goedgekeurd of afgewezen

**Opdrachtgever:** René Vink · **Datum:** 7 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Volgorde:** ná `FACTUUR_01`. Betaling en SEPA volgen in `FACTUUR_03` en zitten **niet** in deze opdracht.

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Uitgangspunt: er staat al meer dan je denkt

Bouw **geen** nieuw mailsysteem. `routes/werk-inbox.ts` (789 regels) bestaat en werkt al: mailboxen koppelen en beheren, synchroniseren, mails lezen, markeren, notities, koppelingen, verplaatsen, archiveren, beantwoorden, nieuw bericht versturen. De Azure/Entra-appregistratie is ingericht met de benodigde Graph-permissies.

Er bestaat ook al een AI-analyse per mail (`POST /werk-inbox/mails/:messageId/analyseer`) die acht voorstelsoorten kent, waaronder `factuur_herkennen`.

**Waar het ophoudt — dit is precies het werk van deze opdracht:**

1. De AI-analyse draait niet automatisch; hij moet per mail handmatig worden aangeroepen.
2. **Een voorstel is nu een label, geen uitgevoerde actie.** De AI zegt "dit lijkt een factuur" en daar stopt het — er wordt niets vastgelegd, gekoppeld of klaargezet.
3. `beantwoord` verstuurt wel, maar de tekst moet van buiten komen; er wordt geen concept geschreven.

Ook `lib/documentIntelligence.ts` herkent al de categorie `factuur` en haalt daar leverancier, bedrag, factuurnummer en jaar uit. Hergebruik dat; bouw geen tweede herkenner.

---

## 2. Eén ingang, geen tweede

**Een factuur komt Connect uitsluitend binnen via de mailstroom.** Er komt geen apart formulier "factuur toevoegen" naast.

Dit is een expliciete regel omdat dit project daar eerder duur op is uitgelopen: bij de medewerker-onboarding bestonden meerdere ingangen naast elkaar, wat drie consolidatierondes in drie dagen kostte (zie `docs/analyse-onnodige-fouten-opdrachten.md`, B1). Eén ingang, vanaf het begin.

Uitzondering die geen uitzondering is: een factuur die per post binnenkomt, wordt gescand en naar de factuurmailbox gestuurd. Dat is dezelfde ingang.

---

## 3. Wat de AI uit een factuur haalt

Bij binnenkomst leest het systeem uit de factuur en de bijlage(n):

| Gegeven | Opmerking |
|---|---|
| Leverancier | gekoppeld aan een bestaande relatie in `crm_klanten`, niet als losse tekst |
| Factuurnummer | |
| Factuurdatum en vervaldatum | vervaldatum ontbreekt vaak → afleiden uit de betalingstermijn |
| Bedrag exclusief btw, btw-bedrag, totaalbedrag | |
| IBAN van de leverancier | |
| **Loondeel (G-deel)** | **staat op de factuur zelf** — uitlezen, niet uit vaste afspraken halen |
| Tenaamstelling | bepaalt wélke BV betaalt: FPS Bouw BV · FPS Brandpreventie BV · FPS Onderhoud BV |
| Verwijzing naar opdracht, project of inkoop | indien aanwezig |

**Alles wat niet met zekerheid gevonden is, wordt als onzeker gemarkeerd — nooit stilzwijgend gegokt.** Een onzeker gegeven leidt tot een gebeurtenis (§6), niet tot een aanname.

---

## 4. De vaste controles en afwijsredenen

De AI toetst elke factuur aan onderstaande lijst. Dit is een **gesloten lijst**: de AI kiest eruit en licht toe, maar verzint nooit een nieuwe reden.

| Code | Reden | Toelichting |
|---|---|---|
| `geen_opdracht` | Geen opdracht of inkoop bekend | er is niets in Connect waaraan deze factuur hoort |
| `bedrag_wijkt_af` | Bedrag wijkt af van de opdracht | |
| `verkeerde_bv` | Verkeerde tenaamstelling of verkeerde BV | |
| `dubbel` | Dubbel ontvangen | zelfde leverancier én factuurnummer, of zelfde bedrag en datum |
| `onvoldoende_specificatie` | Onvoldoende gespecificeerd | |
| `niet_geleverd` | Werk niet geleverd of niet akkoord | |
| `uitzendbureau_zonder_g` | **Uitzendbureaufactuur zonder G-verdeling** | leverancier heeft type `uitzendbureau` of `inlener` (uit `FACTUUR_01`) maar er staat geen loondeel op de factuur — volledig automatisch, geen oordeel nodig |

**De ontsnappingsklep is een mens, geen tekstveld.** Past een geval niet in deze lijst, dan gaat de factuur naar Jacqueline. Er komt géén vrij invulveld voor een zelfbedachte afwijsreden — anders krijgt elke leverancier een net iets ander verhaal en is de stroom niet meer te tellen of te bewaken.

**Bij afwijzen:** de AI stelt de reden voor als meerkeuze, die wordt aangeklikt, en het systeem stelt de reactiemail aan de leverancier op. De toelichting onder de reden mag de AI in eigen woorden schrijven; de reden zelf blijft een code uit de lijst.

---

## 5. De vier rollen en de route van een factuur

Deze vier zijn wezenlijk verschillend en moeten apart bestaan:

| Rol | Doet | Doet niet |
|---|---|---|
| **Het systeem** | lezen, koppelen, controleren, voorbereiden, klaarzetten | goedkeuren |
| **De inkoper** (Ruben, of wie besteld heeft) | bevestigt dat wat er staat klopt met wat hij besteld heeft | betaling vrijgeven |
| **René** | keurt goed en geeft betaling vrij | |
| **Jacqueline** | bewaakt de stróóm, en het afwijsproces | keurt geen facturen goed |

**De route:**

```
mail binnen
  → systeem leest, koppelt, controleert
      → valt af op een vaste reden?  → afwijzen (mail naar leverancier), Jacqueline bewaakt
      → past niet in de lijst?        → Jacqueline
      → is er een inkoper bekend?     → naar die inkoper ter bevestiging
      → daarna                        → naar René ter goedkeuring
          → goedgekeurd → klaar voor betaling (FACTUUR_03)
```

Ruben werkt in Connect met eigen inlog en functie-gerelateerde toegang, via het bestaande bevoegdhedenmodel — geen aparte constructie.

**Routering van klaargezette mail:** alles rond het afwijsproces gaat naar Jacqueline; alles waar een geldoordeel in zit naar René.

---

## 6. Jacquelines dashboard: gebeurtenissen, geen facturen

Zij werkt niet per factuur maar reageert op gebeurtenissen. Te bouwen gebeurtenissen:

1. **De AI kwam er niet uit** — leverancier, BV of bedrag niet met zekerheid bepaald
2. **Het hangt te lang** — wacht al dagen bij de inkoper of bij René
3. **Het bedrag wijkt af** van wat deze leverancier normaal factureert
4. **Mogelijk dubbel**
5. **De betaaltermijn loopt af** — waarschuw vóór het samenstellen van de eerstvolgende batch, niet erna
6. **Uitgaande factuur niet betaald**
7. **Het rekeningnummer is gewijzigd** ten opzichte van eerdere facturen van deze leverancier
8. **Loondeel niet gevonden of onwaarschijnlijk** bij een uitzendbureau of inlener
9. **Onbekende leverancier** — nog niet in `crm_klanten`, of type nog niet bepaald

Gebeurtenis 7 verdient bijzondere aandacht: een gewijzigd rekeningnummer is de meest voorkomende vorm van factuurfraude. Die gebeurtenis mag nooit stil worden afgehandeld, ook niet als al het andere klopt.

**Belangrijk principe voor dit scherm:** het systeem moet zijn eigen twijfel actief tonen. Handelt het 95% stil af en zit het in 5% stilletjes naast, dan ziet een bewaker dat nooit — dan lijkt het juist goed te gaan. Onzekerheid tonen is hier het product.

---

## 7. Telefonische toelichting: de tijdlijn per factuur

Jacqueline moet, met een leverancier aan de telefoon, binnen tien seconden kunnen zeggen waar een factuur staat. Bouw daarvoor per factuur een **leesbare tijdlijn in gewone taal**:

- wat er is gebeurd, in volgorde, met datum
- bij wie hij nu ligt en sinds wanneer
- wat de verwachte vervolgstap is

Dit is een leesbaar scherm voor een mens aan de telefoon, geen technisch logboek. Geen veldnamen, geen statuscodes, geen JSON.

---

## 8. Reacties van leveranciers

Een reactie op een afgewezen factuur is voor het systeem gewoon inkomende mail. Er komt **geen aparte afhandelstroom** per situatie: de AI beoordeelt, en handelt af of zet klaar volgens §5.

**Technische voorwaarde die hiervoor gebouwd moet worden:** de koppeling tussen mail en factuur moet over het hele gespreksdraad blijven bestaan. Houd de `conversationId` uit Microsoft Graph vast en sluit aan op het bestaande koppelingsmechanisme in `werk-inbox`. Zonder dat ziet de AI een reactie als een losse nieuwe mail en kan hij er niets mee.

Levert de leverancier alsnog wat ontbrak — bijvoorbeeld het opdrachtnummer — dan gaat de factuur **automatisch terug de stroom in** op het punt waar hij was afgewezen. Hij begint niet opnieuw alsof hij vandaag binnenkwam.

---

## 9. Het systeem laten leren

Alle beoordeling zit nu in het hoofd van René. Het systeem kan dat alleen overnemen als het meekijkt.

Leg daarom bij elke factuur vast: **wat de AI voorstelde, én wat er uiteindelijk van gemaakt is.** Koppelt René hem aan een ander project dan voorgesteld, of zet hij hem klaar voor de inkoper terwijl de AI dat niet voorstelde — dat verschil is de leerstof.

In deze opdracht wordt dat verschil alleen **vastgelegd en zichtbaar gemaakt**, niet automatisch teruggevoerd in het model. Eerst meten hoe vaak en waarop de AI ernaast zit; pas daarna beslissen wat daarmee gebeurt.

---

## 10. Acceptatie — in gewone taal

1. Een factuur die binnenkomt in de factuurmailbox verschijnt vanzelf in de factuurstroom, zonder dat iemand op "analyseer" hoeft te klikken.
2. Leverancier, bedrag, factuurnummer, vervaldatum en de betalende BV staan ingevuld, of staan gemarkeerd als onzeker.
3. Bij een uitzendbureau staat het loondeel ingevuld — of de factuur is automatisch afgewezen met de reden dat de G-verdeling ontbreekt.
4. Een afwijzing kiest altijd een reden uit de vaste lijst; er is nergens een vrij tekstveld voor een zelfbedachte reden.
5. Past een geval niet in de lijst, dan komt hij bij Jacqueline terecht en blijft hij niet hangen.
6. Ruben ziet in Connect de facturen die hij moet bevestigen, en alleen die.
7. René ziet wat hij moet goedkeuren, met wat de AI ervan vond erbij.
8. Jacqueline ziet een dashboard met gebeurtenissen, niet met facturen.
9. Ik kan van elke factuur in gewone taal lezen wat er is gebeurd en waar hij nu ligt.
10. Stuurt een leverancier het ontbrekende na, dan pakt het systeem de factuur op waar hij was gebleven.
11. Bij elke factuur is terug te zien wat de AI voorstelde en wat er uiteindelijk van gemaakt is.

---

## 11. Wat niet mag

- **Geen tweede ingang voor facturen** naast de mailstroom.
- **Geen tweede documentherkenner** naast `documentIntelligence.ts`, en geen tweede mailmodule naast `werk-inbox.ts`.
- **Geen vrij tekstveld als afwijsreden.**
- **Geen stilzwijgende aanname bij een onzeker gegeven** — onzeker betekent een gebeurtenis, niet een gok.
- **Geen betaling of SEPA-generatie in deze opdracht.** Een goedgekeurde factuur krijgt de status "klaar voor betaling" en blijft daar staan tot `FACTUUR_03` gebouwd is.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck. Toon per acceptatiepunt het scenario zelf, uitgevoerd na de wijziging.
