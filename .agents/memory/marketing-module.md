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

**Gedoseerde verzender:** één niet-overlappende lus (recursieve setTimeout) verstuurt automatisch wachtrij-items van campagnes met status "verzendend", 1 per (60/tempo)s; tempo (1–60/min) is een app-instelling, lezen=marketing 3, wijzigen=marketing 4. De éénmalige campagne-goedkeuring ís de menselijke goedkeuring; per-item goedkeuring blijft voor alle niet-campagne-mail (wachtrij-verwerker mag daarom een null-verwerker aannemen, herkomst staat op de aanvrager). **Waarom veilig:** consent-poort draait vlak vóór elke verzending → stop/afmelden per direct, max 1 in-flight na stop. **Les (review):** de campagne-afrondingscontrole moet ná élke terminale ontvanger-overgang draaien, óók bij overslaan/blokkeren — anders blijft een campagne waarvan alle resterende ontvangers geblokkeerd raakten eeuwig "verzendend". Echte verzendfout → volle tussenpoos wachten (mailserver niet hameren); blokkade/claim-race → korte wacht. **Aanvullende lessen (review):** (1) handmatig versturen van campagne-items uit de mailwachtrij is server-side geblokkeerd (422) — anders is het tempo via die omweg te omzeilen; (2) élk pad dat een geplande ontvanger passeert zonder verzending (dedupe bij klaarzetten, afmelden/intrekken, MailFout, handmatig afwijzen in de mailwachtrij) moet de ontvanger terminal zetten én de afrondingscontrole draaien, anders blijft de campagne eeuwig "verzendend" zonder herstelpad; (3) wachtrij-opbouw en activering strikt scheiden: campagne claimt eerst tussenstatus "voorbereiden" (onzichtbaar voor verzender én afrondingscontrole) en flipt pas atomair naar "verzendend" als alle rijen bestaan; de opbouw zelf moet annuleringsbewust zijn en bij een mislukte activering (gestopt tijdens opbouw) alle al aangemaakte rijen alsnog terminaal opruimen; (4) crash-herstel (vastgelopen "verzenden"-items → mislukt) moet campagne-ontvangers terminal zetten + afronden, want de verzender pakt alleen "wachtend" op en handmatig hersturen is voor campagne-items geblokkeerd; (5) dev-Graph is hier écht geconfigureerd — een MailFout forceer je met een syntactisch ongeldig adres (Graph 4xx), nooit met een "onbestelbaar" echt domein.

**Vervolg (akkoord, nog te bouwen):** open/klik-tracking (alleen geaggregeerd bij campagne; klik op aanbod mag als opvolgsignaal bij relatie; meting noemen in privacyverklaring én mail), bounce-verwerking via bestaande werk-inbox Graph-uitlezing (hard bounce → mail_onbestelbaar; >5% harde bounces → autostop + mail René), Document Studio-renderlaag met werkmaatschappij-branding (huidige campagneMailHtml-wrapper met #F23B0D is bewust tijdelijk), verkoopkans↔offerte via offertes.projectkans_id, opvolgreeksen, webformulier, overzicht, Deel B coaching.

**Bewijs:** scripts/src/verificatie-marketing-fase1.ts; scripts/src/bewijs-campagne-dosering.ts (dosering, stop-, concurrency-, afwijs- en crash-herstel-scenario's).
## MARKETING_02 (17-08-2026, akkoord René)
Eigen module `marketing` in de matrix (los van crm): niveau 3 = beheren + proefverzenden, 4 = écht verzenden/stoppen. Presets: Commercieel 3, Directie 4 (migratie 0069, alleen-verhogend). Toestemming-PATCH blijft crm 2; social/merkenkast/beeldbank blijven bewust op crm 3/4. Frontend: sidebar-hoofdstuk Commercie toont ook bij marketing-only; CRM-kaart Marketing en social-campagnekoppeling gegate op marketing 3 (query enabled + queryKey verplicht).

## Social & Merk afgesplitst (aug 2026)
Regel: social en merk zijn eigen modules, niet langer crm-recht.
- social: 3=opstellen/klaarzetten (Commercieel), 4=plaatsen+koppelingen (Directie). Verder niemand.
- merk (merkenkast+beeldbank samen): 1=zoeken/downloaden (Calculatie/Administratie/Projectleider), 3=ook uploaden (Commercieel/Directie). Veldprofielen niets.
**Why:** merk-assets nodig voor offertes/brieven/rapportages zonder social-rechten; huisstijl beheren blijft organisatiebeheer (merkenkast toont alleen).
**How to apply:** migratie 0070 (alleen-verhogend, handmatige profielen 0); bewijs: scripts/src/bewijs-module-rechten-1038.ts (wegwerpgebruikers per preset via mobile-login bearer — herbruikbaar patroon voor modulerechten-tests).
