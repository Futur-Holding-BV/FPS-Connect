---
name: SidebarTrigger tooltip-patroon
description: Hoe een hover-hint toe te voegen aan de shadcn/ui SidebarTrigger zonder rendering te breken.
---

**Regel:** gebruik het native `title`-attribuut op `<SidebarTrigger>`, nooit `TooltipTrigger asChild`.

**Why:** `SidebarTrigger` gebruikt geen `React.forwardRef`. Radix `Slot` (gebruikt door `TooltipTrigger asChild`) probeert een ref te koppelen aan de child. Zonder forwardRef mislukt dit en breekt de hele sidebar-rendering — de sidebar verdwijnt volledig.

**How to apply:** bij elke SidebarTrigger die een tooltip-label nodig heeft:
```tsx
<SidebarTrigger
  className="..."
  title="Menu in-/uitklappen"
/>
```
Geen extra import, geen Radix-component, geen ref-probleem.
