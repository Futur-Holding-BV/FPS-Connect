# WERKBAK_01 — Antwoorden en verantwoording

Datum: 2026-08-08

## Wat is gebouwd

Eén persoonlijke werkbak per gebruiker, gevoed door een dagelijkse bewakingsloop
(06:30, plus opstartcontrole). De werkbak is op web een rechterzijpaneel
(knop met teller in de topbalk) en op mobiel een eigen scherm (menu-item
"Werkbak" met teller-badge).

### Kernregels (§-verwijzingen naar de opdracht)
- **Doen/Weten gescheiden** (§3): items hebben een soort `doen` (handeling
  vereist) of `weten` (aandacht vereist); de UI toont ze als twee secties,
  Doen boven Weten, binnen elke sectie gerangschikt op **gewicht**
  (consequentie van niets doen), aflopend.
- **Items verdwijnen nooit vanzelf** (§3): open items blijven staan tot
  (a) afhandelen — handmatig of door bron-reconciliatie wanneer de
  onderliggende oorzaak aantoonbaar is opgelost, of (b) wegzetten met
  verplichte reden (400 zonder reden). Weggezette items zijn herleidbaar
  (status + reden in de database).
- **Idempotent** (§4): elke bron levert een deterministische `dedup_sleutel`;
  een partiële unieke index (`WHERE status='open'`) garandeert dat twee
  opeenvolgende draaien geen dubbelen produceren — bewezen.
- **Elke draai gelogd** (§4): tabel `bewaking_draaien` (start, einde, status,
  samenvatting per voeder). Blijft een geslaagde draai >26 uur uit, dan maakt
  de gezondheidscontrole een Weten-item voor de hoofdbeheerder aan
  (`bewakingsloop:niet_gedraaid`); zodra de loop weer draait wordt dat item
  automatisch afgehandeld.
- **Bevoegdheid bepaalt zichtbaarheid** (§3): klanten zien nooit iets; een
  item is zichtbaar als het aan jou persoonlijk is gericht, of (voor
  hoofdbeheerder) altijd, of via module-match op de bevoegdhedenmatrix
  (`vereiste_module` + `vereist_niveau`). Items gemarkeerd
  `alleen_hoofdbeheerder` (bv. betaalbatches) ziet alleen René. Een gebruiker
  zonder relevante bevoegdheid ziet een lege lijst én teller 0 — bewezen.
- **Inline afhandelen** (§4.3): verlofaanvragen zijn direct vanuit het paneel
  goed te keuren of af te wijzen (bestaande beoordelingsroute); de
  reconciliatie handelt het werkbak-item daarna automatisch af.
  Goedkeuringsaanvragen en overige items deep-linken via `actie_pad` naar de
  bestaande pagina.

### Bronnen (gesloten lijst, §5)
De voederlijst is een gesloten opsomming in `werkbakService.ts`
(`WERKBAK_BRONNEN`); een onbekende bron gooit een fout. Aangesloten voeders:

| Bron | Soort | Zichtbaar voor |
|---|---|---|
| contractbesluit (aflopend arbeidscontract zonder besluit) | doen | personeel:2; verstreken aanzegtermijn ook hoofdbeheerder |
| financieel contract (opzegtermijn nadert) | weten | hoofdbeheerder |
| poortwachter (einde loondoorbetaling 21/60 dagen) | doen/weten | personeel:2; buiten termijn extra item hoofdbeheerder |
| verloopdatum certificaat (60 d) | doen | personeel:2 |
| verloopdatum wagenpark APK/verzekering/lease (30 d) | doen | wagenpark:2 |
| verlofverjaring (56 d) | weten | personeel:2 |
| factuursignaal | weten | financieel:2; rekeningnummerwissel ook hoofdbeheerder |
| goedkeuringsaanvraag (ingediend) | doen | goedkeuring:2 |
| verlofaanvraag (aangevraagd) | doen (inline) | personeel:2 |
| factuur wacht op goedkeuring | doen | financieel:2 |
| betaalbatch (SEPA ontvangen, volledig) | doen | alleen hoofdbeheerder |
| conceptantwoord aanvraag (klaar, niet verstuurd) | doen | offertes:2 |
| mail zonder antwoord (≥2 dagen, verwerken-mailbox) | doen | crm:2 |

## Bevinding: documenten-inbox is géén voeder in v1

De documenten-inbox (`routes/inbox.ts`) staat niet in §5 van de opdracht en is
bewust **niet** als voeder aangesloten. Reden: die inbox is zelf al een
werkvoorraad-scherm met een eigen verwerkingsflow (claimen, classificeren,
doorzetten); items daaruit ook in de werkbak spiegelen zou dubbele
werkvoorraden creëren zonder dat de werkbak er iets aan toevoegt. Als René
dit later toch wil, is het één extra voeder in `bewakingsloop.ts` (het
patroon staat er al).

## Bewijs

Zie `docs/metingen/werkbak-bewijs.md`. Alle vier scenario's GEMETEN geslaagd
via `scripts/src/bewijs-werkbak.ts` tegen de draaiende dev-omgeving.

---

## Aanvulling 8 augustus 2026 — welke module regelt het leesrecht op veiligheidshandboek en personeelsgids?

Datum: 2026-08-08 · gemeten op commit `01414f4` · vraag van René bij de §5-uitbreiding (rol Ondersteuning).

**Antwoord (GEMETEN in de code):** de module **`organisatie`**. Documenten als veiligheidshandboek, personeelsgids en kwaliteitshandboek horen bij **Bedrijfsdocumenten** onder Organisatie (`routes/organisatie.ts`, categorieën contract/vergunning/certificaat/kwaliteitshandboek/overig, met vervaldatum). Alle leesroutes daar staan achter `requireBevoegdheid("organisatie", 1)`; schrijven/vervangen achter niveau 2.

Ter onderscheid: de module **`bibliotheek`** (`routes/documenten.ts`) is de productdocumentatie-bibliotheek (testrapporten, verwerkingsvoorschriften, gekoppeld aan toepassingen/gebouwen) — dat is níét de plek van handboeken en gidsen.

**Consequentie voor het preset Ondersteuning (beslispunt):** de RECHTEN_01-aanvulling vraagt *leesrecht*, maar werkbak-bron 4 ("document of handboek dat verouderd is", soort Doen) laat deze rol het document ook zelf **vervangen** — dat vereist `organisatie` op schrijfniveau (2). Advies: organisatie:2, anders kan de rol zijn eigen werkbak-items niet zelf afsluiten. **AANGENOMEN** tot René anders beslist; bij strikt leesrecht (organisatie:1) moet bron 4 naar iemand anders routeren of het vervangen zelf buiten deze rol blijven.
