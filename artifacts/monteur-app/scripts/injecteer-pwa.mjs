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

const onderdelen = [
  '<meta name="theme-color" content="#212631" />',
  '<link rel="manifest" href="/app/manifest.webmanifest" />',
  '<link rel="apple-touch-icon" href="/app/icons/apple-touch-icon.png" />',
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-title" content="FPS Monteur" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
  "<script>if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/app/sw.js',{scope:'/app/',updateViaCache:'none'}).catch(function(fout){console.error('FPS Monteur service worker kon niet registreren',fout)})})}</script>",
];

// Canonicaliseer in plaats van alleen ontbrekende byte-exacte tags toe te
// voegen. Als Expo later zelf een anders geformatteerde manifest-link of
// PWA-meta toevoegt, mag de browser nooit een oudere eerste koppeling kiezen.
const bestaandePwaOnderdelen = [
  /<link\b(?=[^>]*\brel=["']manifest["'])[^>]*>\s*/gi,
  /<link\b(?=[^>]*\brel=["']apple-touch-icon["'])[^>]*>\s*/gi,
  /<meta\b(?=[^>]*\bname=["']theme-color["'])[^>]*>\s*/gi,
  /<meta\b(?=[^>]*\bname=["']mobile-web-app-capable["'])[^>]*>\s*/gi,
  /<meta\b(?=[^>]*\bname=["']apple-mobile-web-app-capable["'])[^>]*>\s*/gi,
  /<meta\b(?=[^>]*\bname=["']apple-mobile-web-app-title["'])[^>]*>\s*/gi,
  /<meta\b(?=[^>]*\bname=["']apple-mobile-web-app-status-bar-style["'])[^>]*>\s*/gi,
  /<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?navigator\.serviceWorker\.register\((?:(?!<\/script>)[\s\S])*?<\/script>\s*/gi,
];
for (const patroon of bestaandePwaOnderdelen) {
  html = html.replace(patroon, "");
}

html = html.replace(/lang=["'][^"']*["']/, 'lang="nl"');
if (!html.includes("</head>")) {
  console.error("injecteer-pwa: FOUT — geen </head> gevonden in " + pad);
  process.exit(1);
}
html = html.replace("</head>", `${onderdelen.join("")}</head>`);
writeFileSync(pad, html);
console.log(`injecteer-pwa: canonieke PWA-kop geschreven naar ${pad}`);
