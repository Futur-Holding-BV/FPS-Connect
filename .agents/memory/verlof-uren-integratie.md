---
name: Verlof/uren-integratie
description: Leidinggevende-routing, bezetting-drempel en tijd-voor-tijd-vanuit-uren patroon in de HRM-verlofmodule.
---

- Leidinggevende-routing: `medewerkers.leidinggevende_id` (self-exclusie in UI) stuurt verlof-goedkeuring; hoofdbeheerder blijft altijd fallback/override — dit is geen vervanging van rol-gebaseerde bevoegdheid, alleen routing.
- Bezetting-drempel: `functies.minimale_bezetting` wordt alleen gecontroleerd bij het *goedkeuren* van een verlofaanvraag (niet bij aanvragen zelf); blokkeert met 422 tenzij `negeer_bezetting: true` wordt meegestuurd, en dat mag alleen bij `personeel`-schrijfrecht (2).
- Tijd-voor-tijd vanuit uren (`POST /uren/tijd-voor-tijd-aanvraag`) zoekt de eerste actieve verlofsoort met `is_tijd_voor_tijd=true` (voorkeur op werkgever-match); als die ontbreekt geeft de route bewust een 409 met instructie naar een beheerder — geen auto-aanmaak van de verlofsoort zelf.
- **Val: handmatig samengestelde JSON-responses die een OpenAPI-schema volgen, missen makkelijk een required veld zonder dat typecheck het vangt** (schema is losgekoppeld TS-type, geen runtime-validatie op eigen route-responses). Voorbeeld: `verlofVoorWeek()` in `uren.ts` bouwde de `VerlofInWeek`-rijen handmatig en vergat `status` mee te geven (frontend rendert dan een lege/undefined status-cel) — pas ontdekt via een handmatige curl-round-trip, niet via `pnpm run typecheck`. Bij nieuwe handmatig-gemapte API-responses: de OpenAPI/Zod-schemadefinitie naast de mapping-code leggen en veld voor veld aftikken, niet vertrouwen op TS-inference alleen.
