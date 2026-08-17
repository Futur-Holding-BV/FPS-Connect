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
// Verzenden loopt over de bestaande mailwachtrij (fail-closed, gespreid:
// een beheerder verstuurt per item of in porties, nooit één stoot).
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
  crmContactpersonenTable,
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
} from "../services/marketingService";
import { publiekeAppUrl } from "../lib/publiekeUrl";
import { logger } from "../lib/logger";

const router = Router();
const beheren = requireBevoegdheid("marketing", 3);
const verzenden = requireBevoegdheid("marketing", 4);

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
function campagneMailHtml(opties: { inhoudHtml: string; afmeldUrl: string }): string {
  return `
<!DOCTYPE html>
<html lang="nl">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="background:#F23B0D;height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:32px 40px;">
          <div style="font-size:15px;line-height:1.6;color:#3f3f46;">${opties.inhoudHtml}</div>
        </td></tr>
        <tr><td style="padding:16px 40px 28px;border-top:1px solid #e4e4e7;">
          <p style="margin:0;font-size:12px;color:#a1a1aa;">
            U ontvangt dit bericht omdat u toestemming gaf voor commerciële mail van FPS.
            <a href="${opties.afmeldUrl}" style="color:#71717a;">Afmelden</a> kan altijd, zonder inloggen.
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

// ─── Campagnes ───────────────────────────────────────────────────────────────

const mapCampagne = (c: typeof marketingCampagnesTable.$inferSelect) => ({
  id: c.id,
  naam: c.naam,
  doel: c.doel,
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
  const [rij] = await db
    .insert(marketingCampagnesTable)
    .values({
      naam,
      doel: req.body?.doel ? String(req.body.doel) : null,
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
  if (req.body?.doelgroep_id !== undefined) wijziging["doelgroepId"] = req.body.doelgroep_id ? parseInt(String(req.body.doelgroep_id), 10) : null;
  if (req.body?.sjabloon_id !== undefined) wijziging["sjabloonId"] = req.body.sjabloon_id ? parseInt(String(req.body.sjabloon_id), 10) : null;
  if (req.body?.gepland_op !== undefined) wijziging["geplandOp"] = req.body.gepland_op ? new Date(String(req.body.gepland_op)) : null;
  await db.update(marketingCampagnesTable).set(wijziging).where(eq(marketingCampagnesTable.id, id));
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

  const inhoud = vulSjabloonVelden(sjabloon.inhoud, { naam: ik.naam ?? "collega", organisatie: "FPS (proef)" });
  const onderwerp = `[PROEF] ${vulSjabloonVelden(sjabloon.onderwerp, { naam: ik.naam ?? "collega", organisatie: "FPS (proef)" })}`;
  await verstuurMail({
    naarEmail: ik.email,
    naarNaam: ik.naam,
    onderwerp,
    html: campagneMailHtml({ inhoudHtml: tekstNaarHtml(inhoud), afmeldUrl: `${basis}/api/marketing/afmelden/voorbeeld` }),
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

  // Atomaire statusovergang: maar één verzendactie kan slagen.
  const geclaimd = await db
    .update(marketingCampagnesTable)
    .set({ status: "verzendend", gestartOp: new Date() })
    .where(and(eq(marketingCampagnesTable.id, id), inArray(marketingCampagnesTable.status, ["concept", "gepland"])))
    .returning();
  if (geclaimd.length === 0) {
    return res.status(409).json({ fout: "Campagne wordt al verzonden" });
  }

  let ingepland = 0;
  let overgeslagen = 0;
  for (const lid of leden) {
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
    .where(and(eq(marketingCampagnesTable.id, id), inArray(marketingCampagnesTable.status, ["gepland", "verzendend"])))
    .returning();
  if (!c) return res.status(409).json({ fout: "Alleen een geplande of verzendende campagne kan worden gestopt" });
  // Alle nog wachtende wachtrij-items van deze campagne afwijzen — ongeacht
  // ontvangerstatus (ook een inmiddels afgemelde ontvanger kan nog een
  // wachtend item hebben als de afmeld-opruiming ooit gemist is).
  const alleOntvangers = await db
    .select({ id: marketingCampagneOntvangersTable.id, status: marketingCampagneOntvangersTable.status })
    .from(marketingCampagneOntvangersTable)
    .where(eq(marketingCampagneOntvangersTable.campagneId, id));
  const alleIds = alleOntvangers.map((o) => o.id);
  const geplandeIds = alleOntvangers.filter((o) => o.status === "gepland").map((o) => o.id);
  if (alleIds.length > 0) {
    await db
      .update(mailWachtrijTable)
      .set({ status: "afgewezen", foutdetail: "campagne gestopt", verwerktOp: new Date() })
      .where(and(inArray(mailWachtrijTable.campagneOntvangerId, alleIds), eq(mailWachtrijTable.status, "wachtend")));
  }
  if (geplandeIds.length > 0) {
    await db
      .update(marketingCampagneOntvangersTable)
      .set({ status: "overgeslagen" })
      .where(inArray(marketingCampagneOntvangersTable.id, geplandeIds));
  }
  return res.json({ ok: true, vervallen: geplandeIds.length });
});

export default router;

// ─── Publiek: afmelden zonder inloggen ───────────────────────────────────────

export const marketingPubliekRouter = Router();

const maakAfmeldPagina = (titel: string, tekst: string) => `<!DOCTYPE html>
<html lang="nl"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${titel}</title></head>
<body style="margin:0;padding:48px 16px;background:#f4f4f5;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;border-top:6px solid #F23B0D;">
    <h1 style="margin:0 0 12px;font-size:20px;color:#212631;">${titel}</h1>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#3f3f46;">${tekst}</p>
  </div>
</body></html>`;

marketingPubliekRouter.get("/marketing/afmelden/:token", async (req, res) => {
  const token = String(req.params["token"] ?? "");
  if (token === "voorbeeld") {
    return res
      .status(200)
      .type("html")
      .send(maakAfmeldPagina("Voorbeeld-afmeldlink", "Dit was een proefverzending — er is niets afgemeld."));
  }
  // GET heeft bewust géén bijwerking: mailscanners en virusfilters volgen
  // links automatisch en zouden anders ontvangers ongewild afmelden. De
  // pagina toont een bevestigingsknop die de afmelding via POST uitvoert.
  return res
    .status(200)
    .type("html")
    .send(
      maakAfmeldPagina(
        "Afmelden voor commerciële mail",
        `Klik op de knop om u af te melden. U ontvangt dan geen campagnemail meer van FPS.
        <form method="POST" action="" style="margin:20px 0 0;">
          <button type="submit" style="background:#F23B0D;color:#fff;border:0;border-radius:6px;padding:12px 24px;font-size:15px;cursor:pointer;">Ja, meld mij af</button>
        </form>`,
      ),
    );
});

marketingPubliekRouter.post("/marketing/afmelden/:token", async (req, res) => {
  const token = String(req.params["token"] ?? "");
  const pagina = maakAfmeldPagina;
  if (token === "voorbeeld") {
    return res
      .status(200)
      .type("html")
      .send(pagina("Voorbeeld-afmeldlink", "Dit was een proefverzending — er is niets afgemeld."));
  }
  const resultaat = await verwerkAfmelding(token);
  if (!resultaat) {
    return res.status(404).type("html").send(pagina("Link niet gevonden", "Deze afmeldlink is niet (meer) geldig."));
  }
  return res
    .status(200)
    .type("html")
    .send(
      pagina(
        "U bent afgemeld",
        resultaat.reedsAfgemeld
          ? "U was al afgemeld voor commerciële mail van FPS. U ontvangt geen campagnemail meer."
          : "U ontvangt geen commerciële mail meer van FPS. Dit is direct verwerkt.",
      ),
    );
});
