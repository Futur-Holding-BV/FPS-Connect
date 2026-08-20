# BOUW_01 — De telefoon-app voor monteur, uitvoerder, werkvoorbereider en projectleider

**Opdracht voor Replit · 9 augustus 2026 · gemeten op `6011b21` (`main`)**

Betreft uitsluitend `artifacts/monteur-app` plus de bijbehorende backendroutes. Niet de webapp.

---

## 1. Stap 0 — dit blokkeert alles, dus eerst

Gemeten in `lib/permissies/src/index.ts`, per profiel schoon uitgelezen:

| Profiel | `offertes` | `calculaties` | `magazijn` | `gereedschappen` |
|---|---|---|---|---|
| Monteur | **geen** | **geen** | **geen** | **geen** |
| Uitvoerder | **geen** | **geen** | **geen** | **geen** |
| Werkvoorbereider | **geen** | **geen** | **geen** | **geen** |
| Projectleider | **geen** | 1 | **geen** | **geen** |
| Calculatie | 4 | 4 | geen | geen |
| Magazijnbeheerder | 1 | geen | 4 | geen |
| Wagenparkbeheerder | geen | geen | geen | 1 |

En gemeten in de backend:

- `routes/opdrachten.ts` r.40-41 — **alles rond opdrachten en werkbegroting zit achter `offertes` niveau 1 (lezen) en 2 (schrijven)**. Dat geldt voor `GET /opdrachten`, `GET /opdrachten/:id`, `GET /opdrachten/:id/werkbegroting`, `/nacalculatie`, `/planning-uren`.
- `routes/werkvoorbereiding.ts` r.50-51 — dezelfde poort.

**Gevolg: geen van de vier rollen uit deze opdracht kan op dit moment een werkbegroting, een opdracht of een inkoopregel opvragen.** Alles wat hieronder gebouwd wordt, loopt zonder deze stap op een 403 uit. Dat de app ze nu tóch in het menu toont, is het gat dat `APP_01` al beschreef.

### Wat er moet gebeuren

Vóór er één scherm gebouwd wordt, levert Replit een **voorstel voor de rechtenmatrix** aan René, met per profiel het voorgestelde niveau voor `offertes`, `magazijn` en `gereedschappen`, en per regel één zin waarom. **Niets wordt gewijzigd zonder akkoord van René.**

Uitgangspunt voor dat voorstel, volgend uit de rollentabel:

| Profiel | projectketen | `calculaties` | `magazijn` | `gereedschappen` | `planning` |
|---|---|---|---|---|---|
| Monteur | 1 (lezen) | geen | 1 | 1 | 1 (lezen) |
| Uitvoerder | 1 | geen | 1 | 1 | 2 |
| Werkvoorbereider | 2 | **1 (nu geen)** | 2 | 2 | **2 (nu geen)** |
| Projectleider | 2 | 1 (heeft hij al) | 2 | 2 | 3 |

### BESLOTEN door René, 9 augustus 2026

De modulesleutel heet `offertes`, maar hij bewaakt drie verschillende deuren: offertes (`offertes.ts`), opdrachten en werkbegroting (`opdrachten.ts`), en werkvoorbereiding en inkoop (`werkvoorbereiding.ts`).

**Uitgangspunt van René: monteurs zien nooit een offerte en nooit financiële bedragen. Ze hoeven alleen de werkbegroting leesbaar te zien zonder financiële cijfers.**

Daarmee is de keuze gemaakt: **de sleutel wordt gesplitst.** Eén sleutel kan niet één deur openen en de andere dicht houden.

Gemeten omvang: **`offertes.ts` heeft 58 routes en blijft ongewijzigd op `offertes`.** `opdrachten.ts` (15 routes, waarvan 1 over offertes gaat) en `werkvoorbereiding.ts` (29 routes) krijgen een nieuwe sleutel — samen 44 routes, en de sleutel staat in beide bestanden bovenin één keer gedefinieerd.

---

## 2. Waar het komt

Gemeten navigatie in de app: **Gebouwen → gebouw (`gebouw/[id].tsx`) → verdieping (`plattegrond/[verdiepingId].tsx`) → spot**.

De werkbegroting hangt in de backend aan een **opdracht** (`/opdrachten/:id/werkbegroting`), niet aan een gebouw. De weg is dus: gebouw → opdracht(en) van dat gebouw → werkbegroting. Een gebouw kan meerdere opdrachten hebben; toon ze dan als lijst en laat kiezen. Eén opdracht = direct doorgaan.

**Geen nieuw hoofdstuk.** Alles hangt aan het bestaande gebouwscherm. Wel één nieuw menu-item **Projecten**, als ingang voor wie niet via een werkdag binnenkomt — de werkvoorbereider en de projectleider staan immers niet ingepland.

---

## 3. De schermen

### 3.1 Werkbegroting — twee weergaven, één scherm

- **Zonder financiële cijfers**: werkzaamheden en uren. Voor monteurs.
- **Met alle cijfers**: plus tarieven, bedragen en totalen. Voor uitvoerder, werkvoorbereider en projectleider.

Het is **één scherm met twee weergaven**, geen twee schermen — anders lopen ze uit elkaar. Welke weergave iemand krijgt wordt **op de server bepaald**: wie geen recht heeft op bedragen, krijgt ze niet in het antwoord. Niet verbergen in de app.

Alleen lezen. Een hoofdbegrotingsregel wijzigen kan hier niet, door niemand.

### 3.2 Inkoop — twee weergaven, één scherm

Zelfde principe. **De verwachte leverdatum staat in beide weergaven**; die is voor de monteur even belangrijk als voor de werkvoorbereider.

Regels zijn aanklikbaar voor detail: artikel, aantal, leverancier, verwachte leverdatum, status. Bedragen alleen in de weergave met cijfers.

### 3.3 Calculatie — alleen lezen, werkvoorbereider en projectleider

**Let op welke calculatie.** Er bestaan twee calculatiemodellen naast elkaar:

- `calculaties` + `calculatie_regels` — routes `/calculaties/...` in `routes/calculaties.ts`
- **`mod_calc_headers` + dertien `mod_calc_*`-tabellen** — routes `/modules/calculaties/...` in `routes/mod-calculatie.ts` (2.086 r.)

`docs/antwoorden/NUMMER_01.md` meldt dat `calculatie_id` op offertes en opdrachten in werkelijkheid naar **`mod_calc_headers`** wees; migratie 0018 heeft de sleutel daarheen omgehangen. **Dit scherm leest dus `mod_calc_*` via `/modules/calculaties/:id` en `/modules/calculaties/:id/regels`.**

Beide routegroepen zitten achter de eigen sleutel `calculaties` (niveau 1 lezen) — **niet** achter `offertes`. De projectleider heeft `calculaties: 1` al; de werkvoorbereider heeft niets en moet naar 1.

**Bevestig bij oplevering welk model de projectketen daadwerkelijk gebruikt**, en of `routes/calculaties.ts` nog ergens levend gebruikt wordt of een restant is. Neem daar geen aanname over.

Geen bewerkfuncties, geen invoervelden.

### 3.4 Begroot / besteed / resterend

Drie getallen bovenaan het opdrachtscherm. Werkvoorbereider en projectleider.

### 3.5 Planning

Leesbaar voor monteur en uitvoerder. Bewerkbaar voor werkvoorbereider en projectleider.

---

## 4. Meer- en minderwerk melden

Nieuw. Gaat naar de **werkvoorbereider**, met **vaste cc aan de projectleider**. Die cc is niet uit te zetten.

**Alle velden verplicht, voor iedereen die meldt — ook voor de projectleider:**

| Veld | Vorm |
|---|---|
| Meerwerk of minderwerk | keuze |
| Foto's | minimaal één |
| Omschrijving | vrije tekst |
| Ingeschatte impact **materiaal** | vrije tekst |
| Ingeschatte impact **uren** | getal of bandbreedte |
| Ingeschatte impact **planning** | getal in dagen of bandbreedte |

Een melding zonder een van deze velden is niet te versturen. Een ruwe schatting is genoeg — "ongeveer een dag", "een paar meter extra" — leeg laten niet.

De reden staat in de opdracht en hoort ook in het scherm te blijken: wie meldt, denkt na. [stated] René: *"anders gooien ze van alles ondoordacht over de schutting."*

**Melden is niet begroten en niet doorbelasten.** Een melding wordt geen werkbegrotingsregel en raakt geen enkel bedrag tot de werkvoorbereider hem oppakt. Doorbelasten blijft een besluit van de projectleider.

De melding komt op de **werkbak** die al bestaat (`lib/bewakingsloop.ts` + `werkbakService`). **Geen nieuwe meldingentabel.**

---

## 5. Materiaal aanvragen

`app/materiaal-aanvraag/nieuw.tsx` bestaat al, met redenen "Op / verbruikt", "Beschadigd", "Nodig voor werk" en foto's. Dat blijft.

**Toevoegen: één verplichte vraag.**

> Is dit volgens de opdracht?
> - Ja, staat in de opdracht
> - Nee, dit wijkt af
> - Weet ik niet

**"Weet ik niet" is een volwaardig antwoord.** Het mag geen extra vragen, waarschuwing of omweg opleveren. Het is juist bruikbaar: het wijst de werkvoorbereider aan waar de opdracht onduidelijk is.

Een aanvraag met "wijkt af" of "weet ik niet" gaat naar de werkvoorbereider vóórdat er besteld wordt. "Ja" volgt de bestaande weg.

Aan te vragen door iedereen: monteur, uitvoerder, werkvoorbereider, projectleider.

---

## 6. Toebehoren gereedschap aanvragen

Nieuw. Zaagjes, boortjes, schijven en dergelijke. Aan te vragen door iedereen, gaat naar de **werkvoorbereider**.

De kosten landen op **magazijn — gereedschap — toebehoren**, dus **niet op een project**. Dit is verbruik.

---

## 7. De vier magazijnen

Gemeten stand:

- **Voorraad materiaal** — bestaat: `magazijn_locaties`, `voorraad_mutaties`, `reserveringen`, `magazijn_stellingscans`, `magazijn_picklijsten`, `magazijn_inkooporders`
- **Gereedschap** — bestaat: `gereedschappen` (volgnummer, gegraveerd nummer, serienummer, categorie, **keuringsplichtig, keuring_norm, keuring_verval_datum, volgende_keuring**, huidige medewerker) plus `bruikleen_overeenkomsten` en `gereedschap_meldingen`
- **Toebehoren gereedschap** — bestaat nergens
- **Klimmaterieel** — bestaat nergens; komt alleen voor als tariefregel "Hoogwerker / Klimmaterieel" in `mod-calculatie.ts` r.224

**Vier ingangen in beeld, twee in techniek:**

1. **Toebehoren** worden verbruiksartikelen aan de **voorraadkant** — aantallen, geen serienummer, geen keuring — met een eigen kostenrubriek zodat ze niet op een project belanden.
2. **Klimmaterieel** wordt een **categorie binnen `gereedschappen`**. Die tabel heeft de keuringvelden al. Ladders en rolsteigers zijn keuringsplichtig; een derde plek waar keuringsdata bijgehouden moet worden is een risico, geen gemak.

**Voorraadinzicht is voor iedereen**: monteur, uitvoerder, werkvoorbereider, projectleider.

---

## 8. Verboden

- Geen tweede scherm voor de weergave zonder bedragen. Eén scherm, twee weergaven, beslist op de server.
- Bedragen nooit alleen in de app verbergen — als ze in het antwoord zitten, zijn ze te zien.
- Geen nieuwe meldingentabel voor meer- en minderwerk; de werkbak bestaat.
- Geen aparte tabellen voor toebehoren en klimmaterieel zonder terugkoppeling waarom dat nodig zou zijn.
- De cc aan de projectleider is niet uit te zetten.
- Geen enkel veld in de meer-/minderwerkmelding optioneel maken, ook niet "voor het gemak van de projectleider".
- Geen wijziging aan de rechtenmatrix zonder akkoord van René (§1).

---

## 8b. Twee vaste eisen bij deze opdracht

**Toets elke aanname en meld afwijkingen.** Voor elk scherm en elk menu-item: controleer welke module en welk niveau de bijbehorende backendroute werkelijk eist, en meld elk verschil met wat in deze opdracht staat — **pas niets stilzwijgend aan**. Deze zin stond ook in `APP_01` en heeft daar zes onjuiste aannames gevangen; dat is de reden dat hij hier weer staat.

**Wijk je af van de scope van deze opdracht, meld dat dan vóór je bouwt.** Bij `WAGENPARK_01` zijn twee onderdelen gebouwd die er expliciet buiten stonden. Dat het goede werk opleverde doet daar niet aan af: een scopegrens die niet standhoudt, is geen scopegrens.

---

## 9. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. **Het rechtenvoorstel uit §1 is voorgelegd en goedgekeurd** vóór de bouw. Toon het voorstel en het akkoord.
2. Een **monteur** opent de werkbegroting van een project en ziet werkzaamheden en uren, **en geen enkel bedrag**. Toon het serverantwoord en bewijs dat er geen bedragen in zitten.
3. Een **uitvoerder** opent dezelfde werkbegroting en ziet wél de bedragen.
4. Beiden zien bij inkoop **dezelfde verwachte leverdatum**.
5. Een meer-/minderwerkmelding zonder ingevulde impact-uren is **niet te versturen**. Toon de weigering.
6. Een verstuurde melding komt aan bij de werkvoorbereider **en** in cc bij de projectleider. Toon beide.
7. Een materiaalaanvraag met "Weet ik niet" gaat door zonder extra vragen en komt bij de werkvoorbereider terecht.
8. Een aanvraag voor toebehoren belandt op de kostenrubriek magazijn-gereedschap-toebehoren en **niet** op een project.
9. Klimmaterieel is als categorie aan te maken en erft de keuringvelden. Toon een klimmaterieel-item met een keuringsvervaldatum.
10. Een monteur die het adres van een werkbegroting-met-bedragen rechtstreeks aanroept, krijgt de versie **zonder** bedragen of een 403 — niet de volledige.
