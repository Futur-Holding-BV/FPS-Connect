---
name: Blauwe lijn = Canvas iframe hover-highlight
description: De felblauwe volle-hoogte lijn rond de firevault-preview is de Canvas (tldraw) hover-highlight om de embedded iframe-shape, niet iets in firevault zelf.
---

# Blauwe lijn rond de firevault-preview

Een felblauwe, volle-hoogte lijn die bij hover langs de rand van de app verschijnt is de **Canvas (tldraw) hover-highlight rond de embedded app-preview (iframe-shape)** — getekend door de Canvas, BUITEN firevault. Het is geen theme-kleur, geen border/ring en geen Chrome scroller-outline in de app zelf.

**Bevestigd (11 juni 2026):** open firevault in de gewone preview (los tabblad, niet op de Canvas) → de lijn is weg. Hij verschijnt alleen wanneer de app als iframe-shape op de Canvas wordt gehoverd.

**Why:** Het FPS-thema heeft geen verzadigd blauw (`--ring` = `12 90% 50%`, oranjerood), dus felblauw kan nooit uit het thema komen. De Canvas markeert de gehoverde shape met een blauwe highlight; dat is normaal Canvas-gedrag, geen bug in de app en niet zichtbaar voor eindgebruikers van de gepubliceerde app.

**How to apply:** Reproduceer eerst buiten de Canvas voordat je in firevault-CSS gaat zoeken. Is de lijn buiten de Canvas weg, dan is het de Canvas-highlight — niets in firevault aanpassen. De eerdere diagnose ("Chrome keyboard-focusable scroller focus-outline") was FOUT; de bijbehorende `outline: none !important` + `overflow: hidden` workaround in `src/index.css` loste niets op en is dode code (mag opgeruimd worden; let bij verwijderen op focus-outline-toegankelijkheid en eventuele sidebar-clipping).
