---
name: Radiaal dial rotatie (Garmin-stijl)
description: Waarom het draaibare radiaal menu in de monteur-app zo is opgezet; niet per ongeluk slopen bij refactor.
---

Het radiaal startmenu (`artifacts/monteur-app/components/RadiaalMenu.tsx`) is een draaibare keuzeknop: ring slepen om te roteren, item in de vaste bovenste sleuf (-pi/2) is "actief", centrale FPS-knop bevestigt.

Non-obvious beslissingen (behouden bij elke refactor):

- **`Gesture.Pan().minDistance(8)`** is bewust: het laat zuivere taps door naar de item-Pressables en de centrale knop (tap-om-direct-te-kiezen blijft werken), terwijl een sleep >8px de rotatie activeert. Geen `Gesture.Simultaneous`/`blocksExternalGesture` nodig. Verlaag dit niet naar 0.
- **"Sluiten"-knop in de onderhint is functioneel, geen decoratie.** Het gesture-vierkant (dialZijde, vaak breder dan de telefoon) dekt het grootste deel van het scherm, waardoor het backdrop tik-om-te-sluiten-gebied krimpt tot strips boven/onder. De expliciete Sluiten-knop is de betrouwbare sluitweg. Niet verwijderen zonder het gesture-gebied te verkleinen.
- **Selectie + haptiek** lopen via `useAnimatedReaction` op `Math.round(rotatie/stap)`; index = `((-cur % totaal) + totaal) % totaal`. De merk-selectiering staat op `translateY: -straal` en lijnt op item 0 (basishoek -pi/2). Houd deze drie in lockstep.
- **`markering` clampen op [0,1]** (`m > 1 ? 1 : m`): `voortgang` overshoot via withSpring kan `markering` boven 1 duwen, waarna `interpolateColor` extrapoleert naar een off-brand randtint.

**Why:** dit is interactie-ontwerp, niet af te leiden uit de code zelf — de minDistance-waarde en de Sluiten-knop zien er weghaalbaar uit maar breken tap-select resp. de sluitbaarheid.

**How to apply:** raak je rotatie/gesture/sluit-logica aan, controleer dan dat (1) taps op items + centrum nog werken, (2) er een bereikbare sluitweg blijft, (3) selectie-index, marker-positie en haptiek synchroon blijven.
