// WERKBAK_02 — teamoverleg, eigen taken en de persoonlijke AI-workflow.
// Desktop-only (de telefoon-app blijft ongemoeid). Geen Trello-kloon, geen
// nieuwe meldingentabel: alles hangt aan de bestaande werkbak.
//
// Kernregels:
// - Eigen taak = bron "eigen": één eigenaar + einddatum VERPLICHT (§4).
//   Zonder die twee is het geen taak — de frontend biedt dan actief aan er
//   een gebouwaantekening (NOTITIE_01) van te maken; de server geeft 422.
// - Meewerkers mogen bijwerken; alleen de eigenaar rondt af (§4).
// - Teamoverzicht (§6): alleen voor personeel≥2 of planning≥2; toont taken
//   (bron eigen) en een kleine whitelist werk-signalen — nooit verlof,
//   salaris, persoonlijke of financieel/personeel-items.
// - Sterren (§7.3): persoonlijk en privé. Nooit zichtbaar voor een ander.
// - AI (§7): bepaalt NIET wat belangrijk is, herordent nooit over een
//   sterniveau heen; zegt alleen wat ontbreekt (uit de gegevens), groepeert
//   en zegt wat kan wachten — als zichtbaar voorstel met reden.
import { Router, type Request } from "express";
import {
  db,
  werkbakItemsTable,
  overleggenTable,
  workflowSterrenTable,
  gebruikersTable,
  werkInboxMailsTable,
} from "@workspace/db";
import { and, desc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import { requireAuth, requireEnigeBevoegdheid } from "../middlewares/auth";
import { meldWerkbakItem } from "../lib/werkbakService";
import { toegankelijkeMailboxen } from "../services/werkInboxToegang";
import { aiGateway } from "../lib/aiGateway";
import type { WerkbakItem } from "@workspace/db";

const router = Router();

// §6 — welke signaal-bronnen mogen op teamniveau getoond worden. Bewust een
// whitelist (fail-closed): persoonlijke en financieel/personeel-bronnen staan
// er niet in en komen er alleen via een expliciet besluit bij.
const TEAM_SIGNAAL_BRONNEN = [
  "voorziening_openstaand",
  "regie_openstaand",
  "meerwerk_melding",
  "materiaal_afwijking",
  "toebehoren_aanvraag",
  "uren_niet_in_begroting",
];

const teamGate = requireEnigeBevoegdheid([["personeel", 2], ["planning", 2]]);

function isDatum(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function mapTaak(i: WerkbakItem, namen: Map<number, string>) {
  return {
    id: i.id,
    soort: i.soort,
    bron: i.bron,
    titel: i.titel,
    omschrijving: i.omschrijving,
    status: i.status,
    deadline: i.deadline,
    eigenaar_id: i.gebruikerId,
    eigenaar_naam: i.gebruikerId != null ? namen.get(i.gebruikerId) ?? null : null,
    meewerker_ids: i.meewerkerIds,
    meewerker_namen: i.meewerkerIds.map((id) => namen.get(id)).filter((n): n is string => !!n),
    overleg_id: i.overlegId,
    gewicht: i.gewicht,
    actie_pad: i.actiePad,
    aangemaakt_op: i.aangemaaktOp.toISOString(),
    bijgewerkt_op: i.bijgewerktOp.toISOString(),
  };
}

async function naamMap(): Promise<Map<number, string>> {
  const rijen = await db.select({ id: gebruikersTable.id, naam: gebruikersTable.naam }).from(gebruikersTable);
  return new Map(rijen.map((r) => [r.id, r.naam]));
}

// ── Eigen taken (§4) ─────────────────────────────────────────────────────────

router.post("/werkbak/taken", requireAuth, async (req, res): Promise<void> => {
  try {
    if (req.permissies?.isKlant) { res.status(403).json({ error: "Geen toegang" }); return; }
    const b = req.body ?? {};
    const titel = typeof b.titel === "string" ? b.titel.trim() : "";
    if (!titel) { res.status(400).json({ error: "Titel is verplicht" }); return; }
    const soort = b.soort === "idee" ? "idee" : "doen";
    const eigenaarId = Number.isInteger(b.eigenaar_id) ? (b.eigenaar_id as number) : null;
    const deadline = isDatum(b.deadline) ? b.deadline : null;
    // §4: zonder eigenaar + datum is het geen taak. Uitzondering: een idee
    // (§5 blok 4) mag zonder datum bestaan, maar heeft wél een eigenaar.
    if (!eigenaarId || (soort === "doen" && !deadline)) {
      res.status(422).json({
        error: "Een taak heeft één eigenaar en een einddatum nodig",
        code: "EIGENAAR_EN_DATUM_VERPLICHT",
        suggestie: "gebouwnotitie",
      });
      return;
    }
    const meewerkers: number[] = Array.isArray(b.meewerker_ids)
      ? [...new Set((b.meewerker_ids as unknown[]).filter((x): x is number => Number.isInteger(x) && x !== eigenaarId))]
      : [];
    // Eigenaar en meewerkers moeten bestaande, actieve gebruikers zijn.
    const ids = [eigenaarId, ...meewerkers];
    const bekend = await db.select({ id: gebruikersTable.id }).from(gebruikersTable)
      .where(and(inArray(gebruikersTable.id, ids), eq(gebruikersTable.actief, true)));
    if (bekend.length !== ids.length) { res.status(400).json({ error: "Onbekende of inactieve gebruiker als eigenaar/meewerker" }); return; }
    const dedupSleutel = `eigen:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    await meldWerkbakItem({
      soort: soort === "idee" ? "weten" : "doen",
      bron: "eigen",
      titel,
      omschrijving: typeof b.omschrijving === "string" ? b.omschrijving.trim() || null : null,
      gebruikerId: eigenaarId,
      herkomstType: soort === "idee" ? "eigen_idee" : "eigen_taak",
      dedupSleutel,
      deadline,
      meewerkerIds: meewerkers,
      overlegId: Number.isInteger(b.overleg_id) ? (b.overleg_id as number) : null,
    });
    const [item] = await db.select().from(werkbakItemsTable).where(eq(werkbakItemsTable.dedupSleutel, dedupSleutel));
    // Proefperiode-telling (§4): gelijkende titels alleen tellen, niets automatisch.
    res.status(201).json(mapTaak(item!, await naamMap()));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Bijwerken: eigenaar én meewerkers. Afronden hoort hier NIET — dat loopt via
// POST /werkbak/:id/afhandelen, waar alleen de eigenaar doorheen komt.
router.patch("/werkbak/taken/:id", requireAuth, async (req, res): Promise<void> => {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id)) { res.status(400).json({ error: "Ongeldig id" }); return; }
    const [item] = await db.select().from(werkbakItemsTable).where(eq(werkbakItemsTable.id, id));
    if (!item || item.bron !== "eigen") { res.status(404).json({ error: "Taak niet gevonden" }); return; }
    const uid = req.session.userId!;
    const magBijwerken = item.gebruikerId === uid || item.meewerkerIds.includes(uid) || req.permissies?.isHoofdbeheerder;
    if (!magBijwerken) { res.status(403).json({ error: "Alleen eigenaar of meewerkers kunnen bijwerken" }); return; }
    if (item.status !== "open") { res.status(409).json({ error: "Taak is niet meer open" }); return; }
    const b = req.body ?? {};
    const set: Partial<typeof werkbakItemsTable.$inferInsert> = { bijgewerktOp: new Date() };
    if (typeof b.titel === "string" && b.titel.trim()) set.titel = b.titel.trim();
    if (typeof b.omschrijving === "string") set.omschrijving = b.omschrijving.trim() || null;
    if (isDatum(b.deadline)) set.deadline = b.deadline;
    if (Array.isArray(b.meewerker_ids)) {
      // Meewerkers wijzigen is aan de eigenaar (of hoofdbeheerder).
      if (item.gebruikerId !== uid && !req.permissies?.isHoofdbeheerder) {
        res.status(403).json({ error: "Alleen de eigenaar kan meewerkers wijzigen" }); return;
      }
      const nieuwe = [...new Set((b.meewerker_ids as unknown[]).filter((x): x is number => Number.isInteger(x) && x !== item.gebruikerId))];
      if (nieuwe.length > 0) {
        const bekend = await db.select({ id: gebruikersTable.id }).from(gebruikersTable)
          .where(and(inArray(gebruikersTable.id, nieuwe), eq(gebruikersTable.actief, true)));
        if (bekend.length !== nieuwe.length) { res.status(400).json({ error: "Onbekende of inactieve gebruiker als meewerker" }); return; }
      }
      set.meewerkerIds = nieuwe;
    }
    const [bijgewerkt] = await db.update(werkbakItemsTable).set(set).where(eq(werkbakItemsTable.id, id)).returning();
    res.json(mapTaak(bijgewerkt!, await naamMap()));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Teamoverzicht (§6) ───────────────────────────────────────────────────────

router.get("/werkbak/team", requireAuth, teamGate, async (req, res): Promise<void> => {
  try {
    const namen = await naamMap();
    const taken = await db.select().from(werkbakItemsTable)
      .where(and(eq(werkbakItemsTable.bron, "eigen"), eq(werkbakItemsTable.status, "open")))
      .orderBy(werkbakItemsTable.deadline, desc(werkbakItemsTable.aangemaaktOp));
    // Werk-signalen: alleen de whitelist, en per herkomst ontdubbeld (dezelfde
    // spot levert per ontvanger een item op; het team hoeft hem één keer te zien).
    const signalenRuw = await db.select().from(werkbakItemsTable)
      .where(and(inArray(werkbakItemsTable.bron, TEAM_SIGNAAL_BRONNEN), eq(werkbakItemsTable.status, "open")))
      .orderBy(desc(werkbakItemsTable.gewicht));
    const gezien = new Set<string>();
    const signalen = signalenRuw.filter((s) => {
      const sleutel = `${s.bron}:${s.herkomstType}:${s.herkomstId}`;
      if (gezien.has(sleutel)) return false;
      gezien.add(sleutel);
      return true;
    });
    res.json({
      taken: taken.map((t) => mapTaak(t, namen)),
      signalen: signalen.map((s) => ({
        id: s.id, bron: s.bron, titel: s.titel, omschrijving: s.omschrijving,
        gewicht: s.gewicht, actie_pad: s.actiePad, aangemaakt_op: s.aangemaaktOp.toISOString(),
      })),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Wekelijks overleg (§5) ───────────────────────────────────────────────────

// Agenda in vaste volgorde: 1 afgesproken vorige week · 2 loopt vast ·
// 3 nieuw sinds vorige week · 4 plannen & ideeën.
router.get("/overleg/agenda", requireAuth, teamGate, async (req, res): Promise<void> => {
  try {
    const namen = await naamMap();
    const [laatste] = await db.select().from(overleggenTable).orderBy(desc(overleggenTable.id)).limit(1);
    const vandaag = new Date().toISOString().slice(0, 10);
    const sindsDatum = laatste ? new Date(laatste.aangemaaktOp) : new Date(Date.now() - 7 * 86_400_000);

    const alleEigen = await db.select().from(werkbakItemsTable).where(eq(werkbakItemsTable.bron, "eigen"));
    const open = alleEigen.filter((t) => t.status === "open");

    // Blok 1: wat op het vorige overleg is weggezet — óók als het inmiddels
    // is afgerond (dan is dat juist het goede nieuws van de week).
    const blok1 = laatste ? alleEigen.filter((t) => t.overlegId === laatste.id) : [];
    // Blok 2: loopt vast — deadline verstreken, of sinds het vorige overleg
    // geen enkele beweging.
    const blok2 = open.filter((t) =>
      t.herkomstType !== "eigen_idee" &&
      ((t.deadline != null && t.deadline < vandaag) || t.bijgewerktOp <= sindsDatum) &&
      !(laatste && t.overlegId === laatste.id));
    // Blok 3: nieuw sinds het vorige overleg (taken + team-signalen).
    const blok3Taken = open.filter((t) => t.aangemaaktOp > sindsDatum && !(laatste && t.overlegId === laatste.id));
    const signalenNieuw = await db.select().from(werkbakItemsTable)
      .where(and(
        inArray(werkbakItemsTable.bron, TEAM_SIGNAAL_BRONNEN),
        eq(werkbakItemsTable.status, "open"),
        gt(werkbakItemsTable.aangemaaktOp, sindsDatum),
      )).orderBy(desc(werkbakItemsTable.gewicht));
    const gezien = new Set<string>();
    const blok3Signalen = signalenNieuw.filter((s) => {
      const sleutel = `${s.bron}:${s.herkomstType}:${s.herkomstId}`;
      if (gezien.has(sleutel)) return false;
      gezien.add(sleutel);
      return true;
    });
    // Blok 4: ideeën — de enige plek waar iets zonder datum mag bestaan.
    const blok4 = open.filter((t) => t.herkomstType === "eigen_idee");

    res.json({
      vorig_overleg: laatste ? { id: laatste.id, datum: laatste.datum, aanwezigen: laatste.aanwezigen } : null,
      blok1_afgesproken: blok1.map((t) => mapTaak(t, namen)),
      blok2_loopt_vast: blok2.map((t) => mapTaak(t, namen)),
      blok3_nieuw: {
        taken: blok3Taken.map((t) => mapTaak(t, namen)),
        signalen: blok3Signalen.map((s) => ({
          id: s.id, bron: s.bron, titel: s.titel, gewicht: s.gewicht,
          actie_pad: s.actiePad, aangemaakt_op: s.aangemaaktOp.toISOString(),
        })),
      },
      blok4_ideeen: blok4.map((t) => mapTaak(t, namen)),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Overleg vastleggen + in één handeling de afgesproken taken wegzetten (§5).
router.post("/overleggen", requireAuth, teamGate, async (req, res): Promise<void> => {
  try {
    const b = req.body ?? {};
    const datum = isDatum(b.datum) ? b.datum : new Date().toISOString().slice(0, 10);
    const aanwezigen: string[] = Array.isArray(b.aanwezigen)
      ? (b.aanwezigen as unknown[]).filter((x): x is string => typeof x === "string" && x.trim() !== "")
      : [];
    if (aanwezigen.length === 0) { res.status(400).json({ error: "Aanwezigen zijn verplicht" }); return; }
    const nieuweTaken: Array<Record<string, unknown>> = Array.isArray(b.taken) ? b.taken : [];
    // Valideer vóór het aanmaken: elke overlegtaak heeft eigenaar + datum,
    // behalve ideeën (§5 blok 4).
    for (const t of nieuweTaken) {
      const isIdee = t["soort"] === "idee";
      if (typeof t["titel"] !== "string" || !(t["titel"] as string).trim()) { res.status(400).json({ error: "Elke taak heeft een titel nodig" }); return; }
      if (!Number.isInteger(t["eigenaar_id"]) || (!isIdee && !isDatum(t["deadline"]))) {
        res.status(422).json({ error: `Taak "${t["titel"]}" mist eigenaar of einddatum`, code: "EIGENAAR_EN_DATUM_VERPLICHT", suggestie: "gebouwnotitie" });
        return;
      }
    }
    // Alle betrokken gebruikers vooraf valideren (bestaand + actief), zodat de
    // transactie hieronder niet halverwege kan stranden op een FK/onbekende id.
    const betrokkenIds = [...new Set(nieuweTaken.flatMap((t) => [
      t["eigenaar_id"] as number,
      ...(Array.isArray(t["meewerker_ids"]) ? (t["meewerker_ids"] as unknown[]).filter((x): x is number => Number.isInteger(x)) : []),
    ]))];
    if (betrokkenIds.length > 0) {
      const bekend = await db.select({ id: gebruikersTable.id }).from(gebruikersTable)
        .where(and(inArray(gebruikersTable.id, betrokkenIds), eq(gebruikersTable.actief, true)));
      if (bekend.length !== betrokkenIds.length) {
        res.status(400).json({ error: "Onbekende of inactieve gebruiker als eigenaar/meewerker" });
        return;
      }
    }
    // "In één handeling" (§5) is letterlijk: overleg + alle taken in één
    // transactie — een fout halverwege laat géén half overleg achter.
    const resultaat = await db.transaction(async (tx) => {
      const [overleg] = await tx.insert(overleggenTable).values({
        datum,
        aanwezigen,
        besproken: b.besproken ?? null,
        aangemaaktDoor: req.session.userId!,
      }).returning();
      let aangemaakt = 0;
      for (const t of nieuweTaken) {
        const isIdee = t["soort"] === "idee";
        const rijen = await tx.insert(werkbakItemsTable).values({
          soort: isIdee ? "weten" : "doen",
          bron: "eigen", // vaste, gewhiteliste bron (WERKBAK_01 §5)
          titel: (t["titel"] as string).trim(),
          omschrijving: typeof t["omschrijving"] === "string" ? (t["omschrijving"] as string).trim() || null : null,
          gebruikerId: t["eigenaar_id"] as number,
          herkomstType: isIdee ? "eigen_idee" : "eigen_taak",
          herkomstId: overleg!.id,
          dedupSleutel: `eigen:overleg${overleg!.id}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
          deadline: isDatum(t["deadline"]) ? (t["deadline"] as string) : null,
          meewerkerIds: Array.isArray(t["meewerker_ids"])
            ? [...new Set((t["meewerker_ids"] as unknown[]).filter((x): x is number => Number.isInteger(x) && x !== t["eigenaar_id"]))]
            : [],
          overlegId: overleg!.id,
        }).onConflictDoNothing().returning({ id: werkbakItemsTable.id });
        if (rijen.length > 0) aangemaakt += 1;
      }
      return { overleg: overleg!, aangemaakt };
    });
    res.status(201).json({
      id: resultaat.overleg.id, datum: resultaat.overleg.datum, aanwezigen: resultaat.overleg.aanwezigen,
      taken_aangemaakt: resultaat.aangemaakt,
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

router.get("/overleggen", requireAuth, teamGate, async (req, res): Promise<void> => {
  try {
    const rijen = await db.select().from(overleggenTable).orderBy(desc(overleggenTable.id)).limit(20);
    res.json(rijen.map((o) => ({
      id: o.id, datum: o.datum, aanwezigen: o.aanwezigen, besproken: o.besproken,
      aangemaakt_op: o.aangemaaktOp.toISOString(),
    })));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// ── Persoonlijke workflow (§7) ───────────────────────────────────────────────

function zichtbaarVoorMij(req: Request, item: WerkbakItem): boolean {
  const p = req.permissies;
  const uid = req.session.userId;
  if (!p || p.isKlant) return false;
  if (item.gebruikerId != null) return item.gebruikerId === uid || item.meewerkerIds.includes(uid!);
  if (p.isHoofdbeheerder) return true;
  if (item.alleenHoofdbeheerder) return false;
  if (item.vereisteModule) return p.heeftModuleRecht(item.vereisteModule, item.vereistNiveau ?? 1);
  return false;
}

// Eén uitlegregel per plaats in de lijst (§7.2): altijd herleidbaar, nooit
// een zwarte doos. De ster (persoonlijk) wint van alles.
function uitlegRegel(sterren: number, deadline: string | null, gewicht: number, aangemaaktOp: Date): string {
  if (sterren > 0) return `Jij gaf dit ${sterren} ster${sterren > 1 ? "ren" : ""} — jouw ordening gaat voor.`;
  if (deadline) return `Einddatum ${deadline} — gesorteerd op wat het eerst af moet.`;
  if (gewicht >= 40) return "Hoog gewicht: hier hangt een termijn of geldgevolg aan.";
  if (gewicht > 0) return `Gewicht ${gewicht} uit de bron zelf (consequentie-ordening).`;
  return `Binnengekomen op ${aangemaaktOp.toISOString().slice(0, 10)}; geen datum, ster of gewicht — op volgorde van ouderdom.`;
}

router.get("/workflow", requireAuth, async (req, res): Promise<void> => {
  try {
    const uid = req.session.userId!;
    if (req.permissies?.isKlant) { res.status(403).json({ error: "Geen toegang" }); return; }
    const [alleOpen, sterren, mailboxen] = await Promise.all([
      db.select().from(werkbakItemsTable).where(eq(werkbakItemsTable.status, "open")),
      db.select().from(workflowSterrenTable).where(eq(workflowSterrenTable.gebruikerId, uid)),
      toegankelijkeMailboxen(uid),
    ]);
    const items = alleOpen.filter((i) => zichtbaarVoorMij(req, i));
    const sterMap = new Map(sterren.map((s) => [`${s.doelType}:${s.doelSleutel}`, s.sterren]));

    // Mail: selectie uit de werk-inbox (actie vereist), geen tweede
    // mailweergave. Ster hangt aan de conversatie.
    const adressen = mailboxen.map((m) => m.emailAdres);
    const mails = adressen.length === 0 ? [] : await db.select({
      id: werkInboxMailsTable.id,
      onderwerp: werkInboxMailsTable.onderwerp,
      van: werkInboxMailsTable.afzenderEmail,
      ontvangenOp: werkInboxMailsTable.ontvangenOp,
      reden: werkInboxMailsTable.actieVereistReden,
      conversationId: werkInboxMailsTable.conversationId,
      mailboxAdres: werkInboxMailsTable.mailboxAdres,
    }).from(werkInboxMailsTable)
      .where(and(
        inArray(werkInboxMailsTable.mailboxAdres, adressen),
        eq(werkInboxMailsTable.actieVereist, true),
        isNull(werkInboxMailsTable.afgehandeldOp),
      ))
      .orderBy(desc(werkInboxMailsTable.ontvangenOp))
      .limit(50);

    type Rij = {
      soort_rij: "werkbak" | "mail";
      sleutel: string;
      titel: string;
      omschrijving: string | null;
      bron: string;
      sterren: number;
      deadline: string | null;
      gewicht: number;
      actie_pad: string | null;
      uitleg: string;
      aangemaakt_op: string;
    };
    const rijen: Rij[] = [
      ...items.map((i): Rij => {
        const s = sterMap.get(`werkbak:${i.id}`) ?? 0;
        return {
          soort_rij: "werkbak", sleutel: String(i.id), titel: i.titel, omschrijving: i.omschrijving,
          bron: i.bron, sterren: s, deadline: i.deadline, gewicht: i.gewicht, actie_pad: i.actiePad,
          uitleg: uitlegRegel(s, i.deadline, i.gewicht, i.aangemaaktOp),
          aangemaakt_op: i.aangemaaktOp.toISOString(),
        };
      }),
      ...mails.map((m): Rij => {
        const sleutel = m.conversationId ?? `mail:${m.id}`;
        const s = sterMap.get(`mail_conversatie:${sleutel}`) ?? 0;
        return {
          soort_rij: "mail", sleutel, titel: m.onderwerp ?? "(geen onderwerp)",
          omschrijving: m.reden ?? `Van ${m.van}`, bron: "werk_inbox", sterren: s,
          deadline: null, gewicht: 10, actie_pad: `/werk-inbox?mail=${m.id}`,
          uitleg: uitlegRegel(s, null, 10, m.ontvangenOp),
          aangemaakt_op: m.ontvangenOp.toISOString(),
        };
      }),
    ];
    // Sorteervolgorde is heilig (§7.3): ster > deadline > gewicht > ouderdom.
    // AI mag hier nooit doorheen ordenen.
    rijen.sort((a, b) =>
      b.sterren - a.sterren ||
      (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
      b.gewicht - a.gewicht ||
      a.aangemaakt_op.localeCompare(b.aangemaakt_op));
    res.json({ rijen });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Ster zetten/weghalen — persoonlijk en privé (§7.3).
router.post("/workflow/ster", requireAuth, async (req, res): Promise<void> => {
  try {
    const uid = req.session.userId!;
    if (req.permissies?.isKlant) { res.status(403).json({ error: "Geen toegang" }); return; }
    const b = req.body ?? {};
    const doelType = b.doel_type === "mail_conversatie" ? "mail_conversatie" : b.doel_type === "werkbak" ? "werkbak" : null;
    const doelSleutel = typeof b.doel_sleutel === "string" ? b.doel_sleutel.trim() : "";
    const sterren = Number.isInteger(b.sterren) ? (b.sterren as number) : NaN;
    if (!doelType || !doelSleutel || isNaN(sterren) || sterren < 0 || sterren > 3) {
      res.status(400).json({ error: "doel_type, doel_sleutel en sterren (0-3) zijn verplicht" });
      return;
    }
    if (doelType === "werkbak") {
      const [item] = await db.select().from(werkbakItemsTable).where(eq(werkbakItemsTable.id, parseInt(doelSleutel, 10) || 0));
      if (!item || !zichtbaarVoorMij(req, item)) { res.status(404).json({ error: "Item niet gevonden" }); return; }
    }
    if (sterren === 0) {
      await db.delete(workflowSterrenTable).where(and(
        eq(workflowSterrenTable.gebruikerId, uid),
        eq(workflowSterrenTable.doelType, doelType),
        eq(workflowSterrenTable.doelSleutel, doelSleutel),
      ));
    } else {
      await db.insert(workflowSterrenTable)
        .values({ gebruikerId: uid, doelType, doelSleutel, sterren })
        .onConflictDoUpdate({
          target: [workflowSterrenTable.gebruikerId, workflowSterrenTable.doelType, workflowSterrenTable.doelSleutel],
          set: { sterren, bijgewerktOp: new Date() },
        });
    }
    res.json({ doel_type: doelType, doel_sleutel: doelSleutel, sterren });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// AI-advies (§7.2): groeperen, zeggen wat ontbreekt (uit de gegevens) en wat
// kan wachten. Nooit herordenen — voorstellen zijn zichtbaar mét reden en de
// gebruiker beslist. Slot "default" (gpt-4o): interactieve knop, geen reasoning.
router.post("/workflow/ai-advies", requireAuth, async (req, res): Promise<void> => {
  try {
    const uid = req.session.userId!;
    if (req.permissies?.isKlant) { res.status(403).json({ error: "Geen toegang" }); return; }
    const alleOpen = await db.select().from(werkbakItemsTable).where(eq(werkbakItemsTable.status, "open"));
    const items = alleOpen.filter((i) => zichtbaarVoorMij(req, i)).slice(0, 40);
    if (items.length === 0) { res.json({ groepen: [], ontbreekt: [], kan_wachten: [], voorstellen: [] }); return; }
    const bundel = items.map((i) => ({
      sleutel: String(i.id), titel: i.titel, bron: i.bron, soort: i.soort,
      omschrijving: i.omschrijving, deadline: i.deadline, gewicht: i.gewicht,
      aangemaakt_op: i.aangemaaktOp.toISOString().slice(0, 10),
    }));
    const resultaat = await aiGateway.chat("default", {
      messages: [
        {
          role: "system",
          content: [
            "Je helpt een medewerker zijn werklijst te overzien. Strikte regels:",
            "- Je bepaalt NIET wat belangrijk is en stelt GEEN nieuwe volgorde voor de hele lijst voor.",
            "- Je schat GEEN omvang of duur; daar heb je geen gegevens voor.",
            "- Alles wat je zegt moet letterlijk herleidbaar zijn tot de meegegeven velden (titel, bron, omschrijving, deadline, gewicht, datum). Verzin niets.",
            "- 'ontbreekt' = een concreet gegeven dat in de velden aantoonbaar leeg of tegenstrijdig is (bijv. geen deadline op een doen-taak).",
            "- 'kan_wachten' = alleen op basis van deadline/datum in de gegevens, met die reden erbij.",
            "- 'voorstellen' = maximaal 3 items die je zou aanraden eerder op te pakken, elk MET reden uit de gegevens; het is een voorstel, geen herordening.",
            "Antwoord als JSON: {\"groepen\":[{\"naam\":string,\"sleutels\":string[]}],\"ontbreekt\":[{\"sleutel\":string,\"reden\":string}],\"kan_wachten\":[{\"sleutel\":string,\"reden\":string}],\"voorstellen\":[{\"sleutel\":string,\"reden\":string}]}",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify(bundel) },
      ],
      max_tokens: 1200,
      response_format: { type: "json_object" },
    }, undefined, { gebruikerId: uid, module: "werkbak", functie: "werkbakAdvies", promptNaam: "werkbak-ai-advies", promptVersie: "1.0.0" });
    if (!resultaat.ok) { res.status(502).json({ error: resultaat.fout }); return; }
    // AI-uitvoer hardenen: alleen sleutels die echt in de bundel zitten.
    const geldig = new Set(bundel.map((b) => b.sleutel));
    let ruw: Record<string, unknown> = {};
    try { ruw = JSON.parse(resultaat.inhoud || "{}"); } catch { ruw = {}; }
    const filterLijst = (lijst: unknown): Array<{ sleutel: string; reden: string }> =>
      Array.isArray(lijst)
        ? lijst.filter((x): x is { sleutel: string; reden: string } =>
            !!x && typeof x === "object" && geldig.has(String((x as Record<string, unknown>)["sleutel"])) &&
            typeof (x as Record<string, unknown>)["reden"] === "string")
        : [];
    const groepen = Array.isArray(ruw["groepen"])
      ? (ruw["groepen"] as Array<Record<string, unknown>>)
          .filter((g) => typeof g["naam"] === "string" && Array.isArray(g["sleutels"]))
          .map((g) => ({ naam: g["naam"] as string, sleutels: (g["sleutels"] as unknown[]).map(String).filter((s) => geldig.has(s)) }))
      : [];
    res.json({
      groepen,
      ontbreekt: filterLijst(ruw["ontbreekt"]),
      kan_wachten: filterLijst(ruw["kan_wachten"]),
      voorstellen: filterLijst(ruw["voorstellen"]).slice(0, 3),
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

export default router;
