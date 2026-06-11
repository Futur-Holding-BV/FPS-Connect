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
- Het veld wordt gezet wanneer in het gebruikersformulier een preset wordt
  gekozen (BevoegdhedenEditor `onPresetGekozen`). Latere handmatige
  bevoegdheden-wijzigingen veranderen een BESTAANDE `herkomst_profiel_id` NIET.
- Auto-herkomstdetectie (server): bij POST en PATCH /gebruikers wordt — als er
  geen expliciete herkomst is meegestuurd — `herkomst_profiel_id` automatisch
  gezet wanneer de bevoegdheden-matrix exact en als ENIGE overeenkomt met één
  profiel (`vindUniekeHerkomstPreset` in gebruikers.ts). Guards tegen valse
  koppeling: lege/rechtloze matrix (`heeftEnigeToegang`) → null; 0 of >1 match →
  null. PATCH doet dit alleen wanneer bevoegdheden wijzigen én er nog geen
  herkomst is (bestaand.herkomstProfielId == null).
- `bevoegdhedenGelijk` is gedeeld in `@workspace/permissies` (niet meer
  gedupliceerd in profielen.ts); niveau 0 == ontbrekende sleutel.
- PATCH /gebruikers: `herkomst_profiel_id` undefined = ongemoeid (kan auto-gezet
  worden), null = wissen, id = (her)koppelen.
- GET /profielen verrijkt elk profiel met `gebruiker_aantal` + `gebruikers`
  ([{id, naam, rol, gelijk}]); `gelijk` = huidige bevoegdheden nog exact gelijk
  aan de preset (niveau 0 == ontbrekende sleutel). Afwijkende gebruikers krijgen
  een amber waarschuwing op de profielenpagina.
- POST /profielen/:id/toepassen (hoofdbeheerder) overschrijft de bevoegdheden van
  ALLE gekoppelde gebruikers met de huidige preset-waarden; retourneert {bijgewerkt}.
- Automatisch vs handmatig: `gebruikers.herkomst_automatisch` (boolean) markeert of
  de koppeling via `vindUniekeHerkomstPreset` is afgeleid (true) of expliciet door
  een beheerder gekozen/bevestigd (false). Expliciete `herkomst_profiel_id` in
  POST/PATCH zet de vlag altijd op false. mapGebruiker geeft false als er geen
  koppeling is. Hoofdbeheerder-only acties: POST /gebruikers/:id/herkomst-bevestigen
  (vlag→false) en /herkomst-verwijderen (koppeling weg, bevoegdheden blijven).
- DB push faalt op TTY → kolom toegevoegd via directe ALTER SQL.
