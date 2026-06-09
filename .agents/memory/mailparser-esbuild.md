---
name: mailparser + esbuild
description: mailparser intern vereist nodemailer; nodemailer is geëxternaliseerd in build.mjs maar moet ook geïnstalleerd zijn.
---

## Regel
`mailparser` importeert intern `nodemailer/lib/addressparser`. `nodemailer` staat in de externals-lijst van `artifacts/api-server/build.mjs`, waardoor esbuild het niet bundelt. Maar dan moet `nodemailer` ook als runtime-dependency in `artifacts/api-server/package.json` staan, anders crasht de server bij opstarten met `Cannot find module 'nodemailer/lib/addressparser'`.

**Why:** esbuild externaliseert het package (laat het ongebundeld), maar Node.js moet het dan zelf kunnen vinden in node_modules.

**How to apply:** Bij toevoegen van packages die intern nodemailer gebruiken (mailparser, nodemailer-zelf), altijd `pnpm --filter @workspace/api-server add nodemailer` uitvoeren als het nog niet als dependency staat.
