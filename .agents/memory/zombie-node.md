---
name: Zombie node processen
description: Wanneer node-commando's hangen (zelfs node --version), zijn er te veel zombie node-processen; fix via kill + restart_workflow.
---

## Symptoom
- `timeout 5 node --version` → exit 124 (timeout, geen output)
- `timeout 20 node ./build.mjs` → exit 124, geen enkele esbuild-output
- Workflow `api-server` start niet (hangt bij `> node ./build.mjs`)
- Bash-commando's (ls, grep, cat) werken normaal — alleen `node` hangt

## Oorzaak
Te veel actieve node-processen (zombie of niet-afgesloten workflow-processen).
Node kan niet meer spawnen of hangt bij initialisatie door resource-limiet.
Dit is GEEN code-bug (esbuild, TypeScript-fout, import-probleem).

## Fix
```bash
# 1. Lijst actieve node-pids
ps aux | grep node | grep -v grep | awk '{print $2}'

# 2. Kill ze allemaal (2 sec timeout want kill kan ook hangen)
kill -9 <pid1> <pid2> ... 2>/dev/null

# 3. Herstart de betrokken workflows via restart_workflow
restart_workflow("artifacts/api-server: API Server")
restart_workflow("artifacts/firevault: web")
```

## Why
In de Replit-sandbox worden workflow-processen niet altijd netjes opgeruimd als een sessie afbreekt of als een workflow herhaald gefaald heeft. Na een paar sessies of herstartpogingen stapelen zombie-processen zich op totdat `node` niet meer kan starten.

## How to apply
Wanneer `node --version` of een build-commando hangt zonder output: diagnose eerst met `ps aux | grep node`, dan kill + restart_workflow. Niet proberen te debuggen als code-probleem (esbuild-config, import-circulair, etc.).
