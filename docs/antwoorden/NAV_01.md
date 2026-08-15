# NAV_01 — antwoorden en bevindingen

## §0-inventarisatie: wat staat er van MENU_01 en PANEEL_01 werkelijk op main?

**Datum:** 11 augustus 2026 · **gemeten op commit:** `73eea85` (main) · alles hieronder is **gemeten** in de code, tenzij expliciet "aangenomen".

### MENU_01 — grotendeels NIET gebouwd

| Onderdeel | Status op main |
|---|---|
| Commandopalet (Ctrl+K) | **Bestaat niet.** `components/ui/command.tsx` is alleen de generieke shadcn-bouwsteen; de enige gebruikers zijn lokale pickers (uren-pagina, artikel-picker, applicatie-picker). Er is geen Ctrl+K-listener en `beheerder-layout.tsx` importeert geen Command. |
| Blok "Nu" bovenaan de sidebar | **Bestaat niet.** De sidebar begint met Dashboard (`beheerder-layout.tsx:366-385`), daarna de hoofdstukken. |
| Menuvolgorde in de database | **Niet gebouwd.** Volgorde/open-status loopt via `use-sidebar-hoofdstukken.ts` → `useVoorkeur` → **localStorage** (`fps_voorkeur_…`). Alleen het banenpaneel gebruikt servervoorkeuren. |

`docs/antwoorden/MENU_01.md` bestaat niet — consistent met "niet gebouwd".

### PANEEL_01 — WEL gebouwd

- Vaste banen naast elkaar bestaan echt: `components/paneel/banen-menu.tsx` (paneelmodus, 2/3/4 banen), `components/paneel/paneel-context.tsx` (validatie 2..4, min 360 px per baan, terugval naar één weergave bij te smal venster, max 5 benoemde indelingen), gerenderd via `BanenWeergave` in `beheerder-layout.tsx:1849-1858`.
- Persistentie loopt hier wél via de database (`gebruiker_voorkeuren`, sleutels `paneel.indeling`/`paneel.indelingen`) — conform MENU_01 §4.3 ("één voorkeurenmechanisme"), maar dat mechanisme is dus alléén voor het paneel aangesloten, niet voor de menuvolgorde.

`docs/antwoorden/PANEEL_01.md` bestaat niet, hoewel het paneel wél gebouwd is — de documentatieplicht is daar destijds niet nagekomen.

### Huidige sidebar (de basis waarop NAV_01 bouwt)

- `layouts/beheerder-layout.tsx` = 1.873 regels; vaste hoofdstuklijst op r305-317: **projectaanpak · magazijn · commercie · communicatie · veiligheid · financieel · goedkeuring · declaraties · organisatie · personeel · loon** (elf stuks; Dashboard staat er los vóór; Algemene inkoop is bewust een losse post, geen hoofdstuk).
- Zichtbaarheid via **26** lokale toon-vlaggen (r183-212; het opdrachtdoc zegt 25 — **afwijking gemeld**, de telling op main is 26 incl. `toonTeamOverleg` en `toonWorkflow`).
- `useSidebarHoofdstukken`: volgorde + open/dicht; open-status start elke sessie leeg → **standaard ingeklapt** (verzoek René 09-08, blijft zo).
- `InklapbaarHoofdstuk` (`components/ui/herschikbaar-hoofdstuk.tsx`): props `sleutel/positie/onVerplaats/titel/open/onOpenChange`; slepen is pointer-gebaseerd (bewust geen HTML5-dnd), drempel 4 px, rand-autoscroll, Escape annuleert.

### Ontwerptokens

- Bron: `lib/ontwerp/src/index.ts` — paletten (licht/donker), radius, **beweging r187-198** (snel 120 ms, normaal 200 ms, traag 320 ms + easing), CSS-variabelen-afleiding r223-246; webbrug `artifacts/firevault/src/lib/ontwerpTokens.ts`.
- Er bestaat **nog geen hoofdstukkleurenreeks**; die wordt in NAV_01 als benoemde, getypeerde reeks (licht+donker) aan `@workspace/ontwerp` toegevoegd en via CSS-variabelen ontsloten — geen losse hexcodes in de layout.

### Conclusie voor de bouw

NAV_01 bouwt voort op `useSidebarHoofdstukken` + `InklapbaarHoofdstuk` (geen tweede menumechanisme). Het twee-traps paneel wordt de desktopweergave van hetzelfde mechanisme; onder de bestaande breekpunten valt het terug op de huidige inklapweergave. De banenweergave (PANEEL_01) blijft onaangeroerd.
