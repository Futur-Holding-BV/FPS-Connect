GA DOOR MET BOUWEN — Financial Control Platform

We hebben haast met de kantoorversie. Bouw door, maar onder onderstaande harde architectuurregels.

1. Geen dubbele waarheid
- AccountView blijft boekhoudkundige bron van waarheid.
- Connect is workflow-, controle- en projectimpactlaag.
- Project, opdracht, werkbegroting, inkoop, magazijn, uren en oplevering blijven leidend voor de herkomst van financiële gegevens.
- Facturen mogen die gegevens niet zelfstandig dupliceren zonder bronverwijzing.

2. Nieuwe tabellen zijn toegestaan
Nieuwe tabellen zoals factuur_regels en factuur_termijnen zijn toegestaan, mits:
- ze verwijzen naar bron-entiteiten waar mogelijk;
- ze geen calculatie/werkbegroting vervangen;
- ze alleen factuurvoorstel, controle, status en AccountView-koppeling vastleggen;
- afgeleide bedragen herleidbaar blijven.

3. Bouw gefaseerd door

Fase 2 — Inkoopfacturen
- E-mail/upload → factuur uitlezen.
- Leverancier herkennen.
- IBAN controleren.
- Project/werknummer/bestelling/werkbegrotingsregel matchen.
- BTW-code en grootboek voorstellen.
- G-rekening alleen voorstellen, niet definitief bepalen.
- Afwijkingen markeren.
- Akkoord door algemene administratie verplicht.

Fase 3 — Financiële Controlebox
- Eén inbox voor verkoopfactuurvoorstellen, inkoopfacturen, afwijkingen en AccountView-status.
- Algemene administratie ziet alleen: akkoord, aanpassen, parkeren, afwijzen, naar AccountView.
- Geen boekhoudkundige detailkeuzes tonen tenzij nodig.

Fase 4 — Verkoopfactuurvoorstellen
- Voorstellen maken vanuit opdracht, termijnschema, regie, meerwerk, opleverrapport en weekstaten.
- Bijlagen automatisch koppelen.
- Meerdere factuurmodellen per klant/opdracht/factuurtype ondersteunen.
- BTW verlegd, 21%, 9%, meerdere BTW-tarieven, G-rekening en regiefacturen ondersteunen.

Fase 5 — AccountView-koppeling
- Klaarzetten/exporteren naar AccountView.
- Factuurnummer, boekstuknummer, betaalstatus en openstaande posten terug naar Connect.
- Fouten en mislukte exports herstelbaar maken.

Fase 6 — Projectimpact
- Inkoopfacturen werken door naar projectkosten, werkbegroting, nacalculatie en marge.
- Verkoopfacturen werken door naar omzet, gefactureerd, nog te factureren, cashflow en openstaande posten.

4. AI Financial Controller
AI mag:
- uitlezen;
- herkennen;
- koppelen;
- controleren;
- voorstellen;
- afwijkingen signaleren.

AI mag niet:
- definitief boeken;
- facturen verzenden;
- bankgegevens wijzigen;
- btw/G-rekening definitief bepalen;
- grootboek definitief wijzigen;
- betalingen uitvoeren.

5. Verplichte rapportage na elke fase
Na iedere fase rapporteren:
- gewijzigde bestanden;
- datamodelwijzigingen;
- nieuwe routes;
- welke bedrijfsworkflow is verbeterd;
- welke Excel/Outlook/ENK-handeling hierdoor verdwijnt;
- risico op dubbele waarheid;
- testresultaten;
- GO/NO GO voor doorgaan.

6. Stopcriteria
Stop direct en rapporteer als:
- bestaande calculatie, werkbegroting, project of AccountView-data wordt vervangen;
- boekhoudkundige brondata dubbel wordt opgeslagen zonder bronverwijzing;
- AI zelfstandig definitieve financiële besluiten neemt;
- bestaande factuur- of projectroutes breken;
- typecheck of serverstart faalt door nieuwe fouten.

Doel:
Zo snel mogelijk een werkbare financiële controleflow voor kantoor bouwen, waarbij de algemene administratie facturen kan verwerken zonder specialistische boekhoudkennis.