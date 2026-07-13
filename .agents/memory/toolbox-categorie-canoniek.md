---
name: Toolbox categorie-whitelist
description: Canonieke toolbox-categorielijst moet synchroon blijven tussen frontend, batch-endpoint en scripts; endpoint valideert en normaliseert.
---

De veiligheids-toolboxen kennen één canonieke categorielijst: brandveiligheid, werken_op_hoogte, pbm, elektrisch, bouwplaats, gezondheid, milieu, machines, overig.

**Regel:** het AI-batch-endpoint (`POST /veiligheid/toolboxen/ai-batch-genereer`) valideert invoer-categorieën tegen deze whitelist (400 bij onbekend) en normaliseert AI-uitvoer met een onbekende categorie naar `overig`. Frontend (toolboxen.tsx), endpoint (CATEGORIE_BESCHRIJVING) en scripts moeten dezelfde lijst voeren.

**Why:** een script gebruikte ooit een eigen (afwijkende) lijst; de AI genereerde die braaf, waardoor ~2/3 van een 50-batch categorieën had die de frontend niet kende (rauwe snake_case labels, grijze fallback, onvindbaar in filters). Eenmalige SQL-normalisatie was nodig.

**How to apply:** bij een nieuwe toolbox-categorie: frontend-lijst, CATEGORIE_BESCHRIJVING in het endpoint én eventuele scriptlijsten in dezelfde wijziging bijwerken. Nooit vertrouwen op vrije AI-categorie-uitvoer.
