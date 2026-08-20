# ASSISTENT_01 — De Connect-assistent, altijd in beeld

**Opdrachtgever:** René Vink · **Datum:** 8 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect (`vinkrene-jpg/fps-one`, branch `main`)
**Hangt samen met:** `WERKBAK_01` (deelt de rechterrand) en `RECHTEN_01` (bepaalt wat de assistent mag zien).

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Wat er al is — gemeten 8 augustus 2026

**Het chatvenster bestaat.** `artifacts/firevault/src/components/ai-chat-panel.tsx` (267 r.) — maar hij wordt op precies **twee** pagina's gebruikt: het calculatiedetailscherm en het opdrachtdetailscherm. **Hij zit niet in de layout**, dus op alle andere pagina's is hij er niet.

**De backendkant bestaat ook**, en beter dan verwacht: `POST /adviseur/vraag` (`routes/adviseur.ts`) haalt de gebruiker op met zijn rol en bevoegdheden, en bouwt daarmee een systeemprompt — inclusief een opsomming van de modules die voor die gebruiker **geblokkeerd** zijn. De rechten zitten dus al in de prompt.

**Waar het ophoudt:** de adviseur doet één databasevraag — het ophalen van de gebruiker zelf. **Hij raadpleegt geen enkele bedrijfsgegeven.** Hij weet wie je bent en wat je mag, maar niet wat er in het systeem staat.

Daarnaast: alle AI loopt al via één poort (`lib/aiGateway.ts`) met een begrenzing per gebruiker en een dagplafond in euro's. Bouw daar niets naast.

---

## 2. Wat er komt

Drie dingen, in deze volgorde. **Bouw ze niet tegelijk** — punt 3 is het grootste en het risicovolste.

---

## 3. Fase 1 — Altijd in beeld

Het paneel verhuist van twee pagina's naar de **layout**, als vast in- en uitklapbaar element aan de rechterrand.

**Het deelt die rand met de werkbak uit `WERKBAK_01`.** Bouw daar één rand met twee tabbladen — *Werkbak* en *Assistent* — en niet twee panelen die om dezelfde ruimte vechten. Wie het eerst gebouwd wordt, legt die rand aan; de tweede sluit erop aan.

**Op de telefoon** (de PWA, zie `APP_01`) is het een eigen tabblad, geen zwevend venster over de inhoud heen.

**Ingeklapt onthoudt hij dat.** Wie hem dichtklapt, houdt hem dicht tot hij hem zelf opent.

---

## 4. Fase 2 — Weten waar je bent

Nu krijgt het paneel per pagina mee waar het over gaat. Zodra hij overal staat, moet hij dat zelf bepalen.

**Geef bij elke vraag mee: op welk scherm de gebruiker staat, en welk object hij open heeft** — deze offerte, dit gebouw, deze factuur, dit project. De bestaande route `ai-context` is daarvoor mogelijk al de aanzet; **stel vast wat die doet en meld dat** voordat er iets nieuws bij komt.

Zonder dit krijg je een venster dat overal hetzelfde antwoordt. Dat wordt na een week niet meer geopend.

**Toon zichtbaar waar de assistent nu over praat** — "je kijkt naar offerte 2026-114" — zodat de gebruiker weet waarom hij een bepaald antwoord krijgt.

---

## 5. Fase 3 — Gespecialiseerd in Connect

Dit is het eigenlijke werk. De assistent moet twee soorten kennis hebben:

**5.1 — Hoe Connect werkt.** Waar iets staat, hoe de keten loopt van aanvraag via calculatie en offerte naar opdracht, uitvoering, oplevering en nacalculatie. Wat een werknummer is en waarom een factuur zonder opdracht wordt afgewezen. Welk verschil er is tussen een gebouw en een opdracht.

Dat is beschrijvende kennis en hoort **onderhouden** te worden: leg vast in de repo waar die beschrijving staat, zodat hij meegroeit met het systeem in plaats van te verouderen in een prompt.

**5.2 — Wat er in het systeem staat.** De assistent moet gegevens kunnen opvragen: hoeveel offertes staan er open, wat is de status van dit project, welke facturen wachten op mij.

**Hier gelden harde regels:**

- **De assistent ziet uitsluitend wat de vragende gebruiker zelf mag zien.** Niet de rechten van de assistent, maar die van de gebruiker. Vraagt een monteur naar de marge op een project, dan komt daar geen antwoord op — en ook geen omweg via een samenvatting.
- **Dat wordt afgedwongen in de gegevensvraag, niet in de prompt.** Een instructie als "vertel dit niet aan monteurs" is geen beveiliging. De opvraging zelf moet begrensd zijn, langs dezelfde weg als `KLANT_01` voor klanten regelt.
- **Elk antwoord met een getal noemt waar het vandaan komt.** "Zeven openstaande offertes, per vandaag" — niet een getal zonder herkomst. Kan de assistent iets niet ophalen, dan zegt hij dat, in plaats van iets aannemelijks te verzinnen.
- **De assistent verandert niets.** Hij leest en legt uit. Wil iemand iets wijzigen, dan brengt hij hem naar de plek waar dat kan. Geen enkele actie wordt door de assistent uitgevoerd.

---

## 6. Kosten

De AI-poort heeft al een begrenzing per gebruiker en een dagplafond. Een assistent op elke pagina bij elke gebruiker verandert het gebruikspatroon aanzienlijk.

- **Meet en meld wat een gemiddeld gesprek kost.**
- Het paneel doet **niets** tot de gebruiker een vraag stelt — geen automatische samenvatting bij het openen van een pagina.
- Wordt het dagplafond geraakt, dan zegt de assistent dat in gewone taal.

---

## 7. Acceptatie

1. De assistent staat op elke pagina, in dezelfde rand als de werkbak, met twee tabbladen.
2. Klap ik hem dicht, dan blijft hij dicht tot ik hem open.
3. Hij toont zichtbaar waarover hij nu praat.
4. Op een offertepagina gaat een vraag over die offerte, op het factuuroverzicht over facturen.
5. Ik kan vragen hoe iets in Connect werkt en krijg een antwoord dat klopt met dit systeem — niet een algemeen antwoord over ERP-systemen.
6. Ik kan vragen wat er in het systeem staat en krijg getallen met de herkomst erbij.
7. **Een monteur die naar marges of loongegevens vraagt, krijgt daar niets over te zien** — ook niet indirect of samengevat.
8. De assistent voert nooit een wijziging uit.
9. Kan hij iets niet ophalen, dan zegt hij dat.

**Bewijs bij oplevering:** dezelfde vraag gesteld door drie gebruikers — hoofdbeheerder, iemand met beperkte rechten, en een monteur — met de drie antwoorden naast elkaar. Plus de gemeten kosten van een gemiddeld gesprek.

## 8. Wat niet mag

- Geen tweede chatonderdeel naast `ai-chat-panel.tsx`.
- Geen tweede AI-poort naast `lib/aiGateway.ts`.
- Geen afscherming die alleen in de prompt staat — het moet in de gegevensvraag zitten.
- Geen getal zonder herkomst.
- Geen actie die de assistent zelf uitvoert.
- Geen automatische AI-aanroep bij het openen van een pagina.
- Geen zwevend venster over de inhoud op de telefoon.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.

---

## Antwoorden en bevindingen in de repo

Antwoorden op vragen uit deze opdracht komen **niet alleen in de chat** maar worden vastgelegd in de repo:

- **vragen en bevindingen** → `docs/antwoorden/ASSISTENT_01.md`
- **metingen** → `docs/metingen/ASSISTENT_01_<onderwerp>.md`

Elk antwoord vermeldt: datum · commit-SHA waarop gemeten is · de vraag · het antwoord · en expliciet wat **gemeten** is en wat **aangenomen**. Is er een besluit van René nodig, schrijf dat als zodanig op — niet zelf invullen en doorbouwen.

**Twee punten om te melden:** (1) wat doet de bestaande route `ai-context` precies, en is dat de aanzet voor fase 2? (2) wat kost een gemiddeld gesprek, en wat betekent dat bij dagelijks gebruik door alle medewerkers?
