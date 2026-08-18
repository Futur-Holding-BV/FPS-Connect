# Meting ADMINISTRATIE_02 — btw, ontvangstregistratie en betalingen (18 aug 2026)

## 1. Waar leefden btw-codes vóór deze opdracht?

Alle btw-velden waren **vrije tekst** zonder toets aan een schema:

| Plek | Veld | Gebruik |
|---|---|---|
| `facturen.btw_code` | tekst | wordt door AI-lezing gevuld en meegegeven aan AccountView-export |
| `factuur_regels.btw_code` | tekst | per regel, idem |
| `leveranciers.btw_code_default` | tekst | default die de categorisatie overneemt |
| `leverancier_categorisatie` (aangeleerde voorkeuren) | tekst | AI-voorstel op basis van historie |
| `eenheidsprijzen.btw_code` | tekst ("hoog"/"laag") | **calculatiedomein** — andere waardenset, bewust buiten deze opdracht gelaten |

Gevolg vóór de opdracht: een typefout ("HH", "21%", "hoog") kwam ongemerkt in de
AccountView-export terecht. Sinds deze opdracht bestaat `btw_codes` per BV
(migratie 0089) en weigert de boekingspoort codes buiten het schema (422); de
gebruiksmeting (`GET /btw-codes/gebruik`) wijst bestaande afwijkers aan.

## 2. Ontvangstregistratie (de derde weg)

- **Project-inkoopbonnen** (I-nummers, werkvoorbereiding): géén ontvangst-aantallen
  per regel. Alleen een grove bonstatus: concept → goedgekeurd → besteld → geleverd.
- **Magazijn-inkooporders**: hebben wél ontvangstregels, maar geen project- of
  factuurkoppeling — daarmee onbruikbaar voor de factuurcontrole.

Conclusie: een echte drie-weg-controle op aantallen kan pas als er
ontvangstregistratie per inkoopbonregel komt. Tot die tijd meldt de controle de
derde weg eerlijk als `geleverd_registratie: "ontbreekt"` en toont hij wel de
bonstatus. Voorstel voor de ontbrekende registratie staat in het antwoorddocument.

## 3. Betalingen (uitgangssituatie voor de betaalbatch)

- `facturen.betaalstatus` / `betaaldatum` / `betaald_op` bestonden al, maar
  werden alleen **handmatig** per factuur gezet.
- Er is geen bankafschrift-import (CAMT.053/MT940); loonstroom heeft alleen een
  pain.001-**parser** (inlezen), geen generator.
- Betaalkorting (bijv. 2% bij betaling binnen 8 dagen) ligt nergens vast — niet
  op de leverancier en niet op de factuur.
- Debiteurrekeningen: `werkgever_bankrekeningen` heeft per BV rekeningen met
  doelen; doel `crediteuren` is beschikbaar als bron voor de batch.
