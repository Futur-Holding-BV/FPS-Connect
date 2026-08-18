---
name: Offerte-status split geaccepteerd/ondertekend
description: Portaal en studio schrijven verschillende eindstatussen op offertes; afnemers moeten beide kennen.
---

Regel: bij een ondertekende offerte bestaan er TWEE schrijfpaden met verschillende status-waarden:
- Klantportaal: `status="geaccepteerd"` + `portaal_status="ondertekend"` (handtekening in `offerte_handtekeningen`).
- Studio (handmatig): `status="ondertekend"`.

**Why:** de opdracht-route keek alleen naar `status="ondertekend"` → een via het portaal getekende offerte gaf een opdracht zónder akkoordgrond A (gevonden in KETEN_01-hermeting, aug 2026). Gefixt door óók `portaal_status="ondertekend"` te erkennen; statussemantiek is bewust niet genormaliseerd (frontend leest op meerdere plekken `"geaccepteerd"`).

**How to apply:** elke nieuwe consument van "is deze offerte getekend?" moet beide vormen checken, of beter: `portaal_status="ondertekend"` gebruiken (enige pad dat een echte handtekening garandeert; alleen de publieke tekenroute schrijft die). Wil je ooit normaliseren: eerst alle `status === "geaccepteerd"`-reads in firevault migreren.

Bijvangst dezelfde meting:
- Portaalpagina crashte (RangeError, hele pagina op errorboundary) op `new Date(NaN).toISOString()` bij `geldigheid_dagen=null` — datumrekenwerk in portaal/print altijd guarden.
- e2e: `isVisible()` direct na `goto` is een race (false tijdens laden → stap stil overgeslagen); eerst `waitFor({state:"visible"})` op een testid. En `/Verzenden/.first()` matchte de status-doorzetknop i.p.v. de wizard-stap — knopteksten met nummer-prefix exact filteren.
