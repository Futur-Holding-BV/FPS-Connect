---
name: Arbeidscontract-extractie
description: Gerichte AI-contractextractie met vindplaats-plicht, overname naar arbeidsovereenkomsten en slim-upload medewerker-voorstel
---

# Arbeidscontract-extractie (aug 2026)

- Gedeelde service `contractExtractie.ts` (api-server/services): 18 velden elk `{waarde, vindplaats{pagina,citaat}}`; **fail-closed: waarde zonder vindplaats → null** (strenger dan de oude analyse-route die de waarde liet staan). Nooit terugversoepelen.
- `POST /medewerkers/:id/contract-overnemen` = enige weg van AI-voorstel → `arbeidsovereenkomsten`-rij; altijd expliciete gebruikershandeling, roept `voerContractBewakingUit()` bij einddatum zodat 120/…/30-dagen-signaleringen direct aanslaan.
- Contract-overname moet één bestaand contract idempotent verrijken en fail-closed stoppen bij ambiguïteit of een andere bronkoppeling; ontbrekende AI-waarden mogen bestaande voorwaarden nooit wissen.
- **Why:** contractbewaking werkt alleen als einddatum+contracttype in `arbeidsovereenkomsten` landen; samenvatten alleen liet dat gat open.
- `proeftijdNaarDagen()` en de medewerker-naam-match (`zoekMedewerkerOpNaam`, exact → unieke deelmatch, twijfel=null) zijn deterministisch — geen AI voor deze beslissingen.
- Slim upload: subtype `arbeidscontract` (prompt + deterministisch vangnet in documentIntelligence) voedt `medewerker_voorstel`/`document_type_voorstel`; frontend selecteert vóór met amber AI-voorstel-melding (kleurconventie).
- Contractvelden uitgebreid (migratie 0066, additief): salaris_eenheid, uren_min/max, opzeg-/aanzegtermijn, reiskosten, concurrentie-/relatiebeding — ook in contract-bewaking GET/POST/PATCH.
