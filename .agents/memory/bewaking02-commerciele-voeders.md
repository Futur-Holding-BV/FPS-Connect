---
name: BEWAKING_02 commerciële voeders
description: Zes bewakingsloop-voeders op offerte/opname/calculatie/opdracht — momentbronnen en open-set-regels.
---
- Verzend-/bekekenmoment van offertes staat NIET in workflow_transitie_log maar in `offerte_tracking` (event `bezorgd` bij elke verzending, `portaal_bekeken` bij elk portaalbezoek). Voor "geen reactie" geldt max(bezorgd) (herbezorging reset), voor "bekeken niet getekend" min(portaal_bekeken) — max zou door herhaalbezoek eindeloos uitstellen.
- De verzendflow wijzigt `offertes.portaal_status`, niet `offertes.status` (die blijft concept en wordt pas `geaccepteerd` bij ondertekenen). Commerciële toestandslogica altijd op portaal_status keyen.
- **Why:** architect-review wees uit dat max(bekeken) + status-keying gemiste/uitgestelde signalen geeft; het meetinstrument bewaking02 meet sinds 11-08-2026 zelf ook op portaal_status + offerte_tracking.
- **How to apply:** nieuwe offerte-signalering of metingen → portaal_status + offerte_tracking gebruiken; open-sets voor opnames alleen op status definitief; calculatie-signalen dekken beide tabellen (mod_calc_headers + legacy calculaties, legacy kan géén offerte-koppeling krijgen).
- Drempels in app_instellingen (migratie 0048_bewaking02-drempels): offerte_reactie 7d, offerte_bekeken 5d, opname_calculatie 14d — conservatieve startstanden, prod-keten was leeg bij fase 0 (11-08-2026).
