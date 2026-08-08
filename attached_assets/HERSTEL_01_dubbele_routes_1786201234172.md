# HERSTEL_01 — Gemangelde routes: dubbele declaraties met verwisselde bodies

**Opdracht voor Replit · 8 augustus 2026 · gemeten op commit `4e4a414` (`main`)**

---

## 1. Wat er aan de hand is

De CI-fout in `src/routes/opname.ts` (TS2304 `Cannot find name 'opnameId' / 'itemId' / 'item' / 'fotoId'`) is niet een stel losse typefouten. Bij de reverts en merges van vanochtend zijn **routekoppen losgeraakt van hun bodies**: een route-declaratie staat nu boven de body van een ándere route. De commit `f7589a7` noemt dit zelf al ("herstel gemangelde auth.ts"), maar het herstel was onvolledig.

Bewijs — dezelfde methode+pad tweemaal gedeclareerd in één bestand:

| Bestand | Route | Regels |
|---|---|---|
| `opname.ts` | `POST /opname/:id/spots-aanmaken` | 325 en 359 |
| `opname.ts` | `PATCH /opname/items/:itemId` | 498 en 529 |
| `auth.ts` | `POST /auth/taal` | 567 en 611 |
| `voorzieningen.ts` | `PATCH /voorzieningen/:id/archief` | 693 en 1272 |

Express neemt bij dubbele registratie **de eerste**. De tweede is dode code.

---

## 2. Waarom dit erger is dan een rode CI

`opname.ts` typecheckt niet, dus die valt op. **De andere twee typechecken prima en zijn stil kapot in productie.**

### 2.1 `auth.ts` — twee gebruikersfuncties stuk

- Regel 567 heet `POST /auth/taal`, maar de body is een **wachtwoord-wijzigen-handler**: hij leest `huidig_wachtwoord` en `nieuw_wachtwoord` en antwoordt zonder die velden met 400.
- Regel 611 is de echte taal-handler (valideert tegen `TALEN`) en wordt **nooit bereikt**.
- In de volledige routelijst van `auth.ts` bestaat **geen enkel pad om als ingelogde gebruiker je wachtwoord te wijzigen**. Alleen `wachtwoord-vergeten` en `wachtwoord-reset` bestaan.

Gevolg, te verifiëren op productie: taal wisselen faalt met "Huidig en nieuw wachtwoord zijn verplicht", en wachtwoord wijzigen is onbereikbaar.

### 2.2 `voorzieningen.ts` — twee verschillende bewakingen op één pad

- Regel 693 (actief): `requireBevoegdheid("voorzieningen", 3)`, met een aparte niveau-4-controle binnenin voor de-archiveren.
- Regel 1272 (dood): `requireBevoegdheid("voorzieningen", 4)` voor alles, plus een 404 bij een onbekende voorziening en een typecontrole op `gearchiveerd`.

De strengere versie is de dode. Dit is **geen** duidelijke fout maar een botsing van twee bedoelingen — zie punt 4.

---

## 3. Wat gebouwd wordt

1. **Per dubbele route bepalen welke body bij welk pad hoort** — op inhoud, niet op volgorde. Een body die foto's verwijdert hoort onder `DELETE /opname/fotos/:fotoId`, niet onder `POST /opname/:id/spots-aanmaken`.
2. **De verweesde bodies terugzetten onder hun eigen declaratie.** De variabelen die de typecheck mist (`opnameId`, `itemId`, `fotoId`, `item`) zijn de aanwijzing: ze horen bij de declaratie waar ze uit `req.params` gehaald werden.
3. **De wachtwoord-wijzigen-handler krijgt zijn eigen pad terug** en `POST /auth/taal` wordt één route met de taal-body. Controleer welk pad de frontend voor wachtwoord wijzigen aanroept en gebruik precies dat pad; wijk daar niet van af.
4. **De dubbele declaraties verdwijnen**; er blijft per methode+pad exact één over.
5. **Nieuwe CI-controle:** een script dat faalt zodra dezelfde methode+pad-combinatie tweemaal in één routebestand wordt gedeclareerd. Zonder die controle komt dit terug — het is vandaag al twee keer gebeurd.

---

## 4. Rechten op archiveren en verwijderen — BESLOTEN (René, 08-08-2026)

**Regel: alleen de werkvoorbereider en de projectleider mogen spots verwijderen of archiveren.**

Die regel is met de huidige profielmatrix niet uitdrukbaar — de projectleider heeft `voorzieningen: 4`, maar de werkvoorbereider `3`, en op datzelfde niveau 3 staan ook Monteur, Timmerman en Uitvoerder. Gekozen oplossing (variant A):

1. In `lib/permissies/src/index.ts` krijgt het profiel **Werkvoorbereider** `voorzieningen: 4` in plaats van `3`. Alle andere modules van dat profiel blijven ongewijzigd.
2. `PATCH /voorzieningen/:id/archief` gaat naar `requireBevoegdheid("voorzieningen", 4)` — dat is de nu dode variant op r.1272; die wordt de overblijvende.
3. Neem uit de andere variant de strengere controles mee: de 404 bij een onbekende voorziening en de typecontrole op `gearchiveerd` (moet een boolean zijn).
4. De interne extra niveau-4-controle voor de-archiveren (r.702) is daarmee overbodig en verdwijnt.
5. Monteur, Timmerman en Uitvoerder houden `voorzieningen: 3` en kunnen dus gewoon spots blijven aanmaken en wijzigen op locatie.

**Bewust aanvaard gevolg:** de werkvoorbereider krijgt met niveau 4 ook toegang tot `POST /voorzieningen/:id/ai-controle`, want die zit achter hetzelfde niveau.

### 4.1 Let op — bestaande gebruikers veranderen hier niet vanzelf van

De bevoegdheden staan **per gebruiker als jsonb-kolom** opgeslagen; de veertien profielen zijn presets die bij het aanmaken worden toegepast. Het aanpassen van het preset raakt bestaande accounts dus **niet**.

Er is daarom een expliciete actualisatie nodig voor de accounts die nu het profiel Werkvoorbereider dragen, mét terugmelding hoeveel accounts zijn bijgewerkt. Zonder die stap slaagt een acceptatietest op een vers aangemaakte gebruiker, terwijl de echte werkvoorbereiders op niveau 3 blijven staan en in de praktijk niets verandert.

---

## 5. Acceptatie

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. `pnpm typecheck` slaagt voor alle packages.
2. Het duplicaat-script uit punt 3.5 draait in CI en meldt **nul** dubbele routes — aantonen met de uitvoer.
3. **Taal wisselen werkt op productie.** Toon het verzoek en het 200-antwoord.
4. **Wachtwoord wijzigen als ingelogde gebruiker werkt op productie**, via het pad dat de frontend aanroept.
5. `POST /opname/:id/spots-aanmaken` maakt spots aan en verwijdert geen foto's — aantonen met het antwoord.
6. **Rechten op archiveren/verwijderen.** Toon vier werkelijke antwoorden: een **werkvoorbereider** die een spot archiveert (moet slagen), een **projectleider** die er een verwijdert (moet slagen), een **monteur** die probeert te archiveren (moet 403 krijgen), en dezelfde monteur die een nieuwe spot aanmaakt (moet nog steeds slagen).
7. **Bestaande accounts bijgewerkt.** Meld hoeveel bestaande gebruikers met het profiel Werkvoorbereider naar `voorzieningen: 4` zijn gebracht. Nul is alleen een geldig antwoord als er aantoonbaar geen zulke accounts zijn.

**Niet doen:** de rode typecheck stilleggen door de ontbrekende variabelen simpelweg te declareren. Dat maakt de build groen en laat het verkeerde gedrag staan.
