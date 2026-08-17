## 2026-08-17 — Social-mediamodule (SOCIAL_01): kalender, publicatiemotor en koppelingenbeheer

- **Uitvoering:** nieuwe module (fase 1 fundament + fase 2 publicatiemotor) | **Kwaliteit:** hoog | **Risico:** midden (nieuwe tabellen + planner, kanaal-API's volgen in fase 3)

Nieuwe module **Social media** onder Commercie (`/crm/social`, zichtbaar vanaf crm-niveau 3) voor LinkedIn, Facebook, Instagram en TikTok per werkmaatschappij:

1. **Fundament (migratie 0063).** Drie tabellen: `social_koppelingen` (uniek per werkmaatschappij+kanaal; modus *publiceren* of *klaarzetten*; verloopbewaking), `social_berichten` (gedeelde tekst, media, planning, koppeling aan campagne/klant/gebouw) en `social_bericht_kanalen` (per-kanaal tekstvariant, plaatsingsstatus, pogingen, cijfers).
2. **Kanaaleisen fail-closed.** Eisen per kanaal (tekstlimiet, TikTok alleen video, Instagram media verplicht + max 25/dag) staan server-side; **plannen wordt met 422 + redenenlijst geweigerd** als één kanaal niet voldoet — nooit half plannen. Statusmachine concept → klaar → gepland → geplaatst met terug-stappen; bewerken alleen in concept/klaar.
3. **Publicatiemotor.** Minuut-planner met atomaire claim, backoff en max 3 pogingen bij tijdelijke storingen. Een bericht raakt **nooit stilzwijgend niet geplaatst**: mislukking of klaargezet concept levert altijd een werkbak-taak op voor de planner (dedupe per kanaalrij). Koppeling-verloop geeft 14 dagen vooraf een werkbak-taak. Kanaal-adapters zijn nu fail-closed stubs ("nog geen API-toegang"); echte OAuth + cijfers volgen in fase 3 (vergt client-id/secret per kanaal).
4. **Rechten.** crm 3 = bekijken/opstellen/klaarzetten; crm 4 = plannen/terughalen + koppelingenbeheer. Koppelingen-API geeft nooit tokens terug (alleen `heeft_toegang`).
5. **Frontend.** `/crm/social` met drie tabs: Kalender (week/maand), Berichten (opsteller met live tekentellers per kanaal, per-kanaal tekst-override, media-upload, campagnekoppeling) en Koppelingen (crm 4). Sidebar-item "Social media" onder Commercie.

Na architect-review aangescherpt (migratie **0064**): (a) de planner claimt met een echte **lease-status 'bezig'** — een trage kanaal-call kan nooit door een tweede tick dubbel geclaimd worden, verlopen leases (>10 min) worden hersteld; (b) elke tick **reconcileert** terminale kanaalrijen zonder werkbak-taak (crash tussen status-write en taak-aanmaak kan de invariant niet meer breken); (c) de berichtuitkomst is **eerlijk**: 'geplaatst' alleen als álle kanalen echt geplaatst zijn, anders 'deels_geplaatst' of 'mislukt'.

Bewijs: `scripts/src/verificatie-social01.ts` — 23/23 groen via https-sessie: kanaaleisen, 422 met drie redenen (TikTok video / Instagram media / LinkedIn-lengte), statusmachine-weigering, planner-tick → kanaalrij mislukt + werkbak-taak met juist actiepad + berichtuitkomst 'mislukt' (niet 'geplaatst'), koppeling-CRUD incl. 409 op dubbele en token-vrije antwoorden.

