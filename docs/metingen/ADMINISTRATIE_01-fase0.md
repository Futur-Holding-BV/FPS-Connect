# ADMINISTRATIE_01 — Fase 0: metingen (18 augustus 2026)

Alle metingen read-only uitgevoerd; er is niets omgezet en niets gebouwd.

## 1. Werkmaatschappijen in Connect

Ontwikkelomgeving, tabel `werkgevers`:

| id | Naam | Actief | IBAN-veld |
|----|------|--------|-----------|
| 5 | FPS Brandpreventie | ja | leeg |
| 6 | FPS Bouw | ja | leeg |
| 7 | FPS Bouw en Renovatie | ja | leeg |
| 8 | FPS Onderhoud | ja | leeg |

**Vier werkmaatschappijen, alle vier actief — komt overeen met de verwachting.** Het bestaande IBAN-veld is in de ontwikkelomgeving overal leeg; de productie-database is voor mij niet direct benaderbaar (geen SSH), dus de prod-waarden zijn te controleren via het scherm Werkmaatschappijen zodra fase 1/2 staat.

## 2. Wat hoort bij één werkmaatschappij, wat is bedrijfsbreed? (voorstel)

Huidige stand in de code staat per regel tussen haakjes.

| Soort | Voorstel | Waarom (één zin) |
|-------|----------|-------------------|
| Facturen | **Per werkmaatschappij** | Een factuur hoort in precies één AccountView-administratie; nu is er alleen een los tekstveld `tenaamstelling_bv`, geen echte koppeling — dit is de kern van fase 3. |
| Algemene inkoop | **Per werkmaatschappij** | De betalende BV bepaalt in welke administratie de kosten geboekt worden; nu is er géén veld — de gekoppelde inkoopfactuur moet de BV van de inkoop erven. |
| Opdrachten | **Per werkmaatschappij, afgeleid** | De opdracht bepaalt wie factureert; dat is nu al indirect afleidbaar via gebouw→werkgever, dus afleiden in plaats van dubbel vastleggen. |
| Offertes/projecten | **Per werkmaatschappij, afgeleid** | Zelfde lijn als opdrachten (offerte-sjablonen en projecten dragen al een werkmaatschappij-tekst; gebouw→werkgever bestaat). |
| Uren | **Bedrijfsbreed, BV via medewerker** | Loonkosten volgen de werkgever van de medewerker (`medewerkers.werkgever_id` bestaat en werkt); een eigen BV-veld op elke urenregel zou dubbel en foutgevoelig zijn. |
| Declaraties | **Bedrijfsbreed, BV via medewerker** | Zelfde reden als uren; de declaratie-API leest de werkmaatschappij van de medewerker al mee. |
| Magazijn | **Bedrijfsbreed** | Eén fysiek magazijn voor de hele groep; de kostentoewijzing aan een BV gebeurt pas op het moment van inkoop/factuur, niet op de voorraadrij. |
| Leveranciers | **Bedrijfsbreed** | Dezelfde leverancier levert aan meerdere BV's; de factuur (niet de leverancier) draagt de administratie. |
| Gereedschap | **Bedrijfsbreed** | Gereedschap volgt medewerkers en projecten door de hele groep; eigendom per BV is een boekhoudkundig gegeven dat desgewenst later als apart veld kan. |
| CRM | **Bedrijfsbreed, met voorkeur-BV per relatie** | Een relatie kan met meerdere BV's zakendoen; het bestaande veld `voorkeur_fps_bedrijf` op de klant dekt de voorkeurskeuze al. |

## 3. AccountView-instellingen en boekhistorie

Ontwikkelomgeving (`accountview_instellingen`, id=1):
- API-endpoint, administratiecode, API-gebruiker, API-sleutel: **allemaal leeg**
- **Testmodus: AAN** · `export_actief`: **UIT** · `magazijn_export_actief`: UIT
- Dagboeken: INK / VRK · Standaard grootboek: leeg

Boekhistorie (dev): **0 exportlogs, 0 echte (niet-test) boekingen, 0 facturen met AccountView-status geslaagd.** Er is in de ontwikkelomgeving dus nooit werkelijk geboekt. Productie kan ik niet direct meten; de exportlog-pagina in Connect (Facturen → export-logs) toont het definitieve antwoord voor prod.

## 4. Relatie met het al gebouwde INKOOP_BOEKING_01 (= fase 4)

Eerder vandaag is de directe-betaald-factuurroute + automatische boeking al gebouwd (commit `3851d7c8`, draait in prod). Belangrijk in het licht van "niets automatisch boeken zolang de BV-scheiding ontbreekt":
- De automatische boeking staat volledig **uit** (achter `export_actief`, dat overal op UIT staat) — er kán nu niets automatisch geboekt worden.
- In fase 3 wordt daar de harde werkmaatschappij↔administratie-controle aan toegevoegd (eis 3.6/4.4); tot die tijd blijft `export_actief` uit staan.
