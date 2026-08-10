# Gereedschap — inventarisatie voor Sparki en FPS Connect/One

**Opgesteld:** 10-08-2026
**Doel:** vastleggen welk extern gereedschap ons kan helpen, zodat we er later aan herinnerd worden.
**Status:** inventarisatie, geen besluit. Niets hieronder is in gebruik genomen.

Dit document is **niet aan één leverancier gebonden** en is geordend **per probleem**, niet per bedrijf. De vraag is steeds: welk gat bij ons vult dit, en wat kost het.

---

## 0. Leeswijzer — nagekeken of aangenomen

Bij dit project geldt dat alles wat beweerd wordt gemeten of nagekeken moet zijn, en dat wat niet te verifiëren is expliciet als onbekend wordt benoemd. Dat is hier aangehouden:

- **NAGEKEKEN** = gelezen op de officiële pagina van de maker op 10-08-2026
- **SECUNDAIR** = alleen aangetroffen in reviews of nieuwsberichten van derden; behandel getallen als indicatie
- **AL IN GEBRUIK** = staat aantoonbaar al gekoppeld of in de repo
- **ONBEKEND** = niet vastgesteld; de meting die het zou sluiten staat erbij

**Voorwaarden veranderen snel.** Bewijs staat in dit document zelf: de gratis Gemini CLI (± 1.000 verzoeken per dag) is per 18-06-2026 gestopt voor particulieren. Controleer vóór ingebruikname opnieuw.

---

## 1. Samenvatting

| Probleem | Kandidaat | Van wie | Oordeel |
|---|---|---|---|
| App ziet er niet uit als een app | **Stitch** | Google | Ja, beperkt — één plaatje per opdracht |
| Geen voorbeeldapp kunnen vinden | **Mobbin** | onafhankelijk | Onderzoeken — precies de vraag van 06-08 |
| Vormtaal drijft af per hoofdstuk | **Storybook** | open source | Sterkste structurele kandidaat |
| Kennis zit in hoofden | **NotebookLM** | Google | Ja, met **blokkerende** privacyvraag |
| Idem, mét vertrouwelijke gegevens | **AnythingLLM / Open WebUI** | open source | **Beste oplossing van de hele lijst** |
| Kleine reparaties naast Replit | **Copilot coding agent** | GitHub | Al bewezen op onze repo, nu ongebruikt |
| Idem | **Antigravity / Jules** | Google | Misschien — limieten dalen steeds |
| Schermafdrukken niet te vertrouwen | **Playwright** | open source | Ja — lost een bewezen bewijsprobleem op |
| Fouten in productie niet zichtbaar | **Sentry** | onafhankelijk | AL GEKOPPELD, inbouw nog open |
| Server valt om zonder dat we het weten | **UptimeRobot** e.d. | onafhankelijk | Ja, en goedkoop |
| Marketingcontent | **Pomelli** | Google | Nee — alleen Engelstalig |

---

## 2. Vormgeving en ontwerp

### Stitch (Google Labs) — ontwerp uit tekst
- meerdere schermen tegelijk, oneindig canvas, klikbare prototypes sinds maart 2026 — NAGEKEKEN
- export naar Figma en HTML/CSS; **`DESIGN.md`** = ontwerpregels als machineleesbaar bestand — NAGEKEKEN
- gratis met maandlimiet (genoemd: 350 generaties) — SECUNDAIR

**Waarvoor:** de wens "het moet eruitzien als een telefoon-app, met diepte en zwevende kaarten" is meermaals herhaald en meermaals niet uitgevoerd. Woorden laten ruimte; een plaatje niet.
**Risico:** Stitch máákt schermen, het repareert ze niet. Dat is het patroon dat al twee keer geld heeft gekost.
**Veilige inzet:** één scherm, als illustratie bij `VISUEEL_01`. Geen code-export.

### Figma — AL IN GEBRUIK (gekoppeld)
De koppeling staat al. Stitch exporteert hiernaartoe, dus de keten ontwerp → aanpassing → opdracht is al compleet zonder dat er iets bij hoeft.

### Penpot — open source alternatief voor Figma
Zelf te hosten, geen abonnement, geen limiet op bestanden. Relevant als de Figma-voorwaarden ooit knellen. ONBEKEND of het de Stitch-export aankan. **Meting:** een Stitch-export proberen te openen in Penpot.

### Mobbin — bibliotheek van échte app-schermen
Verzameling schermafdrukken uit bestaande telefoon-apps, doorzoekbaar op patroon (onboarding, kaartscherm, statistieken).
**Waarom dit hier staat:** op 06-08-2026 was de vraag letterlijk of er een voorbeeldapp bestaat die het goed doet, en die kon niet gevonden worden. Dit is het gereedschap voor precies die vraag.
**ONBEKEND:** of het gratis niveau genoeg toont. **Meting:** de prijspagina openen en vaststellen wat gratis zichtbaar is.

### Storybook — open source
Elk knopje, elke kaart en elke lijst als los, testbaar onderdeel op één pagina, los van de app.
**Waarom dit misschien de belangrijkste van de lijst is:** de terugkerende klacht is dat de vormtaal per hoofdstuk verschilt en dat schermen afdrijven. Storybook maakt afdrijving **zichtbaar** — je ziet alle knoppen naast elkaar en dus meteen dat er drie soorten zijn. Dat is geen ontwerpgereedschap maar een spiegel.
**Kosten, eerlijk:** dit is bouwwerk, geen aanmelding. Replit moet het opzetten en het moet onderhouden worden.

### tldraw / Excalidraw — schetsen
Gratis tekenvlak. Nut hier: een schets is een geldige invoer voor Stitch. Sneller dan een beschrijving typen.

---

## 3. Kennis uit documenten halen

### NotebookLM (Google) — vragen stellen aan eigen documenten
Bronvermelding per bewering is het kenmerk van het product — SECUNDAIR. Gratis niveau ruim voor individueel gebruik — SECUNDAIR.

**Waarvoor:** voor Sparki sluit dit aan op de eis dat kennisuitleg een bronvermelding heeft. Voor Connect op het punt "minder afhankelijk van personen, meer van systemen": veiligheidshandboek, personeelsgids, normen, Bouwbesluit-teksten.

**BLOKKADE, geen kanttekening:** documenten gaan naar Google. Voor een gepubliceerd handboek onschuldig; voor personeelsdossiers, salarisgegevens, klantgegevens of contracten is dat een **andere juridische categorie** dan de eigen VPS.
- **ONBEKEND:** wat de voorwaarden zeggen over hergebruik van geüploade gegevens. **Meting:** de voorwaarden van het gratis niveau lezen en vaststellen of er een Workspace-variant is waar dat anders geregeld is.
- **Regel tot dat bekend is:** alleen documenten die ook op de website hadden mogen staan.

### AnythingLLM — zelf gehost, en daarmee géén privacyvraag
**Dit is waarschijnlijk de belangrijkste vondst van deze inventarisatie.**
- open source onder MIT-licentie, gratis, zowel als bureaubladprogramma als via Docker op een eigen server — NAGEKEKEN (anythingllm.com)
- documenten, vectoropslag, chat en agents in één pakket; werkt met lokale modellen via Ollama óf met een betaalde sleutel van OpenAI/Anthropic — NAGEKEKEN
- ruim 63.000 sterren op GitHub, versie 1.15 in juni 2026 — SECUNDAIR

**Waarom dit precies ons probleem oplost:** het is functioneel hetzelfde als NotebookLM, maar de documenten blijven op eigen hardware. Daarmee vervalt de blokkade hierboven en mág er wél met personeels-, klant- en contractgegevens gewerkt worden.

**Verband met bestaand werk:** dit is inhoudelijk hetzelfde als wat met Forge is bedoeld — een eigen, zelf gehoste AI-omgeving. Het bestaat dus al kant-en-klaar en hoeft niet gebouwd te worden.

**Eerlijke kosten:** zelf hosten is zelf verantwoordelijk voor updates, beveiliging en back-ups. En met lokale modellen is de kwaliteit lager dan met een betaalde sleutel — die keuze staat los van de hosting.

### Alternatieven in dezelfde categorie
- **Open WebUI** — grotere gemeenschap, breder inzetbaar, iets meer werk om op te zetten — SECUNDAIR
- **LibreChat** — sterker in meerdere modellen naast elkaar dan in documenten — SECUNDAIR
- **Open Notebook** — zelf te hosten nabouw van NotebookLM — SECUNDAIR
- **LM Studio / Jan / GPT4All** — draaien een model lokaal op één computer, zonder serverwerk — SECUNDAIR

---

## 4. Code laten schrijven en repareren

### GitHub Copilot coding agent — AL BEWEZEN, NU ONGEBRUIKT
Is eerder al op onze eigen repo gebruikt voor kleine, scherp afgebakende reparaties. Het staat er dus al; het wordt alleen niet ingezet. **Van alle regels in dit document is dit de goedkoopste, want er hoeft niets nieuws voor te beginnen.**

### Antigravity (Google) — agent-IDE, opvolger van Gemini CLI
Gratis niveau geeft toegang tot meerdere modellen, begrensd door snelheidslimieten — SECUNDAIR. **De limieten zijn sinds de lancering herhaaldelijk verlaagd.**
Bouw hier geen werkwijze omheen: de voorganger is van de ene op de andere dag afgesloten voor particulieren.

### Jules (Google) — agent die zelf een pull request maakt
Kloont de repo, werkt in een eigen omgeving, biedt het resultaat aan als pull request. Sluit aan op de werkafspraak dat antwoorden en metingen in de repo landen. Gratis niveau ONBEKEND.

### Cursor, Cline, Aider, OpenHands
Dezelfde categorie, elk met eigen prijsmodel. Alleen relevant als er iemand is die er dagelijks mee werkt — dat is nu niet zo. **Niet nu.**

### ⚠️ RISICO dat voor deze hele paragraaf geldt
Elke push naar main gaat automatisch naar productie (`connect.fps-one.nl`). **Een agent die zelf pusht, deployt dus zelf naar het draaiende bedrijf.** Dit moet beantwoord zijn vóór welke agent dan ook toegang krijgt. Bij Sparki geldt hetzelfde patroon.

---

## 5. Bewijs, meten en bewaken

### Playwright — open source
Opent de app in een echte browser op een echte schermmaat en maakt schermafdrukken, herhaalbaar en automatisch.
**Waarom dit een bewezen probleem oplost:** de schermafdrukken die als bewijs zijn aangeleverd, waren niet te vertrouwen — er zat een zwart vlak in dat mogelijk een beperking van de afdrukomgeving was en niet wat een echt toestel toont. Met een vaste, herhaalbare opstelling is dat verschil er niet meer.
**Bijvangst:** dezelfde opstelling kan aantonen dat een scherm ná een verbouwing niet stiekem is veranderd.

### Sentry — AL GEKOPPELD
De koppeling staat, maar de inbouw in `fps-one` is nog open. Zolang dat zo is, zien we productiefouten pas als iemand belt.

### Uptime-bewaking (UptimeRobot, Better Stack e.d.)
Elke paar minuten controleren of `connect.fps-one.nl` nog antwoordt, en anders mailen. Gratis niveaus bestaan bij meerdere aanbieders — ONBEKEND welke voorwaarden. **Meting:** twee prijspagina's vergelijken.
**Waarom dit hier hoort:** het bedrijf draait op één VPS, de back-up staat op dezelfde machine en de bestanden worden helemaal niet geback-upt. Bewaking is niet de oplossing daarvoor, maar wel de goedkoopste eerste stap.

---

## 6. Wat afvalt, en waarom

- **Pomelli** (Google, AI-marketing) — leidt de huisstijl af uit één website en genereert **alleen Engelstalige** content. De doelgroep van FPS is Nederlands. NAGEKEKEN.
- **Gemini CLI** — gratis toegang voor particulieren gestopt **18-06-2026**. Oude artikelen hierover zijn misleidend.
- **Opal** (Google) — losse mini-apps. Niets bij ons is als losstaand toepassinkje beter af dan als onderdeel van het systeem.
- **ImageFX / Flow / Veo** — pas relevant bij de uitlegmedia van Sparki. Dan geldt wel de vraag of gegenereerd beeld past bij een product dat op betrouwbare begeleiding leunt.

---

## 7. Drie regels als hier iets van in gebruik gaat

1. **Geen enkel proces mag ervan afhangen.** De Gemini CLI-afsluiting is het bewijs waarom. Alles hier is hulpgereedschap, geen onderdeel van het systeem.
2. **Geen bedrijfs-, personeels- of klantgegevens in een gratis clouddienst** tot de voorwaarden nagelezen zijn. Bij zelf gehost gereedschap (§3) vervalt deze regel.
3. **Eén gereedschap tegelijk, met een vooraf benoemde vraag die het moet beantwoorden.** Anders staat hier over drie maanden een lijst van vijftien half-geprobeerde dingen — hetzelfde patroon als de niet-doorgezette bouwopdrachten.

---

## 8. Wat er nog niet in staat

- **ONBEKEND:** of Google AI Studio of de Gemini API een bruikbaar gratis niveau heeft voor de intelligentielaag van Sparki. **Meting:** de prijspagina van de Gemini API lezen.
- **ONBEKEND:** regiobeperkingen in Nederland. Voor Pomelli is Nederland NAGEKEKEN beschikbaar; voor de rest niet vastgesteld.
- **Niet onderzocht:** gereedschap voor vertaling, toegankelijkheidscontrole en beeldcompressie. Pas relevant als Sparki daadwerkelijk publiek gaat.

---

*Dit bestand wordt bijgewerkt, niet overschreven. Voeg bij elke wijziging de datum toe en laat oudere bevindingen staan.*
