---
name: Handgeschreven routes en dubbele /api-prefix
description: Handgeschreven (niet-OpenAPI) Express-routes die zelf "/api/..." in hun pad zetten worden onbereikbaar omdat app.ts de hele router al onder "/api" mount
---

# Handgeschreven routes en dubbele /api-prefix

`app.ts` mount de centrale router met `app.use("/api", router)`. Losse, handgeschreven beheerdersroutes (buiten de OpenAPI-spec, zoals `ai-context.ts`, `ai-log.ts`, `backups.ts`) definiëren hun pad soms zelf mét een `"/api/..."`-voorvoegsel. Het resultaat is een dubbel voorvoegsel (`/api/api/...`) dat van buitenaf nooit bereikt wordt — de route lijkt te bestaan (registratie compileert en typecheckt) maar geeft altijd 404 op het gedocumenteerde pad.

**Why:** dit werd pas zichtbaar tijdens een echte end-to-end curl-test (login → call), niet bij typecheck/build. Een diagnostisch endpoint kan zo maandenlang "gebouwd maar onbereikbaar" blijven zonder dat iemand het merkt, omdat er geen frontend-hook op zit die zou falen.

**How to apply:** bij het toevoegen van een handgeschreven (niet-Orval-gegenereerde) route: pad NOOIT met `/api/` beginnen — schrijf het relatief (`/beheer/...`, `/backups`, etc.), precies zoals de OpenAPI-routes al doen. Fix al toegepast op `ai-context.ts` (10 juli 2026); `backups.ts` heeft dezelfde bug nog en is nog niet gefixt (buiten scope van die taak).
