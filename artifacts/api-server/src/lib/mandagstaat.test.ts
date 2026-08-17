import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveWerkgeverLogoSubPath,
  berekenWerkgeverLogoPad,
  isSvgSubPath,
  LOGO_PRIMARY_PREFIX,
  LOGO_LEGACY_PREFIX,
} from "./werkgever-logo-pad";

// ── resolveWerkgeverLogoSubPath ───────────────────────────────────────────────

describe("resolveWerkgeverLogoSubPath", () => {
  it("accepteert /objects/werkgevers/-pad en retourneert de subPath", () => {
    expect(resolveWerkgeverLogoSubPath("/objects/werkgevers/1/logo.png")).toBe(
      "werkgevers/1/logo.png",
    );
  });

  it("accepteert /api/storage/objects/werkgevers/-pad (canoniek formaat)", () => {
    expect(resolveWerkgeverLogoSubPath("/api/storage/objects/werkgevers/2/logo.png")).toBe(
      "werkgevers/2/logo.png",
    );
  });

  it("accepteert /api/storage/files?path=werkgevers/-pad (historisch formaat)", () => {
    const encoded = "/api/storage/files?path=" + encodeURIComponent("werkgevers/2/logo.jpg");
    expect(resolveWerkgeverLogoSubPath(encoded)).toBe("werkgevers/2/logo.jpg");
  });

  it("accepteert kale werkgevers/-subpath (primair)", () => {
    expect(resolveWerkgeverLogoSubPath("werkgevers/3/logo.jpg")).toBe("werkgevers/3/logo.jpg");
  });

  it("accepteert /objects/algemeen/-pad (legacy)", () => {
    expect(resolveWerkgeverLogoSubPath("/objects/algemeen/abc123.png")).toBe("algemeen/abc123.png");
  });

  it("accepteert /api/storage/objects/algemeen/-pad (legacy canoniek formaat)", () => {
    expect(resolveWerkgeverLogoSubPath("/api/storage/objects/algemeen/abc123.png")).toBe(
      "algemeen/abc123.png",
    );
  });

  it("accepteert kale algemeen/-subpath (legacy)", () => {
    expect(resolveWerkgeverLogoSubPath("algemeen/uuid.jpeg")).toBe("algemeen/uuid.jpeg");
  });

  it("accepteert WebP en GIF logo's (worden later omgezet naar PNG)", () => {
    expect(resolveWerkgeverLogoSubPath("werkgevers/1/logo.webp")).toBe("werkgevers/1/logo.webp");
    expect(resolveWerkgeverLogoSubPath("werkgevers/1/logo.gif")).toBe("werkgevers/1/logo.gif");
  });

  it("wijst externe http-URLs af (SSRF-preventie)", () => {
    expect(resolveWerkgeverLogoSubPath("https://evil.example/logo.png")).toBeNull();
    expect(resolveWerkgeverLogoSubPath("http://internal/secret")).toBeNull();
  });

  it("wijst onbekende root-paden af", () => {
    expect(resolveWerkgeverLogoSubPath("/etc/passwd")).toBeNull();
    expect(resolveWerkgeverLogoSubPath("/objects/documenten/1/factuur.pdf")).toBeNull();
    expect(resolveWerkgeverLogoSubPath("/api/storage/objects/documenten/1/factuur.pdf")).toBeNull();
  });

  it("LOGO_PRIMARY_PREFIX is 'werkgevers/'", () => {
    expect(LOGO_PRIMARY_PREFIX).toBe("werkgevers/");
  });

  it("LOGO_LEGACY_PREFIX is 'algemeen/'", () => {
    expect(LOGO_LEGACY_PREFIX).toBe("algemeen/");
  });
});

// ── isSvgSubPath ──────────────────────────────────────────────────────────────

describe("isSvgSubPath", () => {
  it("herkent .svg extensie (case-insensitive)", () => {
    expect(isSvgSubPath("werkgevers/1/logo.svg")).toBe(true);
    expect(isSvgSubPath("werkgevers/1/logo.SVG")).toBe(true);
    expect(isSvgSubPath("algemeen/abc123.svg")).toBe(true);
  });

  it("laat PNG/JPEG/WebP/GIF passeren", () => {
    expect(isSvgSubPath("werkgevers/1/logo.png")).toBe(false);
    expect(isSvgSubPath("werkgevers/1/logo.jpg")).toBe(false);
    expect(isSvgSubPath("werkgevers/1/logo.webp")).toBe(false);
    expect(isSvgSubPath("werkgevers/1/logo.gif")).toBe(false);
  });
});

// ── berekenWerkgeverLogoPad ───────────────────────────────────────────────────

describe("berekenWerkgeverLogoPad", () => {
  it("berekent het doel-subPath met de juiste extensie", () => {
    expect(berekenWerkgeverLogoPad(42, "algemeen/abc123.png")).toBe("werkgevers/42/logo.png");
    expect(berekenWerkgeverLogoPad(7, "algemeen/uuid.jpeg")).toBe("werkgevers/7/logo.jpeg");
  });

  it("het berekende pad slaagt resolveWerkgeverLogoSubPath na migratie", () => {
    const origSubPath = "algemeen/abc123.png";
    const doelSubPath = berekenWerkgeverLogoPad(5, origSubPath);
    expect(resolveWerkgeverLogoSubPath(`/objects/${doelSubPath}`)).toBe(doelSubPath);
    expect(resolveWerkgeverLogoSubPath(`/api/storage/objects/${doelSubPath}`)).toBe(doelSubPath);
  });
});

// ── Print-data logo URL canonicalisatie ──────────────────────────────────────
// De print-data endpoint normaliseert logo_url naar /api/storage/objects/<subPath>
// zodat de browser de afbeelding via de objects-route kan laden.
// De /api/storage/files?path=... route bestaat niet in storage.ts.

describe("print-data logo URL canonicalisatie", () => {
  // Simuleert de server-side logica in mod-calculatie.ts print-data endpoint.
  function canonicaliseerLogoUrl(rawLogoUrl: string | null): string | null {
    if (!rawLogoUrl) return null;
    const subPath = resolveWerkgeverLogoSubPath(rawLogoUrl);
    if (subPath === null) return null;
    return `/api/storage/objects/${encodeURIComponent(subPath)}`;
  }

  it("canonical /api/storage/objects/-URL blijft canonical", () => {
    const raw = "/api/storage/objects/werkgevers/1/logo.png";
    const result = canonicaliseerLogoUrl(raw);
    expect(result).toBe("/api/storage/objects/werkgevers%2F1%2Flogo.png");
    // Bevat nooit /api/storage/api/storage/... (dubbel prefix)
    expect(result).not.toContain("/api/storage/api/");
  });

  it("legacy /api/storage/files?path=... wordt omgezet naar objects-URL", () => {
    const raw = `/api/storage/files?path=${encodeURIComponent("werkgevers/2/logo.png")}`;
    const result = canonicaliseerLogoUrl(raw);
    expect(result).toBe("/api/storage/objects/werkgevers%2F2%2Flogo.png");
    // Bevat nooit /files?path= in de uitvoer
    expect(result).not.toContain("/files?path=");
  });

  it("/objects/-URL wordt omgezet naar canonical objects-URL", () => {
    expect(canonicaliseerLogoUrl("/objects/werkgevers/3/logo.jpg")).toBe(
      "/api/storage/objects/werkgevers%2F3%2Flogo.jpg",
    );
  });

  it("legacy algemeen/-pad (voor migratie) wordt ook omgezet", () => {
    expect(canonicaliseerLogoUrl("/objects/algemeen/abc123.png")).toBe(
      "/api/storage/objects/algemeen%2Fabc123.png",
    );
  });

  it("externe URL retourneert null (SSRF-preventie)", () => {
    expect(canonicaliseerLogoUrl("https://evil.com/logo.png")).toBeNull();
  });

  it("null retourneert null", () => {
    expect(canonicaliseerLogoUrl(null)).toBeNull();
  });
});

// ── Werkgever-bronprioriteit voor mandagstaat en calculatie-print ────────────
// Documenteert de stabiele bronketen zodat toekomstige wijzigingen de
// bedoeling niet stilzwijgend doorbreken.

describe("werkgever-bronprioriteit", () => {
  // Simuleert de bronketen die in beide documenten wordt gehanteerd.
  type BronResultaat = { bron: "gebouw" | "aanmaker" | "dominant" | "fallback"; werkgeverId: number | null };

  function bepaalBron(
    gebouwWerkgeverId: number | null,
    aanmakerWerkgeverId: number | null,
    dominanteMedewerkerWerkgeverId: number | null,
  ): BronResultaat {
    if (gebouwWerkgeverId != null) return { bron: "gebouw", werkgeverId: gebouwWerkgeverId };
    if (aanmakerWerkgeverId != null) return { bron: "aanmaker", werkgeverId: aanmakerWerkgeverId };
    if (dominanteMedewerkerWerkgeverId != null) return { bron: "dominant", werkgeverId: dominanteMedewerkerWerkgeverId };
    return { bron: "fallback", werkgeverId: null };
  }

  it("primair: gebouw.werkgever_id — stabiel ongeacht urenverdeling", () => {
    const r = bepaalBron(3, 5, 7);
    expect(r.bron).toBe("gebouw");
    expect(r.werkgeverId).toBe(3);
  });

  it("calculatie zonder gebouw: valt terug op aanmaker.medewerker.werkgever_id", () => {
    const r = bepaalBron(null, 5, 7);
    expect(r.bron).toBe("aanmaker");
    expect(r.werkgeverId).toBe(5);
  });

  it("mandagstaat zonder gebouw-werkgever: dominant medewerker-werkgever als noodvangst", () => {
    const r = bepaalBron(null, null, 7);
    expect(r.bron).toBe("dominant");
    expect(r.werkgeverId).toBe(7);
  });

  it("volledig onbekend: FPS fallback (geen branding)", () => {
    const r = bepaalBron(null, null, null);
    expect(r.bron).toBe("fallback");
    expect(r.werkgeverId).toBeNull();
  });
});

// ── Formaat-omzetting gedragsregels voor haalLogoBuffer ──────────────────────
// PDFKit 0.19 ondersteunt alleen JPEG en PNG.
// WebP en GIF worden via sharp omgezet naar PNG.
// SVG wordt afgewezen (return null) vóór download.

describe("logo-formaat omzettingsgedrag", () => {
  // We testen de extensie-detectielogica die in haalLogoBuffer wordt gebruikt
  // zonder de volledige objectStorage en sharp stack te initialiseren.

  function bepaalBenodigdTranscode(subPath: string): "transcode" | "passthrough" {
    const ext = subPath.toLowerCase().slice(subPath.lastIndexOf("."));
    if (ext === ".svg" || ext === ".webp" || ext === ".gif") return "transcode";
    return "passthrough";
  }

  it("SVG wordt naar PNG omgezet via sharp (bestaande DB-logo's blijven werken)", () => {
    // SVG-uploads zijn geblokkeerd bij POST/PATCH, maar bestaande SVG-paden
    // in de DB worden geconverteerd zodat het logo in de PDF verschijnt.
    expect(bepaalBenodigdTranscode("werkgevers/1/logo.svg")).toBe("transcode");
    expect(bepaalBenodigdTranscode("algemeen/logo.SVG")).toBe("transcode");
  });

  it("PNG en JPEG worden direct doorgegeven aan PDFKit", () => {
    expect(bepaalBenodigdTranscode("werkgevers/1/logo.png")).toBe("passthrough");
    expect(bepaalBenodigdTranscode("werkgevers/1/logo.jpg")).toBe("passthrough");
    expect(bepaalBenodigdTranscode("werkgevers/1/logo.jpeg")).toBe("passthrough");
  });

  it("WebP wordt omgezet naar PNG voor PDFKit", () => {
    expect(bepaalBenodigdTranscode("werkgevers/1/logo.webp")).toBe("transcode");
  });

  it("GIF wordt omgezet naar PNG voor PDFKit", () => {
    expect(bepaalBenodigdTranscode("werkgevers/1/logo.gif")).toBe("transcode");
  });
});
