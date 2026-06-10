---
name: Preset herkomst-koppeling
description: Hoe presets (profielen) terugkoppelen naar gebruikers die ervan zijn afgeleid
---

# Preset ↔ gebruiker herkomst-koppeling

Presets (`profielen`) zijn een startpunt: bij toepassen worden de bevoegdheden
naar de gebruiker gekopieerd. De koppeling terug loopt via één veld:
`gebruikers.herkomst_profiel_id` (nullable FK → profielen, `ON DELETE SET NULL`).

**Why:** een beheerder moet kunnen zien wie een profiel als basis kreeg en een
gewijzigde preset opnieuw kunnen doorvoeren. Exact-match op bevoegdheden alleen
is onvoldoende: na een preset-wijziging matcht niemand meer, dus er is een
expliciet herkomst-veld nodig dat handmatige wijzigingen overleeft.

**How to apply:**
- Het veld wordt alleen gezet wanneer in het gebruikersformulier een preset wordt
  gekozen (BevoegdhedenEditor `onPresetGekozen`). Latere handmatige
  bevoegdheden-wijzigingen veranderen `herkomst_profiel_id` NIET.
- PATCH /gebruikers: `herkomst_profiel_id` undefined = ongemoeid, null = wissen,
  id = (her)koppelen.
- GET /profielen verrijkt elk profiel met `gebruiker_aantal` + `gebruikers`
  ([{id, naam, rol, gelijk}]); `gelijk` = huidige bevoegdheden nog exact gelijk
  aan de preset (niveau 0 == ontbrekende sleutel). Afwijkende gebruikers krijgen
  een amber waarschuwing op de profielenpagina.
- POST /profielen/:id/toepassen (hoofdbeheerder) overschrijft de bevoegdheden van
  ALLE gekoppelde gebruikers met de huidige preset-waarden; retourneert {bijgewerkt}.
- DB push faalt op TTY → kolom toegevoegd via directe ALTER SQL.
