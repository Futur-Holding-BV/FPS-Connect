const GRAPH_API_BASE_URL = (
  process.env.GRAPH_API_BASE_URL ?? "https://graph.microsoft.com/v1.0"
).replace(/\/+$/, "");
const WARNING_DAYS = Number(process.env.AZURE_SECRET_WARNING_DAYS ?? 30);
const NOW = process.env.AZURE_SECRET_CHECK_NOW
  ? new Date(process.env.AZURE_SECRET_CHECK_NOW)
  : new Date();
const DAY_MS = 24 * 60 * 60 * 1000;

function result(payload) {
  return {
    checkedAt: NOW.toISOString(),
    warningDays: WARNING_DAYS,
    ...payload,
  };
}

async function readJson(response) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { body, status: response.status };
}

async function graphRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });
  const { body, status } = await readJson(response);
  if (!response.ok) {
    const graphError = body?.error;
    const detail = graphError
      ? `${graphError.code ?? "onbekende fout"}: ${graphError.message ?? "geen omschrijving"}`
      : `HTTP ${status}`;
    throw new Error(`Microsoft Graph gaf ${detail}`);
  }
  return body;
}

function requiredEnvironment() {
  return ["AZURE_TENANT_ID", "AZURE_CLIENT_ID", "AZURE_CLIENT_SECRET"].filter(
    (name) => !process.env[name],
  );
}

async function getAccessToken() {
  const response = await fetch(
    process.env.AZURE_TOKEN_URL ??
      `https://login.microsoftonline.com/${encodeURIComponent(
        process.env.AZURE_TENANT_ID,
      )}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.AZURE_CLIENT_ID,
        client_secret: process.env.AZURE_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  const { body, status } = await readJson(response);
  if (!response.ok || !body.access_token) {
    const tokenError = body?.error;
    const detail = tokenError
      ? `${tokenError} ${body?.error_description ?? ""}`.trim()
      : `HTTP ${status}`;
    throw new Error(`Graph-token ophalen mislukt (${detail})`);
  }
  return body.access_token;
}

async function getApplication(token) {
  const url = new URL(`${GRAPH_API_BASE_URL}/applications`);
  url.searchParams.set(
    "$filter",
    `appId eq '${process.env.AZURE_CLIENT_ID}'`,
  );
  url.searchParams.set("$select", "id,appId,displayName");
  const body = await graphRequest(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const applications = Array.isArray(body.value) ? body.value : [];
  if (applications.length === 0) {
    throw new Error(
      "Geen Azure-applicatie gevonden voor AZURE_CLIENT_ID (controleer de client-ID en Application.Read.All).",
    );
  }
  if (applications.length > 1) {
    throw new Error(
      `Meerdere Azure-applicaties gevonden voor AZURE_CLIENT_ID (${applications.length}); controle afgebroken.`,
    );
  }
  return applications[0];
}

async function getAllPasswordCredentials(token, applicationId) {
  let nextUrl = `${GRAPH_API_BASE_URL}/applications/${encodeURIComponent(
    applicationId,
  )}/passwordCredentials`;
  const credentials = [];
  do {
    const body = await graphRequest(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (Array.isArray(body.value)) credentials.push(...body.value);
    nextUrl = body["@odata.nextLink"] ?? "";
  } while (nextUrl);
  return credentials;
}

async function check() {
  const missing = requiredEnvironment();
  if (missing.length > 0) {
    return result({
      ok: false,
      warning: false,
      message: `Ontbrekende Actions-secrets: ${missing.join(", ")}`,
    });
  }
  if (!Number.isFinite(WARNING_DAYS) || WARNING_DAYS < 0) {
    return result({
      ok: false,
      warning: false,
      message: "AZURE_SECRET_WARNING_DAYS moet een niet-negatief getal zijn.",
    });
  }
  if (Number.isNaN(NOW.getTime())) {
    return result({
      ok: false,
      warning: false,
      message: "AZURE_SECRET_CHECK_NOW is geen geldige datum.",
    });
  }

  let token;
  try {
    token = await getAccessToken();
  } catch (error) {
    return result({ ok: false, warning: false, message: error.message });
  }

  try {
    const application = await getApplication(token);
    const credentials = await getAllPasswordCredentials(token, application.id);
    if (credentials.length === 0) {
      return result({
        ok: false,
        warning: false,
        message: "De Azure-applicatie heeft geen passwordCredentials.",
      });
    }

    const invalid = credentials.filter(
      (credential) =>
        !credential.endDateTime ||
        Number.isNaN(new Date(credential.endDateTime).getTime()),
    );
    if (invalid.length > 0) {
      return result({
        ok: false,
        warning: false,
        message: `${invalid.length} Azure client-secret(s) hebben geen leesbare vervaldatum; controle afgebroken om geen vervaldatum te missen.`,
        credentialCount: credentials.length,
      });
    }

    const threshold = NOW.getTime() + WARNING_DAYS * DAY_MS;
    const expiring = credentials
      .map((credential) => {
        const endDate = new Date(credential.endDateTime);
        return {
          keyId: credential.keyId ?? null,
          displayName: credential.displayName || "(zonder naam)",
          endDateTime: endDate.toISOString(),
          daysLeft: Math.ceil((endDate.getTime() - NOW.getTime()) / DAY_MS),
        };
      })
      .filter((credential) => new Date(credential.endDateTime).getTime() <= threshold)
      .sort((left, right) => left.endDateTime.localeCompare(right.endDateTime));

    return result({
      ok: true,
      warning: expiring.length > 0,
      application: {
        id: application.id,
        appId: application.appId,
        displayName: application.displayName || "(zonder naam)",
      },
      credentialCount: credentials.length,
      expiring,
      message:
        expiring.length > 0
          ? `${expiring.length} van ${credentials.length} Azure client-secret(s) verloopt binnen ${WARNING_DAYS} dagen of is al verlopen.`
          : `Alle ${credentials.length} Azure client-secret(s) zijn nog langer dan ${WARNING_DAYS} dagen geldig.`,
    });
  } catch (error) {
    return result({ ok: false, warning: false, message: error.message });
  }
}

try {
  const checked = await check();
  console.log(JSON.stringify(checked));
  process.exitCode = checked.ok ? (checked.warning ? 10 : 0) : 1;
} catch (error) {
  console.log(
    JSON.stringify(
      result({
        ok: false,
        warning: false,
        message: error instanceof Error ? error.message : String(error),
      }),
    ),
  );
  process.exitCode = 1;
}