import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { gebruikersTable, profielenTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { stuurUitnodigingsmail } from "../services/email";
import { requireBevoegdheid, requireRol } from "../middlewares/auth";
import { heeftNiveau } from "@workspace/permissies";
import {
  kiesUniekeHerkomstPreset,
  magAutomatischKoppelen,
} from "../lib/herkomst";

const router = Router();

const alleenBeheerder = requireBevoegdheid("gebruikers", 4);
const lezenGebruikers = requireBevoegdheid("gebruikers", 1);

// De enige toegestane projectfuncties (profiel) voor een beheerder.
const FUNCTIETITELS_TOEGESTAAN = [
  "Projectleider",
  "Werkvoorbereider",
  "Project-admin",
  "Calculator",
  "Commercie",
  "Financieel",
];

const isBeheerderRol = (rol: unknown) => rol === "hoofdbeheerder";

// Normaliseer en valideer projectfuncties: alleen toegestane waarden, ontdubbeld.
const schoonFunctietitels = (waarde: unknown): string[] => {
  if (!Array.isArray(waarde)) return [];
  const uniek = new Set(
    waarde
      .filter((f): f is string => typeof f === "string")
      .map((f) => f.trim())
      .filter((f) => FUNCTIETITELS_TOEGESTAAN.includes(f)),
  );
  return [...uniek];
};

const mapGebruiker = (g: typeof gebruikersTable.$inferSelect) => ({
  id: g.id,
  naam: g.naam,
  email: g.email,
  rol: g.rol,
  functietitels: g.functietitels ?? [],
  telefoon: g.telefoon,
  bedrijf: g.bedrijf,
  actief: g.actief,
  aangemaakt_op: g.aangemaaktOp.toISOString(),
  laatste_online: g.laatstOnline ? g.laatstOnline.toISOString() : null,
  avatar_url: g.avatarUrl,
  bedrijfslogo_url: g.bedrijfslogoUrl,
  bedrijfskleuren: g.bedrijfskleuren,
  uitnodiging_status: g.uitnodigingStatus,
  uitnodiging_verstuurd_op: g.uitnodigingVerstuurdOp
    ? g.uitnodigingVerstuurdOp.toISOString()
    : null,
  uitnodiging_verloopt_op: g.uitnodigingVerlooptOp
    ? g.uitnodigingVerlooptOp.toISOString()
    : null,
  uitnodiging_geopend_op: g.uitnodigingGeopendOp
    ? g.uitnodigingGeopendOp.toISOString()
    : null,
  uitnodiging_opnieuw_verstuurd_op: g.uitnodigingOpnieuwVerstuurdOp
    ? g.uitnodigingOpnieuwVerstuurdOp.toISOString()
    : null,
  uitnodiging_geaccepteerd_op: g.uitnodigingGeaccepteerdOp
    ? g.uitnodigingGeaccepteerdOp.toISOString()
    : null,
  taal: g.taal ?? "nl",
  bevoegdheden: (g.bevoegdheden as Record<string, number>) ?? {},
  herkomst_profiel_id: g.herkomstProfielId ?? null,
  herkomst_automatisch: g.herkomstProfielId != null ? (g.herkomstAutomatisch ?? false) : false,
});

// Veilige projectie zonder PII voor niet-beheerders: namen/rol blijven zichtbaar
// (nodig voor toewijzings- en naamweergave), maar e-mail, telefoon, bedrijf en
// uitnodigingsgegevens worden weggelaten.
const mapGebruikerPubliek = (g: typeof gebruikersTable.$inferSelect) => ({
  id: g.id,
  naam: g.naam,
  email: "",
  rol: g.rol,
  functietitels: g.functietitels ?? [],
  telefoon: null,
  bedrijf: null,
  actief: g.actief,
  aangemaakt_op: g.aangemaaktOp.toISOString(),
  laatste_online: null,
  avatar_url: g.avatarUrl,
  bedrijfslogo_url: null,
  bedrijfskleuren: null,
  uitnodiging_status: null,
  uitnodiging_verstuurd_op: null,
  uitnodiging_verloopt_op: null,
  uitnodiging_geopend_op: null,
  uitnodiging_opnieuw_verstuurd_op: null,
  uitnodiging_geaccepteerd_op: null,
  taal: g.taal ?? "nl",
  bevoegdheden: {},
});

// Detecteer of een bevoegdheden-matrix exact overeenkomt met precies één
// (preset)profiel. Dan kan dat profiel als herkomst worden gemarkeerd, ook
// wanneer de bevoegdheden langs een andere weg dan de expliciete presetkeuze
// gelijk aan dat profiel zijn gezet. Retourneert null bij:
//   - een lege (geen-toegang) matrix — voorkomt koppeling van rechtloze accounts;
//   - geen enkele match;
//   - meerdere matches (toevallig identieke profielen) — voorkomt valse koppeling.
async function vindUniekeHerkomstPreset(
  bevoegdheden: Record<string, number>,
): Promise<number | null> {
  const profielen = await db
    .select({ id: profielenTable.id, bevoegdheden: profielenTable.bevoegdheden })
    .from(profielenTable);
  return kiesUniekeHerkomstPreset(
    bevoegdheden,
    profielen.map((p) => ({
      id: p.id,
      bevoegdheden: p.bevoegdheden as Record<string, number> | null,
    })),
  );
}

async function isBeheerder(userId: number | undefined): Promise<boolean> {
  if (!userId) return false;
  const [g] = await db
    .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, userId));
  if (!g) return false;
  if (g.rol === "hoofdbeheerder") return true;
  const bev = (g.bevoegdheden as Record<string, number> | null) ?? {};
  return heeftNiveau(bev, "gebruikers", 1);
}

function domein(): string {
  return (process.env.REPLIT_DOMAINS ?? "").split(",")[0]?.trim() || "localhost";
}

// GET /gebruikers
router.get("/gebruikers", lezenGebruikers, async (req, res) => {
  try {
    const gebruikers = await db.select().from(gebruikersTable);
    const volledig = await isBeheerder(req.session.userId);
    const mapper = volledig ? mapGebruiker : mapGebruikerPubliek;
    res.json(gebruikers.map((g) => mapper(g)));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebruikers
router.post("/gebruikers", alleenBeheerder, async (req, res) => {
  try {
    const {
      naam, email, rol, functietitels, telefoon, bedrijf, wachtwoord,
      avatar_url, bedrijfslogo_url, bedrijfskleuren, taal, bevoegdheden,
      herkomst_profiel_id,
    } = req.body;
    if (!naam || !email || !rol) {
      return res.status(400).json({ error: "naam, email en rol zijn verplicht" });
    }
    const functies = isBeheerderRol(rol)
      ? schoonFunctietitels(functietitels)
      : [];
    // Zelf-escalatiebeveiliging: niemand mag hogere niveaus toekennen dan eigen matrix.
    let toegestaanBevoegdheden: Record<string, number> = {};
    if (typeof bevoegdheden === "object" && bevoegdheden !== null) {
      const requesterId = req.session.userId!;
      const [requester] = await db
        .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, requesterId));
      if (requester && requester.rol !== "hoofdbeheerder") {
        const eigenBev = (requester.bevoegdheden as Record<string, number> | null) ?? {};
        for (const [mod, lvl] of Object.entries(bevoegdheden as Record<string, number>)) {
          if (typeof lvl === "number" && lvl > (eigenBev[mod] ?? 0)) {
            return res.status(403).json({
              error: "Geen toegang: bevoegdheid kan niet hoger zijn dan uw eigen niveau",
            });
          }
        }
      }
      toegestaanBevoegdheden = bevoegdheden as Record<string, number>;
    }
    let herkomstId =
      typeof herkomst_profiel_id === "number" && Number.isInteger(herkomst_profiel_id)
        ? herkomst_profiel_id
        : null;
    // Een expliciet gekozen preset is een handmatige koppeling.
    let herkomstAutomatisch = false;
    // Geen expliciete preset gekozen, maar de meegestuurde matrix komt exact en
    // als enige overeen met een profiel? Markeer dat profiel dan als herkomst
    // (automatisch afgeleid).
    if (herkomstId == null) {
      herkomstId = await vindUniekeHerkomstPreset(toegestaanBevoegdheden);
      herkomstAutomatisch = herkomstId != null;
    }
    const gehasht = wachtwoord ? await bcrypt.hash(String(wachtwoord), 10) : null;
    const [g] = await db
      .insert(gebruikersTable)
      .values({
        naam,
        email: String(email).trim().toLowerCase(),
        rol,
        functietitels: functies,
        telefoon,
        bedrijf,
        wachtwoord: gehasht,
        avatarUrl: avatar_url,
        bedrijfslogoUrl: bedrijfslogo_url,
        bedrijfskleuren,
        taal: taal || "nl",
        bevoegdheden: toegestaanBevoegdheden,
        herkomstProfielId: herkomstId,
        herkomstAutomatisch,
        uitnodigingStatus: "niet_uitgenodigd",
      })
      .returning();
    res.status(201).json(mapGebruiker(g));
  } catch (err: any) {
    if (err?.cause?.code === "23505" || err?.message?.includes("gebruikers_email_unique")) {
      return res.status(409).json({ error: "Dit e-mailadres is al in gebruik bij een andere gebruiker." });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /gebruikers/:id
router.get("/gebruikers/:id", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [g] = await db.select().from(gebruikersTable).where(eq(gebruikersTable.id, id));
    if (!g) return res.status(404).json({ error: "Gebruiker niet gevonden" });
    // Beheerders en het eigen account zien volledige gegevens; anderen alleen veilig.
    const volledig = id === req.session.userId || (await isBeheerder(req.session.userId));
    res.json(volledig ? mapGebruiker(g) : mapGebruikerPubliek(g));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /gebruikers/:id
router.patch("/gebruikers/:id", alleenBeheerder, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const {
      naam, email, rol, functietitels, telefoon, bedrijf, actief, wachtwoord,
      avatar_url, bedrijfslogo_url, bedrijfskleuren, uitnodiging_status, taal, bevoegdheden,
      herkomst_profiel_id,
    } = req.body;
    // Bestaande rol én functietitels ophalen: zo wist een partiële PATCH niets
    // onterecht, terwijl een expliciete rolwissel de oude functies wél opschoont.
    const [bestaand] = await db
      .select({
        rol: gebruikersTable.rol,
        functietitels: gebruikersTable.functietitels,
        herkomstProfielId: gebruikersTable.herkomstProfielId,
      })
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, id));
    if (!bestaand) return res.status(404).json({ error: "Gebruiker niet gevonden" });
    const effectieveRol: unknown = rol !== undefined ? rol : bestaand.rol;
    const rolGewijzigd = rol !== undefined && rol !== bestaand.rol;
    const bestaandeFuncties = bestaand.functietitels ?? [];
    let functies: string[] | undefined;
    if (isBeheerderRol(effectieveRol)) {
      // Hoofdbeheerder: projectfuncties (kantoor). Niet meegestuurd: ongemoeid
      // laten, behalve bij een rolwissel — dan oude functies opschonen.
      functies =
        functietitels !== undefined
          ? schoonFunctietitels(functietitels)
          : rolGewijzigd
            ? schoonFunctietitels(bestaandeFuncties)
            : undefined;
    } else {
      // Gebruiker/klant (ook bij rolwissel): nooit een functie.
      functies = [];
    }
    const wijziging: Partial<typeof gebruikersTable.$inferInsert> = {
      naam,
      email: email ? String(email).trim().toLowerCase() : undefined,
      rol,
      functietitels: functies,
      telefoon,
      bedrijf,
      actief,
      avatarUrl: avatar_url,
      bedrijfslogoUrl: bedrijfslogo_url,
      bedrijfskleuren,
      uitnodigingStatus: uitnodiging_status,
      taal,
    };
    if (bevoegdheden !== undefined && typeof bevoegdheden === "object" && bevoegdheden !== null) {
      // Zelf-escalatiebeveiliging: niemand mag hogere niveaus toekennen dan eigen matrix.
      const requesterId = req.session.userId!;
      const [requester] = await db
        .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, requesterId));
      if (requester && requester.rol !== "hoofdbeheerder") {
        const eigenBev = (requester.bevoegdheden as Record<string, number> | null) ?? {};
        for (const [mod, lvl] of Object.entries(
          bevoegdheden as Record<string, number>,
        )) {
          if (typeof lvl === "number" && lvl > (eigenBev[mod] ?? 0)) {
            return res.status(403).json({
              error: "Geen toegang: bevoegdheid kan niet hoger zijn dan uw eigen niveau",
            });
          }
        }
      }
      wijziging.bevoegdheden = bevoegdheden as Record<string, number>;
    }
    // Herkomst (preset) alleen wijzigen wanneer expliciet meegestuurd: null wist
    // de koppeling, een geldig id (her)koppelt. undefined laat het veld ongemoeid.
    // Een expliciet meegestuurde herkomst is altijd een handmatige (bevestigde)
    // koppeling, dus automatisch-vlag op false.
    if (herkomst_profiel_id !== undefined) {
      const nieuweId =
        typeof herkomst_profiel_id === "number" && Number.isInteger(herkomst_profiel_id)
          ? herkomst_profiel_id
          : null;
      wijziging.herkomstProfielId = nieuweId;
      wijziging.herkomstAutomatisch = false;
    } else if (
      magAutomatischKoppelen(
        wijziging.bevoegdheden !== undefined,
        bestaand.herkomstProfielId,
      )
    ) {
      // Geen expliciete herkomst meegestuurd, bevoegdheden wijzigen, en er is nog
      // geen herkomst: koppel het profiel dat exact en als enige overeenkomt
      // (automatisch afgeleid).
      const auto = await vindUniekeHerkomstPreset(wijziging.bevoegdheden);
      if (auto != null) {
        wijziging.herkomstProfielId = auto;
        wijziging.herkomstAutomatisch = true;
      }
    }
    if (wachtwoord) {
      wijziging.wachtwoord = await bcrypt.hash(String(wachtwoord), 10);
    }
    const [g] = await db
      .update(gebruikersTable)
      .set(wijziging)
      .where(eq(gebruikersTable.id, id))
      .returning();
    if (!g) return res.status(404).json({ error: "Gebruiker niet gevonden" });
    res.json(mapGebruiker(g));
  } catch (err: any) {
    if (err?.cause?.code === "23505" || err?.message?.includes("gebruikers_email_unique")) {
      return res.status(409).json({ error: "Dit e-mailadres is al in gebruik bij een andere gebruiker." });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebruikers/:id/uitnodigen — eerste uitnodiging sturen
router.post("/gebruikers/:id/uitnodigen", alleenBeheerder, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [bestaande] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, id));
    if (!bestaande) return res.status(404).json({ error: "Gebruiker niet gevonden" });

    const token = crypto.randomBytes(32).toString("hex");
    const verlooptOp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const activatieLink = `https://${domein()}/uitnodiging/${token}`;

    // Eerst proberen te versturen; alleen bij een echte verzendfout afbreken
    // zodat de status niet ten onrechte op "uitgenodigd" komt te staan.
    try {
      await stuurUitnodigingsmail({
        naarEmail: bestaande.email,
        naarNaam: bestaande.naam,
        activatieLink,
      });
    } catch (mailErr) {
      req.log.error(mailErr, "Uitnodigingsmail mislukt");
      return res.status(502).json({
        error: "De uitnodiging kon niet worden verzonden. Probeer het later opnieuw.",
      });
    }

    const [g] = await db
      .update(gebruikersTable)
      .set({
        uitnodigingStatus: "uitgenodigd",
        uitnodigingVerstuurdOp: new Date(),
        uitnodigingToken: token,
        uitnodigingVerlooptOp: verlooptOp,
        uitnodigingGeopendOp: null,
        uitnodigingOpnieuwVerstuurdOp: null,
      })
      .where(eq(gebruikersTable.id, id))
      .returning();

    res.json(mapGebruiker(g));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebruikers/:id/uitnodigen/opnieuw — herinnering sturen
router.post("/gebruikers/:id/uitnodigen/opnieuw", alleenBeheerder, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [bestaande] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, id));
    if (!bestaande) return res.status(404).json({ error: "Gebruiker niet gevonden" });
    if (bestaande.uitnodigingStatus === "geaccepteerd") {
      return res.status(400).json({ error: "Gebruiker heeft de uitnodiging al geaccepteerd" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const verlooptOp = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const activatieLink = `https://${domein()}/uitnodiging/${token}`;

    try {
      await stuurUitnodigingsmail({
        naarEmail: bestaande.email,
        naarNaam: bestaande.naam,
        activatieLink,
        isOpnieuw: true,
      });
    } catch (mailErr) {
      req.log.error(mailErr, "Uitnodigingsmail (opnieuw) mislukt");
      return res.status(502).json({
        error: "De herinnering kon niet worden verzonden. Probeer het later opnieuw.",
      });
    }

    const [g] = await db
      .update(gebruikersTable)
      .set({
        uitnodigingStatus: "uitgenodigd",
        uitnodigingOpnieuwVerstuurdOp: new Date(),
        uitnodigingToken: token,
        uitnodigingVerlooptOp: verlooptOp,
      })
      .where(eq(gebruikersTable.id, id))
      .returning();

    res.json(mapGebruiker(g));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebruikers/:id/herkomst-toepassen — het herkomst-profiel van deze ene
// gebruiker opnieuw doorvoeren (bevoegdheden terugzetten naar de preset).
router.post(
  "/gebruikers/:id/herkomst-toepassen",
  requireRol("hoofdbeheerder"),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "Ongeldig id" });
      }
      const [bestaande] = await db
        .select()
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, id));
      if (!bestaande) {
        return res.status(404).json({ error: "Gebruiker niet gevonden" });
      }
      if (bestaande.herkomstProfielId == null) {
        return res
          .status(400)
          .json({ error: "Gebruiker heeft geen herkomst-profiel" });
      }
      const [profiel] = await db
        .select({ bevoegdheden: profielenTable.bevoegdheden })
        .from(profielenTable)
        .where(eq(profielenTable.id, bestaande.herkomstProfielId));
      if (!profiel) {
        return res
          .status(400)
          .json({ error: "Herkomst-profiel bestaat niet meer" });
      }
      const bevoegdheden = (profiel.bevoegdheden as Record<string, number>) ?? {};
      const [g] = await db
        .update(gebruikersTable)
        .set({ bevoegdheden })
        .where(eq(gebruikersTable.id, id))
        .returning();
      res.json(mapGebruiker(g));
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// POST /gebruikers/:id/herkomst-bevestigen — een automatisch afgeleide
// koppeling bevestigen: de koppeling blijft, maar wordt voortaan als handmatig
// (bevestigd) behandeld.
router.post(
  "/gebruikers/:id/herkomst-bevestigen",
  requireRol("hoofdbeheerder"),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "Ongeldig id" });
      }
      const [bestaande] = await db
        .select()
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, id));
      if (!bestaande) {
        return res.status(404).json({ error: "Gebruiker niet gevonden" });
      }
      if (bestaande.herkomstProfielId == null) {
        return res
          .status(400)
          .json({ error: "Gebruiker heeft geen herkomst-profiel" });
      }
      const [g] = await db
        .update(gebruikersTable)
        .set({ herkomstAutomatisch: false })
        .where(eq(gebruikersTable.id, id))
        .returning();
      return res.json(mapGebruiker(g));
    } catch (err) {
      req.log.error(err);
      return res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// POST /gebruikers/:id/herkomst-verwijderen — de herkomst-koppeling verwijderen.
// De bevoegdheden van de gebruiker blijven ongewijzigd; alleen de administratieve
// koppeling naar het profiel vervalt.
router.post(
  "/gebruikers/:id/herkomst-verwijderen",
  requireRol("hoofdbeheerder"),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id)) {
        return res.status(400).json({ error: "Ongeldig id" });
      }
      const [bestaande] = await db
        .select()
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, id));
      if (!bestaande) {
        return res.status(404).json({ error: "Gebruiker niet gevonden" });
      }
      const [g] = await db
        .update(gebruikersTable)
        .set({ herkomstProfielId: null, herkomstAutomatisch: false })
        .where(eq(gebruikersTable.id, id))
        .returning();
      return res.json(mapGebruiker(g));
    } catch (err) {
      req.log.error(err);
      return res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// DELETE /gebruikers/:id
router.delete("/gebruikers/:id", alleenBeheerder, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id), 10);
    await db.delete(gebruikersTable).where(eq(gebruikersTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
