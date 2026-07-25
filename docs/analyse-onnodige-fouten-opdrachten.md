# Analyse: onnodige fouten door dubbele, foutieve of onvolledige opdrachten

**Project:** FPS Connect (FPS Brandpreventie) — Replit-werkruimte
**Opgesteld:** 25 juli 2026
**Bronnen:** `docs/changelog.md` (ca. 100 entries, 13–18 juli 2026), Replit-taakhistorie, `docs/PRODUCTION_RUNBOOK.md`, `docs/diagnose-methodologie.md`

---

## Doel en afbakening

Dit document inventariseert werk dat binnen FPS Connect **aantoonbaar dubbel of onnodig** is uitgevoerd, of dat tot herstelwerk leidde, **voor zover de oorzaak ligt bij de opdracht zelf** (dubbel verstrekt, onvolledig, of in tegenspraak met een eerdere opdracht) — en niet bij de technische uitvoering.

### Belangrijke kanttekeningen (lees eerst)

1. **Herkomst van de opdrachten is in dit systeem niet vastgelegd.** De Replit-omgeving registreert de tekst van de opdrachten die zijn ingediend, maar niet of die tekst afkomstig is uit ChatGPT/OpenAI, uit een ander hulpmiddel, of handmatig is geschreven. De koppeling tussen een specifieke opdracht en een specifiek ChatGPT-gesprek moet uit de eigen ChatGPT-gespreksgeschiedenis worden aangetoond (exporteerbaar via ChatGPT: Settings → Data controls → Export data).
2. **Dit is een feitelijke reconstructie, geen juridisch stuk.** Er wordt geen uitspraak gedaan over aansprakelijkheid, causaliteit in juridische zin of schadehoogte.
3. **Voor de geloofwaardigheid is ook het tegendeel opgenomen:** categorie C bevat incidenten die *niet* aan opdrachten toe te schrijven zijn (technische uitvoerings- en omgevingsfouten). Deze horen niet in een claim over opdrachtkwaliteit thuis.
4. Kosten in tijd/geld zijn niet uit deze bronnen af te leiden; per item is wel de omvang van het dubbele of vervallen werk beschreven. Replit rekent per checkpoint; het aantal checkpoints per periode is zichtbaar in de Replit-facturering en kan door de gebruiker aan de onderstaande data worden gekoppeld.

---

## Categorie A — Dubbel verstrekte of overlappende opdrachten

### A1. Verlofmodule-uitbreiding tweemaal als opdracht verwerkt (Taak #614)

- **Bewijs:** `docs/changelog.md` bevat op 13 juli 2026 **twee letterlijk identieke entries** "Verlofmodule: leidinggevende-picker, bezetting-override, mijn-team-filter" (regels ±1687 en ±1988), beide met "Aanleiding: Taak #614".
- **Aard:** dezelfde opdracht is tweemaal in de verwerkingsketen terechtgekomen.
- **Onnodig werk:** dubbele verwerkings- en mergecyclus rond dezelfde wijzigingenset.

### A2. Post-merge e-mailmelding tweemaal identiek opgeleverd

- **Bewijs:** twee **identieke** changelog-entries "E-mailmelding bij mislukte GitHub push in post-merge.sh" op 15 juli 2026 (regels ±810 en ±828), woordelijk gelijk tot en met de actiepunten.
- **Aard:** dubbele opdracht/verwerking van exact dezelfde functionaliteit.

### A3. Productie-logindiagnose tweemaal volledig uitgevoerd

- **Bewijs:**
  - Entry 16 juli 2026: "Diagnose productie-login connect.fps-one.nl (kritiek — **opgelost voor aanvang**)" — volledige SSH-diagnose (8 controlestappen), conclusie: geen wijziging nodig.
  - Taak #770 (gemerged 18 juli 2026): "Herstel productie-login op connect.fps-one.nl (kritiek)" — **opnieuw** volledige SSH-diagnose op dezelfde vraag, zelfde conclusie: "geen code-fix nodig", "de situatie was al hersteld voor aanvang taak".
- **Aard:** een kritieke hersteltaak is (nogmaals) uitgezet voor een probleem dat al aantoonbaar opgelost was.
- **Onnodig werk:** twee volledige productie-diagnosesessies (SSH-onderzoek, containercontroles, DB-queries, rapportage) voor hetzelfde reeds opgeloste incident.

### A4. Hardcoded rolchecks in gebouwenpagina's tweemaal als taak uitgezet

- **Bewijs:**
  - Entry 18 juli 2026: "Gebouwen-bevoegdheidscheck gefixeerd: René Vink (rol=gebruiker, gb=4) hersteld" — `BEHEERDER_ROLLEN`-checks vervangen door `heeftNiveau("gebouwen", 2)` in `detail.tsx` en `plattegrond.tsx`.
  - Taak #740 (gemerged 18 juli 2026): "Vervang ook andere hardcoded rolchecken in de gebouwenpagina's" — betrof **dezelfde twee bestanden en dezelfde wijziging**; in de merge-notities staat expliciet "2 commits geskipt als 'already upstream'".
- **Aard:** overlappende opdracht uitgezet terwijl het werk (grotendeels) al gedaan was.

### A5. Taken #744 en #745 aangemaakt en geannuleerd (overlap met #732)

- **Bewijs:** taakhistorie 18 juli 2026: #744 ("GitHub-push-faalmelding ook bij mislukte VPS-deploy") en #745 ("kanaal van faalmelding inzichtelijk maken") beide **geannuleerd** nadat taak #732 ("post-merge melding ook zonder e-mailconfiguratie") het onderwerp al afdekte.
- **Aard:** drie overlappende opdrachten over één meldingsmechanisme, waarvan twee moesten worden ingetrokken.

---

## Categorie B — Onvolledige of elkaar tegensprekende opdrachten (herwerk)

### B1. De onboarding-saga: drie consolidatierondes in drie dagen over dezelfde functionaliteit

Dit is het duidelijkste en duurste patroon in het project. Chronologie uit de changelog:

| Datum | Opdracht/oplevering | Gevolg achteraf |
|---|---|---|
| 14 juli | "Slimmere gebruikers-onboarding met AI" + AI-bevoegdhedenknop: losse onboarding-dialogen op `/personeel` gebouwd | Op 17–18 juli weer volledig verwijderd |
| 16 juli | Taak #772: "Centrale AI-ondersteunde nieuwe-medewerker wizard (14 stappen)" | Vier code-reviewrondes met **per ronde nieuwe eisen** die niet in de oorspronkelijke opdracht stonden (zie B2) |
| 16 juli | "Wizard veiligheids-lagen" — **aanvullende eisen op Taak #772** achteraf: feature flag, AI-fallback, e2e-tests | Aparte extra bouwronde |
| 17 juli | Bugfix: "Nieuwe medewerker"-knop op `/personeel` opende nog het oude kleine dialoogvenster i.p.v. de wizard | Ingang was in de wizard-opdracht niet meegenomen |
| 18 juli | "Consolidatie medewerker-aanmaak naar centrale wizard": ±270 regels dialoog-JSX + state + functies verwijderd; nieuwe "Onboarden"-knoppen naar `/personeel/onboarden` aangelegd | Diezelfde dag weer deels vervallen |
| 18 juli | CONSOLIDATE_EMPLOYEE_ONBOARDING: onboarding **uitsluitend** via rij-actie met verplichte `userId`; losse ingangen (waaronder de op 18 juli aangelegde knoppen) weer verwijderd; de accountaanmaak-/uitnodigingsstap uit de 14-stappenwizard weer gesloopt | — |

- **Aard:** de opeenvolgende opdrachten spraken elkaar tegen over (a) wáár medewerkers aangemaakt mogen worden en (b) of de wizard zelf accounts mag aanmaken. Een volledige opdracht had het eindmodel (één ingang, userId verplicht, geen accountaanmaak in de wizard) in één keer vastgelegd.
- **Onnodig werk (aantoonbaar):** dialoog-UI van 14 juli volledig gebouwd en weer verwijderd (±270 regels alleen al in de laatste opruimronde); wizard-stap "FPS Connect-uitnodigen" gebouwd (16 juli) en verwijderd (18 juli); ingangen aangelegd (17–18 juli) en dezelfde week weer verwijderd.

### B2. Taak #772: vier reviewrondes doordat eisen per ronde werden nageleverd

- **Bewijs:** vier opeenvolgende changelog-entries op 16 juli: "Code review fixes" ronde 2 (FIX-B t/m F, save/resume, generieke stromen), ronde 3 (B1–B6: o.a. Middelen-stap ontbrak, per-stap upload ontbrak, verkeerde AI-functie), ronde 4 (optimistic lock, audit-logging, inline AI-voorstellen) en ronde 4b (herbruikbare component, duplicate-check-bedrading, save/resume-UX).
- **Aard:** een aanzienlijk deel van deze punten zijn **functionele eisen** (Middelen-stap, documentupload per stap, duplicaatcontrole, hervatten van een concept) die in een volledige oorspronkelijke opdracht hadden gestaan; ze zijn nu als "afkeuring" in vier extra bouw-/reviewcycli nageleverd.
- **Kanttekening (eerlijkheid):** een deel van de reviewpunten betrof echte uitvoeringsfouten (bijv. de camelCase-bug, `mutate` i.p.v. `mutateAsync`); die tellen niet als opdrachtfout.

### B3. Feature live vóór databasemigratie: productie-uitval login (kritiek)

- **Bewijs:** entries 16–17 juli: commit `48ec8a3` introduceerde de `moet_wachtwoord_wijzigen`-gate terwijl de kolom nog niet in de productie-DB bestond → 500-fouten op alle post-loginpagina's; alle gebruikers (René, Jacqueline, Ruben) konden effectief niet werken. Later nogmaals: kolommen `medewerker_status`/`wizard_voortgang` ontbraken op productie → zelfde klasse uitval.
- **Aard:** de opdrachten voor deze features bevatten geen deploy-/migratievolgorde-eis, terwijl het project een productieomgeving met eigen DB heeft. Een volledige opdracht had de eis "migratie aantoonbaar vóór frontend-activatie" bevat.
- **Kanttekening:** de uitvoeringskant (stale migrate-image, zie C) droeg hieraan bij; de oorzaak is dus gedeeld.

### B4. Meldingsketen post-merge in vijf losse fragmenten opgedragen

- **Bewijs:** 15–18 juli: (1) push-melding bij falen, (2) token-verloopdetectie, (3) smoketest-faalmelding, (4) fallback-kanaal zonder e-mailconfiguratie (#732), (5) #744/#745 aangemaakt en geannuleerd.
- **Aard:** één samenhangend meldingsmechanisme is in minstens vijf losse opdrachten aangeleverd, met overlap en intrekkingen als gevolg. Eén volledige opdracht ("meld élke faalstap in de keten, ook zonder mailconfig, met zichtbaar kanaal") had drie tot vier cycli gescheeld.

---

## Categorie C — Uitdrukkelijk NIET aan opdrachten toe te schrijven

Voor een zuiver dossier: onderstaande incidenten kostten eveneens tijd, maar de oorzaak lag in de technische uitvoering of omgeving (Replit-agent, infrastructuur, tooling) — niet in dubbele of onvolledige opdrachten:

- Git-conflict-markers die als code werden gecommit en de Docker-build braken (13 juli) — mergefout in de uitvoering; ook vandaag nog een achtergebleven conflictmarker in `docs/changelog.md` aangetroffen en verwijderd.
- SSH-sleutelformaat in `deploy.yml` en backup-profile-gating (18 juli) — infrastructuurconfiguratie.
- Stale migrate-Docker-image waardoor migraties stil niet draaiden (17 juli) — deploy-tooling.
- MinIO crash-loop, ontbrekende DB-kolom gebouwen-API (14 juli) — omgevings-/schemadrift.
- E2E-testflakiness (rate-limiter, stale dev-server, TOTP-timing, NixOS-browsercrashes) — testinfrastructuur.
- De vier reviewrondes van Taak #772 voor zover het echte codefouten betrof (zie kanttekening bij B2).

---

## Samenvatting

| Categorie | Aantal gevallen | Zwaarste geval |
|---|---|---|
| A — dubbele/overlappende opdrachten | 5 (A1–A5) | A3: kritieke productiediagnose tweemaal volledig uitgevoerd |
| B — onvolledige/tegenstrijdige opdrachten | 4 patronen (B1–B4) | B1: drie consolidatierondes onboarding in drie dagen, incl. gebouwde en weer verwijderde UI |
| C — uitgesloten (geen opdrachtfout) | 6+ incidenten | — |

**Voor een eventuele claim is per geval nodig:** (1) de letterlijke opdrachttekst zoals ingediend, (2) het ChatGPT-gesprek waaruit die tekst afkomstig is (export uit ChatGPT), (3) de hierboven genoemde changelog-/taakreferenties als bewijs van het dubbele of vervallen werk, en (4) de bijbehorende Replit-checkpointkosten uit de facturering. Punten 1, 2 en 4 vallen buiten wat vanuit deze werkruimte aantoonbaar is en moeten door de gebruiker zelf worden aangeleverd.
