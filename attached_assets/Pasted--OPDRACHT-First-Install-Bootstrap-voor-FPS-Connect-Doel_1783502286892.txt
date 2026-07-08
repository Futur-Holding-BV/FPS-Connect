# OPDRACHT – First Install Bootstrap voor FPS Connect

## Doel

Implementeer een veilige bootstrapprocedure voor een nieuwe FPS Connect-installatie.

De applicatie moet automatisch detecteren of het systeem voor de eerste keer wordt gebruikt. Wanneer de tabel `gebruikers` leeg is, mag de gebruiker niet naar het normale inlogscherm gaan, maar moet eerst een eerste hoofdbeheerder kunnen aanmaken.

Dit is een permanente productfunctionaliteit en geen tijdelijke workaround.

---

## Detectie

Controleer bij het openen van de loginpagina of tijdens de applicatie-initialisatie:

SELECT COUNT(*) FROM gebruikers;

Wanneer het resultaat 0 is:

- Schakel de normale login uit.
- Activeer de bootstrapmodus.
- Leid automatisch door naar de bootstrappagina.

Wanneer het resultaat groter is dan 0:

- Bootstrap mag niet meer bereikbaar zijn.
- Toon de normale login.

---

## Nieuwe route

Maak een nieuwe route:

/first-install

Deze route mag uitsluitend toegankelijk zijn wanneer de tabel `gebruikers` leeg is.

Wanneer al minimaal één gebruiker bestaat:

- HTTP 403 retourneren.
- Bericht:
  "Bootstrap disabled"

---

## Bootstrappagina

Maak een professionele eerste-installatiepagina.

Velden:

- Naam
- Bedrijfsnaam
- E-mailadres
- Wachtwoord
- Herhaal wachtwoord

---

## Validatie

Controleer:

- geldig e-mailadres
- uniek e-mailadres
- wachtwoord voldoet aan bestaande beveiligingseisen
- beide wachtwoorden gelijk
- alle verplichte velden ingevuld

Gebruik bestaande validaties waar mogelijk.

---

## Gebruiker aanmaken

Gebruik uitsluitend de bestaande gebruikersservice.

Geen nieuwe SQL buiten de bestaande repositories/services.

Gebruik exact dezelfde authenticatielogica als de bestaande login.

Hash het wachtwoord met:

bcrypt.hash(password, 10)

Maak vervolgens de eerste gebruiker aan.

Waarden:

- rol = hoofdbeheerder
- actief = true
- gearchiveerd = false
- is_hoofdtester = false
- uitnodiging_status = geaccepteerd
- taal = nl

Alle overige velden volgens de bestaande defaults.

---

## Bedrijf

Controleer of er al een organisatie/bedrijf bestaat.

Wanneer niet:

- maak automatisch de eerste organisatie aan;
- gebruik de opgegeven bedrijfsnaam;
- koppel de eerste gebruiker direct aan deze organisatie.

Gebruik hiervoor bestaande services indien aanwezig.

Geen dubbele implementaties.

---

## Na succesvol aanmaken

Na succesvolle bootstrap:

- Bootstrap permanent uitschakelen.
- Automatisch redirecten naar:

/login

De nieuwe beheerder moet direct kunnen inloggen.

---

## Beveiliging

Bootstrap mag uitsluitend werken zolang:

SELECT COUNT(*) FROM gebruikers = 0

Zodra één gebruiker bestaat:

- endpoint blokkeren;
- pagina blokkeren;
- API blokkeren;
- HTTP 403 retourneren.

---

## Logging

Log uitsluitend:

"First installation completed"

Nooit:

- wachtwoorden
- bcrypt hashes
- tokens
- secrets

---

## Testscenario's

Controleer minimaal:

1. Lege database
- Bootstrap verschijnt automatisch.

2. Eerste beheerder aanmaken
- Gebruiker wordt correct opgeslagen.
- Organisatie wordt aangemaakt.
- Wachtwoord wordt correct gehasht.

3. Redirect
- Automatisch naar /login.

4. Inloggen
- Eerste beheerder kan direct aanmelden.

5. Tweede bezoek
- Bootstrap bestaat niet meer.

6. Beveiliging
- /first-install geeft HTTP 403 zodra minimaal één gebruiker bestaat.

7. Authenticatie
- Nieuwe gebruiker gebruikt exact dezelfde loginflow als alle toekomstige gebruikers.

---

## Belangrijk

Niet:

- rechtstreeks SQL schrijven buiten bestaande repositories/services;
- nieuwe authenticatielogica bouwen;
- alternatieve hashmethodes gebruiken;
- bestaande loginflow wijzigen.

Wel:

- volledig hergebruik van bestaande authenticatie;
- volledig hergebruik van bestaande gebruikersservices;
- één uniforme manier van gebruikersbeheer.

---

## Acceptatiecriteria

De implementatie is gereed wanneer:

- Een volledig lege productie-installatie zelfstandig kan worden geïnitialiseerd.
- Geen handmatige SQL meer nodig is.
- Geen handmatige database-aanpassingen meer nodig zijn.
- De eerste hoofdbeheerder veilig kan worden aangemaakt.
- De bootstrap zichzelf automatisch uitschakelt zodra de eerste gebruiker bestaat.
- Alle bestaande loginfunctionaliteit ongewijzigd blijft werken.