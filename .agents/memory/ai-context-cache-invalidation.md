---
name: AI context cache invalidation coverage
description: Which mutation routes call invalideerContext and which sub-resources were deliberately left out
---

`invalideerContext(type, id)` from `artifacts/api-server/src/lib/aiContext/cache.ts` must be called on
every POST/PATCH/DELETE that writes a field a resolver in `artifacts/api-server/src/lib/aiContext/resolvers.ts`
reads — for the 8 core entities (gebouw, voorziening, onderhoud, offerte, dossier, document, klant, medewerker),
this includes create routes too, not just update/delete: a fresh id has no prior cache entry for itself, but it
can be reachable via another entity's `relaties` (e.g. voorziening → gebouw) or via a joined sub-select inside a
resolver (e.g. voorziening's `laatsteInspectie` pulled from `inspectiesTable`), so skipping creates still risks a
stale parent bundle.

Pattern: call it right after a successful DB write, using the row's own id for creates/updates, and a
pre-fetched foreign key (e.g. `voorzieningId`, `dossierId`, `klantId`) for deletes/child-row creates,
since the row itself is gone or doesn't carry the parent id after the operation completes. Bulk-update
paths (e.g. cluster-wide reassignment) need invalidation per affected row, not just the trigger row.

Sub-resources genuinely outside resolver scope (verified against resolvers.ts, not just skipped by feel)
don't need invalidation — e.g. crm.ts entities other than klant/contactpersonen, or hrm.ts opleidingen/
bekwaamheden/verlof sub-resources that the medewerker resolver never reads.

Watch for *indirect* writes too: code that updates an entity's table from a different route than its
own CRUD file (e.g. a werkgever rename cascading a `werkmaatschappij` cache-column update onto every
linked medewerker row, or a shared helper like `syncHoofdNaarMedewerker` invoked from multiple aanstelling
routes) is just as much a mutation of resolver-visible fields and needs the same `invalideerContext` call,
even though the route's own path/entity name doesn't match the type being invalidated.

**Why:** resolvers.ts is the single source of truth for what's cached and what relations exist between
entities; judging "in/out of scope" from the route file alone (not the resolver) is how coverage gaps slip in.

**How to apply:** before adding a new field to a resolver (or a new mutation route on an existing entity),
grep resolvers.ts for that entity's payload and relations, and add `invalideerContext` calls for every id
that field could affect — including the entity's own id on create, and any parent id in its `relaties`.
