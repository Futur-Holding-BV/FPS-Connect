---
name: Document Design System (DDS)
description: Architecture decisions for the shared FPS document/report rendering engine reused by opleverrapport (print.tsx) and V1.5 frozen reports.
---

# Document Design System (DDS)

Shared document-rendering layer for all FPS documents (opleverrapporten, HRM/juridisch, interne operationele). Visual base lives in firevault under `components/documentopmaak` (DocumentFrame + Familie A/B/C + resolveAssetUrl); preview page under Beheer › Documentopmaak.

## Durable rules

- **Single branding source = `werkgevers` table.** WerkmaatschappijInfo (logoUrl/briefpapierUrl/…) MUST stay feedable from `werkgevers` — never create a second branding source. **Why:** DDS and V3.0/HRM share werkmaatschappij branding; two sources drift. **How to apply:** keep branding fields URL-shaped (logoUrl, not an asset filename) so storage URLs from werkgevers drop in without a rewrite.
- **All document asset URLs go through `resolveAssetUrl`.** Absolute (http/https/data/blob) and root paths (e.g. `/api/storage/...`) pass through unchanged; bare filenames get BASE_URL. **Why:** logos/photos move from public/ dummy assets to storage-backed URLs later without touching components.
- **DocumentFrame print rules.** `bleed` only on full-bleed cover/hoofdstuk pages (clips overflow); content pages stay non-clipping so dynamic text isn't cut. `paginaEinde` (print:break-after-page) is per page and should be `false` on the last page to avoid a trailing blank page. **Why:** real multi-page reports behave differently from the fixed single-page demos.
- **Reports are designed around "rapportitems"** that render BOTH single spots AND composite items with sub-parts. **Why:** forward-compat for S.G. Constructies (samengestelde-constructie spottype) so V1.4/V1.5 report layout needs no rewrite when S.G. lands.
- **print.tsx stays the live concept renderer**; V1.5 `opleverrapporten` holds the frozen snapshot/selection/status/version. Both reuse the same DDS components — don't fork the styling.
- **Preview page gating:** `heeftNiveau("systeem", 1)` (mirrors nav `toonSysteem`), as a page-level guard in addition to nav gating.
