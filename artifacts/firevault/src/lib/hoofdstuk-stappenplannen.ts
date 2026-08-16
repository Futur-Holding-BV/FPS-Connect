// NAV_01 — Stappenplan per sidebar-hoofdstuk. Wordt getoond als uitklapbaar
// blok bovenin het tweede uitklapvenster (het paneel naast de sidebar), zodat
// een gebruiker in één oogopslag ziet in welke volgorde de onderdelen van het
// hoofdstuk in de dagelijkse praktijk worden doorlopen.
export const HOOFDSTUK_STAPPENPLANNEN: Record<string, string[]> = {
  projectaanpak: [
    "Maak of open het project bij Projecten.",
    "Leg de situatie vast met een Opname (spots, foto's, plattegrond).",
    "Werk de Calculatie uit op basis van de opname.",
    "Stel de Offerte op en verstuur die naar de klant.",
    "Na akkoord: rond de Werkvoorbereiding en het Inkoopoverzicht af.",
    "Zet het werk in de Planning en volg het via Uitvoering.",
    "Sluit af met de Opleverrapportage en archiveer in Dossiers/Documenten.",
  ],
  magazijn: [
    "Controleer het Dashboard op kritieke voorraad en openstaande acties.",
    "Beheer Artikelen en Locaties zodat alles vindbaar is.",
    "Reserveer materiaal voor projecten via Reserveringen.",
    "Verwerk Uitgifte bij vertrek naar het werk en Retouren bij terugkomst.",
    "Vul aan met Inkooporders wanneer de voorraad onder het minimum komt.",
    "Loop periodiek Stellingscans en Mutaties na voor een kloppende voorraad.",
  ],
  commercie: [
    "Leg relaties en contactpersonen vast in het CRM.",
    "Registreer kansen en aanvragen bij de juiste relatie.",
    "Volg openstaande acties en taken op vanuit de relatiepagina.",
    "Zet een concrete aanvraag door naar een offerte (Projectaanpak).",
  ],
  communicatie: [
    "Begin de dag in de Werk-inbox: verwerk binnengekomen mail.",
    "Gebruik Berichten voor interne afstemming per onderwerp.",
    "Zet afspraken en besluiten door naar Team & overleg.",
    "Bewaak lopende processen via Workflow.",
  ],
  veiligheid: [
    "Plan en geef toolboxen via het Toolbox Center.",
    "Laat monteurs vóór risicovol werk een LMRA invullen.",
    "Registreer onveilige situaties bij Meldingen en ongevallen bij Incidenten.",
    "Beheer PBM & Middelen (uitgifte en keuringen).",
    "Controleer de deelname in Toolbox Compliance.",
  ],
  financieel: [
    "Verwerk binnengekomen facturen via de Crediteuren inbox en Facturen.",
    "Bewaak betalingen en termijnen met Factuurbewaking en de Controlebox.",
    "Volg het bedrijfsbeeld in de Directiecockpit, Liquiditeit en het Bedrijfskompas.",
    "Houd Onderhanden werk en Bedrijfsresultaten actueel.",
    "Sluit periodes af richting boekhouding (Klaar voor export, SEPA-bestanden).",
    "Gebruik Jaarrekeningen en het Meerjarenoverzicht voor het langetermijnbeeld.",
  ],
  goedkeuring: [
    "Stel eenmalig de regels en grenzen in bij Goedkeuringsbeleid.",
    "Beoordeel wachtende aanvragen op het Dashboard.",
    "Keur goed of wijs af met reden; de aanvrager ziet de uitkomst direct.",
  ],
  declaraties: [
    "Dien een declaratie in met bon of omschrijving.",
    "Beoordeel ingediende declaraties in het Overzicht.",
    "Goedgekeurde declaraties gaan automatisch mee in de verwerking.",
  ],
  organisatie: [
    "Houd Bedrijfsgegevens en Werkmaatschappijen actueel.",
    "Beheer Gereedschappen en het Wagenpark (keuringen, toewijzing).",
    "Volg Meldingen en Verzekeringen op.",
    "Beheer Bedrijfsdocumenten en Jaarverslagen & Rekeningen.",
    "Richt sjablonen in via Documentopmaak en Document Studio.",
  ],
  personeel: [
    "Neem nieuwe medewerkers aan via Werving en de onboarding.",
    "Beheer dossiers en functies bij Personeel; externen apart bij Externen / ZZP.",
    "Bewaak contracten en termijnen met Contractbewaking.",
    "Plan verlof en bezetting via Verlofoverzicht, Jaarkalender en Jaarplanning.",
    "Controleer wekelijks Urenregistratie en Weekstaten.",
    "Sluit vertrek netjes af via Uitboarden.",
  ],
  loon: [
    "Verzamel wijzigingen als Salarismutaties gedurende de periode.",
    "Verwerk binnengekomen SCAB Salarismails.",
    "Controleer de Loon-output en deel via het Boekhouderportaal.",
    "Doe aan het einde van het jaar de Jaarafsluiting verlof.",
    "Raadpleeg oude periodes in het Salarisarchief.",
  ],
};
