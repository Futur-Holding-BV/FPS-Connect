---
name: Mobiele biometrische app-lock
description: Hoe het Face ID/vingerafdruk-slot rond de bearer-sessie in de monteur-app werkt en waarom.
---

# Mobiele biometrische app-lock (snelle ontgrendeling)

Het slot is een app-lock RONDOM de bestaande stateless HMAC bearer-sessie, geen
vervanging van wachtwoord+TOTP-login. Server verandert niet.

## Kernregel: publieke `token` = null gates alles
Houd tijdens vergrendeling de persisted token alleen in een private ref
(`vergrendeldTokenRef`); zowel de module-level `huidigToken` (gelezen door de
fetch-laag via `setAuthTokenGetter`) als de publieke `token`-state blijven null.

**Why:** de publieke `token` gate't NIET alleen de fetch-laag maar ook
`SyncProvider` (forceerSync/interval/AppState hangen aan `token`). Eén null-bron
voorkomt zowel API-calls als het te vroeg replayen van offline-mutaties tijdens
het slot.
**How to apply:** nooit `huidigToken`/`setToken` zetten op de vergrendel-tak van
de launch-flow; pas zichtbaar maken na succesvolle `authenticateAsync`.

## Centrale gate hoort in `_layout.tsx`, niet per scherm
**Why:** expo-router kan via diepe link/herstel direct op een beschermd scherm
landen; bestaande `if(!token) Redirect /login`-guards omzeilen dan het slot.
**How to apply:** in `RootLayoutNav` met `usePathname` + `router.replace`:
vergrendeld → `/vergrendeld`; toegestaan `/`, `/login`, `/vergrendeld`. Per-scherm
redirects blijven als vangnet.

## Overige vaste keuzes
- v1 = alleen slot bij opstart; GEEN herslot na achtergrond (veldwerk-UX).
- Web vergrendelt nooit: `Platform.OS==="web"` → biometrie onbeschikbaar,
  `tokenOpslag` valt terug op AsyncStorage (SecureStore werkt niet op web).
- `expo-local-authentication` + `expo-secure-store` zitten in Expo Go (SDK 54);
  veilig (anders dan third-party native modules die in Expo Go crashen).
- Geen `requireAuthentication` op SecureStore; de app-biometrie gate't al.
- Nooit wachtwoord/TOTP opslaan.
- Als biometrie-voorkeur "aan" is maar hardware/enrollment ontbreekt: niet
  vergrendelen (token gewoon tonen) i.p.v. uitsluiten.
