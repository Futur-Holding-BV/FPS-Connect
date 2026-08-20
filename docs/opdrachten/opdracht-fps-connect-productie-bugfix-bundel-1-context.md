OPDRACHT – FPS Connect productie-bugfix bundel 1

Context:
FPS Connect draait nu in productie op de VPS. De eerste beheerder is aangemaakt. We zijn gestart met echte inrichting en bedrijfsdata. Los alleen onderstaande concrete punten op. Geen nieuwe zijfunctionaliteit bouwen buiten deze scope.

Belangrijk:
- Bestaande login, 2FA, uitnodigingflow en gebruikersschema niet wijzigen.
- Geen database-reset.
- Geen mockdata toevoegen.
- Geen bestaande productiedata overschrijven.
- Werk volgens bestaande services, API-structuur en UI-patterns.
- Na afronding alleen committen als de wijzigingen getest zijn.

==================================================
1. Nieuwe werkgever aanmaken – AI-invulhulp
==================================================

Probleem:
Bij het aanmaken van een nieuwe werkgever moeten te veel velden handmatig worden ingevuld.

Gewenst gedrag:
Voeg AI-hulp toe aan het scherm/formulier voor “Nieuwe werkgever aanmaken”.

De gebruiker moet minimale input kunnen geven, bijvoorbeeld:
- bedrijfsnaam
- KvK-nummer
- website
- algemeen e-mailadres

Daarna moet AI een voorstel doen voor ontbrekende velden.

Belangrijk gedrag:
- AI vult niets definitief op zonder gebruikerstoestemming.
- Toon eerst een concept/voorstel.
- Gebruiker kan alle voorgestelde velden aanpassen.
- Pas na expliciet opslaan wordt de werkgever aangemaakt.
- AI mag juridische/administratieve gegevens niet verzinnen als onzekerheid hoog is.
- Geef bij onzekere velden duidelijk aan: “controle vereist”.

Acceptatie:
- Nieuwe werkgever kan nog steeds volledig handmatig worden aangemaakt.
- AI-hulp is optioneel.
- Geen bestaande werkgeverflow breekt.
- Fouten in AI-aanvulling blokkeren handmatig opslaan niet.

==================================================
2. Document Studio – upload referentiemodel wordt niet gekoppeld
==================================================

Probleem:
In Document Studio wordt een briefpapier-/referentie-PDF ge-upload, maar daarna blijft het documenttype op “Geen model” staan.

Geobserveerd:
- Upload van PDF lijkt te slagen.
- Rechtsonder verschijnt het bestand bij recente uploads.
- De kaart, bijvoorbeeld “Offerte”, blijft “Geen model” tonen.
- Teller “Referentie ge-upload” blijft 0.
- Er is geen zichtbare koppeling tussen upload en documenttype.

Voorbeeldbestand:
FPSB-BP-Pixel-based.pdf

Gewenst gedrag:
Wanneer een gebruiker binnen Document Studio bij een documenttype op “Referentie uploaden” klikt en een PDF uploadt:

- De upload wordt gekoppeld aan:
  - geselecteerde werkmaatschappij
  - geselecteerd documenttype
- De kaart verandert direct van “Geen model” naar een duidelijke status, bijvoorbeeld:
  - “Referentie aanwezig”
  - “Concept”
  - “Model versie 1”
- De teller “Referentie ge-upload” wordt verhoogd.
- De gebruiker ziet welk bestand actief gekoppeld is.
- Toon minimaal:
  - bestandsnaam
  - uploadtijd
  - status
  - actieknoppen: bekijken, vervangen, verwijderen
- Na refresh moet de koppeling behouden blijven.

Extra gewenst:
Voeg een preview/miniatuur toe als dat binnen de bestaande infrastructuur eenvoudig kan. Zo niet, toon in ieder geval een duidelijke bestandskoppeling.

Belangrijk:
- Upload mag niet alleen als losse recente upload blijven bestaan.
- Het bestand moet echt als referentie/model aan het documenttype gekoppeld worden.
- Geen automatische definitieve templategeneratie zonder gebruikerscontrole.

==================================================
3. Document Studio – AI-analyse van briefpapier voorbereiden
==================================================

Doel:
Document Studio moet niet alleen een PDF opslaan, maar deze als referentie kunnen gebruiken voor toekomstige documentgeneratie.

Implementeer minimaal een eerste analyse-/statuslaag:

Na upload:
- status = “Referentie ge-upload” of “Analyse vereist”
- mogelijkheid om AI-analyse te starten
- AI-analyse moet later kunnen bepalen:
  - logo-positie
  - header
  - footer
  - marges
  - kleurgebruik
  - contactblok
  - vaste onderlegger/briefpapier-layout

Voor deze opdracht hoeft de volledige documentgeneratie nog niet perfect te zijn, maar de data- en UI-structuur moet voorbereid zijn zodat het referentiemodel later daadwerkelijk gebruikt kan worden als onderlegger voor offertes/rapporten/brieven.

Acceptatie:
- Referentie-PDF is zichtbaar gekoppeld.
- Status is duidelijk.
- Het systeem maakt onderscheid tussen:
  - geen model
  - referentie ge-upload
  - concept/analyse
  - goedgekeurd model
- De gebruiker snapt direct wat nog moet gebeuren.

==================================================
Testen
==================================================

Test minimaal:

1. Werkgever handmatig aanmaken
- Werkt nog steeds.

2. Werkgever met AI-hulp
- AI geeft voorstel.
- Gebruiker kan aanpassen.
- Opslaan werkt pas na bevestiging.

3. Document Studio upload
- Selecteer FPS Brandpreventie.
- Selecteer documenttype Offerte.
- Upload FPSB-BP-Pixel-based.pdf.
- Kaart toont niet langer “Geen model”.
- Bestand is gekoppeld aan Offerte.
- Teller wijzigt correct.
- Refresh behoudt de koppeling.

4. Vervangen/verwijderen
- Referentie kan vervangen worden.
- Referentie kan verwijderd worden.
- Status valt dan correct terug naar “Geen model”.

5. Regressie
- Login blijft werken.
- First Install Bootstrap blijft uitgeschakeld zodra gebruiker bestaat.
- Bestaande documenttypen blijven zichtbaar.

==================================================
Oplevering
==================================================

Na afronding:
- Geef korte samenvatting van gewijzigde bestanden.
- Geef testresultaten.
- Laat git status zien.
- Commit pas wanneer de diff alleen deze scope raakt.

Commit message voorstel:
“Fix Document Studio reference binding and add employer AI assist”