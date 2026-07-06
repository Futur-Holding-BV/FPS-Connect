export interface AzureFeature {
  id: string;
  naam: string;
  module: string;
  beschrijving: string;
  vereistEnvVars: string[];
  aanwezig: boolean;
  fallbackActief: boolean;
  status: "actief" | "niet_actief" | "fallback";
  statusLabel: string;
  opmerking: string;
}

function heeftEnvVars(vars: string[]): boolean {
  return vars.every((v) => !!process.env[v]);
}

export function getAzureStatus(): AzureFeature[] {
  const tenantEnv = ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"];
  const graphActief = heeftEnvVars([...tenantEnv, "MAIL_MAILBOX"]);
  const mailViaGraph = process.env.MAIL_VIA_GRAPH === "true";

  return [
    {
      id: "graph-email",
      naam: "E-mail via Microsoft Graph",
      module: "Communicatie / E-mail",
      beschrijving: "Verzenden en ontvangen van e-mail via de gedeelde Microsoft 365-postbus.",
      vereistEnvVars: [...tenantEnv, "MAIL_MAILBOX"],
      aanwezig: graphActief,
      fallbackActief: !graphActief,
      status: graphActief && mailViaGraph ? "actief" : graphActief ? "fallback" : "niet_actief",
      statusLabel:
        graphActief && mailViaGraph
          ? "Actief"
          : graphActief
          ? "Geconfigureerd (MAIL_VIA_GRAPH niet ingesteld)"
          : "Niet actief",
      opmerking:
        graphActief && mailViaGraph
          ? "E-mail wordt via Microsoft Graph API verstuurd."
          : "Fallback: e-mail via SMTP of uitgeschakeld.",
    },
    {
      id: "azure-ad-sso",
      naam: "Azure AD Single Sign-On",
      module: "Authenticatie",
      beschrijving: "Inloggen met bedrijfsaccount via Azure Active Directory (SSO/SAML/OIDC).",
      vereistEnvVars: [...tenantEnv, "AZURE_AD_SSO_ENABLED"],
      aanwezig: false,
      fallbackActief: true,
      status: "niet_actief",
      statusLabel: "Niet actief",
      opmerking:
        "Gepland. Huidig systeem gebruikt eigen TOTP-authenticatie (express-session + otplib). " +
        "Activering vereist geen hercode — alleen configuratie-aanpassing.",
    },
    {
      id: "teams-integratie",
      naam: "Microsoft Teams-integratie",
      module: "Communicatie / Notificaties",
      beschrijving: "Meldingen en berichten via Microsoft Teams-kanalen en -chats.",
      vereistEnvVars: [...tenantEnv, "TEAMS_WEBHOOK_URL"],
      aanwezig: heeftEnvVars(["TEAMS_WEBHOOK_URL"]),
      fallbackActief: true,
      status: "niet_actief",
      statusLabel: "Niet actief",
      opmerking: "Gepland. Intern chat-systeem (5s polling) is de huidige fallback.",
    },
    {
      id: "sharepoint",
      naam: "SharePoint Document Sync",
      module: "Documenten (DMS)",
      beschrijving: "Synchronisatie van documenten met SharePoint bibliotheek.",
      vereistEnvVars: [...tenantEnv, "SHAREPOINT_SITE_URL"],
      aanwezig: false,
      fallbackActief: true,
      status: "niet_actief",
      statusLabel: "Niet actief",
      opmerking: "Gepland. DMS werkt volledig intern met GCS object-opslag.",
    },
    {
      id: "azure-storage",
      naam: "Azure Blob Storage",
      module: "Opslag",
      beschrijving: "Opslaan van bestanden en documenten in Azure Blob Storage.",
      vereistEnvVars: ["AZURE_STORAGE_CONNECTION_STRING"],
      aanwezig: heeftEnvVars(["AZURE_STORAGE_CONNECTION_STRING"]),
      fallbackActief: true,
      status: "niet_actief",
      statusLabel: "Niet actief",
      opmerking: "Niet actief. Google Cloud Storage (GCS) is de huidige primaire opslag.",
    },
    {
      id: "azure-monitor",
      naam: "Azure Monitor / Application Insights",
      module: "Monitoring / Observability",
      beschrijving: "Centrale monitoring, performance-inzichten en foutmelding via Azure Monitor.",
      vereistEnvVars: ["APPLICATIONINSIGHTS_CONNECTION_STRING"],
      aanwezig: heeftEnvVars(["APPLICATIONINSIGHTS_CONNECTION_STRING"]),
      fallbackActief: true,
      status: "niet_actief",
      statusLabel: "Niet actief",
      opmerking: "Niet actief. Pino-logging en lokale auditslagen zijn de huidige observability-laag.",
    },
  ];
}

export function getAzureOverzicht(): {
  totaal: number;
  actief: number;
  fallback: number;
  niet_actief: number;
  features: AzureFeature[];
} {
  const features = getAzureStatus();
  return {
    totaal: features.length,
    actief: features.filter((f) => f.status === "actief").length,
    fallback: features.filter((f) => f.status === "fallback").length,
    niet_actief: features.filter((f) => f.status === "niet_actief").length,
    features,
  };
}
