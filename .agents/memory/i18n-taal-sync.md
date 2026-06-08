---
name: i18n taal-synchronisatie
description: Hoe de gekozen UI-taal wordt gesynchroniseerd tussen runtime-keuze, localStorage en server (DB) zonder dat een verse keuze wordt overschreven.
---

# i18n taal-synchronisatie (FireVault)

Twee bronnen willen de taal zetten: de gebruiker (runtime-keuze) en de server (`gebruiker.taal` uit `/auth/me`). Zonder coördinatie overschrijft de server-waarde een verse keuze.

**Regel:** een expliciete runtime-keuze heeft voorrang op de server-taal binnen dezelfde paginasessie.

**Hoe toegepast:**
- `TaalProvider` houdt een ref bij die markeert of de gebruiker deze sessie expliciet koos. `zetTaal(code, expliciet=true)` zet die ref; `synchroniseerServerTaal(code)` past de server-taal alleen toe als de ref *niet* gezet is.
- `AuthProvider` roept `synchroniseerServerTaal` (niet `zetTaal`) aan in zijn `gebruiker.taal`-effect, zodat inloggen een verse keuze niet terugdraait.
- De ref reset bij paginaherlaad — dan is de server-taal de bron van waarheid (taal kan op een ander apparaat zijn gewijzigd). localStorage is enkel lokale cache; DB is cross-device bron van waarheid.

**Persistentie van de login-keuze:** de login-pagina kan vóór 2FA nog niet naar de DB schrijven (niet geauthenticeerd). Daarom: pas ná succesvolle 2FA `taalWijzigen({ taal })` aanroepen, en alléén als de gebruiker tijdens deze login expliciet een vlag koos (anders zou de default de DB-voorkeur op een nieuw apparaat overschrijven). De call is non-fataal (try/catch) zodat opslaan het inloggen niet blokkeert.

**Menu-wissel:** optimistisch `zetTaal` + `useTaalWijzigen.mutate` met `onError` rollback naar de vorige taal.

**RTL:** `RTL_TALEN=['ar']`; `TaalProvider` zet `document.documentElement.dir` + `lang` bij elke taalwissel.
