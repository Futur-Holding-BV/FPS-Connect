---
name: Gebouw AI-invullen flow
description: Ontwerp van AI-invullen bij gebouw aanmaken/bewerken — eigendomstracking, ambigue geocoding, staleness.
---

# Gebouw AI-invullen (aanmaken/bewerken dialogs + gebouw-ai.ts)

## Eigendomstracking via ref, NIET via state
Bijhouden welke velden de AI invulde gebeurt met een `aiVeldenRef` (useRef Set), bewust GEEN useState.

**Why:** een AI-run duurt seconden (geocode + satelliet/vision). De formuliervelden blijven
intussen bewerkbaar. Met een state/closure-snapshot van de eigendoms-Set overschrijft de
response-handler ná de await de invoer die de gebruiker tijdens het verzoek typte (race). Een ref
wordt synchroon gemuteerd in `zet()` en ná de await uitgelezen (`aiVeldenRef.current`), dus altijd actueel.

**How to apply:** als je deze flow aanpast, houd eigendom in een ref. Lees `aiVeldenRef.current`
binnen/na de mutateAsync, niet een closure-variabele. `zet()` (user typt) → `.delete(key)`;
`wisAiVelden()` snapshot via `Array.from(...)` vóór reset naar `new Set()`.

## Overschrijfregel
Een veld is vervangbaar als `aiVeldenRef.current.has(key) || !prev[key].trim()` (AI-eigendom OF leeg).
Door de gebruiker getypte, niet-lege velden blijven dus staan. AiVeld-type =
`Exclude<keyof Velden, "projectnummer">` (anders eist Record<...> projectnummer → TS-fout).

## Ambigue geocoding (backend gebouw-ai.ts)
`geocodeAlle()` dedupt op formatted_address, cap MAX_SUGGESTIES=5, geen reverse-geocode.
- >1 kandidaat → `leegResultaat()` + `gevonden:true` + `meerdere:true` + `suggesties[]`;
  satelliet/vision OVERGESLAGEN en alle veldwaarden leeg (zo blijft oude data niet onterecht staan).
  Gebruiker kiest suggestie → `voerAiUit(label)` opnieuw → 1 resultaat → volledige analyse.
- 1 kandidaat → `verrijkPostcode()` (reverse-geocode vult ontbrekende postcode) + volledige analyse.

## Staleness
`voorstellenVerouderd = laatsteAiTekst !== null && aiTekst.trim() !== laatsteAiTekst.trim()` → amber banner.
Suggesties worden gewist bij tekstwijziging (onChange). Knop heet "Opnieuw zoeken" na eerste run.

## Verschil dialogs
- aanmaken: start met lege velden (ref leeg → alles vulbaar).
- bewerken: bestaande gebouwdata start user-owned (ref leeg → AI overschrijft bestaande velden NIET,
  alleen lege/AI-velden). useEffect reset alle AI-state + `aiVeldenRef.current = new Set()` bij open.
