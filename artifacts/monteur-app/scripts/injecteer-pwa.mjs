#!/usr/bin/env node
// Injecteert de PWA-onderdelen in de Expo web-export (dist-web/index.html).
//
// Waarom niet via app/+html.tsx: die HTML-schil wordt door Expo alleen
// gebruikt bij web.output "static"; deze app exporteert bewust als "single"
// (één SPA-shell voor alle 58 routes). Daarom patchen we de gegenereerde
// index.html ná de export: manifest-link, iOS-meta's en de service-worker-
// registratie voor scope /app/.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const pad = resolve(process.argv[2] ?? "dist-web/index.html");
let html = readFileSync(pad, "utf8");

if (html.includes("manifest.webmanifest")) {
  console.log("injecteer-pwa: al gepatcht, niets te doen");
  process.exit(0);
}

const kop = [
  '<meta name="theme-color" content="#212631" />',
  '<link rel="manifest" href="/app/manifest.webmanifest" />',
  '<link rel="apple-touch-icon" href="/app/icons/apple-touch-icon.png" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-title" content="FPS Monteur" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  "<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/app/sw.js',{scope:'/app/'}).catch(function(){})})}</script>",
].join("");

html = html.replace(/lang="en"/, 'lang="nl"');
if (!html.includes("</head>")) {
  console.error("injecteer-pwa: FOUT — geen </head> gevonden in " + pad);
  process.exit(1);
}
html = html.replace("</head>", `${kop}</head>`);
writeFileSync(pad, html);
console.log("injecteer-pwa: PWA-tags toegevoegd aan " + pad);
