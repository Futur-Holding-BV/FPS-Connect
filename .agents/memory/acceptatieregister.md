---
name: Acceptatieregister (REGISTER_01)
description: Register per acceptatiepunt met vier standen; oplevering en statusrapport lopen erdoorheen.
---

# Acceptatieregister

- Tabel `acceptatie_register`: één regel per (opdracht_code, punt_nummer); vier standen: `gehaald`, `niet_gebouwd`, `onbewezen` (gebouwd maar bewijs ontbreekt), `wacht_op_rene`. Standen zijn fail-closed: alleen `gehaald` bij aantoonbaar bewijs.
- **Oplevering van een opdracht loopt door het register**: bij elke oplevering standen + bewijs_vindplaats bijwerken, dan `scripts/src/oplever-check.ts <CODE>` draaien (faalt op open punten of niet-vandaag-bijgewerkte regels). De kwaliteitscheck eist dat opdrachtcodes in de nieuwste changelog-sectie diezelfde dag bijgewerkte registerregels hebben (lokaal, met DB; CI heeft geen DB).
- **Statusrapport wordt gegenereerd**, niet geschreven: `scripts/src/genereer-statusrapport.ts` → `docs/status/STATUS_<datum>.md`. Nooit meer handmatig statusrapporten opstellen.
- Vulling uit Acceptatie-paragrafen via `vul-acceptatieregister.ts` (herdraaibaar; bewaart stand/bewijs). Opdrachten die alleen via chat binnenkomen handmatig als registerregels toevoegen — anders blokkeert de kwaliteitscheck op de changelog-code.
- Invarianten zitten in DB (CHECK op stand) én API (strikte PATCH: geen lege body, "gehaald" eist bewijs-vindplaats); oplever-check faalt zodra één regel niet op de opleverdag is herbeoordeeld.
- **Why:** vinkje-per-opdracht was te grof; René wil per punt zien wat echt bewezen is, en oplevering zonder herbeoordeling mag niet kunnen.
- Les: migratiemap is `lib/db/src/migrations/` (niet `lib/db/migrations/`).
