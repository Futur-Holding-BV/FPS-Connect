# ADMINISTRATIE_01 — antwoorden en getoetste aannames

Dit document groeit per fase mee. Metingen staan in `docs/metingen/ADMINISTRATIE_01-fase0.md`.

## Fase 1+2 (18 augustus 2026) — gebouwd

- **Rechtenkeuze René verwerkt**: bankrekening-mutaties (toevoegen/wijzigen/verwijderen) vereisen **Financieel & Facturatie niveau 4**; alle overige bedrijfsgegevens blijven bewerkbaar op Personeel niveau 2. Bewezen: zonder Financieel 4 geeft de API 403.
- **Eén scherm**: Bedrijfsgegevens en Werkmaatschappijen zijn samengevoegd op `/organisatie/werkmaatschappijen` (tab per BV, álle velden van beide schermen aanwezig). De oude route `/organisatie/bedrijfsgegevens` verwijst door, oude links blijven werken.
- **Bankrekeningen per werkmaatschappij**: IBAN + tenaamstelling + doelen (Ontvangst, Crediteuren, Loon, G-rekening — laatste optioneel). Meerdere doelen per rekening mogelijk. IBAN wordt genormaliseerd en mod-97-gecontroleerd (client én server); dubbele nummers binnen één BV geven 409.
- **`iban` op de werkgever is nu een afgeleid veld** (rekening met doel "Ontvangst" van diezelfde BV) en is uit de invoer-API gehaald — het kan niet meer via het gewone werkgever-bewerken worden gezet (bewezen: PATCH met iban wordt genegeerd). Documenten pakken dus nooit het nummer van een andere BV.
- **Ontbreken is zichtbaar, nooit stil**: het scherm wijst per BV in amber aan welk doel nog geen rekening heeft; factuur/documentvoorbeeld toont "⚠ geen ontvangstrekening ingesteld" in plaats van een demo-IBAN.
- **Wijzigingslog + mail**: elke mutatie schrijft een logregel (wie/wanneer/oud/nieuw) en stuurt via het bestaande mailShell/wachtrij-mechanisme een melding aan de actieve hoofdbeheerders; een mailfout blokkeert de mutatie nooit.
- **Loonherkenning** (SEPA-intake) matcht de werkgever voortaan op de rekening(en) met doel "Loon".
- **Review-hardening**: één rekening per doel per BV (database-afgedwongen); mutatie+auditlog in één transactie, mail ná commit; factuur-print bindt aan factuur→gebouw→werkgever (blokkeert zichtbaar zonder keten); magazijn-bestelbonnen op afgeleid ontvangst-IBAN.
- Bewijs: `scripts/src/verificatie-administratie01-fase12.ts` — 14/14 geslaagd, incl. doel-uniek- en cross-BV-toets ("andere WM pakt nooit dit nummer").
- Migratie `0079` neemt een bestaand `werkgevers.iban` over als rekening met doelen ontvangst/crediteuren/loon (in dev leeg; in prod draait dit via de migratierunner mee in de deploy).

## Fase 0 (18 augustus 2026) — afgerond, wacht op akkoord René

1. **Vier werkmaatschappijen, alle actief** (FPS Brandpreventie, FPS Bouw, FPS Bouw en Renovatie, FPS Onderhoud) — geen afwijking van de verwachting.
2. **Voorstel per gegevenssoort** (per-BV vs. bedrijfsbreed): zie de meting, §2.
3. **AccountView**: koppeling leeg, testmodus AAN, export uit, en er is (in dev aantoonbaar) nooit werkelijk geboekt. Niets omgezet.

### Getoetste aannames / afwijkingen om te melden vóór fase 1-2

- **Beide schermen zijn inderdaad één bron**: Bedrijfsgegevens én Werkmaatschappijen lezen en schrijven dezelfde `werkgevers`-tabel via dezelfde API. Er hoeft niets gemigreerd te worden; de samenvoeging is een scherm-samenvoeging. Velden die alleen op Bedrijfsgegevens staan (boekhouder, aanleveradres loonverwerking, intern aanspreekpunt) en velden die alleen op Werkmaatschappijen staan (CAO bewerken, personeelsbeleid, voettekst, actief) gaan allemaal mee.
- **Het IBAN-veld wordt op geen van beide schermen getoond of bewerkt** — het bestaat wel in de database/API. Het "bestaande nummer overnemen" (fase 2) betekent dus: de databasekolom per werkmaatschappij overnemen; in dev is die overal leeg, in prod te controleren na oplevering van het scherm.
- **Rechten nu**: bewerken van werkgevers loopt via Personeel niveau 2 (HRM-route), niet via een financieel recht. **Het hoogste financiële recht is module "Financieel & Facturatie" niveau 4 ("volledig beheer")** — hetzelfde recht als factuur-afkeuren en AccountView-export. Voorstel: alléén bankrekening-mutaties achter Financieel 4; de overige bedrijfsgegevens blijven op Personeel 2 (anders kan HRM geen adres meer bijwerken). Vraag ligt bij René.
- **"De bestaande faalmail"**: het enige bestaande faalmail-mechanisme is de AccountView-faalmail van INKOOP_BOEKING_01 (mailShell → hoofdbeheerders, via de mail-wachtrij). De bankrekening-wijzigingsmelding (fase 2.5) bouw ik op datzelfde mechanisme.
- **Leveranciersmodel als voorbeeld** (fase 2): klopt — `leveranciers` heeft al IBAN + tenaamstelling + aparte G-rekening; dat model wordt de basis voor de werkmaatschappij-rekeninglijst, uitgebreid met doelen en wijzigingslog.
- **Loonherkenning**: de SEPA-intake matcht de werkgever nu op het enkele `werkgevers.iban`-veld (sterkste check). Die gaat in fase 2 over op de rekening met doel "loon"; omdat elke werkmaatschappij een eigen nummer heeft, blijft de match eenduidig en valt er nooit terug op een nummer van een andere BV.
- **INKOOP_BOEKING_01 is al gebouwd** en gedraagt zich conform de nieuwe eis "niet automatisch boeken zolang de scheiding ontbreekt": de automaat staat achter `export_actief` (overal UIT). De werkmaatschappij↔administratie-controle komt er in fase 3 bij.
