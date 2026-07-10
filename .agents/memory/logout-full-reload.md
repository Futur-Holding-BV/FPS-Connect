---
name: Uitloggen = volledige herlaad
description: Waarom de firevault-uitlog een harde page-reload doet i.p.v. React Query-cache manipuleren
---

# Uitloggen moet een volledige herlaad doen

De web-uitlog (`auth-context.tsx` `uitloggen()`) vernietigt de serversessie (logout → 204)
en doet daarna `window.location.assign(import.meta.env.BASE_URL)` (na `queryClient.clear()`).

**Why:** puur React Query-state manipuleren flipte `isAuthenticated` NIET betrouwbaar naar
uitgelogd. `queryClient.clear()` + `invalidateQueries` refetchte `/auth/me` niet prompt
(pas na ~staleTime van 15 min → portaal bleef hangen, "Uitloggen doet niets"). Ook
`setQueryData(meKey, null)` ná `clear()` werkte niet in E2E: het portaal bleef renderen
(`isAuthenticated = gebruiker !== null` bleef true). De clear()/setQueryData-timing rond
een actieve `me`-observer is te subtiel en onbetrouwbaar.

**How to apply:** raak deze uitlog niet terug aan naar cache-only. Een volledige herlaad na
sessie-vernietiging levert bij herstart een 401 op `/auth/me` → loginscherm gegarandeerd.
Standaard, robuust, onafhankelijk van React Query.

## Aanverwante valkuilen (gebruikersmenu / E2E)
- **Onboarding-gate localStorage-sleutel is `fps.welkom.afgerond` = "1"** (NIET
  `fps_onboarding_voltooid`). Zonder deze sleutel redirect een frisse browser na login naar
  de welkom-wizard i.p.v. het portaal. Zet 'm via `page.addInitScript` vóór `goto` in E2E.
- **Vaste `NieuwsTicker`** (`fixed bottom-0 h-14 z-40`) vangt pointer-events af op de
  laagste sidebar-knoppen; de `SidebarFooter` heeft `pb-16` nodig zodat de onderste
  menuknoppen (Privacy/App-informatie/Uitloggen) klikbaar blijven.
- **"Bekijken als" impersonatie:** een teamlid zonder bevoegdheden impersoneren belandt in
  een GeenToegang-scherm; kies in E2E een target met minimaal `bevoegdheden {gebouwen:1}`.
