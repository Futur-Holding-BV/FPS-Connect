# NAV_01 — Overzicht: twee-traps sidebar, kleur per hoofdstuk, goedkeuringslabel

**Opdracht voor Replit · 10 augustus 2026 · gemeten op `89277ca9` (`main`)**

Drie wensen van René, alle drie gericht op hetzelfde: **sneller zien waar je bent en hoe het ervoor staat.**

---

## 0. ⚠️ LEES DIT EERST — er lopen drie navigatie-ontwerpen door elkaar

Gemeten: `docs/antwoorden/` bevat **geen** `MENU_01.md` en **geen** `PANEEL_01.md`, terwijl beide opdrachten wel zijn doorgezet. Er liggen dus drie plannen over dezelfde navigatie:

- **`MENU_01`** — commandopalet (Ctrl+K), een blok "Nu" bovenaan, menuvolgorde van `localStorage` naar de database
- **`PANEEL_01`** — vaste banen naast elkaar, twee tot vier kolommen
- **`NAV_01`** — deze opdracht

**Meld als eerste in `docs/antwoorden/NAV_01.md` wat er van MENU_01 en PANEEL_01 werkelijk op main staat.** Bouw daarna verder op wat er is, niet ernaast. Concreet: `useSidebarHoofdstukken` en `InklapbaarHoofdstuk` blijven de basis — er komt geen tweede menumechanisme bij.

---

## 1. Wat er nu staat (gemeten)

- `layouts/beheerder-layout.tsx` — **1.873 regels**
- **elf hoofdstukken**: Projectaanpak · Magazijn · Commercie · Communicatie · Veiligheid · Financieel · Goedkeuring · Declaraties · Organisatie · Personeel · Loon (Inkoop verdween als hoofdstuk bij `NP_INKOOP_01`; Algemene inkoop is nu een losse post)
- `components/ui/herschikbaar-hoofdstuk.tsx` levert `InklapbaarHoofdstuk`; volgorde en open/dicht via `hooks/use-sidebar-hoofdstukken.ts`
- alle hoofdstukken beginnen elke sessie **ingeklapt** — dat was een uitdrukkelijk verzoek van René op 09-08-2026. **Draai dat niet ongevraagd terug**
- tabbladen: shadcn `components/ui/tabs.tsx`, gebruikt in **47 paginabestanden**

---

## 2. Twee-traps sidebar

**De hoofdsidebar bevat voortaan alleen de elf hoofdstuknamen.** Klik je een hoofdstuk aan, dan verschijnt er een **tweede sidebar ernaast** met alleen de onderdelen van dát hoofdstuk. Daar klik je door.

Eisen:

1. **De tweede sidebar is niet paginahoog** — hij is precies zo hoog als zijn inhoud, en begint op de hoogte van het aangeklikte hoofdstuk. Dat is de "speelse" vorm die René bedoelt: een uitschuivend paneel, geen tweede kolom die de hele hoogte vult.
2. **Eén hoofdstuk tegelijk open.** Klik je een ander hoofdstuk, dan verschuift het paneel daarheen.
3. **Het paneel sluit** bij klikken buiten het paneel, bij Escape, en na het kiezen van een onderdeel.
4. **De hoofdsidebar blijft smal en rustig** — geen aantallen, geen badges op hoofdstukniveau in deze opdracht.
5. **Rechten veranderen niet.** De 25 bestaande `toon`-vlaggen blijven bepalen wat iemand ziet; een hoofdstuk waarvan alle onderdelen verborgen zijn, verdwijnt in plaats van leeg open te gaan.
6. **Toetsenbord werkt volledig**: pijltjes door de hoofdstukken, Enter opent het paneel, pijltjes door de onderdelen, Escape sluit. Dit is een navigatiemenu; muis-alleen is niet genoeg.
7. **Op een smal scherm** (onder de bestaande breekpunten) valt het paneel terug op de huidige inklapbare weergave. Geen paneel dat half over de inhoud valt.

**Bewaar wat er is:** de versleepbare volgorde van hoofdstukken blijft werken.

---

## 3. Kleur per hoofdstuk

Elk hoofdstuk krijgt een eigen herkleurbare kleur, zodat je aan de kleur ziet waar je werkt.

- **De kleuren komen uit de bestaande ontwerptokens** (`VORM_01`, `@workspace/ontwerp`). Voeg ze daar toe als benoemde reeks — **geen losse hexcodes in de layout**.
- Elf kleuren die onderling te onderscheiden zijn, ook voor iemand met kleurenblindheid: laat kleur nooit het énige verschil zijn. De hoofdstuknaam staat er altijd bij.
- **Waar de kleur terugkomt:** het hoofdstuk in de sidebar, de kop van de tweede sidebar, en een dunne accentlijn boven aan de pagina van dat hoofdstuk. **Niet** hele vlakken inkleuren — het is een merkteken, geen achtergrond.
- Harde eis: **tekst op elke gekleurde ondergrond haalt WCAG AA (4,5:1)**. Lever de gemeten contrastwaarden op, zoals bij `VORM_01`.
- Werkt in zowel het lichte als het donkere palet.

---

## 4. Goedkeuringslabel op een tabblad

Een klein gekleurd labeltje aan de **rechterzijde** van een tabblad, dat zegt of een hogere leidinggevende dit onderdeel al heeft geaccepteerd.

- **geel** = goedkeuring vereist en nog niet gegeven
- **groen** = goedkeuring vereist en gegeven
- **geen label** = voor dit onderdeel is geen goedkeuring nodig

Eisen:

1. **Fase 0 eerst meten.** De goedkeuringsmotor werkt met beleidsregels per documenttype + bedragsband (`schema/goedkeuring.ts`). Lever in `docs/metingen/NAV_01_goedkeuringspunten.md` op: **voor welke documenttypen bestaan er beleidsregels, en welke schermen/tabbladen horen daarbij.** Alleen die krijgen een label. Zonder die lijst is niet vast te stellen waar het label hoort — begin er dus niet aan.
2. **Eén gedeelde component**, bijvoorbeeld `GoedkeuringLabel`, die zowel in een tabblad als in een onderdeel van de tweede sidebar past. Niet twee varianten bouwen.
3. **De status komt van de server**, uit de bestaande goedkeuringsmotor. Niets in de frontend afleiden of raden.
4. **Kleur is nooit het enige signaal**: het label draagt ook een tekst of pictogram, en een titel bij aanwijzen die zegt wíé moet goedkeuren en sinds wanneer het wacht.
5. **Geen label bij "niet van toepassing"** — afwezig, niet grijs. Grijs leest als "kapot".
6. René noemt "gevolgen voor de vervolgstappen indien van toepassing": dat is de blokkering zelf, en die hoort **niet** in deze opdracht. Het label toont alleen; de poort zit in `AKKOORD_01`. Wél toestaan dat het label naar het goedkeuringsscherm doorlinkt.

---

## 5. Beweging

De hoofdstukken en tabbladen bewegen bij aanklikken.

- Gebruik de **bewegingswaarden uit de ontwerptokens** (`VORM_01`: snel 120 ms, normaal 200 ms, traag 320 ms). Geen eigen duren.
- Het uitschuiven van de tweede sidebar is de belangrijkste beweging; die moet vloeiend zijn en niet springen.
- **Respecteer de systeeminstelling voor verminderde beweging.** Staat die aan, dan verschijnt het paneel zonder animatie.
- Beweging mag nooit vertragen: een klik moet direct reageren, ook als de animatie nog loopt.

---

## 6. Wat je NIET doet

- Het aantal menu-ingangen wijzigen, hernoemen of herindelen.
- De standaard "alle hoofdstukken beginnen ingeklapt" omdraaien.
- Een derde navigatieconcept naast MENU_01 en PANEEL_01 bouwen — zie §0.
- Blokkeren op ontbrekende goedkeuring (dat is `AKKOORD_01`).
- Hele schermen inkleuren.

---

## 7. Acceptatie — op gedrag

1. Een hoofdstuk aanklikken opent een paneel dat **niet paginahoog** is; buiten klikken, Escape en het kiezen van een onderdeel sluiten het.
2. De hele navigatie is met het toetsenbord te bedienen.
3. Elk hoofdstuk heeft een eigen kleur, met opgeleverde contrastwaarden, in licht én donker.
4. Een tabblad met openstaande goedkeuring is geel, met een uitleg bij aanwijzen; een tabblad zonder goedkeuringsplicht heeft géén label.
5. Verminderde beweging aan → geen animaties.
6. Schermafdrukken vóór en ná van de sidebar en van één modulescherm met tabbladen.
7. De lijst uit §4.1 ligt er.

---

## 8. Twee vaste eisen

1. **Toets elke aanname over een module, niveau of bestandsplaats tegen de code en meld afwijkingen — pas niets stilzwijgend aan.**
2. **Wijk je van de scope af, meld dat vóórdat je bouwt.**

---

## Antwoorden en bevindingen in de repo

Antwoorden op vragen uit deze opdracht komen **niet alleen in de chat** maar worden vastgelegd in de repo:
- **vragen en bevindingen** → `docs/antwoorden/NAV_01.md`
- **metingen, tellingen en inventarisaties** → `docs/metingen/NAV_01_<onderwerp>.md`

Elk antwoord vermeldt: datum · commit-SHA waarop gemeten is · de vraag · het antwoord · en expliciet wat **gemeten** is en wat **aangenomen**.
Is er een besluit van René nodig, schrijf dat als zodanig op — niet zelf invullen en doorbouwen.
Deze bestanden worden bijgewerkt, niet overschreven; oudere bevindingen blijven met hun datum staan.
