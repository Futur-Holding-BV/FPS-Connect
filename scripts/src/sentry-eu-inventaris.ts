/**
 * Alleen-lezen inventaris van de Sentry-organisatie futur-holding.
 *
 * Dit script gebruikt bewust niet de Replit Sentry-connector: die connector
 * kan geen regionale API-host instellen, terwijl deze organisatie in de
 * Sentry DE/EU-opslagregio staat.
 */

export const SENTRY_API_BASIS_URL = "https://de.sentry.io/api/0" as const;
export const SENTRY_API_METHODE = "GET" as const;
export const SENTRY_VEREISTE_LEESRECHTEN = [
  "org:read",
  "project:read",
  "event:read",
] as const;

const ORGANISATIE = "futur-holding";
const BESCHERMD_PROJECT = "fps-connect-api";
const TOKEN_SECRET = "SENTRY_AUTH_TOKEN";

interface SentryOrganisatie {
  id: string;
  slug: string;
  name: string;
}

interface SentryTeam {
  id: string;
  slug: string;
  name: string;
}

interface SentryProject {
  id: string;
  slug: string;
  name: string;
  platform?: string | null;
  team?: { slug?: string | null } | null;
}

interface SentryIssue {
  level?: string | null;
}

function leesToken(): string {
  const token = process.env[TOKEN_SECRET]?.trim();
  if (!token) {
    throw new Error(`${TOKEN_SECRET} ontbreekt; het token hoort alleen in Replit Secrets.`);
  }
  if (/^(?:Bearer\s+|SENTRY_AUTH_TOKEN\s*=)/i.test(token)) {
    throw new Error(
      `${TOKEN_SECRET} moet uitsluitend de tokenwaarde bevatten, zonder Bearer of variabelenaam.`,
    );
  }
  return token;
}

function maakUrl(relatiefPad: string): URL {
  if (
    relatiefPad.startsWith("/") ||
    relatiefPad.includes("..") ||
    relatiefPad.includes("://")
  ) {
    throw new Error(`Ongeldig Sentry-pad: ${relatiefPad}`);
  }
  const url = new URL(relatiefPad, `${SENTRY_API_BASIS_URL}/`);
  if (
    url.origin !== "https://de.sentry.io" ||
    !url.pathname.startsWith("/api/0/")
  ) {
    throw new Error(`Sentry-aanroep valt buiten de vaste EU-API-grens: ${url.href}`);
  }
  return url;
}

async function leesFoutDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    return typeof body.detail === "string" ? body.detail : "onbekende Sentry-fout";
  } catch {
    return "onleesbare Sentry-fout";
  }
}

async function sentryGet<T>(relatiefPad: string, token: string): Promise<T> {
  const url = maakUrl(relatiefPad);
  const response = await fetch(url, {
    method: SENTRY_API_METHODE,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    redirect: "manual",
  });

  console.log(
    `[sentry-eu] ${SENTRY_API_METHODE} ${url.origin}${url.pathname}${url.search} -> ${response.status}`,
  );

  if (!response.ok) {
    const detail = await leesFoutDetail(response);
    if (response.status === 401) {
      throw new Error(
        `${url.pathname} gaf 401 (${detail}). Verwacht wordt een User Auth Token uit de DE/EU-Sentryomgeving.`,
      );
    }
    throw new Error(`${url.pathname} gaf ${response.status} (${detail}).`);
  }

  return (await response.json()) as T;
}

function telIssuesPerNiveau(issues: SentryIssue[]): Record<string, number> {
  return issues.reduce<Record<string, number>>((totalen, issue) => {
    const niveau = issue.level || "onbekend";
    totalen[niveau] = (totalen[niveau] || 0) + 1;
    return totalen;
  }, {});
}

async function main(): Promise<void> {
  const token = leesToken();
  console.log(
    `[sentry-eu] basis=${SENTRY_API_BASIS_URL}; methode=${SENTRY_API_METHODE}; token=secret:${TOKEN_SECRET}; vereiste_rechten=${SENTRY_VEREISTE_LEESRECHTEN.join(",")}`,
  );

  const organisaties = await sentryGet<SentryOrganisatie[]>(
    "organizations/",
    token,
  );
  const organisatie = organisaties.find((item) => item.slug === ORGANISATIE);
  if (!organisatie) {
    throw new Error(`Organisatie ${ORGANISATIE} is niet zichtbaar voor dit User Auth Token.`);
  }
  console.log(
    `[sentry-eu] organisatie=${organisatie.slug}; id=${organisatie.id}; naam=${organisatie.name}`,
  );

  const [projecten, teams] = await Promise.all([
    sentryGet<SentryProject[]>(
      `organizations/${encodeURIComponent(ORGANISATIE)}/projects/`,
      token,
    ),
    sentryGet<SentryTeam[]>(
      `organizations/${encodeURIComponent(ORGANISATIE)}/teams/`,
      token,
    ),
  ]);

  const leesbareProjecten = projecten.filter(
    (project) => project.slug !== BESCHERMD_PROJECT,
  );
  console.log(
    JSON.stringify({
      teams: teams.map((team) => ({
        id: team.id,
        slug: team.slug,
        name: team.name,
      })),
      projecten: leesbareProjecten.map((project) => ({
        id: project.id,
        slug: project.slug,
        name: project.name,
        platform: project.platform || null,
        team: project.team?.slug || null,
      })),
      beschermd_project_overgeslagen: projecten.some(
        (project) => project.slug === BESCHERMD_PROJECT,
      )
        ? BESCHERMD_PROJECT
        : null,
    }),
  );

  for (const project of leesbareProjecten) {
    const query = new URLSearchParams({
      project: project.id,
      query: "is:unresolved",
      statsPeriod: "14d",
      limit: "100",
    });
    const issues = await sentryGet<SentryIssue[]>(
      `organizations/${encodeURIComponent(ORGANISATIE)}/issues/?${query.toString()}`,
      token,
    );
    console.log(
      JSON.stringify({
        project: project.slug,
        onopgeloste_issues_laatste_14_dagen: issues.length,
        per_niveau: telIssuesPerNiveau(issues),
      }),
    );
  }
}

void main().catch((fout: unknown) => {
  console.error(
    `[sentry-eu] inventaris mislukt: ${fout instanceof Error ? fout.message : "onbekende fout"}`,
  );
  process.exitCode = 1;
});