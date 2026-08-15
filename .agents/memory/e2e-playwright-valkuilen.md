---
name: Playwright/e2e-valkuilen (verzamelindex)
description: Wegwijzer naar alle Playwright/e2e-valkuil-topicfiles; lees het betreffende bestand bij e2e-werk.
---
- playwright-filter-first-vs-last.md — nested div-filter: .first()=outer, .last()=innermost
- playwright-route-ordering.md — laatste page.route() wint; één catch-all met if-branches
- e2e-proxy-multipart.md — route.fetch() sloopt multipart-stream; route.continue() bij uploads
- e2e-web-stale-devserver.md — firevault-workflow stoppen vóór e2e-web (stale compilatie)
- e2e-getbytext-navkaart.md — getByText matcht ancestors; testID+getByTestId gebruiken
- e2e-onboarding-blokkade.md — addInitScript zet fps_onboarding_voltooid vóór goto
- reanimated-waaier-e2e.md — klik-simulatie faalt; window.__FPS_NAVIGEER__ + transform-cache wissen
- rn-modal-conditional-render.md — RNW Modal: {open && <Modal visible>} anders blijft tekst in DOM

## Extra e2e-pointers (geconsolideerd uit de index, aug 2026)
- [E2E TOTP login timing](e2e-totp-timing.md) — next-window TOTP-code genereren; vast e2e-account; Expo buiten /api-proxy.
- [E2e-testaccount lifecycle](e2e-testaccount-lifecycle.md) — archiveren in finally; seeders idempotent heractiveren.
- [Parallelle validatie-races](validatie-parallel-races.md) — eigen poort + eigen build-outdir per bewijsrunner.
- [E2E menu-test validatiestap](e2e-validatie-runner.md) — runner boot api-server+expo zelf; CI heeft geen restart_workflow.
- [Playwright op NixOS](playwright-nixos.md) — Nix-chromium via executablePath.
- [e2e-menu "Failed to fetch" login](e2e-monteur-login-failed-to-fetch.md) — tunnelflakiness of stale .env-domein.
- [runTest infra-failure diagnosis](runtest-infra-failure-diagnosis.md) — bij "Maximum iterations" eerst Playwright zelf checken, anders curl-bewijs.
- [E2e-suite mutex contention](e2e-suite-mutex.md) — eigen mutex-sleutel per suite of ruimere web-timeout.
