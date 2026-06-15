---
name: Mail via Microsoft 365 (Graph)
description: Hoe uitgaande mail is gekoppeld (afzender vs postbus), Azure-eisen, en de redactie-regel voor upstream foutteksten.
---

# Mailkoppeling Microsoft 365

Uitgaande mail loopt via Microsoft Graph met OAuth2 client-credentials (geen
gebruikerswachtwoorden). Drie Azure-secrets: `AZURE_TENANT_ID`,
`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`.

## Afzender vs postbus (non-obvious)
- `MAIL_FROM` = de ZICHTBARE afzender (noreply@fpsbrandpreventie.nl).
- `MAIL_MAILBOX` = de feitelijke gedeelde postbus waartegen Graph verzendt
  (app@fpsbrandpreventie.nl); de afzender is een **send-as alias** hiervan.
- Graph-aanroep is `/users/{MAIL_MAILBOX}/sendMail` met `from = MAIL_FROM`.
- **Eis aan Azure-kant:** app-permissie `Mail.Send` (application) met admin
  consent, EN send-as/alias zo ingericht dat de postbus namens `MAIL_FROM` mag
  verzenden. Anders weigert Graph de `from` (lijkt op een codebug maar is config).
- `MAIL_FROM`/`MAIL_MAILBOX` zijn niet-gevoelige adressen → shared env vars,
  geen secrets. De code heeft defaults gelijk aan bovenstaande adressen, dus de
  app werkt ook zonder de env vars; ze maken de config expliciet.

## Redactie van upstream foutteksten (security-regel)
Foutteksten van Graph/het token-endpoint worden opgeslagen (mail_logboek),
teruggegeven in API-responses en gelogd. **Laat third-party foutbodies nooit
ongefilterd in DB/logs/respons komen** — strip token/secret-achtige patronen
(JWT, `Bearer ...`, `client_secret=`/`access_token=` e.d.) eerst.
**Waarom:** harde projectregel "nooit secrets opslaan/loggen"; Microsoft echoot
normaliter geen geheimen, maar dit is een goedkope defensieve garantie.

## Foutcategorieen
token-endpoint 429 → rate_limit, 5xx → verzendfout, overig → token_verlopen;
Graph 429/throttle → rate_limit, 401 → token_verlopen, 404/mailbox-codes →
mailbox_onbereikbaar, rest → verzendfout. Niet-geconfigureerd geeft een aparte
categorie; `stuurUitnodigingsmail` houdt bewust het oude gedrag (false i.p.v.
throw) zodat een uitnodiging in dev ook zonder mailkoppeling aangemaakt wordt.

## Server-side testen zonder TOTP (diagnose-techniek)
De mail-endpoints staan achter requireAuth + bevoegdheden-matrix; een agent kan
niet inloggen (verplichte TOTP). Toch de ECHTE endpoints testen (en het
mail_logboek vullen): munt een bearer-token volgens het mobiele schema —
`base64url(JSON{uid,exp})` + HMAC-SHA256 met `SESSION_SECRET`, gescheiden door
een punt (zie lib/token.ts) — voor een hoofdbeheerder-uid, en curl via
`localhost:80/api/mail/...` met `Authorization: Bearer <token>`. Bearer-auth
slaat de sessie-cookie over, dus de Secure-cookie/HTTPS-eis geldt hier NIET
(localhost werkt). Hoofdbeheerder bypass't de matrix volledig. Token nooit naar
de chat/log printen.

## AADSTS-codes (config vs codebug)
`/mail/verbindingstest` mapt zowel foute credentials als een foute tenant op
`fout_categorie: token_verlopen`. De `detail` (geredigeerd) bevat de echte AADSTS:
- `AADSTS90002 Tenant '...' not found` = `AZURE_TENANT_ID` is fout (bestaat niet /
  verkeerde cloud / verkeerd veld gekopieerd, bv. app Object-ID i.p.v. Directory
  (tenant) ID). Login komt dan niet eens toe aan client-id/secret.
- Tenant-ID is een niet-geheime identifier (mag in detail staan); client_secret/
  tokens worden wél geredigeerd.

## Env-var/secret-collisie (gotcha)
Een sleutel als shared env var zetten EN dezelfde sleutel door de gebruiker als
secret laten aanleveren botst: `viewEnvVars` kan na een delete op nul uitkomen
(env var weg, secret niet aangemaakt). Voor niet-gevoelige config: zelf als env
var zetten en NIET ook als secret opvragen.
