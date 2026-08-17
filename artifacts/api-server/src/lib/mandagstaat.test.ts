import { describe, it, expect } from "vitest";
import {
  resolveWerkgeverLogoSubPath,
  berekenWerkgeverLogoPad,
  LOGO_STORAGE_PREFIX,
} from "./werkgever-logo-pad";

// ── resolveWerkgeverLogoSubPath ───────────────────────────────────────────────
// Bevestigt dat werkgever-logo-paden worden geaccepteerd en alle andere paden
// worden afgewezen. Dit garandeert dat haalLogoBuffer nooit objecten met een
// eigen document-ACL kan downloaden via een door een beheerder ingestelde URL.

describe("resolveWerkgeverLogoSubPath", () => {
  it("accepteert een /objects/werkgevers/-pad en retourneert de subPath", () => {
    expect(resolveWerkgeverLogoSubPath("/objects/werkgevers/1/logo.png")).toBe(
      "werkgevers/1/logo.png",
    );
  });

  it("accepteert de canonieke /api/storage/objects/werkgevers/-URL", () => {
    expect(resolveWerkgeverLogoSubPath("/api/storage/objects/werkgevers/2/logo.svg")).toBe(
      "werkgevers/2/logo.svg",
    );
  });

  it("accepteert een /api/storage/files?path=werkgevers/-pad (historisch dood formaat)", () => {
    const encoded = "/api/storage/files?path=" + encodeURIComponent("werkgevers/2/logo.svg");
    expect(resolveWerkgeverLogoSubPath(encoded)).toBe("werkgevers/2/logo.svg");
  });

  it("accepteert een kale werkgevers/-subpath", () => {
    expect(resolveWerkgeverLogoSubPath("werkgevers/3/logo.jpg")).toBe(
      "werkgevers/3/logo.jpg",
    );
  });

  it("wijst /objects/algemeen/-paden af (upload-standaardpad vóór migratie)", () => {
    expect(resolveWerkgeverLogoSubPath("/objects/algemeen/abc123.png")).toBeNull();
  });

  it("wijst externe http-URLs af (SSRF-preventie)", () => {
    expect(resolveWerkgeverLogoSubPath("https://evil.example/logo.png")).toBeNull();
    expect(resolveWerkgeverLogoSubPath("http://internal/secret")).toBeNull();
  });

  it("wijst onbekende root-paden af", () => {
    expect(resolveWerkgeverLogoSubPath("/etc/passwd")).toBeNull();
    expect(resolveWerkgeverLogoSubPath("/objects/documenten/1/factuur.pdf")).toBeNull();
  });

  it("LOGO_STORAGE_PREFIX is 'werkgevers/' (bewaker-invariant)", () => {
    expect(LOGO_STORAGE_PREFIX).toBe("werkgevers/");
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
});
