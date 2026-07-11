## 2026-07-11 — Escalatiebewaking gekoppeld aan offerte & HRM-besluiten (Task #543)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; motor was al generiek)

**Nieuw gebouwd:**
- **E-mailnotificatie bij indiening**: `stuurGoedkeuringIndienenMail()` toegevoegd aan `email.ts` (soort `goedkeuring_indiening`). De `dienIn()`-functie in `goedkeuring-engine.ts` stuurt nu direct na indiening een notificatie naar de aangewezen goedkeurder (primair via `goedkeurderGebruikerId`, vervanger, of hoofdbeheerder als fallback). Voorheen ontving de goedkeurder alleen uren-later escalatieberichten.
- **HRM-besluit documenttype**: `hrm_besluit` toegevoegd aan `DOCUMENT_TYPE_LABELS` in `goedkeuringsbeleid.tsx` zodat het dashboard aanvragen correct labelt als "HRM-besluit (contractverlenging / salariswijziging)".
- **Documenttype-dropdown in beleidsscherm**: documenttype-invoerveld in beleidsregel-formulier gewijzigd van vrije tekst naar vaste Select-dropdown (10 erkende types). Foutbestendig aanmaken van beleid voor "offerte" en "hrm_besluit".
- **GoedkeuringWidget in BesluitPaneel**: formele goedkeuringsectie (objectType="hrm_besluit") toegevoegd in `medewerker-contracten.tsx`, direct boven het besluit-formulier.

**Bewijs:** `pnpm run typecheck` groen (alle packages); api-server bouwt en start; `MailSoort` uitgebreid met `goedkeuring_indiening`.

## 2026-07-11 — Governance & Approval Engine — uitbreiding documenttypen (Task #522)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; backend engine was al generiek, geen backend wijzigingen nodig)

**Nieuw gebouwd:**
- **Inspecties** (`/inspecties/:id`): `GoedkeuringWidget` toegevoegd na de statusworkflow-knoppen (objectType="inspectie", documentType="inspectie"). Indienen-knop alleen zichtbaar als de inspectie afgerond is.
- **Arbeidsovereenkomsten** (`/personeel/:id`, ContractKaart info-tab): `GoedkeuringWidget` toegevoegd met objectType="arbeidsovereenkomst". Toont het brutosalaris als bedrag. Altijd beschikbaar ongeacht contractstatus.
- **Weekstaten / Urenstaten** (`/uren/weekstaten`, WeekStaatDetailDialog): `GoedkeuringWidget` toegevoegd na de afwijzingsreden-sectie (objectType="weekstaat"). Indienen-knop alleen bij status "ingediend".
- **Opleverrapporten** (`/rapporten`, rapportenlijst): `GoedkeuringWidget` per rapport-item in de actieskolo (objectType="opleverrapport"). Indienen-knop bij conceptrapporten.
- **Certificaten** (`/gebouwen/:id/print`, werkbalk): `GoedkeuringWidget` met objectType="certificaat" toegevoegd naast de bestaande "Certificaat accorderen"-knop. Zichtbaar zodra de certificaat-sectie actief is in de rapportsamensteller. Indienen-knop toont alleen bij definitief rapport vóór accorderen.
- **Projectafsluitingen** (`/opdrachten/:id`): `GoedkeuringWidget` toegevoegd direct onder de projecttitel (objectType="projectafsluiting"). Zichtbaar + indienen-knop alleen als opdrachtstatus "afgerond" is. Klasse `print:hidden` zodat PDF-export niet beïnvloed wordt.
- **Beleidsscherm** (`/beheer/goedkeuringsbeleid`): `DOCUMENT_TYPE_LABELS`-map en `documentTypeLabel()`-helper toegevoegd; de kolommen "Documenttype" in zowel de beleidsregelstabel als de aanvragentabel tonen nu een leesbare Nederlandse naam (bijv. "Arbeidsovereenkomst", "Inspectierapport", "Weekstaat / Urenstaat") in plaats van de ruwe sleutelstring.

**Geen backend wijzigingen:** de goedkeuring-engine is volledig generiek; hij accepteert elk `objectType`-string-pair zonder codebaarheid.

**Bewijs:** `pnpm --filter @workspace/firevault run typecheck` groen; beide workflows draaien; API healthcheck 200.

## 2026-07-11 — Governance & Approval Engine — offertes pilotkoppeling

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief op bestaande motor + offerte-routes, geen bestaande transitiepaden gebroken)

**Nieuw gebouwd:**
- **Goedkeuringsgate offerte verzenden**: `POST /offertes/:id/verzenden` controleert nu of het goedkeuringsbeleid een formele aanvraag vereist voor dit offertebedrag; bij een openstaand of ontbrekend akkoord blokkeert verzending met HTTP 422 + code `GOEDKEURING_VEREIST`. Dezelfde check is ook in de werkflow-precheck (`concept → verzonden`) gebouwd.
- **Materiële-wijzigingsguard**: een bedragwijziging via `PATCH /offertes/:id` nadat een aanvraag goedgekeurd is, markeert de aanvraag automatisch als "vervangen" (via nieuwe helper `vervangGoedgekeurdeAanvraag` in goedkeuring-engine.ts). Zo kan een offerte nooit in gewijzigde vorm worden verzonden op basis van een verouderd akkoord.
- **Offerte intrekken**: nieuw endpoint `POST /offertes/:id/intrekken` (bevoegdheid offertes:3); reden verplicht; transitie via WorkflowService naar status "ingetrokken". Nieuwe overgang `{ van: ["verzonden","bekeken"], naar: "ingetrokken" }` in offerteConfig. Vanaf "ingetrokken" is heropenen als concept mogelijk.
- **Goedkeuring-tab in Offerte Studio**: nieuw tabblad "Goedkeuring" in `studio.tsx` met de bestaande `GoedkeuringWidget` (objectType="offerte"). Toelichting over het proces en de materiële-wijzigingsregel zijn opgenomen als contextparagraaf. Indienen-knop alleen zichtbaar in concept-status.
- **Statuslabels "ingetrokken"**: toegevoegd aan `STATUS_KLEUR`/`STATUS_LABEL` in `studio.tsx` (leigrijs) en `STATUS_KLEUR` in `index.tsx`.
- **OpenAPI**: `POST /offertes/{id}/intrekken` + schema `OfferteIntrekkenInput` toegevoegd; codegen uitgevoerd → `useIntrekkenOfferte`-hook gegenereerd in `lib/api-client-react`.
- **Engine helpers**: `haalGoedgekeurdeAanvraag(db, objectType, objectId)` en `vervangGoedgekeurdeAanvraag(db, objectType, objectId, actor, reden)` toegevoegd aan goedkeuring-engine.ts en geëxporteerd.

**Hardening reden-verplichting (n.a.v. code review, ronde 1):** twee lagen toegevoegd zodat intrekken zonder reden onmogelijk is: (1) precheck in de `verzonden|bekeken → ingetrokken` workflow-transitie vereist `ctx.params.reden`; (2) expliciete 422-blokkade in `PATCH /offertes/:id` op `status: "ingetrokken"` met verwijzing naar het dedicated `/intrekken`-endpoint.

**Hardening portaal + UI-intrekken-flow (n.a.v. code review, ronde 2):**
- `portaal.ts POST /portaal/:token/ondertekenen`: blokkeert nu ook bij `offerte.status === "ingetrokken"` (409), zodat een ingetrokken offerte nooit meer ondertekend kan worden ongeacht de portaalstatus.
- `studio.tsx`: "ingetrokken" verwijderd uit de generieke status-dropdown (`VOLGENDE_STATUSSEN`). In plaats daarvan een dedicated "Intrekken"-knop (zichtbaar bij verzonden/bekeken, bevoegdheid offertes:3) die een eigen dialoog opent. De dialoog vereist een vrije-tekst reden en roept `POST /offertes/:id/intrekken` aan via de gegenereerde `useIntrekkenOfferte`-hook. Na bevestiging worden de queries geïnvalideerd en toont een toast.

**Hardening gecombineerde PATCH-bypass + bevoegdheids-afstemming (n.a.v. code review, ronde 3):**
- `PATCH /offertes/:id`: blokkeert nu een gecombineerde bedrag+status="verzonden" in één aanroep (422, `GECOMBINEERDE_BEDRAG_STATUS_VERBODEN`). Zo kan een goedkeuringscheck nooit passeren op het oude bedrag terwijl het nieuwe bedrag de goedkeuring al zou invalideren. Volgorde blijft correct: bedrag opslaan (apart PATCH) → hernieuwde goedkeuringsaanvraag indien vereist → verzenden.
- `studio.tsx`: intrekken-knop gated op `kanIntrekken` = `heeftNiveau("offertes", 3)` in lijn met de backend-vereiste.

**Bewijs:** `pnpm run typecheck` groen (alle 5 packages, vier keer — na elke correctieronde); API server herstart zonder fouten.

## 2026-07-11 — Poortwachter (Wet Verbetering Poortwachter) — Bouwstuk 1

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief, geen bestaande routes geraakt)

**Gebouwd:**
- **DB**: twee nieuwe tabellen — `poortwachter_dossiers` (1:1 aan ziekmelding, cascade-delete) en `poortwachter_mijlpalen` (7 vaste WvP-types per dossier, deadline als text ISO-datum afgeleid van start_datum + dag-offset). DB push geslaagd.
- **7 WvP-mijlpalen** met wettelijke dag-offsets: Probleemanalyse (42), Plan van aanpak (56), UWV-melding langdurig ziekte (294), Eerstejaarsevaluatie (364), Arbeidsdeskundig onderzoek (609), WIA-aanvraag (637), Einde loondoorbetaling (728).
- **Backend** (hrm.ts):
  - `GET /hrm/poortwachter` — alle dossiers met mijlpalen (voor signalering); vereist `personeel:1`.
  - `GET /hrm/ziekmeldingen/:id/poortwachter` — dossier ophalen of idempotent aanmaken met alle 7 mijlpalen; vereist `personeel:1`.
  - `PATCH /hrm/poortwachter/:dossierId/mijlpalen/:type` — mijlpaal afvinken (`afgerond: true/false`) of notitie bijwerken; vereist `personeel:2`. Legt `bijgewerktDoorId` vast.
  - `mijlpaalStatus()` berekent live status: `afgerond` / `buiten_termijn` (< vandaag) / `nadert` (≤ 14 dagen) / `open`.
- **Frontend** (`poortwachter-sheet.tsx`):
  - Sheet met 7 uitvouwbare mijlpaal-rijen; kleurcodering per status (groen/rood/amber/grijs).
  - Kritiek waarschuwingsbanner als er mijlpalen `buiten_termijn` of `nadert` zijn.
  - Per mijlpaal: afvinken, notitieveld met contextplaceholder (bijv. "PvA ondertekend..."), bijgewerkt-door melding.
  - Laadt dossier via `useGetPoortwachterDossier` (auto-aanmaken); muteert via `usePatchPoortwachterMijlpaal`.
- **Integratie personeel/index.tsx**: "Poortwachter"-knop op elke actieve ziekmelding-kaart; opent de sheet.
- **OpenAPI** + codegen: `PoortwachterDossier`, `PoortwachterMijlpaal`, `PoortwachterMijlpaalInput` + 3 paden; codegen + typecheck groen.

## 2026-07-11 — Wagenpark: voertuig-melding in monteur-app + Doorzetten naar garage

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen bestaande routes gebroken)

**Gebouwd:**
- **Monteur-app menu** — "Voertuig melden" toegevoegd aan het Meer-menu in `menu.tsx` (icoon: car-outline, navigeert naar het bestaande `/voertuig-melding`-scherm).
- **Status `doorgezet_garage`** — nieuw statustype toegevoegd aan the `MeldingStatus`-union in `wagenpark-melding-types.ts`, inclusief label ("Doorgezet naar garage") en kleur (teal).
- **MailSoort `voertuig_melding_garage`** — toegevoegd aan de MailSoort-union in `email.ts`.
- **Backend route `POST /wagenpark/meldingen/:id/doorzetten-garage`** — vereist `wagenpark:2`; haalt meldingdetails op (voertuig + monteur via join), zet status op `doorgezet_garage`, voegt een tijdgestempelde opvolgnotitie toe en stuurt de garage een volledig HTML-e-mailbericht met voertuiginfo, AI-diagnose, omschrijving en optionele FPS-notitie. Mail is fire-and-forget: bij mislukken (of unconfigured) wordt de statuswijziging toch opgeslagen.
- **PATCH geldigeStatussen uitgebreid** — `doorgezet_garage` is nu ook geldig als status-update via het bestaande PATCH-endpoint.
- **MeldingKaart** — "Doorzetten naar garage"-knop zichtbaar bij open meldingen (niet bij `doorgezet_garage`/`opgelost`/`afgewezen_duplicaat`); opent een dialog met e-mailadres (verplicht), garagenaam en extra notitie; na bevestigen: POST naar de nieuwe route, toast-bevestiging, queryInvalidatie voor beide meldingen-querykeys.
- **OpenAPI** — `POST /wagenpark/meldingen/{id}/doorzetten-garage` + `DoorzettenGarageInput`-schema toegevoegd; codegen en typecheck groen.

## 2026-07-11 — Verlof: ziekte-ADV koppeling (automatisch intrekken ADV bij ziekmelding)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen bestaande routes gebroken, koppeling is fail-safe)

**Gebouwd:**
- **`koppelZiekteAanAdv()`** — nieuwe helper in `hrm.ts`: zoekt alle overlappende ADV/ATV-aanvragen (`hoofdcategorie = 'adv_atv'`, status `aangevraagd` of `goedgekeurd`) die de ziekteperiode overlappen, zet ze atomair op `ingetrokken`, corrigeert het verlofsaldo via de bestaande `pasVerlofSaldoAan`-helper (–aantalUren voor goedgekeurde aanvragen) en schrijft een auditlogregel per aanvraag. Idempotent: al-ingetrokken aanvragen worden overgeslagen.
- **POST /ziekmeldingen** — roept the koppeling automatisch aan na elke nieuwe ziekmelding.
- **PATCH /ziekmeldingen/:id** — roept the koppeling opnieuw aan wanneer `start_datum` of `eind_datum` wijzigt en de melding nog actief is (status ≠ `hersteld`); dit vangt periodewijzigingen op.
- **Fail-safe**: de koppeling omhult zichzelf met een eigen try/catch; een onverwachte fout blokkeert de ziekmelding nooit — hij wordt gelogd en the melding wordt correct opgeslagen.

**Bewijs:** typecheck groen (api-server); herstart zonder fouten.

## 2026-07-11 — Verlof: CAO-presets, automatisch verval en proactieve signalering

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; geen bestaande endpoints of schema's gebroken)

**Nieuw gebouwd:**

- **CAO-preset seeder** (`verlofPresets.ts`): idempotente seeder die bij elke api-server-start ontbrekende verlofsoorten (13), feestdagen (33, jaren 2025–2027) en jaarafsluiting-regels (8) toevoegt voor CAO Metaal & Techniek, Bouw & Infra en Geen CAO. Geconfirmeerd via logs: `verlof-presets: seeding voltooid`.

- **Automatisch verlof-verval** (`verlofVervalService.ts`): dagelijkse achtergrondtaak (00:02 nachtelijk, recursive `setTimeout` + `.unref()`) die verlofSaldi met `vervaltOp <= vandaag` en `saldoUren > 0` op nul zet. Resultaat wordt gelogd per medewerker.

- **Proactieve vervalsignalering**: `haalVervalsignalen(dagvenster)` retourneert drie urgentieniveaus — `kritiek` (≤ 14 dagen), `waarschuwing` (≤ 30 dagen), `info` (≤ 90 dagen).

- **API-routes** (`GET /verlof/vervalsignalen`, `POST /verlof/synchroniseer-cao-presets`): respectievelijk voor signaalweergave (personeel lezen) en handmatige sync (alleenBeheerder). OpenAPI-schemas `Vervalsignaal` en `CaoPresetsSyncResultaat` toegevoegd; codegen uitgevoerd.

- **Frontend verlof-overzicht**: de lokale `verlopendeSaldi`-berekening vervangen door de nieuwe `useGetVerlofVervalsignalen`-hook. Drie gescheiden banners met kleurcodering (rood/amber/blauw) op basis van urgentieniveau; elk met naam, verlofsoort, uren en exacte vervaldatum + resterende dagen.

- **Frontend verlof-instellingen**: knop "CAO-presets synchroniseren" (met draai-animatie tijdens laden) toegevoegd naast de jaarselectie. Toont toast met resultaatbericht na succes.

**Bewijs:** api-server herstart — seeder ziet 13 verlofsoorten / 33 feestdagen / 8 regels / scheduler gestart; `GET /api/verlof/vervalsignalen` retourneert 401 (verwacht zonder sessie); typecheck groen (firevault + api-server); Vite HMR bevestigd.

## 2026-07-11 — Medewerker onboarding: automatische verlofsoort-selectie, uren-preview en geboortedatum

- **Medewerker onboarding: automatische verlofsoort-selectie, uren-preview en geboortedatum**
  - **Root bug opgelost**: `VastFormulier` gebruikt nu correct `verlofsoort_ids` via uitgebreide `MedewerkerInput`.
  - **OpenAPI + codegen**: `verlofsoort_ids` en `jaar` toegevoegd aan `MedewerkerInput`.
  - **Server (`POST /medewerkers`)**: roept `maakVerlofprofielAan` aan bij geldige invoer.
  - **Automatische verlofsoort-selectie**: `useMemo` + `useEffect` selecteren automatisch de juiste soorten op basis van CAO/dienstverband.
  - **Uren-preview**: toont pro-rata jaarsaldo op basis van contracturen.
  - **Geboortedatum-veld**: nieuw veld met automatische leeftijdsberekening.
  - **UI-verbeteringen**: "Alles / Geen" knoppen en nette lijstweergave voor verlofsoorten.

- **Governance & Approval Engine — escalatie, bewaking & dashboard**
  - **Deterministische escalatie-bewaking** (`goedkeuringBewaking.ts`): uurlijkse achtergrondtaak voor herinneringen en escalaties via mail.
  - **Vier nieuwe configuratievelden per beleidsregel**: `herinnering_uren`, `escalatie_stap_1_uren/gebruiker`, `escalatie_stap_2_uren/gebruiker`, `max_doorlooptijd_uren`.
  - **goedkeuring_escalaties-tabel**: nieuwe tabel voor audit-trail en deduplicatie van escalaties.
  - **Centraal goedkeuringsdashboard** (`GET /goedkeuring/dashboard`): overzicht van open en recent afgehandelde aanvragen inclusief deadlines en escalatiestatus.
  - **Frontend dashboard** (`/beheer/goedkeuringen-dashboard`): statistieken, filters, escalatiebadges en inline acties.
  - **Beleidsregel-formulier uitgebreid**: configuratie van escalatie-instellingen.
  - **E-mailtype "goedkeuring_escalatie"** toegevoegd aan MailSoort.

**Bewijs:** `pnpm run typecheck` groen; API-server herstart zonder fouten; Vite HMR geladen.


## 2026-07-11 — Governance & Approval Engine — uitbreiding documenttypen (Task #522)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; backend engine was al generiek, geen backend wijzigingen nodig)

**Nieuw gebouwd:**
- **Inspecties** (`/inspecties/:id`): `GoedkeuringWidget` toegevoegd na de statusworkflow-knoppen (objectType="inspectie", documentType="inspectie"). Indienen-knop alleen zichtbaar als de inspectie afgerond is.
- **Arbeidsovereenkomsten** (`/personeel/:id`, ContractKaart info-tab): `GoedkeuringWidget` toegevoegd met objectType="arbeidsovereenkomst". Toont het brutosalaris als bedrag. Altijd beschikbaar ongeacht contractstatus.
- **Weekstaten / Urenstaten** (`/uren/weekstaten`, WeekStaatDetailDialog): `GoedkeuringWidget` toegevoegd na de afwijzingsreden-sectie (objectType="weekstaat"). Indienen-knop alleen bij status "ingediend".
- **Opleverrapporten** (`/rapporten`, rapportenlijst): `GoedkeuringWidget` per rapport-item in de actieskolo (objectType="opleverrapport"). Indienen-knop bij conceptrapporten.
- **Certificaten** (`/gebouwen/:id/print`, werkbalk): `GoedkeuringWidget` met objectType="certificaat" toegevoegd naast de bestaande "Certificaat accorderen"-knop. Zichtbaar zodra de certificaat-sectie actief is in de rapportsamensteller. Indienen-knop toont alleen bij definitief rapport vóór accorderen.
- **Projectafsluitingen** (`/opdrachten/:id`): `GoedkeuringWidget` toegevoegd direct onder de projecttitel (objectType="projectafsluiting"). Zichtbaar + indienen-knop alleen als opdrachtstatus "afgerond" is. Klasse `print:hidden` zodat PDF-export niet beïnvloed wordt.
- **Beleidsscherm** (`/beheer/goedkeuringsbeleid`): `DOCUMENT_TYPE_LABELS`-map en `documentTypeLabel()`-helper toegevoegd; de kolommen "Documenttype" in zowel de beleidsregelstabel als de aanvragentabel tonen nu een leesbare Nederlandse naam (bijv. "Arbeidsovereenkomst", "Inspectierapport", "Weekstaat / Urenstaat") in plaats van de ruwe sleutelstring.

**Geen backend wijzigingen:** de goedkeuring-engine is volledig generiek; hij accepteert elk `objectType`-string-pair zonder codebaarheid.

**Bewijs:** `pnpm --filter @workspace/firevault run typecheck` groen; beide workflows draaien; API healthcheck 200.

## 2026-07-11 — Governance & Approval Engine — koppeling verlofaanvragen (drempelwaarde werkdagen)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief op bestaande motor + verlofworkflow, geen bestaande transitiepaden gebroken)

**Nieuw gebouwd:**
- **`OBJECT_WORKFLOW_ACTIE` uitgebreid** (`goedkeuring-engine.ts`): `verlofaanvraag` toegevoegd. Na volledige goedkeuring voert de motor automatisch de workflow-transitie `aangevraagd → goedgekeurd` uit (inclusief saldo-aanpassing en auditlog) via `viaGoedkeuring: true`.
- **Governance precheck in verlofworkflow** (`workflow-configs.ts`): de transitie `aangevraagd → goedgekeurd` controleert nu of er een actieve beleidsregel is voor documenttype `verlofaanvraag`. De drempel is in werkdagen (`Math.ceil(aantalUren / 8)`). Ontbreekt een goedgekeurde aanvraag terwijl het beleid dat vereist, geeft de transitie een HTTP 422 met uitlegbare foutmelding. Bypass via `viaGoedkeuring: true` (motor heeft al gecontroleerd). `magUitvoeren` ook uitgebreid met `viaGoedkeuring`-bypass zodat de motor niet geblokkeerd wordt door leidinggevende-autorisatie.
- **GoedkeuringWidget op verlofdetail** (`personeel/detail.tsx`): elke verlofaanvraag met status `aangevraagd` toont nu de generieke GoedkeuringWidget (`objectType="verlofaanvraag"`). Widget toont status + goedkeur/afwijs/intrek-acties voor aangewezen goedkeurder, en de "Ter goedkeuring indienen"-knop voor de indiener. Widget-wijzigingen invalideren verlof- en saldoqueries zodat de kaart direct bijwerkt.
- **Betere foutmelding bij geblokkeerd directe goedkeuring**: `beoordeelAanvraag` extraheert nu `body.error` uit het API-antwoord en toont een duidelijke toast "Beoordelen geblokkeerd" met de uitlegbare 422-tekst in plaats van een generieke fout.
- **Beheerscherm bijgewerkt** (`beheer/goedkeuringsbeleid.tsx`): placeholder uitgebreid met "verlofaanvraag"; contextnotitie zichtbaar zodra het documenttype op "verlofaanvraag" staat, die uitlegt dat de drempel in werkdagen is.

**Configuratieinstructie voor beheerder:**
Ga naar Beheer › Goedkeuringsbeleid → Nieuwe beleidsregel. Stel `documenttype = verlofaanvraag`, `ondergrens = 10` (werkdagen), goedkeurder op de directeur in. Verlofaanvragen van meer dan 10 werkdagen (80+ uren) vereisen dan directeursgoedkeuring voordat de leidinggevende de aanvraag kan accorderen.

---

## 2026-07-11 — Governance & Approval Engine — offertes pilotkoppeling

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief op bestaande motor + offerte-routes, geen bestaande transitiepaden gebroken)

**Nieuw gebouwd:**
- **Goedkeuringsgate offerte verzenden**: `POST /offertes/:id/verzenden` controleert nu of het goedkeuringsbeleid een formele aanvraag vereist voor dit offertebedrag; bij een openstaand of ontbrekend akkoord blokkeert verzending met HTTP 422 + code `GOEDKEURING_VEREIST`. Dezelfde check is ook in de werkflow-precheck (`concept → verzonden`) gebouwd.
- **Materiële-wijzigingsguard**: een bedragwijziging via `PATCH /offertes/:id` nadat een aanvraag goedgekeurd is, markeert de aanvraag automatisch als "vervangen" (via nieuwe helper `vervangGoedgekeurdeAanvraag` in goedkeuring-engine.ts). Zo kan een offerte nooit in gewijzigde vorm worden verzonden op basis van een verouderd akkoord.
- **Offerte intrekken**: nieuw endpoint `POST /offertes/:id/intrekken` (bevoegdheid offertes:3); reden verplicht; transitie via WorkflowService naar status "ingetrokken". Nieuwe overgang `{ van: ["verzonden","bekeken"], naar: "ingetrokken" }` in offerteConfig. Vanaf "ingetrokken" is heropenen als concept mogelijk.
- **Goedkeuring-tab in Offerte Studio**: nieuw tabblad "Goedkeuring" in `studio.tsx` with the bestaande `GoedkeuringWidget` (objectType="offerte"). Toelichting over het proces en de materiële-wijzigingsregel zijn opgenomen als contextparagraaf. Indienen-knop alleen zichtbaar in concept-status.
- **Statuslabels "ingetrokken"**: toegevoegd aan `STATUS_KLEUR`/`STATUS_LABEL` in `studio.tsx` (leigrijs) en `STATUS_KLEUR` in `index.tsx`.
- **OpenAPI**: `POST /offertes/{id}/intrekken` + schema `OfferteIntrekkenInput` toegevoegd; codegen uitgevoerd → `useIntrekkenOfferte`-hook gegenereerd in `lib/api-client-react`.
- **Engine helpers**: `haalGoedgekeurdeAanvraag(db, objectType, objectId)` en `vervangGoedgekeurdeAanvraag(db, objectType, objectId, actor, reden)` toegevoegd aan goedkeuring-engine.ts en geëxporteerd.

**Hardening reden-verplichting (n.a.v. code review, ronde 1):** twee lagen toegevoegd zodat intrekken zonder reden onmogelijk is: (1) precheck in de `verzonden|bekeken → ingetrokken` workflow-transitie vereist `ctx.params.reden`; (2) expliciete 422-blokkade in `PATCH /offertes/:id` op `status: "ingetrokken"` met verwijzing naar het dedicated `/intrekken`-endpoint.

**Hardening portaal + UI-intrekken-flow (n.a.v. code review, ronde 2):**
- `portaal.ts POST /portaal/:token/ondertekenen`: blokkeert nu ook bij `offerte.status === "ingetrokken"` (409), zodat een ingetrokken offerte nooit meer ondertekend kan worden ongeacht de portaalstatus.
- `studio.tsx`: "ingetrokken" verwijderd uit de generieke status-dropdown (`VOLGENDE_STATUSSEN`). In plaats daarvan een dedicated "Intrekken"-knop (zichtbaar bij verzonden/bekeken, bevoegdheid offertes:3) die een eigen dialoog opent. De dialoog vereist een vrije-tekst reden en roept `POST /offertes/:id/intrekken` aan via de gegenereerde `useIntrekkenOfferte`-hook. Na bevestiging worden de queries geïnvalideerd en toont een toast.

**Hardening gecombineerde PATCH-bypass + bevoegdheids-afstemming (n.a.v. code review, ronde 3):**
- `PATCH /offertes/:id`: blokkeert nu een gecombineerde bedrag+status="verzonden" in één aanroep (422, `GECOMBINEERDE_BEDRAG_STATUS_VERBODEN`). Zo kan een goedkeuringscheck nooit passeren op het oude bedrag terwijl het nieuwe bedrag de goedkeuring al zou invalideren. Volgorde blijft correct: bedrag opslaan (apart PATCH) → hernieuwde goedkeuringsaanvraag indien vereist → verzenden.
- `studio.tsx`: intrekken-knop gated op `kanIntrekken` = `heeftNiveau("offertes", 3)` in lijn met de backend-vereiste.

**Bewijs:** `pnpm run typecheck` groen (alle 5 packages, vier keer — na elke correctieronde); API server herstart zonder fouten.

## 2026-07-10 — Governance & Approval Engine — kernmotor + pilot inkoopbon (Task #519)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additieve tabellen/module + één pilot-integratie, generieke motor niet gekoppeld aan bestaande transitiepaden buiten de pilot)

**Nieuw gebouwd:**
- #519 — generieke Governance & Approval Engine: `goedkeuring_beleidsregels` (per document_type/werkmaatschappij/bedragrange, met vereist aantal goedkeuringen, vier-ogen-verplichting, vervanger en reactietermijn) en `goedkeuring_aanvragen` (met beleid_snapshot, ingediend_op/afgehandeld_op, vervangen_door_id) toegevoegd. Nieuwe permissiemodule `goedkeuring` in de bevoegdhedenmatrix. Service-laag `goedkeuringEngine` bepaalt of een object een aanvraag nodig heeft, wie mag goedkeuren, en verwerkt indienen/goedkeuren/afwijzen/intrekken als state machine.
- Route handlers + OpenAPI/codegen voor beleidsregels-CRUD en aanvragen (indienen, goedkeuren, afwijzen, intrekken, ophalen per object).
- Pilotkoppeling **inkoopbon**: de bestaande status-transitie concept→goedgekeurd (`workflow-configs.ts`) blokkeert nu (422, `VOORWAARDE`) direct PATCHen als een beleidsregel van toepassing is, met verwijzing naar het formele goedkeuringsproces; eenmaal via de motor goedgekeurd voert de motor de transitie zelf uit (`viaGoedkeuring: true` slaat de precheck en de gewone bevoegdheidscheck over).
- Frontend: herbruikbare `GoedkeuringWidget` (status, indienen/goedkeuren/afwijzen-met-reden/intrekken) geïntegreerd in de inkoopbonkaart (`opdrachten/inkoopplanning-tab.tsx`); bij een 422 op de directe status-PATCH toont een toast met een "Indienen"-actieknop die de formele aanvraag start. Nieuw beheerscherm `/beheer/goedkeuringsbeleid` (tabs "Aanvragen" en "Beleidsregels", CRUD gated op `goedkeuring`-niveau 4) met bijbehorend navigatie-item.

**Bewijs:** `pnpm run typecheck` (volledige workspace, alle 5 packages) groen; workflows `api-server`/`firevault`/`monteur-app` herstart en gezond (geen startfouten). `e2e-web` uitgevoerd: 2 geslaagd, 6 gefaald — alle 6 falen op "TOTP-invoer niet verschenen na 3 pogingen" tijdens de gedeelde inlog-helper, een reeds bekend cold-load/timing-probleem (zie e2e-totp-timing in agent-memory), niet gerelateerd aan de goedkeuringsfunctionaliteit; geen van de falende specs raakt inkoopbon/goedkeuring. Screenshot van de inlogpagina bevestigt geen consolefouten na de wijzigingen.

## 2026-07-10 — Onderhoudsplanning kalenderweergave (Task #167)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (UI-uitbreiding + API-parameter)

**Nieuw gebouwd:**
- #167 — De onderhoudsmodule heeft nu een "Planning"-tab (`/onderhoud/planning`) met een maand- en kwartaalkalender. Werkbonnen worden als interactieve blokken getoond op hun geplande datum. Gebruikers kunnen filteren op monteur, type onderhoud en status. De `listWerkbonnen` API is uitgebreid met `start_datum` en `eind_datum` parameters om efficiënt alleen de benodigde bonnen voor het gekozen tijdsbestek op te halen.

**Bewijs:** OpenAPI-codegen uitgevoerd; `pnpm run typecheck` groen voor `firevault` en `api-client-react`. Bestanden: `lib/api-spec/openapi.yaml`, `artifacts/firevault/src/pages/onderhoud/index.tsx`, `artifacts/firevault/src/pages/onderhoud/planning.tsx`.

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (UI-verbetering + DMS-koppeling)

**Nieuw gebouwd:**
- #307 — De adviescentrum-pagina (`/one/adviescentrum`) is uitgebreid met directe document-upload functionaliteit. Klanten kunnen nu PDF's en afbeeldingen (JPG, PNG, WebP) tot 20MB uploaden. Geüploade bestanden worden via object-storage opgeslagen en bij het indienen van de aanvraag automatisch als document record aangemaakt en gekoppeld aan de nieuwe opdracht in het DMS. De UI toont nu een bestandenlijst met voortgang-indicatie en validatiefouten via toasts.

**Bewijs:** `pnpm --filter @workspace/firevault run typecheck` en `pnpm --filter @workspace/api-server run typecheck` uitgevoerd.

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (UI-only + documentatie)

**Nieuw gebouwd:**
- #257 — de bestaande "Afdrukken"-knop op de nacalculatie-tab (`opdrachten/detail.tsx`) hergebruikt nu expliciet als "Exporteren als PDF"; header, overzichtkaarten, AI-projectcontroller en tabnavigatie zijn `print:hidden` gemaakt en een print-only kop (opdrachttitel, werknummer, exportdatum) is toegevoegd zodat de PDF/afdruk alleen de nacalculatie-secties toont in plaats van de volledige portal-chrome.
- #249 — de `: Promise<void>` + `return void res.json()`-conventie voor route-handlers (opgelost in de 354 TS7030-fixes) is vastgelegd in `docs/ontwikkelfilosofie.md`. Er is bewust geen ESLint toegevoegd (geen bestaande ESLint-infrastructuur in de monorepo); handhaving loopt via `pnpm run typecheck` (dat een ontbrekend returntype al afvangt) en code review.

**Bevindingen (al aanwezig, geen wijziging nodig):**
- #256 — de opdracht-materiaal-tab (`opdrachten/materiaal-tab.tsx`) toont al een tabel met alle uitgiftes (artikel, hoeveelheid, datum, kosten) via `GET /magazijn/mutaties?opdracht_id=...`.

**Bewijs:** `pnpm --filter @workspace/firevault run typecheck` groen voor de gewijzigde bestanden.

## 2026-07-10 — Magazijn: instelbare signaleringstijd/marge, snooze per artikel en dashboard-banner (Task #145/#146/#147)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additieve tabellen + routes, gated op bestaande bevoegdhedenmatrix)

**Nieuw gebouwd:**
- #145 — `magazijn_instellingen` (singleton: signalering_uur/minuut/marge) toegevoegd. `GET/PATCH /magazijn/instellingen` (PATCH vereist `magazijn`-niveau beheer). De dagelijkse signaleringsjob leest nu de instellingen uit de DB i.p.v. een vast tijdstip, past de marge toe bovenop de minimumvoorraad-drempel, en herplant zichzelf direct na een PATCH (`herplanMagazijnSignalering`). UI: kaart "Signalering-instellingen" onderaan het magazijndashboard (alleen zichtbaar bij beheer-niveau).
- #146 — `magazijn_snoozes` (uniek per artikel) toegevoegd. `GET /magazijn/snoozes`, `POST/DELETE /magazijn/artikelen/:id/snooze` (schrijven-niveau). Gesnoozede artikelen worden uitgesloten van de dagelijkse signaleringsmail. UI: klok-knop per kritiek artikel in het dashboard (7/14/30 dagen) + kaart with actieve snoozes en een opheefknop.
- #147 — de kritieke-voorraadbanner op het beheerdersdashboard (`MagazijnWaarschuwingsbanner`) had een foutieve geneste `<a>` binnen wouter's `Link`; gefixt door de wrapper direct aan `Link` te geven.

**Bewijs:** DB-schema gepusht en geverifieerd via `psql \d`; OpenAPI-codegen groen; api-server + firevault `typecheck` groen; `/api/healthz` bevestigt 200 na herstart.

## 2026-07-10 — Bedrijfsdocumenten AI: opslagbevestiging en volledig leergeschiedenis-beheer (Task #142/#143/#144)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (additief; #143 bleek al aanwezig)

**Bevindingen (al aanwezig, geen wijziging nodig):**
- #143 — het onBlur-patroon (`handleVeldBlur`) was al op alle relevante AI-invoervelden aangesloten; geen wijziging nodig.

**Nieuw gebouwd:**
- #142 — `stuurCorrectie`/`stuurVeldCorrectie` geven nu `Promise<boolean>` terug (op basis van `resp.ok`); bij succes toont een toast ("Correctie opgeslagen") dat de gebruiker bevestigt dat zijn correctie is opgeslagen voor het AI-leerproces (`handleVeldBlur`, `kiesCategorieHandmatig`).
- #144 — het AI-leergeschiedenis-scherm in Beheer › Bedrijfsdocumenten toonde alleen categorie-correcties. Veldcorrecties (`ai_veld_correcties`) hadden alleen een POST-endpoint. Toegevoegd: `GET`/`DELETE /organisatie/bedrijfsdocumenten/veld-correcties(/:id)` (OpenAPI + Express-handlers, spiegelt het bestaande categorie-correctiepatroon) en een tweede, inklapbaar paneel "AI-leergeschiedenis — veldcorrecties" met tabel (datum/veld/AI-voorstel/gekozen waarde/tekstfragment) en verwijderknop + bevestigingsdialoog, analoog aan het categorie-paneel.

**Bewijs:** OpenAPI-codegen + `typecheck:libs` groen; typecheck (`api-server`, `firevault`) groen; api-server herstart en `/api/healthz` bevestigt 200 after the routewijziging.

## 2026-07-10 — Klantportaal/offertes: notificaties, badges en dubbele-handtekening-veiligheidsnet (Task #123/#124/#125/#126/#129/#130/#131)

- **Uitvoering:** volledig | **Kwaliteit:** hoog | **Risico:** laag (grotendeels bevestiging van bestaande functionaliteit + één additieve DB-constraint)

**Bevindingen (al aanwezig, geen wijziging nodig):**
- #123/#129 — `POST /portaal/:token/ondertekenen` en `/afwijzen` versturen al fire-and-forget `stuurOndertekeningNotificatie`/`stuurAfwijzingNotificatie` naar het interne team, met link naar het gebouw/project en (bij afwijzing) de reden.
- #126 — `POST /portaal/:token/vraag` verstuurt al `stuurKlantvraagBevestiging` naar de bezoeker wanneer een e-mailadres is opgegeven.
- #130 — het mail-logboek (`beheer/mail.tsx`) toont "Ondertekening" al als herkenbaar label (`SOORT_LABEL.ondertekening`); geen filteroptie toegevoegd (optioneel, niet vereist).
