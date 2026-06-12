# Roadmap — Actief

Vastgelegde fasen; elk pas bouwen ná formeel akkoord op die fase. Zie [`README.md`](./README.md) voor het overzicht en [`replit.md`](../../replit.md) voor de Ontwikkelstop-regel en de drie sporen.

## V1.4 — Opleverrapportage (vastgelegd)

Bouwt voort op de bibliotheek (V1.2). Onderdelen: voorblad, rapportopmaak, e-mailselectie, bijlagenpakket en definitief maken van het rapport. De opleverrapportage wordt nu live gegenereerd in `print.tsx`; deze fase brengt de opmaak en het samenstellen op orde. Het gepersisteerd en onveranderlijk vastleggen van definitieve rapporten gebeurt in V1.5.

**Rapporttypes (vastgelegd, nog te bouwen in V1.4/V1.5).** Het rapportsamenstellen wordt typegestuurd met vier vaste rapporttypes; elk type is een voorinstelling van de secties (checkboxen) hieronder:
1. **Werkpakket monteur** (voor uitvoering) — projectgegevens, contactpersonen, relevante e-mails, plattegronden, spots, toegewezen werkzaamheden. Bewust GEEN ETA's of certificaten. (Leunt aan tegen de mobiele monteur-app V2.0.)
2. **Tussentijdse voortgangsrapportage** (voor opdrachtgever) — voortgang, aantallen spots, foto's, opmerkingen, eventueel openstaande punten.
3. **Opleverrapport brandveiligheid** (definitieve oplevering) — voorblad, opdrachtomschrijving, juridische uitgangspunten, plattegronden, spots, foto's, gebruikte applicaties, gebruikte toepassingen.
4. **Opleverdossier compleet** (archief/opdrachtgever/verzekeraar) — opleverrapport + ETA's, classificatierapporten, certificaten, relevante tekeningen, relevante e-mails, overige bijlagen.

**Sectie-checkboxen per rapport (samenstellen):** Voorblad, Projectomschrijving, Relevante e-mails, Plattegronden, Spotdetails, Foto's, ETA's, Classificatierapporten, Productcertificaten, Tekeningen, Juridische bijlagen, plus "Alles selecteren". Elk rapporttype zet een eigen standaard-selectie; de gebruiker kan per rapport afvinken.

**Concept vs. definitief (kern van V1.4 → persisteren in V1.5):**
- **Concept rapport** — blijft dynamisch; volgt actuele data en documentversies.
- **Definitief rapport** — wordt opgeslagen, krijgt een versienummer, **bevriest de gebruikte documentversies** en komt in de centrale rapportenmodule (V1.5) terecht. Bevriezing bouwt voort op de onveranderlijke documentrevisies uit V1.2.

Afhankelijkheid: de inhoud van rapporttype 3 (gebruikte applicaties/toepassingen) en 4 (ETA's/classificatierapporten/certificaten) leunt direct op de keten Applicatie → Toepassing → Document. Een schone, afgeleide documenthiërarchie is daarmee een randvoorwaarde voor juridisch correcte opleverrapporten.

## V1.5 — Rapportenmodule (nieuwe fase, vastgelegd)

Doel: een centrale rapportenbibliotheek met definitieve, juridisch correcte opleverrapporten per gebouw. Bewust als kernonderdeel van het product behandeld (geen "extra wens") en met voorrang boven een bredere CRM-module: voor FPS is een juridisch correct dossier met definitieve rapporten waardevoller dan uitgebreide CRM-functionaliteit.

Functies:
- Definitieve rapporten per gebouw (gepersisteerd, niet meer live-gegenereerd zoals nu in `print.tsx`)
- Centrale rapportenbibliotheek met zoek- en filterfuncties
- Versiebeheer van rapporten
- Bevriezing documenten: een definitief rapport blijft gekoppeld aan de documentversies die op het moment van vaststellen geldig waren; latere documentversies wijzigen definitieve rapporten nooit
- Koppelingen naar CRM, onderhoud en klantportaal

> **Bevriezingsdeel gebouwd (geautoriseerd, vooruit op de DMS-module).** Het concrete bevriezingsmechanisme is met formeel akkoord al gebouwd op de **dossiers**-entiteit als onderdeel van de DMS / documentenbibliotheek: `POST /dossiers/:id/definitief` bevriest per gekoppeld bibliotheekdocument de revisie + PDF (`bevroren_revisie_nummer`/`bevroren_pdf_url`/`bevroren_op`), reads van een definitief dossier serveren de bevroren snapshot, en de UI toont "nieuwere revisie beschikbaar". Zie [`gebouwd.md`](./gebouwd.md) (sectie DMS / Documentenbibliotheek, Fase 4). Wat in V1.5 nog rest, is het toepassen van ditzelfde mechanisme op een gepersisteerde **opleverrapport**-entiteit (zie afhankelijkheid hieronder).

Afhankelijkheid: rapportbevriezing vereist een gepersisteerde 'definitief opleverrapport'-entiteit. Nu genereert `print.tsx` het opleverrapport live uit actuele data; er is geen rapport-tabel. Het bevriezingsmechanisme zelf is bewezen op dossiers; in V1.5 wordt het op de rapport-entiteit toegepast, bovenop de onveranderlijke documentrevisies uit V1.2.

**Formele opleverstatus & reactietermijn (vastgelegd, nog te bouwen in V1.5).** Een definitief rapport beheert ook de formele opleverstatus — een statusmachine per rapportversie:
- **Definitief verzonden** — bij definitief maken/versturen krijgt het rapport deze status; verzenddatum wordt vastgelegd; de reactietermijn start automatisch (standaard 14 dagen, configureerbaar); einddatum wordt berekend → status **Reactietermijn loopt**.
- **Juridisch gereedgemeld / Reactietermijn verstreken** — na het verstrijken van de termijn zonder reactie. Dit wordt gelogd bij zowel het gebouw als het rapport.
- **Vervangen door nieuwe versie** — bij reactie van opdrachtgever of een aanpassing: oude versie blijft bewaard, nieuwe versie wordt aangemaakt met nieuwe verzenddatum; de reactietermijn herstart daarbij automatisch (nieuwe termijn vanaf de nieuwe verzenddatum). De oude termijn wordt afgesloten met reden "vervangen door nieuwe versie".

Weergave in gebouwkaart → rapporten-tab, per rapport: rapportversie, datum verzonden, reactietermijn tot, dagen resterend, status, eventuele reactie opdrachtgever, en "vervangen door versie x".

Implementatienotitie (vastgelegd voor later): de overgang naar "verstreken" kan afgeleid worden bij lezen (verzenddatum + termijn) zodat geen achtergrondworker nodig is; de logregel bij gebouw/rapport mag lui of via een dagelijkse job worden weggeschreven. De termijn (14 dagen) wordt configureerbaar, niet hardgecodeerd.
