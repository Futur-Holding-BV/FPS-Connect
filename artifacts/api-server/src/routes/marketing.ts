// MARKETING_01 — doelgroepen, sjablonen en campagnes.
//
// Rechten (akkoord René 17-08-2026): eigen module "marketing" in de matrix.
//   - marketing niveau 3 = marketing beheren (doelgroepen, sjablonen,
//     campagnes opstellen, proefverzending naar jezelf) — preset Commercieel.
//   - marketing niveau 4 = een campagne écht verzenden naar een doelgroep
//     (en stoppen) — preset Directie.
// Toestemming-beheer op contactpersonen blijft onder crm (niveau 2).
//
// Toestemming is een harde serverpoort (marketingService): wie geen
// toestemming heeft valt uit élke doelgroep en verzending, niet omzeilbaar.
// Verzenden loopt over de bestaande mailwachtrij (fail-closed). Na de
// éénmalige goedkeuring (POST /campagnes/:id/verzenden) verstuurt de
// gedoseerde verzender (campagneVerzender.ts) de items gespreid — n per
// minuut, instelbaar — nooit als één stoot.
import { Router } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import {
  marketingDoelgroepenTable,
  marketingSjablonenTable,
  marketingCampagnesTable,
  marketingCampagneOntvangersTable,
  mailWachtrijTable,
  gebruikersTable,
  werkgeversTable,
  crmContactpersonenTable,
  appInstellingenTable,
  type DoelgroepCriteria,
} from "@workspace/db";
import { eq, and, desc, count, inArray } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { verstuurMail } from "../services/email";
import {
  berekenDoelgroepLeden,
  telDoelgroepLeden,
  vulSjabloonVelden,
  verwerkAfmelding,
  annuleerWachtendeCampagneMails,
  rondCampagneAfIndienKlaar,
  ruimGestopteCampagneOp,
} from "../services/marketingService";
import { haalCampagneVerzendtempo, TEMPO_MIN, TEMPO_MAX } from "../services/campagneVerzender";
import { publiekeAppUrl } from "../lib/publiekeUrl";
import { logger } from "../lib/logger";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { resolveWerkgeverLogoSubPath, LOGO_TOEGESTANE_EXTENSIES } from "../lib/werkgever-logo-pad";
import { Readable } from "stream";

const objectStorageService = new ObjectStorageService();

// ─── Werkgever-branding ───────────────────────────────────────────────────────

type MailBranding = {
  kleur: string;       // CSS hex, bijv. "#F23B0D"
  logoUrl: string | null;
  naam: string;        // werkgevernaam voor footer-tekst
};

const FPS_FALLBACK: MailBranding = {
  kleur: "#F23B0D",
  logoUrl: null,
  naam: "FPS",
};

/**
 * Goedgekeurde afbeeldingsextensies voor werkgever-logo's — afgeleid van de
 * canonieke lijst in werkgever-logo-pad.ts zodat beide altijd synchroon zijn.
 */
const LOGO_TOEGESTANE_EXTS: Set<string> = new Set(LOGO_TOEGESTANE_EXTENSIES);

/**
 * Controleert of een genormaliseerd subPath de exacte canonieke sleutel is van
 * een logo dat toebehoort aan de opgegeven werkgever:
 *   werkgevers/<werkgeverId>/logo.<goedgekeurde-ext>
 *
 * Geeft false voor:
 * - Elk ander werkgever-ID in het pad (mismatch).
 * - Subdirectories of traversal-segmenten.
 * - Niet-afbeelding extensies.
 * - Legacy objects/algemeen/-paden (die worden al door resolveWerkgeverLogoSubPath geblokkeerd).
 */
function isKanoniekeWerkgeversLogoSleutel(subPath: string, werkgeverId: number): boolean {
  // Verwacht patroon: werkgevers/<werkgeverId>/logo.<ext>
  const verwacht = `werkgevers/${werkgeverId}/`;
  if (!subPath.startsWith(verwacht)) return false;
  const rest = subPath.slice(verwacht.length);
  // Geen extra schuine strepen (geen subdirectories of traversal).
  if (rest.includes("/")) return false;
  // Bestandsnaam moet beginnen met "logo" + goedgekeurde extensie.
  const punt = rest.lastIndexOf(".");
  if (punt < 0) return false;
  const ext = rest.slice(punt).toLowerCase();
  return rest.slice(0, punt) === "logo" && LOGO_TOEGESTANE_EXTS.has(ext);
}

/** HTML-entities escapen zodat onveilige waarden niet als markup worden geïnterpreteerd. */
function escHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Alleen geldige CSS hex-kleuren doorlaten; alles anders valt terug op FPS-oranje. */
function saniteerKleur(kleur: string | null | undefined): string {
  if (!kleur) return "#F23B0D";
  return /^#[0-9a-fA-F]{3,6}$/.test(kleur.trim()) ? kleur.trim() : "#F23B0D";
}

/**
 * Logo-URL geschikt maken voor gebruik in e-mailclients.
 * - Absolute http(s)-URL's worden direct doorgelaten.
 * - Relatieve paden (bijv. /api/storage/objects/...) worden omgezet naar
 *   absolute URL's via publiekeAppUrl(). E-mailclients kunnen geen relatieve
 *   paden ophalen; de publieke basis-URL is nodig.
 * - data:-URL's en javascript:-URL's worden geblokkeerd.
 */
function saniteerLogoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = url.trim();
  // Relatief pad → omzetten naar absolute URL
  if (u.startsWith("/")) {
    const basis = publiekeAppUrl();
    if (!basis) return null; // geen publieke URL beschikbaar → logo weglaten
    return `${basis}${u}`;
  }
  // Absolute URL → alleen http(s) toestaan
  try {
    const parsed = new URL(u);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") return u;
  } catch {
    // ongeldige URL
  }
  return null;
}

async function haalWerkgeverBranding(werkgeverId: number | null | undefined): Promise<MailBranding> {
  if (!werkgeverId) return FPS_FALLBACK;
  const [w] = await db
    .select({ primaireKleur: werkgeversTable.primaireKleur, logoUrl: werkgeversTable.logoUrl, naam: werkgeversTable.naam })
    .from(werkgeversTable)
    .where(eq(werkgeversTable.id, werkgeverId))
    .limit(1);
  if (!w) return FPS_FALLBACK;

  // Logo wordt geserveerd via de beperkte publieke proxy-route zodat e-mailclients
  // het kunnen ophalen zonder sessie/auth.
  //
  // Beveiligingseis: de proxy-URL wordt ALLEEN gezet als het opgeslagen logo-pad
  // exact voldoet aan de canonieke sleutel `werkgevers/<id>/logo.<ext>` én de <id>
  // overeenkomt met de werkgever. Zo kunnen legacy-paden (objects/algemeen/...),
  // externe URLs en paden van andere werkgevers nooit via de publieke route lekken.
  let logoPubliekUrl: string | null = null;
  if (w.logoUrl) {
    const subPath = resolveWerkgeverLogoSubPath(w.logoUrl.trim());
    if (subPath && isKanoniekeWerkgeversLogoSleutel(subPath, werkgeverId)) {
      const basis = publiekeAppUrl();
      if (basis) logoPubliekUrl = `${basis}/api/marketing/werkgever-logo/${werkgeverId}`;
    }
  }

  return {
    kleur: saniteerKleur(w.primaireKleur),
    logoUrl: logoPubliekUrl,
    naam: w.naam,
  };
}

const router = Router();
const lezen = requireBevoegdheid("marketing", 1);
const beheren = requireBevoegdheid("marketing", 3);
const verzenden = requireBevoegdheid("marketing", 4);

/**
 * GET /marketing/werkgever-opties
 *
 * Minimale werkgeverlijst voor campagne-branding: alleen id + naam.
 * Vereist marketing:1 (geen personeel-recht) zodat Commercieel-gebruikers
 * de werkmaatschappijkiezer in campagnes kunnen gebruiken.
 * Geen gevoelige HR-data — uitsluitend de naam om een campagne aan te koppelen.
 */
router.get("/marketing/werkgever-opties", lezen, async (_req, res) => {
  const rijen = await db
    .select({ id: werkgeversTable.id, naam: werkgeversTable.naam })
    .from(werkgeversTable)
    .orderBy(werkgeversTable.naam);
  return res.json(rijen);
});

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function parseCriteria(v: unknown): DoelgroepCriteria {
  if (!v || typeof v !== "object") return {};
  const o = v as Record<string, unknown>;
  const lijst = (x: unknown) =>
    Array.isArray(x) ? x.map(String).filter((s) => s.trim() !== "") : undefined;
  return {
    branche: lijst(o["branche"]),
    stad: lijst(o["stad"]),
    relatieStatus: lijst(o["relatie_status"]),
    klantStatus: lijst(o["klant_status"]),
    orgType: lijst(o["org_type"]),
    laatsteContactVoor:
      typeof o["laatste_contact_voor"] === "string" && o["laatste_contact_voor"].trim() !== ""
        ? o["laatste_contact_voor"]
        : undefined,
  };
}

const criteriaUit = (c: DoelgroepCriteria) => ({
  branche: c.branche ?? [],
  stad: c.stad ?? [],
  relatie_status: c.relatieStatus ?? [],
  klant_status: c.klantStatus ?? [],
  org_type: c.orgType ?? [],
  laatste_contact_voor: c.laatsteContactVoor ?? null,
});

// Huisstijl-mailwrapper voor campagnemails, altijd mét werkende afmeldlink.
// Branding (kleur, logo, naam) komt uit de werkgevers-tabel; fallback = FPS-stijl.
// Alle dynamische waarden worden HTML-ge-escaped; kleur en logo-URL zijn
// server-side al gevalideerd via saniteerKleur / saniteerLogoUrl.
function campagneMailHtml(opties: {
  inhoudHtml: string;
  afmeldUrl: string;
  branding: MailBranding;
}): string {
  const { kleur, logoUrl, naam } = opties.branding;
  const veiligNaam = escHtml(naam);
  const veiligLogoUrl = logoUrl ? escHtml(logoUrl) : null;
  const veiligAfmeldUrl = escHtml(opties.afmeldUrl);
  const logoBlok = veiligLogoUrl
    ? `<tr><td style="padding:24px 40px 0;"><img src="${veiligLogoUrl}" alt="${veiligNaam}" style="max-height:48px;max-width:160px;object-fit:contain;" /></td></tr>`
    : "";
  return `
<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:${kleur};height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
        ${logoBlok}
        <tr><td style="padding:32px 40px;">
          <div style="font-size:15px;line-height:1.6;color:#3f3f46;">${opties.inhoudHtml}</div>
        </td></tr>
        <tr><td style="padding:16px 40px 28px;border-top:1px solid #e4e4e7;">
          <p style="margin:0;font-size:12px;color:#a1a1aa;">
            U ontvangt dit bericht omdat u toestemming gaf voor commerciële mail van ${veiligNaam}.
            <a href="${veiligAfmeldUrl}" style="color:#71717a;">Afmelden</a> kan altijd, zonder inloggen.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function tekstNaarHtml(tekst: string): string {
  const esc = tekst
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;">${p.replaceAll("\n", "<br/>")}</p>`)
    .join("");
}

// ─── Toestemming vastleggen (CRM-schrijfrecht, crm 2) ───────────────────────
// Toestemming/intrekking is regulier relatiebeheer; afmelding via de
// afmeldlink kan hier bewust NIET ongedaan worden gemaakt zonder nieuwe
// expliciete toestemming (bron verplicht).

router.patch(
  "/marketing/contactpersonen/:id/toestemming",
  requireBevoegdheid("crm", 2),
  async (req, res) => {
    const id = parseInt(String(req.params["id"]), 10);
    const toestemming = req.body?.toestemming;
    if (typeof toestemming !== "boolean") {
      return res.status(422).json({ fout: "toestemming (true/false) is verplicht" });
    }
    const nu = new Date();
    if (toestemming) {
      const bron = String(req.body?.bron ?? "").trim();
      if (!bron) {
        return res.status(422).json({ fout: "Bij toestemming is de bron verplicht (waar berust de toestemming op?)" });
      }
      const [rij] = await db
        .update(crmContactpersonenTable)
        .set({
          mailToestemming: true,
          mailToestemmingOp: nu,
          mailToestemmingBron: bron,
          mailAfgemeldOp: null,
          bijgewerktOp: nu,
        })
        .where(eq(crmContactpersonenTable.id, id))
        .returning();
      if (!rij) return res.status(404).json({ fout: "Contactpersoon niet gevonden" });
    } else {
      const [rij] = await db
        .update(crmContactpersonenTable)
        .set({ mailToestemming: false, bijgewerktOp: nu })
        .where(eq(crmContactpersonenTable.id, id))
        .returning();
      if (!rij) return res.status(404).json({ fout: "Contactpersoon niet gevonden" });
      // Intrekken geldt per direct: nog wachtende campagnemails vervallen.
      await annuleerWachtendeCampagneMails(id, "toestemming ingetrokken");
    }
    return res.json({ ok: true });
  },
);

// ─── Doelgroepen ─────────────────────────────────────────────────────────────

router.get("/marketing/doelgroepen", beheren, async (_req, res) => {
  const rijen = await db
    .select()
    .from(marketingDoelgroepenTable)
    .orderBy(desc(marketingDoelgroepenTable.aangemaaktOp));
  const uit = [];
  for (const d of rijen) {
    const aantal = await telDoelgroepLeden(d.criteria as DoelgroepCriteria);
    uit.push({
      id: d.id,
      naam: d.naam,
      omschrijving: d.omschrijving,
      criteria: criteriaUit(d.criteria as DoelgroepCriteria),
      aantal_leden: aantal,
      aangemaakt_op: iso(d.aangemaaktOp),
      bijgewerkt_op: iso(d.bijgewerktOp),
    });
  }
  return res.json(uit);
});

router.post("/marketing/doelgroepen/voorbeeld", beheren, async (req, res) => {
  const criteria = parseCriteria(req.body?.criteria ?? req.body);
  const aantal = await telDoelgroepLeden(criteria);
  return res.json({ aantal_leden: aantal });
});

router.post("/marketing/doelgroepen", beheren, async (req, res) => {
  const naam = String(req.body?.naam ?? "").trim();
  if (!naam) return res.status(422).json({ fout: "Naam is verplicht" });
  const criteria = parseCriteria(req.body?.criteria);
  const [rij] = await db
    .insert(marketingDoelgroepenTable)
    .values({
      naam,
      omschrijving: req.body?.omschrijving ? String(req.body.omschrijving) : null,
      criteria,
      aangemaaktDoorId: req.session.userId ?? null,
    })
    .returning();
  return res.status(201).json({ id: rij!.id });
});

router.patch("/marketing/doelgroepen/:id", beheren, async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  const wijziging: Record<string, unknown> = { bijgewerktOp: new Date() };
  if (req.body?.naam !== undefined) {
    const naam = String(req.body.naam).trim();
    if (!naam) return res.status(422).json({ fout: "Naam is verplicht" });
    wijziging["naam"] = naam;
  }
  if (req.body?.omschrijving !== undefined) wijziging["omschrijving"] = req.body.omschrijving ? String(req.body.omschrijving) : null;
  if (req.body?.criteria !== undefined) wijziging["criteria"] = parseCriteria(req.body.criteria);
  const [rij] = await db
    .update(marketingDoelgroepenTable)
    .set(wijziging)
    .where(eq(marketingDoelgroepenTable.id, id))
    .returning();
  if (!rij) return res.status(404).json({ fout: "Doelgroep niet gevonden" });
  return res.json({ ok: true });
});

router.delete("/marketing/doelgroepen/:id", beheren, async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  const [rij] = await db.delete(marketingDoelgroepenTable).where(eq(marketingDoelgroepenTable.id, id)).returning();
  if (!rij) return res.status(404).json({ fout: "Doelgroep niet gevonden" });
  return res.json({ ok: true });
});

router.get("/marketing/doelgroepen/:id/leden", beheren, async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  const [d] = await db.select().from(marketingDoelgroepenTable).where(eq(marketingDoelgroepenTable.id, id)).limit(1);
  if (!d) return res.status(404).json({ fout: "Doelgroep niet gevonden" });
  const leden = await berekenDoelgroepLeden(d.criteria as DoelgroepCriteria);
  return res.json(
    leden.map((l) => ({
      contactpersoon_id: l.contactpersoonId,
      naam: l.naam,
      email: l.email,
      klant_id: l.klantId,
      organisatie: l.organisatie,
    })),
  );
});

// ─── Sjablonen ───────────────────────────────────────────────────────────────

router.get("/marketing/sjablonen", beheren, async (_req, res) => {
  const rijen = await db.select().from(marketingSjablonenTable).orderBy(desc(marketingSjablonenTable.aangemaaktOp));
  return res.json(
    rijen.map((s) => ({
      id: s.id,
      naam: s.naam,
      onderwerp: s.onderwerp,
      inhoud: s.inhoud,
      aangemaakt_op: iso(s.aangemaaktOp),
      bijgewerkt_op: iso(s.bijgewerktOp),
    })),
  );
});

router.post("/marketing/sjablonen", beheren, async (req, res) => {
  const naam = String(req.body?.naam ?? "").trim();
  const onderwerp = String(req.body?.onderwerp ?? "").trim();
  const inhoud = String(req.body?.inhoud ?? "").trim();
  if (!naam || !onderwerp || !inhoud) {
    return res.status(422).json({ fout: "Naam, onderwerp en inhoud zijn verplicht" });
  }
  const [rij] = await db
    .insert(marketingSjablonenTable)
    .values({ naam, onderwerp, inhoud, aangemaaktDoorId: req.session.userId ?? null })
    .returning();
  return res.status(201).json({ id: rij!.id });
});

router.patch("/marketing/sjablonen/:id", beheren, async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  const wijziging: Record<string, unknown> = { bijgewerktOp: new Date() };
  for (const veld of ["naam", "onderwerp", "inhoud"] as const) {
    if (req.body?.[veld] !== undefined) {
      const w = String(req.body[veld]).trim();
      if (!w) return res.status(422).json({ fout: `${veld} mag niet leeg zijn` });
      wijziging[veld] = w;
    }
  }
  const [rij] = await db.update(marketingSjablonenTable).set(wijziging).where(eq(marketingSjablonenTable.id, id)).returning();
  if (!rij) return res.status(404).json({ fout: "Sjabloon niet gevonden" });
  return res.json({ ok: true });
});

router.delete("/marketing/sjablonen/:id", beheren, async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  const [rij] = await db.delete(marketingSjablonenTable).where(eq(marketingSjablonenTable.id, id)).returning();
  if (!rij) return res.status(404).json({ fout: "Sjabloon niet gevonden" });
  return res.json({ ok: true });
});

// ─── Verzendtempo (gedoseerde verzender) ─────────────────────────────────────
// Mails per minuut voor de automatische, gespreide verzending van
// goedgekeurde campagnemails. Lezen mag met beheren (marketing 3), wijzigen alleen
// met verzenden (marketing 4) — het tempo raakt de daadwerkelijke verzending.

router.get("/marketing/verzendtempo", beheren, async (_req, res) => {
  return res.json({ tempo_per_minuut: await haalCampagneVerzendtempo() });
});

router.patch("/marketing/verzendtempo", verzenden, async (req, res) => {
  const ruw = Number(req.body?.tempo_per_minuut);
  if (!Number.isInteger(ruw) || ruw < TEMPO_MIN || ruw > TEMPO_MAX) {
    return res.status(422).json({ fout: `tempo_per_minuut moet een geheel getal zijn tussen ${TEMPO_MIN} en ${TEMPO_MAX}` });
  }
  const [instelling] = await db
    .select({ id: appInstellingenTable.id })
    .from(appInstellingenTable)
    .orderBy(appInstellingenTable.id)
    .limit(1);
  if (instelling) {
    await db
      .update(appInstellingenTable)
      .set({ campagneVerzendtempoPerMinuut: ruw, bijgewerktOp: new Date(), bijgewerktDoorId: req.session.userId ?? null })
      .where(eq(appInstellingenTable.id, instelling.id));
  } else {
    await db.insert(appInstellingenTable).values({ campagneVerzendtempoPerMinuut: ruw, bijgewerktDoorId: req.session.userId ?? null });
  }
  logger.info({ tempo: ruw, doorId: req.session.userId }, "Campagne-verzendtempo gewijzigd");
  return res.json({ ok: true, tempo_per_minuut: ruw });
});

// ─── Campagnes ───────────────────────────────────────────────────────────────

const mapCampagne = (c: typeof marketingCampagnesTable.$inferSelect) => ({
  id: c.id,
  naam: c.naam,
  doel: c.doel,
  werkgever_id: c.werkgeverId,
  doelgroep_id: c.doelgroepId,
  sjabloon_id: c.sjabloonId,
  status: c.status,
  gepland_op: iso(c.geplandOp),
  proef_verzonden_op: iso(c.proefVerzondenOp),
  gestart_op: iso(c.gestartOp),
  afgerond_op: iso(c.afgerondOp),
  gestopt_op: iso(c.gestoptOp),
  gestopt_reden: c.gestoptReden,
  aangemaakt_op: iso(c.aangemaaktOp),
  bijgewerkt_op: iso(c.bijgewerktOp),
});

router.get("/marketing/campagnes", beheren, async (_req, res) => {
  const rijen = await db.select().from(marketingCampagnesTable).orderBy(desc(marketingCampagnesTable.aangemaaktOp));
  return res.json(rijen.map(mapCampagne));
});

router.get("/marketing/campagnes/:id", beheren, async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  const [c] = await db.select().from(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, id)).limit(1);
  if (!c) return res.status(404).json({ fout: "Campagne niet gevonden" });
  const tellingen = await db
    .select({ status: marketingCampagneOntvangersTable.status, aantal: count() })
    .from(marketingCampagneOntvangersTable)
    .where(eq(marketingCampagneOntvangersTable.campagneId, id))
    .groupBy(marketingCampagneOntvangersTable.status);
  const stats: Record<string, number> = {};
  for (const t of tellingen) stats[t.status] = t.aantal;
  return res.json({ ...mapCampagne(c), ontvangers: stats });
});

router.post("/marketing/campagnes", beheren, async (req, res) => {
  const naam = String(req.body?.naam ?? "").trim();
  if (!naam) return res.status(422).json({ fout: "Naam is verplicht" });

  // werkgever_id is verplicht zodat elke campagne direct huisstijl draagt.
  const werkgeverId = req.body?.werkgever_id ? parseInt(String(req.body.werkgever_id), 10) : NaN;
  if (!Number.isInteger(werkgeverId) || werkgeverId <= 0) {
    return res.status(422).json({ fout: "Werkgever is verplicht" });
  }
  const [wg] = await db.select({ id: werkgeversTable.id }).from(werkgeversTable).where(eq(werkgeversTable.id, werkgeverId)).limit(1);
  if (!wg) return res.status(422).json({ fout: "Onbekende werkgever" });

  const [rij] = await db
    .insert(marketingCampagnesTable)
    .values({
      naam,
      doel: req.body?.doel ? String(req.body.doel) : null,
      werkgeverId,
      doelgroepId: req.body?.doelgroep_id ? parseInt(String(req.body.doelgroep_id), 10) : null,
      sjabloonId: req.body?.sjabloon_id ? parseInt(String(req.body.sjabloon_id), 10) : null,
      geplandOp: req.body?.gepland_op ? new Date(String(req.body.gepland_op)) : null,
      aangemaaktDoorId: req.session.userId ?? null,
    })
    .returning();
  return res.status(201).json({ id: rij!.id });
});

router.patch("/marketing/campagnes/:id", beheren, async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  const [c] = await db.select().from(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, id)).limit(1);
  if (!c) return res.status(404).json({ fout: "Campagne niet gevonden" });
  if (c.status !== "concept" && c.status !== "gepland") {
    return res.status(409).json({ fout: `Campagne met status '${c.status}' kan niet meer worden gewijzigd` });
  }
  const wijziging: Record<string, unknown> = { bijgewerktOp: new Date() };
  if (req.body?.naam !== undefined) {
    const naam = String(req.body.naam).trim();
    if (!naam) return res.status(422).json({ fout: "Naam is verplicht" });
    wijziging["naam"] = naam;
  }
  if (req.body?.doel !== undefined) wijziging["doel"] = req.body.doel ? String(req.body.doel) : null;
  if (req.body?.werkgever_id !== undefined) {
    // Ontkoppelen (null) is verboden — elke campagne moet altijd een werkgever dragen.
    const wgId = req.body.werkgever_id ? parseInt(String(req.body.werkgever_id), 10) : NaN;
    if (!Number.isInteger(wgId) || wgId <= 0) {
      return res.status(422).json({ fout: "Werkgever is verplicht en kan niet worden ontkoppeld" });
    }
    const [wg] = await db.select({ id: werkgeversTable.id }).from(werkgeversTable).where(eq(werkgeversTable.id, wgId)).limit(1);
    if (!wg) return res.status(422).json({ fout: "Onbekende werkgever" });
    wijziging["werkgeverId"] = wgId;
  }
  if (req.body?.doelgroep_id !== undefined) wijziging["doelgroepId"] = req.body.doelgroep_id ? parseInt(String(req.body.doelgroep_id), 10) : null;
  if (req.body?.sjabloon_id !== undefined) wijziging["sjabloonId"] = req.body.sjabloon_id ? parseInt(String(req.body.sjabloon_id), 10) : null;
  if (req.body?.gepland_op !== undefined) wijziging["geplandOp"] = req.body.gepland_op ? new Date(String(req.body.gepland_op)) : null;
  // Atomaire update: voeg dezelfde statusvoorwaarde toe aan de WHERE zodat
  // een gelijktijdige statusovergang (bv. verzenden) de PATCH niet meer laat
  // slagen ná de claim — anders kan werkgever_id nog wijzigen ná de brandings-
  // snapshot in de verzendroute.
  const [bijgewerkt] = await db
    .update(marketingCampagnesTable)
    .set(wijziging)
    .where(and(eq(marketingCampagnesTable.id, id), inArray(marketingCampagnesTable.status, ["concept", "gepland"])))
    .returning({ id: marketingCampagnesTable.id });
  if (!bijgewerkt) {
    // Status is intussen veranderd (race): geef de actuele status terug.
    return res.status(409).json({ fout: `Campagne met status '${c.status}' kan niet meer worden gewijzigd` });
  }
  return res.json({ ok: true });
});

router.delete("/marketing/campagnes/:id", beheren, async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  const [c] = await db.select().from(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, id)).limit(1);
  if (!c) return res.status(404).json({ fout: "Campagne niet gevonden" });
  if (c.status !== "concept") {
    return res.status(409).json({ fout: "Alleen een concept-campagne kan worden verwijderd" });
  }
  await db.delete(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, id));
  return res.json({ ok: true });
});

// Proefverzending naar jezelf — harde voorwaarde vóór echte verzending.
router.post("/marketing/campagnes/:id/proef", beheren, async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  const [c] = await db.select().from(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, id)).limit(1);
  if (!c) return res.status(404).json({ fout: "Campagne niet gevonden" });
  if (!c.werkgeverId) return res.status(422).json({ fout: "Kies eerst een werkmaatschappij — de huisstijl is verplicht voor verzending" });
  if (!c.sjabloonId) return res.status(422).json({ fout: "Kies eerst een sjabloon" });
  const [sjabloon] = await db.select().from(marketingSjablonenTable).where(eq(marketingSjablonenTable.id, c.sjabloonId)).limit(1);
  if (!sjabloon) return res.status(422).json({ fout: "Sjabloon niet gevonden" });
  const [ik] = await db
    .select({ email: gebruikersTable.email, naam: gebruikersTable.naam })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, req.session.userId!))
    .limit(1);
  if (!ik?.email) return res.status(422).json({ fout: "Je account heeft geen e-mailadres" });
  const basis = publiekeAppUrl();
  if (!basis) return res.status(422).json({ fout: "Publieke app-URL onbekend — afmeldlink kan niet worden opgebouwd" });

  const branding = await haalWerkgeverBranding(c.werkgeverId);
  const organisatieNaam = `${branding.naam} (proef)`;
  const inhoud = vulSjabloonVelden(sjabloon.inhoud, { naam: ik.naam ?? "collega", organisatie: organisatieNaam });
  const onderwerp = `[PROEF] ${vulSjabloonVelden(sjabloon.onderwerp, { naam: ik.naam ?? "collega", organisatie: organisatieNaam })}`;
  // Afmeldlink toont campagne-specifieke branding via ?campagne_id param
  const proefAfmeldUrl = `${basis}/api/marketing/afmelden/voorbeeld?campagne_id=${id}`;
  await verstuurMail({
    naarEmail: ik.email,
    naarNaam: ik.naam,
    onderwerp,
    html: campagneMailHtml({
      inhoudHtml: tekstNaarHtml(inhoud),
      afmeldUrl: proefAfmeldUrl,
      branding,
    }),
    soort: "campagne_proef",
    verstuurdDoorId: req.session.userId ?? null,
    direct: true, // expliciete menselijke handeling, naar jezelf
  });
  const nu = new Date();
  await db
    .update(marketingCampagnesTable)
    .set({ proefVerzondenOp: nu, proefVerzondenDoorId: req.session.userId ?? null })
    .where(eq(marketingCampagnesTable.id, id));
  return res.json({ ok: true, verzonden_naar: ik.email });
});

// Echte verzending naar de doelgroep — crm niveau 4.
router.post("/marketing/campagnes/:id/verzenden", verzenden, async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  const [c] = await db.select().from(marketingCampagnesTable).where(eq(marketingCampagnesTable.id, id)).limit(1);
  if (!c) return res.status(404).json({ fout: "Campagne niet gevonden" });
  if (c.status !== "concept" && c.status !== "gepland") {
    return res.status(409).json({ fout: `Campagne heeft status '${c.status}' en kan niet (opnieuw) worden verzonden` });
  }
  if (!c.werkgeverId) {
    return res.status(422).json({ fout: "Kies eerst een werkmaatschappij — de huisstijl is verplicht voor verzending" });
  }
  if (!c.doelgroepId || !c.sjabloonId) {
    return res.status(422).json({ fout: "Campagne heeft een doelgroep én sjabloon nodig" });
  }
  // Proefverzending is verplicht en moet ná de laatste wijziging liggen.
  const [sjabloon] = await db.select().from(marketingSjablonenTable).where(eq(marketingSjablonenTable.id, c.sjabloonId)).limit(1);
  if (!sjabloon) return res.status(422).json({ fout: "Sjabloon niet gevonden" });
  if (!c.proefVerzondenOp) {
    return res.status(422).json({ fout: "Verstuur eerst een proefverzending naar jezelf" });
  }
  if (c.proefVerzondenOp < c.bijgewerktOp || c.proefVerzondenOp < sjabloon.bijgewerktOp) {
    return res.status(422).json({ fout: "De campagne of het sjabloon is gewijzigd ná de proefverzending — verstuur eerst een nieuwe proef" });
  }
  const basis = publiekeAppUrl();
  if (!basis) return res.status(422).json({ fout: "Publieke app-URL onbekend — afmeldlinks kunnen niet worden opgebouwd" });

  const [doelgroep] = await db.select().from(marketingDoelgroepenTable).where(eq(marketingDoelgroepenTable.id, c.doelgroepId)).limit(1);
  if (!doelgroep) return res.status(422).json({ fout: "Doelgroep niet gevonden" });
  const leden = await berekenDoelgroepLeden(doelgroep.criteria as DoelgroepCriteria);
  if (leden.length === 0) {
    return res.status(422).json({ fout: "De doelgroep bevat op dit moment niemand met toestemming" });
  }

  // Atomaire statusovergang: maar één verzendactie kan slagen. Eerst naar de
  // tussenstatus "voorbereiden": de gedoseerde verzender en de
  // afrondingscontrole kijken alleen naar "verzendend", dus zolang de wachtrij
  // nog wordt gevuld kan de campagne niet halverwege als "verzonden" worden
  // afgerond (race: eerste item verzonden vóór de rest bestaat).
  const geclaimd = await db
    .update(marketingCampagnesTable)
    .set({ status: "voorbereiden", gestartOp: new Date() })
    .where(and(eq(marketingCampagnesTable.id, id), inArray(marketingCampagnesTable.status, ["concept", "gepland"])))
    .returning();
  if (geclaimd.length === 0) {
    return res.status(409).json({ fout: "Campagne wordt al verzonden" });
  }

  // Lees werkgeverId uit de geclaimde rij (niet uit `c` dat vóór de claim is
  // gelezen): ná de claim op "voorbereiden" blokkeert de PATCH-route verdere
  // wijzigingen, dus dit is de stabiele waarde waarmee mail én afmeldpagina
  // dezelfde huisstijl dragen.
  const geclaimdWerkgeverId = geclaimd[0]!.werkgeverId!;
  const branding = await haalWerkgeverBranding(geclaimdWerkgeverId);
  let ingepland = 0;
  let overgeslagen = 0;
  let teller = 0;
  for (const lid of leden) {
    // Annuleringsbewust opbouwen: als de campagne intussen is gestopt (mag
    // ook tijdens "voorbereiden"), stop dan met rijen aanmaken. De definitieve
    // opruiming van al aangemaakte rijen gebeurt hieronder wanneer de
    // activering niet slaagt.
    if (teller++ % 20 === 0) {
      const [huidig] = await db
        .select({ status: marketingCampagnesTable.status })
        .from(marketingCampagnesTable)
        .where(eq(marketingCampagnesTable.id, id));
      if (huidig?.status !== "voorbereiden") break;
    }
    const token = randomBytes(24).toString("hex");
    const [ontvanger] = await db
      .insert(marketingCampagneOntvangersTable)
      .values({
        campagneId: id,
        contactpersoonId: lid.contactpersoonId,
        klantId: lid.klantId,
        email: lid.email,
        afmeldToken: token,
      })
      .onConflictDoNothing()
      .returning();
    if (!ontvanger) continue; // al eerder ingepland voor deze campagne
    const inhoud = vulSjabloonVelden(sjabloon.inhoud, lid);
    const onderwerp = vulSjabloonVelden(sjabloon.onderwerp, lid);
    await verstuurMail({
      naarEmail: lid.email,
      naarNaam: lid.naam,
      onderwerp,
      html: campagneMailHtml({
        inhoudHtml: tekstNaarHtml(inhoud),
        afmeldUrl: `${basis}/api/marketing/afmelden/${ontvanger.afmeldToken}`,
        branding,
      }),
      soort: "campagne",
      verstuurdDoorId: req.session.userId ?? null,
      campagneOntvangerId: ontvanger.id,
      // géén direct: campagnemail loopt fail-closed over de wachtrij en wordt
      // door een beheerder gespreid verstuurd, nooit als één stoot.
    });
    // De wachtrij voegt dubbele wachtende mails (zelfde adres + onderwerp)
    // stilzwijgend samen. Voor een campagne mag dat nooit onopgemerkt een
    // ontvanger verliezen: controleer dat er echt een item ligt en markeer
    // de ontvanger anders als overgeslagen (met logregel).
    const [wachtrijItem] = await db
      .select({ id: mailWachtrijTable.id })
      .from(mailWachtrijTable)
      .where(eq(mailWachtrijTable.campagneOntvangerId, ontvanger.id))
      .limit(1);
    if (!wachtrijItem) {
      await db
        .update(marketingCampagneOntvangersTable)
        .set({ status: "overgeslagen" })
        .where(eq(marketingCampagneOntvangersTable.id, ontvanger.id));
      overgeslagen++;
      logger.warn(
        { campagneId: id, contactpersoonId: lid.contactpersoonId },
        "Campagnemail samengevallen met bestaand wachtrij-item — ontvanger overgeslagen",
      );
      continue;
    }
    ingepland++;
  }
  // Alle rijen staan klaar — nu pas activeren. Als de campagne intussen is
  // gestopt (stoppen mag ook tijdens voorbereiden), blijft die stop staan.
  const [geactiveerd] = await db
    .update(marketingCampagnesTable)
    .set({ status: "verzendend" })
    .where(and(eq(marketingCampagnesTable.id, id), eq(marketingCampagnesTable.status, "voorbereiden")))
    .returning();
  if (!geactiveerd) {
    // Gestopt tijdens de opbouw: de opbouw kan ná het stopmoment nog rijen
    // hebben aangemaakt die de stop-route niet zag. Ruim álles alsnog op,
    // zodat er geen wachtende items of geplande ontvangers achterblijven.
    await ruimGestopteCampagneOp(id, "campagne gestopt tijdens voorbereiden");
    logger.info({ campagneId: id }, "Campagne gestopt tijdens voorbereiden — wachtrij opgeruimd");
    return res.json({ ok: true, ingepland: 0, overgeslagen, gestopt: true });
  }
  // Randgeval: als élke ontvanger bij het klaarzetten al is overgeslagen
  // (bv. alle mails vielen samen met bestaande wachtrij-items), ligt er niets
  // voor de verzender en moet de campagne alsnog direct afronden — anders
  // blijft ze eeuwig op "verzendend" staan.
  await rondCampagneAfIndienKlaar(id);
  logger.info({ campagneId: id, ingepland, overgeslagen }, "Campagne in mailwachtrij geplaatst");
  return res.json({ ok: true, ingepland, overgeslagen });
});

// Verzending stoppen — resterende (nog niet verzonden) berichten vervallen.
router.post("/marketing/campagnes/:id/stoppen", verzenden, async (req, res) => {
  const id = parseInt(String(req.params["id"]), 10);
  const [c] = await db
    .update(marketingCampagnesTable)
    .set({
      status: "gestopt",
      gestoptOp: new Date(),
      gestoptReden: req.body?.reden ? String(req.body.reden) : "handmatig gestopt",
    })
    .where(and(eq(marketingCampagnesTable.id, id), inArray(marketingCampagnesTable.status, ["gepland", "voorbereiden", "verzendend"])))
    .returning();
  if (!c) return res.status(409).json({ fout: "Alleen een geplande of verzendende campagne kan worden gestopt" });
  // Alle nog wachtende wachtrij-items afwijzen en geplande ontvangers
  // terminal maken — gedeeld met het verzend-endpoint (stop tijdens opbouw).
  const { vervallen } = await ruimGestopteCampagneOp(id, "campagne gestopt");
  return res.json({ ok: true, vervallen });
});

export default router;

// ─── Publiek: afmelden zonder inloggen ───────────────────────────────────────

export const marketingPubliekRouter = Router();

/**
 * GET /marketing/werkgever-logo/:werkgeverId
 *
 * Beperkte publieke proxy die uitsluitend het logo van een werkgever serveert,
 * zonder authenticatie. Vereist zodat e-mailclients en bezoekers van de
 * publieke afmeldpagina het logo kunnen ophalen.
 *
 * Scope-begrenzing:
 * - Alleen paden die beginnen met /objects/werkgevers/ worden geserveerd.
 * - Alle andere opslagpaden worden geweigerd (403).
 * - Er is geen wildcard over de volledige opslag; alleen werkgever-logo's.
 */
marketingPubliekRouter.get("/marketing/werkgever-logo/:werkgeverId", async (req, res): Promise<void> => {
  const werkgeverId = parseInt(String(req.params["werkgeverId"]), 10);
  if (!Number.isFinite(werkgeverId)) { res.status(400).end(); return; }

  const [w] = await db
    .select({ logoUrl: werkgeversTable.logoUrl })
    .from(werkgeversTable)
    .where(eq(werkgeversTable.id, werkgeverId))
    .limit(1);

  if (!w?.logoUrl) { res.status(404).end(); return; }

  // Normaliseer het pad en valideer dat het exact overeenkomt met de canonieke
  // sleutel van dít werkgever-ID. Zo worden legacy-paden (objects/algemeen/...),
  // paden van andere werkgevers, traversal-segmenten en niet-afbeeldingstypen
  // allemaal geweigerd — zonder dat we de opslag hoeven te raadplegen.
  const subPath = resolveWerkgeverLogoSubPath(w.logoUrl.trim());
  if (!subPath || !isKanoniekeWerkgeversLogoSleutel(subPath, werkgeverId)) {
    res.status(403).end();
    return;
  }

  // Reconstrueer het pad zoals objectStorageService het verwacht.
  const logoPad = `/objects/${subPath}`;

  try {
    const objectFile = await objectStorageService.getObjectEntityFile(logoPad);
    const response = await objectStorageService.downloadObject(objectFile);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    // Cache 1 uur publiek — logo's veranderen zelden en e-mails worden herladen.
    res.setHeader("Cache-Control", "public, max-age=3600");
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) { res.status(404).end(); return; }
    logger.error({ err, werkgeverId }, "Fout bij ophalen werkgever-logo");
    res.status(500).end();
  }
});

// Branding opzoeken via afmeld-token (publieke route, geen sessie).
async function haalBrandingViaToken(token: string): Promise<MailBranding> {
  const [rij] = await db
    .select({ werkgeverId: marketingCampagnesTable.werkgeverId })
    .from(marketingCampagneOntvangersTable)
    .innerJoin(marketingCampagnesTable, eq(marketingCampagneOntvangersTable.campagneId, marketingCampagnesTable.id))
    .where(eq(marketingCampagneOntvangersTable.afmeldToken, token))
    .limit(1);
  return haalWerkgeverBranding(rij?.werkgeverId);
}

// Branding opzoeken voor de voorbeeld-afmeldpagina via campagne_id query-param.
async function haalBrandingVoorVoorbeeld(campagneId: string | undefined): Promise<MailBranding> {
  if (!campagneId) return FPS_FALLBACK;
  const id = parseInt(campagneId, 10);
  if (!Number.isFinite(id)) return FPS_FALLBACK;
  const [c] = await db
    .select({ werkgeverId: marketingCampagnesTable.werkgeverId })
    .from(marketingCampagnesTable)
    .where(eq(marketingCampagnesTable.id, id))
    .limit(1);
  return haalWerkgeverBranding(c?.werkgeverId);
}

function maakAfmeldPagina(opties: { titel: string; tekst: string; branding: MailBranding }): string {
  const { titel, tekst, branding } = opties;
  // Statische tekst/HTML (door code geleverd, niet door DB) hoeft niet ge-escaped;
  // naam en logo-URL zijn al gesaniteerd via haalWerkgeverBranding.
  const veiligNaam = escHtml(branding.naam);
  const veiligLogoUrl = branding.logoUrl ? escHtml(branding.logoUrl) : null;
  return `<!DOCTYPE html>
<html lang="nl"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${escHtml(titel)}</title></head>
<body style="margin:0;padding:48px 16px;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;border-top:6px solid ${branding.kleur};">
    ${veiligLogoUrl ? `<img src="${veiligLogoUrl}" alt="${veiligNaam}" style="max-height:40px;max-width:140px;object-fit:contain;margin-bottom:20px;display:block;" />` : ""}
    <h1 style="margin:0 0 12px;font-size:20px;color:#212631;">${escHtml(titel)}</h1>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#3f3f46;">${tekst}</p>
  </div>
</body></html>`;
}

marketingPubliekRouter.get("/marketing/afmelden/:token", async (req, res) => {
  const token = String(req.params["token"] ?? "");
  if (token === "voorbeeld") {
    // Proef-afmeldpagina: branding uit ?campagne_id zodat proef = echte weergave.
    const branding = await haalBrandingVoorVoorbeeld(req.query["campagne_id"] as string | undefined);
    return res
      .status(200)
      .type("html")
      .send(maakAfmeldPagina({
        titel: "Voorbeeld-afmeldlink",
        tekst: "Dit was een proefverzending — er is niets afgemeld.",
        branding,
      }));
  }
  const branding = await haalBrandingViaToken(token);
  // GET heeft bewust géén bijwerking: mailscanners en virusfilters volgen
  // links automatisch en zouden anders ontvangers ongewild afmelden. De
  // pagina toont een bevestigingsknop die de afmelding via POST uitvoert.
  const veiligNaam = escHtml(branding.naam);
  return res
    .status(200)
    .type("html")
    .send(
      maakAfmeldPagina({
        titel: "Afmelden voor commerciële mail",
        tekst: `Klik op de knop om u af te melden. U ontvangt dan geen campagnemail meer van ${veiligNaam}.
        <form method="POST" action="" style="margin:20px 0 0;">
          <button type="submit" style="background:${branding.kleur};color:#fff;border:0;border-radius:6px;padding:12px 24px;font-size:15px;cursor:pointer;">Ja, meld mij af</button>
        </form>`,
        branding,
      }),
    );
});

marketingPubliekRouter.post("/marketing/afmelden/:token", async (req, res) => {
  const token = String(req.params["token"] ?? "");
  if (token === "voorbeeld") {
    const branding = await haalBrandingVoorVoorbeeld(req.query["campagne_id"] as string | undefined);
    return res
      .status(200)
      .type("html")
      .send(maakAfmeldPagina({ titel: "Voorbeeld-afmeldlink", tekst: "Dit was een proefverzending — er is niets afgemeld.", branding }));
  }
  const [branding, resultaat] = await Promise.all([
    haalBrandingViaToken(token),
    verwerkAfmelding(token),
  ]);
  if (!resultaat) {
    return res.status(404).type("html").send(maakAfmeldPagina({ titel: "Link niet gevonden", tekst: "Deze afmeldlink is niet (meer) geldig.", branding }));
  }
  const veiligNaam = escHtml(branding.naam);
  return res
    .status(200)
    .type("html")
    .send(
      maakAfmeldPagina({
        titel: "U bent afgemeld",
        tekst: resultaat.reedsAfgemeld
          ? `U was al afgemeld voor commerciële mail van ${veiligNaam}. U ontvangt geen campagnemail meer.`
          : `U ontvangt geen commerciële mail meer van ${veiligNaam}. Dit is direct verwerkt.`,
        branding,
      }),
    );
});
