# Manifesten per pad (meting 18-08-2026, productie)

Gemeten met `curl` op https://connect.fps-one.nl:

| Pad | Manifest-link in HTML | Manifest | scope / start_url |
|---|---|---|---|
| `/` en alle Connect-SPA-pagina's (bv. `/gebouwen`, `/connect/planning`) | `/manifest.webmanifest` | **FPS Connect** (desktop) | `/` / `/` |
| `/app/` (Expo web-export monteuromgeving) | `/app/manifest.webmanifest` | **FPS Monteur** | `/app/` / `/app/` |

- Er staan dus **geen twee manifesten op hetzelfde pad**: `/manifest.webmanifest`
  (desktop) en `/app/manifest.webmanifest` (monteur) zijn gescheiden bestanden
  met gescheiden scopes. Het probleem was niet de uitlevering maar de
  **installatie-aanwijzing**: alle QR's/links wezen naar `/connect/planning`,
  en op elke Connect-pagina geldt het desktop-manifest — "Zet op beginscherm"
  leverde daar dus altijd FPS Connect (desktop) op.
- Service workers: `/sw.js` (Connect, root-scope) slaat `/app`-paden expliciet
  over (regel ~47); `/app/sw.js` bedient alleen de monteuromgeving.

## Wat is omgezet (alle installatie-ingangen → `/app/`)
- `GET /api/auth/pwa-qr` en `GET /api/auth/pwa-url` → wijzen nu naar `/app/`.
- Uitnodigings-/activatiepagina (stap "Account geactiveerd"): biedt zelf geen
  installatie-instructie meer aan, maar QR + knop "Open de monteuromgeving"
  naar `/app/`; toevoegen aan het beginscherm gebeurt dáár.
- Uitnodigingsmail: QR/link in het app-blok wijst naar `/app/`.
- Beheer → PWA-test: QR/link en fallback naar `/app/`, met toelichting.

## Waarom dit het oplost
De browser koppelt "Zet op beginscherm" aan het manifest van de pagina waarop
de gebruiker dat doet. Op `/app/` is dat het FPS Monteur-manifest
(naam "FPS Monteur", start_url `/app/`, eigen iconen) — het beginscherm-icoon
heet FPS Monteur en opent de monteuromgeving, niet Connect.
