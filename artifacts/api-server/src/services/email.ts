import { logger } from "../lib/logger";

const TENANT_ID = process.env.AZURE_TENANT_ID;
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const MAIL_FROM = process.env.MAIL_FROM ?? "noreply@fpsbrandpreventie.nl";

function isGeconfigureerd(): boolean {
  return !!(TENANT_ID && CLIENT_ID && CLIENT_SECRET);
}

async function haalAccessToken(): Promise<string> {
  const url = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    scope: "https://graph.microsoft.com/.default",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const tekst = await res.text();
    throw new Error(`Azure token fout (${res.status}): ${tekst}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function stuurUitnodigingsmail(opties: {
  naarEmail: string;
  naarNaam: string;
  activatieLink: string;
  isOpnieuw?: boolean;
}): Promise<boolean> {
  const { naarEmail, naarNaam, activatieLink, isOpnieuw = false } = opties;

  if (!isGeconfigureerd()) {
    logger.warn(
      { email: naarEmail },
      "E-mailservice niet geconfigureerd — uitnodiging niet verstuurd " +
        "(stel AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET en MAIL_FROM in)"
    );
    return false;
  }

  const onderwerp = isOpnieuw
    ? "Uw uitnodiging voor FPS Brandpreventie (herinnering)"
    : "U bent uitgenodigd voor FPS Brandpreventie";

  const htmlInhoud = `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${onderwerp}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0"
          style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.12);">
          <tr>
            <td style="background:#E8440F;padding:32px 40px;text-align:center;">
              <p style="margin:0;color:#ffffff;font-size:13px;letter-spacing:1px;text-transform:uppercase;font-weight:600;">
                FPS Brandpreventie
              </p>
              <p style="margin:8px 0 0;color:rgba(255,255,255,.8);font-size:12px;">
                Platform voor brandpreventieve gebouwvoorzieningen
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#18181b;">
                ${isOpnieuw ? "Herinnering:" : "Welkom,"} ${naarNaam}
              </h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">
                ${
                  isOpnieuw
                    ? "U heeft eerder een uitnodiging ontvangen voor het FPS Brandpreventie-platform. " +
                      "Gebruik onderstaande knop om uw account te activeren."
                    : "U bent uitgenodigd voor het FPS Brandpreventie-platform. " +
                      "Activeer hieronder uw account, stel uw wachtwoord in en koppel de authenticator-app."
                }
              </p>
              <p style="margin:0 0 32px;font-size:15px;line-height:1.6;color:#3f3f46;">
                De activatielink is <strong>7 dagen geldig</strong>.
              </p>
              <table cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
                <tr>
                  <td style="background:#E8440F;border-radius:6px;">
                    <a href="${activatieLink}"
                      style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:.3px;">
                      Account activeren
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;font-size:12px;color:#71717a;">
                Werkt de knop niet? Kopieer dan onderstaande link in uw browser:
              </p>
              <p style="margin:0;font-size:11px;color:#a1a1aa;word-break:break-all;">${activatieLink}</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f4f4f5;padding:24px 40px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#71717a;text-align:center;">
                Dit bericht is verstuurd door FPS Brandpreventie &bull;
                Niet aangevraagd? Neem contact op met uw beheerder.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const token = await haalAccessToken();
  const graphUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAIL_FROM)}/sendMail`;

  const bericht = {
    message: {
      subject: onderwerp,
      body: { contentType: "HTML", content: htmlInhoud },
      toRecipients: [{ emailAddress: { address: naarEmail, name: naarNaam } }],
      from: { emailAddress: { address: MAIL_FROM, name: "FPS Brandpreventie" } },
    },
    saveToSentItems: false,
  };

  const res = await fetch(graphUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bericht),
  });

  if (!res.ok) {
    const tekst = await res.text();
    throw new Error(`Graph API fout (${res.status}): ${tekst}`);
  }

  logger.info({ email: naarEmail, opnieuw: isOpnieuw }, "Uitnodigingsmail verstuurd");
  return true;
}
