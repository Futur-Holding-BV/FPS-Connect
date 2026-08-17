import { describe, it, expect } from "vitest";
import {
  resolveWerkgeverLogoSubPath,
  berekenWerkgeverLogoPad,
  isSvgSubPath,
  LOGO_PRIMARY_PREFIX,
  LOGO_LEGACY_PREFIX,
} from "./werkgever-logo-pad";

// ── resolveWerkgeverLogoSubPath ───────────────────────────────────────────────
// Bevestigt dat werkgever-logo-paden (primair + legacy) worden geaccepteerd en
// alle overige paden worden afgewezen. Dit garandeert dat haalLogoBuffer nooit
// objecten met een eigen document-ACL kan downloaden via een ingestelde URL.

describe("resolveWerkgeverLogoSubPath", () => {
  it("accepteert een /objects/werkgevers/-pad (primair) en retourneert de subPath", () => {
    expect(resolveWerkgeverLogoSubPath("/objects/werkgevers/1/logo.png")).toBe(
      "werkgevers/1/logo.png",
    );
  });

  it("accepteert een /api/storage/files?path=werkgevers/-pad (URL-encoded)", () => {
    const encoded = "/api/storage/files?path=" + encodeURIComponent("werkgevers/2/logo.svg");
    expect(resolveWerkgeverLogoSubPath(encoded)).toBe("werkgevers/2/logo.svg");
  });

  it("accepteert een kale werkgevers/-subpath (primair)", () => {
    expect(resolveWerkgeverLogoSubPath("werkgevers/3/logo.jpg")).toBe(
      "werkgevers/3/logo.jpg",
    );
  });

  it("accepteert /objects/algemeen/-paden (legacy, vóór migratie)", () => {
    // Bestaande werkgever-logo's zijn opgeslagen onder algemeen/ vóór de migratie.
    // Ze worden tijdelijk ondersteund voor lezen totdat een backfill is uitgevoerd.
    expect(resolveWerkgeverLogoSubPath("/objects/algemeen/abc123.png")).toBe(
      "algemeen/abc123.png",
    );
  });

  it("accepteert een kale algemeen/-subpath (legacy)", () => {
    expect(resolveWerkgeverLogoSubPath("algemeen/uuid.jpeg")).toBe("algemeen/uuid.jpeg");
  });

  it("wijst externe http-URLs af (SSRF-preventie)", () => {
    expect(resolveWerkgeverLogoSubPath("https://evil.example/logo.png")).toBeNull();
    expect(resolveWerkgeverLogoSubPath("http://internal/secret")).toBeNull();
  });

  it("wijst onbekende root-paden af", () => {
    expect(resolveWerkgeverLogoSubPath("/etc/passwd")).toBeNull();
    expect(resolveWerkgeverLogoSubPath("/objects/documenten/1/factuur.pdf")).toBeNull();
  });

  it("LOGO_PRIMARY_PREFIX is 'werkgevers/'", () => {
    expect(LOGO_PRIMARY_PREFIX).toBe("werkgevers/");
  });

  it("LOGO_LEGACY_PREFIX is 'algemeen/'", () => {
    expect(LOGO_LEGACY_PREFIX).toBe("algemeen/");
  });
});

// ── isSvgSubPath ──────────────────────────────────────────────────────────────
// SVG wordt niet ondersteund door PDFKit. Uploads worden geweigerd bij PATCH
// en downloads worden overgeslagen in haalLogoBuffer.

describe("isSvgSubPath", () => {
  it("herkent .svg extensie (case-insensitive)", () => {
    expect(isSvgSubPath("werkgevers/1/logo.svg")).toBe(true);
    expect(isSvgSubPath("werkgevers/1/logo.SVG")).toBe(true);
    expect(isSvgSubPath("algemeen/abc123.svg")).toBe(true);
  });

  it("laat PNG/JPEG/WebP passeren", () => {
    expect(isSvgSubPath("werkgevers/1/logo.png")).toBe(false);
    expect(isSvgSubPath("werkgevers/1/logo.jpg")).toBe(false);
    expect(isSvgSubPath("werkgevers/1/logo.webp")).toBe(false);
  });
});

// ── berekenWerkgeverLogoPad ───────────────────────────────────────────────────
// Bevestigt dat de migratie van algemeen/<uuid>.<ext> naar een werkgever-gebonden
// pad correct verloopt. Na de migratie slaagt resolveWerkgeverLogoSubPath voor
// het nieuwe pad, zodat de mandagstaat het logo kan downloaden.

describe("berekenWerkgeverLogoPad", () => {
  it("berekent het doel-subPath met de juiste extensie", () => {
    expect(berekenWerkgeverLogoPad(42, "algemeen/abc123.png")).toBe(
      "werkgevers/42/logo.png",
    );
    expect(berekenWerkgeverLogoPad(7, "algemeen/uuid.jpeg")).toBe(
      "werkgevers/7/logo.jpeg",
    );
  });

  it("gebruikt lege extensie als het bronpad geen punt bevat", () => {
    expect(berekenWerkgeverLogoPad(1, "algemeen/bestandzonderext")).toBe(
      "werkgevers/1/logo",
    );
  });

  it("het berekende pad slaagt resolveWerkgeverLogoSubPath na migratie", () => {
    const origSubPath = "algemeen/abc123.png";
    const doelSubPath = berekenWerkgeverLogoPad(5, origSubPath);
    const resolved = resolveWerkgeverLogoSubPath(`/objects/${doelSubPath}`);
    expect(resolved).toBe(doelSubPath);
    expect(resolved).not.toBeNull();
  });

  it("het gemigreerde pad is geen SVG (invariant)", () => {
    // Migratie kopieert bestand inclusief extensie; PNG/JPEG blijft geen SVG.
    const doelSubPath = berekenWerkgeverLogoPad(3, "algemeen/logo.png");
    expect(isSvgSubPath(doelSubPath)).toBe(false);
  });
});
