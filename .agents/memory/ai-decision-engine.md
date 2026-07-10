---
name: AI Decision Engine (Fase 0)
description: Passthrough-beslislaag bovenop aiGateway; hoe passthrough vs human-in-the-loop werkt en waar modelnamen/prompts vandaan komen.
---

- `aiDecisionEngine.ts` roept UITSLUITEND `aiGateway.chat(slot,{messages},undefined,logCtx)` aan — governance blijft eerste poort, nooit omzeild.
- Passthrough (`requiresHumanApproval=false`) is functioneel identiek aan directe gateway-aanroep: status `voorstel`, `resultaat`=gateway-inhoud, geen token. Fase 0 mag dit NIET wijzigen.
- Human-in-the-loop: `verwerk()` bewaart voorstel met eenmalig token + status `wacht_op_gebruiker`; `beoordeel(token,userId,akkoord,opmerking)` -> `akkoord`(geeft resultaat vrij)/`afgewezen`(geen resultaat); reeds-afgehandeld token -> `fout`.
- Opslag achter `BeslissingStore`-interface (DI); `dbBeslissingStore` gebruikt tabel `ai_beslissingen`. Zuiver testbaar met in-memory store + mock gateway.
- **AiProcessStatus enum = LOWERCASE** (.fout/.voorstel/.wacht_op_gebruiker/.akkoord/.afgewezen/.uitgevoerd); `AiProcessResult.resultaat` is REQUIRED (string|null).
- Modelnamen: alleen `MODEL_REGISTRY` in `aiGateway.ts`; `aiModelRouter.ts` mapt taakprofiel->slot. Prompts: alleen bestaand register via `aiPromptBuilder.ts` (voegt geen 2e bron toe).
- Taken declaratief in `aiTaakregister.ts`; Zod `outputSchema` in Fase 0 AANGEBODEN maar NIET server-side afgedwongen (bewuste keuze).
- Routes `routes/ai-beslissingen.ts` (auth-gated via requireBevoegdheid): user-id uit `req.session.userId` (NIET req.gebruiker); permissies via `req.permissies.heeftModuleRecht`.
