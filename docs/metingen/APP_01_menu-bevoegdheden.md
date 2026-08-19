# Meting APP_01 — welke bevoegdheid eist elke backendroute achter het app-menu?

Datum meting: 19 augustus 2026 (broncode api-server + ingelogde profielproef).

| Menu-item (Expo) | Backendroute(s) | Gemeten eis | Menu/guard |
|---|---|---|---|
| Mijn werkdag | /werkdag… | alleen ingelogd | basis |
| Gebouwen | GET /gebouwen | `gebouwen:1` | gebouwen:1 |
| Verlof | /mijn/verlof… | alleen ingelogd | basis |
| Uren | /uren/mijn-week e.d. | alleen ingelogd | basis |
| Declaraties | /mijn/declaraties e.d. | alleen ingelogd + eigen medewerker server-side | basis |
| Loonstrookjes | /mijn/salarisdocumenten | alleen ingelogd + eigen medewerker server-side | basis |
| Certificaten | /mijn/certificaten | alleen ingelogd + eigen medewerker server-side | basis |
| Opleidingen (eigen) | /mijn/opleidingen | alleen ingelogd + eigen medewerker server-side | basis |
| Opleidingen (catalogus) | /opleidingen | `personeel:1` | alleen zichtbaar/opgevraagd met personeel:1 |
| Routeplanner | GET /mijn-werk | alleen ingelogd (`requireAuth`) | basis |
| Veiligheid (hub, toolboxen, LMRA, incidenten, PBM) | /toolbox…, /veiligheid… | `toolbox:1` (leesroutes) | toolbox:1 |
| Werkbak | /werkbak/… | alleen ingelogd (persoonlijk) | basis |
| Personeel / Mijn gegevens | /hrm/stats = `personeel:1`; /mijn/… = ingelogd | gesplitst | label + adaptief scherm |
| Berichten | /chat/… | alleen ingelogd | basis |
| Opname | /opname… | alleen ingelogd | basis (afwijking gemeld) |
| Documenten | GET /documenten | `bibliotheek:1` | bibliotheek:1 (afwijking: opdracht zei `dossiers`) |
| Magazijn scan / Artikelen / Picklijsten | /magazijn/… lezen | `magazijn:1` | magazijn:1 |
| Inkoop aanvragen | POST bestelbon | `magazijn:3` (`aanmaken`) | magazijn:3 |
| Inkooporders | GET /inkooporders(+/:id) | was `magazijn:1`; verhoogd naar `magazijn:2` | magazijn:2 (end-to-end gelijk) |
| Voertuig melden | POST /meldingen (wagenpark) | alleen ingelogd | basis (afwijking gemeld) |

## Functiefilter telefoonmenu

- Kantoor en hoofdbeheerder: de zes persoonlijke ingangen staan in de radiale
  ring; verdere ingangen volgen de modulebevoegdheden.
- Uitvoerend veld: het bestaande werkmenu blijft de radiale ring; persoonlijke
  ingangen die niet in de zes ringposities passen staan onder **Meer**.
- **Mijn werkdag**, **Mijn werk**, **Routeplanner** en **Opname** worden niet als
  veldingang aan kantoor aangeboden.
- De app gebruikt de servervlag `is_uitvoerend_veld`; rechten blijven uitsluitend
  een zichtbaarheidsfilter en vervangen geen serverautorisatie.

## Declaraties (basisrecht-wijziging)
Voor: `GET /mijn/declaraties`, `POST /declaraties`, `GET/PATCH/DELETE /declaraties/:id`,
`POST /declaraties/:id/indienen`, `GET /declaratiebeleid` eisten `declaraties:1/2`.
Na: alleen ingelogd + geen klant (`eigenGegevens`), eigendom per handler afgedwongen.
Onveranderd: `GET /declaraties` (alle) = `declaraties:1` + niveau-3-splitsing in de
handler; beoordelen = niveau 3; verwerken/beleid-schrijven = niveau 4.

## PWA-chips (bevoegdheid per dashboardweergave)
operationeel = iedereen met kiezer · spots = gebouwen · projecten = offertes ·
facturen + financieel = financieel · hrm = personeel · bugreports = systeem ·
kwartaal + maand = rapportages. Primair op mobiel: operationeel, spots, projecten;
rest achter één "Meer"-dropdown.

## Bewijsrun (8 aug 2026)
`pnpm --filter @workspace/scripts exec tsx src/bewijs-app01-bevoegdheden.ts`
→ 10/10 checks groen. e2e-menu 1 passed · e2e-web 39 passed, 2 skipped.
