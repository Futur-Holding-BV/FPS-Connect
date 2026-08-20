# APP_01 — Eén telefoonapp, rolgericht, ook voor kantoor

**Opdrachtgever:** René Vink · **Datum:** 8 augustus 2026 · **Uitvoerder:** Replit
**Systeem:** FPS Connect — `artifacts/monteur-app` (repo `vinkrene-jpg/fps-one`, branch `main`)
**Hangt samen met:** `MONTEURAPP_01` (de installeerbare build) en `RECHTEN_01` (de profielen waarop gefilterd wordt).

**Verplicht vooraf lezen:** `replit.md` · `docs/ontwikkelfilosofie.md` · `docs/kwaliteitskader.md` · `docs/PRODUCTION_RUNBOOK.md` · `.agents/memory/MEMORY.md`

---

## 1. Wat er is, en wat eraan mankeert

**Gemeten op 8 augustus 2026.** `artifacts/monteur-app` telt **ongeveer vijftig schermen en 25.060 regels**. De naam klopt niet meer: naast monteurswerk (opname, uitvoering, werkdag, uren, planning, gebouwen, plattegronden, documenten, LMRA, toolboxen, incidenten, PBM, voertuigmelding, kwartaalcontrole) zit er al in: **HRM** (verlof, declaraties, loonstrookjes, opleidingen, kennisbank), **magazijn** (artikelen, scan, picklijsten, inkoop aanvragen, inkooporders), berichten, fabrikanten en een routeplanner.

**Het probleem: de app filtert nergens op bevoegdheden.** Nul treffers op `bevoegdheden`, `heeftNiveau`, `niveauVan` of `requireBevoegdheid` in `app/`, `context/` en `lib/`. De `rol` wordt wél opgeslagen in `context/auth.tsx`, maar alleen gebruikt voor één `hoofdbeheerder`-controle in `_layout.tsx` r.319 en om de rol te tónen in `privacy.tsx`.

De menulijst in `app/menu.tsx` r.100-118 is een vaste array: **iedere ingelogde gebruiker ziet hetzelfde menu**, inclusief Personeel, Inkoop aanvragen en Inkooporders.

**De gegevens zijn niet in gevaar** — de backend controleert overal met `requireBevoegdheid`. Maar een monteur ziet menu-ingangen die op een foutmelding uitlopen, en dat kost vertrouwen in het systeem.

**Wat er voor kantoor nog helemaal niet in zit:** gezocht op goedkeuren, facturen, betalen en inbox — geen enkele treffer. De kantoorstroom ontbreekt volledig.

---

## 2. Eén app, geen tweede

**Er komt geen aparte kantoor-app.** Er is één app die te veel toont aan iedereen; dat wordt één app die per persoon het juiste toont. Een tweede app zou betekenen: twee builds, twee inlogstromen, twee plekken waar een wijziging moet landen — precies het patroon dat dit project eerder duur heeft betaald.

**Hernoem de map en de app niet in deze opdracht.** Dat is losse rommel die het bewijs vertroebelt; noteer het als aparte opruimtaak.

---

## 3. Filteren op bevoegdheden

**3.1 — De effectieve bevoegdheden komen mee bij het inloggen.** `context/auth.tsx` bewaart nu alleen `rol`. Voeg de gecombineerde bevoegdheden toe (module → niveau), zoals de backend die al berekent met `combineerBevoegdheden()`. Bouw geen tweede berekening in de app; neem over wat de server oplevert.

**3.2 — Elk menu-item krijgt de bevoegdheid die het vereist.** De array in `menu.tsx` r.100-118 krijgt per item de module en het minimumniveau. Wat de gebruiker niet mag, wordt **niet getoond** — niet uitgegrijsd.

Voorlopige koppeling, te toetsen tegen de werkelijke routes:

| Menu-item | Module |
|---|---|
| Mijn werkdag · Uren · Routeplanner | altijd zichtbaar voor ingelogde medewerkers |
| Verlof · Personeel | `personeel` |
| Gebouwen · Opname · Documenten | `gebouwen` respectievelijk `dossiers` |
| Veiligheid · Toolboxen · Incidenten | `toolbox` |
| Magazijn scan · Artikelen · Picklijsten | `magazijn` |
| Inkoop aanvragen · Inkooporders | `magazijn` op een hoger niveau |
| Voertuig melden | `wagenpark` |

**Verifieer elke regel tegen de bevoegdheid die de bijbehorende backendroute werkelijk eist.** Wijkt een aanname af, meld dat — niet stilzwijgend aanpassen.

**3.3 — Ook de schermen zelf beschermen.** Een gebruiker die een adres rechtstreeks opent, hoort een nette weigering te krijgen, niet een leeg scherm of een technische fout.

---

## 4. De kantoorkant

Kantoor heeft op een telefoon **niet de hele ERP** nodig. Drie dingen, en meer niet:

**4.1 — Het afhandelpaneel.** Alles wat op deze persoon wacht, uit alle bronnen samen: goedkeuringsaanvragen, factuursignalen, aanvraagsignalen, de betaalbatch. Rolgebaseerd — René ziet zijn goedkeuringen, Jacqueline haar signalen.

Regels zoals eerder vastgelegd: **maximaal tien tegelijk**, gerangschikt **op bedrag** en niet op datum, en een item verdwijnt pas als het is afgehandeld of bewust weggezet — nooit vanzelf.

**4.2 — De werk-inbox.** Mail lezen en beantwoorden, met de AI-voorstellen erbij. In de modus *Ondersteunen* onderbreekt de AI nooit (zie `MAIL_01`).

**4.3 — De twee getallen.** Waar eindigt dit project, waar eindigt dit jaar. Alleen tonen; het instellen gebeurt op de computer.

**Wat níét op de telefoon komt:** calculeren, offertes maken, werkvoorbereiding, rechtenbeheer. Dat is werk voor een groot scherm. Bouw daar geen telefoonversie van.

---

## 5. Wat dit betekent voor de build

`MONTEURAPP_01` levert een Android-APK. Als kantoorpersoneel dezelfde app gaat gebruiken, geldt die APK ook voor hen — dus **meld of Jacqueline, Ruben of anderen een iPhone hebben**. Voor hen lost een APK niets op, en dan is er een aparte beslissing nodig.

---

## 6. Acceptatie

1. Een monteur ziet in het menu geen Personeel, geen Inkooporders en geen Inkoop aanvragen.
2. Ik zie als hoofdbeheerder wél alles.
3. Wat iemand niet mag, staat niet in het menu — het staat er niet grijs.
4. Opent iemand een adres waar hij niet mag komen, dan krijgt hij een nette weigering.
5. Ik zie op mijn telefoon wat er op mij wacht, uit alle bronnen samen, maximaal tien, gerangschikt op bedrag.
6. Een item in dat paneel verdwijnt pas als ik het heb afgehandeld.
7. Ik kan mijn mail lezen en beantwoorden vanaf mijn telefoon.
8. Wijzigt iemands profiel, dan verandert zijn menu bij de volgende keer openen — zonder nieuwe installatie.

**Bewijs bij oplevering:** schermafdrukken van het menu bij drie verschillende gebruikers — een monteur, iemand met meerdere functies, en de hoofdbeheerder — naast elkaar. Plus één afgehandeld item uit het paneel, van melding tot verdwijnen.

## 7. Wat niet mag

- Geen tweede app voor kantoor.
- Geen eigen bevoegdhedenberekening in de app — overnemen wat de server levert.
- Geen uitgegrijsde menu-items voor wat iemand niet mag.
- Geen calculatie, offerte, werkvoorbereiding of rechtenbeheer op de telefoon.
- Geen aannames over welke module bij welk menu-item hoort — toetsen tegen de backendroute en afwijkingen melden.
- De map of app niet hernoemen in deze opdracht.
- Niet melden dat het klaar is op grond van een geslaagde build of typecheck.

---

## Antwoorden en bevindingen in de repo

Antwoorden op vragen uit deze opdracht komen **niet alleen in de chat** maar worden vastgelegd in de repo:

- **vragen en bevindingen** → `docs/antwoorden/APP_01.md`
- **metingen en inventarisaties** → `docs/metingen/APP_01_<onderwerp>.md`

Elk antwoord vermeldt: datum · commit-SHA waarop gemeten is · de vraag · het antwoord · en expliciet wat **gemeten** is en wat **aangenomen**. Is er een besluit van René nodig, schrijf dat als zodanig op — niet zelf invullen en doorbouwen.
