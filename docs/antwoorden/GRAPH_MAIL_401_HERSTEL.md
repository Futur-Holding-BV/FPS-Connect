# Herstel: Microsoft Graph weigert het client-secret (AADSTS7000215)

**Symptoom:** de GitHub Actions-stappen "Faalmelding e-mailen naar René" en
"Tijd- en schijfbewaking" geven een HTTP 401 bij het ophalen van een
Graph-bearer-token. Hierdoor werd een succesvolle deploy als rood gemarkeerd
en werden echte faalmeldingen niet bezorgd.

Het volledige, door GitHub geredigeerde Azure-antwoord is:

```text
error: invalid_client
error_code: AADSTS7000215
Invalid client secret provided. Ensure the secret being sent in the request is
the client secret value, not the client secret ID.
```

---

## Oorzaak

De stappen gebruiken de Microsoft Graph API met *client-credentials*:
`client_id + client_secret → access_token → sendMail`.

`AADSTS7000215` bewijst specifiek dat de waarde in het GitHub Actions-secret
`AZURE_CLIENT_SECRET` niet geldig is voor de app die door `AZURE_CLIENT_ID`
wordt aangewezen. Mogelijke oorzaken zijn:

- de secret is verlopen of in Azure ingetrokken;
- de secretwaarde hoort bij een andere app-registratie;
- de **Secret ID** is opgeslagen in plaats van de eenmalig zichtbare
  **Value**.

De fout bewijst niet op zichzelf dat de secret verlopen is. Een onbekend
client-ID geeft een andere Azure-fout (`AADSTS700016`).

Een 403 *na* het ophalen van het token betekent: het token is geldig maar de
app-registratie mist de `Mail.Send` applicatiemacht.

---

## Exacte Azure-registratie

| Onderdeel | Waarde |
|---|---|
| Microsoft-tenant | `244325c9-8a1b-4634-8b05-e1042b2fdbf7` |
| Beoogde app-registratie | `FPS Connect Mail` |
| Productiedomein | `fpsbrandpreventie.nl` |
| Vereiste Graph-machtiging | `Mail.Send` — Application, met admin consent |

Andere Application-machtigingen zijn niet vereist voor deze app-only
mailkoppeling. De verbindingstest valideert de postbus via een ontvangerloze
`sendMail`-probe en doet geen gebruikers-leesoproep. De persoonlijke Werk-inbox
gebruikt apart gedelegeerd `User.Read` en gedelegeerde mailrechten.

De tenant is op 20 augustus 2026 publiek geverifieerd via de Microsoft
OpenID-configuratie van `fpsbrandpreventie.nl`. De naam `FPS Connect Mail`
komt uit de FPS Connect-herbouwdocumentatie. GitHub maskeert het daadwerkelijke
Application (client) ID in de Actions-log; vergelijk daarom in Azure de
Application (client) ID van deze registratie met de ingestelde client-ID's.

## Twee afzonderlijke secretlocaties

GitHub Actions en de Connect-productieruntime lezen niet uit dezelfde
secretopslag:

| Gebruik | Locatie | Client-ID die de code gebruikt | Secret |
|---|---|---|---|
| Deploy-, faal- en noodfixmail | GitHub repository → Settings → Secrets and variables → Actions | `AZURE_CLIENT_ID` | `AZURE_CLIENT_SECRET` |
| Alle Connect-appmail | VPS `/opt/fps-connect/.env.production` | bij voorkeur `AZURE_CLIENT_ID_NEW`, anders `AZURE_CLIENT_ID` | `AZURE_CLIENT_SECRET` |

Werk bij herstel dezelfde geldige secretwaarde op **beide** plaatsen bij en
controleer dat `AZURE_CLIENT_ID` en `AZURE_CLIENT_ID_NEW` naar dezelfde
app-registratie `FPS Connect Mail` wijzen. Alleen een GitHub-secret bijwerken
herstelt de Connect-appmail niet; alleen de VPS bijwerken herstelt de
Actions-meldingen niet.

## Benodigde stap: nieuw Azure-secret maken en plaatsen

De workflow leest deze zes waarden uit **GitHub Actions Secrets** (niet uit
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

1. Meld aan in tenant `244325c9-8a1b-4634-8b05-e1042b2fdbf7`.
2. Ga naar **Azure Portal → App registrations → FPS Connect Mail**.
3. Controleer op **Overview** de **Application (client) ID** tegen
   `AZURE_CLIENT_ID` in GitHub en `AZURE_CLIENT_ID_NEW` op de VPS.
4. Ga naar **Certificates & secrets → Client secrets → New client secret**.
   Kopieer na het aanmaken de kolom **Value**, nadrukkelijk niet de
   **Secret ID**. De Value is later niet meer zichtbaar.
5. Vervang GitHub Actions-secret `AZURE_CLIENT_SECRET` met deze Value.
6. Vervang op de VPS `AZURE_CLIENT_SECRET` in
   `/opt/fps-connect/.env.production` met dezelfde Value en herstart daarna de
   API-server.
7. Controleer onder **API permissions** of `Mail.Send` (type: Application, niet
   Delegated) aanwezig en **goedgekeurd** is door een Azure-beheerder
   (de kolom "Status" moet "Granted" tonen).
8. Als `Mail.Send` ontbreekt: voeg toe via **Add a permission → Microsoft Graph
   → Application permissions → Mail.Send** en laat een beheerder "Grant admin
   consent" klikken.

### Nieuw geheim aanmaken

- Geef het geheim een beschrijvende naam, bv. `fps-connect-deploy-alerts`.
- Kies een vervaldatum van minimaal 1 jaar.
- Zet een agenda-herinnering op 11 maanden om het op tijd te verlengen.

---

## Vastgestelde impact

### GitHub Actions-mail

- Op 17 augustus 2026 om 15:30 UTC verstuurde run
  `32042358763` nog aantoonbaar een faalmelding.
- De eerste volledig gelogde `AADSTS7000215` staat in run
  `32147986350` van 18 augustus 2026 om 14:34 UTC.
- De noodfixrun `32229451303` kreeg dezelfde fout op 19 augustus om
  07:47 UTC.
- De twee latere faalmailtests `32280586391` en `32281531087` kregen op
  19 augustus om 17:24 en 17:28 UTC opnieuw dezelfde fout. Dat de runs groen
  zijn, bewijst alleen dat de graceful-exit werkte; er is geen testmail
  verstuurd.
- Tussen de eerste volledig bewezen 401 en 20 augustus 04:46 UTC faalden
  veertien deployruns waarvoor een Actions-faalmelding hoorde te worden
  verstuurd. De twee groene faalmailtests zijn daar niet bij meegeteld.

Het precieze omslagmoment ligt dus na de aantoonbaar geslaagde verzending van
17 augustus 15:30 UTC en uiterlijk op 18 augustus 14:34 UTC.

### Connect-appmail

De productiedatabase toont:

- laatste geregistreerde succesvolle appmail:
  `wachtwoord_reset`, 11 augustus 2026 07:56:41 UTC;
- geen geregistreerde mislukte appmail;
- geen `wachtend`, `verzenden` of `mislukt` item in `mail_wachtrij`;
- sinds die laatste verzending geen wachtwoord-reset-token, uitnodiging,
  uitnodigingsherinnering of offerte-maillog aangemaakt.

Er is daarom **geen bekend Connect-bericht om opnieuw te verzenden**. Dit
bewijst echter niet dat de VPS-credential nog geldig is: sinds 11 augustus is
geen appmailpoging geregistreerd en `/api/versie/status` controleert alleen of
mailvariabelen aanwezig zijn, niet of Azure een token afgeeft. Test de
Connect-runtime daarom afzonderlijk na het bijwerken van de VPS-secret.

---

## Controleer na het bijwerken

1. Voer een test-run uit via GitHub Actions → "Deploy naar productie" →
   "Run workflow" → vul bij **test_faalmail** het woord `TEST` in.
2. Controleer de daadwerkelijke ontvangst van de e-mail met onderwerp
   "FPS Connect: productie-release GEFAALD".
3. Open in Connect als gebruiker met `systeem:2` de beheerpagina voor
   e-mail. Voer eerst de verbindingstest uit
   (`POST /api/mail/verbindingstest`) en verstuur daarna een echte testmail
   (`POST /api/mail/testmail`).
   De verbindingstest vereist uitsluitend Application `Mail.Send` en verstuurt
   zelf geen bericht.
4. Controleer zowel de daadwerkelijke ontvangst als een nieuwe rij met status
   `verzonden` in `mail_logboek`.
5. Voer daarna de verplichte noodfix-beproeving opnieuw uit en controleer de
   daadwerkelijke ontvangst van de noodfixmail.

- Bij succes: René ontvangt een e-mail met onderwerpregel
  "FPS Connect: productie-release GEFAALD" en de tekst "Dit is een bewuste
  testfout". De Actions-run eindigt daarna **groen**: de test simuleert alleen
  de fout voor de faalmail en raakt de productieserver niet. De test wordt ook
  niet als mislukte uitrol aan Connect teruggemeld.
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

Een groene faalmailtest is daardoor op zichzelf geen verzendbewijs: de log moet
`Faalmelding verzonden naar René.` bevatten én de e-mail moet ontvangen zijn.

De handmatige invoer `test_faalmail=TEST` gebruikt een aparte, veilige
testwachtrij. Hij triggert de faalmail met een bewuste simulatie in plaats van
een echte deployfout, zodat de run groen kan afronden en nieuwe productie-pushes
het e-mailbewijs niet annuleren.
