# GEBRUIKERS_01 — toetsresultaat

Datum eerste meting: 18-08-2026 (dev)
Hertoets v2: 19-08-2026 (dev)
Script: `scripts/src/verificatie-gebruikers01.ts` (echte login + TOTP, ruimt
alle testdata zelf op).
Autorisatieproef: `scripts/src/verificatie-gebruikers01-autorisatie.ts`
(beperkt echt account + TOTP, ruimt alle testdata zelf op).

## Uitkomst — alle stappen PASS (hertoets 19-08-2026)

```
STAP 1 PASS — ingelogd
STAP 2 PASS — GET /functies-v2: 18 functies; alle geconsolideerde namen
              hebben een expliciete rechtenkoppeling
STAP 3 PASS — functie bewerken werkt; legacy functie-, profiel-, account-,
              onboarding-profiel- en herkomstrechtenmutaties geven HTTP 410
STAP 4 PASS — POST /medewerkers met oproep + 0 contracturen + einddatum 2027-02-19: 201
STAP 5 PASS — personeelskaart: dienstverband=oproep, contracturen=0
STAP 6 PASS — contractbewaking: 1 contract, type=oproep, einddatum=2027-02-19
              (einddatum-/aanzegtermijnbewaking loopt hierop mee)
STAP 7 PASS — negatieve contracturen geweigerd (400)
STAP 8 PASS — concept-medewerker (wizard stap 1) zonder startdatum: 201, nog geen contract
STAP 9 PASS — wizard-afronding via PATCH: exact één contract (oproep, einddatum);
              herhaalde PATCH maakt geen tweede (duplicate-guard)

AUTORISATIE STAP 1 PASS — personeel:2 kan geen functie met gebruikers:4
                           maken (HTTP 403)
AUTORISATIE STAP 2 PASS — zelftoewijzing van een hoger gerechtigde functie
                           via HRM wordt HTTP 403; geen medewerker aangemaakt
AUTORISATIE STAP 3 PASS — vervangen/verwijderen, accountverplaatsing,
                           status-/dienstdata, offboarding, medewerker-delete,
                           hoofd-/nevenaanstellingen en AI-indienstdatum geven
                           HTTP 403; medewerker en voorstel blijven ongewijzigd
```

## V2-migratiebewijs (19-08-2026)

```
Migratie 0101 (niet-destructieve consolidatie):
  dev-run        51/51 PASS
  rollback dry-run 8/8 (altijd ROLLBACK — geen echte schrijfoperatie)
  drift na migratie: 0
  rename/change-controles: groen
  volledige workspace-typecheck: groen
  functienaam-helper unit-tests: 6/6
  browserproef: Functiehuis/inline aanmaken/rechten/redirects/menu groen
```

Zie ook `docs/metingen/GEBRUIKERS_01-v2-bewijs.md` voor gedetailleerd
migratiebewijs en consolidatieresultaat.

## Aanvullende metingen

- Onboardingkiezer las uit hardcoded `FUNCTIE_GROEPEN` (12 namen; 11 zichtbaar
  voor niet-hoofdbeheerder) i.p.v. `GET /profielen` — zie antwoorddoc §1.
- Bewerkdialoog-crash: `<SelectItem value="">` (Radix verbiedt lege string).
  Zelfde patroon elders (niet aangepast): inspecties/detail.tsx (3×),
  beheer/meldingen.tsx (3×), veiligheid/lmra.tsx,
  opdrachten/inkoopplanning-tab.tsx, snagstream/index.tsx.
- Server-urengrens was 1..40 bij `/medewerkers/onboarding`, terwijl het scherm
  tot 48 toestond en de UI-route (`POST /medewerkers`) helemaal niet valideerde;
  beide routes en OpenAPI nu uniform 0..48 + gedeelde contract-aanmaak.
- Legacy `POST/PATCH /functies`, losse profielmutaties,
  accountrechtenvelden, onboarding-`profiel_id` en herkomstprofielacties zijn
  via de echte API met HTTP 410 beproefd.
- Browserproef: Functiehuis is de enige beheerplek; bewerken werkt, er is geen
  delete/trashactie, oude beheer-URL's redirecten, Instellingen toont één
  Functiehuis-ingang en Gebruikers groepeert op live HRM-functienamen.
- Code-reviewhardening: functie-matrixmutaties en HRM-functiewissels worden
  per module tegen de effectieve rechten van de actor gecontroleerd. De oude
  én nieuwe functie tellen mee. Een live `personeel:2`-account kreeg 403 op
  `gebruikers:4` maken, zelftoewijzing en alle vervang-/intrek-/verplaatspaden,
  inclusief AI-goedkeuring van een indienstdatum. Geen gedeeltelijke mutatie.
- Autorisatie-/doelgroepbeslissingen in algemene middleware, declaraties,
  toolbox, Slim Upload, veiligheid, import, social, Go Live en AI-adviseur zijn
  op effectieve functierechten gezet; geen raw accountmatrix als beslisbron.
- Regressierunner: `pnpm test` groen — 39 bestanden, 593 tests geslaagd en
  2 overgeslagen; de nieuwe pure autorisatietests draaien onder Vitest.
- §4 (jonge medewerkers): geboortedatum bestaat als veld; ATW-jeugdrestricties
  zijn intussen geïmplementeerd via `jongeWerknemerRegel.ts`,
  `planning-module.ts` en `compliance-monitoring.ts` (parallelle werkzaamheden,
  buiten scope van GEBRUIKERS_01) — zie antwoorddoc §4.
