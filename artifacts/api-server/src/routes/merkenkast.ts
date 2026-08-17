// MERK_01 deel A — Merkenkast per werkmaatschappij.
//
// De werkgeverrij (documentopmaak-huisstijl) is de ÉNE bron: deze routes lezen
// dezelfde kolommen die de documentopmaak gebruikt, plus de MERK_01-uitbreiding
// (logo-varianten, merkkleuren, lettertype, bedrijfsomschrijvingen). Er wordt
// niets gekopieerd naar een tweede plek.
//
// Rechten (getoetst tegen bestaande crm-routes: marketing.ts/social.ts):
//   crm niveau 3 = merkenkast bekijken en downloaden (per stuk en als pakket).
// Beheren gaat via de bestaande werkgever-routes (PATCH /werkgevers, HRM).
import { Router } from "express";
import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import { db, werkgeversTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireBevoegdheid } from "../middlewares/auth";
import { ObjectStorageService } from "../lib/objectStorage";
const objectStorageService = new ObjectStorageService();
import { ObjectNotFoundError } from "../lib/objectStorageTypes";

const router = Router();
const lezen = requireBevoegdheid("crm", 3);

// Vaste, eindige set logo-variantsleutels (zelfde sleutels als de frontend).
export const LOGO_VARIANTEN = ["kleur", "wit", "zwart", "liggend", "vierkant", "transparant"] as const;
export type LogoVariant = (typeof LOGO_VARIANTEN)[number];

type MerkKleur = { naam: string; hex: string };

const parseKleuren = (waarde: unknown): MerkKleur[] => {
  if (!Array.isArray(waarde)) return [];
  return waarde
    .filter((k): k is Record<string, unknown> => !!k && typeof k === "object")
    .map((k) => ({ naam: String(k.naam ?? ""), hex: String(k.hex ?? "") }))
    .filter((k) => k.hex);
};

const parseVarianten = (waarde: unknown): Partial<Record<LogoVariant, string>> => {
  if (!waarde || typeof waarde !== "object") return {};
  const uit: Partial<Record<LogoVariant, string>> = {};
  for (const variant of LOGO_VARIANTEN) {
    const pad = (waarde as Record<string, unknown>)[variant];
    if (typeof pad === "string" && pad.trim()) uit[variant] = pad;
  }
  return uit;
};

// Zet een opgeslagen pad om naar een client-downloadbare URL. Paden zijn
// object-paden (/objects/…); de storage-route dwingt de ACL af.
const downloadUrl = (pad: string) =>
  pad.startsWith("http") ? pad : `/api/storage/objects/${pad.slice("/objects/".length).split("/").map(encodeURIComponent).join("/")}`;

const mapMerk = (w: typeof werkgeversTable.$inferSelect) => {
  const varianten = parseVarianten(w.logoVarianten);
  return {
    werkgever_id: w.id,
    naam: w.naam,
    logo_url: w.logoUrl ? downloadUrl(w.logoUrl) : null,
    logo_varianten: Object.fromEntries(
      Object.entries(varianten).map(([variant, pad]) => [variant, downloadUrl(pad)]),
    ),
    primaire_kleur: w.primaireKleur ?? "#F23B0D",
    merk_kleuren: parseKleuren(w.merkKleuren),
    lettertype: w.lettertype ?? null,
    omschrijving_kort: w.omschrijvingKort ?? null,
    omschrijving_lang: w.omschrijvingLang ?? null,
    adres: w.adres,
    postcode: w.postcode,
    plaats: w.plaats,
    telefoon: w.telefoon,
    email: w.email,
    website: w.website,
    kvk: w.kvk,
    btw: w.btw,
    iban: w.iban,
  };
};

// GET /merkenkast — alle actieve werkmaatschappijen met hun merkgegevens.
router.get("/merkenkast", lezen, async (req, res): Promise<void> => {
  try {
    const rijen = await db.select().from(werkgeversTable)
      .where(eq(werkgeversTable.actief, true)).orderBy(werkgeversTable.naam);
    res.json(rijen.map(mapMerk));
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Interne serverfout" });
  }
});

// Normaliseert een opgeslagen verwijzing naar een /objects/…-pad, of null als
// het geen intern object is (externe URL's horen niet in het pakket).
export const naarObjectPad = (ruw: string | null | undefined): string | null => {
  if (!ruw) return null;
  const zonderHost = ruw.startsWith("http") ? (() => { try { const u = new URL(ruw); return `${u.pathname}${u.search}`; } catch { return null; } })() : ruw;
  if (!zonderHost) return null;
  const padParam = zonderHost.includes("path=")
    ? decodeURIComponent(zonderHost.split("path=")[1]?.split("&")[0] ?? "")
    : zonderHost;
  if (padParam.startsWith("/objects/")) return padParam;
  if (padParam.startsWith("/api/storage/objects/")) return padParam.replace("/api/storage", "");
  return null;
};

// Bestandsnaam-veilige variant van een tekst.
const veilig = (s: string) => s.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "bestand";

// Voegt een object uit de opslag toe aan een zip-archief; ontbrekende
// bestanden worden overgeslagen (het pakket faalt daar niet op, maar het
// manifest benoemt ze zodat niets stilzwijgend ontbreekt).
async function voegObjectToe(archief: import("archiver").Archiver, objectPad: string, naamInZip: string): Promise<boolean> {
  try {
    const file = await objectStorageService.getObjectEntityFile(objectPad);
    const response = await objectStorageService.downloadObject(file);
    if (!response.ok || !response.body) return false;
    archief.append(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream<Uint8Array>), { name: naamInZip });
    return true;
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return false;
    throw err;
  }
}

// GET /merkenkast/:werkgeverId/pakket — alles van één werkmaatschappij als zip.
router.get("/merkenkast/:werkgeverId/pakket", lezen, async (req, res): Promise<void> => {
  try {
    const id = Number.parseInt(String(req.params.werkgeverId), 10);
    const [w] = await db.select().from(werkgeversTable).where(eq(werkgeversTable.id, id));
    if (!w || !w.actief) return void res.status(404).json({ error: "Werkmaatschappij niet gevonden" });

    const merk = mapMerk(w);
    const archief = new ZipArchive({ zlib: { level: 6 } });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="merkenkast-${veilig(w.naam)}.zip"`);
    archief.on("error", (err: Error) => { req.log.error(err); res.destroy(err); });
    archief.pipe(res);

    const ontbrekend: string[] = [];
    const hoofdPad = naarObjectPad(w.logoUrl);
    if (hoofdPad) {
      const ext = hoofdPad.split(".").pop()?.length === 3 || hoofdPad.split(".").pop()?.length === 4 ? `.${hoofdPad.split(".").pop()}` : ".png";
      if (!(await voegObjectToe(archief, hoofdPad, `logo/logo-kleur${ext}`))) ontbrekend.push("logo (hoofdvariant)");
    }
    for (const [variant, url] of Object.entries(parseVarianten(w.logoVarianten))) {
      const pad = naarObjectPad(url);
      if (!pad) continue;
      const ext = pad.includes(".") ? `.${pad.split(".").pop()}` : ".png";
      if (!(await voegObjectToe(archief, pad, `logo/logo-${variant}${ext}`))) ontbrekend.push(`logo-variant ${variant}`);
    }

    // Merkgegevens als leesbaar tekstbestand + machine-leesbare JSON.
    const kleuren = [{ naam: "Primaire kleur", hex: merk.primaire_kleur }, ...merk.merk_kleuren];
    const tekst = [
      `MERKENKAST — ${w.naam}`,
      "",
      "KLEUREN",
      ...kleuren.map((k) => `  ${k.naam || "Kleur"}: ${k.hex}`),
      "",
      `LETTERTYPE\n  ${merk.lettertype ?? "(niet vastgelegd)"}`,
      "",
      `KORTE OMSCHRIJVING\n  ${merk.omschrijving_kort ?? "(niet vastgelegd)"}`,
      "",
      `LANGE OMSCHRIJVING\n  ${merk.omschrijving_lang ?? "(niet vastgelegd)"}`,
      "",
      "CONTACT",
      `  ${[w.adres, [w.postcode, w.plaats].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "(geen adres)"}`,
      `  Telefoon: ${w.telefoon ?? "-"}  E-mail: ${w.email ?? "-"}  Website: ${w.website ?? "-"}`,
      `  KvK: ${w.kvk ?? "-"}  BTW: ${w.btw ?? "-"}  IBAN: ${w.iban ?? "-"}`,
      ...(ontbrekend.length ? ["", "NIET AANGETROFFEN IN OPSLAG", ...ontbrekend.map((o) => `  - ${o}`)] : []),
      "",
    ].join("\n");
    archief.append(tekst, { name: "merkgegevens.txt" });
    archief.append(JSON.stringify({ ...merk, ontbrekend }, null, 2), { name: "merkgegevens.json" });
    await archief.finalize();
  } catch (err) {
    req.log.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Interne serverfout" });
    else res.destroy();
  }
});

export default router;
