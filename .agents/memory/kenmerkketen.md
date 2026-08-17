---
name: NUMMER_01 kenmerkketen
description: ENK-nummerreeksen G/M/C/O/I/F — bindende regels voor alle toekomstige nummer-/kenmerkwijzigingen.
---
Bindende regels (opdracht NUMMER_01, gebouwd + bewezen 8 aug 2026):
- Nummers uit DB-sequences (`seq_nummer_g/m/c/o/i`) of `factuurnummer_tellers` (fiscaal per BV) — nooit max+1. Uitzondering: F-subnummer per offerte via max+1 onder `pg_advisory_xact_lock(864201, offerteId)`.
- Kenmerk (bv. `BP-G156/C590/O405`) wordt altijd berekend uit de actuele keten (`lib/kenmerk.ts`), beweegt mee bij gebouwwissel; alleen bij versturen/definitief maken bevroren als momentopname.
- Offertes/calculaties kopiëren = nieuw nummer (kopieer-endpoints, kopie=concept). Inkoop (projectbon + magazijnorder) wijzigen na versturen = letterherziening (`I088a`) + snapshot in `inkoop_versies` (unieke constraint bron_tabel+bron_id+herziening); herziening transactioneel met row-lock.
- Verzonden offertes zijn server-side alleen-lezen (guard op `portaalStatus === "verzonden"` e.a.); verzenden zelf is atomair (tx + advisory-lock 864202).
- Fiscaal factuurnummer verkoop: uitsluitend via `POST /facturen/:id/definitief` (row-lock + hercheck in tx); POST/PATCH kunnen het nooit zetten (409).
- C-reeks leeft op `mod_calc_headers` (calculatiemodule), niet op legacy `calculaties`; beide delen `seq_nummer_c` (migratie 0018). `offertes.offertenummer`/`ons_kenmerk` en magazijn `nummer` (INK-…) zijn legacy weergavevelden.
- Voorraadinkoop deelt de I-reeks met projectbonnen; kenmerk aan magazijn-gebouw uit `magazijn_instellingen`.
- Accountant-actiepunt (open): bestaande fiscale reeks per BV eenmalig doortellen in `factuurnummer_tellers` vóór eerste definitieve factuur.
- A-reeks (algemene inkoop, NP_INKOOP_01): `seq_nummer_a` op eigen tabel `algemene_inkopen`, weergave `A%03d`; géén kenmerkketen (niet projectgebonden). Factuurstroom matcht op A-nummers: >1 nummer = nooit koppelen (tijdlijnmelding), koppelen zelf = atomaire conditionele update (status besteld + factuur_id IS NULL). Vrijgeven na goedkeuring uitsluitend via de motor — hoofdbeheerder kan de gate niet overslaan.
Bewijs: `scripts/src/bewijs-nummer01-kenmerkketen.ts` (punten A–I); algemene inkoop: `scripts/src/verificatie-np-inkoop01.ts`.
Valkuil: magazijn-inkooporderroutes moeten op `/magazijn/...`-prefix staan (spec/frontend); stonden fout.
Weergave-regel (aug 2026): het ketenkenmerk hoort prominent bovenaan elke Projectaanpak-detailpagina via het gedeelde KenmerkKop-component; interne registratienummers (zoals CALC-jjjj-nnnn) nooit prominent tonen als "het" nummer.
