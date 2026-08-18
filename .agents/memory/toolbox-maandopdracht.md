---
name: Maandtoolbox-popup & bouw-functie-scope
description: Verplichte maandtoolbox in de monteur-app — wie 'm krijgt, hoe afronden de opdracht voltooit, en e2e-lessen.
---
# Maandtoolbox (taak-context aug 2026)

- Verplichte maandtoolbox geldt ALLEEN voor bouw-functies (`BOUW_FUNCTIES` in veiligheid.ts: Monteur, Onderhoudsmonteur, Timmerman, Uitvoerder, Werkvoorbereider, Projectleider — besluit René 18-08-2026). `GET /mijn/toolbox-maandopdracht` geeft anders `null`.
- **Why:** kantoorpersoneel kreeg een blokkerende popup zonder toolbox-recht → deadlock.
- Popup ("Toolbox nu doen") opent de detailflow direct in `ToolboxDetailModal` bóven de popup; in `_layout.tsx` moet de `doetToolbox`-branch vóór de voltooid-check staan, anders unmount een refetch de modal midden in het succes-scherm.
- Detail/afronden zonder toolbox-modulerecht mag alleen via `lezenVeiligheidOfMaandtoolbox` én alleen voor bouwgebruikers (review-eis: anders broken access control).
- Afronden voltooit de maandopdracht via atomaire upsert; unieke index `toolbox_maand_status(opdracht_id, gebruiker_id)` (migratie 0086), `voltooid_op` alleen zetten als nog NULL.
- E2e-les: RN-web heeft meerdere "Sluiten"-teksten (radiaalmenu!); klik altijd binnen `getByRole("dialog").filter({ hasText: ... })`, anders hangt Playwright eeuwig op "subtree intercepts pointer events".
- E2e-runs >5 min nooit via ShellExec (5-min kill); draai via de e2e-workflow en tail het /tmp/logs-bestand.
