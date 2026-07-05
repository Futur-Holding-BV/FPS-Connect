# FPS Connect — Ontwikkelfilosofie (Verplicht)

Deze ontwikkelfilosofie is leidend voor alle toekomstige werkzaamheden aan FPS Connect.

## Hoofddoel

FPS Connect wordt in de eerste plaats gebouwd als een stabiel, betrouwbaar en prettig werkend bedrijfsplatform voor dagelijks gebruik binnen FPS.

Nieuwe functionaliteit is ondergeschikt aan gebruiksgemak, stabiliteit en de complete bedrijfsworkflow.

## Ontwikkelregels

Iedere wijziging moet minimaal aan één van de volgende doelen bijdragen:

1. Het dagelijkse werk van medewerkers eenvoudiger maken.
2. De stabiliteit, betrouwbaarheid of veiligheid van Connect verbeteren.
3. Een duurzaam fundament leggen voor toekomstige uitbreidingen zonder de huidige werking ingewikkelder te maken.

Wanneer een wijziging niet aantoonbaar aan minimaal één van deze doelen voldoet, wordt deze niet gebouwd.

## Uitgangspunt

Connect is géén verzameling losse modules.

Connect is één geïntegreerd bedrijfsplatform.

Iedere wijziging wordt beoordeeld op de invloed op de volledige bedrijfsworkflow.

## Bedrijfsworkflow

De primaire bedrijfsworkflow is leidend:

```
Aanvraag → CRM → Opname → Calculatie → Offerte → Opdracht → Werkbegroting →
Inkoop → Magazijn → Werkvoorbereiding → Planning → Uitvoering → Meerwerk →
Oplevering → Facturatie → Nacalculatie → Onderhoud → Managementinformatie
```

Nieuwe functionaliteit mag deze workflow verbeteren, maar niet ingewikkelder maken.

## Kantoorversie

De Main-versie is de operationele kantoorversie. Extra eisen:

- Maximale stabiliteit
- Minimale regressierisico's
- Voorspelbaar gedrag
- Geen experimentele functionaliteit

Nieuwe functionaliteit wordt pas opgenomen nadat deze uitgebreid getest is.

## Ontwikkelversie

Nieuwe ideeën worden ontwikkeld in de ontwikkelomgeving. Na testen worden zij gecontroleerd overgenomen naar de kantoorversie.

## AI

AI is ondersteunend aan de gebruiker. AI moet uiteindelijk uitgroeien tot de digitale procesregisseur van Connect. Dat gebeurt gefaseerd:

- **Fase 1** — AI ondersteunt bestaande werkzaamheden
- **Fase 2** — AI bereidt werkzaamheden zelfstandig voor
- **Fase 3** — AI bewaakt workflows
- **Fase 4** — AI regisseert bedrijfsprocessen, altijd met menselijke controle waar noodzakelijk

Nieuwe AI-functionaliteit mag de bestaande kantoorworkflow nooit ingewikkelder maken.

## Nieuwe ideeën

Nieuwe ideeën worden altijd eerst beoordeeld aan de hand van:

- Helpt dit de dagelijkse gebruiker?
- Verbetert dit een bestaande workflow?
- Maakt dit Connect eenvoudiger?
- Is dit noodzakelijk vóór de kantoorversie?
- Kan dit veilig later gebouwd worden?

Wanneer een idee ook na de kantoorrelease gebouwd kan worden zonder nadelen, wordt het opgenomen in de Future Backlog.

## Beslissingsregel

**Twijfelgevallen worden NIET gebouwd.**

Bij twijfel krijgt stabiliteit altijd voorrang boven extra functionaliteit.

## Kwaliteitsmaatstaf

De belangrijkste KPI van FPS Connect is niet "Hoeveel functionaliteit heeft Connect?" maar:

> **"Kan een medewerker een volledige werkdag prettig, snel en betrouwbaar volledig binnen Connect uitvoeren?"**

Alle toekomstige beslissingen worden aan deze KPI getoetst.

## Codegen-workflow (verplicht)

Codegen **moet altijd** worden uitgevoerd via het npm-script:

```sh
pnpm --filter @workspace/api-spec run codegen
```

Dit script voert achtereenvolgens uit:
1. `orval --config ./orval.config.ts` — genereert `lib/api-client-react/src/generated/api.ts`
2. `pnpm run typecheck:libs` — herbouwt `lib/api-client-react/dist/` zodat de declaraties actueel zijn

**Nooit rechtstreeks `npx orval` aanroepen.** Als orval buiten het script wordt aangeroepen (bijv. via een editor-integratie of `npx orval`), wordt stap 2 overgeslagen. De `dist/`-declaraties raken dan verouderd zonder waarschuwing in de editor, en de frontend kan stale types importeren.

**Technische vangnetten:**

- De kwaliteitscheck (`pnpm --filter @workspace/scripts run kwaliteitscheck`) detecteert automatisch of `dist/generated/api.d.ts` ouder is dan `src/generated/api.ts` en rapporteert dit als bevinding.
- `lib/api-client-react/package.json` bevat een `prepare`-script (`tsc --build`) zodat `dist/` na elke `pnpm install` up-to-date is.
- De git pre-commit hook in `.githooks/pre-commit` herbouwt `dist/` automatisch als hij verouderd is. Activeer via:
  ```sh
  git config core.hooksPath .githooks
  ```
- Het script `pnpm --filter @workspace/scripts run check-codegen-stale` kan ook los worden uitgevoerd.

## Verplicht bij elke opdracht

Bij iedere implementatie moet worden aangegeven:

1. Welke bedrijfsworkflow hierdoor eenvoudiger wordt.
2. Welke handmatige werkzaamheden verdwijnen.
3. Welke modules hierdoor beter samenwerken.
4. Waarom deze wijziging noodzakelijk is vóór de kantoorversie.
5. Of deze wijziging ook veilig na de kantoorrelease gebouwd had kunnen worden.

Wanneer vraag 5 met "ja" wordt beantwoord, moet expliciet worden gemotiveerd waarom de wijziging nu toch prioriteit krijgt.
