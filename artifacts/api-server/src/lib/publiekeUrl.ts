/**
 * Publieke basis-URL van de app voor uitgaande links (e-mails, notificaties).
 *
 * Volgorde:
 * 1. PUBLIEKE_APP_URL — expliciet gezet (productie: https://connect.fps-one.nl,
 *    zie deploy/docker-compose.production.yml).
 * 2. REPLIT_DOMAINS / REPLIT_DEV_DOMAIN — de Replit-ontwikkelomgeving.
 * 3. null — de aanroeper laat de link dan weg in plaats van een kapotte URL
 *    te versturen.
 *
 * Nooit een dev-domein in productiemail: dev-domeinen zijn tijdelijk en
 * horen niet bij klanten of medewerkers in de inbox te belanden.
 */
export function publiekeAppUrl(): string | null {
  const expliciet = process.env["PUBLIEKE_APP_URL"]?.trim();
  if (expliciet) return expliciet.replace(/\/+$/, "");
  const replitDomein =
    (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim() ||
    process.env["REPLIT_DEV_DOMAIN"]?.trim();
  if (replitDomein) return `https://${replitDomein}`;
  return null;
}
