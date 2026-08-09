# WERKBAK_02 — Teamoverleg, eigen taken en de AI-workflow

**Opdracht voor Replit · 9 augustus 2026 · gemeten op `d3bf870` (`main`)**

---

## 1. Waarom deze opdracht bestaat

[stated] René, 9 augustus 2026, over Trello:

> Werkt niet fijn, omslachtig, te breed, te onduidelijk, enerzijds lijkt het dringend maar toch ook weer niet. Ik vind het niks. Maar we hebben wel iets nodig.

En over wat er wél moet kunnen:

> Het is fijn om als team wekelijks bij elkaar te zitten om restpunten, acties, plannen en ideeën te bespreken. En ze dan weg te zetten bij een persoon. Maar een week later moet je even de status met elkaar bespreken. Je wil ook kunnen zien hoe ver een collega is met een taak of plan. Misschien kun je even bijspringen bij zijn taak, iets snel oppakken.

Wat hij moet kunnen bijhouden: **overgebleven woningen · meterkasten · regie klusjes · facturen**.

**"Dringend maar toch ook weer niet" is de diagnose.** Dat is wat er gebeurt met een lijst zonder eigenaar, zonder datum en zonder gevolg: alles ziet er even dringend uit, dus is niets het. Deze opdracht bouwt daarom geen Trello-vervanger.

**Deze opdracht is uitsluitend voor kantoor** — desktop. [stated] René: "Op dit moment alleen kantoor." De telefoon-app blijft ongemoeid.

---

## 2. Wat er al staat — gemeten

`WERKBAK_01` is gebouwd en lost drie van de vier klachten al op:

| `werkbak_items` | Wat het doet |
|---|---|
| `soort` | **"doen"** (er wordt een handeling gevraagd) of **"weten"** (aandacht) |
| `gewicht` | rangschikking op **consequentie**, met bedrag en termijn meegewogen |
| `gebruikerId` · `vereisteModule` · `vereistNiveau` · `alleenHoofdbeheerder` | gerichte zichtbaarheid — je ziet niet andermans werk |
| `actiePad` | deep-link naar het item zelf, niet het moduleoverzicht |
| `actieType` | inline afhandelen (`verlof_beoordelen`, `goedkeuring_beslissen`) |
| `dedupSleutel` | partiële unieke index — één open item per sleutel |
| `status` | `open` · `afgehandeld` · `weggezet` **met reden** |

Routes: `/werkbak`, `/werkbak/aantal`, `/werkbak/:id/afhandelen`, `/werkbak/:id/wegzetten`, plus de draaien. Frontend: `components/werkbak-paneel.tsx` (247 r.).

**Veertien voeders** in `lib/bewakingsloop.ts`: contracten · financiële contracten · Poortwachter · verloopdatums · wagenparksync · verlofverjaring · factuursignalen · facturen zonder leverancier · goedkeuringsaanvragen · verlofaanvragen · facturen ter goedkeuring · betaalbatches · conceptantwoorden · mailantwoorden.

**Wat er ontbreekt, en dat is precies het gat:** in de code staat *"Bron uit de vaste lijst. Niets erin buiten die lijst om."* **Je kunt er zelf niets in zetten.** En van René's vier voorbeelden is alleen *facturen* aangesloten.

---

## 3. Drie ontbrekende bronnen aansluiten

Voeg toe als voeder in de **bestaande** `bewakingsloop.ts`. Geen nieuwe planner, geen nieuwe meldingentabel.

1. **Openstaande voorzieningen** — spots met een status die aangeeft dat er nog werk aan is, ouder dan een in te stellen aantal dagen. Dit dekt "meterkasten". Ontvanger: uitvoerder en werkvoorbereider.
2. **Openstaand regiewerk** — `routes/regie.ts` en de tabellen `regie_begroting` · `regie_materialen` · `regie_tarieven` · `regie_voorwaarden` bestaan al maar voeden de werkbak niet. Regiewerk zonder afronding of zonder klantakkoord. Ontvanger: werkvoorbereider.
3. **Restwoningen** — uit `PLANNER_01` §8. Bouw deze pas als de planner geïntegreerd is; **meld dat hij overgeslagen is** in plaats van hem stil weg te laten.

**Meld per bron welke statuswaarden je hebt gebruikt om "openstaand" te bepalen** — die zijn niet vooraf vast te stellen en mogen niet geraden worden.

---

## 4. Zelfgemaakte taken

E�n nieuw soort werkbakitem: door een mens aangemaakt, met `bron = "eigen"`.

**Twee velden zijn verplicht, en dat is niet onderhandelbaar:**

- **een eigenaar** — één persoon, geen groep
- **een datum** — wanneer het af moet zijn

Zonder die twee is het geen taak maar een aantekening. Aantekeningen horen bij het gebouw (`NOTITIE_01`), niet in de werkbak. **Het scherm biedt die uitweg ook actief aan:** kan iemand geen eigenaar of datum invullen, dan stelt het systeem voor er een gebouwaantekening van te maken.

**Meewerkers naast de eigenaar.** Een taak kan meerdere betrokkenen hebben, maar **altijd precies één eigenaar**. Meewerkers zien de taak in hun teamoverzicht en kunnen hem bijwerken; alleen de eigenaar kan hem afronden. Laat je dat onderscheid los, dan is een taak van iedereen en dus van niemand.

**Signaal bij de bron.** Wordt hetzelfde soort taak vaker dan een handvol keren met de hand aangemaakt — te herkennen aan gelijkende titels — dan is dat een aanwijzing dat er een bron ontbreekt. **Meld dat als telling in `docs/metingen/`; bouw er zelf geen automatiek voor.**

---

## 5. Het wekelijkse overleg

Dit is het hart van de opdracht. Niet een bord met kaartjes, maar **een weergave die je op het overleg van boven naar beneden doorloopt.**

**Vier blokken, in deze volgorde:**

1. **Afgesproken vorige week** — wat is ervan terechtgekomen. Per taak: eigenaar, status, en of de datum gehaald is.
2. **Loopt vast** — taken over datum, taken zonder voortgang sinds het vorige overleg, en werkbakitems die al twee weken open staan.
3. **Nieuw sinds vorige week** — wat er uit de bronnen bij is gekomen en wat mensen zelf hebben aangemaakt.
4. **Plannen en ideeën** — dingen zonder datum die je wél wil bespreken. Dit is het enige blok waar een item zonder datum mag staan, en dan uitsluitend als **idee**, niet als taak.

**Aan het eind van het overleg** kun je in één handeling nieuwe taken wegzetten bij een persoon, met datum. De week erna begint blok 1 met precies die taken.

**Het overleg wordt vastgelegd** — datum, aanwezigen, wat er besproken is per punt. Niet als notulen om te lezen, maar zodat blok 1 de week erna kan tonen wat er is afgesproken.

---

## 6. Twee weergaven, één bron

Hier zit een spanning die bewust opgelost moet worden.

De werkbak is er juist op gebouwd dat je **alleen jouw eigen** dingen ziet — dat is wat hem rustig houdt. René wil nu juist kunnen zien hoe ver een collega is.

**Oplossing: twee weergaven van dezelfde gegevens, geen tweede systeem.**

- **Mijn werk** — blijft precies zoals het is. Gericht, stil, alleen wat van mij is. Hier verandert niets aan.
- **Team** — toont taken van collega's met eigenaar, datum en status. Bereikbaar voor wie `personeel` of `planning` niveau 2 heeft, en rond het overleg.

**Wat het teamoverzicht níét toont:** werkbakitems die uit een bron komen en persoonlijk zijn — verlofaanvragen, salariszaken, alles met `alleenHoofdbeheerder`, en alles waar `vereisteModule` financieel of personeel is. **Het teamoverzicht toont taken, geen signalen.** Zou een brede lijst ontstaan waarop iedereen alles ziet, dan is dat precies René's klacht "te breed" opnieuw.

---

## 7. De AI-workflow

[stated] René: *"Ik wil een optie bieden voor elke desktopgebruiker om een workflow door AI samen te stellen. Prioriteit erin, omvang klus, benodigde informatie. Geen domme takenlijst maar een die AI vorm helpt geven."*

### 7.1 Wat de AI níét doet

- **Niet bepalen wat belangrijk is.** Bedrag en termijn zitten al in `gewicht`; dat weet het systeem beter dan een taalmodel.
- **Niet de omvang van een klus schatten** zolang er geen historie is om op te steunen. Een verzonnen tijdsinschatting is erger dan geen.
- **Niets herordenen over een sterniveau heen** (§7.3).

### 7.2 Wat de AI wél doet

Drie dingen, alle drie afleidbaar uit de eigen gegevens:

1. **Zeggen wat ontbreekt.** "Deze factuur kun je nu niet goedkeuren, de bijbehorende inkoopbon is niet gekoppeld." Uit de gegevens, niet uit een aanname.
2. **Groeperen.** Alles op hetzelfde gebouw bij elkaar. Alles wat één telefoontje kost bij elkaar. Vier kleine dingen tegenover één ding dat de halve ochtend kost.
3. **Zeggen wat kan wachten.** Nuttiger dan zeggen wat dringend is, en eerlijker: dat is af te leiden uit termijnen die nog ver weg liggen.

**Elke plaats in de lijst moet in één regel uit te leggen zijn.** "Jij gaf drie sterren." "Betaaltermijn verloopt morgen." Kan het systeem die zin niet produceren, dan hoort het item daar niet. Die regel staat zichtbaar bij het item.

### 7.3 Sterren

[stated] René: *"De ster is enkel bedoeld om in de workflow voor jezelf de volgorde te bepalen. Meer niet."*

Daaruit volgt alles:

- **De ster is persoonlijk en privé.** Geen signaal naar collega's, geen urgentielabel, geen escalatie, geen invloed op `gewicht`. Twee mensen kunnen hetzelfde item verschillend sterren en zien elkaars sterren niet.
- **De AI concurreert niet met de ster maar voert hem uit.** Hij sorteert volgens de sterren en ordent daarbinnen. **Hij verplaatst nooit iets over een sterniveau heen.**
- Wil de AI toch iets naar voren halen, dan is dat een **voorstel met reden**, zichtbaar naast het item — nooit een stille verplaatsing.

### 7.4 Mail in dezelfde lijst

Gemeten: mail zit al deels in de werkbak via `voedMailAntwoorden` en `voedConceptantwoorden`. `werk_inbox_mails` bevat al `actie_vereist`, `actie_vereist_reden`, `ai_voorstel_json` en een `conversation_id`. Een **ster- of prioriteitsveld bestaat nergens** — dat is nieuw.

- De ster hangt aan de **conversatie** (`conversation_id`), niet aan één bericht. Anders ben je hem kwijt zodra iemand antwoordt.
- Mail verschijnt in de workflow naast taken en werkbakitems, met dezelfde sterordening.
- **Geen tweede mailweergave.** De werk-inbox blijft wat hij is; de workflow toont er een selectie uit.

---

## 8. Verboden

- Geen nieuwe meldingentabel; `werkbak_items` bestaat.
- Geen eigen planner; de bewakingsloop bestaat.
- Geen zelfgemaakte taak zonder eigenaar én datum.
- Geen taak met meer dan één eigenaar.
- Geen persoonlijke of vertrouwelijke werkbakitems in het teamoverzicht.
- De AI verplaatst nooit iets over een sterniveau heen.
- De AI geeft geen tijdsinschatting zonder historie om op te steunen.
- Geen item in de lijst waarvan de plaats niet in één regel uit te leggen is.
- Niets van dit alles in de telefoon-app; dit is kantoorwerk.

---

## 9. Twee vaste eisen

**Toets elke aanname en meld afwijkingen.** Controleer per onderdeel welke module en welk niveau de bijbehorende backendroute werkelijk eist, en meld elk verschil met wat hier staat — **pas niets stilzwijgend aan**.

**Wijk je af van de scope van deze opdracht, meld dat dan vóór je bouwt.**

---

## 10. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. **De drie bronnen leveren items**, met per bron de gebruikte statuswaarden gemeld. Is restwoningen overgeslagen omdat de planner nog niet geïntegreerd is, meld dat expliciet.
2. **Een zelfgemaakte taak zonder eigenaar of zonder datum is niet op te slaan**, en het scherm biedt aan er een gebouwaantekening van te maken. Toon beide.
3. **Een meewerker kan de taak bijwerken maar niet afronden**; de eigenaar wel. Toon beide pogingen.
4. **Het overleg werkt over twee weken heen.** Zet in week 1 drie taken weg; toon dat ze in week 2 in blok 1 staan met hun status.
5. **"Mijn werk" is niet veranderd.** Toon dat een gebruiker daar exact dezelfde items ziet als vóór deze opdracht.
6. **Het teamoverzicht toont geen verlofaanvraag, geen salarisitem en niets met `alleenHoofdbeheerder`.** Toon het serverantwoord en bewijs de afwezigheid.
7. **De ster ordent, de AI overrulet niet.** Zet drie sterren op een item met laag gewicht en toon dat het bovenaan blijft staan. Toon ook een AI-voorstel om iets naar voren te halen, met de reden, zonder dat de volgorde vanzelf verandert.
8. **De ster van gebruiker A is onzichtbaar voor gebruiker B.** Toon beide antwoorden.
9. **Elke plaats is uitgelegd.** Toon de lijst met bij elk item de regel waarom het daar staat.
10. **De AI zegt wat ontbreekt.** Toon een item waarbij iets mist, met de melding, en bewijs dat die uit de gegevens komt en niet uit een aanname.
11. Meld hoe vaak in de proefperiode een zelfgemaakte taak met een gelijkende titel is aangemaakt — de aanwijzing dat er een bron ontbreekt.
