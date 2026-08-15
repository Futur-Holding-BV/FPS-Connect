# KETEN_01 fase 1 — doorlooprapport (2026-08-15T05:02:38.218Z)

| Stap | Uitkomst | Detail |
|---|---|---|
| 1a mail-binnenkomst | **gesimuleerd** | aanvraag_voorstellen geseed (geen mailbox in testomgeving; vooraf gemeld) |
| 1b aanvraag accepteren → klant+gebouw | **doorlopen** | voorstel 27 geaccepteerd; klant 45, gebouw 247, projectkans 38 |
| 2 opname definitief op gebouw | **doorlopen** | opname 22 (nummer 21) definitief op gebouw 247 |
| 3 calculatie aan opname + regels | **doorlopen** | calculatie 232 (C146) aan opname 22, 1 regel(s) |
| 4a offerte uit calculatie + verzonden | **doorlopen** | offerte 73, portaal_status=verzonden, bezorgd-event vastgelegd, geldige portaallink |
| 4b/5 portaal-tekenen → opdracht | **vastgelopen** | APP-BEVINDING: 'Definitief akkoord geven' doet niets — op stap 2 is het handtekening-canvas ontkoppeld (unmount → canvasRef null) waardoor bevestigHandtekening stil retourneert en er nooit een POST /portaal/:token/ondertekenen vertrekt. Testfout uitgesloten (geen serverhit in log). Oorspr. fout: locator.click: Timeout 10000ms exceeded.
Call log:
[2m  - waiting for getByRole('button', { name: /Accepteren/ }).first |
| 5b vangnet-opdracht | **gesimuleerd** | opdracht 117 + concept-werkbegroting 34 DB-geseed omdat portaal-ondertekenen vastliep; proces 6-11 blijft zo meetbaar (afwijking, gemeld) |
| 6 werkbegroting + planning | **doorlopen** | werkbegroting 34 vastgesteld; AI-uitvoeringsplanning met 3 taak/taken. NB: losse planning-items lopen via de aparte Planning-module (niet op de opdrachtpagina). |
| 7a monteur-aanvraag | **gesimuleerd** | materiaal_aanvragen geseed (mobiele-app-handeling; vooraf gemeld) |
| 7b goedkeuring → concept-inkoopbon | **doorlopen** | aanvraag goedgekeurd, inkoopbon 47 (status concept) gekoppeld via inkoopbon_id |
| 8 uren op opdracht mét akkoord | **doorlopen** | 1 uren-rij(en) op opdracht 117 (POST /uren → 201 {"id":139,"datum":"2026-08-15","medewerker_id":473,"medewerker_naam":null,"gebouw_id":247,"gebouw_naam":null,"project_id":null,"project_naam":"Opdracht KETEN01 1786770055555","werkzaamheden":null,"werkzaamheid_categorie":null,"ruimte) |
| 9a leveranciersfactuur binnen | **gesimuleerd** | facturen-rij geseed (binnenkomst is mailbox-only; vooraf gemeld) |
| 9b beoordeling + prijscontrole | **doorlopen** | factuurstatus na beoordeling = te_beoordelen_wvb; koppeling aan bestelling/prijscontrole vergt factuurregels — gemeten op /facturen/:id (zie schermafdruk) |
| 10 verkoopfactuur naar klant | **vastgelopen** | de web-UI kent alleen 'Verkoopfactuur uploaden' (bestaand PDF); een verkoopfactuur SAMENSTELLEN vanuit de opdracht/offerte en definitief maken (fiscaal nummer) is niet klikbaar aanwezig — einddoel niet haalbaar via de UI |
| 11 opdracht afsluiten | **vastgelopen** | geen klikbare statusknop 'Afronden/Afsluiten' op de opdrachtpagina; de API kent PATCH status=afgerond maar de UI biedt hem niet aan — einddoel niet haalbaar via de UI |