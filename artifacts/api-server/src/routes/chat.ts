import { Router } from "express";
import { db } from "@workspace/db";
import {
  chatGesprekkenTable,
  chatDeelnemersTable,
  chatBerichtenTable,
  gebruikersTable,
} from "@workspace/db";
import { eq, and, desc, sql, gt, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth.js";

const router = Router();

// ─── helpers ─────────────────────────────────────────────────────────────────

async function gesprekMeta(gesprekId: number, userId: number) {
  const [gesprek] = await db
    .select()
    .from(chatGesprekkenTable)
    .where(eq(chatGesprekkenTable.id, gesprekId))
    .limit(1);
  if (!gesprek) return null;

  const deelnemers = await db
    .select({
      gebruiker_id: chatDeelnemersTable.gebruikerId,
      gelezen_tot: chatDeelnemersTable.gelezenTot,
      naam: gebruikersTable.naam,
      email: gebruikersTable.email,
      rol: gebruikersTable.rol,
      avatar_url: gebruikersTable.avatarUrl,
    })
    .from(chatDeelnemersTable)
    .innerJoin(gebruikersTable, eq(chatDeelnemersTable.gebruikerId, gebruikersTable.id))
    .where(eq(chatDeelnemersTable.gesprekId, gesprekId));

  const [lastBericht] = await db
    .select({
      id: chatBerichtenTable.id,
      gesprek_id: chatBerichtenTable.gesprekId,
      afzender_id: chatBerichtenTable.afzenderId,
      afzender_naam: gebruikersTable.naam,
      afzender_avatar: gebruikersTable.avatarUrl,
      inhoud: chatBerichtenTable.inhoud,
      bijlage_url: chatBerichtenTable.bijlageUrl,
      bijlage_type: chatBerichtenTable.bijlageType,
      aangemaakt_op: chatBerichtenTable.aangemaaktOp,
    })
    .from(chatBerichtenTable)
    .leftJoin(gebruikersTable, eq(chatBerichtenTable.afzenderId, gebruikersTable.id))
    .where(eq(chatBerichtenTable.gesprekId, gesprekId))
    .orderBy(desc(chatBerichtenTable.id))
    .limit(1);

  const mijnDeelname = deelnemers.find((d) => d.gebruiker_id === userId);
  const gelezenTot = mijnDeelname?.gelezen_tot ?? 0;

  const [{ ongelezen }] = await db
    .select({ ongelezen: sql<number>`count(*)::int` })
    .from(chatBerichtenTable)
    .where(
      and(
        eq(chatBerichtenTable.gesprekId, gesprekId),
        gt(chatBerichtenTable.id, gelezenTot),
      ),
    );

  return {
    id: gesprek.id,
    type: gesprek.type,
    naam: gesprek.naam,
    deelnemers,
    laatste_bericht: lastBericht ?? null,
    ongelezen_aantal: ongelezen ?? 0,
    bijgewerkt_op: gesprek.bijgewerktOp,
    aangemaakt_op: gesprek.aangemaaktOp,
  };
}

// ─── GET /chat/gebruikers ─────────────────────────────────────────────────────

router.get("/chat/gebruikers", requireAuth, async (req, res) => {
  const gebruikers = await db
    .select({
      id: gebruikersTable.id,
      naam: gebruikersTable.naam,
      email: gebruikersTable.email,
      rol: gebruikersTable.rol,
      avatar_url: gebruikersTable.avatarUrl,
      laatst_online: gebruikersTable.laatstOnline,
    })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.actief, true))
    .orderBy(gebruikersTable.naam);

  res.json(gebruikers);
});

// ─── GET /chat/gesprekken ─────────────────────────────────────────────────────

router.get("/chat/gesprekken", requireAuth, async (req, res) => {
  const userId = req.session.userId!;

  const mijnDeelnames = await db
    .select({
      gesprekId: chatDeelnemersTable.gesprekId,
      gelezenTot: chatDeelnemersTable.gelezenTot,
    })
    .from(chatDeelnemersTable)
    .where(eq(chatDeelnemersTable.gebruikerId, userId));

  if (mijnDeelnames.length === 0) {
    res.json([]);
    return;
  }

  const gesprekIds = mijnDeelnames.map((d) => d.gesprekId);
  const gelezenTotMap = new Map(mijnDeelnames.map((d) => [d.gesprekId, d.gelezenTot ?? 0]));

  const [gesprekken, alleDeelnemers] = await Promise.all([
    db
      .select()
      .from(chatGesprekkenTable)
      .where(inArray(chatGesprekkenTable.id, gesprekIds))
      .orderBy(desc(chatGesprekkenTable.bijgewerktOp)),
    db
      .select({
        gesprek_id: chatDeelnemersTable.gesprekId,
        gebruiker_id: chatDeelnemersTable.gebruikerId,
        gelezen_tot: chatDeelnemersTable.gelezenTot,
        naam: gebruikersTable.naam,
        email: gebruikersTable.email,
        rol: gebruikersTable.rol,
        avatar_url: gebruikersTable.avatarUrl,
      })
      .from(chatDeelnemersTable)
      .innerJoin(gebruikersTable, eq(chatDeelnemersTable.gebruikerId, gebruikersTable.id))
      .where(inArray(chatDeelnemersTable.gesprekId, gesprekIds)),
  ]);

  // Last message per gesprek
  const maxIds = await db
    .select({
      gesprek_id: chatBerichtenTable.gesprekId,
      last_id: sql<number>`max(${chatBerichtenTable.id})`,
    })
    .from(chatBerichtenTable)
    .where(inArray(chatBerichtenTable.gesprekId, gesprekIds))
    .groupBy(chatBerichtenTable.gesprekId);

  const lastMsgIds = maxIds.map((m) => m.last_id).filter(Boolean);
  let lasteBerichten: {
    id: number;
    gesprek_id: number;
    afzender_id: number | null;
    afzender_naam: string | null;
    afzender_avatar: string | null;
    inhoud: string;
    bijlage_url: string | null;
    bijlage_type: string | null;
    aangemaakt_op: Date;
  }[] = [];

  if (lastMsgIds.length > 0) {
    lasteBerichten = await db
      .select({
        id: chatBerichtenTable.id,
        gesprek_id: chatBerichtenTable.gesprekId,
        afzender_id: chatBerichtenTable.afzenderId,
        afzender_naam: gebruikersTable.naam,
        afzender_avatar: gebruikersTable.avatarUrl,
        inhoud: chatBerichtenTable.inhoud,
        bijlage_url: chatBerichtenTable.bijlageUrl,
        bijlage_type: chatBerichtenTable.bijlageType,
        aangemaakt_op: chatBerichtenTable.aangemaaktOp,
      })
      .from(chatBerichtenTable)
      .leftJoin(gebruikersTable, eq(chatBerichtenTable.afzenderId, gebruikersTable.id))
      .where(inArray(chatBerichtenTable.id, lastMsgIds));
  }

  // Unread counts: fetch all messages after min gelezenTot, filter in JS
  const minGelezenTot = Math.min(...mijnDeelnames.map((d) => d.gelezenTot ?? 0));
  const nyBerichten = await db
    .select({ id: chatBerichtenTable.id, gesprek_id: chatBerichtenTable.gesprekId })
    .from(chatBerichtenTable)
    .where(
      and(
        inArray(chatBerichtenTable.gesprekId, gesprekIds),
        gt(chatBerichtenTable.id, minGelezenTot),
      ),
    );

  const ongelModel: Record<number, number> = {};
  for (const b of nyBerichten) {
    if (b.id > (gelezenTotMap.get(b.gesprek_id) ?? 0)) {
      ongelModel[b.gesprek_id] = (ongelModel[b.gesprek_id] ?? 0) + 1;
    }
  }

  const deelnemersPerGesprek = new Map<number, typeof alleDeelnemers>();
  for (const d of alleDeelnemers) {
    const lijst = deelnemersPerGesprek.get(d.gesprek_id) ?? [];
    lijst.push(d);
    deelnemersPerGesprek.set(d.gesprek_id, lijst);
  }

  const lastMsgPerGesprek = new Map(lasteBerichten.map((b) => [b.gesprek_id, b]));

  res.json(
    gesprekken.map((g) => ({
      id: g.id,
      type: g.type,
      naam: g.naam,
      deelnemers: deelnemersPerGesprek.get(g.id) ?? [],
      laatste_bericht: lastMsgPerGesprek.get(g.id) ?? null,
      ongelezen_aantal: ongelModel[g.id] ?? 0,
      bijgewerkt_op: g.bijgewerktOp,
      aangemaakt_op: g.aangemaaktOp,
    })),
  );
});

// ─── POST /chat/gesprekken ────────────────────────────────────────────────────

router.post("/chat/gesprekken", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const { type = "direct", naam, deelnemer_ids } = req.body as {
    type?: string;
    naam?: string;
    deelnemer_ids: number[];
  };

  if (!Array.isArray(deelnemer_ids) || deelnemer_ids.length === 0) {
    res.status(400).json({ error: "Minstens één deelnemer vereist" });
    return;
  }

  // Dedupliceer; zorg dat initiator ook deelnemer is
  const alleIds = Array.from(new Set([userId, ...deelnemer_ids]));

  // Voor direct gesprek: controleer of er al een bestaat tussen exact deze twee gebruikers
  if (type === "direct" && alleIds.length === 2) {
    const andereId = alleIds.find((id) => id !== userId)!;

    // Gesprekken waar beide als deelnemer zitten
    const kandidaten = await db
      .select({ id: chatDeelnemersTable.gesprekId })
      .from(chatDeelnemersTable)
      .where(
        and(
          eq(chatDeelnemersTable.gebruikerId, userId),
        ),
      );

    for (const k of kandidaten) {
      const gesprekDeel = await db
        .select({ gebruiker_id: chatDeelnemersTable.gebruikerId })
        .from(chatDeelnemersTable)
        .where(eq(chatDeelnemersTable.gesprekId, k.id));

      const deelIds = gesprekDeel.map((d) => d.gebruiker_id).sort();
      const zoekIds = [userId, andereId].sort();
      if (deelIds.length === 2 && JSON.stringify(deelIds) === JSON.stringify(zoekIds)) {
        // Check of het gesprek type=direct is
        const [g] = await db
          .select()
          .from(chatGesprekkenTable)
          .where(and(eq(chatGesprekkenTable.id, k.id), eq(chatGesprekkenTable.type, "direct")))
          .limit(1);
        if (g) {
          const meta = await gesprekMeta(g.id, userId);
          res.status(201).json(meta);
          return;
        }
      }
    }
  }

  // Nieuw gesprek aanmaken
  const [nieuwGesprek] = await db
    .insert(chatGesprekkenTable)
    .values({
      type,
      naam: naam ?? null,
      aangemaaktDoorId: userId,
    })
    .returning();

  await db.insert(chatDeelnemersTable).values(
    alleIds.map((id) => ({ gesprekId: nieuwGesprek.id, gebruikerId: id })),
  );

  const meta = await gesprekMeta(nieuwGesprek.id, userId);
  res.status(201).json(meta);
});

// ─── GET /chat/gesprekken/:id ─────────────────────────────────────────────────

router.get("/chat/gesprekken/:id", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const gesprekId = parseInt(String(req.params.id), 10);

  const [toegang] = await db
    .select()
    .from(chatDeelnemersTable)
    .where(and(eq(chatDeelnemersTable.gesprekId, gesprekId), eq(chatDeelnemersTable.gebruikerId, userId)))
    .limit(1);

  if (!toegang) {
    res.status(403).json({ error: "Geen toegang" });
    return;
  }

  const meta = await gesprekMeta(gesprekId, userId);
  if (!meta) {
    res.status(404).json({ error: "Niet gevonden" });
    return;
  }

  res.json(meta);
});

// ─── GET /chat/gesprekken/:id/berichten ──────────────────────────────────────

router.get("/chat/gesprekken/:id/berichten", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const gesprekId = parseInt(String(req.params.id), 10);
  const naId = req.query.na ? parseInt(req.query.na as string, 10) : undefined;
  const voorId = req.query.voor ? parseInt(req.query.voor as string, 10) : undefined;
  const limiet = req.query.limiet ? parseInt(req.query.limiet as string, 10) : 50;

  const [toegang] = await db
    .select()
    .from(chatDeelnemersTable)
    .where(and(eq(chatDeelnemersTable.gesprekId, gesprekId), eq(chatDeelnemersTable.gebruikerId, userId)))
    .limit(1);

  if (!toegang) {
    res.status(403).json({ error: "Geen toegang" });
    return;
  }

  const filters: ReturnType<typeof and>[] = [eq(chatBerichtenTable.gesprekId, gesprekId)];
  if (naId != null) filters.push(gt(chatBerichtenTable.id, naId));

  const berichten = await db
    .select({
      id: chatBerichtenTable.id,
      gesprek_id: chatBerichtenTable.gesprekId,
      afzender_id: chatBerichtenTable.afzenderId,
      afzender_naam: gebruikersTable.naam,
      afzender_avatar: gebruikersTable.avatarUrl,
      inhoud: chatBerichtenTable.inhoud,
      bijlage_url: chatBerichtenTable.bijlageUrl,
      bijlage_type: chatBerichtenTable.bijlageType,
      aangemaakt_op: chatBerichtenTable.aangemaaktOp,
    })
    .from(chatBerichtenTable)
    .leftJoin(gebruikersTable, eq(chatBerichtenTable.afzenderId, gebruikersTable.id))
    .where(and(...filters))
    .orderBy(desc(chatBerichtenTable.id))
    .limit(limiet);

  res.json(berichten);
});

// ─── POST /chat/gesprekken/:id/berichten ─────────────────────────────────────

router.post("/chat/gesprekken/:id/berichten", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const gesprekId = parseInt(String(req.params.id), 10);
  const { inhoud, bijlage_url, bijlage_type } = req.body as {
    inhoud: string;
    bijlage_url?: string | null;
    bijlage_type?: string | null;
  };

  if (!inhoud?.trim() && !bijlage_url) {
    res.status(400).json({ error: "Inhoud vereist" });
    return;
  }

  const [toegang] = await db
    .select()
    .from(chatDeelnemersTable)
    .where(and(eq(chatDeelnemersTable.gesprekId, gesprekId), eq(chatDeelnemersTable.gebruikerId, userId)))
    .limit(1);

  if (!toegang) {
    res.status(403).json({ error: "Geen toegang" });
    return;
  }

  const [nieuwBericht] = await db
    .insert(chatBerichtenTable)
    .values({
      gesprekId,
      afzenderId: userId,
      inhoud: inhoud?.trim() ?? "",
      bijlageUrl: bijlage_url ?? null,
      bijlageType: bijlage_type ?? null,
    })
    .returning();

  // Bijwerk bijgewerktOp van het gesprek
  await db
    .update(chatGesprekkenTable)
    .set({ bijgewerktOp: new Date() })
    .where(eq(chatGesprekkenTable.id, gesprekId));

  // Haal afzender op voor de response
  const [afzender] = await db
    .select({ naam: gebruikersTable.naam, avatar_url: gebruikersTable.avatarUrl })
    .from(gebruikersTable)
    .where(eq(gebruikersTable.id, userId))
    .limit(1);

  res.status(201).json({
    id: nieuwBericht.id,
    gesprek_id: nieuwBericht.gesprekId,
    afzender_id: nieuwBericht.afzenderId,
    afzender_naam: afzender?.naam ?? null,
    afzender_avatar: afzender?.avatar_url ?? null,
    inhoud: nieuwBericht.inhoud,
    bijlage_url: nieuwBericht.bijlageUrl,
    bijlage_type: nieuwBericht.bijlageType,
    aangemaakt_op: nieuwBericht.aangemaaktOp,
  });
});

// ─── POST /chat/gesprekken/:id/gelezen ───────────────────────────────────────

router.post("/chat/gesprekken/:id/gelezen", requireAuth, async (req, res) => {
  const userId = req.session.userId!;
  const gesprekId = parseInt(String(req.params.id), 10);

  // Zoek het laatste bericht id
  const [laatste] = await db
    .select({ id: chatBerichtenTable.id })
    .from(chatBerichtenTable)
    .where(eq(chatBerichtenTable.gesprekId, gesprekId))
    .orderBy(desc(chatBerichtenTable.id))
    .limit(1);

  if (laatste) {
    await db
      .update(chatDeelnemersTable)
      .set({ gelezenTot: laatste.id })
      .where(
        and(
          eq(chatDeelnemersTable.gesprekId, gesprekId),
          eq(chatDeelnemersTable.gebruikerId, userId),
        ),
      );
  }

  res.status(204).send();
});

export default router;
