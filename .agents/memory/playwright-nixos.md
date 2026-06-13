---
name: Playwright op NixOS
description: Waarom Playwright in dit repo de Nix-chromium gebruikt i.p.v. de meegeleverde browser
---

De door `playwright install chromium` gedownloade browser (chromium-headless-shell)
start NIET op NixOS: het is een prebuilt binary die linkt tegen libs als
`libglib-2.0.so.0` die niet op het standaard dynamisch pad staan, en de interpreter
matcht niet (geen FHS).

**Regel:** laat Playwright de Nix-chromium gebruiken via `launchOptions.executablePath`.
Installeer chromium met de package-management `installSystemDependencies(["chromium"])`
en zoek het pad dynamisch op met `which chromium` (niet het /nix/store-pad hardcoden;
dat verandert bij rebuilds). Overschrijfbaar via `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

**Where:** `scripts/playwright.config.ts` (e2e-monteur startmenu-test).

**How to apply:** elke nieuwe Playwright-config in dit repo moet dezelfde
executablePath-aanpak nemen; `playwright install-deps` werkt niet (geen apt/root op Nix).
