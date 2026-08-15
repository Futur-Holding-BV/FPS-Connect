---
name: js-yaml override vs orval
description: pnpm audit-override brak Orval-codegen; override moet <5 blijven.
---
Regel: de audit-override voor js-yaml in `pnpm-workspace.yaml` moet `'>=4.2.0 <5'` zijn (niet `'>=4.2.0'`).
**Why:** js-yaml 5.x heeft geen default-export meer; orval importeert `import yaml from "js-yaml"` en crasht dan met SyntaxError bij elke codegen (aug 2026 incident).
**How to apply:** bij pnpm audit --fix of override-wijzigingen checken dat orval's js-yaml op 4.3.x blijft; symptoom = codegen faalt direct met "does not provide an export named 'default'".
