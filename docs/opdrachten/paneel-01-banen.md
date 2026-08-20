# PANEEL_01 — Werken in vaste banen op een breed scherm

**Opdracht voor Replit · 9 augustus 2026 · gemeten op `d3bf870` (`main`)**

Betreft `artifacts/firevault`. De telefoon-app blijft ongemoeid.

---

## 1. Waarom

[stated] René, 9 augustus 2026: *"Het kromme brede scherm dat Jacqueline en ik gebruiken kan 4 websites of programma's naast elkaar hebben."* En eerder die dag: *"Ik zou in 1 of meerdere calculaties willen kunnen werken, die samen openstaan. Ik wil ook andere hoofdstukken open hebben staan."*

**Het onderliggende punt: hij wil niet béter navigeren, hij wil níet navigeren.** Dingen staan open en blijven open, zoals bij een vluchtleidingsconsole. Dat is een ander werkmodel dan een menu waar je doorheen klikt.

**Vaste banen, geen zwevende vensters.** [stated] René: *"Dit lijkt me fijn werken."* Zwevende vensters betekent dat je tijd kwijt bent aan het rangschikken ervan — dan is het probleem verplaatst in plaats van opgelost.

---

## 2. Gemeten uitgangssituatie

- `firevault` gebruikt **wouter** met **213 routedefinities** — één adres, één weergave. Panelen bestaan niet.
- **`@tanstack/react-query` is de gegevenslaag.** Dat is belangrijk: binnen één venster delen alle panelen dezelfde cache. Twee panelen op dezelfde calculatie blijven dus vanzelf gelijk lopen — iets wat twee losse browservensters **niet** doen.
- **`components/ui/command.tsx` bestaat al** (shadcn). Het commandopalet uit `MENU_01` is daarmee grotendeels bedrading, geen bouwwerk.
- Er is **geen** resizable-paneelcomponent aanwezig.
- Gebruikersvoorkeuren lopen via `useVoorkeur` → **`localStorage`, per browser**. Zelfde beperking als bij het menu.

---

## 3. Fase 0 — eerst de goedkope test

**Vóór er iets gebouwd wordt:** open Connect twee keer naast elkaar in de browser, op twee verschillende schermen, en meld in `docs/metingen/PANEEL_01_twee_vensters.md`:

1. Werkt het, en blijft de sessie in beide vensters geldig?
2. Wat gebeurt er bij **twee vensters op dezelfde calculatie**, waarin beide iets wijzigen? Wie wint, en merkt de ander het?
3. Werkt het ook als Connect als geïnstalleerde app (PWA, standalone) draait, of moet dat via de browser?

**Dat antwoord bepaalt de omvang van de rest.** Blijkt punt 2 stil mis te gaan, dan is dát het echte probleem — niet de panelen.

---

## 4. Wat gebouwd wordt

### 4.1 Banen

- **Twee, drie of vier banen naast elkaar**, door de gebruiker te kiezen. Vier alleen bij voldoende breedte; onder een in te stellen breedte valt het scherm terug op één baan.
- **Breedte per baan versleepbaar**, met een minimum zodat een baan nooit onbruikbaar smal wordt.
- **Elke baan bevat één ding**: een bestaand scherm, gerenderd in de baan in plaats van over de volle breedte.
- **Geen zwevende, verplaatsbare of overlappende vensters.** Banen staan naast elkaar en dat is de enige indeling.

### 4.2 Wat er in een baan kan

Niet elk scherm werkt in een smalle kolom. **Lever daarom een lijst op** van welke schermen paneelgeschikt zijn en welke niet, met de reden.

Zeker wél geschikt: werkbak · mail · een calculatie · een werkbegroting · een gebouw · een opdracht · het inkoopoverzicht.
Waarschijnlijk niet: de brede beheerschermen en de planning — die zijn gemaakt voor volle breedte.

Een scherm dat niet geschikt is, opent **over de volle breedte** met een duidelijke aanwijzing, niet verminkt in een baan.

### 4.3 Twee keer hetzelfde

Twee banen mogen **dezelfde soort** inhoud tonen — twee verschillende calculaties naast elkaar is precies de vraag.

Twee banen op **exact hetzelfde object** mag ook, maar dan gelden er twee dingen:
- dankzij react-query lopen ze binnen één venster vanzelf gelijk;
- er verschijnt een rustige aanduiding dat hetzelfde object twee keer open staat, zodat niemand denkt naar twee verschillende dingen te kijken.

### 4.4 Onthouden per gebruiker

De indeling — aantal banen, breedtes, en wat erin stond — wordt **per gebruiker in de database** bewaard, niet in `localStorage`. Bij inloggen staat je scherm terug zoals je het achterliet.

Dat is dezelfde verhuizing als in `MENU_01` §4.3. **Doe die twee met hetzelfde mechanisme**; bouw geen tweede voorkeurenopslag.

Daarnaast: **een handvol opgeslagen indelingen met een naam**, zodat je kunt wisselen tussen bijvoorbeeld "calculeren" en "administratie". Maximaal vijf; dit is geen werkruimtebeheer.

### 4.5 Rechten

Een baan toont nooit iets waar de gebruiker geen recht op heeft, en dat wordt **op de server** bepaald. Het paneelmechanisme mag geen enkele bestaande controle omzeilen — het is een andere plek om hetzelfde scherm te tonen, niet een andere weg naar de gegevens.

---

## 5. Wat dit voor Jacqueline betekent

Hetzelfde scherm, andere inhoud: werkbak, mail en factuur naast elkaar. Werk komt naar haar toe in plaats van dat zij het opzoekt.

**Neem dat mee als tweede standaardindeling**, zodat het niet alleen voor calculatiewerk gebouwd wordt.

---

## 6. Verboden

- Geen zwevende, sleepbare of overlappende vensters.
- Geen tweede voorkeurenopslag naast die uit `MENU_01`.
- Geen scherm verminkt in een te smalle baan tonen; dan volle breedte met aanwijzing.
- Geen paneelweg die een bestaande rechtencontrole omzeilt.
- Meer dan vijf opgeslagen indelingen bouwen.
- Niets hiervan in de telefoon-app.

---

## 7. Twee vaste eisen

**Toets elke aanname en meld afwijkingen.** Controleer per onderdeel welke module en welk niveau de bijbehorende backendroute werkelijk eist, en meld elk verschil met wat hier staat — **pas niets stilzwijgend aan**.

**Wijk je af van de scope van deze opdracht, meld dat dan vóór je bouwt.**

---

## 8. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. **`docs/metingen/PANEEL_01_twee_vensters.md` is opgeleverd** met de drie antwoorden uit §3. *Niets gebouwd voordat dit er ligt.*
2. Drie banen naast elkaar met een calculatie, een tweede calculatie en de werkbak. Toon het scherm op de werkelijke breedte van René's monitor.
3. **Wijzigen in baan 1 is direct zichtbaar in baan 2** wanneer beide hetzelfde object tonen. Toon beide banen vóór en na.
4. De indeling staat er na uitloggen en opnieuw inloggen **op een andere computer** nog precies zo. Toon beide.
5. Een scherm dat niet paneelgeschikt is, opent over de volle breedte met een aanwijzing. Toon welk scherm dat is en waarom.
6. **Een gebruiker kan via een baan niets zien waar hij geen recht op heeft.** Toon het serverantwoord voor een monteur die een financieel scherm in een baan probeert te openen.
7. De tweede standaardindeling voor de administratie werkt. Toon werkbak, mail en factuur naast elkaar.
8. **Lijst opgeleverd** van welke van de 213 schermen paneelgeschikt zijn en welke niet, met reden.
