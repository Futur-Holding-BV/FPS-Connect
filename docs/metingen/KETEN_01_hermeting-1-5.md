# KETEN_01 hermeting — proces 1 t/m 5 (2026-08-19)

**Meting, geen reparatie.** Gedraaid met `scripts/e2e/web-keten-1-5.spec.ts` (afgeleid van de fase-1-hoofdlijnspec, zonder vangnet-opdracht: de keten stopt waar hij stopt). Resultaten en schermafdrukken in `scripts/e2e-resultaten/keten01-run2/`. Testgegevens (merk `KETEN01R2 …`) zijn na afloop opgeruimd; de opruiming dekt na review óók het ondertekend-pad (handtekeningen vóór offerte wegens ON DELETE RESTRICT).

## Uitkomst per keten

| # | Keten | Uitkomst | Detail |
|---|---|---|---|
| 1 | Aanvraag | **doorlopen** | binnenkomst geseed (geen mailbox in testomgeving, vooraf gemeld); accorderen klikkend: voorstel geaccepteerd, klant + gebouw + projectkans aangemaakt en gekoppeld |
| 2 | Opname | **doorlopen** | opname definitief op het gebouw, nummer uit de reeks |
| 3 | Calculatie | **doorlopen** | calculatie aan de opname, regel + totaal aanwezig |
| 4 | Offerte | **vastgelopen** | de knop "Maak offerte" verschijnt niet — zie breuk 1 hieronder |
| 5 | Akkoord | **vastgelopen (gevolgschade)** | zonder offerte geen ondertekening en geen opdracht met akkoordgrond A; het tekengat zelf (breuk 2) is een klassiek "schijnbaar gelukt" |

## Breuk 1 — offertelijst op de calculatiepagina filtert niet (NIEUW t.o.v. fase 1)

- **Waargenomen:** een kersverse calculatie toont in de kop "Offerte aangemaakt: #21 #20 #19 #18 #15 #14" — zes offertes die niets met deze calculatie te maken hebben. De procesbalk concludeert "er is al een offerte" en biedt "Aangeboden" aan in plaats van "Maak offerte". De nette route calculatie → offerte is daarmee onbereikbaar zodra er *ergens* in het systeem offertes bestaan (in fase 1 was de testdatabase leeg, toen lukte deze stap wél).
- **Technisch (contractgat aan béíde kanten):** de calculatiepagina roept `useListOffertes` aan met `{ calculatie_id: id }` als extra argument (`detail.tsx` r. 2298, via `as any`), maar de gegenereerde hook kent helemaal geen request-parameters — het argument wordt in JavaScript genegeerd en de request-URL is altijd kaal `/api/offertes`. Óók het servercontract mist het filter: het OpenAPI-schema heeft geen queryparameter en `GET /offertes` (`routes/offertes.ts` r. 395 e.v.) leest geen `req.query`. De `as any`-cast heeft dit gat voor de typechecker verborgen.
- **Wat er zou moeten gebeuren:** `calculatie_id`-queryparameter opnemen in het OpenAPI-schema, server-side filteren in de lijst-route, codegen draaien en de `as any`-aanroep vervangen door de getypte variant. **Automatisch te repareren** — codewijziging, geen mens nodig.

## Breuk 2 — portaal-ondertekenen "schijnbaar gelukt" (bekend uit fase 1, B1, nog aanwezig)

- **Wat wél wordt vastgelegd:** de klant opent het portaal (event `portaal_bekeken`), tekent op het canvas, vult zijn naam in en klikt "Definitief akkoord geven" — zonder foutmelding.
- **Wat uitblijft:** de POST `/portaal/:token/ondertekenen` vertrekt nooit; `portaal_status` blijft `bekeken`, er komt geen `ondertekend`-event, geen opdracht met akkoordgrond A. Oorzaak (code onveranderd geverifieerd, `portaal/index.tsx` r. 918): het handtekening-canvas rendert alleen bij de teken-stap; op de naam-stap is het ontkoppeld, waardoor `bevestigHandtekening()` stil retourneert.
- **Wat er zou moeten gebeuren:** handtekening-data vastleggen vóór de faseovergang (of canvas niet unmounten) + een zichtbare fout als versturen niet lukt. **Automatisch te repareren** — codewijziging, geen mens nodig.

## Meetscript-correctie (geen app-bevinding)

De fase-1-spec klikte "Maak offerte" direct; de procesbalk vereist eerst de bewuste stap **"Intern akkoord"** (concept → intern_akkoord). De hermeting-spec doet die stap nu klikkend. Dit was in run 1 van vandaag een vals "vastgelopen"; na correctie bleef de stap vastlopen om de échte reden (breuk 1).
