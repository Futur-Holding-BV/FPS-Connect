---
name: Documentpijplijn lees_probleem & fail-closed leesbaarheid
description: Onleesbare documenten nooit stil laten mislukken; bruikbaarheidsdrempels en vision-paginaselectie
---

- `classificeerDocument` geeft `lees_probleem` (string|null) terug; onleesbaar (geen bruikbare tekst ≥40 tekens én geen gerenderde pagina's) → fail-closed "onbekend" ZONDER AI-aanroep, reden zichtbaar. Opgeslagen op inbox_items.lees_probleem (migratie 0062), doorgegeven in Slim Upload en hrm-ai-analyse.
- **Why:** eerder kregen scans zonder tekstlaag een verzonnen categorie of leeg resultaat; de beheerder eist zichtbare reden bij het document.
- **How to apply:** nieuwe consumenten van classificeerDocument moeten lees_probleem tonen/opslaan; "niet-leeg" is géén leesbaarheidsbewijs — gebruik een drempel.
- Vision: MAX_VISION_PAGINAS=10 en de LAATSTE pagina altijd meenemen (slotbepalingen/ondertekening). Tekst voor AI via `kortTekstInKopStaart` (kop+staart met marker), nooit `slice(0, N)`.
- Contract-analyse (`/medewerkers/:id/ai-contract-analyse`): per veld {waarde, vindplaats{pagina,citaat}}; backward-compat topvelden alleen vullen uit velden MÉT vindplaats (AI-waarde zonder citaat mag nooit stil een formulier invullen).
- Archive-scanner (7z): elke exec-fout zonder uitvoer, timeout of ontbrekende binary = kritieke geblokkeerde bevinding (fail-closed) — was eerder stil "schoon". Binary via SEVENZIP_PAD/PATH/nix-fallback, nooit hardcoded nix-pad.
- Prod-binaries in deploy/Dockerfile.api runtime-stage: poppler-utils, postgresql-client-16 (PGDG-repo), chromium+fonts, p7zip-full. Backup (pg_dump) draait ín de api-container.
