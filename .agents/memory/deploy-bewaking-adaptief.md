---
name: Deploybewaking adaptief + typecheck-in-image gate
description: Hoe de tijdbewaking in deploy.yml meldt (mediaan-basislijn, dagcap) en waarom de typecheck in Dockerfile.api alleen bij NOODFIX draait.
---

**Regel 1:** de tijdbewaking in deploy.yml heeft geen vaste grens; hij mailt alleen wanneer de uitrol >1,5× de mediaan van de laatste 10 geslaagde runs duurt (GitHub API, `actions: read`-permission is expliciet gedeclareerd — zonder die scope faalt de opvraag stil en komt er nooit een melding), max. 1 tijdmelding/dag via datummarker `/opt/fps-one/.deploy-tijdmelding-datum` op de VPS. Schijfalarm valt buiten de dagcap.

**Regel 2:** Dockerfile.api draait typecheck:libs + api-server-typecheck alleen bij build-arg `TYPECHECK_IN_IMAGE=1` (NOODFIX of handmatige build); normale deploys geven 0 mee (workflow checkte al op de runner). Veilig omdat álle @workspace-exports naar src/*.ts wijzen — esbuild heeft geen lib-dist nodig.

**Why:** de vaste 8-min-grens werd bij vrijwel elke uitrol overschreden (16 identieke mails op één dag, 17 aug 2026); de dubbele typecheck kostte ~167s per image-build (262s→95s gemeten).

**How to apply:** nieuwe zware stappen in het image altijd afwegen tegen wat de runner al deed; bij wijzigingen aan de bewaking de GitHub-API-permissions meecontroleren.
