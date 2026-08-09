# AI_01 — meting AI-gebruik (Fase 0, §2)

Meetmoment: 2026-08-09 · Bron: **ontwikkelomgeving (Replit dev-database)** · Opdracht: AI_01_van_reactief_naar_meedenkend

> **Belangrijkste bevinding vooraf — de meting zelf heeft een gat.** Van de
> 130 geregistreerde aanroepen in deze database hebben er
> **123 geen promptnaam** en staan er
> **89 op module "onbekend"**. §6.4 ("elke aanroep wordt
> gelogd met promptnaam en -versie") wordt dus nog niet nageleefd: de gateway
> kán het loggen, maar de meeste aanroepende plekken geven de logcontext niet
> mee. Zolang dat zo is, is elke gebruiks- en nul-keer-meting een ondergrens.
>
> **Tweede kanttekening:** dit script meet de database waar het op draait.
> Deze cijfers komen uit de ontwikkelomgeving (Replit dev-database). De productiedatabase op de VPS is voor de
> agent niet rechtstreeks bereikbaar (geen SSH sinds 8 aug 2026); voor échte
> gebruikscijfers moet ditzelfde script op productie draaien.

## 1. Aanroepen per module en functie (30/90 dagen, unieke gebruikers)

| module | functie | d30 | d90 | gebruikers |
| --- | --- | --- | --- | --- |
| onbekend | (leeg) | 75 | 89 | 0 |
| adviseur | assistent_vraag | 12 | 12 | 3 |
| document-intelligence | classificeer | 8 | 8 | 0 |
| adviseur | assistent_vraag_vervolg | 6 | 6 | 2 |
| gebruikers | rollen-voorstel | 3 | 3 | 1 |
| facturen | factuurstroom_extractie | 3 | 3 | 0 |
| werkbak | (leeg) | 2 | 2 | 2 |
| gebouwen | gebouw-extractie | 0 | 2 | 0 |
| gebouwen | gebouw-vision | 0 | 2 | 0 |
| verificatie | limiettest | 2 | 2 | 1 |
| meldingen | eerste-reactie | 0 | 1 | 0 |


## 2. Tokenverbruik en kosten per functie (90 dagen)

| module | functie | aanroepen | tokens | kosten_eur |
| --- | --- | --- | --- | --- |
| onbekend | (leeg) | 89 | 400811 | 1.2991 |
| adviseur | assistent_vraag | 12 | 27418 | 0.0736 |
| document-intelligence | classificeer | 8 | 453851 | 0.0687 |
| gebouwen | gebouw-vision | 2 | 7468 | 0.0565 |
| adviseur | assistent_vraag_vervolg | 6 | 14356 | 0.0394 |
| facturen | factuurstroom_extractie | 3 | 6287 | 0.0154 |
| gebruikers | rollen-voorstel | 3 | 2515 | 0.0152 |
| werkbak | (leeg) | 2 | 1014 | 0.0037 |
| gebouwen | gebouw-extractie | 2 | 760 | 0.0002 |
| meldingen | eerste-reactie | 1 | 256 | 0.0001 |
| verificatie | limiettest | 2 | 26 | 0.0000 |


De drie duurste functies staan bovenaan; vergelijk met tabel 1 of ze ook het
meest gebruikt worden.

## 3. Nauwkeurigheid: AI-voorstel overgenomen vs. gecorrigeerd

### Per veld (ai_veld_correcties)

_geen gegevens_


### Categorieniveau (ai_categorie_correcties)

Totaal: 0 · overgenomen: 0 · gecorrigeerd: 0

**Beide correctietabellen zijn leeg in deze omgeving.** De leerlus van §4.2 heeft hier dus nog geen voedingsbodem; de tabellen worden wél gevuld door de bestaande vastlegging zodra gebruikers voorstellen aanpassen.

## 4. Prompts zonder enige geregistreerde aanroep

63 promptconstanten in `aiPrompts.ts`; hieronder de 60 waarvoor
geen enkele aanroep herleidbaar is (op naam- of functie-overeenkomst). Door het
logginggat hierboven betekent "niet herleidbaar" niet automatisch "nooit
gebruikt" — het betekent dat het gebruik **niet meetbaar** is.

- `PIM_UITVOERING_VERSLAG_PROMPT`
- `DOCUMENT_ANALYSE_PROMPT`
- `SPOT_ANALYSE_PROMPT`
- `TEKENING_ANALYSE_PROMPT`
- `PLATTEGROND_ANALYSE_PROMPT`
- `OPLEIDING_VOORSTEL_PROMPT`
- `PROFIEL_VOORSTEL_PROMPT`
- `EMAIL_INZICHT_PROMPT`
- `EMAIL_SAMENVATTING_PROMPT`
- `AI_INVULLEN_PROMPT`
- `CRM_CONCURRENT_PROFIEL_PROMPT`
- `CRM_RELATIEVOORSTEL_PROMPT`
- `ORGANISATIE_DOCUMENT_ANALYSE_PROMPT`
- `ORGANISATIE_INVULLEN_PROMPT`
- `FINANCIEEL_AK_ADVIES_PROMPT`
- `ORGANISATIE_VERZEKERING_SUGGESTIES_PROMPT`
- `ORGANISATIE_BEDRIJFSSCAN_PROMPT`
- `RAPPORT_SAMENVATTING_PROMPT`
- `SALARIS_MUTATIES_CONTROLE_PROMPT`
- `SCAB_MAIL_GENERATIE_PROMPT`
- `TOOLBOX_ANALYSE_PROMPT`
- `TOOLBOX_KOPPELING_PROMPT`
- `TOOLBOX_GENEREER_PROMPT`
- `PLANNING_REISTIJD_PROMPT`
- `INKOOP_PROMPT`
- `UITVOERINGSPLAN_PROMPT`
- `UITVOERING_STAP_PROMPT`
- `UITVOERING_FOTO_ANALYSE_PROMPT`
- `BEGROTING_ANALYSE_PROMPT`
- `WERKVOORBEREIDING_ADVIES_PROMPT`
- `GEREEDSCHAP_FOTO_ANALYSE_PROMPT`
- `MATERIAAL_AANVRAAG_ANALYSE_PROMPT`
- `SNAGSTREAM_RAPPORT_ANALYSE_PROMPT`
- `FACTUUR_UITLEZEN_PROMPT`
- `ZZP_JURIDISCH_PROMPT`
- `LMRA_VOORSTEL_PROMPT`
- `INCIDENT_REGISTRATIE_PROMPT`
- `STUDIO_GENEREER_JSON_PROMPT`
- `STUDIO_BIJSTUUR_JSON_PROMPT`
- `STUDIO_HUISSTIJL_ANALYSE_PROMPT`
- `TOOLBOX_BEOORDEEL_PROMPT`
- `OFFERTE_SECTIE_SCHRIJVEN_PROMPT`
- `OFFERTE_MAIL_PROMPT`
- `CONTRACT_ADVIES_PROMPT`
- `HRM_CAPACITEIT_SIGNALEN_PROMPT`
- `UITVOERDER_CHAT_BASE_PROMPT`
- `MAGAZIJN_RETOUR_SCAN_BASE_PROMPT`
- `MAGAZIJN_STELLING_SCAN_BASE_PROMPT`
- `CALCULATIE_CHAT_BASE_PROMPT`
- `CALCULATIE_ANALYSE_BASE_PROMPT`
- `CALCULATIE_VULLEN_BASE_PROMPT`
- `CALCULATIE_INKOOP_MAIL_PROMPT`
- `WERKBEGROTING_CHAT_BASE_PROMPT`
- `PIM_AANVRAAG_ANALYSE_PROMPT`
- `PIM_OPLEVERING_CONTROLEER_PROMPT`
- `PIM_OPLEVERING_GENEREER_PROMPT`
- `PIM_ONDERHOUD_NOTITIE_PROMPT`
- `PIM_WERKVOORBEREIDING_PROMPT`
- `KB_BESLISSTRUCTUUR`
- `MAGAZIJN_BESTELSUGGESTIE_PROMPT`

**Afspraak (§2):** dit zijn kandidaten om te verdwijnen; er wordt níets
verwijderd zonder besluit van René.

## Conclusies voor de rest van AI_01

1. Eerst het logginggat dichten (elke gateway-aanroep verplicht met module,
   functie en promptnaam) — anders blijft elke volgende meting blind.
2. Geen bestaande functie uitbreiden op grond van deze cijfers totdat de
   meting op productie is gedraaid.
3. De correctietabellen zijn de beoogde leerbron van §4.2 maar zijn hier leeg;
   de leerlus moet dus met de tien-waarnemingen-rem gebouwd worden en zal pas
   op productie effect krijgen.
