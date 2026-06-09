---
name: Plattegrond-logo verslepen/schalen
description: Beheerder kan het FPS-logo op de plattegrondtekening verslepen en schalen; positie/grootte per verdieping opgeslagen.
---

## Datamodel
- `verdiepingen` tabel: `logo_x`, `logo_y`, `logo_breedte` (real, nullable). Null = val terug op standaard rechtsboven (`x = W - b - pad`, `y = pad`, `b = max(W,H)*0.16`, `pad = max(W,H)*0.02`).
- Coördinaten in **beeldcoördinaten** (0..W, 0..H binnen de SVG `<g transform=translate/scale>`), niet schermpixels.
- Hoogte volgt vaste verhouding: `logoH = breedte / 2.59`.
- PATCH `/verdiepingen/:id` is partial: alleen velden met `!== undefined` worden geschreven (zo blijven naam/niveau intact bij een logo-only update).

## Frontend (plattegrond.tsx) — alleen beheerder/hoofdbeheerder, desktop
- `logoBox = {x,y,b}` lokale state; `logoBoxRef` spiegelt het voor de mouse-up save (tegen stale closure).
- `logoSleep` discriminated union `{modus:"verplaats", offsetX, offsetY}` | `{modus:"schaal", ankerX, ankerY}`.
- Slepen/schalen via **window** `mousemove`/`mouseup`-listeners in een effect dat alleen actief is tijdens `logoSleep` (cleanup verwijdert ze). Niet de SVG-handlers (die doen pannen).
- Client→beeld conversie: `(clientX - rect.left - view.x) / view.zoom`.
- Init-effect zet `logoBox` uit verdieping/standaard; **skipt als `logoSleep != null`** zodat een refetch het niet tijdens slepen overschrijft.
- Clamp bij verplaatsen: `x∈[0, W-b]`, `y∈[0, H-h]`. Clamp bij schalen: `min(maxB, W-ankerX, (H-ankerY)*2.59)` met `minB = max(W,H)*0.05`, `maxB = max(W,H)*0.6`.
- `startLogoVerplaats` en `startLogoSchaal` beide gated op `!plaatsenModus && !tekenModus && !verplaatsModus` zodat logo-interactie niet botst met spot-plaatsen/tekenen.
- Render: `<image>` met selectiekader-`<rect>` (merkkleur #F23B0D) + resize-handle rechtsonder; strokeWidth/dash gedeeld door `view.zoom` zodat ze constant ogen bij zoom.
- Save: `updateVerdieping.mutate` op mouse-up, daarna `invalidateQueries(getGetVerdiepingQueryKey)`.

## Niet gedaan / bewust
- Logo wordt **niet** in print/hero overlay getoond (die renders hadden geen logo op de plattegrond; buiten scope).
- Niet-beheerders zien het logo read-only (`pointerEvents:none`, geen kader/handle).
