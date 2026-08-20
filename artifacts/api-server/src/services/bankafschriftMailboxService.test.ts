// ─── BANK_01 — Tests voor bijlageherkenning en fout-classificatie ─────────────
// Pure helpers, geen database-aanroepen.

import { describe, it, expect } from "vitest";
import { bepaalBijlageFormaat, isPermanenteFout } from "./bankafschriftMailboxService";
import { maakOAuthState } from "./werkInboxGraph";

describe("werk-inbox OAuth-secretgrens", () => {
  it("laat mailboxhelpers zonder secret laden maar weigert OAuth-state ondertekening", () => {
    const bestaand = process.env["SESSION_SECRET"];
    delete process.env["SESSION_SECRET"];
    try {
      expect(bepaalBijlageFormaat("bankafschrift.xml", "application/xml")).toBe("camt053");
      expect(() => maakOAuthState(1, "nonce-met-minstens-zestien-tekens")).toThrow(
        /SESSION_SECRET ontbreekt of is te kort/,
      );
    } finally {
      if (bestaand == null) delete process.env["SESSION_SECRET"];
      else process.env["SESSION_SECRET"] = bestaand;
    }
  });
});

describe("bepaalBijlageFormaat", () => {
  // ── CAMT via extensie ────────────────────────────────────────────────────
  it("herkent .xml als camt053", () => {
    expect(bepaalBijlageFormaat("bankafschrift.xml", "application/octet-stream")).toBe("camt053");
  });

  it("herkent .XML (hoofdletters) als camt053", () => {
    expect(bepaalBijlageFormaat("CAMT053.XML", "text/plain")).toBe("camt053");
  });

  it("herkent application/xml MIME als camt053 (geen .xml extensie)", () => {
    expect(bepaalBijlageFormaat("bankdata", "application/xml")).toBe("camt053");
  });

  it("herkent text/xml MIME als camt053", () => {
    expect(bepaalBijlageFormaat("bankdata.dat", "text/xml")).toBe("camt053");
  });

  it("herkent application/camt.053.001 MIME als camt053", () => {
    expect(bepaalBijlageFormaat("camt.053", "application/camt.053.001")).toBe("camt053");
  });

  // ── MT940 / Legacy via extensie ──────────────────────────────────────────
  it("herkent .sta als mt940", () => {
    expect(bepaalBijlageFormaat("rabo.sta", "application/octet-stream")).toBe("mt940");
  });

  it("herkent .STA (hoofdletters) als mt940", () => {
    expect(bepaalBijlageFormaat("RABO.STA", "text/plain")).toBe("mt940");
  });

  it("herkent .mt940 als mt940", () => {
    expect(bepaalBijlageFormaat("bankafschrift.mt940", "text/plain")).toBe("mt940");
  });

  it("herkent .MT940 (hoofdletters) als mt940", () => {
    expect(bepaalBijlageFormaat("BANKAFSCHRIFT.MT940", "application/octet-stream")).toBe("mt940");
  });

  it("herkent .txt als mt940", () => {
    expect(bepaalBijlageFormaat("mt940export.txt", "text/plain")).toBe("mt940");
  });

  // ── Onbekend ─────────────────────────────────────────────────────────────
  it("herkent .pdf als onbekend", () => {
    expect(bepaalBijlageFormaat("factuur.pdf", "application/pdf")).toBe("onbekend");
  });

  it("herkent .xls als onbekend", () => {
    expect(bepaalBijlageFormaat("export.xls", "application/vnd.ms-excel")).toBe("onbekend");
  });

  it("herkent .csv als onbekend", () => {
    expect(bepaalBijlageFormaat("mutaties.csv", "text/csv")).toBe("onbekend");
  });

  it("herkent geen extensie + generiek MIME als onbekend", () => {
    expect(bepaalBijlageFormaat("bestand", "application/octet-stream")).toBe("onbekend");
  });
});

describe("isPermanenteFout", () => {
  // ── Permanente fouten ─────────────────────────────────────────────────────
  it("herkent 'geen bijlage' als permanent", () => {
    expect(isPermanenteFout("Geen bijlage gevonden in deze bankmail.")).toBe(true);
  });

  it("herkent 'geen geldige bankbijlage' als permanent", () => {
    expect(isPermanenteFout("Geen geldige bankbijlage gevonden (onbekende extensie/MIME).")).toBe(true);
  });

  it("herkent 'ongeldige extensie' als permanent", () => {
    expect(isPermanenteFout("Ongeldige extensie .pdf")).toBe(true);
  });

  it("herkent 'leeg' als permanent", () => {
    expect(isPermanenteFout("Bijlage is leeg (0 bytes).")).toBe(true);
  });

  it("herkent 'parse' als permanent", () => {
    expect(isPermanenteFout("Parse-fout: ongeldig XML-document.")).toBe(true);
  });

  it("herkent 'formaat' als permanent", () => {
    expect(isPermanenteFout("Bestandsformaat niet ondersteund.")).toBe(true);
  });

  it("herkent 'onbekende iban' als permanent", () => {
    expect(isPermanenteFout("Onbekende IBAN NL99RABO0000000000 — niet gekoppeld aan een werkgever.")).toBe(true);
  });

  it("herkent 'onbekend iban' als permanent (variant)", () => {
    expect(isPermanenteFout("Onbekend IBAN in afschrift.")).toBe(true);
  });

  it("herkent 'geen bytes' als permanent", () => {
    expect(isPermanenteFout("Bijlage heeft geen bytes.")).toBe(true);
  });

  it("herkent 'niet herkend' als permanent", () => {
    expect(isPermanenteFout("Bestandstype niet herkend.")).toBe(true);
  });

  // ── Tijdelijke fouten ─────────────────────────────────────────────────────
  it("herkent 'Import-motor niet beschikbaar' als tijdelijk", () => {
    expect(isPermanenteFout("Import-motor niet beschikbaar: Cannot find module")).toBe(false);
  });

  it("herkent 'Technische fout bij importeren' als tijdelijk", () => {
    expect(isPermanenteFout("Technische fout bij importeren van bestand.xml: database timeout")).toBe(false);
  });

  it("herkent 'Netwerkfout' als tijdelijk", () => {
    expect(isPermanenteFout("Netwerkfout bij ophalen bijlagen: ECONNREFUSED")).toBe(false);
  });

  it("herkent 'Graph HTTP 500' als tijdelijk", () => {
    expect(isPermanenteFout("Graph HTTP 500 bij het ophalen van bijlagen voor bericht.")).toBe(false);
  });

  it("herkent een lege fout als tijdelijk", () => {
    expect(isPermanenteFout("")).toBe(false);
  });
});
