---
name: Blauwe lijn = Chrome scroller focus-outline
description: Onverwachte volle-hoogte blauwe lijn aan de inhoud/sidebar-rand in firevault is Chrome's focus-outline op scroll-containers, geen theme-kleur.
---

# Blauwe lijn aan de inhoudsrand (firevault)

Een verzadigde blauwe lijn (volle hoogte, aan de sidebar/inhoud-grens, op elke pagina, verschijnt bij hover/scrollen) is **niet** een theme-border/ring en geen scrollbar. Het is **Chrome's standaard focus-outline op een scroll-container** ("keyboard-focusable scrollers": moderne Chrome maakt elke `overflow:auto/scroll` div focusbaar en tekent de UA-outline — die is blauw, los van je thema).

**Why:** Het FPS-thema heeft GEEN verzadigd blauw — `--ring` = `12 90% 50%` (oranjerood). Dus een felblauwe lijn kan nooit uit ring/border/primary komen; het is de browser-UA-outline.

**Kritieke les:** `outline: none` in `@layer base` werkt NIET afdoende — Tailwind v4's `@layer base` heeft de laagste author-cascade-prioriteit en Chrome's UA keyboard-focusable-scroller stijlen kunnen die verslaan. De fix moet:
1. **Buiten elke `@layer` staan** (unlayered CSS heeft hoogste author-cascade-prioriteit)
2. **`!important`** gebruiken om ook Tailwind-utilities te verslaan
3. **Selectors uitbreiden** van `.overflow-auto` + `[data-sidebar="content"]` naar `[data-sidebar]:focus-visible` en `[data-slot^="sidebar"]:focus-visible`
4. **`overflow: hidden` op `[data-slot="sidebar-container"]`** — clipt absoluut gepositioneerde hover-elementen en pseudo-element outlines strikt tot de sidebar

**How to apply (definitieve fix in `src/index.css`, buiten alle @layer-blokken):**
```css
.overflow-auto:focus,
.overflow-auto:focus-visible,
.overflow-y-auto:focus,
.overflow-y-auto:focus-visible,
.overflow-x-auto:focus,
.overflow-x-auto:focus-visible,
[data-sidebar]:focus,
[data-sidebar]:focus-visible,
[data-slot^="sidebar"]:focus,
[data-slot^="sidebar"]:focus-visible {
  outline: none !important;
}

[data-slot="sidebar-container"] {
  overflow: hidden;
}
```

`overflow: hidden` op sidebar-container is veilig: Radix UI DropdownMenu (GebruikerMenu) rendert in een portal buiten de container, dus wordt niet geclipt. SidebarRail is niet gerenderd in beheerder-layout (geen `<SidebarRail />` in de JSX).
