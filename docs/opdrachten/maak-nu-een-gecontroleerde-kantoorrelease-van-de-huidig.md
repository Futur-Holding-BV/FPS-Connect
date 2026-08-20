Maak nu een gecontroleerde kantoorrelease van de huidige stabiele versie.

Doel:
de applicatie moet op kantoor gebruikt kunnen worden als vaste releaseversie, los van dagelijkse ontwikkelwijzigingen.

Voer geen nieuwe functionaliteit toe.

Richt het volgende releaseproces in:

1. Maak een releaseversie
- label de huidige stabiele versie als Office Release v1.0.0
- leg datum en tijd vast
- leg commit/checkpoint vast
- leg gebruikte databaseversie vast
- leg bekende beperkingen vast

2. Scheid omgevingen
Maak onderscheid tussen:
- development: Replit bouw-/testomgeving
- office-release: vaste kantoorversie voor dagelijks gebruik

Kantoorgebruikers mogen niet op de developmentomgeving werken.

3. Updateproces
Nieuwe wijzigingen mogen alleen naar de kantoorversie via een update.

Elke update krijgt:
- versienummer
- datum
- korte samenvatting
- inbegrepen wijzigingen
- bugfixes
- beveiligingswijzigingen
- bekende beperkingen
- eventuele instructies voor gebruikers

4. Releasenotes
Maak een zichtbaar scherm: “Wat is nieuw in deze update?”

Toon per versie:
- versie
- datum
- toegevoegd
- verbeterd
- opgelost
- beveiliging
- bekend probleem

5. Updateblokkade
Voorkom dat onafgemaakte Replit-wijzigingen automatisch zichtbaar worden in de kantoorversie.

Alleen goedgekeurde releases mogen naar office-release.

6. Rollback
Zorg dat de vorige kantoorversie teruggezet kan worden wanneer een update problemen geeft.

7. Acceptatiecheck
Een update mag alleen naar kantoor als:
- build slaagt
- tests slagen
- geen kritieke fouten openstaan
- release readiness akkoord is
- databasewijzigingen gecontroleerd zijn
- releasenotes zijn aangemaakt

8. Release Dashboard
Maak of vul een dashboard met:
- huidige kantoorversie
- laatste update
- openstaande bugs
- geplande update
- release status
- rollbackmogelijkheid

Acceptatiecriteria:
- kantoorversie is duidelijk gescheiden van development;
- huidige versie is vastgelegd als Office Release v1.0.0;
- gebruikers zien alleen goedgekeurde updates;
- elke update heeft releasenotes;
- rollback is mogelijk;
- onafgemaakte ontwikkelwijzigingen komen niet automatisch op kantoor terecht.

Geen nieuwe functies bouwen.
Alleen releaseproces, versiebeheer, releasenotes en scheiding tussen development en kantoorversie inrichten.