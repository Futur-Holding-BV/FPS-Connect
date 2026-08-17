// SOCIAL_01 — kanaaleisen en kanaal-adapters.
//
// Eisen (deel A): per kanaal wat het toestaat — tekstlengte, media,
// videolengte, bestandstypen, daglimiet. De opsteller toont ze; het
// plannen-endpoint dwingt ze af (fail-closed: past het niet, dan is het
// bericht niet te plannen — geen mislukte poging achteraf).
//
// Adapters (deel C): elk kanaal een eigen module achter één interface, zodat
// een kanaal erbij kan of wegvalt zonder de rest te raken. Zolang de echte
// API-koppeling (fase 3) niet is gebouwd, melden de adapters fail-closed dat
// publiceren niet kan — dat levert een werkbak-taak op, nooit stilte.
import type { SocialKanaal, SocialKoppeling } from "@workspace/db";

export type KanaalEisen = {
  kanaal: SocialKanaal;
  naam: string;
  tekstMax: number;
  /** "verplicht" | "optioneel" | "verboden" per mediatype. */
  beeld: "verplicht" | "optioneel" | "verboden";
  video: "verplicht" | "optioneel" | "verboden";
  /** Media verplicht (één van beeld/video)? */
  mediaVerplicht: boolean;
  videoMaxSeconden: number | null;
  beeldBestandstypen: string[];
  videoBestandstypen: string[];
  beeldVerhouding: string | null;
  /** Max. berichten per dag per account (null = geen limiet die wij bewaken). */
  maxPerDag: number | null;
};

export const KANAAL_EISEN: Record<SocialKanaal, KanaalEisen> = {
  linkedin: {
    kanaal: "linkedin", naam: "LinkedIn",
    tekstMax: 3000,
    beeld: "optioneel", video: "optioneel", mediaVerplicht: false,
    videoMaxSeconden: 600,
    beeldBestandstypen: ["jpg", "jpeg", "png"],
    videoBestandstypen: ["mp4"],
    beeldVerhouding: "1,91:1 tot 1:1",
    maxPerDag: null,
  },
  facebook: {
    kanaal: "facebook", naam: "Facebook",
    tekstMax: 63206,
    beeld: "optioneel", video: "optioneel", mediaVerplicht: false,
    videoMaxSeconden: 14400,
    beeldBestandstypen: ["jpg", "jpeg", "png", "webp"],
    videoBestandstypen: ["mp4", "mov"],
    beeldVerhouding: "1,91:1 tot 4:5",
    maxPerDag: null,
  },
  instagram: {
    kanaal: "instagram", naam: "Instagram",
    tekstMax: 2200,
    beeld: "optioneel", video: "optioneel", mediaVerplicht: true,
    videoMaxSeconden: 900,
    beeldBestandstypen: ["jpg", "jpeg", "png"],
    videoBestandstypen: ["mp4", "mov"],
    beeldVerhouding: "4:5 tot 1,91:1",
    // Instagram staat 25 berichten per dag per account toe (SOCIAL_01 deel C).
    maxPerDag: 25,
  },
  tiktok: {
    kanaal: "tiktok", naam: "TikTok",
    tekstMax: 2200,
    // TikTok neemt alleen video: geen fotoreeksen en geen losse tekst.
    beeld: "verboden", video: "verplicht", mediaVerplicht: true,
    videoMaxSeconden: 600,
    beeldBestandstypen: [],
    videoBestandstypen: ["mp4", "mov", "webm"],
    beeldVerhouding: null,
    maxPerDag: null,
  },
};

export type BerichtVoorValidatie = {
  kanaal: SocialKanaal;
  tekst: string;
  mediaPad: string | null;
  mediaType: "beeld" | "video" | null;
};

function extensie(pad: string): string {
  const m = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(pad);
  return m ? m[1].toLowerCase() : "";
}

/** Alle redenen waarom dit bericht niet aan de kanaaleisen voldoet (leeg = ok). */
export function valideerTegenKanaal(b: BerichtVoorValidatie): string[] {
  const eisen = KANAAL_EISEN[b.kanaal];
  const fouten: string[] = [];
  const tekst = b.tekst.trim();
  if (tekst.length > eisen.tekstMax) {
    fouten.push(`${eisen.naam}: tekst is ${tekst.length} tekens, maximum is ${eisen.tekstMax}`);
  }
  if (eisen.mediaVerplicht && !b.mediaPad) {
    fouten.push(`${eisen.naam}: een ${eisen.video === "verplicht" ? "video" : "beeld of video"} is verplicht`);
  }
  if (!b.mediaPad && !tekst && !eisen.mediaVerplicht) {
    fouten.push(`${eisen.naam}: bericht is leeg (geen tekst en geen media)`);
  }
  if (b.mediaPad && b.mediaType === "beeld") {
    if (eisen.beeld === "verboden") fouten.push(`${eisen.naam}: neemt geen losse beelden aan`);
    else if (!eisen.beeldBestandstypen.includes(extensie(b.mediaPad))) {
      fouten.push(`${eisen.naam}: beeldbestandstype .${extensie(b.mediaPad) || "?"} niet toegestaan (wel: ${eisen.beeldBestandstypen.join(", ")})`);
    }
  }
  if (b.mediaPad && b.mediaType === "video") {
    if (eisen.video === "verboden") fouten.push(`${eisen.naam}: neemt geen video aan`);
    else if (!eisen.videoBestandstypen.includes(extensie(b.mediaPad))) {
      fouten.push(`${eisen.naam}: videobestandstype .${extensie(b.mediaPad) || "?"} niet toegestaan (wel: ${eisen.videoBestandstypen.join(", ")})`);
    }
  }
  if (b.mediaPad && !b.mediaType) {
    fouten.push(`${eisen.naam}: mediatype (beeld of video) ontbreekt bij het bestand`);
  }
  return fouten;
}

// ── Adapters ─────────────────────────────────────────────────────────────────

export type PublicatieUitkomst =
  | { ok: true; externId: string }
  | { ok: false; tijdelijk: boolean; reden: string };

export interface KanaalAdapter {
  kanaal: SocialKanaal;
  /** Rechtstreeks publiceren op het geplande moment (modus 'publiceren'). */
  publiceer(koppeling: SocialKoppeling, invoer: { tekst: string; mediaPad: string | null; mediaType: string | null }): Promise<PublicatieUitkomst>;
  /** Klaarzetten als concept op het account (modus 'klaarzetten'). */
  zetConceptKlaar(koppeling: SocialKoppeling, invoer: { tekst: string; mediaPad: string | null; mediaType: string | null }): Promise<PublicatieUitkomst>;
}

// Fase 3 vervangt deze basis door echte API-koppelingen per kanaal. Tot die
// tijd: fail-closed — geen echte plaatsing beweren, wel expliciet melden
// waarom niet (→ planner maakt een werkbak-taak; nooit stilzwijgend).
function nogNietGekoppeld(kanaal: SocialKanaal): KanaalAdapter {
  const reden = `${KANAAL_EISEN[kanaal].naam}-koppeling heeft nog geen API-toegang in Connect (fase 3); handmatig plaatsen`;
  return {
    kanaal,
    async publiceer() { return { ok: false, tijdelijk: false, reden }; },
    async zetConceptKlaar() { return { ok: false, tijdelijk: false, reden }; },
  };
}

const ADAPTERS: Record<SocialKanaal, KanaalAdapter> = {
  linkedin: nogNietGekoppeld("linkedin"),
  facebook: nogNietGekoppeld("facebook"),
  instagram: nogNietGekoppeld("instagram"),
  tiktok: nogNietGekoppeld("tiktok"),
};

export function kanaalAdapter(kanaal: SocialKanaal): KanaalAdapter {
  return ADAPTERS[kanaal];
}
