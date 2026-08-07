// DOCUMENT_01 — Nulmeting documentherkenning.
// Draait de éne documentherkenner (classificeerDocument + analyseerFactuurVoorStroom)
// over alle bestanden in een map met echte documenten en schrijft een
// markdown-tabel als bewijs/nulmeting.
//
// Gebruik:
//   pnpm --filter @workspace/scripts exec tsx src/nulmeting-documentherkenning.ts [map]
// Standaardmap: attached_assets/nulmeting (relatief t.o.v. workspace-root).
// Uitvoer: docs/nulmeting-documentherkenning.md
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const WORKSPACE = path.resolve(import.meta.dirname, "../..");
const MAP = path.resolve(WORKSPACE, process.argv[2] ?? "attached_assets/nulmeting");
const UITVOER = path.join(WORKSPACE, "docs/nulmeting-documentherkenning.md");

const MIME_PER_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".msg": "application/vnd.ms-outlook", ".eml": "message/rfc822",
};

function md(v: unknown): string {
  if (v === null || v === undefined || v === "") return "*niet gevonden*";
  return String(v).replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 120);
}

async function main() {
  const di = await import(path.join(WORKSPACE, "artifacts/api-server/src/lib/documentIntelligence.ts"));
  const bestanden = (await readdir(MAP).catch(() => null));
  if (!bestanden || bestanden.length === 0) {
    console.error(`Geen bestanden gevonden in ${MAP} — plaats daar de echte documenten.`);
    process.exit(1);
  }

  const regels: string[] = [];
  let totaalKosten = 0;
  for (const naam of bestanden.sort()) {
    const ext = path.extname(naam).toLowerCase();
    const mime = MIME_PER_EXT[ext];
    if (!mime) { console.log(`Overgeslagen (onbekend type): ${naam}`); continue; }
    const buffer = await readFile(path.join(MAP, naam));
    console.log(`\n=== ${naam} (${buffer.length} bytes) ===`);

    const t0 = Date.now();
    const cls = await di.classificeerDocument({ buffer, bestandsnaam: naam, mime });
    const duurCls = Date.now() - t0;
    const bewijsKort = (cls.bewijs ?? [])
      .map((b: { stap: string; resultaat: string }) => `${b.stap}=${b.resultaat}`)
      .join("; ");
    console.log(`categorie=${cls.categorie} vertrouwen=${cls.vertrouwen} (${duurCls} ms)`);
    for (const b of cls.bewijs ?? []) console.log(`  bewijs: ${b.stap} → ${b.resultaat}${b.detail ? ` (${b.detail})` : ""}`);

    // Factuurextractie alleen zinvol proberen op pdf/afbeelding
    let f: Record<string, unknown> | null = null;
    let isFactuur = false;
    if (mime === "application/pdf" || mime.startsWith("image/")) {
      const t1 = Date.now();
      const res = await di.analyseerFactuurVoorStroom({ buffer, bestandsnaam: naam, mime });
      console.log(`factuurextractie: ok=${res.ok} is_factuur=${res.is_factuur} (${Date.now() - t1} ms)${res.fout ? ` fout=${res.fout}` : ""}`);
      if (res.ok && res.velden) { f = res.velden as Record<string, unknown>; isFactuur = res.is_factuur; }
      if (f) console.log(`  velden: ${JSON.stringify(f)}`);
    }

    regels.push([
      md(naam), md(cls.categorie), md(cls.vertrouwen),
      isFactuur ? "ja" : "nee",
      md(f?.["leverancier_naam"]), md(f?.["factuurnummer"]), md(f?.["factuurdatum"]),
      md(f?.["bedrag_incl_btw"]), md(f?.["iban"]),
      f?.["loondeel_vermeld"] ? md(f?.["loondeel_bedrag"]) : "n.v.t.",
      md(Array.isArray(f?.["onzekere_velden"]) ? (f["onzekere_velden"] as string[]).join(", ") : ""),
      md(bewijsKort),
      "", // Klopt? — handmatig invullen na vergelijking met het echte document
    ].join(" | "));
  }

  // Kosten uit het AI-aanroeplogboek van deze run (indicatief).
  // Even wachten zodat asynchrone logAanroep-inserts geflusht zijn.
  await new Promise((r) => setTimeout(r, 2000));
  try {
    const { db } = await import("@workspace/db");
    const { sql } = await import("drizzle-orm");
    const res = await db.execute(sql`SELECT COALESCE(SUM(geschatte_kosten_eur),0) AS s, COUNT(*) AS n FROM ai_aanroepen WHERE aangemaakt_op > now() - interval '15 minutes' AND module IN ('document-intelligence','facturen')`);
    const rij = (res as unknown as { rows: Array<{ s: string; n: string }> }).rows?.[0];
    if (rij) { totaalKosten = Number(rij.s); console.log(`\nAI-kosten laatste 15 min (document-intelligence + facturen): €${totaalKosten.toFixed(4)} over ${rij.n} aanroepen`); }
  } catch { console.log("Kosten niet uit logboek te halen (geen DB-verbinding?)"); }

  const kop = "Document | Categorie | Vertrouwen | Factuur? | Leverancier | Factuurnr | Datum | Bedrag incl. | IBAN | Loondeel | Onzeker | Bewijsspoor | Klopt?";
  const inhoud = [
    "# Nulmeting documentherkenning (DOCUMENT_01)",
    "",
    `Gemeten op: ${new Date().toISOString()} · Instellingen: 220 DPI, max 2000 px, JPEG 85, detail=high, max 5 pagina's.`,
    `Indicatieve AI-kosten van deze meting: €${totaalKosten.toFixed(4)}.`,
    "",
    "De kolom **Klopt?** wordt handmatig ingevuld door te vergelijken met wat er werkelijk op het document staat.",
    "",
    kop,
    kop.split("|").map(() => "---").join("|"),
    ...regels,
    "",
  ].join("\n");
  await writeFile(UITVOER, inhoud);
  console.log(`\nTabel geschreven naar ${UITVOER}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
