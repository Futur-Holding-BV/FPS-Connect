import { describe, expect, it } from "vitest";
import {
  HERVATBARE_ONBOARDING_STATUSSEN,
  isHervatbareOnboardingStatus,
} from "./hrmOnboardingStatus";

describe("isHervatbareOnboardingStatus", () => {
  it.each(HERVATBARE_ONBOARDING_STATUSSEN)(
    "staat annuleren toe voor onafgeronde status %s",
    (status) => {
      expect(isHervatbareOnboardingStatus(status)).toBe(true);
    },
  );

  it.each(["actief", "onboarding_afgerond", "uit_dienst", null, undefined])(
    "blokkeert annuleren voor niet-hervatbare status %s",
    (status) => {
      expect(isHervatbareOnboardingStatus(status)).toBe(false);
    },
  );
});