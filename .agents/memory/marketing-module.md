---
name: Marketingmodule (MARKETING_01)
description: Consent-poort, campagneflow via mailwachtrij, rechtenmodel en afgesproken vervolgfases van de marketingmodule.
---

# Marketingmodule (MARKETING_01)

**Rechten (akkoord René):** binnen module crm — niveau 3 = marketing beheren (doelgroepen/sjablonen/campagnes/proef), niveau 4 = echt verzenden + stoppen. Géén nieuwe module, géén presetwijziging.

**Harde toestemmingspoort:** `mailbareContactVoorwaarden()` in marketingService.ts hoort in élke query die marketing-ontvangers selecteert: e-mail aanwezig + mail_toestemming + niet afgemeld + niet onbestelbaar. Doelgroepleden altijd live berekenen, nooit opgeslagen lijsten. Toestemming aanzetten vereist een bron; afmelding niet ongedaan te maken zonder nieuwe expliciete toestemming.

**Campagneflow:** concept → proef verplicht (moet nieuwer zijn dan bijgewerkt_op van campagne én sjabloon, anders 422) → verzenden = atomaire statusclaim (concept/gepland→verzendend, anders 409) → per lid ontvanger-snapshot + mail fail-closed in de wachtrij (nooit direct). Wachtrij-succespad roept via dynamic import `handelCampagneVerzendingAf` aan (ontvanger verzonden + crm-event + campagne afronden).

**Afmelden:** publiek `GET /api/marketing/afmelden/:token` (router vóór requireAuth, naast portaalRouter); idempotent; trekt toestemming in, zet ontvanger afgemeld, wijst nog wachtende wachtrij-items van die contactpersoon af (over alle campagnes) en logt crm_communicatie "campagne_afgemeld". **Les:** afmelden moet óók de wachtrij opruimen — een ontvanger die al afgemeld is valt anders buiten de "gepland"-selectie van de stop-route; stoppen wijst daarom wachtende items af over álle ontvangers van de campagne, niet alleen geplande.

**Verzendmoment-poort:** de doelgroepfilter bij klaarzetten is niet genoeg — `controleerCampagneItemVerzendbaar()` draait nogmaals in het wachtrij-verzendpad (afmelding/intrekking/bounce/gestopte campagne tussen klaarzetten en goedkeuren → item afgewezen). Toestemming intrekken annuleert per direct wachtende campagnemails. Wachtrij-dedupe (adres+onderwerp) mag nooit stilzwijgend een ontvanger verliezen → na enqueue bestaan-check, anders ontvanger zichtbaar "overgeslagen".

**Afmelden scanner-veilig:** GET = alleen bevestigingspagina (mailscanners volgen links automatisch); de afmelding zelf gaat via POST op dezelfde URL.

**Waarom:** AVG + reputatie: consent en afmelding zijn juridisch hard; UI-gating alleen is onvoldoende.

**Vervolg (akkoord, nog te bouwen):** open/klik-tracking (alleen geaggregeerd bij campagne; klik op aanbod mag als opvolgsignaal bij relatie; meting noemen in privacyverklaring én mail), bounce-verwerking via bestaande werk-inbox Graph-uitlezing (hard bounce → mail_onbestelbaar; >5% harde bounces → autostop + mail René), gedoseerde verzender op de wachtrij, Document Studio-renderlaag met werkmaatschappij-branding (huidige campagneMailHtml-wrapper met #F23B0D is bewust tijdelijk), verkoopkans↔offerte via offertes.projectkans_id, opvolgreeksen, webformulier, overzicht, Deel B coaching.

**Bewijs:** scripts/src/verificatie-marketing-fase1.ts (24 checks).
