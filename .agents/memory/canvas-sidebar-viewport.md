---
name: Canvas viewport vs. sidebar zichtbaarheid
description: Waarom de firevault-sidebar niet zichtbaar is vanuit de standaard Canvas-viewport.
---

**Regel:** als een gebruiker meldt dat de sidebar "verdwenen" is terwijl ze naar het Canvas kijken, controleer dan eerst de Canvas-viewport-positie — niet de code.

**Why:** de firevault-iframe staat op Canvas-positie (-974, -551) met afmeting 1920×1080. De sidebar van firevault zit op de linkerrand van de app (x=0..~250). Op de Canvas is dat Canvas-x = -974...-724 — volledig buiten het standaard Canvas-viewport (dat begint bij x=0). De gebruiker ziet dan de RECHTERHELFT van de firevault-app (inhoud vanaf x=974), niet de sidebar.

**How to apply:**
- Sidebar "verdwijnt" bij Canvas-gebruik → vraag of de gebruiker de Preview-pane gebruikt (die toont de volledige app op de juiste schaal).
- In de Canvas zelf: de gebruiker moet het canvas naar links panen of uitzoomen om de sidebar van firevault in beeld te krijgen.
- De SidebarProvider leest de sidebar-cookie NOOIT terug op mount (`React.useState(defaultOpen)`); elke verse page-load start altijd in open staat. Sidebar "weg" na HMR = state behouden door HMR, niet door cookie; oplossing = harde refresh of nieuwe tab.
