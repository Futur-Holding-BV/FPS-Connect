Uitbreiding wagenparkbeheer / telefoon-app: Voertuigmeldingen

Bouw de kwartaalcontrole en schade-/storingsmeldingen op dezelfde mobiele module.

Doel:
Monteurs moeten via de telefoon-app eenvoudig voertuiggerelateerde meldingen kunnen doen, met foto’s, korte instructies en AI-controle.

Functionaliteit:
1. Kwartaalcontrole dashboardfoto
- Periodieke pushmelding per toegewezen voertuig.
- Week 1 vrijblijvend, daarna steeds urgenter.
- Instructie tonen vóór het maken van de foto.
- AI controleert of foto scherp, leesbaar en van juiste voertuig/dashboard is.
- AI leest kilometerstand en waarschuwingen indien mogelijk.

2. Schade melden
- Monteur kiest: schade melden.
- Foto’s maken van schade.
- Locatie op voertuig kiezen of beschrijven: voorzijde, achterzijde, links, rechts, interieur, laadruimte, ruit, band, velg.
- Korte omschrijving verplicht.
- Datum/tijd en gebruiker automatisch vastleggen.
- AI beoordeelt foto’s: schade zichtbaar, ernstindicatie, duplicaatcontrole t.o.v. bestaande schades.

3. Storing melden
- Monteur kiest: storing melden.
- Dashboardfoto of detailfoto maken.
- Type storing kiezen: motor, verlichting, banden, remmen, accu, ruit, airco, onderhoudsmelding, overige.
- Korte omschrijving verplicht.
- AI controleert waarschuwingslampjes/dashboardtekst waar mogelijk.

4. Afhandeling kantoor
- Meldingen komen binnen in wagenparkbeheer.
- Statussen: nieuw, in beoordeling, actie nodig, ingepland, opgelost, afgewezen/duplicaat.
- Mogelijkheid om melding toe te wijzen aan beheerder.
- Koppeling naar onderhoudsactie, schadeherstel, verzekeringsdossier of leasecontact.

5. Datamodel
- Eén centrale tabel/entiteit voor voertuigmeldingen.
- Type: kwartaalcontrole, schade, storing, onderhoud, overige.
- Koppeling met voertuig, gebruiker, foto’s, AI-resultaat, status, opvolgactie en auditlog.

6. Rechten
- Monteur mag melden voor toegewezen voertuig.
- Hoofdbeheerder/wagenparkbeheerder mag alle meldingen zien en afhandelen.
- Projectleiders alleen indien relevant.

7. Mobiele UX
- Korte flow: kiezen → instructie → foto → AI-check → omschrijving → verzenden.
- Niet te veel invulvelden.
- Offline concept opslaan als verbinding slecht is.
- Bij afkeuring foto direct opnieuw laten maken.

Belangrijk:
Geen aparte schade-app en geen aparte kwartaalcontrole-app bouwen. Eén generieke mobiele voertuigmeldingen-module die meerdere soorten meldingen ondersteunt.