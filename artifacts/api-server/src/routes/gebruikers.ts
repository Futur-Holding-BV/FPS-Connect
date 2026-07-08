import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { gebruikersTable, profielenTable } from "@workspace/db";
import { eq, and, isNotNull, inArray } from "drizzle-orm";
import { stuurUitnodigingsmail } from "../services/email";
import { requireBevoegdheid, requireRol, requireEnigeBevoegdheid } from "../middlewares/auth";
import { heeftNiveau, MODULE_IDS } from "@workspace/permissies";
import {
  kiesUniekeHerkomstPreset,
  magAutomatischKoppelen,
} from "../lib/herkomst";
import { maakGebruikerAan, isEmailConflictFout } from "../lib/gebruiker-aanmaken";

const router = Router();

const alleenBeheerder = requireBevoegdheid("gebruikers", 4);
const lezenGebruikers = requireBevoegdheid("gebruikers", 1);

// Minimale toewijsbare-personenlijst: leesbaar voor iedereen die ergens kan
// toewijzen (gebouwteam, spot-uitvoering, onderhoud), de gebruikersmodule
// heeft of de personeelsmodule heeft (HRM-onboarding koppelt een gebruiker).
// Bewust losgekoppeld van de gebruikers-module zodat gebouw-/voorzieningen-/
// personeelsrechten volstaan om iemand te selecteren.
const lezenToewijsbaar = requireEnigeBevoegdheid([
  ["gebouwen", 1],
  ["voorzieningen", 1],
  ["onderhoud", 1],
  ["gebruikers", 1],
  ["personeel", 1],
]);

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
  dienstverband: g.dienstverband ?? "intern",
  bedrijf_uitzendbureau: g.bedrijfUitzendbureau ?? null,
  gearchiveerd: g.gearchiveerd,
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
  gearchiveerd: g.gearchiveerd,
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
router.get("/gebruikers", lezenGebruikers, async (req, res): Promise<void> => {
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

// GET /toewijsbare-gebruikers
// Minimale lijst (id, naam, rol, functietitels) van personen die aan een
// gebouwteam, spot-uitvoering of onderhoudstaak toegewezen kunnen worden.
// Klanten worden uitgesloten. Geen e-mail/telefoon/bevoegdheden: alleen het
// minimum dat de toewijs-keuzelijsten nodig hebben.
router.get("/toewijsbare-gebruikers", lezenToewijsbaar, async (req, res): Promise<void> => {
  try {
    const rijen = await db
      .select({
        id: gebruikersTable.id,
        naam: gebruikersTable.naam,
        rol: gebruikersTable.rol,
        functietitels: gebruikersTable.functietitels,
        actief: gebruikersTable.actief,
      })
      .from(gebruikersTable)
      .orderBy(gebruikersTable.naam);
    res.json(
      rijen
        .filter((g) => g.rol !== "klant" && g.actief)
        .map((g) => ({
          id: g.id,
          naam: g.naam,
          rol: g.rol,
          functietitels: g.functietitels ?? [],
        })),
    );
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebruikers
router.post("/gebruikers", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const {
      naam, email, rol, functietitels, telefoon, bedrijf, wachtwoord,
      avatar_url, bedrijfslogo_url, bedrijfskleuren, taal, bevoegdheden,
      herkomst_profiel_id, dienstverband, bedrijf_uitzendbureau,
    } = req.body;
    if (!naam || !email || !rol) {
      return void res.status(400).json({ error: "naam, email en rol zijn verplicht" });
    }
    const functies = isBeheerderRol(rol)
      ? schoonFunctietitels(functietitels)
      : [];
    // Zelf-escalatiebeveiliging: niemand mag hogere niveaus toekennen dan eigen matrix.
    let toegestaanBevoegdheden: Record<string, number> = {};
    if (typeof bevoegdheden === "object" && bevoegdheden !== null) {
      if (!req.permissies!.isHoofdbeheerder) {
        for (const [mod, lvl] of Object.entries(bevoegdheden as Record<string, number>)) {
          if (typeof lvl === "number" && !req.permissies!.heeftModuleRecht(mod, lvl)) {
            return void res.status(403).json({
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
    const g = await maakGebruikerAan(db, {
      naam,
      email,
      rol,
      wachtwoord,
      functietitels: functies,
      telefoon,
      bedrijf,
      avatarUrl: avatar_url,
      bedrijfslogoUrl: bedrijfslogo_url,
      bedrijfskleuren,
      taal,
      bevoegdheden: toegestaanBevoegdheden,
      herkomstProfielId: herkomstId,
      herkomstAutomatisch,
      uitnodigingStatus: "niet_uitgenodigd",
      dienstverband,
      bedrijfUitzendbureau: bedrijf_uitzendbureau || null,
    });
    res.status(201).json(mapGebruiker(g));
  } catch (err: any) {
    if (isEmailConflictFout(err)) {
      return void res.status(409).json({ error: "Dit e-mailadres is al in gebruik bij een andere gebruiker." });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// GET /gebruikers/:id
router.get("/gebruikers/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [g] = await db.select().from(gebruikersTable).where(eq(gebruikersTable.id, id));
    if (!g) return void res.status(404).json({ error: "Gebruiker niet gevonden" });
    // Beheerders en het eigen account zien volledige gegevens; anderen alleen veilig.
    const volledig = id === req.session.userId || (await isBeheerder(req.session.userId));
    res.json(volledig ? mapGebruiker(g) : mapGebruikerPubliek(g));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// PATCH /gebruikers/:id
router.patch("/gebruikers/:id", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const {
      naam, email, rol, functietitels, telefoon, bedrijf, actief, wachtwoord,
      avatar_url, bedrijfslogo_url, bedrijfskleuren, uitnodiging_status, taal, bevoegdheden,
      herkomst_profiel_id, dienstverband, bedrijf_uitzendbureau,
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
    if (!bestaand) return void res.status(404).json({ error: "Gebruiker niet gevonden" });
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
      dienstverband: dienstverband || undefined,
      bedrijfUitzendbureau: bedrijf_uitzendbureau !== undefined ? (bedrijf_uitzendbureau || null) : undefined,
    };
    if (bevoegdheden !== undefined && typeof bevoegdheden === "object" && bevoegdheden !== null) {
      // Zelf-escalatiebeveiliging: niemand mag hogere niveaus toekennen dan eigen matrix.
      if (!req.permissies!.isHoofdbeheerder) {
        for (const [mod, lvl] of Object.entries(
          bevoegdheden as Record<string, number>,
        )) {
          if (typeof lvl === "number" && !req.permissies!.heeftModuleRecht(mod, lvl)) {
            return void res.status(403).json({
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
      const auto = await vindUniekeHerkomstPreset(wijziging.bevoegdheden!);
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
    if (!g) return void res.status(404).json({ error: "Gebruiker niet gevonden" });
    res.json(mapGebruiker(g));
  } catch (err: any) {
    if (err?.cause?.code === "23505" || err?.message?.includes("gebruikers_email_unique")) {
      return void res.status(409).json({ error: "Dit e-mailadres is al in gebruik bij een andere gebruiker." });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebruikers/:id/uitnodigen — eerste uitnodiging sturen
router.post("/gebruikers/:id/uitnodigen", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [bestaande] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, id));
    if (!bestaande) return void res.status(404).json({ error: "Gebruiker niet gevonden" });

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
        verstuurdDoorId: req.session.userId ?? null,
      });
    } catch (mailErr) {
      req.log.error(mailErr, "Uitnodigingsmail mislukt");
      return void res.status(502).json({
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
router.post("/gebruikers/:id/uitnodigen/opnieuw", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [bestaande] = await db
      .select()
      .from(gebruikersTable)
      .where(eq(gebruikersTable.id, id));
    if (!bestaande) return void res.status(404).json({ error: "Gebruiker niet gevonden" });
    if (bestaande.uitnodigingStatus === "geaccepteerd") {
      return void res.status(400).json({ error: "Gebruiker heeft de uitnodiging al geaccepteerd" });
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
        verstuurdDoorId: req.session.userId ?? null,
      });
    } catch (mailErr) {
      req.log.error(mailErr, "Uitnodigingsmail (opnieuw) mislukt");
      return void res.status(502).json({
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
  async (req, res): Promise<void> => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id)) {
        return void res.status(400).json({ error: "Ongeldig id" });
      }
      const [bestaande] = await db
        .select()
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, id));
      if (!bestaande) {
        return void res.status(404).json({ error: "Gebruiker niet gevonden" });
      }
      if (bestaande.herkomstProfielId == null) {
        return void res
          .status(400)
          .json({ error: "Gebruiker heeft geen herkomst-profiel" });
      }
      const [profiel] = await db
        .select({ bevoegdheden: profielenTable.bevoegdheden })
        .from(profielenTable)
        .where(eq(profielenTable.id, bestaande.herkomstProfielId));
      if (!profiel) {
        return void res
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
  async (req, res): Promise<void> => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id)) {
        return void res.status(400).json({ error: "Ongeldig id" });
      }
      const [bestaande] = await db
        .select()
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, id));
      if (!bestaande) {
        return void res.status(404).json({ error: "Gebruiker niet gevonden" });
      }
      if (bestaande.herkomstProfielId == null) {
        return void res
          .status(400)
          .json({ error: "Gebruiker heeft geen herkomst-profiel" });
      }
      const [g] = await db
        .update(gebruikersTable)
        .set({ herkomstAutomatisch: false })
        .where(eq(gebruikersTable.id, id))
        .returning();
      return void res.json(mapGebruiker(g));
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// POST /gebruikers/:id/herkomst-verwijderen — de herkomst-koppeling verwijderen.
// De bevoegdheden van de gebruiker blijven ongewijzigd; alleen de administratieve
// koppeling naar het profiel vervalt.
router.post(
  "/gebruikers/:id/herkomst-verwijderen",
  requireRol("hoofdbeheerder"),
  async (req, res): Promise<void> => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id)) {
        return void res.status(400).json({ error: "Ongeldig id" });
      }
      const [bestaande] = await db
        .select()
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, id));
      if (!bestaande) {
        return void res.status(404).json({ error: "Gebruiker niet gevonden" });
      }
      const [g] = await db
        .update(gebruikersTable)
        .set({ herkomstProfielId: null, herkomstAutomatisch: false })
        .where(eq(gebruikersTable.id, id))
        .returning();
      return void res.json(mapGebruiker(g));
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// POST /gebruikers/herkomst-bevestigen-bulk — bevestig in één handeling alle
// (of een geselecteerde set) automatisch afgeleide herkomst-koppelingen. De
// koppelingen blijven, maar worden voortaan als handmatig (bevestigd) behandeld.
// Optionele body { ids: number[] } beperkt de actie tot die gebruikers; zonder
// ids worden alle onbevestigde automatische koppelingen bevestigd.
router.post(
  "/gebruikers/herkomst-bevestigen-bulk",
  requireRol("hoofdbeheerder"),
  async (req, res): Promise<void> => {
    try {
      const ruweIds = (req.body as { ids?: unknown })?.ids;
      let ids: number[] | null = null;
      if (ruweIds !== undefined) {
        if (!Array.isArray(ruweIds)) {
          return void res.status(400).json({ error: "ids moet een lijst zijn" });
        }
        ids = ruweIds
          .map((v) => parseInt(String(v), 10))
          .filter((n) => Number.isInteger(n));
        if (ids.length === 0) {
          return void res.json({ bevestigd: 0 });
        }
      }

      const voorwaarde = and(
        isNotNull(gebruikersTable.herkomstProfielId),
        eq(gebruikersTable.herkomstAutomatisch, true),
        ids ? inArray(gebruikersTable.id, ids) : undefined,
      );

      const bijgewerkt = await db
        .update(gebruikersTable)
        .set({ herkomstAutomatisch: false })
        .where(voorwaarde)
        .returning({ id: gebruikersTable.id });

      return void res.json({ bevestigd: bijgewerkt.length });
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// POST /gebruikers/aanvullen — vul in alle gebruikers-matrices de ontbrekende
// module-sleutels aan op niveau 0 (Geen toegang). Effectieve toegang verandert
// niet (0 == ontbrekend); de sleutel wordt alleen expliciet vastgelegd zodat
// nieuwe modules niet stil ontbreken bij bestaande gebruikers. Moet vóór
// /gebruikers/:id staan zodat "aanvullen" niet als id wordt geïnterpreteerd.
router.post(
  "/gebruikers/aanvullen",
  requireRol("hoofdbeheerder"),
  async (req, res): Promise<void> => {
    try {
      const gebruikers = await db.select().from(gebruikersTable);
      let gebruikersAangevuld = 0;
      let sleutelsToegevoegd = 0;
      for (const g of gebruikers) {
        const huidig = (g.bevoegdheden as Record<string, number>) ?? {};
        const aangevuld: Record<string, number> = { ...huidig };
        let toegevoegd = 0;
        for (const m of MODULE_IDS) {
          if (!(m in aangevuld)) {
            aangevuld[m] = 0;
            toegevoegd++;
          }
        }
        if (toegevoegd > 0) {
          await db
            .update(gebruikersTable)
            .set({ bevoegdheden: aangevuld })
            .where(eq(gebruikersTable.id, g.id));
          gebruikersAangevuld++;
          sleutelsToegevoegd += toegevoegd;
        }
      }
      res.json({
        gebruikers_aangevuld: gebruikersAangevuld,
        sleutels_toegevoegd: sleutelsToegevoegd,
      });
    } catch (err) {
      req.log.error(err);
      res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// DELETE /gebruikers/:id — soft archivering (geen harde verwijdering)
router.delete("/gebruikers/:id", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    if (req.session.userId === id) {
      return void res.status(400).json({ error: "U kunt uw eigen account niet archiveren" });
    }
    const [bijgewerkt] = await db
      .update(gebruikersTable)
      .set({ gearchiveerd: true, actief: false })
      .where(eq(gebruikersTable.id, id))
      .returning();
    if (!bijgewerkt) return void res.status(404).json({ error: "Gebruiker niet gevonden" });
    res.status(204).send();
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebruikers/:id/herstellen
router.post("/gebruikers/:id/herstellen", alleenBeheerder, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params.id), 10);
    const [bijgewerkt] = await db
      .update(gebruikersTable)
      .set({ gearchiveerd: false, actief: true })
      .where(eq(gebruikersTable.id, id))
      .returning();
    if (!bijgewerkt) return void res.status(404).json({ error: "Gebruiker niet gevonden" });
    res.json(mapGebruiker(bijgewerkt));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
