---
name: Expo-app als web-PWA onder een padprefix
description: Durable lessen voor het uitleveren van een Expo/React Native-app als web-PWA op een subpad van hetzelfde domein
---

- Expo's eigen HTML-schil (`app/+html.tsx`) werkt alleen bij `web.output: "static"`; bij `"single"` moeten PWA-tags (manifest, SW-registratie) ná de export in de gegenereerde index.html geïnjecteerd worden.
- **Een PWA-service-worker die alleen de HTML-shell pre-cachet start offline niet koud op**: de shell verwijst naar gehashte bundels die nog niet in de cache zitten. Pre-cache het volledige export-manifest (bouwstap genereert de bestandslijst; SW haalt die bij install en `cache.addAll`'t alles).
- Meerdere service workers op één domein: de root-scope worker moet subpad-scopes expliciet overslaan in zijn fetch-handler, anders serveert hij de verkeerde app-shell op dat subpad.
- Web-terugval voor native bestands-API's: kleine data (foto's, handtekeningen) als data-URL's in localStorage werkt en rendert direct in `<Image>`, maar de ±5 MB-quota beperkt de offline buffer — expliciet falen bij vol, en nooit `pad.split("/").pop()` op een data-URL loslaten voor bestandsnamen.
- Same-origin srcDoc-iframe is een volwaardige web-vervanger voor react-native-webview: injectie via `contentWindow.eval`, berichten via `parent.postMessage` met een herkenbaar prefix.
- **Why:** een native app webwaardig maken faalt stil op file-system/WebView/camera en op offline-herstart; deze valkuilen kwamen allemaal uit review of meting, niet uit de compiler.
- **How to apply:** bij elke web-uitlevering van native schermen eerst per native API het browsergedrag meten; SW-offline-claims alleen doen na een koude-start-test zonder netwerk.

**HTML zonder Cache-Control wordt heuristisch gecachet** — de desktop-SPA-fallback en root-sw.js gingen alleen met etag/last-modified de deur uit; een telefoon die vóór MONTEUR_NU_01 ooit /app/ bezocht bleef daardoor de oude desktop-HTML uit de eigen HTTP-cache tonen zonder de server te raadplegen. **Regel:** élke HTML/sw/manifest/versie-respons in Caddy expliciet `Cache-Control: no-cache` geven (sinds 1ea8c0b4 afgedwongen in deploy/Caddyfile, zowel /app-handle als @static en SPA-fallback).
