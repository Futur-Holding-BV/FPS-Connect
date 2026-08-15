---
name: auth.ts terugkerende mangeling
description: routes/auth.ts raakt herhaaldelijk gemangeld door reverts/merges; hoe herkennen en herstellen
---

`artifacts/api-server/src/routes/auth.ts` is nu twee keer door revert/merge-verkeer
in een kapotte hybride staat beland (undefined `id`-lookups in login/2FA/reset,
mobiel token als rauwe hex i.p.v. `maakToken`, wachtwoord-wijzigen-route vervangen
door een tweede `/auth/taal`).

**Waarom verraderlijk:** de dev-server (tsx/esbuild) en zelfs login-e2e kunnen
tegen een oudere werkende compilatie draaien, dus "login werkt" bewijst niet dat
de bron gezond is. Alleen `tsc --noEmit` op api-server toont het.

**How to apply:** bij elke merge/revert die auth.ts raakt: draai de api-server
typecheck; bij TS2304 `id`-fouten het hele bestand herstellen uit de laatste
commit waar tsc groen was (niet regel-voor-regel patchen — de mangeling is een
mix van twee versies).

**Update 8 aug 2026:** ook opname.ts is bij taak-merges twee keer opnieuw gemangeld (bodies onder verkeerde koppen, ongedefinieerde variabelen). Vaste remedie: `git checkout <laatst geverifieerde commit> -- <bestand>` + volledige typecheck. CI bewaakt nu dubbele declaraties via `check-dubbele-routes` (@workspace/scripts), maar verschoven bodies zónder duplicaat vangt alleen tsc. Na ELKE taak-merge die routes raakt: typecheck draaien vóór deploy-vertrouwen.

**Procesfix (MERGE_01, 8 aug 2026):** de oorzaak is aangepakt: (1) post-merge.sh sync-check is blokkerend (achterlopen op main / ontbrekend token / fetch-fout = exit 1, geen merge); (2) stap 7a lost merge-conflicten niet meer op met `--ours` (dat overschreef hersteld werk) maar blokkeert met faalmelding; (3) deploy.yml draait typecheck + check-dubbele-routes + klant-poort-check vóór de eerste VPS-stap. Let op: taak #840 voegde een bewuste NOODFIX-bypass (workflow_dispatch input) op de deploy-gate toe.

- **Vangnetten sinds 15 aug 2026 (taak #938):** blokkerende git pre-push hook (`.githooks/pre-push`) = opmaakschade-check (`scripts/git/check-opmaakschade.mjs`, >300 regels netto verschil zonder `[grote-wijziging]`-marker, rename-ontwijking gedicht via -M20%) + volledige typecheck; zelfde duo als post-merge stap 6b/6c over de volledige presync..HEAD-range, herhaald na de 7a-merge vóór de push. Bewuste grote wijziging = marker in commit-boodschap.
- 2026-08-15: merge van een rapporten-dedupe-taak mangelde rapporten.ts in een NIEUWE vorm: geen versie-mix maar opmaakschade — elke `{`/`;` op een eigen regel (769→2071 regels), waardoor ASI na `return` breekt (esbuild "Expected ;"). Onderzoek: GEEN formatter in de repo verantwoordelijk (geen .prettierrc/format-script/hook; prettier stond ongebruikt in devDependencies en is verwijderd — prettier produceert deze stijl sowieso niet). Bron = het bewerk-/mergeproces van de taakagent zelf. Remedie identiek: bestand herstellen uit laatst goede commit + bedoelde wijziging bewust her-toepassen; tsc/esbuild = detector.
- 2026-08-09 (task 852): merge van task 849 mangelde auth.ts opnieuw (id-substituties in alle where-clauses, dubbele functies in QR-route, activatie-atomiciteit weg). Herstel: `git checkout <laatst geverifieerde commit> -- auth.ts` + bewuste her-toepassing van de legitieme wijziging (platform-QR). tsc bleef enige detector; check-dubbele-routes was groen ondanks mangeling.

**Incident 3 (15 aug 2026, uitvoering/detail.tsx):** taakmerge liet een compleet import-hunk vallen (regie-tab-exports + lucide-icoon) terwijl de gebruikende JSX wel meekwam → TS2304 bij post-merge stap 6c. Herstel: ontbrekende imports terugzetten (niet hele bestand checkouten als alleen imports missen). Let op: taakagent-branches kunnen ook een eerder gedropte workflow-bestandswijziging opnieuw binnenbrengen; verwijderen uit de historie met `git filter-branch --index-filter "git update-index --cacheinfo 100644,$(git rev-parse origin/main:PAD),PAD" -- origin/main..HEAD` (PAT heeft bewust geen workflow-scope).
