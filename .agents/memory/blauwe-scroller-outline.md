---
name: Blauwe lijn = Chrome scroller focus-outline
description: Onverwachte volle-hoogte blauwe lijn aan de inhoud/sidebar-rand in firevault is Chrome's focus-outline op scroll-containers, geen theme-kleur.
---

# Blauwe lijn aan de inhoudsrand (firevault)

Een verzadigde blauwe lijn (volle hoogte, aan de sidebar/inhoud-grens, op elke pagina, verschijnt bij klikken/scrollen) is **niet** een theme-border/ring en geen scrollbar. Het is **Chrome's standaard focus-outline op een scroll-container** ("keyboard-focusable scrollers": moderne Chrome maakt elke `overflow:auto/scroll` div focusbaar en tekent de UA-outline — die is blauw, los van je thema).

**Why:** Het FPS-thema heeft GEEN verzadigd blauw — `--ring` = `12 90% 50%` (oranjerood), `--sidebar` = blauwgrijs `220 20% 16%`. Dus een felblauwe lijn kan nooit uit ring/border/primary komen; het is de browser-UA-outline. Eerdere sessie zocht dit fout bij de scrollbar (scrollbar verbergen lost de outline niet op).

**How to apply:** De scroll-containers in firevault zijn `<main class="... overflow-auto ...">` (alle layouts) en `[data-sidebar="content"]` (ook overflow-auto), plus eventuele binnen-panelen met `overflow-y-auto`. Onderdruk de outline in `src/index.css` (binnen `@layer base`) op `.overflow-auto/.overflow-y-auto/.overflow-x-auto` (en `[data-sidebar="content"]`) voor `:focus` én `:focus-visible`. Dit raakt geen interactieve elementen — shadcn gebruikt `ring` (box-shadow), niet `outline`. Diagnose kan niet via screenshot-tool (login + verplichte TOTP); redeneer via thema-tokens + DOM (overflow-containers).
