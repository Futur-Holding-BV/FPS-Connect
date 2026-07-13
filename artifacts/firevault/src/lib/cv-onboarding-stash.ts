import type { CvAnalyseResultaat } from "@workspace/api-client-react";

// Eenmalige overdracht van een AI-CV-voorstel naar het onboardingformulier.
// Het voorstel wordt bij het lezen direct gewist (sessionStorage), zodat een
// verouderd voorstel nooit per ongeluk bij een volgende onboarding opduikt.
// De AI stelt alleen voor; de mens controleert en bevestigt in het formulier.

const STASH_KEY = "fps_cv_onboarding_voorstel";

export interface CvOnboardingStash {
  v: 1;
  bestandsnaam: string;
  bron: "inbox" | "slim-upload";
  inbox_item_id?: number;
  voorstel: CvAnalyseResultaat;
}

export function slaCvOnboardingOp(stash: Omit<CvOnboardingStash, "v">): void {
  try {
    sessionStorage.setItem(STASH_KEY, JSON.stringify({ v: 1, ...stash }));
  } catch {
    // sessionStorage vol of niet beschikbaar — formulier opent dan leeg
  }
}

export function leesEnWisCvOnboarding(): CvOnboardingStash | null {
  try {
    const raw = sessionStorage.getItem(STASH_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STASH_KEY);
    const data = JSON.parse(raw) as CvOnboardingStash;
    if (data?.v !== 1 || typeof data.bestandsnaam !== "string" || !data.voorstel) return null;
    if (data.bron !== "inbox" && data.bron !== "slim-upload") return null;
    return data;
  } catch {
    return null;
  }
}
