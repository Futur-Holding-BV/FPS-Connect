import crypto from "node:crypto";
import { publiekeAppUrl } from "../lib/publiekeUrl";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import {
  gebruikersTable,
  profielenTable,
  gebruikerProfielenTable,
  wachtwoordResetTokensTable,
} from "@workspace/db";
import { eq, and, isNotNull, inArray, sql, asc } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import {
  stuurUitnodigingsmail,
  verstuurWachtwoordResetMail,
  MailFout,
  MAIL_FOUT_OMSCHRIJVING,
} from "../services/email";
import { requireBevoegdheid, requireRol, requireEnigeBevoegdheid } from "../middlewares/auth";
import { heeftNiveau, MODULE_IDS, combineerBevoegdheden } from "@workspace/permissies";
import {
  kiesUniekeHerkomstPreset,
  magAutomatischKoppelen,
} from "../lib/herkomst";
import { maakGebruikerAan, isEmailConflictFout } from "../lib/gebruiker-aanmaken";
import { berekenEffectieveBevoegdheden } from "../lib/effectieve-bevoegdheden";
import { beeindigSessiesVanGebruiker } from "../lib/session";
import { genereerTijdelijkWachtwoord } from "../lib/wachtwoord";
import { logAudit } from "../lib/audit";

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

// Veld-functies voor medewerkers met rol "gebruiker" (buitendienst en staf).
// Maximaal één per gebruiker; komt overeen met de FUNCTIE_GROEPEN in de frontend.
const VELD_FUNCTIETITELS_TOEGESTAAN = [
  "Projectleider",
  "Werkvoorbereider",
  "Project-admin",
  "Uitvoerder",
  "Monteur",
  "Timmerman",
  "Controleur",
  "Commercieel",
  "Financieel",
  "Externe boekhouder",
  "HRM-adviseur",
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

// Normaliseer en valideer veld-functietitels: maximaal één toegestane waarde.
const schoonVeldFunctietitels = (waarde: unknown): string[] => {
  if (!Array.isArray(waarde)) return [];
  const geldig = waarde
    .filter((f): f is string => typeof f === "string")
    .map((f) => f.trim())
    .filter((f) => VELD_FUNCTIETITELS_TOEGESTAAN.includes(f));
  return geldig.slice(0, 1);
};

const mapGebruiker = (g: typeof gebruikersTable.$inferSelect, profielIds?: number[]) => ({
  profiel_ids: profielIds,
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
  uitzendbureau_id: g.uitzendbureauId ?? null,
  gearchiveerd: g.gearchiveerd,
  moet_wachtwoord_wijzigen: g.moetWachtwoordWijzigen ?? false,
  mislukte_pogingen: g.misluktePogingen ?? 0,
  vergrendeld_tot: g.vergrendeldTot ? g.vergrendeldTot.toISOString() : null,
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

// ── P2: meerdere rollen (profielen) per gebruiker ──────────────────────────
// Parseer en valideer een profiel_ids-payload. undefined = niet meegestuurd
// (koppelingen ongemoeid laten); een array vervangt de volledige set.
function parseProfielIds(invoer: unknown): { ids?: number[]; fout: string | null } {
  if (invoer === undefined) return { fout: null };
  if (!Array.isArray(invoer)) {
    return { fout: "profiel_ids moet een lijst van profiel-id's zijn" };
  }
  const ids: number[] = [];
  for (const waarde of invoer) {
    if (typeof waarde !== "number" || !Number.isInteger(waarde)) {
      return { fout: "profiel_ids mag alleen gehele profiel-id's bevatten" };
    }
    if (!ids.includes(waarde)) ids.push(waarde);
  }
  return { ids, fout: null };
}

// Haal de bevoegdheden-matrices van een set profielen op. Retourneert null
// wanneer één of meer id's niet bestaan (de route hoort dan 400 te geven).
async function haalProfielMatrices(
  ids: number[],
): Promise<Record<string, number>[] | null> {
  if (ids.length === 0) return [];
  const rijen = await db
    .select({ id: profielenTable.id, bevoegdheden: profielenTable.bevoegdheden })
    .from(profielenTable)
    .where(inArray(profielenTable.id, ids));
  if (rijen.length !== ids.length) return null;
  return rijen.map((r) => (r.bevoegdheden as Record<string, number>) ?? {});
}

// Gekoppelde profiel-id's per gebruiker (koppeltabel gebruiker_profielen), in
// één query voor een hele lijst gebruikers — vermijdt N+1 op het overzicht.
async function profielIdsPerGebruiker(
  gebruikerIds: number[],
): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (gebruikerIds.length === 0) return map;
  const rijen = await db
    .select({
      gebruikerId: gebruikerProfielenTable.gebruikerId,
      profielId: gebruikerProfielenTable.profielId,
    })
    .from(gebruikerProfielenTable)
    .where(inArray(gebruikerProfielenTable.gebruikerId, gebruikerIds))
    .orderBy(asc(gebruikerProfielenTable.profielId));
  for (const r of rijen) {
    const lijst = map.get(r.gebruikerId) ?? [];
    lijst.push(r.profielId);
    map.set(r.gebruikerId, lijst);
  }
  return map;
}

async function isBeheerder(userId: number | undefined): Promise<boolean> {
  if (!userId) return false;
  const [g] = await db
    .select({ rol: gebruikersTable.rol, bevoegdheden: gebruikersTable.bevoegdheden })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, userId));
  if (!g) return false;
  if (g.rol === "hoofdbeheerder") return true;
  const { berekenEffectieveBevoegdhedenBatch } = await import("../lib/effectieve-bevoegdheden");
  const kaart = await berekenEffectieveBevoegdhedenBatch([
    { id: userId, rol: g.rol, storedBevoegdheden: g.bevoegdheden },
  ]);
  return heeftNiveau(kaart.get(userId) ?? {}, "gebruikers", 1);
}

function domein(): string {
  return publiekeAppUrl()?.replace(/^https?:\/\//, "") || "localhost";
}

// GET /gebruikers
router.get("/gebruikers", lezenGebruikers, async (req, res): Promise<void> => {
  try {
    const gebruikers = await db.select().from(gebruikersTable);
    const volledig = await isBeheerder(req.session.userId);
    if (!volledig) {
      return void res.json(gebruikers.map((g) => mapGebruikerPubliek(g)));
    }
    const koppel = await profielIdsPerGebruiker(gebruikers.map((g) => g.id));
    res.json(gebruikers.map((g) => mapGebruiker(g, koppel.get(g.id) ?? [])));
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
      herkomst_profiel_id, profiel_ids, dienstverband, bedrijf_uitzendbureau,
      uitzendbureau_id,
    } = req.body;
    if (!naam || !email || !rol) {
      return void res.status(400).json({ error: "naam, email en rol zijn verplicht" });
    }
    const functies = isBeheerderRol(rol)
      ? schoonFunctietitels(functietitels)
      : rol === "gebruiker"
        ? schoonVeldFunctietitels(functietitels)
        : [];
    // P2: meerdere rollen (profielen). profiel_ids vervangt de volledige set
    // koppelingen; de matrices zijn nodig voor de afgeleide effectieve matrix.
    const { ids: profielIds, fout: profielFout } = parseProfielIds(profiel_ids);
    if (profielFout) return void res.status(400).json({ error: profielFout });
    let matrices: Record<string, number>[] = [];
    if (profielIds && profielIds.length > 0) {
      const gevonden = await haalProfielMatrices(profielIds);
      if (!gevonden) {
        return void res.status(400).json({ error: "Eén of meer profielen bestaan niet" });
      }
      matrices = gevonden;
    }
    // Effectieve matrix: bij meegestuurde rollen wordt de matrix ALTIJD
    // server-side afgeleid (per module het hoogste niveau over alle rollen;
    // lege set = geen toegang, consistent met PATCH). Rollen zijn de bron van
    // waarheid; een meegestuurde client-matrix kan die niet overschrijven —
    // uitzonderingen horen een eigen benoemde rol te worden, geen losse
    // per-gebruiker rechten (eis 7). Alleen zonder profiel_ids in de request
    // geldt het legacy-pad met een meegestuurde matrix (oudere clients).
    let toegestaanBevoegdheden: Record<string, number> = {};
    if (profielIds !== undefined) {
      toegestaanBevoegdheden = combineerBevoegdheden(matrices);
    } else if (typeof bevoegdheden === "object" && bevoegdheden !== null) {
      toegestaanBevoegdheden = bevoegdheden as Record<string, number>;
    }
    // Zelf-escalatiebeveiliging: niemand mag hogere niveaus toekennen dan eigen
    // matrix — geldt ook voor de uit rollen afgeleide matrix.
    // Uitzondering: wie volledig gebruikersbeheer heeft (gebruikers: 4) mag elk
    // profiel toewijzen, ook als dat hogere rechten in andere modules bevat.
    const heeftVolledigGebruikersbeheer = req.permissies!.heeftModuleRecht("gebruikers", 4);
    if (!req.permissies!.isHoofdbeheerder && !heeftVolledigGebruikersbeheer) {
      for (const [mod, lvl] of Object.entries(toegestaanBevoegdheden)) {
        if (typeof lvl === "number" && !req.permissies!.heeftModuleRecht(mod, lvl)) {
          const moduleLabel = mod;
          return void res.status(403).json({
            error: `Geen toegang: u kunt niveau ${lvl} voor module '${moduleLabel}' niet toewijzen omdat uw eigen toegangsniveau lager is. Vraag een beheerder met volledige gebruikersbeheer-rechten om dit profiel te koppelen.`,
          });
        }
      }
    }
    let herkomstId =
      typeof herkomst_profiel_id === "number" && Number.isInteger(herkomst_profiel_id)
        ? herkomst_profiel_id
        : null;
    // Een expliciet gekozen preset is een handmatige koppeling.
    let herkomstAutomatisch = false;
    if (profielIds !== undefined) {
      // Rollen expliciet meegestuurd: herkomst volgt de rollen. Bij precies één
      // rol blijft het bestaande single-preset gedrag gelden; bij meerdere is
      // een enkelvoudige herkomst misleidend en blijft die leeg.
      herkomstId = profielIds.length === 1 ? profielIds[0] : null;
    } else if (herkomstId == null) {
      // Geen expliciete preset gekozen, maar de meegestuurde matrix komt exact en
      // als enige overeen met een profiel? Markeer dat profiel dan als herkomst
      // (automatisch afgeleid).
      herkomstId = await vindUniekeHerkomstPreset(toegestaanBevoegdheden);
      herkomstAutomatisch = herkomstId != null;
    }
    const g = await db.transaction(async (tx) => {
      const nieuw = await maakGebruikerAan(tx, {
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
        uitzendbureauId: typeof uitzendbureau_id === "number" ? uitzendbureau_id : null,
      });
      if (profielIds && profielIds.length > 0) {
        await tx.insert(gebruikerProfielenTable).values(
          profielIds.map((pid) => ({ gebruikerId: nieuw.id, profielId: pid })),
        );
      }
      return nieuw;
    });
    res.status(201).json(mapGebruiker(g, profielIds ?? []));
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
    if (!volledig) return void res.json(mapGebruikerPubliek(g));
    const [koppel, effectieveBev] = await Promise.all([
      profielIdsPerGebruiker([id]),
      berekenEffectieveBevoegdheden(id),
    ]);
    res.json({
      ...mapGebruiker(g, koppel.get(id) ?? []),
      effectieve_bevoegdheden: effectieveBev,
    });
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
      herkomst_profiel_id, profiel_ids, dienstverband, bedrijf_uitzendbureau,
      uitzendbureau_id,
    } = req.body;
    // P2: meerdere rollen (profielen). undefined = koppelingen ongemoeid laten;
    // een array vervangt de volledige set.
    const { ids: profielIds, fout: profielFout } = parseProfielIds(profiel_ids);
    if (profielFout) return void res.status(400).json({ error: profielFout });
    let profielMatrices: Record<string, number>[] = [];
    if (profielIds && profielIds.length > 0) {
      const gevonden = await haalProfielMatrices(profielIds);
      if (!gevonden) {
        return void res.status(400).json({ error: "Eén of meer profielen bestaan niet" });
      }
      profielMatrices = gevonden;
    }
    // Bestaande rol én functietitels ophalen: zo wist een partiële PATCH niets
    // onterecht, terwijl een expliciete rolwissel de oude functies wél opschoont.
    const [bestaand] = await db
      .select({
        rol: gebruikersTable.rol,
        functietitels: gebruikersTable.functietitels,
        herkomstProfielId: gebruikersTable.herkomstProfielId,
        actief: gebruikersTable.actief,
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
    } else if (effectieveRol === "gebruiker") {
      // Gebruiker: maximaal één veld-functie (Timmerman, Monteur, etc.).
      // Niet meegestuurd = bestaande waarde ongemoeid laten, behalve bij rolwissel
      // waarbij kantoor-functies moeten worden opgeschoond.
      if (functietitels !== undefined) {
        functies = schoonVeldFunctietitels(functietitels);
      } else if (rolGewijzigd) {
        // Rolwissel ván hoofdbeheerder: kantoor-functies opschonen, veld-functies
        // zijn er dan nog niet — leeg is correct.
        functies = [];
      }
      // undefined: geen veld in de update → bestaande waarde blijft staan
    } else {
      // Klant: geen functietitel.
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
      uitzendbureauId: uitzendbureau_id !== undefined
        ? (typeof uitzendbureau_id === "number" ? uitzendbureau_id : null)
        : undefined,
    };
    // AVG: opschoonklok alleen aanraken bij een echte overgang, nooit bij een
    // no-op PATCH (anders reset elke onbedoelde `actief`-meesturing de termijn).
    if (typeof actief === "boolean" && actief !== bestaand.actief) {
      wijziging.gedeactiveerdOp = actief ? null : new Date();
    }
    // Effectieve matrix: bij meegestuurde rollen wordt de matrix ALTIJD
    // server-side afgeleid (per module het hoogste niveau over alle rollen;
    // lege set = geen toegang). Rollen zijn de bron van waarheid; een
    // meegestuurde client-matrix kan die niet overschrijven — uitzonderingen
    // horen een eigen benoemde rol te worden (eis 7). Alleen zonder rollen
    // geldt het legacy-pad met een meegestuurde matrix (oudere clients).
    let nieuweMatrix: Record<string, number> | undefined;
    if (profielIds !== undefined) {
      nieuweMatrix = combineerBevoegdheden(profielMatrices);
    } else if (bevoegdheden !== undefined && typeof bevoegdheden === "object" && bevoegdheden !== null) {
      nieuweMatrix = bevoegdheden as Record<string, number>;
    }
    if (nieuweMatrix !== undefined) {
      // Zelf-escalatiebeveiliging: niemand mag hogere niveaus toekennen dan
      // eigen matrix — geldt ook voor de uit rollen afgeleide matrix.
      // Uitzondering: wie volledig gebruikersbeheer heeft (gebruikers: 4) mag elk
      // profiel toewijzen, ook als dat hogere rechten in andere modules bevat.
      const heeftVolledigGebruikersbeheerPatch = req.permissies!.heeftModuleRecht("gebruikers", 4);
      if (!req.permissies!.isHoofdbeheerder && !heeftVolledigGebruikersbeheerPatch) {
        for (const [mod, lvl] of Object.entries(nieuweMatrix)) {
          if (typeof lvl === "number" && !req.permissies!.heeftModuleRecht(mod, lvl)) {
            const moduleLabel = mod;
            return void res.status(403).json({
              error: `Geen toegang: u kunt niveau ${lvl} voor module '${moduleLabel}' niet toewijzen omdat uw eigen toegangsniveau lager is. Vraag een beheerder met volledige gebruikersbeheer-rechten om dit profiel te koppelen.`,
            });
          }
        }
      }
      // Functie-profielen worden op-het-vlak berekend (berekenEffectieveBevoegdhedenBatch)
      // en NIET in de stored matrix opgeslagen — anders zou de on-the-fly berekening
      // ze dubbel meenemen. De stored matrix bevat uitsluitend expliciet toegewezen rechten.
      wijziging.bevoegdheden = nieuweMatrix;
    }
    // Herkomst (preset) alleen wijzigen wanneer expliciet meegestuurd: null wist
    // de koppeling, een geldig id (her)koppelt. undefined laat het veld ongemoeid.
    // Een expliciet meegestuurde herkomst is altijd een handmatige (bevestigde)
    // koppeling, dus automatisch-vlag op false.
    if (profielIds !== undefined) {
      // P2: rollen expliciet meegestuurd — herkomst volgt de rollen. Bij precies
      // één rol blijft het single-preset gedrag gelden; bij meerdere (of nul)
      // is een enkelvoudige herkomst misleidend en wordt die gewist.
      wijziging.herkomstProfielId = profielIds.length === 1 ? profielIds[0] : null;
      wijziging.herkomstAutomatisch = false;
    } else if (herkomst_profiel_id !== undefined) {
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
    // Update en koppelingen-sync in één transactie: profiel_ids vervangt de
    // volledige set (delete + insert), zodat matrix en rollen nooit uiteenlopen.
    const g = await db.transaction(async (tx) => {
      const [rij] = await tx
        .update(gebruikersTable)
        .set(wijziging)
        .where(eq(gebruikersTable.id, id))
        .returning();
      if (!rij) return undefined;
      if (profielIds !== undefined) {
        await tx
          .delete(gebruikerProfielenTable)
          .where(eq(gebruikerProfielenTable.gebruikerId, id));
        if (profielIds.length > 0) {
          await tx.insert(gebruikerProfielenTable).values(
            profielIds.map((pid) => ({ gebruikerId: id, profielId: pid })),
          );
        }
      }
      return rij;
    });
    if (!g) return void res.status(404).json({ error: "Gebruiker niet gevonden" });
    const koppel =
      profielIds ?? (await profielIdsPerGebruiker([id])).get(id) ?? [];
    res.json(mapGebruiker(g, koppel));
  } catch (err: any) {
    if (err?.cause?.code === "23505" || err?.message?.includes("gebruikers_email_unique")) {
      return void res.status(409).json({ error: "Dit e-mailadres is al in gebruik bij een andere gebruiker." });
    }
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /gebruikers/:id/wachtwoord-resetten — hoofdbeheerder-only. Reset het
// wachtwoord van een gebruiker via een resetlink (e-mail) of een eenmalig
// tijdelijk wachtwoord. Dwingt in beide gevallen een wachtwoordwijziging af bij
// de eerstvolgende login, trekt bestaande sessies en mobiele tokens in en heft
// een eventuele accountvergrendeling op. Optioneel wordt ook de
// TOTP-registratie gewist zodat de gebruiker MFA opnieuw moet instellen.
router.post(
  "/gebruikers/:id/wachtwoord-resetten",
  requireRol("hoofdbeheerder"),
  async (req, res): Promise<void> => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id)) {
        return void res.status(400).json({ error: "Ongeldig id" });
      }
      const { methode, mfa_resetten } = req.body ?? {};
      if (methode !== "link" && methode !== "tijdelijk") {
        return void res
          .status(400)
          .json({ error: "methode moet 'link' of 'tijdelijk' zijn" });
      }
      const [bestaande] = await db
        .select()
        .from(gebruikersTable)
        .where(eq(gebruikersTable.id, id));
      if (!bestaande) return void res.status(404).json({ error: "Gebruiker niet gevonden" });

      const mfaResetten = mfa_resetten === true;
      const wijziging: PgUpdateSetSource<typeof gebruikersTable> = {
        moetWachtwoordWijzigen: true,
        misluktePogingen: 0,
        vergrendeldTot: null,
        tokenVersie: sql`${gebruikersTable.tokenVersie} + 1`,
      };
      if (mfaResetten) {
        wijziging.totpSecret = null;
        wijziging.tweeFactorIngeschakeld = false;
      }

      let tijdelijkWachtwoord: string | null = null;
      if (methode === "tijdelijk") {
        tijdelijkWachtwoord = genereerTijdelijkWachtwoord();
        wijziging.wachtwoord = await bcrypt.hash(tijdelijkWachtwoord, 10);
      }

      let resetlinkVerstuurd = false;
      if (methode === "link") {
        const token = crypto.randomBytes(32).toString("hex");
        const verlooptOp = new Date(Date.now() + 60 * 60 * 1000);
        try {
          await verstuurWachtwoordResetMail({
            naarEmail: bestaande.email,
            naarNaam: bestaande.naam,
            resetLink: `https://${domein()}/wachtwoord-reset?token=${token}`,
          });
        } catch (mailErr) {
          req.log.error(mailErr, "Admin-wachtwoordreset: resetmail mislukt");
          const melding =
            mailErr instanceof MailFout
              ? MAIL_FOUT_OMSCHRIJVING[mailErr.categorie]
              : "De resetlink kon niet worden verzonden. Probeer het later opnieuw.";
          return void res.status(502).json({ error: melding });
        }
        await db.insert(wachtwoordResetTokensTable).values({
          gebruikerId: id,
          token,
          verlooptOp,
        });
        resetlinkVerstuurd = true;
      }

      await db.update(gebruikersTable).set(wijziging).where(eq(gebruikersTable.id, id));

      // Alle bestaande sessies en mobiele tokens intrekken — de gebruiker moet
      // opnieuw inloggen (met het nieuwe wachtwoord of via de resetlink).
      await beeindigSessiesVanGebruiker(id);

      logAudit({
        gebruikerId: req.session.userId ?? null,
        gebruikerNaam: null,
        ipAdres: req.ip ?? null,
        sessieId: null,
        module: "gebruikers",
        actie: "wachtwoord_resetten",
        entiteit: "gebruiker",
        entiteitId: id,
        entiteitNaam: bestaande.naam,
        oudeWaarde: null,
        nieuweWaarde: null,
        workflowStatus: null,
        gebouwId: null,
        medewerkerId: null,
        documentId: null,
        meta: { methode, mfa_resetten: mfaResetten },
      });

      if (methode === "tijdelijk") {
        return void res.json({ tijdelijk_wachtwoord: tijdelijkWachtwoord });
      }
      return void res.json({ resetlink_verstuurd: resetlinkVerstuurd });
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// POST /gebruikers/:id/sessies-beeindigen — hoofdbeheerder-only. Trekt alle
// actieve web-sessies en mobiele tokens van de gebruiker in (zonder het
// wachtwoord te wijzigen), bv. bij verlies van een apparaat.
router.post(
  "/gebruikers/:id/sessies-beeindigen",
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
      if (!bestaande) return void res.status(404).json({ error: "Gebruiker niet gevonden" });

      await db
        .update(gebruikersTable)
        .set({ tokenVersie: sql`${gebruikersTable.tokenVersie} + 1` })
        .where(eq(gebruikersTable.id, id));
      const aantal = await beeindigSessiesVanGebruiker(id);

      logAudit({
        gebruikerId: req.session.userId ?? null,
        gebruikerNaam: null,
        ipAdres: req.ip ?? null,
        sessieId: null,
        module: "gebruikers",
        actie: "sessies_beeindigen",
        entiteit: "gebruiker",
        entiteitId: id,
        entiteitNaam: bestaande.naam,
        oudeWaarde: null,
        nieuweWaarde: null,
        workflowStatus: null,
        gebouwId: null,
        medewerkerId: null,
        documentId: null,
        meta: { sessies_beeindigd: aantal },
      });

      return void res.json({ sessies_beeindigd: aantal });
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

// POST /gebruikers/:id/ontgrendelen — hoofdbeheerder-only. Heft een
// accountvergrendeling (na herhaalde mislukte inlogpogingen) direct op.
router.post(
  "/gebruikers/:id/ontgrendelen",
  requireRol("hoofdbeheerder"),
  async (req, res): Promise<void> => {
    try {
      const id = parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id)) {
        return void res.status(400).json({ error: "Ongeldig id" });
      }
      const [g] = await db
        .update(gebruikersTable)
        .set({ misluktePogingen: 0, vergrendeldTot: null })
        .where(eq(gebruikersTable.id, id))
        .returning();
      if (!g) return void res.status(404).json({ error: "Gebruiker niet gevonden" });

      logAudit({
        gebruikerId: req.session.userId ?? null,
        gebruikerNaam: null,
        ipAdres: req.ip ?? null,
        sessieId: null,
        module: "gebruikers",
        actie: "ontgrendelen",
        entiteit: "gebruiker",
        entiteitId: id,
        entiteitNaam: g.naam,
        oudeWaarde: null,
        nieuweWaarde: null,
        workflowStatus: null,
        gebouwId: null,
        medewerkerId: null,
        documentId: null,
        meta: null,
      });

      return void res.json(mapGebruiker(g));
    } catch (err) {
      req.log.error(err);
      return void res.status(500).json({ error: "Interne serverfout" });
    }
  },
);

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
      const melding =
        mailErr instanceof MailFout
          ? MAIL_FOUT_OMSCHRIJVING[mailErr.categorie]
          : "De uitnodiging kon niet worden verzonden. Probeer het later opnieuw.";
      return void res.status(502).json({ error: melding });
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
      const melding =
        mailErr instanceof MailFout
          ? MAIL_FOUT_OMSCHRIJVING[mailErr.categorie]
          : "De herinnering kon niet worden verzonden. Probeer het later opnieuw.";
      return void res.status(502).json({ error: melding });
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

// POST /gebruikers/:id/activatielink — token genereren zonder e-mail te sturen.
// De beheerder kan de link handmatig delen (bv. via WhatsApp/chat) wanneer
// e-mailconfiguratie ontbreekt of de gebruiker geen uitnodigingsmail ontvangt.
router.post("/gebruikers/:id/activatielink", alleenBeheerder, async (req, res): Promise<void> => {
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
    await db
      .update(gebruikersTable)
      .set({
        uitnodigingStatus: "uitgenodigd",
        uitnodigingVerstuurdOp: bestaande.uitnodigingVerstuurdOp ?? new Date(),
        uitnodigingToken: token,
        uitnodigingVerlooptOp: verlooptOp,
      })
      .where(eq(gebruikersTable.id, id));
    res.json({ link: activatieLink, verloopt_op: verlooptOp.toISOString() });
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
      .set({
        gearchiveerd: true,
        actief: false,
        // AVG: alleen de klok starten bij de overgang actief -> inactief;
        // opnieuw archiveren van een al-inactief account mag de bestaande
        // opschoontermijn niet resetten.
        gedeactiveerdOp: sql`CASE WHEN ${gebruikersTable.actief} THEN now() ELSE ${gebruikersTable.gedeactiveerdOp} END`,
      })
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
      .set({ gearchiveerd: false, actief: true, gedeactiveerdOp: null })
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
