---
name: Orval generated baseline drift
description: Een kleine OpenAPI-wijziging kan ongerelateerde gegenereerde output herschrijven wanneer de committed baseline achterloopt.
---
Behandel een volledige codegen-run altijd eerst als controle-uitvoer: inspecteer de numstat en behoud bij baseline-drift alleen de afgeleide bestanden en blokken die bij de nieuwe operatie horen. Los het synchroniseren van de volledige generated baseline als afzonderlijke, inhoudelijk reviewbare wijziging op.

**Why:** Orval kon bij één nieuw werk-inboxendpoint duizenden ongerelateerde regels herschrijven. Extern Prettier 3 toepassen maakte dit veel groter, omdat de bestaande gegenereerde stijl niet met die formatterbaseline overeenkomt.

**How to apply:** Draai de verplichte codegen, controleer daarna meteen de generated diff op ongerelateerde paden/schema's en gebruik geen losse repositorybrede formatter op Orval-output. Een toekomstige baseline-synchronisatie is pas geslaagd wanneer codegen zonder contractsverandering geen diff meer geeft.