---
name: Module-gating opname/projecten/workflow
description: Autorisatiebesluit voor deze routegroepen — waarom er geen eigen modules zijn en welke conventies gelden.
---

**Regel:** er bestaat géén aparte module "projecten", "opnames" of "workflow"; deze routegroepen worden gegate op bestaande modules (gebouwen/crm voor projecten, voorzieningen voor opname-schrijfacties, organisatie voor workflow).

**Why:** de Monteur-preset heeft gebouwen:1 + voorzieningen:3 en verwijdert opname-items/foto's in de veldflow; sub-resource deletes op niveau 4 zouden monteurs breken. Conventie (uit voorzieningen.ts): sub-resource delete = 2–3, hele entiteit verwijderen = 4. CRM-schermen lezen de projectlijst, dus projecten-lezen accepteert óók crm:1.

**How to apply:** nieuwe routes in deze groepen dezelfde gating geven; nooit een nieuwe module hiervoor introduceren. Alle autorisatie-middleware moet `req.permissies` (effectieve, impersonatie-bewuste identiteit via "Bekijken als") honoreren — een variant die terugvalt op de echte sessiegebruiker laat hoofdbeheerder-impersonatie ten onrechte door.
