---
name: html2canvas + Tailwind v4 oklch
description: Why client-side canvas/PDF capture in firevault must use html2canvas-pro, not classic html2canvas
---

# Client-side canvas/PDF capture in firevault

Use `html2canvas-pro` (not classic `html2canvas` 1.4.1) for any client-side DOM->canvas
or DOM->PDF capture in the firevault web app (e.g. the gebouw opleverrapport "Opslaan in DMS"
flow in `pages/gebouwen/print.tsx`).

**Why:** firevault runs Tailwind v4, whose generated styles use `oklch()` color values.
Classic html2canvas 1.4.1 cannot parse `oklch()` and throws during rendering. `html2canvas-pro`
is a maintained fork that understands modern color functions. Import it dynamically to keep it
out of the main bundle.

**How to apply:** any new "export as PDF/image" / screenshot-of-DOM feature in firevault should
dynamic-import `html2canvas-pro` + `jspdf`, render per page section at scale 2, then build the PDF.
