Maak deze Ready for review-wijziging eerst veilig voor gecontroleerde uitrol. Pas nog niets toe op main en voer nog geen deployment uit.

Voer uitsluitend deze aanvullingen uit:

1. Plaats de volledige nieuwe-medewerkerwizard achter één centrale feature flag.

De feature flag moet standaard UIT staan in productie.

Bestaande HRM-schermen, gebruikersbeheer, login en personeelsdossiers moeten volledig blijven werken wanneer de feature flag uit staat.

2. Voeg een geautomatiseerde test toe van de echte gebruikersroute:

- inloggen als HRM-medewerker
- Nieuwe medewerker openen
- duplicaatcontrole uitvoeren
- gegevens invullen
- tussentijds opslaan
- pagina sluiten en hervatten
- AI-voorstel goedkeuren
- AI-voorstel afwijzen
- AI-voorstel op Later beoordelen zetten
- controleren dat bestaande medewerkergegevens niet automatisch worden overschreven

3. Voeg een regressietest toe die controleert dat:

- bestaande gebruikers nog kunnen inloggen
- bestaande personeelsdossiers openen
- de bestaande medewerker-aanmaakroute blijft werken
- de wizard geen account, medewerker of uitnodiging dubbel aanmaakt

4. Controleer en borg de deploymentvolgorde:

- database-migrations eerst
- daarna backend
- daarna frontend
- daarna healthcheck
- bij een fout geen gedeeltelijk actieve wizard

Alle migrations moeten idempotent zijn.

5. Beschouw de AI-documentfunctie nog niet als bewezen werkend.

hrm-ai-analyse.ts gebruikt classificeerDocument(), terwijl de productieproef met FPSB-BP-Pixel-based.pdf momenteel nog als Onbekend eindigt.

De wizard mag daarom niet melden dat documentanalyse succesvol is wanneer OCR, vision of classificatie feitelijk niet werkt.

Toon in dat geval een duidelijke Nederlandse melding en laat handmatige invoer mogelijk.

6. Rapporteer daarna compact:

- naam van de feature flag
- standaardwaarde in productie
- toegevoegde testbestanden
- testresultaten
- bevestiging dat login en bestaande HRM-routes niet zijn geraakt
- bevestiging dat nog geen merge of deployment is uitgevoerd

Geef als eindconclusie uitsluitend één van deze twee statussen:

VEILIG VOOR GECONTROLEERDE REVIEW

of:

NIET VEILIG VOOR REVIEW