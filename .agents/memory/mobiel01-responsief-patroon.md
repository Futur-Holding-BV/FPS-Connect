---
name: MOBIEL_01 responsief patroon
description: Akkoord-patroon voor telefoonweergave (402px) van kantoor/commercie-schermen — onderbalk-ruimte, FAB-gedrag, tabelpatroon.
---
Patroon (René akkoord, aug 2026), toepassen bij uitrol naar overige kantoorschermen:
1. **Onderbalk-ruimte**: pagina-onderruimte = `calc(var(--bottom-bar-hoogte, 56px) + marge)`. De hook `use-bottom-bar-height` meet `[data-bottom-bar]`-elementen live; de NieuwsTicker heeft `env(safe-area-inset-bottom)` + `box-sizing: content-box`, dus de var bevat safe-area al — **nooit** nogmaals `env()` optellen (dubbeltelling, review-afwijzing).
2. **FAB (ondersteuning-widget)**: schuift tijdens scrollen opzij (`translate-x` + `pointer-events-none`, terug na ~650ms idle); in rust op telefoon half tegen de rand getukt (`max-md:translate-x-9 opacity-60`); bottom volgt `--bottom-bar-hoogte`.
3. **Tabelpatroon**: één echte `<Table>` voor alle breedtes; essentiële kolommen altijd, overige `hidden sm|md|lg:table-cell`; op telefoon stapelen de verborgen gegevens ónder de naam in de eerste cel, waarbij elke stapelregel exact verdwijnt op het breakpoint waar zijn kolom verschijnt (anders gat, bv. contact tussen md–lg). Naamcel = echte `<Link>` (focusbaar/toetsenbord) + rij-onClick als groot tikdoel.

**Testvalkuil**: de Replit dev-banner duwt `#root` (h-dvh) 71px omlaag → fixed onderbalk lijkt content af te dekken in headless screenshots. Vóór meten: banner verwijderen + `window.scrollTo(0, rootTop)`; anders vals-negatieve "vrije ruimte".
