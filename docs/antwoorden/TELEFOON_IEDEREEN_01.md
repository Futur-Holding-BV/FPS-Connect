# TELEFOON_IEDEREEN_01 — Telefoonomgeving voor iedereen

## Uitkomst

De telefoonomgeving is beschikbaar voor iedere ingelogde gebruiker. De
web-PWA-redirect voor kantoor is volledig verwijderd; login, onboarding en het
appslot blijven ongewijzigd. De desktopomgeving blijft veldfuncties via de
bestaande servervlag `is_uitvoerend_veld` afsluiten.

## Menu

Kantoor en hoofdbeheerder zien als hoofdingangen:

1. Verlof
2. Uren
3. Declaraties
4. Loonstrookjes
5. Certificaten
6. Opleidingen

Module-ingangen komen daar onder **Meer** bij zodra de gebruiker het vereiste
recht heeft. Een uitvoerende veldfunctie houdt het bestaande werkmenu en krijgt
persoonlijke ingangen die niet in de ring passen onder **Meer**.

## Eigen gegevens

De app stuurt voor eigen zaken geen vrij te kiezen medewerker-id:

- certificaten: `GET /api/mijn/certificaten`;
- opleidingen: `GET /api/mijn/opleidingen`;
- verlof: `/api/mijn/verlof…`;
- declaraties: `/api/mijn/declaraties` en eigen mutatieroutes;
- loonstrookjes: `GET /api/mijn/salarisdocumenten`;
- uren: `GET /api/uren/mijn-week`.

De API leidt de medewerker server-side af uit de ingelogde sessie/Bearer-token.
Een gewone medewerker zonder `personeel:1` kan de eigen opleidingen wel lezen,
maar krijgt terecht 403 op de beheer-catalogus `GET /api/opleidingen`.

## Bewijs

De geautomatiseerde telefoonproef
`scripts/e2e/monteur-telefoonomgeving-profielen.spec.ts` dekt drie echte
inlogprofielen:

- uitvoerend veld: werkmenu aanwezig plus alle eigen-zaken-ingangen;
- kantoor zonder extra rechten: zes persoonlijke hoofdingangen, geen
  veldingangen en alle eigen API-routes bereikbaar;
- hoofdbeheerder: zes persoonlijke hoofdingangen plus Personeel en Magazijn.

Eindresultaat (19-08-2026): de volledige suite `e2e-menu`
(`pnpm --filter @workspace/scripts run e2e-monteur-ci`) is groen met
**7 passed** — de vier taaktests plus de bestaande startmenu-, toolbox- en
uurcoderegressies. Een aanvullende onafhankelijke visuele telefoonproef
(400×720) bevestigde met het kantoorprofiel het zesdelige eigen-zakenmenu,
het ontbreken van Mijn werkdag/Mijn werk/Opname en het werkende scherm
**Mijn certificaten** (VCA/EHBO/BHV met geldigheidsstatus).

Dezelfde proef bewaakt dat de desktopafsluiting nog op
`VELD_GEBLOKKEERDE_PREFIXEN`, `is_uitvoerend_veld` en `VeldwerkOmleiding` rust
en dat de telefoonlayout geen `window.location.replace` meer bevat.

Voor een productieproef op een fysieke telefoon is meting D in
`docs/metingen/MONTEUR_NU_01-telefoonbewijs.md` aangepast aan het nieuwe besluit:
kantoor moet op `/app/` blijven.