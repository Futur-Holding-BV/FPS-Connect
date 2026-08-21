import { describe, expect, it } from "vitest";
import { isToegestaneOnboardingAfhankelijkheid } from "./onboardingAnnulering";

describe("onboarding annulering afhankelijkheden", () => {
  it.each([
    "hrm_ai_voorstellen",
    "medewerker_documenten",
  ])("staat conceptgebonden medewerkerdata toe: %s", (tabel) => {
    expect(
      isToegestaneOnboardingAfhankelijkheid("medewerkers", tabel),
    ).toBe(true);
  });

  it.each([
    "arbeidsovereenkomsten",
    "bekwaamheden",
    "hrm_middelen",
    "hrm_onboarding_taken",
    "medewerker_aanstellingen",
    "medewerker_cao_keuzes",
    "medewerker_opleidingen",
    "pbm_items",
    "planning_afwezigheid",
    "uren_registraties",
    "verlof_saldi",
    "week_staten",
  ])("blokkeert operationele medewerkerdata: %s", (tabel) => {
    expect(
      isToegestaneOnboardingAfhankelijkheid("medewerkers", tabel),
    ).toBe(false);
  });

  it.each([
    "medewerkers",
    "wachtwoord_reset_tokens",
  ])("staat alleen accountgebonden onboardingdata toe: %s", (tabel) => {
    expect(
      isToegestaneOnboardingAfhankelijkheid("gebruikers", tabel),
    ).toBe(true);
  });

  it.each([
    "gebouw_notities",
    "gebouw_toewijzingen",
    "gebruiker_profielen",
    "gebruiker_voorkeuren",
    "object_rechten",
    "push_tokens",
    "werk_inbox_mails",
    "werkbak_items",
  ])("blokkeert operationele gebruikersdata: %s", (tabel) => {
    expect(
      isToegestaneOnboardingAfhankelijkheid("gebruikers", tabel),
    ).toBe(false);
  });
});