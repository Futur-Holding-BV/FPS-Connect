# Microsoft Graph — e-mail en Azure AD

FPS Connect verstuurt e-mail via **Microsoft Graph API** vanuit een gedeelde
postbus (shared mailbox) op Microsoft 365. Hieronder staat hoe de Azure AD
App Registration opnieuw wordt ingericht.

---

## Vereisten

- Microsoft 365 Business-abonnement met gedeelde postbus
- Toegang tot **Azure Portal** (https://portal.azure.com) als tenantbeheerder
- De gedeelde postbus `postbus@fps-brandpreventie.nl` moet bestaan

---

## Stap 1 — App Registration aanmaken

1. Ga naar **Azure Portal → Azure Active Directory → App registrations**
2. Klik **New registration**
3. Vul in:
   - **Name:** `FPS Connect Mail`
   - **Supported account types:** _Accounts in this organizational directory only_
   - **Redirect URI:** leeg laten
4. Klik **Register**

Noteer de volgende waarden (nodig voor `.env`):
- **Application (client) ID** → `AZURE_CLIENT_ID_NEW`
- **Directory (tenant) ID** → `AZURE_TENANT_ID`

---

## Stap 2 — Client secret aanmaken

1. Ga naar de app → **Certificates & secrets → New client secret**
2. Beschrijving: `FPS Connect productie`
3. Verlooptijd: **24 maanden** (noteer verloopdatum in agenda)
4. Kopieer de **Value** direct — daarna niet meer zichtbaar
   - Sla op als `AZURE_CLIENT_SECRET` in `.env` en in de wachtwoordkluis

---

## Stap 3 — API-rechten instellen

1. Ga naar **API permissions → Add a permission → Microsoft Graph → Application permissions**
2. Voeg toe:
   - `Mail.Send` — e-mail versturen als de app
   - `Mail.ReadWrite` *(optioneel)* — voor e-mails in de postbus lezen (inbox-adapter)
3. Klik **Grant admin consent** — vereist tenantbeheerder

---

## Stap 4 — Send-as / gedeelde postbus autoriseren

De app verstuurt e-mail als de gedeelde postbus `MAIL_MAILBOX`.
Zorg dat de mailbox bestaat als **Shared Mailbox** in Microsoft 365 Admin:

1. **Microsoft 365 Admin Center → Teams & groups → Shared mailboxes**
2. Maak `postbus@fps-brandpreventie.nl` aan (of controleer of het al bestaat)
3. Voeg de app-service-principal toe als gemachtigde **via PowerShell**:

```powershell
# Vereist: Exchange Online PowerShell module
Connect-ExchangeOnline

# Geef de app-registratie toestemming om als de postbus te verzenden
Add-MailboxPermission -Identity "postbus@fps-brandpreventie.nl" `
  -User "fps-connect-mail@<tenant>.onmicrosoft.com" `
  -AccessRights FullAccess

# Of via Application Access Policy (beperkte rechten — aanbevolen):
New-ApplicationAccessPolicy `
  -AppId "<AZURE_CLIENT_ID_NEW>" `
  -PolicyScopeGroupId "postbus@fps-brandpreventie.nl" `
  -AccessRight RestrictAccess `
  -Description "FPS Connect — alleen toegang tot fps-postbus"
```

---

## Stap 5 — Omgevingsvariabelen instellen

```env
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_ID_NEW=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=GEHEIM_GEGENEREERD_IN_STAP_2
MAIL_MAILBOX=postbus@fps-brandpreventie.nl
MAIL_FROM=FPS Connect <noreply@fps-brandpreventie.nl>
```

---

## Verificatie

Test of het e-mailen werkt via de API:

```bash
curl -X POST https://connect.fps-brandpreventie.nl/api/beheer/mail-test \
  -H "Cookie: <sessiecookie>" \
  -H "Content-Type: application/json" \
  -d '{"ontvanger": "beheerder@fps-brandpreventie.nl"}'
```

---

## Jaarlijkse verlenging client secret

Client secrets verlopen (standaard 24 maanden). Plan een **agenda-herinnering**:

1. Maak een nieuw secret aan in Azure Portal (stap 2)
2. Werk `AZURE_CLIENT_SECRET` bij in alle omgevingen (productie + back-up)
3. Herstart de API-server
4. Verwijder het oude secret in Azure Portal

---

## Troubleshooting

| Foutmelding | Oorzaak | Oplossing |
|---|---|---|
| `AADSTS700016` | App ID onjuist | Controleer `AZURE_CLIENT_ID_NEW` en `AZURE_TENANT_ID` |
| `AADSTS7000215` | Secret verlopen of ongeldig | Nieuw secret aanmaken |
| `ErrorSendAsDenied` | Postbus-rechten ontbreken | Application Access Policy instellen (stap 4) |
| `InvalidAuthenticationToken` | Token verlopen | App herstart; token wordt automatisch vernieuwd |
