# Herstel: Microsoft Graph token-aanroep geeft HTTP 401 (faalmail en tijdbewaking)

**Symptoom:** de GitHub Actions-stappen "Faalmelding e-mailen naar René" en
"Tijd- en schijfbewaking" geven een HTTP 401 bij het ophalen van een
Graph-bearer-token. Hierdoor werd een succesvolle deploy als rood gemarkeerd
en werden echte faalmeldingen niet bezorgd (geconstateerd in run 32147986350,
18-08-2026).

---

## Oorzaak

De stappen gebruiken de Microsoft Graph API met *client-credentials*:
`client_id + client_secret → access_token → sendMail`.

Een 401 op de token-aanroep (`login.microsoftonline.com/.../oauth2/v2.0/token`)
betekent: het client-secret is verlopen, of de app-registratie bestaat niet
meer.

Een 403 *na* het ophalen van het token betekent: het token is geldig maar de
app-registratie mist de `Mail.Send` applicatiemacht.

---

## Benodigde stap: nieuwe Azure-gegevens in de GitHub-secrets zetten

De workflow leest deze vijf waarden uit **GitHub Actions Secrets** (niet uit
Replit). Ze moeten worden ingesteld via:

> GitHub → repository → Settings → Secrets and variables → Actions

| Secret naam           | Inhoud                                                          |
|-----------------------|-----------------------------------------------------------------|
| `AZURE_TENANT_ID`     | Directory (tenant) ID van de Azure Active Directory-omgeving    |
| `AZURE_CLIENT_ID`     | Application (client) ID van de app-registratie                  |
| `AZURE_CLIENT_SECRET` | Geheime sleutel (Client secret) van die app-registratie         |
| `MAIL_FROM`           | Het "Van:"-adres (bv. `noreply@fpsbrandpreventie.nl`)           |
| `MAIL_MAILBOX`        | Het mailbox-account dat `sendMail` uitvoert (bv. `app@fpsbrandpreventie.nl`) |
| `RENE_ALERT_EMAIL`    | René's e-mailadres waar de meldingen naartoe gaan               |

## Maandelijkse controle op vervaldatum

De workflow `.github/workflows/azure-client-secret-expiry.yml` draait op de
eerste dag van elke maand en is ook handmatig te starten. Hij zoekt de
Azure-applicatie op basis van `AZURE_CLIENT_ID` en haalt daarna via
`/applications/{id}/passwordCredentials` alle client-secrets op. Ook als er
meerdere secrets bestaan, wordt elk `endDateTime` gecontroleerd.

De app-registratie waarmee de GitHub Actions-token wordt opgehaald heeft naast
`Mail.Send` ook de Microsoft Graph **Application permission
`Application.Read.All`** nodig, inclusief admin consent. Zonder die leesmacht
kan de workflow de vervaldatum niet betrouwbaar vaststellen: hij zet dan een
zichtbare Actions-fout en maakt of werkt een GitHub-issue bij. Als een secret
binnen 30 dagen verloopt, probeert de workflow eerst René per Graph-mail te
waarschuwen en gebruikt hij hetzelfde issue als fallback wanneer mail niet
werkt.

### Stap-voor-stap in Azure Portal

1. Ga naar **Azure Portal → App registrations** en open de registratie die voor
   FPS Connect wordt gebruikt.
2. Controleer onder **Certificates & secrets → Client secrets** of het geheim
   geldig is. Maak een nieuw geheim aan als het verlopen is. Kopieer de waarde
   direct — die is later niet meer zichtbaar.
3. Controleer onder **API permissions** of `Mail.Send` (type: Application, niet
   Delegated) aanwezig en **goedgekeurd** is door een Azure-beheerder
   (de kolom "Status" moet "Granted" tonen).
4. Als `Mail.Send` ontbreekt: voeg toe via **Add a permission → Microsoft Graph
   → Application permissions → Mail.Send** en laat een beheerder "Grant admin
   consent" klikken.

### Nieuw geheim aanmaken (alleen als verlopen)

- Geef het geheim een beschrijvende naam, bv. `fps-connect-deploy-alerts`.
- Kies een vervaldatum van minimaal 1 jaar.
- Zet een agenda-herinnering op 11 maanden om het op tijd te verlengen.

---

## Controleer na het bijwerken

Voer een test-run uit via GitHub Actions → "Deploy naar productie" →
"Run workflow" → vul bij **test_faalmail** het woord `TEST` in.

- Bij succes: René ontvangt een e-mail met onderwerpregel
  "FPS Connect: productie-release GEFAALD" en de tekst "Dit is een bewuste
  testfout".
- Bij 401: de Actions-stap logt "Kon geen Graph-token ophalen (HTTP 401)" met
  het volledige Azure-antwoord (error code + description), zodat je precies
  weet wat er mis is.
- Bij 403 na het token: de `sendMail`-aanroep mislukt met HTTP 403 → controleer
  de `Mail.Send`-machtiging en de admin-consent.

---

## Codewijziging (augustus 2026)

De token-aanroep gebruikte `curl -f` (fail-fast bij 4xx) in combinatie met
`set -euo pipefail`. Een 401 liet daardoor de stap crashen vóórdat de
graceful-exit-guard bereikt werd — waardoor een geslaagde deploy als rood
kleurde. Dit is opgelost: de token-aanroep schrijft de respons nu naar een
tijdelijk bestand, logt de HTTP-statuscode en verlaat de stap met exit 0
(bewaking/faalmelding) respectievelijk exit 1 (noodfix, waarbij de melding
verplicht is).
