---
name: Uitrol-bewaking (UITROL_BEWAKING_01)
description: Hoe productie zelf bewaakt of het achterloopt op de laatst gemelde uitrol
---
De deploy-workflow POSTt na élke run (if: always, nooit fataal) verwacht commit + falende stap (/tmp/faalstap.txt-marker; ontbreekt bij vroege checkout/setup-fout → "onbekend") + run_id naar /api/uitrol/rapport. Sleutel UITROL_RAPPORT_SLEUTEL: GitHub secret → base64 over SSH (nooit rauw in de remote-commandoregel; injectierisico, review-afwijzing) → deployscript → compose-env api. Endpoint fail-closed: zonder env 503, timingSafeEqual, cancelled genegeerd.

**Ordening:** "laatste uitrol" altijd kiezen op run_id DESC NULLS LAST, id DESC — GitHub run-id's zijn monotoon, dus een vertraagd binnengekomen oude melding kan nooit winnen (review-eis).

**Werkbak:** bron uitrol_achterloop, dedupSleutel bevat het verwachte commit → syncBron sluit het item vanzelf zodra een geslaagde uitrol de versies weer gelijktrekt. Voeder voedUitrolAchterloop doet niets zonder GIT_COMMIT (dev). /api/versie geeft achterloop+verwacht_commit (30s cache); versie-badge kleurt amber.
