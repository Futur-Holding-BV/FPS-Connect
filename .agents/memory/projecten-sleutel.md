---
name: Projecten-sleutel & bedragen-strip
description: Modulesleutel 'projecten' (BOUW_01) — niveau-semantiek, server-side bedragen-strip, meldingenroutes en valkuilen bij nieuwe lees-routes.
---

# Projecten-sleutel (BOUW_01, goedgekeurd door René 09-08-2026)

Opdrachten (`routes/opdrachten.ts`) en werkvoorbereiding (`routes/werkvoorbereiding.ts`) vallen onder sleutel **`projecten`** met AFWIJKENDE niveau-semantiek: **1 = lezen zónder bedragen, 2 = lezen mét bedragen, 3 = schrijven** (niet de 1=lezen/2=schrijven-conventie). Alleen `POST /offertes/:id/maak-opdracht` blijft `offertes` 2. Materiaal-aanvragen behandelen = projecten 2/3.

**Bedragen-strip is server-side**: `magBedragenZien(req)` (hoofdbeheerder of projecten≥2); mappers hebben `toonBedragen`-parameter, gestripte velden worden **null** (OpenAPI nullable). Financieel-integrale routes (`/materiaal`, `/nacalculatie`, `/inkoopcoach`, `/onderaanneming`) staan op niveau 2, niet gestript.

**Why:** monteurs/uitvoerders moeten hoeveelheden/uren/leverdatums zien maar nooit tarieven/inkoopprijzen; UI-verbergen is geen access control.

**How to apply:** elke NIEUWE lees-route onder projecten:1 moet ofwel bedragvelden strippen (null) ofwel op niveau 2 staan — reviewer vond 3 lekkende routes bij de eerste ronde. `gewenste_leverdatum`, `levertijd_weken`, uren-velden blijven altijd zichtbaar.

Meldingen (§4-6): werkbak-bronnen `meerwerk_melding`/`materiaal_afwijking`/`toebehoren_aanvraag`; `lib/bouwMeldingen.ts` adresseert via functietitels Werkvoorbereider (doen) + vaste cc Projectleider (weten), groep-vangnet op projecten≥3. Materiaalaanvraag vereist `volgens_opdracht` (ja|wijkt_af|weet_niet). Toebehoren: `materiaal_aanvragen.soort='toebehoren'`, opdracht_id null; uitgifte zonder opdracht van artikel met categorie ~toebehoren krijgt `voorraad_mutaties.kostenrubriek='gereedschap_toebehoren'`.

Presets: migraties 0026 (offertes→projecten mapping, 1→2 en ≥2→3) en 0028 (veld-presets, alleen-verhogen; kolom heet `profielen.systeem`, NIET is_systeem). Legacy-rol 'monteur' fallback heeft projecten/magazijn/gereedschappen 1.
