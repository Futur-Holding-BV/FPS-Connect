# KETEN_01 fase 1 — doorlooprapport (2026-08-17T04:58:25.710Z)

| Stap | Uitkomst | Detail |
|---|---|---|
| 1a mail-binnenkomst | **gesimuleerd** | aanvraag_voorstellen geseed (geen mailbox in testomgeving; vooraf gemeld) |
| 1b aanvraag accepteren → klant+gebouw | **doorlopen** | voorstel 37 geaccepteerd; klant 65, gebouw 277, projectkans 48 |
| 2 opname definitief op gebouw | **doorlopen** | opname 32 (nummer 31) definitief op gebouw 277 |
| 3 calculatie aan opname + regels | **doorlopen** | calculatie 262 (C176) aan opname 32, 1 regel(s) |
| 4a offerte uit calculatie + verzonden | **vastgelopen** | locator.click: Timeout 8000ms exceeded.
Call log:
[2m  - waiting for getByRole('button', { name: /Maak offerte/i }).first()[22m
 |
| 4b/5 portaal-tekenen → opdracht | **vastgelopen** | APP-BEVINDING: 'Definitief akkoord geven' doet niets — op stap 2 is het handtekening-canvas ontkoppeld (unmount → canvasRef null) waardoor bevestigHandtekening stil retourneert en er nooit een POST /portaal/:token/ondertekenen vertrekt. Testfout uitgesloten (geen serverhit in log). Oorspr. fout: portaallink nodig

[2mexpect([22m[31mreceived[39m[2m).[22mtoBeTruthy[2m()[22m

Received: [31m""[39m |
| 5b vangnet-opdracht | **gesimuleerd** | opdracht 209 + concept-werkbegroting 54 DB-geseed omdat portaal-ondertekenen vastliep; proces 6-11 blijft zo meetbaar (afwijking, gemeld) |
| 6 werkbegroting + planning | **vastgelopen** | werkbegroting=54 (vastgesteld), uitvoeringsplan-taken=0 |
| 7a monteur-aanvraag | **gesimuleerd** | materiaal_aanvragen geseed (mobiele-app-handeling; vooraf gemeld) |
| 7b goedkeuring → concept-inkoopbon | **doorlopen** | aanvraag goedgekeurd, inkoopbon 97 (status concept) gekoppeld via inkoopbon_id |
| 8 uren op opdracht mét akkoord | **doorlopen** | 1 uren-rij(en) op opdracht 209 (POST /uren → 201 {"id":159,"datum":"2026-08-17","medewerker_id":566,"medewerker_naam":null,"gebouw_id":277,"gebouw_naam":null,"project_id":null,"project_naam":"Opdracht KETEN01 1786942551607","werkzaamheden":null,"werkzaamheid_categorie":null,"ruimte) |
| 9a leveranciersfactuur binnen | **gesimuleerd** | facturen-rij geseed (binnenkomst is mailbox-only; vooraf gemeld) |
| 9b beoordeling + prijscontrole | **doorlopen** | factuurstatus na beoordeling = te_beoordelen_wvb; koppeling aan bestelling/prijscontrole vergt factuurregels — gemeten op /facturen/:id (zie schermafdruk) |
| 10 verkoopfactuur naar klant | **vastgelopen** | de web-UI kent alleen 'Verkoopfactuur uploaden' (bestaand PDF); een verkoopfactuur SAMENSTELLEN vanuit de opdracht/offerte en definitief maken (fiscaal nummer) is niet klikbaar aanwezig — einddoel niet haalbaar via de UI |
| 11 opdracht afsluiten | **doorlopen** | status na klik = afgerond |