---
name: Dagelijkse CI-maildeduplicatie
description: Betrouwbare deduplicatie en autorisatie voor terugkerende Graph-waarschuwingen aan meerdere beheerders.
---

Een terugkerende waarschuwing aan meerdere ontvangers gebruikt een duurzame verzendstatus per waarschuwingsperiode én per ontvanger. Een globale claim of globale verzendtijd is onvoldoende: een gedeeltelijke transportfout kan anders reeds bereikte ontvangers opnieuw mailen.

**Why:** Microsoft Graph biedt voor deze verzending geen bruikbare idempotency-sleutel. Daarom is de bewuste garantie at-least-once bij een procescrash tussen externe aflevering en lokale bevestiging, maar zonder herhaling van al lokaal bevestigde ontvangers.

**How to apply:** Claim iedere ontvanger afzonderlijk met een lease die langer is dan één transportcall. Maak geslaagde ontvangers terminal, probeer alleen mislukte of verlopen claims opnieuw en herlees actiefstatus, hoofdbeheerdersrol en het actuele e-mailadres onmiddellijk vóór verzending.