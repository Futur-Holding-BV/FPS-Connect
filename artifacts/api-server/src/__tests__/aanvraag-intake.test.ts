// AANVRAAG_01 — regressietests voor kerninvarianten
//
// Bevat twee soorten tests:
// A. Pure unit-tests: geen mocking nodig (selecteerKlantUitKandidaten, citaatnormalisatie,
//    inputvalidatie via Zod).
// B. Source-inspectie guards: bewijs dat gevaarlijk gedrag NOOIT aanwezig is
//    (geen offerte-aanmaak vóór akkoord, conditionele DB-claim, maak-offerte poort).

import { describe, it, expect, vi } from "vitest";
import { AccepteerAanvraagVoorstelBody } from "@workspace/api-zod";
import { statusVoorAanvraagUploadConflict } from "../services/aanvraagUploadIdempotentie";
import {
  analyseerAanvraagVoorStroom,
  citaatGeldig,
  normaliseerCitaatTekst,
  valideerBronBewijs,
} from "../lib/documentIntelligence";

// ─── Pure unit-tests voor selecteerKlantUitKandidaten ───────────────────────

describe("statusVoorAanvraagUploadConflict", () => {
  it("herkent de door Drizzle verpakte unieke databasefout", () => {
    expect(statusVoorAanvraagUploadConflict({
      cause: {
        code: "23505",
        constraint: "aanvraag_voorstellen_mail_uq",
      },
    })).toBe(409);
  });

  it("verbergt andere unieke conflicten niet als dubbel bronbestand", () => {
    expect(statusVoorAanvraagUploadConflict({
      cause: {
        code: "23505",
        constraint: "andere_unieke_constraint",
      },
    })).toBeNull();
  });
});

// D. Importeer de pure selectiefunctie direct — geen mocks nodig.
// We importeren ook de citaat-helpers.
// Let op: we mogen de module zelf importeren als we alleen de pure exports gebruiken,
// maar aanvraagstroomService heeft DB-imports op module-level. Daarom mocken we @workspace/db.

vi.mock("../lib/objectStorage", () => ({
  ObjectStorageService: vi.fn().mockImplementation(() => ({
    uploadBestand: vi.fn().mockResolvedValue("/mock/path"),
  })),
}));
vi.mock("../lib/storageObjectsUrl", () => ({ storageObjectsUrl: vi.fn((p: string) => `/objects/${p}`) }));
vi.mock("../lib/pdfTekst", () => ({ extraheerPdfTekst: vi.fn().mockResolvedValue({ tekst: "" }) }));
vi.mock("../services/werkInboxGraph", () => ({
  haalBijlagen: vi.fn().mockResolvedValue([]),
  haalVolledigeMail: vi.fn().mockResolvedValue(null),
  beantwoordMail: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("../services/factuurstroomService", () => ({ maakSignaal: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../lib/aiGateway", () => ({
  aiGateway: { chat: vi.fn().mockResolvedValue({ ok: false, fout: "mock" }) },
  heeftGateway: vi.fn().mockReturnValue(false),
}));
vi.mock("@workspace/db", () => {
  const mockDb = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
          innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }),
          leftJoin: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }),
        }),
        innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }),
        leftJoin: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }) }),
        orderBy: vi.fn().mockReturnValue({ limit: vi.fn().mockResolvedValue([]) }),
      }),
    }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) }) }),
    update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }) }),
    transaction: vi.fn(),
    execute: vi.fn().mockResolvedValue(undefined),
  };
  return {
    db: mockDb,
    crmKlantenTable: { id: "id", naam: "naam", email: "email", website: "website" },
    crmContactpersonenTable: { id: "id", klantId: "klantId", naam: "naam", email: "email", telefoon: "telefoon" },
    aanvraagVoorstellenTable: { id: "id", status: "status", mailMessageId: "mailMessageId", voorstelType: "voorstelType" },
    inboxItemsTable: { id: "id", status: "status", documentCategorie: "documentCategorie", gekoppeldeEntiteitType: "gekoppeldeEntiteitType", gekoppeldeEntiteitId: "gekoppeldeEntiteitId" },
    inboxAuditLogTable: { id: "id" },
    gebouwenTable: { id: "id", naam: "naam" },
    gebouwPartijenTable: { id: "id", gebouwId: "gebouwId", type: "type", klantId: "klantId" },
    opnamesTable: { id: "id" },
    modCalcHeadersTable: { id: "id", status: "status" },
    crmCommercieelTable: { id: "id" },
    werkInboxKoppelingenTable: { id: "id" },
    werkgeversTable: { id: "id", naam: "naam" },
    offertesTable: { id: "id" },
    offerteRegelsTable: { id: "id" },
    projectenTable: { id: "id" },
    gebruikersTable: { id: "id" },
    werkInboxMailboxenTable: { id: "id" },
    werkInboxTokensTable: { id: "id" },
    werkInboxMailsTable: { id: "id" },
    appInstellingenTable: { id: "id" },
    aanvraagPlanningenTable: { id: "id", inboxItemId: "inboxItemId" },
    WERK_INBOX_ENTITY_TYPES: [],
    FPS_BEDRIJVEN: ["FPS Bouw", "FPS Brandpreventie", "FPS Onderhoud"],
  };
});
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"), and: vi.fn(() => "and"), or: vi.fn(() => "or"),
  ilike: vi.fn(() => "ilike"), desc: vi.fn(() => "desc"), asc: vi.fn(() => "asc"),
  inArray: vi.fn(() => "inArray"), isNull: vi.fn(() => "isNull"), isNotNull: vi.fn(() => "isNotNull"),
  sql: vi.fn(() => "sql"), count: vi.fn(() => "count"),
}));

// ─── D. Pure tests: selecteerKlantUitKandidaten ───────────────────────────────

describe("selecteerKlantUitKandidaten — pure selectielogica", () => {
  it("één sterke kandidaat → preselecteren + kandidaten bewaren", async () => {
    const { selecteerKlantUitKandidaten } = await import("../services/aanvraagMatchSelector");
    const kandidaten = [
      { id: 7, naam: "Zorgcentrum BV", redenen: ["exact afzendermail info@zorgcentrum.nl"], sterkte: "sterk" as const },
    ];
    const r = selecteerKlantUitKandidaten(kandidaten);
    expect(r.klantId).toBe(7);
    expect(r.klantNaam).toBe("Zorgcentrum BV");
    // D. kandidaten ALTIJD teruggeven — ook bij preselectie
    expect(r.kandidaten).toHaveLength(1);
    expect(r.kandidaten[0].redenen).toContain("exact afzendermail info@zorgcentrum.nl");
  });

  it("twee sterke kandidaten → geen preselectie, beide kandidaten teruggeven", async () => {
    const { selecteerKlantUitKandidaten } = await import("../services/aanvraagMatchSelector");
    const kandidaten = [
      { id: 1, naam: "Klant A", redenen: ["exact afzendermail"], sterkte: "sterk" as const },
      { id: 2, naam: "Klant B", redenen: ["exact afzendermail"], sterkte: "sterk" as const },
    ];
    const r = selecteerKlantUitKandidaten(kandidaten);
    expect(r.klantId).toBeNull();
    expect(r.klantNaam).toBeNull();
    expect(r.kandidaten).toHaveLength(2);
  });

  it("alleen zwakke kandidaten → geen preselectie", async () => {
    const { selecteerKlantUitKandidaten } = await import("../services/aanvraagMatchSelector");
    const kandidaten = [
      { id: 5, naam: "Bouwbedrijf BV", redenen: ["maildomein bouwbedrijf.nl"], sterkte: "zwak" as const },
    ];
    const r = selecteerKlantUitKandidaten(kandidaten);
    expect(r.klantId).toBeNull();
    expect(r.kandidaten).toHaveLength(1);
    expect(r.kandidaten[0].sterkte).toBe("zwak");
  });

  it("nul kandidaten → geen preselectie, lege lijst", async () => {
    const { selecteerKlantUitKandidaten } = await import("../services/aanvraagMatchSelector");
    const r = selecteerKlantUitKandidaten([]);
    expect(r.klantId).toBeNull();
    expect(r.kandidaten).toHaveLength(0);
  });

  it("één sterke + één zwakke → preselecteert de sterke, geeft beide terug", async () => {
    const { selecteerKlantUitKandidaten } = await import("../services/aanvraagMatchSelector");
    const kandidaten = [
      { id: 3, naam: "Sterk Corp", redenen: ["exact afzendermail"], sterkte: "sterk" as const },
      { id: 9, naam: "Zwak BV", redenen: ["maildomein corp.nl"], sterkte: "zwak" as const },
    ];
    const r = selecteerKlantUitKandidaten(kandidaten);
    expect(r.klantId).toBe(3);
    expect(r.kandidaten).toHaveLength(2);
  });
});

// ─── C. Pure tests: citaatnormalisatie en validatie ───────────────────────────

describe("citaatnormalisatie en bronbewijs-validatie", () => {
  it("normaliseerCitaatTekst: lowercase + whitespace normalisatie", async () => {
    expect(normaliseerCitaatTekst("  Hallo  Wereld  ")).toBe("hallo wereld");
    expect(normaliseerCitaatTekst("FPS\u00a0Brandpreventie")).toBe("fps brandpreventie");
    expect(normaliseerCitaatTekst("Zorgcentrum\u2018De Linde\u2019")).toBe("zorgcentrum de linde");
  });

  it("citaatGeldig: letterlijk aanwezig → true", async () => {
    const tekst = "Geachte heer, hierbij vraag ik een offerte aan voor Zorgcentrum De Linde.";
    expect(citaatGeldig("Zorgcentrum De Linde", tekst)).toBe(true);
  });

  it("citaatGeldig: niet aanwezig (verzonnen) → false", async () => {
    const tekst = "Geachte heer, wij zijn geïnteresseerd in uw diensten.";
    expect(citaatGeldig("Brandwerende doorvoeringen Winkelcentrum", tekst)).toBe(false);
  });

  it("citaatGeldig: te kort (<4 tekens) → false", async () => {
    expect(citaatGeldig("ABC", "ABC is een kort woord")).toBe(false);
  });

  it("citaatGeldig: null → false", async () => {
    expect(citaatGeldig(null, "willekeurige tekst")).toBe(false);
  });

  it("valideerBronBewijs: geldig citaat behoudt waarde + bewijs", async () => {
    const velden = {
      titel: "brandwerende doorvoeringen",
      klant_naam: "Zorgcentrum BV",
      klant_adres: "Dorpsstraat 2", klant_postcode: "1234 AB", klant_stad: "Testdam",
      contact_naam: "Jan Jansen", contact_email: "jan@example.nl", contact_telefoon: "0612345678",
      gebouw_naam: null, gebouw_adres: null, gebouw_stad: null, gebouw_postcode: null,
      werkzaamheden: "brandwerende doorvoeringen", bv: "FPS Bouw" as const, werknummer_verwijzing: "W-123",
      ontbrekende_stukken: ["plattegrond"], samenvatting: "brandwerende doorvoeringen", onzekere_velden: [],
      bron_bewijs: {
        organisatienaam: { bron_zin: "Zorgcentrum BV is onze organisatie" },   // geldig
        opdrachtgever_adres: { bron_zin: "Dorpsstraat 2" },
        opdrachtgever_postcode: { bron_zin: "1234 AB" },
        opdrachtgever_stad: { bron_zin: "Testdam" },
        contactpersoon: { bron_zin: "Contact: Jan Jansen, jan@example.nl, 0612345678" },
        email: { bron_zin: "Contact: Jan Jansen, jan@example.nl, 0612345678" },
        telefoon: { bron_zin: "Contact: Jan Jansen, jan@example.nl, 0612345678" },
        gebouwnaam: null, adres: null,
        stad: null, postcode: null,
        titel: { bron_zin: "brandwerende doorvoeringen" },  // geldig
        werkzaamheden: { bron_zin: "brandwerende doorvoeringen" },
        bv: { bron_zin: "Uitvoering door FPS Bouw" },
        werknummer: { bron_zin: "Ons werknummer is W-123" },
        ontbrekende_stukken: { bron_zin: "De plattegrond volgt later" },
        samenvatting: { bron_zin: "brandwerende doorvoeringen" },
      },
    };
    const brontekst = "Zorgcentrum BV is onze organisatie, gevestigd aan Dorpsstraat 2, 1234 AB Testdam. Contact: Jan Jansen, jan@example.nl, 0612345678. Wij vragen een offerte voor brandwerende doorvoeringen. Uitvoering door FPS Bouw. Ons werknummer is W-123. De plattegrond volgt later.";
    const result = valideerBronBewijs(velden, brontekst);
    // Geldig → waarde EN bewijs blijven behouden
    expect(result.klant_naam).toBe("Zorgcentrum BV");
    expect(result.klant_adres).toBe("Dorpsstraat 2");
    expect(result.klant_postcode).toBe("1234 AB");
    expect(result.klant_stad).toBe("Testdam");
    expect(result.bron_bewijs.organisatienaam?.bron_zin).not.toBeNull();
    expect(result.titel).toBe("brandwerende doorvoeringen");
    expect(result.bron_bewijs.titel?.bron_zin).not.toBeNull();

    const misleidend = valideerBronBewijs(
      {
        ...velden,
        klant_naam: "Verzonnen Holding BV",
        contact_naam: "Piet Verzonnen",
        contact_email: "piet@verzonnen.nl",
        contact_telefoon: "0699999999",
        bv: "FPS Onderhoud",
        werknummer_verwijzing: "W-999",
        ontbrekende_stukken: ["bestek"],
        samenvatting: "Volledig verzonnen samenvatting",
      },
      brontekst,
    );
    expect(misleidend.klant_naam).toBeNull();
    expect(misleidend.bron_bewijs.organisatienaam?.bron_zin).toBeNull();
    expect(misleidend.contact_naam).toBeNull();
    expect(misleidend.contact_email).toBeNull();
    expect(misleidend.contact_telefoon).toBeNull();
    expect(misleidend.bv).toBeNull();
    expect(misleidend.werknummer_verwijzing).toBeNull();
    expect(misleidend.ontbrekende_stukken).toEqual([]);
    expect(misleidend.samenvatting).toBeNull();
  });

  it("valideerBronBewijs: ongeldig citaat nulled ZOWEL waarde ALS bewijs (fail-closed)", async () => {
    const velden = {
      titel: null,
      klant_naam: "Verzonnen Klant BV",   // AI-waarde met ongeldig citaat
      klant_adres: "Verzonnenlaan 1",
      klant_postcode: "9999 ZZ",
      klant_stad: "Nergens",
      contact_naam: "Jan Verzonnen",       // AI-waarde met ongeldig citaat
      contact_email: "jan@verzonnen.nl",   // AI-waarde met ongeldig citaat
      contact_telefoon: "0612345678",
      gebouw_naam: "Pand Noord",
      gebouw_adres: "Nepstraat 99",        // ongeldig citaat → weg
      gebouw_stad: "Utrecht",
      gebouw_postcode: "1234 AB",
      werkzaamheden: "Iets verzonnen",     // ongeldig citaat → weg
      bv: "FPS Bouw", werknummer_verwijzing: "W-123",
      ontbrekende_stukken: ["plattegrond"], samenvatting: "Verzonnen samenvatting", onzekere_velden: ["gebouw_naam"],
      bron_bewijs: {
        organisatienaam: { bron_zin: "staat niet in de brontekst A" },
        opdrachtgever_adres: { bron_zin: "staat niet in de brontekst N" },
        opdrachtgever_postcode: { bron_zin: "staat niet in de brontekst O" },
        opdrachtgever_stad: { bron_zin: "staat niet in de brontekst P" },
        contactpersoon: { bron_zin: "staat niet in de brontekst B" },
        email: { bron_zin: "staat niet in de brontekst C" },
        telefoon: { bron_zin: "staat niet in de brontekst D" },
        gebouwnaam: { bron_zin: "staat niet in de brontekst G" },
        adres: { bron_zin: "staat niet in de brontekst E" },
        stad: { bron_zin: "staat niet in de brontekst H" },
        postcode: { bron_zin: "staat niet in de brontekst I" },
        titel: null,
        werkzaamheden: { bron_zin: "staat niet in de brontekst F" },
        bv: { bron_zin: "staat niet in de brontekst J" },
        werknummer: { bron_zin: "staat niet in de brontekst K" },
        ontbrekende_stukken: { bron_zin: "staat niet in de brontekst L" },
        samenvatting: { bron_zin: "staat niet in de brontekst M" },
      },
    };
    const brontekst = "Geachte heer, wij hebben interesse in uw diensten. Met vriendelijke groet.";
    const result = valideerBronBewijs(velden, brontekst);
    // Waarde EN bewijs beide null voor gevraagde velden met ongeldig citaat
    expect(result.klant_naam).toBeNull();
    expect(result.klant_adres).toBeNull();
    expect(result.klant_postcode).toBeNull();
    expect(result.klant_stad).toBeNull();
    expect(result.bron_bewijs.organisatienaam?.bron_zin).toBeNull();
    expect(result.contact_naam).toBeNull();
    expect(result.bron_bewijs.contactpersoon?.bron_zin).toBeNull();
    expect(result.contact_email).toBeNull();
    expect(result.bron_bewijs.email?.bron_zin).toBeNull();
    expect(result.contact_telefoon).toBeNull();
    expect(result.bron_bewijs.telefoon?.bron_zin).toBeNull();
    expect(result.gebouw_adres).toBeNull();
    expect(result.bron_bewijs.adres?.bron_zin).toBeNull();
    expect(result.werkzaamheden).toBeNull();
    expect(result.bron_bewijs.werkzaamheden?.bron_zin).toBeNull();
    expect(result.gebouw_naam).toBeNull();
    expect(result.gebouw_stad).toBeNull();
    expect(result.gebouw_postcode).toBeNull();
    expect(result.bv).toBeNull();
    expect(result.werknummer_verwijzing).toBeNull();
    expect(result.ontbrekende_stukken).toEqual([]);
    expect(result.samenvatting).toBeNull();
    expect(result.onzekere_velden).toEqual([]);
  });

  it("analyseerAanvraagVoorStroom accepteert een letterlijk citaat uit een bijlage", async () => {
    const { aiGateway, heeftGateway } = await import("../lib/aiGateway");
    vi.mocked(heeftGateway).mockReturnValueOnce(true);
    vi.mocked(aiGateway.chat).mockResolvedValueOnce({
      ok: true,
      inhoud: JSON.stringify({
        is_aanvraag: true,
        titel: "Brandwerende doorvoeringen herstellen",
        werkzaamheden: "Brandwerende doorvoeringen herstellen",
        bron_bewijs: {
          titel: { bron_zin: "Brandwerende doorvoeringen herstellen" },
          werkzaamheden: { bron_zin: "Brandwerende doorvoeringen herstellen" },
        },
      }),
    });

    const result = await analyseerAanvraagVoorStroom({
      mailOnderwerp: "Prijsaanvraag",
      mailAfzender: "inkoop@example.test",
      mailTekst: "Zie de bijlage voor de inhoud van de aanvraag.",
      bijlageTeksten: [{
        naam: "werkomschrijving.txt",
        tekst: "Gevraagd werk: Brandwerende doorvoeringen herstellen in bouwdeel A.",
      }],
    });

    expect(result.ok).toBe(true);
    expect(result.velden?.titel).toBe("Brandwerende doorvoeringen herstellen");
    expect(result.velden?.werkzaamheden).toBe("Brandwerende doorvoeringen herstellen");
    expect(result.velden?.bron_bewijs.titel?.bron_zin).toBe("Brandwerende doorvoeringen herstellen");

    const userBericht = vi.mocked(aiGateway.chat).mock.calls.at(-1)?.[1].messages.at(-1)?.content;
    expect(userBericht).toContain('Bijlage "werkomschrijving.txt"');
    expect(userBericht).toContain("Brandwerende doorvoeringen herstellen");
  });
});

describe("gedeelde opdrachtgever-resolver", () => {
  function leesTx(klant: Record<string, unknown>) {
    return {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [klant],
          }),
        }),
      }),
    } as any;
  }

  it("weigert een bestaande CRM-opdrachtgever zonder volledige NAW", async () => {
    const { resolveerOpdrachtgever } = await import(
      "../services/opdrachtgever"
    );
    await expect(
      resolveerOpdrachtgever(
        leesTx({
          id: 42,
          naam: "Onvolledige Relatie BV",
          adres: null,
          postcode: null,
          stad: "Utrecht",
        }),
        { klantId: 42 },
      ),
    ).rejects.toMatchObject({
      status: 422,
    });
  });

  it("accepteert een bestaande CRM-opdrachtgever met volledige NAW", async () => {
    const { resolveerOpdrachtgever } = await import("../services/opdrachtgever");
    const klant = await resolveerOpdrachtgever(
      leesTx({
        id: 43,
        naam: "Volledige Relatie BV",
        adres: "Dorpsstraat 2",
        postcode: "1234 AB",
        stad: "Utrecht",
      }),
      { klantId: 43 },
    );
    expect(klant.id).toBe(43);
  });
});

// ─── H. Zod inputvalidatie via gegenereerd schema ─────────────────────────────

describe("AccepteerAanvraagVoorstelBody — Zod inputvalidatie", () => {
  it("exact de vier intakegroepen slagen zonder contact of werkmaatschappij", async () => {
    const r = AccepteerAanvraagVoorstelBody.safeParse({
      titel: "Test offerte",
      werkzaamheden: "Brandwerende doorvoeringen controleren",
      nieuwe_klant: {
        naam: "Test BV",
        adres: "Dorpsstraat 2",
        postcode: "1234 AB",
        stad: "Testdam",
      },
      nieuw_gebouw: {
        naam: "Pand Noord",
        adres: "Kerkstraat 1",
        postcode: "1234 AB",
        stad: "Testdam",
      },
    });
    expect(r.success).toBe(true);
  });

  it("contactgegevens blijven optioneel", async () => {
    const r = AccepteerAanvraagVoorstelBody.safeParse({
      titel: "Test",
      werkzaamheden: "Testwerk",
    });
    expect(r.success).toBe(true);
  });

  it("laat de werkmaatschappij niet via het acceptatieverzoek overschrijven", async () => {
    const r = AccepteerAanvraagVoorstelBody.safeParse({
      titel: "Test",
      werkzaamheden: "Testwerk",
      werkmaatschappij_id: 999,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).not.toHaveProperty("werkmaatschappij_id");
  });
});

// ─── B. Source-inspectie guards ────────────────────────────────────────────────

describe("POST /inbox/offerte-aanvraag — alleen voorstel+inbox_item vóór akkoord", () => {
  it("route bevat geen offertesTable.insert (geen offerte vóór akkoord)", async () => {
    const src = await import("fs").then(fs =>
      fs.promises.readFile("artifacts/api-server/src/routes/inbox.ts", "utf-8")
    );
    const offerteavanvraagBlock = src.split("POST /inbox/offerte-aanvraag")[1]?.split("router.post")[0] ?? "";
    expect(offerteavanvraagBlock).not.toContain("offertesTable");
    expect(offerteavanvraagBlock).not.toContain("gebouwenTable.insert");
  });

  it("route bevat aanvraagVoorstellenTable + SHA-256 idempotentie", async () => {
    const src = await import("fs").then(fs =>
      fs.promises.readFile("artifacts/api-server/src/routes/inbox.ts", "utf-8")
    );
    expect(src).toContain("aanvraagVoorstellenTable");
    expect(src).toContain("sha256");
    expect(src).toContain("upload:");
    expect(src).not.toContain(".update(String(werkmaatschappijId))");
    expect(src).toContain("aanvraagbron niet opgeslagen");
    // 401 check aanwezig
    expect(src).toContain("status(401)");
  });

  it("slaat alle ontvangen bijlagen op en voert leesbare tekst aan de AI-bronbundel toe", async () => {
    const [routeSrc, wizardSrc, clientSrc] = await Promise.all([
      import("fs").then(fs => fs.promises.readFile("artifacts/api-server/src/routes/inbox.ts", "utf-8")),
      import("fs").then(fs => fs.promises.readFile("artifacts/firevault/src/components/offerte-aanvraag-wizard.tsx", "utf-8")),
      import("fs").then(fs => fs.promises.readFile("lib/api-client-react/src/generated/api.ts", "utf-8")),
    ]);
    expect(routeSrc).toContain('files?.["bijlagen"]');
    expect(routeSrc).toContain("extraheerTekst(");
    expect(routeSrc).toContain("bijlageTeksten,");
    expect(routeSrc).toContain("bijlage opslaan mislukt — aanvraag niet vastgelegd");
    expect(wizardSrc).not.toContain("} as any");
    expect(clientSrc).toContain("inboxOfferteavanvraagInput.bijlagen.forEach");
    expect(clientSrc).toContain("formData.append(`bijlagen`, value)");
  });

  it("stuurt ook de compacte uploadbalk naar menselijke beoordeling in plaats van een offerte", async () => {
    const [slimUploadSrc, aanvragenPaginaSrc] = await Promise.all([
      import("fs").then(fs => fs.promises.readFile("artifacts/firevault/src/components/slim-upload-balk.tsx", "utf-8")),
      import("fs").then(fs => fs.promises.readFile("artifacts/firevault/src/pages/crm/aanvragen.tsx", "utf-8")),
    ]);
    expect(slimUploadSrc).toContain("useVerwerkInboxOfferteavanvraag");
    expect(slimUploadSrc).not.toContain('form.append("bestaand_gebouw_id"');
    expect(slimUploadSrc).not.toContain("resultaat.offerte_id");
    expect(slimUploadSrc).toContain("/crm/aanvragen?voorstel=");
    expect(aanvragenPaginaSrc).toContain('get("voorstel")');
    expect(aanvragenPaginaSrc).toContain("setAccepteerVoor(voorstel)");
  });
});

describe("POST /aanvragen/voorstellen/:id/accepteren — geen project/offerte/regels", () => {
  it("geen projectenTable.insert (lezen mag wel voor meerwerk-validatie)", async () => {
    const src = await import("fs").then(fs =>
      fs.promises.readFile("artifacts/api-server/src/routes/aanvragen.ts", "utf-8")
    );
    const accepterenBlock = src.split("id/accepteren")[1]?.split("id/afwijzen")[0] ?? "";
    // Insert op projectenTable is verboden; select/lezen voor meerwerk-validatie is toegestaan.
    expect(accepterenBlock).not.toContain("projectenTable).values");
    expect(accepterenBlock).not.toContain("insert(projectenTable");
  });

  it("geen offertesTable.insert", async () => {
    const src = await import("fs").then(fs =>
      fs.promises.readFile("artifacts/api-server/src/routes/aanvragen.ts", "utf-8")
    );
    const accepterenBlock = src.split("id/accepteren")[1]?.split("id/afwijzen")[0] ?? "";
    expect(accepterenBlock).not.toContain("offertesTable");
    expect(accepterenBlock).not.toContain("offerteRegelsTable");
  });

  it("bevat modCalcHeadersTable.values (leege calculatie aanmaken)", async () => {
    const src = await import("fs").then(fs =>
      fs.promises.readFile("artifacts/api-server/src/routes/aanvragen.ts", "utf-8")
    );
    expect(src).toContain("modCalcHeadersTable");
    expect(src).toContain("opnamesTable");
  });

  it("conditionele claim staat als EERSTE mutatie vóór opdrachtgever-resolutie", async () => {
    const src = await import("fs").then(fs =>
      fs.promises.readFile("artifacts/api-server/src/routes/aanvragen.ts", "utf-8")
    );
    const txBlock = src.split("db.transaction")[1] ?? "";
    const eersteUpdatePos = txBlock.indexOf("aanvraagVoorstellenTable");
    const eersteKlantInsertPos = txBlock.indexOf("resolveerOpdrachtgever");
    expect(eersteUpdatePos).toBeGreaterThanOrEqual(0);
    expect(eersteKlantInsertPos).toBeGreaterThanOrEqual(0);
    expect(eersteUpdatePos).toBeLessThan(eersteKlantInsertPos);
  });

  it("bevat magBijGebouw toegangscheck en 403-fout", async () => {
    const src = await import("fs").then(fs =>
      fs.promises.readFile("artifacts/api-server/src/routes/aanvragen.ts", "utf-8")
    );
    expect(src).toContain("magBijGebouw");
    // 403 wordt gegooid als StroomFout(403, ...) en door catch omgezet naar res.status(e.code)
    expect(src).toContain("StroomFout(403");
    expect(src).toContain("e.code");
  });

  it("serialiseert de opdrachtgeverpartij op gebouw en CRM-klant", async () => {
    const src = await import("fs").then(fs =>
      fs.promises.readFile("artifacts/api-server/src/routes/aanvragen.ts", "utf-8")
    );
    const partijBlock = src.split("Gebouwpartij type opdrachtgever upsert")[1]?.split("Lege opname")[0] ?? "";
    const lockPos = partijBlock.indexOf("pg_advisory_xact_lock(hashtextextended");
    const readPos = partijBlock.indexOf("gebouwPartijenTable.id");
    const insertPos = partijBlock.indexOf("insert(gebouwPartijenTable");
    expect(lockPos).toBeGreaterThanOrEqual(0);
    expect(readPos).toBeGreaterThan(lockPos);
    expect(insertPos).toBeGreaterThan(readPos);
  });
});

describe("GET /aanvragen/voorstellen/:id/bronbestand — voorstelgebonden autorisatie", () => {
  it("resolveert de bron via voorstel-id en biedt geen vrije inbox-item-downloadroute", async () => {
    const aanvragenSrc = await import("fs").then(fs =>
      fs.promises.readFile("artifacts/api-server/src/routes/aanvragen.ts", "utf-8")
    );
    const inboxSrc = await import("fs").then(fs =>
      fs.promises.readFile("artifacts/api-server/src/routes/inbox.ts", "utf-8")
    );
    expect(aanvragenSrc).toContain('/aanvragen/voorstellen/:id/bronbestand');
    expect(aanvragenSrc).toContain(".innerJoin(inboxItemsTable");
    expect(aanvragenSrc).toContain("aanvraagVoorstellenTable.inboxItemId");
    expect(inboxSrc).not.toContain('/inbox/items/:id/bestand');
  });
});

describe("POST /modules/calculaties/:id/maak-offerte — intern_akkoord vereist", () => {
  it("bevat intern_akkoord check vóór offerte-insert", async () => {
    const src = await import("fs").then(fs =>
      fs.promises.readFile("artifacts/api-server/src/routes/mod-calculatie.ts", "utf-8")
    );
    const maakOfferteSplit = src.split("maak-offerte")[1] ?? "";
    const intern409Pos = maakOfferteSplit.indexOf("intern_akkoord");
    const offerteInsertPos = maakOfferteSplit.indexOf("offertesTable");
    expect(intern409Pos).toBeGreaterThanOrEqual(0);
    expect(offerteInsertPos).toBeGreaterThanOrEqual(0);
    expect(intern409Pos).toBeLessThan(offerteInsertPos);
  });
});
