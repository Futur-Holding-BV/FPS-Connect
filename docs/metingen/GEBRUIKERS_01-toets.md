# GEBRUIKERS_01 — toetsresultaat (18-08-2026, dev)

Script: `scripts/src/verificatie-gebruikers01.ts` (echte login + TOTP, ruimt
alle testdata zelf op). Uitkomst: **alle stappen PASS**.

```
STAP 1 PASS — ingelogd
STAP 2 PASS — GET /profielen: 18 profielen (18 systeem, 0 zelfgemaakt);
              alle 8 eerder ontbrekende presets aanwezig
STAP 3 PASS — bewerken werkt op systeemprofiel én zelfgemaakt profiel (PATCH 200)
STAP 4 PASS — POST /medewerkers met oproep + 0 contracturen + einddatum 2027-02-18: 201
STAP 5 PASS — personeelskaart: dienstverband=oproep, contracturen=0
STAP 6 PASS — contractbewaking: 1 contract, type=oproep, einddatum=2027-02-18
              (einddatum-/aanzegtermijnbewaking loopt hierop mee)
STAP 7 PASS — negatieve contracturen geweigerd (400)
STAP 8 PASS — concept-medewerker (wizard stap 1) zonder startdatum: 201, nog geen contract
STAP 9 PASS — wizard-afronding via PATCH: exact één contract (oproep, einddatum);
              herhaalde PATCH maakt geen tweede (duplicate-guard)
```

Aanvullende metingen:
- Onboardingkiezer las uit hardcoded `FUNCTIE_GROEPEN` (12 namen; 11 zichtbaar
  voor niet-hoofdbeheerder) i.p.v. `GET /profielen` — zie antwoorddoc §1.
- Bewerkdialoog-crash: `<SelectItem value="">` (Radix verbiedt lege string).
  Zelfde patroon elders (niet aangepast): inspecties/detail.tsx (3×),
  beheer/meldingen.tsx (3×), veiligheid/lmra.tsx,
  opdrachten/inkoopplanning-tab.tsx, snagstream/index.tsx.
- Server-urengrens was 1..40 bij `/medewerkers/onboarding`, terwijl het scherm
  tot 48 toestond en de UI-route (`POST /medewerkers`) helemaal niet valideerde;
  beide routes nu uniform 0..48 + gedeelde contract-aanmaak.
- §4 (jonge medewerkers): geboortedatum bestaat als veld, maar nergens een
  leeftijdsregel voor werktijden/planning/veiligheid — zie antwoorddoc §4.
