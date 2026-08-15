import { describe, it, expect } from "vitest";
import { dedupeerPartijEmails } from "../lib/rapport-helpers";

// ── Deduplicatie rapport-meldingen ────────────────────────────────────────────
//
// Als een gebouw meerdere partij-rijen heeft met hetzelfde e-mailadres mag de
// melding slechts één keer verstuurd worden. dedupeerPartijEmails filtert
// duplicaten vóór de verzendlus.
//
// Scenario's:
//   A. Lijst zonder duplicaten blijft ongewijzigd
//   B. Dubbel e-mailadres → tweede rij valt weg
//   C. Meerdere duplicaten van hetzelfde adres → slechts één rij over
//   D. Case-insensitief: "Test@Example.com" == "test@example.com"
//   E. Witruimte rondom adres wordt genegeerd bij vergelijking
//   F. Rijen zonder e-mailadres (null) worden altijd gefilterd
//   G. Eerste rij (naam) wordt bewaard bij een duplicaat

type Partij = { naam: string; email: string | null };

function p(email: string | null, naam = "Naam"): Partij {
  return { naam, email };
}

// ── Scenario A — geen duplicaten ──────────────────────────────────────────────

describe("dedupeerPartijEmails — geen duplicaten", () => {
  it("geeft alle rijen terug wanneer alle adressen uniek zijn", () => {
    const invoer = [p("a@x.nl"), p("b@x.nl"), p("c@x.nl")];
    expect(dedupeerPartijEmails(invoer)).toHaveLength(3);
  });

  it("geeft een lege array terug voor een lege invoer", () => {
    expect(dedupeerPartijEmails([])).toEqual([]);
  });
});

// ── Scenario B — één duplicaat ────────────────────────────────────────────────

describe("dedupeerPartijEmails — één duplicaat", () => {
  it("verwijdert de tweede rij met hetzelfde e-mailadres", () => {
    const invoer = [p("dup@x.nl"), p("dup@x.nl")];
    expect(dedupeerPartijEmails(invoer)).toHaveLength(1);
  });
});

// ── Scenario C — meerdere duplicaten van één adres ───────────────────────────

describe("dedupeerPartijEmails — meerdere duplicaten", () => {
  it("houdt slechts één rij over bij drie keer hetzelfde adres", () => {
    const invoer = [p("dup@x.nl"), p("dup@x.nl"), p("dup@x.nl")];
    expect(dedupeerPartijEmails(invoer)).toHaveLength(1);
  });

  it("behoudt unieke adressen naast de duplicaten", () => {
    const invoer = [p("a@x.nl"), p("a@x.nl"), p("b@x.nl")];
    const resultaat = dedupeerPartijEmails(invoer);
    expect(resultaat).toHaveLength(2);
    expect(resultaat.map((r) => r.email)).toEqual(["a@x.nl", "b@x.nl"]);
  });
});

// ── Scenario D — case-insensitief ────────────────────────────────────────────

describe("dedupeerPartijEmails — case-insensitief", () => {
  it('behandelt "Test@Example.com" en "test@example.com" als hetzelfde adres', () => {
    const invoer = [p("Test@Example.com"), p("test@example.com")];
    expect(dedupeerPartijEmails(invoer)).toHaveLength(1);
  });

  it("respecteert case bij vergelijking met geheel andere adressen", () => {
    const invoer = [p("a@x.nl"), p("B@x.nl")];
    expect(dedupeerPartijEmails(invoer)).toHaveLength(2);
  });
});

// ── Scenario E — witruimte wordt genegeerd ────────────────────────────────────

describe("dedupeerPartijEmails — witruimte", () => {
  it("beschouwt '  a@x.nl  ' en 'a@x.nl' als hetzelfde adres", () => {
    const invoer = [p("  a@x.nl  "), p("a@x.nl")];
    expect(dedupeerPartijEmails(invoer)).toHaveLength(1);
  });
});

// ── Scenario F — null-adressen ────────────────────────────────────────────────

describe("dedupeerPartijEmails — null-adressen", () => {
  it("filtert rijen zonder e-mailadres (null)", () => {
    const invoer = [p(null), p("a@x.nl"), p(null)];
    const resultaat = dedupeerPartijEmails(invoer);
    expect(resultaat).toHaveLength(1);
    expect(resultaat[0].email).toBe("a@x.nl");
  });

  it("geeft een lege array terug als alle rijen null-email hebben", () => {
    const invoer = [p(null), p(null)];
    expect(dedupeerPartijEmails(invoer)).toEqual([]);
  });
});

// ── Scenario G — eerste rij wordt bewaard ────────────────────────────────────

describe("dedupeerPartijEmails — eerste rij bewaard bij duplicaat", () => {
  it("bewaart de naam van de eerste partij, niet de tweede", () => {
    const invoer = [
      { naam: "Eerste persoon", email: "dup@x.nl" },
      { naam: "Tweede persoon", email: "dup@x.nl" },
    ];
    const resultaat = dedupeerPartijEmails(invoer);
    expect(resultaat).toHaveLength(1);
    expect(resultaat[0].naam).toBe("Eerste persoon");
  });
});
