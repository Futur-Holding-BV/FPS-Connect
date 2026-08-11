# VERVOLG_01 — leidt een knop ergens toe? (sweep)

**Gemeten op:** 11-08-2026, hoofdversie (302 tabellen, 81 schemabestanden). **Methode:** alle status-/fasevelden en ja/nee-schakelaars uit `lib/db/src/schema/` geïnventariseerd (408 velden), per veld schrijf- en leesplekken plus gevolg opgezocht in api-server, beide frontends en scripts; gezocht op snake_case én camelCase én tabelvariabele, drizzle-updates én rauwe SQL (valkuilen §4 uit de opdracht).

**Uitkomst:** 2× C (dood), 2× onbekend, 89× B (verandert alleen zichzelf), 315× A (er volgt iets uit).

**Controle op de meting (§5):** `materiaal_aanvragen.status` komt eruit als **A** — goedkeuren maakt een concept-inkoopbon aan en sluit het werkbakitem in dezelfde transactie. De meting doorstaat de controle.

**Duiding vooraf:** de C- en ONBEKEND-regels zijn de scherpste bevindingen. Zeven B-velden raken geld, veiligheid of een wettelijke termijn en dragen een risico-regel. De overige B-categorie is groot maar grotendeels verwacht (weergavevelden, badges).

| Tabel | Veld | Letter | Geschreven | Gelezen | Gevolg | Wat gaat er mis als hier niets op volgt |
|---|---|---|---|---|---|---|
| fabrikanten | gearchiveerd | C | onbekend; geen aantoonbare write-route gevonden | geen relevante read gevonden | - | gearchiveerde fabrikanten blijven overal gewoon kiesbaar; archiveren wekt de indruk van opruimen terwijl er niets verandert |
| wagenpark_sync_log | status | C | sync/import verwerking | geen aantoonbare codelezing | status wordt gelogd maar stuurt geen zichtbare beslissing | een mislukte wagenpark-sync valt niemand op — het logrecord zegt "mislukt" maar niets of niemand kijkt ernaar |
| inbox_items | snagstream_status | ONBEKEND | inbox/import verwerking | geen sluitende gebruiksplaats gevonden | mogelijk externe synchronisatiestatus; gevolg niet aantoonbaar | zoek op tabelvariabele en beide naamvarianten leverde geen routebeslissing op |
| mod_calc_adviezen | status | ONBEKEND | advies create/update | geen eenduidige routegebruik gevonden | mogelijk adviesworkflow, maar gevolg niet aantoonbaar | - |
| accountview_export_logs | testmodus | B | AccountView-exportlog aanmaken | exportlog toont testmodus | alleen logweergave | - |
| accountview_instellingen | grootboek_standaard | B | PATCH instellingen-accountview | boekhouding-instellingen toont waarde | alleen standaard grootboekkeuze | - |
| ai_aanroepen | status | B | AI-aanroep insert/update | AI-aanroep/log- en kostenoverzichten | - | - |
| audit_log | workflow_status | B | audit-loginsert vanuit workflow/auditservice | audit-overzicht/filter | alleen auditweergave; geen operationele actie | - |
| boekhouder_uploads | bestandsnaam | B | boekhouder-upload | boekhouderportaal toont/downloadt naam | - | - |
| brandstof_importen | bestandsnaam | B | POST brandstof-import | importdetail/weergave | - | - |
| crm_financieel | status | B | CRM financiële record-aanmaak/bewerkroute | financieel CRM-lijst/detail | alleen opslag + statusweergave | een financiële status (bv. wanbetaler) blokkeert of waarschuwt nergens — er kan gewoon een nieuwe offerte of opdracht voor die klant gemaakt worden |
| crm_klanten | relatie_status | B | CRM klant-bewerkroute | klantdetail/statusweergave | alleen opslag + weergave | - |
| document_classificatie_correcties | bestandshash | B | classificatie-correctie | correctie-/historieweergave | alleen koppeling naar bestand | - |
| documenten | bestands_hash | B | document-upload | deduplicatie/documentcontrole | dubbele bestanden kunnen worden herkend; geen verdere workflowactie | - |
| dossier_documenten | bestand_url | B | dossierdocument-upload/koppeling | dossierdetail/download | alleen opslag + openen bestand | - |
| facturen | bestandsnaam | B | mail/import-factuur aanmaken | factuurdetail/download en deduplicatie tonen/lezen | alleen opslag/weergave | - |
| factuur_correspondentie | ai_gegenereerd | B | AI-correspondentie-aanmaak | correspondentielijst labelt AI-tekst | alleen herkomstbadge/weergave | - |
| financiele_documenten | bestands_hash | B | financieel document-upload (hash) | deduplicatie/documentcontrole | dubbele upload kan worden herkend; geen workflowactie | - |
| financiele_documenten | bestandsnaam | B | financieel upload/document-analyse bij insert | AI/documentdetail en bestandsnaam-weergave | alleen opslag/weergave | - |
| financiele_documenten | bestandspad | B | financieel document-upload/opslag | document-download/blob-resolutie | alleen opslag/downloadpad gebruikt | - |
| financiele_documenten | documentstatus | B | financieel upload/analyse; PATCH documentstatus | jaarrekeningdetail/statusbadge | alleen opslag + weergave | - |
| financiele_kerncijfers | handmatig_aangepast | B | financiële correctieactie | kerncijferweergave/markering | alleen opslag + waarschuwing dat waarde handmatig is | - |
| financiele_kerncijfers | is_berekend | B | financiële berekeningsservice | kerncijferdetail/weergave | alleen opslag + aanduiding berekend | - |
| fotos | fase | B | POST /voorzieningen/:id/fotos | voorzieningdetail groepeert foto's in voor/na-weergave | alleen opslag en weergave | - |
| gebouw_email_bijlagen | bestandsnaam | B | emailbijlage-import | bijlagelijst/download gebruikt naam | alleen opslag/weergave | - |
| gebouw_emails | bestandsnaam | B | emailimport | bijlage-/emaildetail toont naam | alleen opslag/weergave | - |
| gebruikers | herkomst_automatisch | B | automatische onboarding/import | gebruikerslijst toont herkomst | alleen opslag/weergave | - |
| gebruikers | is_hoofdtester | B | beheerder gebruikersroute | profiel/beheerweergave | alleen opslag/weergave | - |
| gereedschappen | accu_inbegrepen | B | POST/PATCH /gereedschappen/:id | gereedschapdetail toont accessoires | alleen opslag en weergave | - |
| gereedschappen | koffer_inbegrepen | B | POST/PATCH /gereedschappen/:id | gereedschapdetail toont accessoires | alleen opslag en weergave | - |
| gereedschappen | lader_inbegrepen | B | POST/PATCH /gereedschappen/:id | gereedschapdetail toont accessoires | alleen opslag en weergave | - |
| gereedschappen | met_snoer | B | POST/PATCH /gereedschappen/:id | gereedschapdetail toont kenmerk | alleen opslag en weergave | - |
| go_live_lessen | fase_sleutel | B | POST/PATCH go-live les | go-live dashboard groepeert/toont fase | alleen opslag/weergave | - |
| import_logs | bestandsnaam | B | import-route | importhistorie toont bestandsnaam | alleen opslag/weergave | - |
| inbox_items | bestandsnaam | B | POST inbox upload | inboxlijst/detail/download | - | - |
| inbox_items | bestandspad | B | POST inbox upload/import | download/verwerkingsroute | - | - |
| inkoopbonnen | ai_suggestie | B | AI-inkoopbon suggestie | inkoopbon UI toont suggestie | alleen opslag/weergave | - |
| inkoopplannen | ai_gegenereerd | B | AI-inkoopplan generatie | werkvoorbereiding toont AI-markering | alleen opslag/weergave | - |
| labels | product_foto_geverifieerd | B | beheer/toepassing-detail PATCH; foto-verificatieactie | toepassing-detail toont verificatiestatus/badge | - | - |
| loon_output_bestanden | bestandsnaam | B | loon-output generatie | loonarchief/download toont bestandsnaam | - | - |
| mail_logboek | status | B | email-service logt verzonden/mislukte mail | mail-logboek toont status | - | een mislukte verzending is alleen zichtbaar voor wie het logboek opent; een gefaalde offerte- of factuurmail krijgt geen opvolging |
| medewerker_documenten | bestandsnaam | B | upload/documentroute | documentlijst/downloadmetadata | - | - |
| medewerkers | medewerker_status | B | POST/PATCH /hrm/medewerkers | HRM medewerkerlijst/detail/statusbadge | - | de status (uit dienst/inactief) stuurt geen enkele blokkade — een vertrokken medewerker kan in planningen en keuzelijsten blijven opduiken |
| mod_calc_bronbestanden | bestandsnaam | B | upload/import bronbestand | importlijst en controlescherm | alleen identificatie/weergave | - |
| mod_calc_headers | abk_is_vast | B | PATCH calculatie-header | header/detail en calculatieberekening | alleen vastzetting/opslag en weergave | - |
| mod_calc_headers | ak_is_vast | B | PATCH calculatie-header | header/detail en calculatieberekening | alleen vastzetting/opslag en weergave | - |
| mod_calc_headers | risico_is_vast | B | PATCH calculatie-header | header/detail en calculatieberekening | alleen vastzetting/opslag en weergave | - |
| mod_calc_headers | winst_is_vast | B | PATCH calculatie-header | header/detail en calculatieberekening | alleen vastzetting/opslag en weergave | - |
| mod_calc_leveranciers | actief | B | POST/PATCH mod-calculatie leveranciers | lijst/detailweergave | alleen opslag en weergave | - |
| module_beoordelingen | status | B | modulebeoordeling-aanmaak/statusroute | beoordelingenlijst/detail | alleen opslag + weergave | - |
| offerte_hoofdstukken | ai_veld | B | POST/PATCH hoofdstuk | hoofdstukweergave/AI-markering | alleen badge/markering | - |
| offerte_hoofdstukken | standaardtekst | B | POST/PATCH hoofdstuk | studio/portaal toont standaardtekst | alleen tekstweergave | - |
| offerte_klant_contracten | bestandsnaam | B | upload contract | contractlijst toont naam | alleen opslag/weergave | - |
| offerte_regels | ai_voorstel | B | POST/PATCH offerte-regel/AI-generatie | Studio toont voorstel | alleen opslag/weergave | - |
| offerte_secties | ai_gegenereerd | B | AI/offertegeneratie | Studio toont AI-markering | alleen opslag/weergave | - |
| offerte_sjablonen | actief | B | POST/PATCH sjabloon (offertes.ts) | sjabloonlijst/filter | alleen opslag/weergave | - |
| offerte_uitgangspunten | ai_voorstel | B | POST/PATCH uitgangspunt/AI | Studio toont AI-voorstel | alleen opslag/weergave | - |
| offerte_voorwaarden_sets | actief | B | POST/PATCH offertevoorwaarden (offertes.ts) | voorwaarden laden/weergave | alleen actief/inactief opslaan en tonen | - |
| org_verzekeringen | status | B | organisatie verzekering create/update | verzekeringenlijst/detail | alleen opslag en weergave | een verlopen of opgezegde bedrijfsverzekering levert nergens een signaal op — het bedrijf kan onverzekerd doorwerken zonder dat iemand het merkt |
| prijsafspraken | excl_btw | B | prijsafspraak-import/aanmaak | prijsafspraakdetail en bedragen | alleen opslag + bedraglabel; geen aantoonbare vervolgactie | btw-vlag wordt opgeslagen maar rekent nergens mee: een afspraak die incl. btw is vastgelegd kan 21% naast de werkelijke inkoopprijs zitten |
| profielen | systeem | B | profiel CRUD | profielbeheer toont systeemprofiel | alleen opslag/weergave | - |
| salarisbestanden | bestandsnaam | B | salarisbestand upload | salarisarchiefweergave/download | alleen bestandsidentificatie | - |
| salarisbestanden | bronbestand_naam | B | salarisbestand import | archief/detailweergave | alleen herkomstweergave | - |
| scab_mail_bijlagen | bestandsnaam | B | SCAB-mail import | bijlagenlijst/download toont naam | - | - |
| security_intake_scans | archief_status | B | POST security-intake scan | quarantine-overzicht/detail | - | - |
| security_intake_scans | bestandsnaam | B | security intake upload | security-quarantine zoekresultaat/frontend | - | - |
| security_intake_scans | clamav_status | B | POST security-intake scan | quarantine-overzicht/detail | - | - |
| security_intake_scans | yara_status | B | POST security-intake scan | quarantine-overzicht/detail | - | - |
| sepa_bestanden | bestandsformaat | B | SEPA-mail/upload intake | SEPA-detail/validatie | alleen formaatregistratie | - |
| sepa_bestanden | bestandsnaam | B | SEPA-intake | SEPA-overzicht/detail | alleen identificatie | - |
| slim_upload_log | bestandsnaam | B | slim-upload | uploadhistorie | alleen identificatie | - |
| snagstream_rapporten | bestandsnaam | B | Snagstream-upload | rapportdetail toont naam | alleen opslag/weergave | - |
| snagstream_snags | status_origineel | B | Snagstream-import/overname | snagdetail toont oorspronkelijke status | alleen herkomstweergave | - |
| spot_ai_voorstellen | afwijking_toepassing | B | spot-AI voorstel create/update | voorstel/detail toont afwijking-toepassing | - | - |
| toolbox_berichten | is_belangrijk | B | toolbox bericht aanmaken/bijwerken | toolbox-badge en prioriteitsweergave | - | - |
| uitvoeringsplan_taken | ai_gegenereerd | B | plan- of AI-generatie | taaklijst toont AI-markering | alleen opslag/weergave | - |
| uitvoeringsplannen | ai_gegenereerd | B | AI-plan generatie | UI toont AI-markering | alleen opslag/weergave | - |
| veiligheid_incidenten | ai_voorstel | B | AI-incidentanalyse/PATCH incident | AI-voorstel-label in detail | alleen opslag en weergave | - |
| veiligheid_incidenten | eerste_hulp_verleend | B | POST/PATCH /veiligheid/incidenten | incidentdetail/rapportage toont eerste hulp | alleen opslag en weergave | veiligheidsregistratie zonder opvolging: uit het antwoord volgt geen actie of controle richting BHV/nazorg |
| veiligheid_incidenten | gemeld_bij_arbeidsinspectie | B | PATCH /veiligheid/incidenten/:id | incidentdetail toont meldstatus | alleen opslag en weergave | wettelijke meldplicht (Arbowet): het vinkje registreert de melding maar niets bewaakt dat een meldplichtig incident ook echt gemeld wordt of binnen de termijn |
| veiligheid_lmras | ai_voorstel | B | AI-LMRA-generatie/PATCH LMRA | label dat voorstel AI-gegenereerd is | alleen opslag en weergave | - |
| veiligheid_toolboxen | ai_gegenereerd | B | AI-toolboxgeneratie/PATCH toolbox | badge/herkomst in toolboxbeheer | alleen opslag en weergave | - |
| verlof_aanvraag_log | nieuw_status | B | statuswijziging verlofaanvraag logt nieuwe status | audit/logweergave | - | - |
| verlof_aanvraag_log | oud_status | B | statuswijziging verlofaanvraag logt oude status | audit/logweergave | - | - |
| voertuigen | bandenwissels_status | B | POST/PATCH /wagenpark/voertuigen (body bandenwissels_status) | wagenpark/detail.tsx badge/weergave | - | - |
| voorzieningen | status | B | voorzieningen-routes (aanmaken/wijzigen status) | voorzieningen-lijsten/detail tonen status | - | - |
| wagenpark_meldingen | ai_fotokwaliteit_ok | B | POST kwartaalcontrole foto-check | kwartaalcontrole/meldingweergave | - | - |
| wagenpark_meldingen | ai_kosten_indicatie | B | AI-meldinganalyse | meldingkaart/detail | - | - |
| wagenpark_onderhoud | is_ai_voorstel | B | POST/PATCH onderhoud | onderhoudskaart/-detail (AI-voorstelbadge) | - | - |
| werk_inbox_mails | heeft_bijlage | B | Graph/mail-import insert/update | werk-inbox maildetail/-lijst | - | - |
| werk_inbox_mails | is_gelezen_ms | B | mail-sync/mark-read handeling | werk-inbox lijst/detail | - | - |
| werving_kandidaten | cv_bestandsnaam | B | CV-upload/onboarding | kandidaatdetail en CV-downloadweergave | alleen opslag + weergave | - |
| zzp_overeenkomsten | ai_ingevuld | B | ZZP upload/AI-route | ZZP-detail toont AI-ingevuld | - | - |
| aanvraag_planningen | plattegronden_status | A | aanvraag-planning routes | planning UI en planning-meldingen | plattegrondstap opent/sluit planningwerk | - |
| aanvraag_voorstellen | is_persoonlijk | A | voorstel-aanmaak/bewerkroute | voorstel/verzendflow | bepaalt persoonlijke versus generieke bericht-/voorstelinhoud | - |
| aanvraag_voorstellen | status | A | voorstelroute/statusactie | bewakingsloop en voorsteloverzicht | bewakingsloop verwerkt alleen open voorstellen met conceptantwoord en verstuurt bericht | - |
| abonnementen | actief | A | abonnementen CRUD | toegangs-/facturatiechecks filteren actieve abonnementen | module/toegang of facturatie wordt toegestaan/geblokkeerd | - |
| accountview_export_logs | status | A | AccountView-exportservice | logs filteren op bezig/geslaagd/fout | exportwerk wordt gevolgd en fout/retry gestuurd | - |
| accountview_instellingen | export_actief | A | PATCH instellingen-accountview | AccountView-exportservice leest vlag | export aan/uit | - |
| accountview_instellingen | magazijn_export_actief | A | PATCH instellingen-accountview | magazijn-accountview-export leest vlag | magazijnexport aan/uit | - |
| accountview_instellingen | testmodus | A | PATCH instellingen-accountview | exportservice controleert testmodus | geen echte AccountView-boeking/export in testmodus | - |
| accountview_project_mapping | export_zonder_mapping | A | accountview-mapping instellingen | exportservice controleert mappingbeleid | export zonder projectmapping toegestaan/geblokkeerd | - |
| accountview_relatie_mapping | bestaat_in_accountview | A | accountview-mapping sync | mappingstatus/filter gebruikt | ontbrekende relatie blokkeert of vereist mapping | - |
| actiepunten | status | A | actiepunt create/update/afronden | actiepuntenlijst en werkbakfilters | status opent/sluit actiepunt in werkbak | - |
| ai_beslissingen | controle_nodig | A | AI-beslissing create/update | governance/controlelijst | markering verplicht menselijke controle | - |
| ai_beslissingen | status | A | AI-beslissing create/update | governance/AI-beslissingsworkflow | status bepaalt wachten op gebruiker versus afgehandeld | - |
| ai_prompt_scans | injectie_gedetecteerd | A | governance prompt-scan | governance WHERE injectie_gedetecteerd=true | gedetecteerde prompt-injecties verschijnen als beveiligingssignaal | - |
| ai_wijzigingsvoorstellen | status | A | AI-voorstel create/approve/reject | governance filters status wacht | status opent/sluit menselijke review | - |
| algemene_inkopen | status | A | algemene inkoop-aanmaak/statusroute | inkoopoverzicht en goedkeuringsfilters | status stuurt goedkeurings-/werkbakflow | - |
| app_instellingen | ai_leren_van_correcties_ingeschakeld | A | instellingenbeheer; AI-bewijs-script | aiDrempelCheck/correctieverwerking | bepaalt of correcties voor AI-leren worden gebruikt | - |
| app_instellingen | heatmap_tracking_ingeschakeld | A | instellingenbeheer | tracking/heatmap-initialisatie | schakelt tracking en daarmee privacygevoelige meting aan/uit | - |
| app_instellingen | moments_verjaardag_ingeschakeld | A | instellingenbeheer | moments/verjaardag-service | schakelt verjaardagsmoment/berichtgeving aan of uit | - |
| app_instellingen | opdrachtbevestiging_auto_verzenden | A | instellingenbeheer | opdrachtbevestigingsservice | bepaalt of bevestigingsmail automatisch wordt verzonden | - |
| arbeidsovereenkomsten | ondertekening_vereist | A | workflow-config PATCH arbeidsovereenkomst | contractworkflow | vereiste ondertekening blokkeert afronding tot ondertekening | - |
| arbeidsovereenkomsten | status | A | workflow-config PATCH arbeidsovereenkomst | contractoverzicht en signaleringslogica | status actief beëindigd bepaalt geldigheid/contractsignalering | - |
| artikelen | actief | A | artikel create/update | kbService filter actief | inactieve kennisbankartikelen worden niet aangeboden aan zoekers/AI | - |
| artikelen | goedgekeurd_door_fps | A | artikel review/update | kbService filter en sortering | alleen FPS-goedgekeurde artikelen worden in goedgekeurde kenniscontext gebruikt | - |
| avg_inzageverzoeken | status | A | AVG inzageverzoek routes | AVG-lijst/statusfilter; export/anonimiseer | status stuurt wettelijke inzageworkflow | - |
| avg_verwerkers | vwo_aanwezig | A | verwerkerregistratie/update | AVG-complianceoverzicht | ontbrekend VWO wordt als complianceprobleem gesignaleerd | - |
| backup_records | status | A | backupService start/afrond/fout | backup alarm en backupService filters | alleen klaar/geverifieerd geldt als bruikbare backup; fout/bezig triggert alarm/retentiegedrag | - |
| bewaking_draaien | status | A | bewakingsloop start/einde | scheduler voorkomt dubbele loop via status | bewakingsloop wordt gestart of niet opnieuw gestart | - |
| boekhouder_uploads | gelezen | A | boekhouder-portaal leesactie | uploads filteren op ongelezen en markeren gelezen | ongelezen werkbak/notificatie verdwijnt na lezen | - |
| brandstof_importen | geladen | A | importverwerkingsroute | importverwerkingslogica | geladen markeert dat regels zijn ingelezen en voorkomt dubbele verwerking | - |
| brandstof_importen | status | A | POST/PATCH brandstof-import; afronden import | importstatus/filters | status verwerkt bepaalt of import klaar is en voorkomt/herhaalt verwerking | - |
| brandstof_regels | koppeling_status | A | PATCH /wagenpark/brandstof-importen/:id/regels; automatische koppeling | brandstof-import frontend (filter/badge); afrondroute | onzeker/niet_gevonden bepaalt welke regels verwerkbaar zijn en koppeling/totalen | - |
| bruikleen_overeenkomsten | definitief | A | POST /bruikleen-overeenkomsten/:id/ondertekenen | detail en wijzigingsroute controleert definitief | definitieve overeenkomst mag niet stilzwijgend worden gewijzigd | - |
| calculaties | status | A | calculatie create/update | calculatieoverzicht/statusfilters | status stuurt calculatieworkflow | - |
| compliance_signalen | status | A | werkvoorbereiding detectie/update | KPI/dashboard filtert open signalen | open compliance-signaal verschijnt in werkbak/KPI en sluit na oplossing | - |
| contract_besluiten | status | A | besluit-aanmaak/update | besluitenoverzicht en workflow | status bepaalt besluitworkflow en of behandeling nog openstaat | - |
| contract_signaleringen | status | A | signalering-aanmaak/update | contractsignaleringsoverzicht/filters | nieuw/open signalering veroorzaakt opvolgtaak; afgehandeld sluit die | - |
| cqo_bevindingen | positief | A | CQO analyse/handmatige beoordeling | bevindingenfilter en samenvatting | positieve versus negatieve bevindingen bepaalt CQO-uitkomst/actie | - |
| cqo_runs | release_geblokkeerd | A | CQO blokkadeactie | releasebeslissing | blokkeert vrijgave van CQO-resultaat | - |
| cqo_runs | release_status | A | CQO vrijgaveactie | CQO-overzicht/releasebeslissing | bepaalt of run bevindingen vrijgegeven mogen worden | - |
| cqo_runs | status | A | CQO run start/update | CQO-overzicht en runpolling | lopende runs houden verwerking actief; eindstatus opent resultaten | - |
| crm_commercieel | fase | A | commerciële kans-aanmaak/faseactie | pipelinefilters en kanban | fase bepaalt pipelinekolom en opvolgwerk | - |
| crm_contactpersonen | primair | A | contactpersoon-aanmaak/bewerkroute | CRM contactselectie | bepaalt primair contact voor communicatie/voorstellen | - |
| crm_klanten | status | A | CRM klant-aanmaak/bewerkroute | CRM-lijsten en klantselecties | status filtert/selecteert klant in commerciële flows | - |
| crm_opdrachten | status | A | opdracht-aanmaak/statusactie | opdrachtlijsten en voortgangsfilters | status opent/sluit werk- of opvolgflow | - |
| crm_relatievoorstellen | status | A | relatievoorstel-aanmaak/statusactie | relatievoorstellenlijst | status bepaalt open/opvolgen versus afgehandeld | - |
| crm_scout_runs | status | A | scoutService start/run-update | scout-runlijst en polling/statusweergave | lopend/beëindigd bepaalt runbewaking en beschikbaarheid resultaten | - |
| crm_taken | status | A | CRM taak-aanmaak/statusactie | takenlijst en werkbakfilters | open taken blijven in opvolgwerkbak; andere status sluit ze | - |
| declaraties | status | A | indienen/goedkeuren/afwijzen/verwerken | boekhouderlijst filtert goedgekeurd/verwerkt | goedkeuring activeert loonbetaling/verwerking; mail/notificatie | - |
| document_studio_modellen | referentie_bestand_pad | A | Studio referentiebestand upload | Studio download/preview | pad bepaalt bronbestand voor modelreferentie | - |
| document_studio_modellen | status | A | Studio model create/update/goedkeuren | Studio selecteert status goedgekeurd en concept/referentie | alleen goedgekeurde modellen worden bij documentgeneratie gebruikt | - |
| documenten | ai_geanalyseerd | A | document-AI analyse-route | documentlijsten/detail en heranalysekeuze | voorkomt/herkent heranalyse en bepaalt AI-verwerkingsstatus | - |
| documenten | gearchiveerd | A | document-archiveerroute | documentqueries, filters en downloads | gearchiveerde documenten worden standaard uitgesloten en kunnen niet normaal worden gewijzigd | - |
| documenten | goedkeuring_status | A | document-goedkeuringsactie | goedkeuringsfilters en documentdetail | goedkeuring bepaalt of document actief/toepasbaar wordt | - |
| documenten | status | A | document-aanmaak/statusroute | documentqueries, portaal en toegangscontroles | status definitief/gearchiveerd bepaalt wijzigbaarheid/toegang en klantzichtbaarheid | - |
| documentsoorten | heeft_vervaldatum | A | documentsoort-aanmaak/bewerkroute | bewakingsloop vervaldatums | alleen soorten met vervaldatum leveren termijn-/waarschuwingstaak op | - |
| dossier_documenten | status | A | dossierdocument-aanmaak/statusroute | dossierdocumentlijst en statusfilters | status bepaalt documentfase/bruikbaarheid in dossier | - |
| dossiers | status | A | dossier-aanmaak/statusroute | dossierlijst en wijzigingscontrole | definitief/gearchiveerd blokkeert wijzigingen (409) en beïnvloedt toegang | - |
| eenheidsprijzen | actief | A | POST/PATCH /eenheidsprijzen | calculatieprijsselectie filtert actieve prijzen | inactieve prijs wordt niet gekozen in calculatie (prijsbeslissing) | - |
| facturen | accordering_status | A | goedkeuring-routes/engine | goedkeuringsaanvragen en statusweergave | goedkeuringsworkflow opent/sluit | - |
| facturen | accountview_status | A | AccountView-exportservice | exportstatus en retry/resultaat tonen | export wordt gevolgd/kan opnieuw worden uitgevoerd | - |
| facturen | ai_gelezen | A | factuur-uitleesservice | factuurweergave en AI-uitleesstatus gebruiken | AI-intake/uitleesworkflow wordt gemarkeerd | - |
| facturen | betaalstatus | A | betaalstatus-route/import | openstaande/betaalde facturen filteren en tonen | betalingsopvolging/overzichten veranderen | - |
| facturen | g_rekening_van_toepassing | A | factuurprijscontrole/import | prijs-/betalingsberekening leest vlag | G-rekeningbedrag/betalingscontrole wijzigt | - |
| facturen | geaccordeerd | A | goedkeuring afronden | exportvoorwaarden en factuuroverzichten controleren | alleen geaccordeerde facturen exporteerbaar | - |
| facturen | geblokkeerd | A | factuurcontrole/risicopad | directiecockpit en goedkeuringspad filteren geblokkeerde facturen | geblokkeerde factuur komt niet in goedkeuringswerkbak | - |
| facturen | iban_afwijking | A | factuur-uitlezing/prijscontrole | factuurdetail toont waarschuwing en controle leest vlag | betalingscontrole kan afwijking signaleren/blokkeren | - |
| facturen | status | A | factuur aanmaken, goedkeuren/afwijzen, export | goedkeuring, onderhanden-werk en cockpit filteren op status | workflow/werkbak en financiële totalen veranderen | - |
| facturen | status_voor_afwijzing | A | goedkeuring-engine bij afwijzing | herstel/afwijzingspad leest vorige status | status kan na herstel teruggezet worden | - |
| factuur_correspondentie | status | A | factuurmail/correspondentie-routes | concept/verzonden correspondentie filteren | bericht kan worden verzonden en status sluit actie | - |
| factuur_import_instellingen | actief | A | import-instellingen PATCH | importjob selecteert actieve instellingen | factuurimport draait wel/niet | - |
| factuur_import_log | status | A | importjob | importlog filtert verwerkt/fout | importfouten/opvolging worden bepaald | - |
| factuur_opmerkingen | afgehandeld | A | signaal-opmerking afhandelroute | open/afgehandelde opmerkingen filteren | opmerking verdwijnt uit actievoorraad | - |
| factuur_signalen | status | A | factuurcontrole; /facturen/signalen/:id/afhandelen | open signalen worden geselecteerd en getoond | signaal sluit/verdwijnt uit werkvoorraad | - |
| factuur_termijnen | status | A | termijnen-route/generatie | termijnbewaking selecteert geplande/vervallen termijnen | betalings-/termijnopvolging loopt | - |
| fie_ak_adviezen | status | A | advies-aanmaak/update | concurrency/script en advieslijsten filter open | open advies is werkvoorraad; statuswijziging sluit/beïnvloedt verwerking | - |
| fie_ak_posten | actief | A | post-aanmaak/update | akEigenCijfers WHERE actief=true | inactieve posten worden uitgesloten van begrotings-/premieberekening | - |
| fie_jaarbegrotingen | status | A | begroting-aanmaak/update | ak-eigen-cijfers queries sluiten scenario uit | status scenario/concept bepaalt of begroting in financiële berekeningen meetelt | - |
| fie_nacalculaties | afgesloten | A | nacalculatie afsluiten/update | inkoopEigenCijfers filter afgesloten | alleen afgesloten nacalculaties worden als werkelijk besteed/AI-context gebruikt | - |
| financiele_contract_signaleringen | status | A | signalering aanmaken/afhandelen | open signaleringen worden gefilterd | contractactie/werkvoorraad opent of sluit | - |
| financiele_contracten | automatische_verlenging | A | contract aanmaken/bewerken | contractbewaking controleert vlag | signalering/termijnopvolging voor verlenging | - |
| financiele_contracten | status | A | contract aanmaken/bewerken | contractbewaking selecteert actieve contracten | bewakingsloop en signaleringen veranderen | - |
| financiele_documenten | dataset_status | A | PATCH financieel document dataset-status | jaarrekeninglijst/detail en kerncijfer-goedkeuringsflow | reviewed/approved/rejected bepaalt of dataset/kerncijfers worden meegenomen | - |
| financiele_documenten | extractie_status | A | financieel upload/extractieservice; extractie-statusupdates | jaarrekeningdetail en extractie/herstelbeslissingen | extractie-fout toont herstelactie/blokkeert goedkeuring | - |
| financiele_documenten | is_actueel | A | financieel upload/actueel-markering | financiële jaarrekeningselecties | alleen actuele documenten tellen mee in dashboards/meerjarenoverzicht | - |
| financiele_kerncijfers | geconsolideerd | A | jaarrekening-extractie/insert kerncijfers | meerjarenoverzicht-schakelaar en financiële selecties | filter bepaalt geconsolideerde versus enkelvoudige cijfers | - |
| financiele_kerncijfers | status | A | kerncijfer-extractie en goedkeuringsactie | financiële detail/lijsten | status bepaalt of cijfers voorgesteld/goedgekeurd zijn en meetellen | - |
| financiele_kerncijfers | uitgesloten | A | financiële correctie/uitsluitactie | cijferselecties en totalen | uitgesloten cijfers worden uit berekeningen/overzichten geweerd | - |
| fps_bedrijfsstandaarden | actief | A | KB bedrijfsstandaard-route | kbService filtert actieve standaarden | inactieve standaard komt niet in AI/KB-context | - |
| fps_visual_annotaties | afwijking_status | A | annotatie PATCH | inspectie-overzicht filtert afwijkingen/status | status stuurt inspectie-opvolging/werkbak | - |
| fps_visuals | actief | A | POST/PATCH visual-library | visuals.ts/offertes.ts/VGE filteren actieve visuals | inactieve visual kan niet worden gekozen/toegepast | - |
| functies | actief | A | POST/PATCH /hrm/functies | planning-module filtert actieve functies | inactieve functie sluit personeel uit planning | - |
| functies | uitvoerend | A | POST/PATCH /hrm/functies | planning-module filtert uitvoerend personeel; planning UI | niet-uitvoerend personeel komt niet in uitvoeringsplanning | - |
| gebouw_email_samenvattingen | geverifieerd | A | samenvatting-verificatie route | ongeverifieerde samenvattingen worden geselecteerd; geverifieerd beschermt handmatige tekst | AI-overschrijving wordt voorkomen | - |
| gebouw_emails | ai_relevant | A | email-AI-analyse | relevante mails worden geselecteerd/gefilterd | AI-verwerking/actievoorstel alleen voor relevante mail | - |
| gebouw_emails | status | A | emailimport/verwerking | in behandeling/verwerkt filtert werkvoorraad | mail wordt uit de verwerkingsqueue gehaald | - |
| gebouw_publicaties | status | A | publicatie-route | portaal publicatieselectie | alleen gepubliceerde versie is extern zichtbaar | - |
| gebouwen | galerij_upload_toegestaan | A | gebouw PATCH | galerij/upload-autorisatie | upload wordt toegestaan of geblokkeerd | - |
| gebouwen | gearchiveerd | A | gebouw PATCH/archiveerroute | portaal/one-dashboard filters actieve gebouwen | gearchiveerd gebouw verdwijnt uit actieve werkvoorraad | - |
| gebouwen | project_status | A | gebouw/project routes | portaal, AI-context, projectoverzichten | projectstatus stuurt workflowstatus | - |
| gebruikers | actief | A | beheerder PATCH gebruiker | auth en meldings-/bewakingsqueries filteren actieve gebruikers | inactieve gebruiker kan niet inloggen/ontvangt geen werkbak | - |
| gebruikers | gearchiveerd | A | beheerder archiveeractie | bewakingsloop en gebruikersqueries filteren gearchiveerd | gearchiveerde gebruiker valt uit opvolging | - |
| gebruikers | moet_wachtwoord_wijzigen | A | beheerder/resetroute | auth middleware leest veld | login wordt geblokkeerd/omgeleid tot wijziging | - |
| gebruikers | twee_factor_ingeschakeld | A | 2FA-instelroute | auth/login controleert 2FA | toegang wordt geblokkeerd tot tweede factor | - |
| gebruikers | uitnodiging_status | A | uitnodigingsroute | onboarding/beheer toont status | status stuurt uitnodiging/resend-flow | - |
| gebruikers_meldingen | status | A | melding aanmaken/status PATCH | meldingenfilter/banner leest status | melding verdwijnt uit actieve notificaties | - |
| gebruikers_meldingen | tech_context_toestemming | A | toestemmingsroute | AI/technische contextverwerking controleert toestemming | AI-gebruik wordt toegestaan of geweigerd | - |
| gereedschap_meldingen | kan_nog_veilig_gebruikt_worden | A | POST /gereedschap-meldingen | meldingdetail en statusafhandeling gebruiken veiligheidsoordeel | onveilig gereedschap wordt defect/uit gebruik genomen | - |
| gereedschap_meldingen | status | A | PATCH /gereedschap-meldingen/:id | meldingenlijst filtert nieuwe/afgehandelde meldingen | melding opent/sluit defectopvolging | - |
| gereedschappen | keuringsplichtig | A | POST/PATCH /gereedschappen/:id | gereedschapoverzicht/keuringsoverzicht selecteert keuringsplichtig | keuringstaak/termijnopvolging ontstaat | - |
| gereedschappen | status | A | POST/PATCH /gereedschappen/:id; meldingsactie | lijst filtert/statusbadge; uitgifte controleert status | defect/uitgeleend/afgekeurd blokkeert gebruik of uitgifte | - |
| go_live_adviezen | status | A | POST/PATCH advies | go-live lijst filtert open adviezen | advies verdwijnt uit open werkbak bij sluiten | - |
| go_live_fasen | status | A | POST/PATCH go-live fase | go-live overzicht filtert/statusweergave | fase opent/sluit go-live stap | - |
| goedkeuring_aanvragen | status | A | goedkeuring-aanvraag routes | goedkeuring-engine en bewakingsloop | status opent/sluit goedkeuring, herinnering en escalatie | - |
| goedkeuring_beleidsregels | actief | A | goedkeuringsbeleid-route | engine selecteert actieve beleidsregel | inactief beleid wordt niet toegepast | - |
| goedkeuring_beleidsregels | vier_ogen_verplicht | A | goedkeuringsbeleid-route | goedkeuring-engine | tweede goedkeurder verplicht; eerste akkoord sluit niet definitief | - |
| governance_checks | geblokkeerd | A | governance-engine schrijft checkresultaat | dashboard filtert geblokkeerde checks | governance-blokkade verhindert/escaleert routehandeling | - |
| governance_wachtrij | status | A | governance-engine insert; governance approve/reject | wachtrij filtert op wacht/afgehandeld | taak blijft open of wordt afgehandeld na goedkeuring | - |
| helpdesk_tickets | status | A | helpdesk ticket-aanmaak/statusroute | helpdesk-lijsten en open-filter | open tickets blijven in werkbak; sluiten haalt ze uit opvolging | - |
| hrm_ai_voorstellen | status | A | HRM AI-voorstel routes | voorsteloverzicht en beslisroutes | open voorstel wacht beoordeling; accepteren/verwerpen vervolgt workflow | - |
| hrm_middelen | retour_vereist | A | HRM middelen route | middelen/retourcontrole | retourtaak ontstaat of blijft open | - |
| hrm_middelen | status | A | HRM middelen routes | middelenoverzicht en openstaande filters | status opent/sluit uitgifte/retourwerk | - |
| hrm_onboarding_taken | status | A | HRM onboarding routes | onboarding-overzicht filtert openstaand | taak opent/sluit onboardingwerk | - |
| import_logs | bestand_pad | A | import-upload | import/download/logroute gebruikt pad | bestand wordt opgehaald/verwerkt | - |
| inbox_items | ai_geconsolideerd | A | inbox AI-consolidatieroute | consolidatie-herhaaljob en UI | bepaalt of AI-consolidatie opnieuw draait | - |
| inbox_items | geconsolideerd_override | A | inbox override-route | consolidatiebeslissing | handmatige override voorkomt/forceert AI-consolidatie | - |
| inbox_items | mogelijk_duplicaat | A | inbox verwerking | inboxfilter/UI | duplicaat wordt gemarkeerd voor blokkade/controle | - |
| inbox_items | status | A | inbox upload en statusacties | inboxlijst, werk-inbox en bewakingsloop | status opent/sluit werkbakitem | - |
| indirecte_werkzaamheden | actief | A | beheer indirecte werkzaamheden CRUD | urenregistratie-selectie toont alleen actieve opties | inactieve werkzaamheid kan niet meer worden gekozen | - |
| inkoopbonnen | status | A | POST/PATCH inkoopbon | leverbewaking en inkoopEigenCijfers filteren status | levertermijnbewaking en AI-inkoopcontext worden geactiveerd | - |
| inkoopplan_regels | status | A | POST/PATCH regel | bewakingsloop/inkoopoverzicht filtert regels | regel komt in opvolging/werkbak of valt eruit | - |
| inkoopplannen | status | A | POST/PATCH inkoopplan (opdrachten.ts/workflow-configs.ts) | bewakingsloop/werkvoorbereiding filtert planstatus | openstaande werkbak-/bewakingsitems ontstaan of verdwijnen | - |
| inspectie_bevindingen | herstel_vereist | A | bevinding update | open-herstel-/inspectieoverzichten | vereist herstelwerk en houdt bevinding open | - |
| inspectie_bevindingen | status | A | bevinding create/update | bevinding- en inspectieoverzicht | status stuurt herstel/afhandeling | - |
| inspecties | goedgekeurd | A | inspectie goedkeuractie | inspectie-/rapportworkflow | goedkeuring laat rapport/afhandeling doorgaan | - |
| inspecties | status | A | inspectie create/start/afronden | dashboard/kalender/monteurfilters | status stuurt werkbak, planning en afsluiting | - |
| kantoor_releases | build_geslaagd | A | release-validatie | readinesscontrole gebruikt buildresultaat | release kan worden geblokkeerd | - |
| kantoor_releases | db_wijzigingen_gecontroleerd | A | release-go/no-go route | readinesscontrole leest vlag | release kan worden geblokkeerd | - |
| kantoor_releases | geen_kritieke_fouten | A | security/release-validatie | releasepagina en activatie controleren vlag | kritieke fout blokkeert release | - |
| kantoor_releases | is_actief | A | POST/PUT release activeren | actieve release wordt geselecteerd door clients | welke release live is verandert | - |
| kantoor_releases | release_notes_aangemaakt | A | release-go/no-go route | readinesscontrole leest vlag | release kan worden geblokkeerd | - |
| kantoor_releases | release_readiness_akkoord | A | release-go/no-go route | release-readiness controleert akkoord | publicatie kan worden toegestaan/geblokkeerd | - |
| kantoor_releases | status | A | kantoor-release routes | release-overzicht/detail filtert status | release kan naar wacht/actief en publicatiepad | - |
| kantoor_releases | tests_geslaagd | A | release-validatie | readinesscontrole gebruikt testresultaat | release kan worden geblokkeerd | - |
| labels | gearchiveerd | A | beheer toepassingen PATCH archiveer | toepassingenlijst filtert/markeert archief | gearchiveerde label/toepassing wordt uit actuele selectie geweerd | - |
| leverancier_prestaties | geschikt_spoed | A | KB/leverancier-prestatie route | KB-selectie/advies | geschikte spoedleverancier beïnvloedt spoedadvies | - |
| leveranciers | actief | A | leverancier CRUD | leverancierselecties filteren actief | inactieve leverancier niet beschikbaar voor nieuwe facturen | - |
| leveranciers | g_rekening_van_toepassing | A | leverancier CRUD | factuuruitlezen/factuurcontrole leest vlag | G-rekeningbedrag en signalen worden berekend | - |
| leveranciers | geschikt_voor_spoed | A | leverancier CRUD | kennisbank markeert spoed mogelijk | spoedleveranciers worden geselecteerd/benoemd | - |
| leveranciers | heeft_raamovereenkomst | A | leverancier CRUD | kennisbank/leverancierselectie gebruikt attribuut | leverancier krijgt raamovereenkomstkenmerk in keuze/advies | - |
| login_pogingen | gelukt | A | loginroute schrijft poging na authenticatie | beveiligings-/logincontrole en audit | mislukte pogingen tellen mee voor blokkade/rate-limit; succesvolle login laat sessie toe | - |
| login_pogingen | nieuw_apparaat | A | loginroute/device-detectie | loginbeveiliging/notificatie | nieuw apparaat kan extra verificatie/waarschuwing activeren | - |
| login_pogingen | nieuw_ip | A | loginroute/IP-detectie | loginbeveiliging/notificatie | nieuw IP kan extra verificatie/waarschuwing activeren | - |
| loon_output_bestanden | status | A | loon-output generatie/verwerkingsroutes | outputlijst filtert status | bepaalt of output ontvangen/klaar/fout is en vervolgstap beschikbaar wordt | - |
| loon_output_bestanden | zichtbaar_medewerker | A | HRM-publiceeractie | medewerker-salarisdocumenten filteren op zichtbaar | document wordt wel/niet aan medewerker gepubliceerd | - |
| magazijn_inkooporders | status | A | POST/PATCH inkooporder; versturen/ontvangen | lijst en ontvangstacties filteren status | versturen/mail, ontvangst en voorraad/besteld veranderen | - |
| magazijn_locaties | actief | A | POST/PATCH /magazijn/locaties/:id | voorraad/picklijst selecteert actieve locaties | inactieve locatie kan niet voor voorraad/picken worden gebruikt | - |
| magazijn_picklijst_regels | status | A | PATCH picklijstregel/picken | detail toont open/gepickt/niet_beschikbaar | regel opent/sluit pickwerk en stuurt picklijststatus | - |
| magazijn_picklijsten | status | A | POST/PATCH picklijst; starten/voltooien | lijst filtert status | uitgifte/picken en voorraadmutaties; voltooiing sluit werk | - |
| magazijn_stellingscans | status | A | POST /magazijn/stellingscans; goedkeuren | scanlijst filtert analyseren/gereed/goedgekeurd | AI-resultaat doorlopen en goedkeuren kan voorraadmutaties opleveren | - |
| marktspiegel_onderzoeken | status | A | marktspiegel onderzoek create/update | onderzoeksoverzicht/statusfilters | status stuurt onderzoekworkflow | - |
| materiaal_aanvragen | status | A | POST/PATCH /materiaal-aanvragen/:id | aanvragenlijst/detail en statusfilters | goedkeuren maakt concept-inkoopbon aan (gedeeld pad inkoopbonService) en sluit het werkbakitem via handelHerkomstAf in dezelfde transactie | - |
| medewerker_aanstellingen | is_hoofd | A | HRM aanstelling-route | medewerkercontext/hoofd-aanstellingselectie | bepaalt primaire aanstelling | - |
| medewerker_opleidingen | status | A | HRM opleiding-toewijzing/statusroute | medewerkeropleidingsoverzicht en voortgang | status bepaalt behaald/open opleidingsvoortgang | - |
| medewerkers | actief | A | POST/PATCH /hrm/medewerkers | planning, bewakingsloop, auth/context filters | inactieve medewerker wordt niet gepland/bewaakt | - |
| medewerkers | verjaardag_zichtbaar | A | PATCH medewerker | services/moments/verjaardag filtert zichtbaarheid | verjaardagmoment/notificatie wordt wel/niet getoond | - |
| mod_calc_artikelen | actief | A | POST/PATCH mod-calculatie artikelen | artikelzoekopdracht WHERE actief=true | inactieve artikelen worden uit calculatiezoekresultaat geweerd | - |
| mod_calc_bronbestanden | status | A | upload/import en analyse/bevestigen | importlijst; queries op status geanalyseerd | status stuurt import-/analyse-workflow | - |
| mod_calc_headers | status | A | calculatie create/update/import | bewakingsloop WHERE status in open-statussen; headerweergave | AI-/bewakingsverwerking selecteert open calculaties | - |
| mod_calc_inkoop_items | herinnering_verstuurd | A | inkoop-item herinneringsactie | inkoopoverzicht/bewakingsloop | voorkomt dubbele herinnering en markeert verzonden bericht | - |
| mod_calc_inkoop_items | offerte_ontvangen | A | inkoop-item PATCH/ontvangst offerte | inkoopoverzicht en bewakingsloop | offerte ontvangen sluit/actualiseert inkoopopvolging | niet genoeg concrete route-evidence |
| mod_calc_inkoop_items | status | A | inkoop-item create/update | inkoopfilters en bewakingsloop | status stuurt inkoopwerkbak/opvolging | - |
| mod_calc_normtijden | actief | A | POST/PATCH mod-calculatie normtijden | calculatie-engine WHERE actief=true | alleen actieve normtijden worden toegepast | - |
| mod_calc_regels | is_bouwplaatskosten | A | POST/PATCH calculatieregel/import | calculatie-totalen | regel wordt als bouwplaatskosten in kostendoorrekening opgenomen | - |
| mod_calc_regels | is_staartkosten | A | POST/PATCH calculatieregel/import | calculatie-totalen | regel wordt als staartkosten in kostendoorrekening opgenomen | - |
| mod_calc_regels | optioneel | A | POST/PATCH calculatieregel/import | calculatie-totalen/regelweergave | optionele regels worden bij totalen/doorrekening anders behandeld | - |
| mod_calc_tarieven | actief | A | POST/PATCH mod-calculatie tarieven | mod-calculatie selectie WHERE actief=true | alleen actieve tarieven worden gebruikt in calculatie | - |
| offerte_email_log | status | A | mail-route bij verzenden/updaten log | mailhistorie/statusweergave | status bepaalt verzend-/foutregistratie en opvolging | - |
| offerte_klant_contracten | bestand_pad | A | upload contract | download/documentroute gebruikt pad | pad bepaalt welk bestand wordt aangeboden | - |
| offerte_regels | is_optioneel | A | POST/PATCH offerte-regel | ai-log controleert optionele regel; portaal toont keuze | regel wordt wel/niet meegenomen in klantbeslissing | - |
| offerte_regels | optioneel_geselecteerd | A | portaal keuze, PATCH klantactie | portaal checkbox/filter | selectie beïnvloedt geaccepteerde offerte | - |
| offerte_secties | actief | A | POST/PATCH sectie | portaal filtert alleen actieve secties | inactieve secties verschijnen niet in klantportaal | - |
| offertes | portaal_status | A | portaal-handeling tekenen/afwijzen/wijziging (routes/ai-log.ts) | portaal UI bepaalt beschikbare acties/statusweergave | ondertekenen/afwijzen zet status; ondertekenen kan projectrecord laten ontstaan | - |
| offertes | status | A | POST offerte; workflow PATCH status | statusfilters, workflow-configs, dashboards | status stuurt offerteworkflow en rapportage | - |
| onderaannemer_orders | status | A | POST/PATCH order | orderlijst filtert status | status stuurt orderopvolging | - |
| onderhoud | status | A | PATCH onderhoud (workflow-configs.ts) | onderhoudslijst/AI-context filtert status | status stuurt onderhoudsopvolging | - |
| onderhoudscontracten | automatische_verlenging | A | POST/PATCH contract | contract-/factuurflow leest verlengvlag | contractverlenging wordt automatisch gepland | - |
| onderhoudscontracten | status | A | POST/PATCH contract | contractoverzicht/factuurflow gebruikt status | contract wordt actief/inactief in opvolging | - |
| opdracht_checklist_items | afgevinkt | A | PATCH checklist-item | checklist filtert open/afgevinkt | afvinken sluit checklistwerk af | - |
| opdrachten | ai_fase | A | PIM-fase-transities/AI-advies | PIM-scherm en dashboard filteren fase | fase stuurt volgende AI/werkvoorbereidingsactie en blokkade op ongeldige transitie | - |
| opdrachten | mandagstaat_vereist | A | PATCH opdrachten; create | mandagstaat-generator controleert vlag, route geeft anders 422 | mandagstaat wordt verplicht of geweigerd | - |
| opdrachten | status | A | opdrachten PATCH/statusacties | lijsten, veiligheid, planning en bewakingsloop filteren actief/afgerond | opdracht komt in/uit actieve werkstromen | - |
| opleidingen | verplicht | A | POST/PATCH /hrm/opleidingen | opleidingsoverzicht en functie/opleidingsvereisten | verplichte opleiding beïnvloedt HRM vereisten | - |
| opleverrapporten | certificaat_geaccordeerd | A | rapport-goedkeuring | certificaat-/rapportweergave controleert akkoord | certificaat wordt vrijgegeven of reset bij nieuwe versie | - |
| opleverrapporten | status | A | rapport aanmaken/publiceren/versie | rapportlijst en goedkeuring lezen status | rapport wordt definitief/vervangen en toegang/publicatie verandert | - |
| opname_items | afgerond | A | PATCH /opnames/:id/items/:itemId | opname-detail telt/filtert open items | item sluit opname-opvolging en kan opname afronden | - |
| opnames | status | A | POST/PATCH /opnames/:id | opnameoverzicht filtert concept/definitief | definitief vergrendelt/activeert opname voor calculatie | - |
| org_bedrijfsdocumenten | bestand_hash | A | bedrijfsdocument upload/analyse | deduplicatie/herkenning | hash voorkomt dubbele documentverwerking | - |
| org_bedrijfsdocumenten | bestand_pad | A | bedrijfsdocument analyse/upload | download en analyse-objectopslag | pad bepaalt welk bestand wordt opgehaald/geanalyseerd | - |
| org_bedrijfsdocumenten | status | A | bedrijfsdocument analyse/correctie | documentlijst en analysefilters | status stuurt documentclassificatie-/reviewpad | - |
| org_jaarverslagen | definitief | A | jaarverslag publiceer/definitief-actie | jaarverslaglijst/detail | definitief markeert document als afgerond/publiceerbaar | - |
| overwerk_sloten | status | A | overwerk-slot routes openen/sluiten | slotlijsten filteren status | open slot laat overwerk toe; gesloten slot niet | - |
| pbm_inspecties | ai_keur_nodig | A | AI-inspectie/PATCH inspectie | dashboard/inspectie-overzicht selecteert AI-keuring nodig | keuring/opvolging wordt noodzakelijk | - |
| pbm_inspecties | formele_status | A | POST /veiligheid/pbm/inspecties; PATCH inspectie | dashboard filtert in_behandeling | inspectie blijft/open gaat uit formele werkvoorraad | - |
| pbm_items | status | A | POST/PATCH /veiligheid/pbm/:id | dashboard en kalender filteren actief/afgekeurd | afgekeurd PBM telt als risico; actieve PBM krijgt keuring in kalender | - |
| pim_foto_analyses | afwijkingsstatus | A | foto-analyse route | inspectie/foto UI en afwijkingsfilters | afwijking wordt gemarkeerd voor opvolging | - |
| pim_foto_analyses | status | A | PIM foto-analyse route | fotoanalyse-overzicht/worker | status stuurt analysejob (wachtend/verwerkt) | - |
| pim_modellen | aanvraag_via_one | A | PIM-model route | One-aanvraag UI/routes | bepaalt of aanvraag via One wordt aangeboden | - |
| pim_uitvoering_stappen | status | A | PIM uitvoeringstap-route | opdrachten-overzicht selecteert stapstatus | status opent/sluit uitvoeringsstap | - |
| planning_afwezigheid | status | A | POST/PATCH /planning/afwezigheid/:id | overzicht filtert aangevraagd/goedgekeurd | goedkeuring beïnvloedt beschikbaarheid/planning | - |
| planning_items | op_gesloten_dag | A | POST/PATCH planning-item | planningvalidatie controleert gesloten dag | planning op gesloten dag wordt geblokkeerd (422) | - |
| planning_items | status | A | POST/PATCH /planning/items/:id; workflow-transitie | planning- en werkbakqueries filteren status | planningitem opent/sluit werkvoorraad en workflowbeslissingen | - |
| planning_items | uitvoering_status | A | workflow transities planning-item | planning/monteurweergave filtert uitvoeringsfase | uitvoering/gereedmelding en vervolgwerk worden geactiveerd | - |
| planning_meerwerk | status | A | POST/PATCH meerwerk | meerwerkoverzicht filtert status | goedkeuring/afwijzing bepaalt vervolg van meerwerk | - |
| project_begrotingen | status | A | POST/PATCH begroting | begrotingsoverzicht filtert concept/definitief | status bepaalt of begroting beschikbaar/definitief is | - |
| projecten | status | A | POST/PATCH project; goedkeuring-engine | projectlijsten, financiële rapportage en workflow filteren status | project gaat open/actief/afgesloten en beïnvloedt opvolging | - |
| regie_begroting | ai_signalering_actief | A | PUT /regie/.../begroting | AI-drempel/signalering leest vlag | AI-signalen worden aan/uit gezet | - |
| regie_materialen | status | A | POST/PATCH /regie/materialen | bewakingsloop filtert concept/goedgekeurd | openstaand regie-werkbakitem ontstaat | - |
| regie_voorwaarden | fotos_vereist | A | PUT regievoorwaarden | opdracht/werkbon-flow | foto's worden verplicht | - |
| regie_voorwaarden | handtekening_vereist | A | PUT /regie/.../voorwaarden | opdracht/regie UI en uitvoeringscontrole | handtekening wordt verplicht voor afronding | - |
| regie_voorwaarden | weekstaat_vereist | A | PUT regievoorwaarden | uren/weekstaat-flow | weekstaat wordt verplicht | - |
| reserveringen | status | A | POST/PATCH reservering; vrijgave/uitgifte | voorraadberekening filtert open/gedeeltelijk | reservering houdt voorraad vast of geeft die vrij | - |
| salaris_mutaties | akkoord | A | HRM akkoordactie | verzendflow controleert akkoord | mutatie wordt vrijgegeven of tegengehouden voor salarisverwerker | - |
| salaris_mutaties | gecontroleerd | A | salaris-mutaties controle/AI-resultaat | mutatieoverzicht toont gecontroleerd | onvoldoende/gecontroleerde mutaties bepalen of verwerking doorgaat | - |
| salaris_mutaties | status | A | salaris-mutaties routes/AI-taak | HRM-lijsten en SCAB-verwerkingsflow filteren op status | status stuurt controle/verzending naar SCAB | - |
| salarisbatches | status | A | salarisbatch verwerkactie | boekhoud-/salarisfilters | status stuurt verwerkingsworkflow | - |
| salarisbestanden | status | A | salarisbestand upload/verwerking | archief- en statusfilters | status bepaalt verwerkings-/zichtbaarheidspad | - |
| salarisbestanden | zichtbaar_medewerker | A | boekhouder publiceert salarisbestand | medewerker-download/lijst filtert zichtbaarheid | publicatie maakt document voor medewerker beschikbaar | - |
| scab_mail_bijlagen | is_gevoelig | A | SCAB-mail import/classificatie | document-/toegangslogica leest gevoeligheid | gevoelige bijlage wordt afgeschermd/niet normaal gedeeld | - |
| scab_mails | status | A | SCAB-mail ingest/verwerkingsroutes | mailbox/verwerkingslijsten filteren status | status stuurt import/verwerking en eventuele foutafhandeling | - |
| security_intake_scans | ai_status | A | POST security-intake scan | quarantine-overzicht/detail | AI-risicoscore kan quarantaine veroorzaken | - |
| security_intake_scans | extensie_status | A | POST security-intake scan | quarantine-overzicht/detail | geblokkeerde extensie kan upload blokkeren/quarantaine veroorzaken | - |
| security_intake_scans | in_quarantaine | A | POST scan; PATCH beoordeling/toestaan/blokkeren | security-quarantine queries, pending filters en frontend | quarantaine houdt object tegen; beoordeling toegestaan/geblokkeerd wijzigt toegang | - |
| security_intake_scans | link_status | A | POST security-intake scan | quarantine-overzicht/detail | linkrisico kan quarantaine/blokkade veroorzaken | - |
| security_intake_scans | mime_status | A | POST security-intake scan | quarantine-overzicht/detail | MIME-afwijking draagt bij aan blokkeren/quarantaine | - |
| security_intake_scans | structuur_status | A | POST security-intake scan | quarantine-overzicht/detail | structuurbevinding draagt bij aan risico/quarantaine | - |
| security_releases | geblokkeerd | A | security engine/releasebeslissing | release-overzicht markeert geblokkeerd | release kan niet worden vrijgegeven | - |
| security_releases | status | A | security release-beslissing | release-overzicht toont status | release gaat wacht/approved/blocked en bepaalt vrijgave | - |
| security_scan_runs | release_geblokkeerd | A | security engine bij kritieke scanfout | release-readiness toont blokkade en reden | release/deploy wordt geblokkeerd | - |
| security_scan_runs | release_goedgekeurd | A | security release-beslissing PATCH | release-readiness/securitypagina toont goedkeuring | release wordt expliciet vrijgegeven | - |
| security_scan_runs | status | A | security-validation engine start/voltooit scan | beheerpagina toont/filtert lopend/voltooid | release-readiness kan pas na voltooiing beslissen | - |
| sepa_bestanden | onvolledig | A | SEPA-intake twijfelpad | bewakingsloop WHERE status=ontvangen AND onvolledig=false | onvolledige bestanden worden niet door vervolgverwerking opgepakt | - |
| sepa_bestanden | status | A | SEPA-mail/upload intake | boekhouder WHERE status=ontvangen; bewakingsloop | ontvangen volledige bestanden gaan naar vervolgverwerking | - |
| slim_upload_log | bevestigd | A | slim-upload bevestigactie | uploadlog/filter | bevestiging laat bestand door naar verwerking | - |
| slim_upload_log | geweigerd | A | slim-upload weigeractie | uploadlog/filter | weigering blokkeert verdere verwerking | - |
| snagstream_rapporten | status | A | Snagstream upload/analyse | rapportlijst en analysepad filteren status | AI-analyse/rapportworkflow start of faalt | - |
| snagstream_snags | overgenomen | A | snag handmatig overnemen | lijst telt/filtert overgenomen snags | er ontstaat een Connect-conceptspot | - |
| spot_dossiers | status | A | dossiers-routes create/update/archive | dossierlijst/detail filtert en blokkeert wijzigen/verwijderen bij definitief/gearchiveerd | dossier wordt bevroren/gearchiveerd en documentenacties geven 409 | - |
| spot_status_configuratie | actief | A | spot-status-configuratie CRUD | statuskeuze filtert actieve configuraties | inactieve status wordt niet aangeboden | - |
| spot_status_configuratie | fase_groep | A | spot-status-configuratie CRUD | statusdialoog filtert per fasegroep | bepaalt welke status in een fase toepasbaar is | - |
| spot_status_configuratie | status_code | A | spot-status-configuratie CRUD | statusdialoog leest configuratie en gebruikt code | statuskeuze/transitie wordt door configuratie gestuurd | - |
| tekeningen | zichtbaar_monteur | A | tekening-route | monteur-app/portaal tekeningselectie | tekening wordt wel/niet aan monteur getoond | - |
| testrapporten | gearchiveerd | A | POST/PATCH /testrapporten/:id | testrapportenlijst en document-/toepassingsselecties filteren gearchiveerde rapporten | gearchiveerd rapport wordt niet meer aangeboden als actuele keuze | - |
| toolbox_berichten | gearchiveerd | A | toolbox bericht archiveren/bijwerken | toolbox-lijsten filteren op niet-gearchiveerd | gearchiveerde berichten verdwijnen uit actieve communicatie | - |
| toolbox_berichten | gepubliceerd | A | toolbox bericht aanmaken/bijwerken/publiceren | toolbox-lijsten filteren op gepubliceerd | alleen gepubliceerde berichten worden aan gebruikers getoond | - |
| uitvoerder_sessies | status | A | uitvoerder login/logout | auth controleert actieve sessie | toegang tot uitvoerder-app wordt verleend of geweigerd | - |
| uitvoeringsplan_taken | fase | A | POST/PATCH taak | taaklijst sorteert/toont fase | fase stuurt voortgang/werkbakweergave | - |
| uitvoeringsplannen | status | A | POST/PATCH uitvoeringsplan | workflow/werkvoorbereiding toont/filtert plan | plan opent/sluit werkvoorbereidingsstap | - |
| uren_registraties | afgewezen | A | uren-afwijsactie | onderhanden-werk filtert afgewezen uit | uren verdwijnen uit financiële voortgang | - |
| uren_registraties | akkoord_gegeven | A | uren-akkoordactie | akkoordstatus in weekstaat/urenlijst | registratie wordt vrijgegeven voor verdere verwerking | - |
| uren_registraties | akkoord_vereist | A | uren-route bepaalt op basis opdracht/rollen | akkoordscherm leest vereiste | registratie wordt geblokkeerd voor definitieve verwerking tot akkoord | - |
| uren_registraties | niet_in_begroting | A | urenregistratie create/update | opdracht-urenrapport aggregeert niet-in-begroting uren | extra/niet-begrote uren worden apart gerapporteerd | - |
| uren_registraties | status | A | uren-routes (indienen/afwijzen/akkoord) | onderhanden-werk sluit afgewezen uit; lijsten filteren status | afgewezen uren tellen niet mee in onderhanden werk | - |
| veiligheid_incidenten | meldplichtig | A | POST/PATCH /veiligheid/incidenten | incidentoverzicht/rapportage selecteert meldplichtige incidenten | meldplichtige opvolging/rapportage wordt geactiveerd | - |
| veiligheid_incidenten | status | A | POST/PATCH /veiligheid/incidenten/:id | incidenten worden op status gefilterd | afhandeling sluit incident uit open opvolging | - |
| veiligheid_lmras | veilig_voor_aanvang | A | POST/PATCH /veiligheid/lmra | LMRA-weergave en veiligheidsbeslissing | onveilige LMRA blokkeert/waarschuwt voor aanvang | - |
| veiligheid_meldingen | status | A | POST/PATCH /veiligheid/meldingen/:id | openstaande meldingen worden op status gefilterd | melding sluit/opvolgwerk verdwijnt uit open werkvoorraad | - |
| veiligheid_meldingen_acties | status | A | POST/PATCH /veiligheid/meldingen/:id/acties/:actieId | actielijst filtert open/afgerond | actie opent/sluit opvolgactie en termijnopvolging | - |
| veiligheid_toolboxen | gepubliceerd | A | POST/PATCH /veiligheid/toolboxen | publieke/monteur-lijst filtert op gepubliceerd | niet-gepubliceerde toolbox wordt niet aangeboden | - |
| veiligheid_toolboxen | verplicht | A | POST/PATCH /veiligheid/toolboxen | toolbox-aanbod/compliance bepaalt verplicht | verplichte leesbevestiging/compliance-opvolging | - |
| veiligheidsmiddel_inspecties | ai_keur_nodig | A | AI-inspectie/PATCH inspectie | inspectie/dashboard selecteert keuringsadvies | keuring/opvolging wordt noodzakelijk | - |
| veiligheidsmiddel_inspecties | formele_status | A | POST/PATCH inspectie | dashboard filtert in_behandeling | inspectie blijft/open gaat uit formele werkvoorraad | - |
| veiligheidsmiddelen | status | A | POST/PATCH /veiligheid/veiligheidsmiddelen/:id | dashboard en kalender filteren actief/afgekeurd | afgekeurd middel geeft risico; actieve middelen krijgen keuring in kalender | - |
| verlof_instellingen | goedkeuring_automatisch | A | POST/PATCH verlofinstellingen | workflow-configs/verlofaanvraag | activeert automatische goedkeuring | - |
| verlofaanvragen | bezetting_overschreden | A | verlofaanvraag-beoordeling | verlofbeoordeling/overzicht | overschrijding blokkeert of vereist beoordeling | - |
| verlofaanvragen | status | A | POST/PATCH verlofaanvraag; goedkeuren/afwijzen | verlof-overzicht, workflow-configs, bewakingsloop | status opent/sluit goedkeuring en bewaking; goedgekeurd verlof bezet planning | - |
| verlofsoorten | actief | A | POST/PATCH /hrm/verlofsoorten | verlofselecties filteren actieve soorten | inactieve soort kan niet worden aangevraagd | - |
| verlofsoorten | betaald | A | POST/PATCH /hrm/verlofsoorten | verlofberekening/overzicht | betaaldheid beïnvloedt loon-/saldoafhandeling | - |
| verlofsoorten | collectief | A | POST/PATCH /hrm/verlofsoorten | verlofinstellingen en verlofselectie | collectieve verlofregeling wordt toegepast | - |
| verlofsoorten | is_tijd_voor_tijd | A | POST/PATCH /hrm/verlofsoorten | uren-route selecteert tijd-voor-tijdsoorten | verlof wordt als tijd-voor-tijd behandeld | - |
| vge_effectiviteitslog | herstelwerk_nodig | A | VGE evaluatie-route | VGE-overzichten/guidance | herstelwerk-item of opvolging wordt geactiveerd | - |
| vge_effectiviteitslog | monteur_vraag_gesteld | A | VGE evaluatie-route | VGE-overzicht/guidance | markeert dat monteurvraag is gesteld en voorkomt/herkent herhaling | - |
| voertuigen | gearchiveerd | A | PATCH /wagenpark/voertuigen/:id (archiveren) | wagenpark-routes en frontend filters | voertuig verdwijnt uit actieve lijsten/wordt gearchiveerd | - |
| voertuigen | status | A | POST/PATCH /wagenpark/voertuigen | wagenpark-routes/lijsten en voertuigfilters op status | actieve/gearchiveerde voertuigselectie beïnvloedt werkbak/overzichten | - |
| voorziening_types | actief | A | beheer voorzieningen-types create/update | type-selecties filteren op actief | inactief type niet meer selecteerbaar | - |
| voorzieningen | ai_te_controleren | A | voorzieningen/AI-flow zet bij AI-analyse | voorzieningen- en AI-overzichten filteren/toon controle nodig | AI-controle/werkbak volgt uit vlag | - |
| voorzieningen | gearchiveerd | A | PATCH voorzieningen/:id (archiveren) | lijsten/details filteren op niet-gearchiveerd; archiveerblokkades | gearchiveerde spot verdwijnt uit actieve werkset en kan niet meer als actueel gelden | - |
| wagenpark_kwartaalcontrole | status | A | pushService/kwartaalcontrole-routes | mijn-kwartaalcontrole en pushService-filters | open cyclus veroorzaakt push/notificatie en termijn; afronden sluit cyclus | - |
| wagenpark_meldingen | status | A | POST melding; PATCH melding | meldingenlijst (openCount/filter) en detail | open/afgehandeld bepaalt open werkbak en opvolging | - |
| wagenpark_onderhoud | geaccordeerd | A | PATCH onderhoud | onderhoudsweergave en akkoordfilters | akkoord markeert voorstel als geaccordeerd en stuurt verdere afhandeling | - |
| wagenpark_onderhoud | status | A | POST/PATCH /wagenpark/voertuigen/:id/onderhoud | onderhoudsoverzichten en kosten/afstootqueries | open/afgerond bepaalt welke onderhoudsdata en kosten meetellen | - |
| wagenpark_werktijdvensters | actief | A | PUT /wagenpark/werktijdvensters; DELETE | verificatie-buiten-werktijd en rittenbewaking | inactieve vensters worden uitgesloten van buiten-werktijdsignalering | - |
| week_staten | status | A | weekstaat indienen/goedkeuren | weekstaatlijsten filteren status | stuurt HRM-goedkeuring en verwerking | - |
| week_staten | vergrendeld | A | HRM vergrendelactie | monteur-app blokkeert bewerken en toont banner | uren wijzigen is geblokkeerd | - |
| werk_inbox_mailboxen | actief | A | PATCH mailbox | aanvraagstroom/factuurstroom filters | inactieve mailbox wordt niet verwerkt | - |
| werk_inbox_mailboxen | is_aanvraagmailbox | A | PATCH mailbox | aanvraagstroomService filter | mail wordt aanvraag-intake en kan aanvraag/voorstel aanmaken | - |
| werk_inbox_mailboxen | is_factuurmailbox | A | PATCH mailbox | factuurstroomService filter | mail wordt factuur-intake en kan factuur/koppelingen aanmaken | - |
| werk_inbox_mailboxen | modus | A | PATCH mailbox | aanvraagstroom/factuurstroom WHERE modus=verwerken | alleen modus verwerken start automatische intake | - |
| werk_inbox_mails | actie_vereist | A | mail-intake/AI verwerking; handmatige update | werk-inbox actie-tab en filters | mail komt in actie-werkbak en vraagt menselijke opvolging | - |
| werk_inbox_mails | samenwerk_status | A | PATCH werk-inbox mailstatus | werk-inbox statusfilter/detail | status stuurt samenwerkwerkbak en sluit/routeert opvolging | - |
| werk_inbox_tokens | aanvraag_intake_persoonlijk | A | PATCH /aanvragen/intake-instellingen | aanvraagstroomService tokenselectie | persoonlijke intake bepaalt of mailbox-intake voor gebruiker draait | - |
| werkbak_items | alleen_hoofdbeheerder | A | POST/PATCH werkbak-item | werkbakquery filtert zichtbaarheid op rol | item wordt voor niet-hoofdbeheerders verborgen/geblokkeerd | - |
| werkbak_items | status | A | bewakingsloop/PATCH werkbak-item | werkbak filtert open/in_behandeling/afgerond | item opent/sluit werkbakwerk | - |
| werkbegroting_adviezen | status | A | POST/PATCH werkbegroting-adviezen | advieslijst filtert actieve/afgehandelde adviezen | advies opent/sluit werkvoorraad | - |
| werkbonnen | status | A | POST/PATCH werkbon | monteur- en onderhoudsoverzicht filteren status | werkbon opent/sluit uitvoeringswerk | - |
| werkgevers | actief | A | POST/PATCH /hrm/werkgevers | werkmaatschappij-context, filtering active employer | inactieve werkgever valt uit actieve selectie | - |
| werving_kandidaten | status | A | werving kandidaat-aanmaak/statusroute | kandidatenlijst en pipelinefilters | status bepaalt kandidaatfase en opvolgwerk | - |
| werving_kandidaten | toestemming_bewaring | A | werving consent-actie | AVG/verwijder- en kandidatenflows | geen toestemming kan bewaring blokkeren of verwijdertermijn laten ingaan | - |
| workflow_cards | actief | A | beheer workflow-card PATCH | dashboard/werkbak selecteert actieve cards | actieve card creëert/activeert werkstap | - |
| workflow_definities | actief | A | beheer workflowdefinitie PATCH | workflow-engine selecteert actieve configuraties | inactieve workflow kan geen transitie uitvoeren | - |
| workflow_rechten | workflow_status | A | workflow-rechten routes | workflow-engine autorisatie/statusmatching | recht geldt alleen voor passende workflowstatus; anders actie geblokkeerd | ственный |
| workflow_transitie_log | naar_status | A | workflow-engine transitie | audit/detail toont overgang | audit trail van statusbeslissing ontstaat | - |
| workflow_transitie_log | van_status | A | workflow-engine transitie | audit/detail toont overgang | audit trail van statusbeslissing ontstaat | - |
| ziekmeldingen | status | A | POST/PATCH ziekmelding | bewakingsloop en weekControle filteren niet-hersteld | ziekte blokkeert beschikbaarheid/planning | - |
| zzp_overeenkomsten | status | A | HRM ZZP routes | ZZP-overzicht en geldigheid/statuscontrole | status bepaalt concept/actief/einde overeenkomst | - |

## Waar landt de uitkomst en welk besluit hangt eraan

De C- en ONBEKEND-velden (bovenaan) vragen per stuk een besluit: aansluiten of opruimen. De risicodragende B-velden zijn kandidaten voor de bewakingsloop (zie BEWAKING_02). Deze meting bouwt en repareert niets.
