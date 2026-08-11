# AKKOORD_01 — Meting: werkomschrijving door de lijn (§7)

## 2026-08-10 · gemeten op `77bbf11` (main)

**Vraag:** waar staat de werkomschrijving nu in aanvraag/projectkans, calculatie, offerte en opdracht — één veld per stap of meerdere, en wordt er iets gekopieerd?

| Stap | Tabel · veld(en) | Gemeten |
|---|---|---|
| Aanvraag/projectkans | aanvraag-entiteit: titel + samenvatting (AI-extractie in `documentIntelligence.ts` levert titel/samenvatting, geen apart werkomschrijvingsveld) | geen kanoniek werkomschrijvingsveld |
| Calculatie | `calculaties.omschrijving` (`lib/db/src/schema/calculaties.ts` r.19); per regel `calculatie_regels.omschrijving`; ENK/mod-calculatie heeft eigen header + regelomschrijvingen (`mod-calculatie.ts`) | kop-omschrijving bestaat |
| Offerte | **geen** kop-werkomschrijving (`offertes.ts` r.70-115): wel `titel`, `opdrachtgever`, `voorwaarden`; inhoudelijke tekst zit in hoofdstukken/secties | ontbreekt als veld |
| Opdracht | `opdrachten.omschrijving` (`opdrachten.ts` r.19; het veld heet `omschrijving`, niet `werkomschrijving`) | kop-omschrijving bestaat |

**Kopieergedrag, gemeten:**
- Er wordt **nergens** een werkomschrijving door de keten gekopieerd. Herzieningen kopiëren wél binnen dezelfde entiteit (`gekopieerd_van_id` op calculaties r.13-14 en offertes r.96-97).
- `POST /offertes/:id/maak-opdracht` (`routes/opdrachten.ts` r.170-182) zet `omschrijving` alleen uit de request-body (`omschrijving ?? null`) — niet uit offerte of calculatie.
- Bij ondertekening via het portaal (`routes/portaal.ts` r.533-547) krijgt het automatisch aangemaakte **project** een generieke tekst ("Automatisch aangemaakt na ondertekening offerte …"), niet de calculatie-/offertetekst.

**Afwijking t.o.v. de opdrachttekst:** §1 r.3 zegt "de opdracht ontstaat bij ondertekening (`portaal.ts` r.528)". Gemeten: de portaalroute maakt bij ondertekening een **project** aan, geen opdracht; de opdracht ontstaat handmatig via `POST /offertes/:id/maak-opdracht`. Het schema-commentaar (`opdrachten.ts` r.7-9, "aangemaakt wanneer offerte status 'akkoord' of 'ondertekend' wordt") beschrijft dus intentie, niet gedrag; een offertestatus `akkoord` bestaat niet in `workflow-configs.ts`.

**Aangenomen:** niets.
