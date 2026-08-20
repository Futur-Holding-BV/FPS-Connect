# VORM_01 — Eén ontwerpsysteem voor de hele app

**Opdracht voor Replit · 10 augustus 2026 · gemeten op `0e1e91c1` (`main`, 09-08 22:08)**

Doel in René's woorden: *"Ik wil dat de hele app er goed uit ziet. Mooie heldere kleuren, diepte, soepel."* Dit gaat over **alle schermen**, niet over één pagina, en over **zowel de monteurskant als de kantoorkant** — de app wordt door beide gebruikt.

---

## 1. De bevinding — waarom het er nu niet als één app uitziet

**Het kleurenpalet is er al en is goed.** `artifacts/monteur-app/constants/colors.ts` bevat `primary #F23B0D` · `dark #212631` · achtergrond `#F6F7F9` · kaart wit · `success #22A06B` · `warning #E8870E` · `destructive #E5484D` · muted/border/input. Dezelfde twee hoofdkleuren staan in `firevault/public/manifest.webmanifest`. Er is dus een huisstijl. **Kleur is het probleem niet.**

**Wat er náást de kleuren staat, is één regel: `radius: 14`.** Er is geen hoogte-/schaduwschaal, geen ruimteschaal, geen typografieschaal en geen bewegingswaarde. Een scherm kan dus **niets erven behalve kleur**.

Het gevolg is gemeten:

| Gemeten | Waarde |
|---|---|
| schermen in `app/` | **58** |
| inline `style={{`-objecten in `app/` | **2.483** |
| bestanden die `StyleSheet.create` gebruiken | **5** |
| bouwstenen in `components/ui.tsx` (279 r.) | **5** — `Knop` · `LijstFout` · `TekstVeld` · `SectieLabel` · `ChipRij` |
| donker palet | **bestaat niet** — `useColors()` schakelt wél op `useColorScheme()`, maar de `dark`-sleutel ontbreekt, dus donkere modus doet niets |

**En de middelen voor diepte en beweging zijn al geïnstalleerd en vrijwel ongebruikt:**

| Pakket | Gebruikt in |
|---|---|
| `expo-blur` | **0 bestanden** |
| `expo-glass-effect` | **0** |
| `expo-symbols` | **0** |
| `expo-linear-gradient` | 1 |
| `expo-haptics` | 1 |
| `react-native-reanimated` | 1 |

Ze staan in `package.json`, worden bij elke build meegenomen, en doen niets.

**Diagnose: er is een kleurenpalet, geen ontwerpsysteem.** Dat is de hele verklaring van de 2.483 inline stijlblokken, en het betekent dat dit **zonder herbouw** op te lossen is.

---

## 2. Uitgangspunten — vastgelegd, niet opnieuw ter discussie

1. **Licht blijft de basis.** Alle 58 schermen zijn erop gebouwd; de basis omgooien is herbouw. Er komt wél een volwaardig **donker palet** zodat de systeeminstelling werkt, en `#212631` blijft een bewuste contrastlaag voor kopbalken, login en menu.
2. **Eén gedeelde tokenbron voor de webapp én de Expo-app.** Nu staat er in `constants/colors.ts` alleen een *commentaar* dat het gesynchroniseerd is met `firevault/index.css`. Dat is handwerk en loopt uit elkaar. Na deze opdracht maakt het voor het uiterlijk niet meer uit in welke schil een scherm draait.
3. **Geen scherm wordt herbouwd.** Schermen gaan de tokens en bouwstenen gebruiken; functionaliteit, navigatie en gegevens blijven ongemoeid.
4. **Geen extern ontwerpgereedschap in de bouwketen.** Stitch, Figma en Penpot leveren HTML/CSS of ontwerpbestanden — dat valt niet in React Native te plakken.

---

## 3. ⚠️ Twee pakketten zijn iOS-only — daar mag de vormtaal niet op leunen

FPS gaat via een **Android-APK** (`MONTEURAPP_01`). Controleer dit vóór gebruik en meld de uitkomst:

- **`expo-glass-effect`** (Liquid Glass) is een iOS-functie. Op Android levert het niets op.
- **`expo-symbols`** (SF Symbols) is eveneens iOS. Gebruik in plaats daarvan `@expo/vector-icons`, dat al in het project zit.

**Gevolg: de diepte moet komen uit schaduw/elevatie, gradiënt en beweging — niet uit glas.** Waar je toch een glaseffect gebruikt, is een terugval voor Android verplicht en moet die terugval er op zichzelf goed uitzien.

---

## 4. F0 — Nulmeting vóór er iets verandert

Lever op in `docs/metingen/VORM_01_nulmeting.md`:

1. **Inline `style={{`-objecten per scherm**, de vijftien zwaarste met aantal.
2. **Alle hardgecodeerde kleurwaarden in `app/` en `components/` die niet uit `useColors()` komen** — hexcodes, `rgba(...)`, benoemde kleuren. Dit is de werkelijke drift en meteen de werklijst.
3. **Schermafdrukken vóór** van zes schermen op één vaste toestelmaat: `mijn-werk` · `menu` · `werkdag/[id]` · `uren` · `gebouw/[id]` · `hrm/index`. Zelfde zes worden ná gebruikt.
4. **Bevestig of `expo-glass-effect` en `expo-symbols` op Android werken** (§3).

---

## 5. F1 — Het tokenbestand compleet maken

Naast de bestaande kleuren komen er vier schalen bij, in hetzelfde bestand:

**Hoogte/diepte — vijf niveaus (0 t/m 4).** React Native heeft beide nodig: `shadowColor/shadowOffset/shadowOpacity/shadowRadius` voor iOS én `elevation` voor Android. Eén token levert allebei. Toepassing: 0 = vlak op de achtergrond · 1 = kaart · 2 = zwevende knop · 3 = blad/modaal · 4 = melding over alles heen.

**Ruimte — 4 · 8 · 12 · 16 · 24 · 32.** Geen andere waarden meer in de schermen.

**Typografie — zes stappen** (schermtitel, sectiekop, nadruk, standaard, klein, bijschrift), elk met grootte, lijnhoogte en gewicht. Inter zit al in het project via `@expo-google-fonts/inter`.

**Beweging — drie duren** (snel 120 ms, normaal 200 ms, traag 320 ms) plus één standaard-versnelling. Alles wat beweegt gebruikt deze waarden.

**Donker palet.** Leid het af van de bestaande kleuren; `#212631` als achtergrond ligt voor de hand. Harde eis: **tekst op elke achtergrond haalt WCAG AA (4,5:1)** — toon de gemeten contrastwaarden in het antwoorddocument. Een donker palet dat niet leesbaar is in een donkere meterkast is erger dan geen donker palet.

---

## 6. F2 — Eén gedeelde bron

Verplaats de tokens naar een gedeelde plek in `lib/` die **zowel `firevault` (webapp/PWA) als `monteur-app` (Expo)** inleest. De webkant mag ze als CSS-variabelen afleiden; de bron blijft één bestand.

Acceptatie: het commentaar *"Gesynchroniseerd met de web-artifact"* kan weg omdat er niets meer te synchroniseren valt.

---

## 7. F3 — Bouwstenen van vijf naar circa twaalf

Breid `components/ui.tsx` uit met de onderdelen die nu 58 keer worden uitgetypt. Voorstel, aan te vullen op grond van F0:

`Kaart` (met hoogteniveau) · `Rij` (lijstitem met pictogram, tekst, waarde, chevron) · `Statusmerk` (de statuskleuren op één plek) · `SchermKop` · `LegeStaat` (**hergebruik het bestaande `LegeStatus.tsx`, geen tweede**) · `Bevestigknop` (met haptics) · `Tabrij` · `Blad` (modaal van onderen) · `Ladenstaat` (skeleton in plaats van een spinner) · `Waarschuwvlak` · `Bedragregel` (respecteert de twee weergaven met/zonder bedragen uit `BOUW_01`).

**Harde regel: een bouwsteen bevat geen enkele kleurwaarde, maatvoering of duur — alles komt uit de tokens.**

---

## 8. F4 — Aanzetten wat al meegebouwd wordt

- **`expo-blur`** op kopbalken die over inhoud heen liggen en op overlays.
- **`react-native-reanimated`** voor schermovergangen, het openen van het `RadiaalMenu` en het uitklappen van kaarten. Alle duren uit de tokens.
- **`expo-haptics`** bij bevestigen, geslaagde scan, en fout. **Dit is op een werktelefoon met handschoenen meer waard dan welke schaduw ook.**
- **`expo-linear-gradient`** spaarzaam, alleen op donkere vlakken.
- **`expo-glass-effect`** alleen als §3 uitwijst dat het op Android iets doet; anders overslaan en melden.

Neem de bestaande instelling voor verminderde beweging van het besturingssysteem over (`useReducedMotion`): staat die aan, dan blijven overgangen uit.

---

## 9. F5 — Eerst één bewijsscherm, dan pas de rest

Zet **`app/mijn-werk.tsx`** (400 r.) volledig om: tokens, bouwstenen, diepte, beweging, haptics. Lever de schermafdruk vóór en ná.

**Stop daarna en wacht op akkoord van René.** Pas als hij zegt dat dít de richting is, gaan de overige 57 schermen om. Dit voorkomt precies wat er eerder tweemaal misging: veel schermen verbouwd voordat iemand kon zien of het beviel.

---

## 10. F6 — Uitrol, zwaarste eerst

Volgorde op regelaantal: `uitvoering/[opdrachtId]` (2.268) · `plattegrond/[verdiepingId]` (1.556) · `uren` (1.379) · `werkdag/[id]` (1.123) · `toolboxen` (768) · `lmra` (689) · `opname/[id]` (589) · `werkdag/index` (544) · `menu` (526) · daarna de rest.

**Doelgetal: het aantal inline `style={{`-objecten in `app/` gaat van 2.483 naar onder de 500.** Meld per uitrolronde de stand.

---

## 11. Wat je in deze opdracht NIET doet

- Geen scherm herbouwen, geen functie wijzigen, geen navigatiestructuur aanpassen.
- Geen nieuwe kleuren verzinnen buiten het palet.
- De basis niet naar donker omzetten.
- Geen ontwerpbestanden of externe ontwerptools in de bouwketen.
- `components/ui.tsx` niet vervangen door een externe componentbibliotheek — de bestaande bouwstenen blijven, ze worden uitgebreid.

---

## 12. Acceptatie — op gedrag, niet op een groene build

1. **Nul hardgecodeerde kleurwaarden** in `app/` en `components/` buiten de tokenbron. Getal vóór en ná.
2. Aantal inline `style={{}}`-objecten vóór en ná, per uitrolronde.
3. **Systeeminstelling op donker → de app is donker en leesbaar**, met de gemeten contrastwaarden erbij.
4. De zes schermafdrukken uit F0 opnieuw, naast elkaar te leggen.
5. De **Android-APK bouwt en draait**; geen iOS-only API zonder werkende terugval.
6. Verminderde beweging aan → geen overgangen.

---

## 13. Twee vaste eisen

1. **Toets elke aanname over een module, niveau of bestandsplaats tegen de code en meld afwijkingen — pas niets stilzwijgend aan.**
2. **Wijk je van de scope af, meld dat vóórdat je bouwt.**

---

## Antwoorden en bevindingen in de repo

Antwoorden op vragen uit deze opdracht komen **niet alleen in de chat** maar worden vastgelegd in de repo:
- **vragen en bevindingen** → `docs/antwoorden/VORM_01.md`
- **metingen, tellingen en inventarisaties** → `docs/metingen/VORM_01_nulmeting.md`

Elk antwoord vermeldt: datum · commit-SHA waarop gemeten is · de vraag · het antwoord · en expliciet wat **gemeten** is en wat **aangenomen**.
Is er een besluit van René nodig, schrijf dat als zodanig op — niet zelf invullen en doorbouwen.
Deze bestanden worden bijgewerkt, niet overschreven; oudere bevindingen blijven met hun datum staan.
