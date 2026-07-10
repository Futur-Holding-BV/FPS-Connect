---
name: Governance & Approval Engine
description: Generic approval/governance engine (goedkeuring_beleidsregels + goedkeuring_aanvragen) and the pilot-integration pattern used to bolt it onto an existing status-transition workflow.
---

## What it is

One generic engine (`goedkeuringEngine` service) for "does this object need a formal approval, and who may approve it" — not a per-feature approval flow. Policy rows (`goedkeuring_beleidsregels`, scoped by document_type/werkmaatschappij/bedragrange) determine required approver count, four-eyes requirement, substitute approver, and response deadline. Requests (`goedkeuring_aanvragen`) snapshot the policy at submission time (`beleid_snapshot`) so a later policy change never rewrites history for an in-flight or already-decided request.

## Integration pattern with an existing workflow-engine transition

To gate an existing state-machine transition (e.g. inkoopbon concept→goedgekeurd in `workflow-configs.ts`) behind this engine without rewriting the workflow engine itself:
1. The transition's precheck calls the governance engine; if a policy applies, it throws the workflow engine's `voorwaardeFout` (HTTP 422, body `{ error: string }`, no structured code).
2. The governance engine — once a request is fully approved — re-invokes the same transition with an explicit bypass flag (`viaGoedkeuring: true`) that skips both the precheck and the normal permission check for that one call site.
3. Frontend: on a 422 from the direct PATCH, don't just show a generic error — detect `ApiError.status === 422` and offer a toast action that starts the formal approval submission instead.

**Why:** lets a governance requirement wrap an already-shipped transition additively (new tables + one guarded call site) instead of threading approval state through the workflow engine's core logic.

**How to apply:** any future module that needs mandatory approval before a status change should reuse this same three-step pattern rather than building a bespoke approval flow — the engine is intentionally generic (permission module `goedkeuring` in the bevoegdhedenmatrix, not tied to inkoopbon).
