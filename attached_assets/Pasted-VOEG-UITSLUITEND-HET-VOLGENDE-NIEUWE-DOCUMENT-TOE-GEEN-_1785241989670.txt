VOEG UITSLUITEND HET VOLGENDE NIEUWE DOCUMENT TOE — GEEN ANDERE WIJZIGINGEN.

STAP 1 — Nieuw bestand
Maak docs/OMGEVINGSBEWUSTZIJN.md met exact de volgende inhoud:

---
# FPS Connect — Omgevingsbewustzijn bij elke opdracht

Verplicht referentiedocument, naast ontwikkelfilosofie.md en 
kwaliteitskader.md. Kernregel: er is GEEN rem tussen een merge in 
Replit en productie op kantoor. Elke opdracht die "klaar" wordt 
gemeld, staat binnen 10-15 minuten live voor echte gebruikers.

## De twee omgevingen (niet drie)

| Omgeving | Waar | Data |
|---|---|---|
| Replit dev/test | Replit zelf, incl. preview-URL | Replit PostgreSQL (test) |
| Productie | connect.fps-one.nl (VPS) | VPS PostgreSQL (echt) |

Er bestaat geen aparte staging-omgeving. "Preview" is geen derde 
omgeving — het is de Replit-testomgeving.

## Verplichte openingsregel bij elke opdracht aan de agent

Elke opdracht aan Replit begint met, en de agent bevestigt expliciet 
vóór start:
"Deze wijziging merget rechtstreeks door naar productie op kantoor 
zodra de taak is voltooid. Er is geen tweede kans vóór productie."

## Consequentie voor scope

- Geen taken die meerdere modules tegelijk raken — kleiner = kleiner 
  productierisico bij een fout.
- Elke taak moet vóór merge zijn Definition of Done (kwaliteitskader.md) 
  volledig doorlopen hebben — er is geen "we testen het straks in 
  preview", want er is geen "straks".
- executeSql { environment: "production" } in de agent raadpleegt de 
  Replit-database, NIET de VPS-database — expliciet vermelden welke 
  omgeving getest is bij twijfel over databronnen.
- Rollback-pad (deploy/ROLLBACK_PRODUCTION.md) wordt bij elke opdracht 
  met risico op databreuk vooraf genoemd, niet achteraf gezocht.

## Onafhankelijke verificatie ná merge

Zodra een taak als voltooid gemeld wordt: de daadwerkelijke commit 
op main wordt gecontroleerd tegen wat beweerd is (bestand + diff), 
vóór het als opgelost geldt — merge is geen bewijs, alleen een 
broncodecontrole is dat.
---

STAP 2 — Verwijzing toevoegen in replit.md
Voeg in replit.md, direct na de bestaande regels die verwijzen naar 
ontwikkelfilosofie.md en kwaliteitskader.md, een derde regel toe:

> **Omgevingsbewustzijn:** Zie [`docs/OMGEVINGSBEWUSTZIJN.md`](docs/OMGEVINGSBEWUSTZIJN.md) 
> — verplicht referentiedocument. Kernregel: geen rem tussen merge en 
> productie; elke opdracht vereist expliciete omgevingsbevestiging vooraf.

Geen andere regels in replit.md wijzigen.

ACCEPTATIE
- docs/OMGEVINGSBEWUSTZIJN.md bestaat met exact bovenstaande inhoud;
- replit.md bevat de nieuwe verwijzingsregel, verder ongewijzigd;
- geen enkel ander bestand is aangepast (dit is een documentatie-only 
  wijziging, geen functionele code).

LEVER
- bevestiging dat alleen deze twee bestanden zijn gewijzigd (diff);
- de commit-hash zodra dit via main naar productie is gedeployed.