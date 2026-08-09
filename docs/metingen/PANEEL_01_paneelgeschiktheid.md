# PANEEL_01 — Paneelgeschiktheid van de interne portaalschermen

**Meting bij PANEEL_01 §4.2 / §8.8 · FPS One · 9 augustus 2026**

## Scope

Deze meting classificeert **elke route in `ConnectPortal`** (het enige interne
portaal voor alle FPS Connect-gebruikers) in `artifacts/firevault/src/App.tsx`,
regels 333–621 (207 literal `path`-definities). Per route wordt bepaald of het
scherm **PANEELGESCHIKT** is — d.w.z. bruikbaar in een baan/kolom van
ca. **420–640 px** — of niet, met een korte reden.

**Buiten scope (wél expliciet benoemd):**

- **`MonteurPortal`** (na regel 628) — monteurschermen. Niet meegenomen; het
  telefoon-/mobiel-model valt buiten deze desktop-paneelopdracht.
- **`KlantPortal`** (na `MonteurPortal`) — klantportaal. Idem buiten scope.
- **Auth-routes** (login, uitnodiging/activatie, installatie, wachtwoord
  vergeten/reset, portaal-keuze) — buiten het portaal, geen paneelinhoud.

**Classificatieregels (uit de opdracht):**

- **Niet geschikt:** brede tabellen met veel kolommen, kanban/planning-/
  overzichtsborden, grote editors/designers (workflow-designer,
  plattegrond-editor), print-/preview-routes.
- **Wel geschikt:** detail-, lijst- en formulierschermen (meestal).
- **Zeker wél geschikt (opdracht):** `/workflow` (werkbak), `/scab-mail`,
  `/modules/calculatie/:id`, `/werkvoorbereiding`, `/gebouwen/:id`,
  `/opdrachten/:id`, `/inkoop/overzicht`.
- **Redirect-routes** (`/connect/...`) → n.v.t. (volgt doelroute).

Een niet-geschikt scherm opent volgens §4.2 **over de volle breedte** met een
aanwijzing; het wordt niet verminkt in een smalle baan getoond.

---

## Tabel A — PANEELGESCHIKT

| Pad | Scherm | Reden |
| --- | --- | --- |
| `/` | Adaptief dashboard | Kaarten/lijst, schaalt naar smalle kolom |
| `/gebouwen` | Gebouwenlijst | Lijstscherm |
| `/gebouwen/:id` | Gebouw-detail | Detailscherm (opdracht: zeker geschikt) |
| `/voorzieningen` | Voorzieningenlijst | Lijstscherm |
| `/voorzieningen/nieuw` | Nieuwe voorziening | Formulier |
| `/voorzieningen/:id/qr` | Voorziening QR | Compacte QR-weergave |
| `/voorzieningen/:id` | Voorziening-detail | Detailscherm |
| `/inspecties` | Inspectielijst | Lijstscherm (read-only) |
| `/inspecties/:id` | Inspectie-detail | Detailscherm |
| `/opname` | Opnamelijst | Lijstscherm |
| `/opname/:id` | Opname-detail | Detail/formulier |
| `/modules/calculatie/nieuw` | Nieuwe calculatie | Formulier |
| `/modules/calculatie/import` | Calculatie-import | Import-formulier/stappen |
| `/modules/calculatie/:id` | Calculatie-detail | Kernwerkscherm (opdracht: zeker geschikt) |
| `/modules/calculatie` | Calculatie-overzicht | Lijstscherm |
| `/rapporten` | Rapportenlijst | Lijstscherm |
| `/inkoop/overzicht` | Inkoopoverzicht | Overzicht (opdracht: zeker geschikt) |
| `/algemene-inkoop` | Algemene inkoop | Lijst/detail |
| `/onderhoud/contracten/:id` | Contract-detail | Detailscherm |
| `/onderhoud/werkbonnen/:id` | Werkbon-detail | Detailscherm |
| `/onderhoud/:rest*` | Onderhoud (sub) | Lijst/detail |
| `/onderhoud` | Onderhoud | Lijst/detail |
| `/offertes` | Offertelijst | Lijstscherm |
| `/opdrachten/:id` | Opdracht-detail | Detailscherm (opdracht: zeker geschikt) |
| `/werkvoorbereiding` | Werkvoorbereiding | Overzicht (opdracht: zeker geschikt) |
| `/regie` | Regielijst | Lijstscherm |
| `/regie/:id` | Regie-detail | Detailscherm |
| `/documenten` | Documenten | Lijstscherm |
| `/dossiers` | Dossiers | Lijstscherm |
| `/veiligheid/toolboxen` | Toolboxen | Lijstscherm |
| `/veiligheid/lmra` | LMRA | Lijst/formulier |
| `/veiligheid/meldingen` | Veiligheidsmeldingen | Lijstscherm |
| `/veiligheid/incidenten` | Incidenten | Lijstscherm |
| `/veiligheid/pbm` | PBM | Lijstscherm |
| `/veiligheid/toolbox-compliance` | Toolbox-compliance | Lijst/statusscherm |
| `/snagstream` | Snagstream-archief | Lijstscherm |
| `/snagstream/:id` | Snag-detail | Detailscherm |
| `/facturen/klaar-voor-export` | Klaar voor export | Lijstscherm |
| `/facturen/:id` | Factuur-detail | Detailscherm (Jacqueline-indeling) |
| `/facturen` | Facturenlijst | Lijstscherm |
| `/salarisarchief/batch/:id` | Salaris-batchdetail | Detailscherm |
| `/salarisarchief` | Salarisarchief | Lijstscherm |
| `/sepa-bestanden` | SEPA-bestanden | Lijstscherm |
| `/salaris-mutaties` | Salarismutaties | Lijstscherm |
| `/scab-mail` | SCAB-mail | Mailscherm (opdracht: zeker geschikt) |
| `/loon-output` | Loon-output | Lijstscherm |
| `/boekhouder` | Boekhouderportaal | Lijst/detail |
| `/berichten` | Berichten | Mail-/berichtenscherm |
| `/toolbox` | Toolbox | Lijstscherm |
| `/crm/organisaties` | CRM organisaties | Lijstscherm |
| `/crm/aanvragen` | CRM aanvragen | Lijstscherm |
| `/crm/projectkansen` | CRM projectkansen | Lijstscherm |
| `/crm/concurrenten` | CRM concurrenten | Lijstscherm |
| `/crm/marktintelligentie` | CRM marktintelligentie | Overzicht |
| `/crm/contactpersonen` | CRM contactpersonen | Lijstscherm |
| `/crm/taken` | CRM taken | Lijstscherm |
| `/crm/relatievoorstellen` | CRM relatievoorstellen | Lijstscherm |
| `/crm/kennisbibliotheek` | CRM kennisbibliotheek | Lijstscherm |
| `/crm/:id` | CRM klant-detail | Detailscherm |
| `/crm` | CRM klanten | Lijstscherm |
| `/werk-inbox` | Werk-inbox | Werkbak/lijst (kernpaneel) |
| `/assistent` | Assistent | Chat/paneelscherm |
| `/workflow` | Werkbak | Werkbak (opdracht: zeker geschikt) |
| `/personeel/verlof` | Verlofoverzicht | Lijstscherm |
| `/personeel/verlof-instellingen` | Verlofinstellingen | Formulier |
| `/personeel/jaarafsluiting` | Jaarafsluiting | Lijst/formulier |
| `/personeel/onboarden` | Onboarden | Formulier/wizard |
| `/personeel/integriteitstools` | Integriteitstools | Lijst/formulier |
| `/personeel/uitboarden` | Uitboarden | Formulier/wizard |
| `/personeel/oud-medewerkers` | Oud-medewerkers | Lijstscherm |
| `/personeel/externen` | Externen | Lijstscherm |
| `/personeel/uitzendbureaus` | Uitzendbureaus | Lijstscherm |
| `/personeel/contracten` | Contractbewaking | Lijstscherm |
| `/personeel/:id` | Medewerker-detail | Detailscherm |
| `/personeel` | Personeelslijst | Lijstscherm |
| `/beheer/indirecte-werkzaamheden` | Indirecte werkzaamheden | Lijstscherm |
| `/gereedschappen` | Gereedschappen | Lijstscherm |
| `/gereedschappen/:id` | Gereedschap-detail | Detailscherm |
| `/wagenpark` | Wagenpark | Lijstscherm |
| `/wagenpark/brandstof-import` | Brandstof-import | Import-formulier |
| `/wagenpark/meldingen` | Wagenpark-meldingen | Lijstscherm |
| `/wagenpark/buiten-werktijd` | Buiten werktijd | Lijstscherm |
| `/wagenpark/documentsoorten` | Documentsoorten | Lijstscherm |
| `/wagenpark/nieuw` | Nieuw voertuig | Formulier |
| `/wagenpark/:id/bewerken` | Voertuig bewerken | Formulier |
| `/wagenpark/:id` | Voertuig-detail | Detailscherm |
| `/magazijn` | Magazijn-dashboard | Kaarten/dashboard |
| `/magazijn/artikelen` | Magazijn-artikelen | Lijstscherm |
| `/magazijn/artikelen/:id/label` | Artikel-label | Compacte labelweergave |
| `/magazijn/artikelen/:id` | Artikel-detail | Detailscherm |
| `/magazijn/locaties` | Magazijn-locaties | Lijstscherm |
| `/magazijn/voorraad` | Voorraad | Lijstscherm |
| `/magazijn/stellingscans` | Stellingscans | Lijstscherm |
| `/magazijn/mutaties` | Mutaties | Lijstscherm |
| `/magazijn/reserveringen` | Reserveringen | Lijstscherm |
| `/magazijn/uitgiftes` | Uitgiftes | Lijstscherm |
| `/magazijn/retouren` | Retouren | Lijstscherm |
| `/magazijn/inkooporders` | Inkooporders | Lijstscherm |
| `/magazijn/inkooporders/:id` | Inkooporder-detail | Detailscherm |
| `/magazijn/picklijsten` | Picklijsten | Lijstscherm |
| `/magazijn/picklijsten/:id` | Picklijst-detail | Detailscherm |
| `/magazijn/voorraadwaarde` | Voorraadwaarde | Lijst/overzicht |
| `/financieel/crediteuren` | Crediteuren-inbox | Inbox/lijstscherm |
| `/financieel/onderhanden-werk` | Onderhanden werk | Lijst/overzicht |
| `/organisatie/autopark` | Autopark | Lijstscherm |
| `/organisatie/verzekeringen` | Verzekeringen | Lijstscherm |
| `/organisatie/bedrijfsgegevens` | Bedrijfsgegevens | Formulier |
| `/organisatie/jaarverslagen` | Jaarverslagen | Lijstscherm |
| `/organisatie/bedrijfsdocumenten` | Bedrijfsdocumenten | Lijstscherm |
| `/uren` | Uren | Lijst/formulier |
| `/hall-of-fame` | Hall of Fame | Lijst/overzicht |
| `/leveranciers` | Leveranciers | Lijstscherm |
| `/leveranciers/:id` | Leverancier-detail | Detailscherm |
| `/artikelen` | Artikelen | Lijstscherm |
| `/gebruikers` | Gebruikers | Lijstscherm |
| `/abonnementen` | Abonnementen | Lijstscherm |
| `/beheer/toepassingen` | Toepassingen | Lijstscherm |
| `/beheer/bibliotheek` | Bibliotheek | Lijstscherm |
| `/beheer/login-pogingen` | Login-pogingen | Lijstscherm |
| `/beheer/helpdesk` | Helpdesk | Lijst/detail |
| `/beheer/feedback` | Feedback | Lijstscherm |
| `/beheer/visual-library` | Visual library | Lijst/galerij |
| `/beheer/profielen` | Profielen | Lijstscherm |
| `/beheer/goedkeuringsbeleid` | Goedkeuringsbeleid | Formulier/lijst |
| `/beheer/biae` | BIAE | Lijst/formulier |
| `/declaraties/:id` | Declaratie-detail | Detailscherm |
| `/declaraties` | Declaraties | Lijstscherm |
| `/beheer/object-rechten` | Object-rechten | Lijst/formulier |
| `/organisatie/documentopmaak` | Documentopmaak | Formulier/instellingen |
| `/organisatie/werkmaatschappijen` | Werkmaatschappijen | Lijstscherm |
| `/beheer/spotconfiguratie` | Spotconfiguratie | Formulier/instellingen |
| `/beheer/visuals` | Visuals (legacy) | Lijst/galerij |
| `/beheer/mail` | Mailbeheer | Instellingen |
| `/beheer/mailboxen` | Mailboxen | Lijstscherm |
| `/beheer/backup` | Backup | Instellingen/lijst |
| `/beheer/import` | Import | Import-formulier |
| `/beheer/go-live` | Go-live | Checklijst/status |
| `/beheer/meldingen` | Meldingenbeheer | Lijstscherm |
| `/beheer/projectstatus` | Projectstatus | Lijst/overzicht |
| `/beheer/pwa-test` | PWA-test | Statusscherm |
| `/instellingen` | Instellingen | Formulier/instellingen |
| `/beheer/security-intake` | Security-intake | Formulier/lijst |
| `/beheer/systeemstatus` | Systeemstatus | Statusscherm |
| `/release-notes` | Release notes | Leesscherm |
| `/beheer/privacy` | Privacy (beheer) | Instellingen/lijst |
| `/beheer/avg` | AVG-beheer | Lijst/formulier |
| `/beheer/gebouwen-archief` | Gebouwen-archief | Lijstscherm |
| `/mijn/privacy` | Privacycentrum | Formulier/leesscherm |
| `/mijn/salarisdocumenten` | Mijn salarisdocumenten | Lijstscherm |
| `/one/dashboard` | ONE dashboard | Kaarten/dashboard (smal ontworpen) |
| `/one/gebouwen/:id` | ONE gebouw-detail | Detailscherm |
| `/one/gebouwen` | ONE gebouwen | Lijstscherm |
| `/one/documenten` | ONE documenten | Lijstscherm |
| `/one/rapporten` | ONE rapporten | Lijstscherm |
| `/one/abonnementen` | ONE abonnementen | Lijstscherm |
| `/one/adviescentrum` | ONE adviescentrum | Kaarten/leesscherm |
| `/info` | Info | Leesscherm |

---

## Tabel B — NIET GESCHIKT

| Pad | Scherm | Reden |
| --- | --- | --- |
| `/gebouwen/:id/plattegrond/:verdiepingId` | Plattegrond-editor | Canvas/tekeneditor — vereist volle breedte |
| `/modules/calculatie/leveranciers` | Calculatie-leveranciers | Brede prijstabel, veel kolommen |
| `/modules/calculatie/eenheidsprijzen` | Eenheidsprijzen | Brede prijstabel, veel kolommen |
| `/modules/planning/medewerkers` | Planning medewerkers | Planningsbord, brede raster (7/9 kol) |
| `/modules/planning/afwezigheid` | Planning afwezigheid | Planningsbord, kalenderraster |
| `/modules/planning` | Planning | Planningsbord, horizontale tijdlijn |
| `/offertes/:id/print` | Offerte-print | Print-/previewroute |
| `/facturen/:id/print` | Factuur-print | Print-/previewroute |
| `/offertes/:id` | Proposal Studio | Grote offerte-editor/designer |
| `/facturen/dashboard` | Financieel dashboard | Breed dashboard, veel widgets |
| `/facturen/exportlog` | Exportlog | Brede logtabel, veel kolommen |
| `/facturen/controlebox` | Controlebox | Brede controletabel, veel kolommen |
| `/facturen/stroom` | Factuurstroom-bewaking | Breed stroom-/statusbord |
| `/team-overleg` | Team & overleg | Breed overlegbord, meerdere kolommen |
| `/personeel/capaciteitsplanning` | Capaciteitsplanning | Planningsbord, brede tijdlijn |
| `/personeel/jaarplanning` | Jaarplanning | Brede jaarplanner-raster |
| `/personeel/jaarkalender` | Jaarkalender | Brede kalenderweergave |
| `/magazijn/artikelen/barcodes-afdrukken` | Barcodes bulk-afdrukken | Print-/afdrukroute |
| `/financieel/bedrijfsresultaten` | Bedrijfsresultaten | Breed financieel dashboard |
| `/financieel/jaarrekening` | Jaarrekening | Brede meerkoloms boekhoudtabel |
| `/financieel/jaarrekeningen` | Jaarrekeningen-validatie | Brede validatietabel, veel kolommen |
| `/financieel/meerjarenoverzicht` | Meerjarenoverzicht | Brede meerjaren-kolomtabel |
| `/financieel/algemene-kosten` | AK-dashboard | Breed financieel dashboard |
| `/financieel/scenarios` | Scenario's | Breed vergelijkingsdashboard |
| `/financieel/contracten` | Contracten (financieel) | Brede contracttabel, veel kolommen |
| `/organisatie/studio` | Document Studio | Grote documenteditor/designer |
| `/workflow-designer` | Workflow-designer | Grote flow-designer/canvas |
| `/weekstaten` | Weekstaten | Brede week-urenraster (7 dagen × kol) |
| `/beheer/audit` | Audit-trail | Brede logtabel, veel kolommen |
| `/beheer/ai-aanroepen` | AI-aanroepen | Brede logtabel, veel kolommen |
| `/beheer/heatmaps` | Heatmaps | Grote visualisatie/drag-interactie |
| `/beheer/rollen-rechten` | Rollen & rechten | Brede rechtenmatrix, veel kolommen |
| `/beheer/goedkeuringen-dashboard` | Goedkeuringen-dashboard | Breed dashboard, meerdere kolommen |
| `/beheer/ontwikkelstatus` | Ontwikkelstatus | Breed statusbord |
| `/beheer/herstel` | Herstel-dashboard | Breed dashboard/matrix |
| `/beheer/boekhouding` | Boekhouding | Brede boekhoudtabel, veel kolommen |
| `/beheer/bedrijfskompas` | Bedrijfskompas | Breed dashboard/visualisatie |
| `/directie/kompas` | Directiekompas | Breed dashboard/visualisatie |
| `/directie/cockpit` | Directiecockpit | Breed cockpit-bord, veel kolommen |
| `/financieel/liquiditeit` | Liquiditeit | Breed financieel dashboard/grafieken |
| `/beheer/ai-log` | AI-log | Brede logtabel, veel kolommen |
| `/beheer/governance-risico` | Governance-risico | Brede risicomatrix |
| `/beheer/ai-governance` | AI-prompt governance | Breed governance-dashboard |
| `/beheer/security-validation` | Security-validation | Brede validatiematrix |
| `/beheer/release-readiness` | Release-readiness | Breed checklijst-/statusdashboard |
| `/beheer/kantoor-release` | Kantoor-release-dashboard | Breed release-dashboard |

---

## Tabel C — N.V.T. (redirect-routes)

| Pad | Doel | Reden |
| --- | --- | --- |
| `/connect/calculatie/:id` | `/modules/calculatie/:id` | Redirect — volgt doel (geschikt) |
| `/connect/calculatie` | `/modules/calculatie` | Redirect — volgt doel (geschikt) |
| `/connect/planning` | `/modules/planning` | Redirect — volgt doel (niet geschikt) |
| `/connect/hrm` | `/personeel` | Redirect — volgt doel (geschikt) |

---

## Aantallen

- **Totaal geclassificeerde routes:** 207
- **Paneelgeschikt:** 157
- **Niet geschikt:** 46
- **N.v.t. (redirects):** 4

---

## Machineleesbare lijst

```ts
// Paneelgeschikte wouter-padpatronen (exact zoals in
// artifacts/firevault/src/App.tsx, ConnectPortal, regels 333–621).
export const PANEEL_GESCHIKTE_PADEN: string[] = [
  "/",
  "/gebouwen",
  "/gebouwen/:id",
  "/voorzieningen",
  "/voorzieningen/nieuw",
  "/voorzieningen/:id/qr",
  "/voorzieningen/:id",
  "/inspecties",
  "/inspecties/:id",
  "/opname",
  "/opname/:id",
  "/modules/calculatie/nieuw",
  "/modules/calculatie/import",
  "/modules/calculatie/:id",
  "/modules/calculatie",
  "/rapporten",
  "/inkoop/overzicht",
  "/algemene-inkoop",
  "/onderhoud/contracten/:id",
  "/onderhoud/werkbonnen/:id",
  "/onderhoud/:rest*",
  "/onderhoud",
  "/offertes",
  "/opdrachten/:id",
  "/werkvoorbereiding",
  "/regie",
  "/regie/:id",
  "/documenten",
  "/dossiers",
  "/veiligheid/toolboxen",
  "/veiligheid/lmra",
  "/veiligheid/meldingen",
  "/veiligheid/incidenten",
  "/veiligheid/pbm",
  "/veiligheid/toolbox-compliance",
  "/snagstream",
  "/snagstream/:id",
  "/facturen/klaar-voor-export",
  "/facturen/:id",
  "/facturen",
  "/salarisarchief/batch/:id",
  "/salarisarchief",
  "/sepa-bestanden",
  "/salaris-mutaties",
  "/scab-mail",
  "/loon-output",
  "/boekhouder",
  "/berichten",
  "/toolbox",
  "/crm/organisaties",
  "/crm/aanvragen",
  "/crm/projectkansen",
  "/crm/concurrenten",
  "/crm/marktintelligentie",
  "/crm/contactpersonen",
  "/crm/taken",
  "/crm/relatievoorstellen",
  "/crm/kennisbibliotheek",
  "/crm/:id",
  "/crm",
  "/werk-inbox",
  "/assistent",
  "/workflow",
  "/personeel/verlof",
  "/personeel/verlof-instellingen",
  "/beheer/indirecte-werkzaamheden",
  "/personeel/jaarafsluiting",
  "/personeel/onboarden",
  "/personeel/integriteitstools",
  "/personeel/uitboarden",
  "/personeel/oud-medewerkers",
  "/personeel/externen",
  "/personeel/uitzendbureaus",
  "/personeel/contracten",
  "/personeel/:id",
  "/personeel",
  "/gereedschappen",
  "/gereedschappen/:id",
  "/wagenpark",
  "/wagenpark/brandstof-import",
  "/wagenpark/meldingen",
  "/wagenpark/buiten-werktijd",
  "/wagenpark/documentsoorten",
  "/wagenpark/nieuw",
  "/wagenpark/:id/bewerken",
  "/wagenpark/:id",
  "/magazijn",
  "/magazijn/artikelen",
  "/magazijn/artikelen/:id/label",
  "/magazijn/artikelen/:id",
  "/magazijn/locaties",
  "/magazijn/voorraad",
  "/magazijn/stellingscans",
  "/magazijn/mutaties",
  "/magazijn/reserveringen",
  "/magazijn/uitgiftes",
  "/magazijn/retouren",
  "/magazijn/inkooporders",
  "/magazijn/inkooporders/:id",
  "/magazijn/picklijsten",
  "/magazijn/picklijsten/:id",
  "/magazijn/voorraadwaarde",
  "/financieel/crediteuren",
  "/financieel/onderhanden-werk",
  "/organisatie/autopark",
  "/organisatie/verzekeringen",
  "/organisatie/bedrijfsgegevens",
  "/organisatie/jaarverslagen",
  "/organisatie/bedrijfsdocumenten",
  "/uren",
  "/hall-of-fame",
  "/leveranciers",
  "/leveranciers/:id",
  "/artikelen",
  "/gebruikers",
  "/abonnementen",
  "/beheer/toepassingen",
  "/beheer/bibliotheek",
  "/beheer/login-pogingen",
  "/beheer/helpdesk",
  "/beheer/feedback",
  "/beheer/visual-library",
  "/beheer/profielen",
  "/beheer/goedkeuringsbeleid",
  "/beheer/biae",
  "/declaraties/:id",
  "/declaraties",
  "/beheer/object-rechten",
  "/organisatie/documentopmaak",
  "/organisatie/werkmaatschappijen",
  "/beheer/spotconfiguratie",
  "/beheer/visuals",
  "/beheer/mail",
  "/beheer/mailboxen",
  "/beheer/backup",
  "/beheer/import",
  "/beheer/go-live",
  "/beheer/meldingen",
  "/beheer/projectstatus",
  "/beheer/pwa-test",
  "/instellingen",
  "/beheer/security-intake",
  "/beheer/systeemstatus",
  "/release-notes",
  "/beheer/privacy",
  "/beheer/avg",
  "/beheer/gebouwen-archief",
  "/mijn/privacy",
  "/mijn/salarisdocumenten",
  "/one/dashboard",
  "/one/gebouwen/:id",
  "/one/gebouwen",
  "/one/documenten",
  "/one/rapporten",
  "/one/abonnementen",
  "/one/adviescentrum",
  "/info",
];
```
