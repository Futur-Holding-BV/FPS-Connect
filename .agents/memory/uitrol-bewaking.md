---
name: Uitrol-bewaking (UITROL_BEWAKING_01)
description: Hoe productie zelf bewaakt of het achterloopt op de laatst gemelde uitrol
---
De deploy-workflow POSTt na élke run (if: always, nooit fataal) verwacht commit + falende stap (/tmp/faalstap.txt-marker; ontbreekt bij vroege checkout/setup-fout → "onbekend") + run_id naar /api/uitrol/rapport. Sleutel UITROL_RAPPORT_SLEUTEL: GitHub secret → base64 over SSH (nooit rauw in de remote-commandoregel; injectierisico, review-afwijzing) → deployscript → compose-env api. Endpoint fail-closed: zonder env 503, timingSafeEqual, cancelled genegeerd.

**Ordening:** "laatste uitrol" altijd kiezen op run_id DESC NULLS LAST, id DESC — GitHub run-id's zijn monotoon, dus een vertraagd binnengekomen oude melding kan nooit winnen (review-eis).

**Werkbak:** bron uitrol_achterloop, dedupSleutel bevat het verwachte commit → syncBron sluit het item vanzelf zodra een geslaagde uitrol de versies weer gelijktrekt. Voeder voedUitrolAchterloop doet niets zonder GIT_COMMIT (dev). /api/versie geeft achterloop+verwacht_commit (30s cache); versie-badge kleurt amber.

## CI_SIGNAAL_01 (aug 2026)
- Naast uitrol_rapporten bestaat ci_rapporten: de CI-workflow meldt élke main-run via POST /api/ci/rapport (zelfde sleutel UITROL_RAPPORT_SLEUTEL). Werkbak-bron `ci_rood` opent bij failure, sluit bij nieuwere groene run.
- Race-lessen (architect-afwijzing): voeders die "lees laatste stand → syncBron" doen moeten per bron geserialiseerd (promise-ketting in bewakingsloop.ts; één-proces-aanname — bij horizontale schaal DB-slot nodig). Re-runs delen run_id: altijd run_attempt meesturen/opslaan en ordenen op (run_id, run_attempt, id).
- /api/versie-achterloop vergelijkt nu met de nieuwste main-commit uit UNION van beide rapporttabellen (GitHub run-id's zijn per repo monotoon over workflows heen).
