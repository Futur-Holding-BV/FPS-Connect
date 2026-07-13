---
name: CRM-module herontwikkeling (relatienetwerk, taken, AI-voorstellen)
description: Architectuur en conventies van de heropgebouwde CRM-module — entiteiten, AI-goedkeuringspatroon, menu-consolidatie.
---

# CRM-module herontwikkeling

Vier werkstromen, alle additief op de bestaande CRM-datamodellen (crm_organisatie/crm_contactpersoon/crm_projectkans blijven bron van waarheid; NIET herbouwen).

## Relatienetwerk
- `crm-relatienetwerk.tsx` = SVG node-edge graaf; vervangt de oude gegroepeerde-lijst `RelatieKaart` in `crm/detail.tsx`.
- Organisatie = centrale node; contactpersonen radiaal. Kleur per beslisrol, lijndikte/streepjes per relatiesterkte.

## Taken (crm_taken)
- Eigen entiteit met polymorfe koppeling: koppeling_type ∈ crm_organisatie/crm_contactpersoon/crm_projectkans + koppeling_id; route joint koppeling_naam + toegewezen/aangemaakt-door namen erbij.
- Status open/bezig/afgerond/geannuleerd; prioriteit laag/normaal/hoog/urgent. Toewijzing via `useListToewijsbareGebruikers` (NIET /gebruikers).

## AI-relatievoorstellen (crm_relatievoorstellen)
- **Kernregel: AI stelt voor, mens keurt goed. Accepteer-endpoint maakt PAS bij goedkeuring een echte crm_contactpersoon.** AI creëert nooit zelf.
- Genereren per organisatie via aiGateway.responses met web_search_preview + chat-fallback; heeftGateway()→503 als geen gateway.
- voorgesteldeData = JSON blob (bv. {linkedin_url}); status open/geaccepteerd/afgewezen.

## Menu-consolidatie
- **Alle CRM zit onder één centraal "CRM"-sidebar-item** (`beheerder-layout.tsx`, gated op `toonCrm`/`heeftNiveau("crm",1)`), linkt naar /crm dashboard-hub.
- De losse items (Projectkansen/Klanten/Organisaties/Concurrenten/Marktinzicht/Kennisbibliotheek/Taken/Relatievoorstellen) zijn nav-kaarten op `crm/index.tsx`, niet in de sidebar.
- Bij toekomstige CRM-subpagina's: route in App.tsx VÓÓR de /crm/:id catch-all, nav-kaart in index.tsx, GEEN nieuw sidebar-item.

## Autorisatie
- lezen = requireBevoegdheid("crm",1), schrijven = ("crm",2). invalideerContext("klant",id) bij contact-create vanuit voorstel-acceptatie.
