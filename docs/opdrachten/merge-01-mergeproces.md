# MERGE_01 — De oorzaak achter de gemangelde routes

**Opdracht voor Replit · 8 augustus 2026 · gemeten op `5479d8b` (`main`)**

---

## 1. Waarom deze opdracht bestaat

`HERSTEL_01` is correct uitgevoerd en binnen tien minuten weer deels ongedaan gemaakt. Geteld per commit, aantal declaraties van `router.post("/opname/:id/spots-aanmaken")` in `artifacts/api-server/src/routes/opname.ts`:

| commit | tijd | aantal |
|---|---|---|
| `7b60cc2` | 15:06 | 1 — hersteld |
| `aa60c4c` | 15:08 | 1 |
| `d7cac83` | 15:16 | **2 — terug kapot** |
| `5479d8b` | 15:18 | **2** |

De commitboodschappen van `d7cac83` en `5479d8b` vermelden allebei "herstel gemangelde auth.ts/opname.ts uit eerdere merge", terwijl `opname.ts` in diezelfde commits juist regresseerde. `auth.ts` bleef wél goed.

Dit is vandaag vijf keer gebeurd. Het bestand opnieuw repareren is de verkeerde opdracht; het proces dat het terugzet is de opdracht.

---

## 2. De twee gemeten oorzaken

### 2.1 De sync-controle vóór een merge waarschuwt, maar houdt niets tegen

`scripts/post-merge.sh` r.7-48 bevat al precies de juiste controle: hij haalt GitHub `main` op en kijkt of die commits bevat die lokaal ontbreken. Maar in het script staat letterlijk:

> "Niet-blokkerend" … "De merge gaat door, maar de werkruimte wijkt af."

Daar zit het gat. De werkruimte loopt achter op `main`, een taaktak wordt vanuit die verouderde staat gemerged, en bestanden die op `main` al hersteld waren worden overschreven met de oude versie. De waarschuwing wordt afgedrukt en genegeerd.

Bijkomend: de hele controle wordt **overgeslagen** als `GITHUB_TOKEN_PUSH` ontbreekt. Dan is er niet eens een waarschuwing.

### 2.2 De deploy naar productie wacht niet op de CI

- `.github/workflows/ci.yml` draait op `push` naar elke tak. Daar zit sinds `aa60c4c` de dubbele-routes-controle in — die zou dit vangen.
- `.github/workflows/deploy.yml` draait óók op `push` naar `main`, **zonder `needs:` en zonder `workflow_run`**. De twee lopen naast elkaar.

Gevolg: een rode CI houdt de deploy niet tegen. En de Docker-build vangt het niet op, want `deploy/Dockerfile.api` bundelt met esbuild, en esbuild controleert geen types — code met een ongedefinieerde `fotoId` bouwt gewoon. De fout verschijnt pas als 500 wanneer een gebruiker de route aanroept.

**De huidige productie draait dus vermoedelijk met een kapotte `spots-aanmaken` en `PATCH /opname/items/:itemId`.** Dat is het eerste dat geverifieerd moet worden.

---

## 3. Wat gebouwd wordt

### 3.1 De sync-controle wordt blokkerend

In `scripts/post-merge.sh`: wijkt de lokale staat af van GitHub `main`, dan **stopt het proces met exit 1** in plaats van een waarschuwing af te drukken. De melding vermeldt welke commits ontbreken en wat de gebruiker moet doen (eerst `main` binnenhalen, dan opnieuw).

Ontbreekt `GITHUB_TOKEN_PUSH`, dan is dat óók een blokkade, geen stilzwijgende overslag: zonder token is niet vast te stellen of de werkruimte actueel is, en dan mag er niet gemerged worden.

### 3.2 De deploy voert de controles zelf uit vóór hij de server aanraakt

In `.github/workflows/deploy.yml` komt vóór de eerste stap die de VPS aanraakt een blok dat draait: `pnpm run typecheck`, `check-dubbele-routes` en `klant-poort-check`. Faalt er één, dan stopt de workflow en wordt er niets uitgerold.

Dit is **geen goedkeuringspoort** — er komt geen mens tussen, elke push naar `main` rolt nog steeds vanzelf uit. Het enige dat verandert is dat aantoonbaar kapotte code niet meer op productie belandt. `workflow_dispatch` blijft bestaan om handmatig te forceren wanneer dat nodig is.

*Alternatief dat bewust niet gekozen is:* `deploy.yml` laten wachten op de CI-workflow via `workflow_run`. Dat koppelt twee workflows aan elkaar en maakt het falen moeilijker te lezen; de controles direct in de deploy zijn zelfstandig en kosten ongeveer twee minuten.

### 3.3 `opname.ts` opnieuw herstellen

Volgens dezelfde regels als in `HERSTEL_01` §3: bodies terug onder hun eigen declaratie op inhoud, één declaratie per methode+pad. Concreet staat de body die een foto verwijdert (met `fotoId`) nu onder `POST /opname/:id/spots-aanmaken` op r.325.

Gebruik `7b60cc2` als referentie — daar was het al goed. Vergelijk het resultaat expliciet met die versie en meld eventuele verschillen.

---

## 4. Verboden in deze opdracht

- Geen wijziging aan de inhoud van routes of aan bevoegdheden. Dit is uitsluitend proces plus het terugzetten van het al eerder gemaakte herstel.
- De blokkade uit 3.1 niet omzeilbaar maken met een omgevingsvariabele of een vlag.
- De dubbele-routes-controle niet versoepelen om een build groen te krijgen.
- Geen menselijke goedkeuringsstap in de deploy inbouwen.

---

## 5. Acceptatie — het bewijs is een mislukking, geen groene build

Met vermelding van commit-SHA, GitHub `main`-SHA en productie-SHA:

1. **Productiestand vastgesteld.** Meld welke SHA er nu daadwerkelijk op `connect.fps-one.nl` draait, en of `POST /opname/:id/spots-aanmaken` daar een 500 geeft. Dit is de nulmeting.
2. **Sync-blokkade werkt.** Zet de werkruimte bewust één commit achter op `main` en probeer te mergen. Toon de foutmelding en exit 1. Toon daarna dat het na het binnenhalen van `main` wél doorgaat.
3. **Ontbrekend token blokkeert ook.** Draai `post-merge.sh` zonder `GITHUB_TOKEN_PUSH` en toon dat hij weigert in plaats van overslaat.
4. **Deploy weigert kapotte code.** Introduceer op een testtak tijdelijk een dubbele route, laat de deploy-workflow erop draaien en toon dat hij stopt vóór de eerste stap die de VPS aanraakt. Verwijder de testroute daarna.
5. **`opname.ts` is hersteld.** `check-dubbele-routes` meldt nul, `pnpm run typecheck` slaagt, en `POST /opname/:id/spots-aanmaken` maakt op productie spots aan in plaats van een 500 te geven.
6. **Regressietelling.** Draai `check-dubbele-routes` op de laatste tien commits van `main` en toon per commit de uitkomst. Zo is zichtbaar of het patroon echt gestopt is en niet alleen op dit moment toevallig goed staat.
