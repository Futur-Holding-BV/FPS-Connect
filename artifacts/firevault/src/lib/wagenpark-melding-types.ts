// Gedeelde types en labels voor voertuigmeldingen (storing/schade/kwartaalcontrole/
// onderhoud/overige) — gebruikt door zowel het per-voertuig tabblad als het centrale
// meldingenoverzicht in wagenparkbeheer.

export type MeldingType = "storing" | "schade" | "kwartaalcontrole" | "onderhoud" | "overige";

export type MeldingStatus =
  | "nieuw"
  | "in_beoordeling"
  | "actie_nodig"
  | "ingepland"
  | "doorgezet_garage"
  | "opgelost"
  | "afgewezen_duplicaat";

export interface VoertuigMelding {
  id: number;
  voertuig_id: number;
  gemeld_door_id: number | null;
  type: MeldingType;
  omschrijving: string;
  foto_paden: string[];
  schade_locatie: string | null;
  storing_type: string | null;
  ai_diagnose: string | null;
  ai_oplossing: string | null;
  ai_kosten_indicatie: boolean;
  ai_kosten_tekst: string | null;
  ai_fotokwaliteit_ok: boolean | null;
  ai_gelezen_km_stand: number | null;
  ai_gelezen_waarschuwingen: string[] | null;
  ai_ernst_indicatie: "licht" | "matig" | "ernstig" | null;
  ai_mogelijk_duplicaat_van_id: number | null;
  status: MeldingStatus;
  toegewezen_beheerder_id: number | null;
  toegewezen_beheerder_naam?: string | null;
  onderhoud_id: number | null;
  opvolg_notitie: string | null;
  admin_notitie: string | null;
  monteur_naam: string | null;
  voertuig_kenteken?: string | null;
  voertuig_merk?: string | null;
  voertuig_type_naam?: string | null;
  aangemaakt_op: string | null;
  bijgewerkt_op: string | null;
}

export const MELDING_TYPE_LABELS: Record<MeldingType, string> = {
  storing: "Storing",
  schade: "Schade",
  kwartaalcontrole: "Kwartaalcontrole",
  onderhoud: "Onderhoud",
  overige: "Overige",
};

export const MELDING_STATUS_LABELS: Record<MeldingStatus, string> = {
  nieuw: "Nieuw",
  in_beoordeling: "In beoordeling",
  actie_nodig: "Actie nodig",
  ingepland: "Ingepland",
  doorgezet_garage: "Doorgezet naar garage",
  opgelost: "Opgelost",
  afgewezen_duplicaat: "Afgewezen / duplicaat",
};

export const MELDING_STATUS_KLEUR: Record<MeldingStatus, string> = {
  nieuw: "bg-red-100 text-red-800",
  in_beoordeling: "bg-blue-100 text-blue-800",
  actie_nodig: "bg-orange-100 text-orange-800",
  ingepland: "bg-purple-100 text-purple-800",
  doorgezet_garage: "bg-teal-100 text-teal-800",
  opgelost: "bg-green-100 text-green-800",
  afgewezen_duplicaat: "bg-gray-100 text-gray-600",
};

export const MELDING_ERNST_LABELS: Record<string, string> = {
  licht: "Licht",
  matig: "Matig",
  ernstig: "Ernstig",
};

export const MELDING_ERNST_KLEUR: Record<string, string> = {
  licht: "bg-yellow-100 text-yellow-800",
  matig: "bg-orange-100 text-orange-800",
  ernstig: "bg-red-100 text-red-800",
};
