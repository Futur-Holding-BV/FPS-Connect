---
name: Roadmap docs can lag actual build state
description: replit.md / docs/roadmap/*.md status labels ("in aanbouw" etc.) are not authoritative — verify against git log and code before starting a "new" phase.
---

`docs/roadmap/actief.md` and `replit.md` had V1.4 Opleverrapportage marked "in aanbouw" long after it (and part of V1.5: persisted rapport entity + bevriezing) was actually fully built in prior sessions.

**Why:** roadmap docs are updated per-increment by whichever session did the work, but a session can finish a phase without updating the higher-level status labels elsewhere (README index, `replit.md` overview line), so the labels drift out of sync with the code.

**How to apply:** before starting work framed as "build phase X", grep git log / the relevant route + page files first. If the feature already exists, do a gap analysis against the spec instead of re-implementing, then correct the stale status labels across `replit.md`, `docs/roadmap/README.md`, and the specific phase file (gebouwd.md/actief.md) in the same pass — a status fix in one file without the others just moves the staleness.
