# BEWAKING_02 — de commerciële keten

**Opdrachtgever:** René · **Uitvoerder:** Replit · **Datum:** 11-08-2026
**Gemeten op:** `fps-one` HEAD `77bbf11` (10-08 18:21)

---

## 1. AANLEIDING

De bewakingsloop telt inmiddels **24 voeders**, waaronder vijf proactieve AI-signalen. Die laag werkt en groeit. Maar **geen enkele voeder raakt de commerciële keten**: offerte · opdracht · CRM · gebouw · opname · project.

Gemeten per bestand: `offertes.ts` 2.689 regels met één AI-aanroep en één werkbakverwijzing · `opdrachten.ts` 1.391 regels zonder enige opvolgterm · `gebouwen.ts` 1.882 regels met nul AI, nul signaal, nul opvolging · `opname.ts` 684 regels met nul op alle drie.

Concreet gevolg: **een verzonden offerte waar de klant nooit op reageert levert nergens een signaal op.** De bewaking zit op de administratieve achterkant — contracten, verlof, facturen, wagenpark — en niet op de plek waar de omzet binnenkomt.

---

## 2. DOEL

Zes voeders erbij op de commerciële keten, in de **bestaande** bewakingsloop en de **bestaande** werkbak. Geen nieuwe meldingenstroom, geen nieuwe tabel per module.

---

## 3. BUITEN SCOPE

- Nieuwe schermen. De werkbak is de plek waar dit verschijnt.
- Het offerteproces zelf wijzigen: statussen, sjablonen, portaal, ondertekening.
- Automatisch handelen. Een voeder signaleert; hij verstuurt geen herinnering aan de klant en zet geen status om.
- Een twaalfde meldingentabel. `WERKBAK_01` is de plek.
- AI-inhoud toevoegen aan offertes. Dat is een eigen afweging.

---

## 4. BESTAANDE BOUWSTENEN — HERGEBRUIKEN

- `artifacts/api-server/src/lib/bewakingsloop.ts` (1.657 r., 24 voeders) — het patroon staat er; een voeder levert de volledige actuele open-set en `syncBron` regelt openen en sluiten
- `werkbak_items` en `bewaking_draaien`
- **`workflow_transitie_log`** (`lib/db/src/schema/workflow.ts` r.75), gevuld door `services/workflow-engine.ts` r.155 — **hier staat wanneer een offerte van status wisselde.** Dat is nodig, want `offertes` zelf heeft géén `verzondenOp`, `bekekenOp` of `ondertekendOp`
- `offertes.datum` + `offertes.geldigheidDagen` (standaard 30) · `offertes.status` (concept · verzonden · bekeken · ondertekend · afgewezen · ingetrokken) · `offertes.portaalStatus`
- `calculaties.opnameId` en `mod_calc_headers.opnameId` · `offertes.calculatieId` · `opdrachten.calculatieId`

---

## 5. FASE 0 — EERST TELLEN OP PRODUCTIE (verplicht, niets bouwen)

Bij de vorige meting bleek de hele inkoopkant in productie leeg. Drempels verzinnen op een module die niet gebruikt wordt is weggegooid werk. Lever daarom eerst een telling via hetzelfde alleen-lezen patroon als `GET /api/metingen/materiaal01`:

| # | Telling |
|---|---|
| T1 | Offertes per status |
| T2 | Van de offertes in `verzonden` en `bekeken`: hoe lang staan ze daar al (mediaan, langste), afgeleid uit `workflow_transitie_log` |
| T3 | Offertes waarvan `datum + geldigheidDagen` verstreken is en die niet ondertekend, afgewezen of ingetrokken zijn |
| T4 | Opnames zonder gekoppelde calculatie, en hoe oud |
| T5 | Calculaties met een definitieve status zonder offerte |
| T6 | Actieve opdrachten zonder ondertekende offerte |
| T7 | Bevat `workflow_transitie_log` werkelijk offerteovergangen, of alleen die van andere objecten |

**Een uitkomst van nul is een antwoord.** Niets interpreteren, niets afronden, geen conclusies. T7 is bepalend: is de transitielog leeg voor offertes, dan moet eerst het moment van verzenden vastgelegd worden en verschuift de rest.

---

## 6. DE ZES VOEDERS

Bouwen na fase 0, met drempels die uit T2 en T4 volgen — niet uit een aanname.

| # | Voeder | Signaal | Ontvanger |
|---|---|---|---|
| V1 | `voedOfferteGeenReactie` | Offerte staat op `verzonden` en er is na de drempel geen reactie | opsteller |
| V2 | `voedOfferteBekekenNietGetekend` | `portaalStatus` toont bekeken, maar niet ondertekend na de drempel — de klant heeft hem geopend en niets gedaan | opsteller |
| V3 | `voedOfferteVerlopen` | `datum + geldigheidDagen` verstreken zonder eindstatus | opsteller |
| V4 | `voedOpnameZonderCalculatie` | Opname gedaan, geen calculatie eraan gekoppeld na de drempel | opnemer |
| V5 | `voedCalculatieZonderOfferte` | Calculatie definitief, geen offerte eraan gekoppeld | opsteller |
| V6 | `voedOpdrachtZonderAkkoord` | Actieve opdracht zonder vastgelegde akkoordgrond | projectleider |

**V6 hangt aan `AKKOORD_01`.** Bestaat `akkoord_grond` nog niet op `opdrachtenTable`, dan wordt V6 **niet gebouwd** en apart gemeld — geen tussenoplossing op de offertestatus.

---

## 7. HARDE REGELS

1. **Doen of Weten.** V1, V2 en V4 vragen een handeling (Doen). V3, V5 en V6 vragen aandacht (Weten). Volg de indeling uit `WERKBAK_01` §5.
2. **Rangschikken op consequentie, niet op datum.** Een offerte van €80.000 die stilstaat weegt zwaarder dan een van €800.
3. **Sluiten hoort erbij.** Elk signaal sluit vanzelf zodra de aanleiding weg is — offerte ondertekend, calculatie gekoppeld, opdracht akkoord. Een voeder die alleen opent, herhaalt de fout van de materiaalaanvraag.
4. **Drempels configureerbaar**, niet hardgecodeerd, met de uit fase 0 gemeten waarde als startstand.
5. **Alleen zichtbaar voor wie het mag zien.** Volg `filterOntvangersOpBevoegdheid` uit de bestaande loop.
6. **Geen herinnering naar de klant.** Het signaal gaat naar de eigen medewerker.
7. **Wijk je af van deze scope, meld dat dan vóór je bouwt.**
8. Toets elke aanname in dit document tegen de werkelijke route en het werkelijke schema, en meld afwijkingen.

---

## 8. ACCEPTATIE

- De telling uit fase 0 als document in `docs/metingen/`.
- Per voeder: één aangemaakt werkbakitem én één automatisch gesloten item, aangetoond.
- Een draai van de loop waarin de zes voeders meelopen, zichtbaar in `bewaking_draaien`.
- De regel uit `SPARKI_LOPEND`-stijl onderaan: **waar landt de uitkomst en welk besluit hangt eraan.**

---

## 9. WAT ER DAARNAAST DOORGEZET MOET WORDEN

`VERVOLG_01_sweep` (10-08-2026) is nooit uitgevoerd — er staat geen meetbestand in `docs/metingen/` en geen antwoorddocument. Dat is de meting die per status- en schakelveld vaststelt of er iets op volgt (A), of het veld alleen zichzelf verandert (B), of dat het dood is (C). Die uitkomst is de bredere versie van dezelfde vraag en hoort naast deze opdracht te lopen, niet erna.
