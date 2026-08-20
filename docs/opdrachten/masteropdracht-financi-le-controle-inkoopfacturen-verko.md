MASTEROPDRACHT – Financiële Controle, Inkoopfacturen, Verkoopfacturen en AccountView-integratie

## Doel

Bouw in FPS Connect een geïntegreerde financiële controle- en factuurworkflow waarmee de algemene administratie de financiële administratie kan uitvoeren zonder specialistische boekhoudkundige kennis.

Connect moet verkoopfacturen volledig voorbereiden, inkoopfacturen uit e-mail en bijlagen uitlezen, controleren, koppelen aan projecten/opdrachten/inkoop/werkbegroting en daarna gecontroleerd doorzetten naar AccountView.

AccountView blijft het boekhoudkundige systeem van record. Connect wordt de workflow-, controle- en voorbereidingslaag.

## Kernprincipe

De gebruiker voert zo min mogelijk handmatig in.

Connect en AI bereiden alles voor:

- herkenning;
- koppeling;
- controle;
- boekingsvoorstel;
- factuurvoorstel;
- bijlagen;
- afwijkingen;
- risico’s.

De algemene administratie controleert en geeft akkoord.

AI mag nooit zelfstandig definitief boeken of facturen verzenden zonder expliciet akkoord.

---

# 1. Rollen

Ondersteun minimaal:

## Algemene administratie

Kan:
- factuurvoorstellen controleren;
- inkoopfacturen goedkeuren;
- verkoopfacturen klaarzetten;
- bijlagen controleren;
- afwijkingen oplossen;
- doorzetten naar AccountView.

## Projectleider

Kan:
- projectbudgetten zien;
- meerwerk goedkeuren;
- factuurmomenten voorstellen;
- afwijkingen beoordelen;
- projectresultaat volgen.

## Directie

Kan:
- cashflow zien;
- openstaande facturen zien;
- projectmarges zien;
- financiële risico’s zien.

## AI Financial Controller

Ondersteunt:
- facturen herkennen;
- boekingsvoorstellen maken;
- afwijkingen signaleren;
- btw/grootboek/G-rekening beoordelen;
- projectimpact berekenen;
- risico’s rapporteren.

---

# 2. AccountView-integratie

## Uitgangspunt

AccountView blijft leidend voor:
- officiële boekhouding;
- debiteuren;
- crediteuren;
- factuurnummers;
- boekstukken;
- betalingen;
- grootboek.

Connect blijft leidend voor:
- projectworkflow;
- factuurvoorbereiding;
- documentkoppeling;
- controle;
- projectresultaat;
- nacalculatie;
- financiële signalering.

## Vereiste koppeling

Ondersteun minimaal:

- verkoopfactuur klaarzetten vanuit Connect;
- inkoopfactuur klaarzetten vanuit Connect;
- export/import of API-koppeling met AccountView;
- factuurnummer terug naar Connect;
- boekstuknummer terug naar Connect;
- betaalstatus terug naar Connect;
- openstaande posten terug naar Connect;
- debiteur/crediteur-koppeling;
- grootboekrekening-koppeling;
- btw-code-koppeling;
- dagboek-koppeling;
- G-rekening-koppeling.

## Belangrijk

Geen dubbele boekhouding bouwen in Connect.

Connect registreert:
- status;
- workflow;
- document;
- projectkoppeling;
- controlelog;
- AccountView-referentie.

---

# 3. Verkoopfacturen

## Doel

Verkoopfacturen moeten zoveel mogelijk automatisch worden voorbereid vanuit:

- opdracht;
- offerte;
- werkbegroting;
- termijnschema;
- regiewerk;
- meerwerk;
- opleverrapport;
- weekstaten;
- onderhoudscontract;
- klantafspraken.

## Ondersteun factuurtypen

Minimaal:

- eindfactuur;
- termijnfactuur;
- regiefactuur;
- meerwerkfactuur;
- onderhoudsfactuur;
- correctiefactuur;
- creditfactuur;
- verzamelfactuur;
- factuur met bijlagen;
- factuur met BTW verlegd;
- factuur met 21% btw;
- factuur met 9% btw;
- factuur met meerdere btw-tarieven;
- factuur met G-rekening;
- factuur met loonsom-/G-rekeningverdeling.

## Velden verkoopfactuur

Ondersteun minimaal:

- factuurnummer;
- conceptfactuurnummer;
- project;
- werknummer;
- opdracht;
- offerte;
- opdrachtgever;
- debiteur;
- contactpersoon;
- factuurdatum;
- vervaldatum;
- betaaltermijn;
- omschrijving;
- factuurtype;
- termijnnummer;
- contractwaarde;
- reeds gefactureerd;
- nu te factureren;
- nog te factureren;
- btw-code;
- btw-bedrag;
- bedrag excl. btw;
- bedrag incl. btw;
- G-rekening percentage;
- G-rekening bedrag;
- loonsom;
- grootboekrekening;
- dagboek;
- AccountView-status;
- AccountView-factuurnummer;
- verzendstatus;
- betaalstatus.

## AI-voorbereiding verkoopfactuur

AI moet voorstellen:

- welk bedrag gefactureerd mag worden;
- welk factuurtype van toepassing is;
- welke bijlagen nodig zijn;
- welk factuurmodel gebruikt moet worden;
- welke btw-code geldt;
- of BTW verlegd van toepassing is;
- of G-rekening van toepassing is;
- of facturatie logisch is op basis van projectstatus;
- of er ontbrekende opleverdocumenten zijn;
- of er openstaand meerwerk is;
- of facturatie te vroeg of te laat is.

## Bijlagen verkoopfactuur

Ondersteun automatisch koppelen van:

- opleverrapport;
- weekstaten;
- regiebonnen;
- getekende werkbonnen;
- foto’s;
- certificaten;
- productspecificaties;
- meerwerkakkoorden;
- opdrachtbevestiging;
- klantreferentie;
- onderhoudsrapport.

## Factuuropmaak

Ondersteun verschillende factuurmodellen per:

- werkmaatschappij;
- klant;
- opdracht;
- factuurtype;
- onderhoud;
- regiewerk;
- termijnfactuur;
- projectfactuur.

Per model configureerbaar:

- logo;
- briefpapier;
- tekstblokken;
- betalingsinstructies;
- G-rekeningtekst;
- BTW-verlegd tekst;
- bijlagenoverzicht;
- projectreferentie;
- contactpersoon;
- klantkenmerk;
- specificatieniveau.

---

# 4. Inkoopfacturen

## Doel

Inkoopfacturen moeten per e-mail of upload binnenkomen, automatisch worden herkend, uitgelezen, gekoppeld, gecontroleerd en klaargezet voor akkoord.

## Inputkanalen

Ondersteun:

- e-mail;
- PDF-bijlage;
- scan;
- foto;
- handmatige upload;
- Documenten-inbox;
- later eventueel leveranciersportaal.

## AI-uitlezing

AI leest minimaal:

- leverancier;
- factuurnummer;
- factuurdatum;
- vervaldatum;
- bedrag excl. btw;
- btw-bedrag;
- bedrag incl. btw;
- btw-tarief;
- IBAN;
- KvK/btw-nummer indien aanwezig;
- omschrijving;
- regels;
- artikelregels;
- aantallen;
- eenheden;
- prijzen;
- korting;
- transportkosten;
- ordernummer;
- projectnummer;
- werknummer;
- referentie;
- bijlagen.

## Koppeling

AI probeert automatisch te koppelen aan:

- leverancier;
- project;
- werknummer;
- opdracht;
- inkooporder;
- bestelling;
- magazijnontvangst;
- werkbegrotingsregel;
- materiaalregel;
- onderaannemer;
- algemene kostenpost;
- investering;
- voertuig;
- medewerker;
- onderhoudscontract.

## Factuurcategorieën

Ondersteun minimaal:

1. Projectmateriaal.
2. Onderaanneming.
3. Algemene bedrijfskosten.
4. Investeringen.
5. Wagenpark.
6. Gereedschap/materieel.
7. Magazijnvoorraad.
8. Representatiekosten.
9. Software/abonnementen.
10. Verzekeringen.
11. Correctie/creditfacturen.

## Controle

AI controleert:

- dubbele factuur;
- leverancier bekend;
- IBAN afwijkend;
- bedrag wijkt af van bestelling;
- aantal wijkt af van levering;
- prijs wijkt af van leverancierofferte;
- project ontbreekt;
- werknummer ontbreekt;
- btw-code onzeker;
- grootboekrekening onzeker;
- factuur hoort niet bij project;
- levering niet ontvangen;
- budgetoverschrijding;
- ongebruikelijke kostenpost;
- creditfactuur;
- betalingsconditie afwijkend.

## Statussen inkoopfactuur

Gebruik minimaal:

- ontvangen;
- uitgelezen;
- voorstel_klaar;
- controle_nodig;
- akkoord_administratie;
- akkoord_projectleider;
- afgewezen;
- naar_accountview;
- geboekt;
- betaald;
- fout;
- dubbel_vermoed;
- geparkeerd.

---

# 5. Financiële Controlebox

Maak één centrale financiële inbox voor administratie.

Deze toont:

- nieuwe verkoopfactuurvoorstellen;
- ontvangen inkoopfacturen;
- afwijkingen;
- ontbrekende koppelingen;
- facturen klaar voor akkoord;
- facturen klaar voor AccountView;
- foutmeldingen;
- openstaande posten;
- herinneringen.

## Weergave

Per item:

- type;
- leverancier/klant;
- project;
- bedrag;
- status;
- AI-confidence;
- belangrijkste afwijking;
- voorgestelde actie;
- verantwoordelijke rol.

## Acties

Gebruiker kan:

- akkoord geven;
- aanpassen;
- koppeling wijzigen;
- terugsturen naar projectleider;
- parkeren;
- afwijzen;
- opnieuw laten analyseren;
- doorzetten naar AccountView.

---

# 6. AI Financial Controller

## Doel

AI moet niet alleen facturen uitlezen, maar financieel controleren.

AI beoordeelt:

- klopt deze factuur;
- past deze bij de workflow;
- past deze binnen budget;
- is dit logisch voor dit project;
- is er risico;
- moet iemand actie ondernemen.

## AI mag zelfstandig

- gegevens herkennen;
- voorstellen doen;
- afwijkingen signaleren;
- conceptboekingen voorbereiden;
- factuurvoorstellen maken;
- bijlagen voorstellen;
- risico’s markeren;
- ontbrekende informatie benoemen.

## AI mag niet zelfstandig

- definitief boeken;
- facturen verzenden;
- betalingsopdrachten geven;
- grootboekregels definitief wijzigen;
- btw-beslissingen definitief maken;
- G-rekening definitief bepalen;
- facturen verwijderen;
- leveranciers wijzigen;
- bankgegevens aanpassen.

## Risiconiveaus

Gebruik minimaal:

- groen: automatisch voorstel, laag risico;
- oranje: controle nodig;
- rood: blokkade, menselijke beoordeling verplicht.

---

# 7. Regiewerk

Ondersteun regiefacturen volledig.

Regiefactuur kan ontstaan uit:

- regiebon;
- werkbon;
- weekstaat;
- urenregistratie;
- materiaalverbruik;
- foto’s;
- klantakkoord.

Regiefactuurregels:

- datum;
- medewerker;
- uren;
- tarief;
- materiaal;
- materieel;
- onderaannemer;
- omschrijving;
- bijlage;
- klantakkoord;
- project;
- werknummer.

AI controleert:

- ontbreken weekstaat;
- ontbreken klantakkoord;
- afwijkende uren;
- materiaal niet geregistreerd;
- tarief niet bekend;
- bijlagen ontbreken.

---

# 8. G-rekening en BTW

## BTW

Ondersteun:

- 21%;
- 9%;
- 0%;
- BTW verlegd;
- meerdere btw-tarieven op één factuur;
- EU/internationaal indien later nodig.

Per regel moet btw-code kunnen verschillen.

## G-rekening

Ondersteun:

- G-rekening van toepassing ja/nee;
- percentage loonsom;
- percentage G-rekening;
- bedrag G-rekening;
- bedrag normale rekening;
- tekst op factuur;
- controle op klanttype/opdrachtsoort;
- waarschuwing bij ontbreken.

AI mag G-rekening voorstellen, maar definitieve toepassing vereist controle door administratie.

---

# 9. Projectimpact

Elke goedgekeurde inkoopfactuur moet automatisch doorwerken naar:

- projectkosten;
- werkbegroting;
- nacalculatie;
- margeprognose;
- leverancierhistorie;
- budgetbewaking;
- managementdashboard.

Elke verkoopfactuur moet automatisch doorwerken naar:

- omzet;
- gefactureerd bedrag;
- nog te factureren;
- openstaande posten;
- cashflow;
- projectstatus;
- AccountView-referentie.

---

# 10. Openstaande facturen

Maak overzicht voor:

- openstaande verkoopfacturen;
- openstaande inkoopfacturen;
- vervaldatum;
- aantal dagen open;
- herinneringsstatus;
- betaalstatus;
- project;
- klant/leverancier;
- bedrag;
- risico.

AI signaleert:

- te laat betaald;
- grote openstaande post;
- klant met herhaald betaalgedrag;
- project met cashflowrisico;
- factuur zonder opvolging;
- herinnering nodig.

---

# 11. Rechten en audit

Gebruik centrale RBAC en Audit Trail.

Alle acties loggen:

- ontvangen;
- uitgelezen;
- gewijzigd;
- gekoppeld;
- akkoord;
- afgewezen;
- doorgestuurd naar AccountView;
- geboekt;
- betaald;
- opnieuw geanalyseerd.

Log nooit volledige gevoelige factuurinhoud in auditrecords.

Wel loggen:

- actie;
- gebruiker;
- tijdstip;
- entiteit;
- status;
- vorige waarde;
- nieuwe waarde;
- AI-confidence;
- reden van afwijking.

---

# 12. Integratie met bestaande Connect-architectuur

Gebruik bestaande fundamenten:

- Workflow Engine;
- RBAC;
- Audit Trail;
- Documenten/DMS;
- Documenten-inbox zodra beschikbaar;
- AI Gateway;
- Prompt Registry;
- AccountView-koppeling;
- Projecten;
- Werkbegroting;
- Inkoop;
- Magazijn;
- Uren;
- Oplevering;
- Onderhoud.

Geen losse financiële module bouwen die buiten de workflow staat.

---

# 13. Gefaseerde implementatie

## Fase 1 — Analyse

Analyseer bestaande facturen.ts, AccountView-koppeling, DMS, mailverwerking, inkoopfacturen, verkoopfacturen en financiële tabellen.

Rapporteer:
- wat al bestaat;
- wat ontbreekt;
- welke routes/tables bruikbaar zijn;
- welke risico’s er zijn.

Nog niets bouwen.

## Fase 2 — Datamodel en workflow

Ontwerp datamodel voor:

- verkoopfactuurvoorstellen;
- inkoopfacturen;
- factuurregels;
- bijlagen;
- AccountView-status;
- AI-analyse;
- afwijkingen;
- controles;
- G-rekening;
- BTW-codes;
- factuurmodellen.

## Fase 3 — Financiële Controlebox

Bouw centrale inbox voor financiële administratie.

## Fase 4 — Inkoopfacturen per mail/uplift

Bouw e-mail/uploadaanvoer, AI-uitlezing en controlevoorstellen.

## Fase 5 — Verkoopfacturen voorbereiden

Bouw verkoopfactuurvoorstellen vanuit project, oplevering, termijn, regie en meerwerk.

## Fase 6 — AccountView-koppeling

Maak gecontroleerde export/import of API-koppeling.

## Fase 7 — Projectimpact

Laat facturen doorwerken naar projectkosten, marge, cashflow en nacalculatie.

## Fase 8 — Validatie

Test volledige keten:

- inkoopfactuur ontvangen;
- AI leest uit;
- koppeling project/order;
- administratie keurt goed;
- naar AccountView;
- boekstuknummer terug;
- projectkosten bijgewerkt.

En:

- project afgerond;
- opleverrapport gereed;
- verkoopfactuurvoorstel;
- administratie akkoord;
- naar AccountView;
- factuurnummer terug;
- openstaande post zichtbaar.

---

# 14. Acceptatiecriteria

Deze opdracht is pas geslaagd wanneer:

1. Algemene administratie zonder specialistische boekhoudkennis facturen kan verwerken.
2. AI minimaal 80% van de facturen correct voorbereidt.
3. Geen factuur definitief wordt geboekt zonder akkoord.
4. AccountView leidend blijft voor boekhouding.
5. Connect leidend is voor workflow en projectimpact.
6. BTW, G-rekening, regie, bijlagen en factuurmodellen worden ondersteund.
7. Inkoopfacturen automatisch aan projecten/bestellingen kunnen worden gekoppeld.
8. Verkoopfacturen automatisch vanuit de projectstatus kunnen worden voorbereid.
9. Alle acties auditbaar zijn.
10. Projectkosten, omzet, openstaande posten en nacalculatie automatisch worden bijgewerkt.

---

# 15. Niet doen

- Geen volledige boekhouding in Connect bouwen.
- Geen betalingen uitvoeren vanuit Connect.
- Geen bankkoppeling bouwen.
- Geen definitieve automatische boekingen zonder akkoord.
- Geen bestaande AccountView-koppeling vervangen zonder analyse.
- Geen nieuwe AI buiten de centrale AI Gateway.
- Geen factuurdata ongecontroleerd loggen.