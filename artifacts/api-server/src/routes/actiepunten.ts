// Actiepunten — persoonlijke to-dolijst van de hoofdbeheerder in de zijrand.
// Houdt bij waar het platform op een mens wacht (Azure, mailing, VPS,
// app-store-accounts). Alleen de hoofdbeheerder ziet en beheert deze lijst.
import { Router } from "express";
import { db, actiepuntenTable, gebruikersTable } from "@workspace/db";
import { asc, eq } from "drizzle-orm";
import { requireAuth, requireRol } from "../middlewares/auth";

const router = Router();

const mapPunt = (a: typeof actiepuntenTable.$inferSelect) => ({
  id: a.id,
  titel: a.titel,
  omschrijving: a.omschrijving,
  categorie: a.categorie,
  status: a.status,
  volgorde: a.volgorde,
  afgerond_op: a.afgerondOp?.toISOString() ?? null,
  aangemaakt_op: a.aangemaaktOp.toISOString(),
});

router.get("/actiepunten", requireRol("hoofdbeheerder"), async (_req, res): Promise<void> => {
  const rijen = await db.select().from(actiepuntenTable)
    .orderBy(asc(actiepuntenTable.volgorde), asc(actiepuntenTable.id));
  res.json(rijen.map(mapPunt));
});

router.post("/actiepunten", requireRol("hoofdbeheerder"), async (req, res): Promise<void> => {
  const { titel, omschrijving, categorie } = req.body;
  if (!titel || !String(titel).trim()) return void res.status(400).json({ error: "titel is verplicht" });
  const [rij] = await db.insert(actiepuntenTable).values({
    titel: String(titel).trim(),
    omschrijving: omschrijving ? String(omschrijving) : null,
    categorie: categorie ? String(categorie) : "overig",
    // Nieuw punt onderaan: hoogste volgorde + 10.
    volgorde: ((await db.select({ v: actiepuntenTable.volgorde }).from(actiepuntenTable).orderBy(asc(actiepuntenTable.volgorde))).at(-1)?.v ?? 0) + 10,
    bijgewerktOp: new Date(),
  }).returning();
  res.status(201).json(mapPunt(rij));
});

router.patch("/actiepunten/:id", requireRol("hoofdbeheerder"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [bestaand] = await db.select().from(actiepuntenTable).where(eq(actiepuntenTable.id, id)).limit(1);
  if (!bestaand) return void res.status(404).json({ error: "Actiepunt niet gevonden" });
  const { titel, omschrijving, categorie, status } = req.body;
  if (status !== undefined && status !== "open" && status !== "afgerond") {
    return void res.status(400).json({ error: "status moet 'open' of 'afgerond' zijn" });
  }
  const [rij] = await db.update(actiepuntenTable).set({
    titel: titel !== undefined ? String(titel).trim() : bestaand.titel,
    omschrijving: omschrijving !== undefined ? (omschrijving ? String(omschrijving) : null) : bestaand.omschrijving,
    categorie: categorie !== undefined ? String(categorie) : bestaand.categorie,
    status: status !== undefined ? status : bestaand.status,
    afgerondOp: status === "afgerond" ? (bestaand.afgerondOp ?? new Date()) : status === "open" ? null : bestaand.afgerondOp,
    bijgewerktOp: new Date(),
  }).where(eq(actiepuntenTable.id, id)).returning();
  res.json(mapPunt(rij));
});

// SENTRY_AAN_01: "Dit werkt niet"-melding — voor élke ingelogde gebruiker.
// Legt pagina, tijdstip, gebruiker, laatste handeling en vrije tekst vast en
// landt als actiepunt (categorie "meldingen") in de lijst van de hoofdbeheerder.
// Eenvoudige per-gebruiker throttle tegen actiepunten-spam: max 5 meldingen
// per 10 minuten. In-memory is hier voldoende (één api-server-proces).
const meldMomenten = new Map<number, number[]>();
const MELD_VENSTER_MS = 10 * 60 * 1000;
const MELD_MAX = 5;

router.post("/dit-werkt-niet", requireAuth, async (req, res): Promise<void> => {
  const { tekst, pagina, laatste_handeling } = req.body as { tekst?: string; pagina?: string; laatste_handeling?: string | null };
  if (!tekst || !String(tekst).trim()) return void res.status(400).json({ error: "tekst is verplicht — beschrijf kort wat er niet werkt" });
  if (!pagina || !String(pagina).trim()) return void res.status(400).json({ error: "pagina is verplicht" });
  const userId = req.session.userId!;
  const nuMs = Date.now();
  const recent = (meldMomenten.get(userId) ?? []).filter((t) => nuMs - t < MELD_VENSTER_MS);
  if (recent.length >= MELD_MAX) {
    return void res.status(429).json({ error: "Te veel meldingen kort na elkaar — probeer het over een paar minuten opnieuw" });
  }
  recent.push(nuMs);
  meldMomenten.set(userId, recent);
  const [wie] = await db.select({ naam: gebruikersTable.naam }).from(gebruikersTable).where(eq(gebruikersTable.id, userId)).limit(1);
  const nu = new Date();
  const tijdstip = nu.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" });
  const paginaKort = String(pagina).trim().split("?")[0]!.slice(0, 120);
  const regels = [
    `Gebruiker: ${wie?.naam ?? `#${userId}`}`,
    `Pagina: ${paginaKort}`,
    `Tijdstip: ${tijdstip}`,
    `Laatste handeling: ${laatste_handeling ? String(laatste_handeling).slice(0, 200) : "onbekend"}`,
    "",
    String(tekst).trim().slice(0, 2000),
  ];
  const [rij] = await db.insert(actiepuntenTable).values({
    titel: `Dit werkt niet — ${paginaKort} (${wie?.naam ?? `#${userId}`})`.slice(0, 200),
    omschrijving: regels.join("\n"),
    categorie: "meldingen",
    volgorde: ((await db.select({ v: actiepuntenTable.volgorde }).from(actiepuntenTable).orderBy(asc(actiepuntenTable.volgorde))).at(-1)?.v ?? 0) + 10,
    bijgewerktOp: nu,
  }).returning({ id: actiepuntenTable.id });
  res.status(201).json({ id: rij!.id });
});

// SENTRY_AAN_01: bewuste testfout om de Sentry-keten aantoonbaar te maken.
// Alleen de hoofdbeheerder; de fout loopt door de centrale foutafhandelaar
// (500 + verwijzingscode) en wordt — mét DSN — naar Sentry gestuurd.
router.post("/monitoring-testfout", requireRol("hoofdbeheerder"), async (): Promise<void> => {
  throw new Error("SENTRY_AAN_01: bewuste testfout voor het bewijs dat foutmonitoring meldingen aflevert");
});

router.delete("/actiepunten/:id", requireRol("hoofdbeheerder"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const rijen = await db.delete(actiepuntenTable).where(eq(actiepuntenTable.id, id)).returning({ id: actiepuntenTable.id });
  if (!rijen.length) return void res.status(404).json({ error: "Actiepunt niet gevonden" });
  res.status(204).end();
});

export default router;
