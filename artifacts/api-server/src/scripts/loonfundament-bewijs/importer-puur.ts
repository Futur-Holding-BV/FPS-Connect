// LOON_02A — Controle (5) Importer pure functies: URL allowlist + XLSX-parse.

import { check } from "./harnas";

export async function controleerImporterPuureFuncties(): Promise<void> {
  console.log("\n── (5) Importer pure functies: URL allowlist + XLSX-parse ──");

  const {
    valideerBronUrl,
    valideerBronmanifest,
    parseXlsxNaarParameters,
    VEREISTE_BRONSOORTEN,
    OFFICIELE_BRONMANIFESTEN,
  } =
    await import("../../services/loonfundament-import");

  // ── URL allowlist ─────────────────────────────────────────────────────────

  let httpsOk = false, httpGeweigerd = false, externeGeweigerd = false, spoofGeweigerd = false;
  try { valideerBronUrl("https://download.belastingdienst.nl/file.xlsx"); httpsOk = true; } catch { /* */ }
  try { valideerBronUrl("http://download.belastingdienst.nl/file.xlsx"); } catch { httpGeweigerd = true; }
  try { valideerBronUrl("https://evil.example.com/file.xlsx"); } catch { externeGeweigerd = true; }
  try { valideerBronUrl("https://belastingdienst.nl.evil.com/file.xlsx"); } catch { spoofGeweigerd = true; }

  check("https://download.belastingdienst.nl geaccepteerd",        httpsOk);
  check("http:// (niet HTTPS) geweigerd",                          httpGeweigerd);
  check("extern domein geweigerd",                                  externeGeweigerd);
  check("subdomein-spoof geweigerd",                               spoofGeweigerd);
  check("VEREISTE_BRONSOORTEN bevat exact 7 soorten",              VEREISTE_BRONSOORTEN.length === 7);
  check("primaire_xlsx aanwezig in bronsoorten",
    (VEREISTE_BRONSOORTEN as readonly string[]).includes("primaire_xlsx"),
  );
  const manifest2026 = OFFICIELE_BRONMANIFESTEN[2026]!.map((bron) => ({ ...bron }));
  let manifestOk = false, gewijzigdeHashGeweigerd = false, onbekendJaarGeweigerd = false;
  try { valideerBronmanifest(2026, manifest2026); manifestOk = true; } catch { /* */ }
  try {
    valideerBronmanifest(2026, [
      { ...manifest2026[0]!, verwachte_sha256: "0".repeat(64) },
      ...manifest2026.slice(1),
    ]);
  } catch { gewijzigdeHashGeweigerd = true; }
  try { valideerBronmanifest(2027, []); } catch { onbekendJaarGeweigerd = true; }
  check("gecontroleerd officieel 2026-manifest geaccepteerd", manifestOk);
  check("zelfgekozen hash in manifest geweigerd", gewijzigdeHashGeweigerd);
  check("jaar zonder gecontroleerd manifest geweigerd", onbekendJaarGeweigerd);

  // ── XLSX-parse fixture ────────────────────────────────────────────────────

  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Label",   "Waarde"],
    ["Schijf 1", 38441],
    ["Tarief",  0.0836],
    [null,      null],
    ["Actief",  true],
    ["Naam",    "IB2026"],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Tarieven");
  const buf = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  const params = parseXlsxNaarParameters(buf, "primaire_xlsx");

  const alleMeetVindplaats = params.every(
    (p) => p.sleutel.includes("!") && p.vindplaats.includes("!"),
  );
  check("alle sleutels in Sheet!Cel-formaat", alleMeetVindplaats);

  const b2 = params.find((p) => p.sleutel === "Tarieven!B2");
  check("cel B2 integer 38441",               !!b2 && b2.waarde === 38441 && b2.datatype === "integer");

  const b3 = params.find((p) => p.sleutel === "Tarieven!B3");
  check("cel B3 decimal 0.0836",              !!b3 && b3.waarde === 0.0836 && b3.datatype === "decimal");

  const leegA4 = params.find((p) => p.sleutel === "Tarieven!A4");
  check("lege cel niet opgenomen",            leegA4 === undefined);

  const b5 = params.find((p) => p.sleutel === "Tarieven!B5");
  check("cel B5 boolean true",                !!b5 && b5.waarde === true && b5.datatype === "boolean");

  const naamParam = params.find((p) => p.waarde === "IB2026");
  check("cel IB2026 tekst-datatype",          !!naamParam && naamParam.datatype === "tekst");
}
