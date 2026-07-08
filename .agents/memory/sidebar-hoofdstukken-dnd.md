---
name: Sidebar hoofdstukken drag-and-drop
description: Herschikbare sidebar-hoofdstukken (admin) — patroon voor stabiele sleutels, localStorage-persistentie en rechtenonafhankelijkheid
---

Admin-sidebar hoofdstukken (Projectaanpak, Inkoop, Magazijn, ...) zijn muis-drag-and-drop herschikbaar (desktop only), gebouwd met native HTML5 DnD — geen library nodig voor dit desktop-only geval.

- `hooks/use-sidebar-hoofdstukken.ts` — stabiele hoofdstuk-sleutels (bijv. `"inkoop"`) ontkoppeld van weergavevolgorde; twee `useVoorkeur`-instanties (volgorde-array + open/dicht-map) zodat toevoegen/verwijderen van hoofdstukken de opgeslagen data niet corrumpeert.
- `components/ui/herschikbaar-hoofdstuk.tsx` — generieke wrapper, herbruikbaar voor andere herschikbare lijsten; `dataTransfer`-sleutel + CSS `order` voor positionering, grijpstrip verdwijnt in icon-only sidebar-modus.
- Rechtenfiltering (`heeftNiveau`) MOET volledig los blijven van de opgeslagen volgorde/open-status — verborgen hoofdstukken blijven verborgen ongeacht localStorage-inhoud (filter toepassen vóór/na volgorde-render, niet erin verweven).

**Why:** eerdere sidebar-features (nav "In uitvoering"-badge, matrix-herschrijving) zijn per ongeluk stilgevallen bij refactors — een generieke, losstaande bouwsteen + hook maakt hergebruik voor toekomstige herschikbare lijsten (bijv. dashboard-widgets) makkelijker zonder opnieuw uit te vinden.

**How to apply:** bij een volgende "laat de gebruiker X herschikken"-taak, hergebruik `herschikbaar-hoofdstuk.tsx` als patroon (niet per se hetzelfde component) en volg hetzelfde `use-voorkeur`-gebaseerde persistentiepatroon i.p.v. een nieuwe library te introduceren.
