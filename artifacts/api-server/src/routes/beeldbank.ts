// MERK_01 deel B — Beeldbank: één zoek- en downloadingang over al het eigen
// beeldmateriaal.
//
// Bronnen (live geaggregeerd, geen kopieën):
//   - spotfoto's per fase (fotos → voorzieningen → gebouw)
//   - opnamefoto's (opname_fotos → opname_items → opnames → gebouw)
//   - inspectiefoto's (inspectie_bevindingen.foto_urls → inspectie → gebouw)
//   - handmatige uploads (beeldbank_uploads)
//
// Opdracht per foto: de automatische bronnen hebben in de database géén
// opdracht-koppeling; alleen handmatige uploads kunnen er een dragen. Dit is
// bewust — we tonen geen gegokte koppeling (gemeld bij scoping MERK_01).
//
// Rechten (getoetst tegen marketing.ts/social.ts): crm niveau 3 = bekijken,
// zoeken, uploaden en downloaden. Gebouw-ACL: beperkte gebruikers (via
// effectieveContext) zien alleen foto's van hun toegewezen gebouwen; de
// storage-route dwingt dit per bestand nogmaals af.
import { Router } from "express";
import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import {
  db,
  fotosTable,
  voorzieningenTable,
  gebouwenTable,
  opnameFotosTable,
  opnameItemsTable,
  opnamesTable,
  inspectiesTable,
  inspectieBevindingen,
  beeldbankUploadsTable,
  gebruikersTable,
  opdrachtenTable,
} from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { effectieveContext, toegewezenGebouwIds } from "../utils/rol";
import { ObjectStorageService } from "../lib/objectStorage";
const objectStorageService = new ObjectStorageService();
import { ObjectNotFoundError } from "../lib/objectStorageTypes";
import { naarObjectPad } from "./merkenkast";

const router = Router();
const lezen = requireBevoegdheid("merk", 1);
const uploaden = requireBevoegdheid("merk", 3);

export type BeeldbankBron = "spot" | "opname" | "inspectie" | "upload";

type BeeldbankFoto = {
  bron: BeeldbankBron;
  bron_id: number; // id binnen de brontabel (bevinding-id bij inspecties)
  volgnummer: number; // index binnen foto_urls (alleen inspecties, anders 0)
  url: string; // client-downloadbare URL (per stuk downloaden)
  object_path: string | null; // intern pad (voor bulk-zip); null = extern/onbekend
  gebouw_id: number | null;
  gebouw_naam: string | null;
  opdracht_id: number | null;
  opdracht_titel: string | null;
  werksoort: string | null; // spot-type / opname-spot_type / inspectietype / vrije tekst
  fase: string | null; // opname | uitvoering | oplevering (alleen spotfoto's)
  gemaakt_op: string | null;
  gemaakt_door: string | null;
  bijschrift: string | null;
};

const downloadUrl = (ruw: string): string => {
  const pad = naarObjectPad(ruw);
  if (pad) return `/api/storage/objects/${pad.slice("/objects/".length).split("/").map(encodeURIComponent).join("/")}`;
  return ruw; // externe URL of al kant-en-klaar
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// Haalt alle beeldbank-foto's op, gescopet op de gebouwen die de effectieve
// gebruiker mag zien (null = onbeperkt).
async function verzamelFotos(toegestaneGebouwen: Set<number> | null): Promise<BeeldbankFoto[]> {
  const magGebouw = (gebouwId: number | null) =>
    toegestaneGebouwen === null || (gebouwId !== null && toegestaneGebouwen.has(gebouwId));

  const uit: BeeldbankFoto[] = [];

  // 1. Spotfoto's per fase.
  const spotRijen = await db
    .select({
      id: fotosTable.id,
      fase: fotosTable.fase,
      url: fotosTable.url,
      beschrijving: fotosTable.beschrijving,
      aangemaaktOp: fotosTable.aangemaaktOp,
      gebouwId: voorzieningenTable.gebouwId,
      gebouwNaam: gebouwenTable.naam,
      werksoort: voorzieningenTable.type,
      makerNaam: gebruikersTable.naam,
    })
    .from(fotosTable)
    .innerJoin(voorzieningenTable, eq(fotosTable.voorzieningId, voorzieningenTable.id))
    .leftJoin(gebouwenTable, eq(voorzieningenTable.gebouwId, gebouwenTable.id))
    .leftJoin(gebruikersTable, eq(voorzieningenTable.makerMonteurId, gebruikersTable.id));
  for (const r of spotRijen) {
    if (!magGebouw(r.gebouwId)) continue;
    uit.push({
      bron: "spot", bron_id: r.id, volgnummer: 0,
      url: downloadUrl(r.url), object_path: naarObjectPad(r.url),
      gebouw_id: r.gebouwId, gebouw_naam: r.gebouwNaam,
      opdracht_id: null, opdracht_titel: null,
      werksoort: r.werksoort, fase: r.fase,
      gemaakt_op: iso(r.aangemaaktOp), gemaakt_door: r.makerNaam,
      bijschrift: r.beschrijving,
    });
  }

  // 2. Opnamefoto's.
  const opnameRijen = await db
    .select({
      id: opnameFotosTable.id,
      objectPath: opnameFotosTable.objectPath,
      bijschrift: opnameFotosTable.bijschrift,
      aangemaaktOp: opnameFotosTable.aangemaaktOp,
      spotType: opnameItemsTable.spotType,
      gebouwId: opnamesTable.gebouwId,
      gebouwNaam: gebouwenTable.naam,
      makerNaam: gebruikersTable.naam,
    })
    .from(opnameFotosTable)
    .innerJoin(opnameItemsTable, eq(opnameFotosTable.itemId, opnameItemsTable.id))
    .innerJoin(opnamesTable, eq(opnameItemsTable.opnameId, opnamesTable.id))
    .leftJoin(gebouwenTable, eq(opnamesTable.gebouwId, gebouwenTable.id))
    .leftJoin(gebruikersTable, eq(opnamesTable.aangemaaktDoorId, gebruikersTable.id));
  for (const r of opnameRijen) {
    if (!magGebouw(r.gebouwId)) continue;
    uit.push({
      bron: "opname", bron_id: r.id, volgnummer: 0,
      url: downloadUrl(r.objectPath), object_path: naarObjectPad(r.objectPath),
      gebouw_id: r.gebouwId, gebouw_naam: r.gebouwNaam,
      opdracht_id: null, opdracht_titel: null,
      werksoort: r.spotType, fase: "opname",
      gemaakt_op: iso(r.aangemaaktOp), gemaakt_door: r.makerNaam,
      bijschrift: r.bijschrift,
    });
  }

  // 3. Inspectiefoto's (foto_urls = JSON-array van paden/URLs op de bevinding).
  const inspectieRijen = await db
    .select({
      id: inspectieBevindingen.id,
      fotoUrls: inspectieBevindingen.fotoUrls,
      omschrijving: inspectieBevindingen.omschrijving,
      aangemaaktOp: inspectieBevindingen.aangemaaktOp,
      inspectieType: inspectiesTable.type,
      gebouwId: inspectiesTable.gebouwId,
      gebouwNaam: gebouwenTable.naam,
      makerNaam: gebruikersTable.naam,
    })
    .from(inspectieBevindingen)
    .innerJoin(inspectiesTable, eq(inspectieBevindingen.inspectieId, inspectiesTable.id))
    .leftJoin(gebouwenTable, eq(inspectiesTable.gebouwId, gebouwenTable.id))
    .leftJoin(gebruikersTable, eq(inspectiesTable.inspecteurId, gebruikersTable.id));
  for (const r of inspectieRijen) {
    if (!magGebouw(r.gebouwId)) continue;
    let urls: string[] = [];
    try {
      const parsed = JSON.parse(r.fotoUrls);
      if (Array.isArray(parsed)) urls = parsed.filter((u): u is string => typeof u === "string" && !!u);
    } catch { /* kapotte JSON: geen foto's */ }
    urls.forEach((u, index) => {
      uit.push({
        bron: "inspectie", bron_id: r.id, volgnummer: index,
        url: downloadUrl(u), object_path: naarObjectPad(u),
        gebouw_id: r.gebouwId, gebouw_naam: r.gebouwNaam,
        opdracht_id: null, opdracht_titel: null,
        werksoort: r.inspectieType ? `inspectie ${r.inspectieType}` : "inspectie", fase: null,
        gemaakt_op: iso(r.aangemaaktOp), gemaakt_door: r.makerNaam,
        bijschrift: r.omschrijving,
      });
    });
  }

  // 4. Handmatige uploads.
  const uploadRijen = await db
    .select({
      id: beeldbankUploadsTable.id,
      objectPath: beeldbankUploadsTable.objectPath,
      bijschrift: beeldbankUploadsTable.bijschrift,
      gebouwId: beeldbankUploadsTable.gebouwId,
      gebouwNaam: gebouwenTable.naam,
      opdrachtId: beeldbankUploadsTable.opdrachtId,
      opdrachtTitel: opdrachtenTable.titel,
      werksoort: beeldbankUploadsTable.werksoort,
      aangemaaktOp: beeldbankUploadsTable.aangemaaktOp,
      makerNaam: gebruikersTable.naam,
    })
    .from(beeldbankUploadsTable)
    .leftJoin(gebouwenTable, eq(beeldbankUploadsTable.gebouwId, gebouwenTable.id))
    .leftJoin(opdrachtenTable, eq(beeldbankUploadsTable.opdrachtId, opdrachtenTable.id))
    .leftJoin(gebruikersTable, eq(beeldbankUploadsTable.gemaaktDoorId, gebruikersTable.id));
  for (const r of uploadRijen) {
    // Uploads zonder gebouw zijn algemeen beeld; die mag iedereen met crm:3 zien.
    if (r.gebouwId !== null && !magGebouw(r.gebouwId)) continue;
    uit.push({
      bron: "upload", bron_id: r.id, volgnummer: 0,
      url: downloadUrl(r.objectPath), object_path: naarObjectPad(r.objectPath),
      gebouw_id: r.gebouwId, gebouw_naam: r.gebouwNaam,
      opdracht_id: r.opdrachtId, opdracht_titel: r.opdrachtTitel,
      werksoort: r.werksoort, fase: null,
      gemaakt_op: iso(r.aangemaaktOp), gemaakt_door: r.makerNaam,
      bijschrift: r.bijschrift,
    });
  }

  uit.sort((a, b) => (b.gemaakt_op ?? "").localeCompare(a.gemaakt_op ?? ""));
  return uit;
}

async function toegestaneGebouwenVoor(req: Parameters<typeof effectieveContext>[0]): Promise<Set<number> | null> {
  const ctx = await effectieveContext(req);
  if (!ctx.beperkt) return null;
  return new Set(await toegewezenGebouwIds(ctx.userId));
}

// GET /beeldbank/fotos — zoeken en filteren over alle bronnen.
router.get("/beeldbank/fotos", lezen, async (req, res): Promise<void> => {
  try {
    const alles = await verzamelFotos(await toegestaneGebouwenVoor(req));

    const q = (naam: string) => { const v = req.query[naam]; return typeof v === "string" && v.trim() ? v.trim() : null; };
    const bron = q("bron");
    const fase = q("fase");
    const gebouwId = q("gebouw_id") ? Number.parseInt(q("gebouw_id")!, 10) : null;
    const werksoort = q("werksoort")?.toLowerCase() ?? null;
    const zoek = q("zoek")?.toLowerCase() ?? null;
    const van = q("van");
    const tot = q("tot");

    let rijen = alles;
    if (bron) rijen = rijen.filter((f) => f.bron === bron);
    if (fase) rijen = rijen.filter((f) => f.fase === fase);
    if (gebouwId !== null && Number.isInteger(gebouwId)) rijen = rijen.filter((f) => f.gebouw_id === gebouwId);
    if (werksoort) rijen = rijen.filter((f) => (f.werksoort ?? "").toLowerCase().includes(werksoort));
    if (van) rijen = rijen.filter((f) => (f.gemaakt_op ?? "") >= van);
    if (tot) rijen = rijen.filter((f) => (f.gemaakt_op ?? "9999") <= `${tot}T23:59:59.999Z`);
    if (zoek) {
      rijen = rijen.filter((f) =>
        [f.gebouw_naam, f.opdracht_titel, f.werksoort, f.bijschrift, f.gemaakt_door]
          .some((v) => (v ?? "").toLowerCase().includes(zoek)),
      );
    }

    const limit = Math.min(Math.max(Number.parseInt(String(req.query.limit ?? "60"), 10) || 60, 1), 200);
    const offset = Math.max(Number.parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);
    res.json({ totaal: rijen.length, fotos: rijen.slice(offset, offset + limit) });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /beeldbank/fotos — handmatige upload registreren (bestand is al via de
// storage-upload geplaatst; hier leggen we de metadata vast).
router.post("/beeldbank/fotos", uploaden, async (req, res): Promise<void> => {
  try {
    const { object_path, bijschrift, gebouw_id, opdracht_id, werksoort } = req.body ?? {};
    const pad = naarObjectPad(typeof object_path === "string" ? object_path : null);
    if (!pad) return void res.status(400).json({ error: "object_path (intern /objects/-pad) is verplicht" });

    // Gebouw-ACL op schrijven: een beperkte gebruiker mag alleen uploaden
    // binnen zijn toegewezen gebouwen — en dus niet "algemeen" (zonder
    // gebouw), omdat dat voor iedereen zichtbaar wordt (fail-closed).
    const toegestaneGebouwen = await toegestaneGebouwenVoor(req);
    if (toegestaneGebouwen !== null) {
      if (!Number.isInteger(gebouw_id)) {
        return void res.status(403).json({ error: "Kies een van je toegewezen gebouwen voor deze upload" });
      }
      if (!toegestaneGebouwen.has(gebouw_id)) {
        return void res.status(403).json({ error: "Geen toegang tot dit gebouw" });
      }
    }
    // Referentie-integriteit: bestaand gebouw/opdracht of niets.
    if (Number.isInteger(gebouw_id)) {
      const [g] = await db.select({ id: gebouwenTable.id }).from(gebouwenTable).where(eq(gebouwenTable.id, gebouw_id));
      if (!g) return void res.status(400).json({ error: "Onbekend gebouw" });
    }
    if (Number.isInteger(opdracht_id)) {
      const [o] = await db.select({ id: opdrachtenTable.id }).from(opdrachtenTable).where(eq(opdrachtenTable.id, opdracht_id));
      if (!o) return void res.status(400).json({ error: "Onbekende opdracht" });
    }
    const [rij] = await db.insert(beeldbankUploadsTable).values({
      objectPath: pad,
      bijschrift: typeof bijschrift === "string" && bijschrift.trim() ? bijschrift.trim() : null,
      gebouwId: Number.isInteger(gebouw_id) ? gebouw_id : null,
      opdrachtId: Number.isInteger(opdracht_id) ? opdracht_id : null,
      werksoort: typeof werksoort === "string" && werksoort.trim() ? werksoort.trim() : null,
      // Maker altijd server-side uit de sessie — nooit uit de body.
      gemaaktDoorId: req.session.userId!,
    }).returning();
    res.status(201).json({ id: rij.id });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// POST /beeldbank/download — bulk-download als zip. Body: { items: [{bron, bron_id, volgnummer?}] }.
// De ACL wordt opnieuw per foto afgedwongen (niet vertrouwd op de client-lijst).
router.post("/beeldbank/download", lezen, async (req, res): Promise<void> => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0 || items.length > 200) {
      return void res.status(400).json({ error: "Geef 1 t/m 200 foto's op" });
    }
    const alles = await verzamelFotos(await toegestaneGebouwenVoor(req));
    const sleutel = (b: string, id: number, nr: number) => `${b}:${id}:${nr}`;
    const perSleutel = new Map(alles.map((f) => [sleutel(f.bron, f.bron_id, f.volgnummer), f]));
    const gekozen: BeeldbankFoto[] = [];
    for (const item of items) {
      const f = perSleutel.get(sleutel(String(item?.bron), Number(item?.bron_id), Number(item?.volgnummer ?? 0)));
      if (f && f.object_path) gekozen.push(f); // buiten scope of extern → stil overslaan is fout: melden
    }
    if (gekozen.length === 0) return void res.status(404).json({ error: "Geen van de opgegeven foto's is beschikbaar binnen je toegang" });

    const archief = new ZipArchive({ zlib: { level: 6 } });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="beeldbank.zip"`);
    archief.on("error", (err: Error) => { req.log.error(err); res.destroy(err); });
    archief.pipe(res);

    const overgeslagen: string[] = [];
    const namen = new Set<string>();
    for (const f of gekozen) {
      const basis = [f.gebouw_naam, f.fase ?? f.werksoort, f.gemaakt_op?.slice(0, 10)]
        .filter(Boolean).join("_").replace(/[^a-zA-Z0-9._-]+/g, "-") || "foto";
      const ext = f.object_path!.includes(".") ? `.${f.object_path!.split(".").pop()}` : ".jpg";
      let naam = `${basis}_${f.bron}${f.bron_id}${f.volgnummer ? `-${f.volgnummer}` : ""}${ext}`;
      let n = 1;
      while (namen.has(naam)) naam = `${basis}_${f.bron}${f.bron_id}_${n++}${ext}`;
      namen.add(naam);
      try {
        const file = await objectStorageService.getObjectEntityFile(f.object_path!);
        const response = await objectStorageService.downloadObject(file);
        if (!response.ok || !response.body) { overgeslagen.push(naam); continue; }
        archief.append(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream<Uint8Array>), { name: naam });
      } catch (err) {
        if (err instanceof ObjectNotFoundError) { overgeslagen.push(naam); continue; }
        throw err;
      }
    }
    if (overgeslagen.length || gekozen.length < items.length) {
      archief.append(
        [
          "Niet alle gevraagde foto's zitten in dit pakket:",
          ...(items.length > gekozen.length ? [`- ${items.length - gekozen.length} foto('s) buiten je toegang of zonder intern opslagpad`] : []),
          ...overgeslagen.map((n) => `- niet gevonden in opslag: ${n}`),
        ].join("\n"),
        { name: "OVERGESLAGEN.txt" },
      );
    }
    await archief.finalize();
  } catch (err) {
    req.log.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Interne serverfout" });
    else res.destroy();
  }
});

export default router;
