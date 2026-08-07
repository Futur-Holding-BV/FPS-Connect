import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useSearch } from "wouter";
import {
  useCreateMedewerker,
  useUpdateMedewerker,
  usePatchWizardVoortgang,
  useAiOnboardingVoorstel,
  useListFuncties,
  useListVerlofsoorten,
  useListCaoOpties,
  useListProfielen,
  useListMedewerkers,
  getListMedewerkersQueryKey,
  getGetHrmStatsQueryKey,
  useListAiVoorstellen,
  usePatchAiVoorstel,
  getListAiVoorstellenQueryKey,
  useGetWizardStatus,
  getGetWizardStatusQueryKey,
  useGetOnboardingContext,
  getGetOnboardingContextQueryKey,
  useDuplicateCheckMedewerker,
} from "@workspace/api-client-react";
import type { MedewerkerInput, CvAnalyseResultaat, WizardStatus, OnboardingContext } from "@workspace/api-client-react";
import { leesEnWisCvOnboarding, type CvOnboardingStash } from "@/lib/cv-onboarding-stash";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { UitzendbureauSelect } from "@/components/uitzendbureau-select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  UserCheck, Handshake, Building2, ArrowLeft, ArrowRight,
  CheckCircle2, ExternalLink, RotateCcw, Sparkles, X, AlertTriangle, Receipt, ShieldCheck, Loader2,
  GraduationCap, Clock3, CreditCard, ArrowLeftRight, Crown, Upload, Check,
} from "lucide-react";
import { WERKMAATSCHAPPIJEN, caoVoorWerkmaatschappij } from "@/lib/werkmaatschappijen";
import { MODULES, NIVEAUS } from "@workspace/permissies";

const WERKMAATSCHAPPIJ_STD = WERKMAATSCHAPPIJEN[0];

function niveauKort(n: number): string {
  return NIVEAUS.find((x) => x.waarde === n)?.kort ?? "";
}

// ─── Typen ────────────────────────────────────────────────────────────────────

type Stroom = "vast" | "zzp" | "uitzend" | "stagiair" | "oproep" | "payroll" | "detachering" | "directie";
type GenerieveStroom = "stagiair" | "oproep" | "payroll" | "detachering" | "directie";

interface StRoomsKaart {
  id: Stroom;
  titel: string;
  subtitel: string;
  icoon: React.ReactNode;
  kenmerken: string[];
  accent: string;
}

const STROMEN: StRoomsKaart[] = [
  {
    id: "vast",
    titel: "Vaste / tijdelijke medewerker",
    subtitel: "In loondienst via FPS",
    icoon: <UserCheck className="h-7 w-7" />,
    kenmerken: ["Vaste of tijdelijke aanstelling", "CAO van toepassing", "Verlofopbouw via FPS", "Buitendienst of kantoor"],
    accent: "border-blue-200 hover:border-blue-400 hover:bg-blue-50/40",
  },
  {
    id: "zzp",
    titel: "ZZP-er",
    subtitel: "Zelfstandige zonder personeel",
    icoon: <Handshake className="h-7 w-7" />,
    kenmerken: ["Overeenkomst van opdracht (Wet DBA)", "Eigen KvK en BTW-nummer", "Factureert per uur of vaste prijs", "Geen dienstbetrekking"],
    accent: "border-orange-200 hover:border-orange-400 hover:bg-orange-50/40",
  },
  {
    id: "uitzend",
    titel: "Uitzendkracht / Inhuur",
    subtitel: "Via bureau of onderaannemer",
    icoon: <Building2 className="h-7 w-7" />,
    kenmerken: ["Ingehuurd via uitzendbureau of onderaannemer", "Contract loopt via het bureau", "Tijdelijke inzet op projecten", "Einddatum doorgaans verplicht"],
    accent: "border-purple-200 hover:border-purple-400 hover:bg-purple-50/40",
  },
  {
    id: "stagiair",
    titel: "Stagiair / BBL-leerling",
    subtitel: "Stage of beroepsopleiding",
    icoon: <GraduationCap className="h-7 w-7" />,
    kenmerken: ["Stageovereenkomst verplicht", "Begeleider toewijzen", "Geen cao-loon (evt. stagevergoeding)", "Duur: enkele weken tot 4 jaar"],
    accent: "border-green-200 hover:border-green-400 hover:bg-green-50/40",
  },
  {
    id: "oproep",
    titel: "Oproepkracht / 0-uren",
    subtitel: "Flexibele inzet op afroep",
    icoon: <Clock3 className="h-7 w-7" />,
    kenmerken: ["Geen vaste werkuren", "Oproeptermijn conform wet", "Max. 3 jaar oproepcontract (Wet Toelating)", "CAO van toepassing"],
    accent: "border-yellow-200 hover:border-yellow-400 hover:bg-yellow-50/40",
  },
  {
    id: "payroll",
    titel: "Payrolling",
    subtitel: "Loondienst via payrollbedrijf",
    icoon: <CreditCard className="h-7 w-7" />,
    kenmerken: ["Contract via payrollbedrijf", "FPS is inlener", "Gelijke arbeidsvoorwaarden (inlenersbeloning)", "Arbeidsongeschiktheid bij payrollbedrijf"],
    accent: "border-cyan-200 hover:border-cyan-400 hover:bg-cyan-50/40",
  },
  {
    id: "detachering",
    titel: "Gedetacheerde",
    subtitel: "Ingeleend van ander bedrijf",
    icoon: <ArrowLeftRight className="h-7 w-7" />,
    kenmerken: ["Werknemer van andere organisatie", "Detacheringsovereenkomst verplicht", "Aansprakelijkheid bij detacheerder", "Eigen arbeidsvoorwaarden"],
    accent: "border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50/40",
  },
  {
    id: "directie",
    titel: "Directeur / bestuurder",
    subtitel: "Bijzondere arbeidsrelatie (DGA, bestuurder)",
    icoon: <Crown className="h-7 w-7" />,
    kenmerken: ["DGA of statutair bestuurder", "Managementovereenkomst mogelijk", "Afwijkend regime WW / WIA", "Geen arbeidsovereenkomst bij DGA"],
    accent: "border-rose-200 hover:border-rose-400 hover:bg-rose-50/40",
  },
];

// ─── Forms ────────────────────────────────────────────────────────────────────

interface VastForm {
  naam: string;
  email: string;
  geboortedatum: string;
  functie_id: number | null;
  werkmaatschappij: string;
  cao: string;
  dienstverband: string;
  contracturen_per_week: string;
  in_dienst_sinds: string;
  verlofsoort_ids: number[];
}

interface ZzpForm {
  naam: string;
  bedrijfsnaam: string;
  kvk: string;
  btw: string;
  functie_id: number | null;
  werkmaatschappij: string;
  uurtarief: string;
  start_datum: string;
  eind_datum: string;
}

interface UitzendForm {
  naam: string;
  bureau_of_bedrijf: string;
  functie_id: number | null;
  werkmaatschappij: string;
  start_datum: string;
  eind_datum: string;
  opmerkingen: string;
}

const LEEG_VAST: VastForm = {
  naam: "",
  email: "",
  geboortedatum: "",
  functie_id: null,
  werkmaatschappij: WERKMAATSCHAPPIJ_STD,
  cao: caoVoorWerkmaatschappij(WERKMAATSCHAPPIJ_STD) ?? "",
  dienstverband: "vast",
  contracturen_per_week: "38",
  in_dienst_sinds: new Date().toISOString().slice(0, 10),
  verlofsoort_ids: [],
};

const LEEG_ZZP: ZzpForm = {
  naam: "",
  bedrijfsnaam: "",
  kvk: "",
  btw: "",
  functie_id: null,
  werkmaatschappij: WERKMAATSCHAPPIJ_STD,
  uurtarief: "",
  start_datum: new Date().toISOString().slice(0, 10),
  eind_datum: "",
};

const LEEG_UITZEND: UitzendForm = {
  naam: "",
  bureau_of_bedrijf: "",
  functie_id: null,
  werkmaatschappij: WERKMAATSCHAPPIJ_STD,
  start_datum: new Date().toISOString().slice(0, 10),
  eind_datum: "",
  opmerkingen: "",
};

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

function FunctieSelect({
  functieId,
  functies,
  onChange,
}: {
  functieId: number | null;
  functies: { id: number; naam: string; uitvoerend?: boolean }[];
  onChange: (id: number) => void;
}) {
  if (functies.length === 0) {
    return (
      <p className="text-xs text-muted-foreground border rounded-md px-3 py-2">
        Nog geen functies. Voeg eerst een functie toe via Personeel &rsaquo; Functiehuis.
      </p>
    );
  }
  return (
    <Select value={functieId ? String(functieId) : undefined} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger><SelectValue placeholder="Kies functie" /></SelectTrigger>
      <SelectContent>
        {functies.some((f) => f.uitvoerend) && (
          <SelectGroup>
            <SelectLabel className="text-xs font-semibold text-primary">Buitendienst</SelectLabel>
            {functies.filter((f) => f.uitvoerend).map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>
            ))}
          </SelectGroup>
        )}
        {functies.some((f) => !f.uitvoerend) && (
          <SelectGroup>
            <SelectLabel className="text-xs font-semibold text-muted-foreground">Kantoor / staf</SelectLabel>
            {functies.filter((f) => !f.uitvoerend).map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
}

// ─── Stap 1: Type kiezen ──────────────────────────────────────────────────────

function TypeKiezer({ onKies }: { onKies: (s: Stroom) => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Onboarden</h1>
        <p className="text-muted-foreground mt-1">
          Kies het type indiensttreding. Elk type heeft een eigen intake met de juiste velden en vervolgstappen.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {STROMEN.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onKies(s.id)}
            className={`text-left rounded-xl border-2 p-5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${s.accent}`}
          >
            <div className="text-muted-foreground mb-3">{s.icoon}</div>
            <div className="font-semibold text-base leading-tight">{s.titel}</div>
            <div className="text-xs text-muted-foreground mt-0.5 mb-3">{s.subtitel}</div>
            <ul className="space-y-1">
              {s.kenmerken.map((k) => (
                <li key={k} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                  {k}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center gap-1 text-xs font-medium">
              Starten <ArrowRight className="h-3.5 w-3.5" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Hulpfunctie: leeftijd berekenen ──────────────────────────────────────────

function berekenLeeftijd(geboortedatum: string): number | null {
  if (!geboortedatum) return null;
  const gd = new Date(geboortedatum);
  if (isNaN(gd.getTime())) return null;
  const vandaag = new Date();
  let leeftijd = vandaag.getFullYear() - gd.getFullYear();
  const maand = vandaag.getMonth() - gd.getMonth();
  if (maand < 0 || (maand === 0 && vandaag.getDate() < gd.getDate())) leeftijd--;
  return leeftijd >= 0 ? leeftijd : null;
}

// ─── CV-voorstel hulpfuncties ─────────────────────────────────────────────────

function geldigeDatum(s: string | null | undefined): string {
  if (!s) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : s;
}

interface CvExtraVelden {
  telefoon?: string;
  mobiel?: string;
  adres?: string;
  postcode?: string;
  woonplaats?: string;
  rijbewijs?: string;
  vca_vervaldatum?: string;
  bhv_vervaldatum?: string;
  ehbo_vervaldatum?: string;
  cv_tekst?: string;
}

function bouwCvExtra(voorstel: CvAnalyseResultaat | null | undefined): CvExtraVelden {
  if (!voorstel) return {};
  const extra: CvExtraVelden = {};
  if (voorstel.telefoon) extra.telefoon = voorstel.telefoon;
  if (voorstel.mobiel) extra.mobiel = voorstel.mobiel;
  if (voorstel.adres) extra.adres = voorstel.adres;
  if (voorstel.postcode) extra.postcode = voorstel.postcode;
  if (voorstel.woonplaats) extra.woonplaats = voorstel.woonplaats;
  if (voorstel.rijbewijs) extra.rijbewijs = voorstel.rijbewijs;
  const vca = geldigeDatum(voorstel.vca_vervaldatum);
  const bhv = geldigeDatum(voorstel.bhv_vervaldatum);
  const ehbo = geldigeDatum(voorstel.ehbo_vervaldatum);
  if (vca) extra.vca_vervaldatum = vca;
  if (bhv) extra.bhv_vervaldatum = bhv;
  if (ehbo) extra.ehbo_vervaldatum = ehbo;
  if (voorstel.werkervaring_samenvatting) extra.cv_tekst = voorstel.werkervaring_samenvatting;
  return extra;
}

const CV_EXTRA_LABELS: Record<keyof CvExtraVelden, string> = {
  telefoon: "Telefoon",
  mobiel: "Mobiel",
  adres: "Adres",
  postcode: "Postcode",
  woonplaats: "Woonplaats",
  rijbewijs: "Rijbewijs",
  vca_vervaldatum: "VCA geldig tot",
  bhv_vervaldatum: "BHV geldig tot",
  ehbo_vervaldatum: "EHBO geldig tot",
  cv_tekst: "Werkervaring",
};

function CvVoorstelBanner({
  bestandsnaam,
  voorstel,
  extra,
  duplicaatNaam,
  onWissen,
}: {
  bestandsnaam: string;
  voorstel: CvAnalyseResultaat;
  extra: CvExtraVelden;
  duplicaatNaam: string | null;
  onWissen: () => void;
}) {
  const basis: Array<[string, string]> = [];
  if (voorstel.naam) basis.push(["Naam", voorstel.naam]);
  if (voorstel.email) basis.push(["E-mail", voorstel.email]);
  const geb = geldigeDatum(voorstel.geboortedatum);
  if (geb) basis.push(["Geboortedatum", geb]);
  const extraRegels = (Object.keys(extra) as Array<keyof CvExtraVelden>)
    .filter((k) => extra[k])
    .map((k): [string, string] => [CV_EXTRA_LABELS[k], String(extra[k])]);

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Vooraf ingevuld vanuit CV</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {bestandsnaam} — controleer alle gegevens voordat u opslaat. Dit is een AI-voorstel;
              er is nog niets aangemaakt.
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-amber-800 hover:bg-amber-100 shrink-0"
          onClick={onWissen}
        >
          <X className="h-3.5 w-3.5" /> Alles wissen
        </Button>
      </div>
      {(basis.length > 0 || extraRegels.length > 0) && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {[...basis, ...extraRegels].map(([label, waarde]) => (
            <div key={label} className={label === "Werkervaring" ? "col-span-2" : ""}>
              <span className="text-[10px] font-medium text-amber-700 uppercase tracking-wide">{label}</span>
              <p className="text-xs text-amber-900 leading-snug">{waarde}</p>
            </div>
          ))}
        </div>
      )}
      {duplicaatNaam && (
        <div className="flex items-start gap-2 rounded border border-red-300 bg-red-50 px-2.5 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">
            Let op: er bestaat al een medewerker met deze naam of dit e-mailadres
            ({duplicaatNaam}). Controleer of dit geen dubbele registratie is.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Wizard stappen definitie ─────────────────────────────────────────────────

const WIZARD_STAPPEN = [
  "AI-voorbereiding",
  "Persoonsgegevens",
  "Contactgegevens",
  "Functie",
  "Werkmaatschappij",
  "CAO / contract",
  "Uren",
  "Startdatum",
  "VCA / BHV / EHBO",
  "Rijbewijs",
  "Verlofsoorten",
  "Middelen",
  "Bevestiging",
] as const;

const STANDAARD_MIDDELEN: Array<{ id: string; naam: string; categorie: string }> = [
  { id: "laptop", naam: "Laptop / tablet", categorie: "apparatuur" },
  { id: "telefoon", naam: "Mobiele telefoon", categorie: "apparatuur" },
  { id: "auto", naam: "Bedrijfsauto / reiskosten", categorie: "vervoer" },
  { id: "pas", naam: "Toegangspas / sleutel", categorie: "beveiliging" },
  { id: "schoenen", naam: "Veiligheidsschoenen (S3)", categorie: "kleding" },
  { id: "kleding", naam: "Werkkleding / overalls", categorie: "kleding" },
  { id: "gereedschap", naam: "Gereedschapskoffer", categorie: "gereedschap" },
  { id: "badge", naam: "FPS-pasje / ID-badge", categorie: "beveiliging" },
];

const STANDAARD_ONBOARDING_TAKEN: Array<{
  id: string;
  taak: string;
  categorie: string;
  deadlineDagen: number;
}> = [
  { id: "werkplek", taak: "Werkplek inrichten", categorie: "Facilitair", deadlineDagen: -1 },
  { id: "it_account", taak: "IT-account aanmaken (e-mail, intranet)", categorie: "IT", deadlineDagen: -1 },
  { id: "toegangspas", taak: "Toegangspas uitreiken", categorie: "Beveiliging", deadlineDagen: 0 },
  { id: "fps_connect", taak: "FPS Connect-toegang controleren", categorie: "IT", deadlineDagen: 1 },
  { id: "introductie", taak: "Introductiegesprek plannen", categorie: "HR", deadlineDagen: 1 },
  { id: "vca_check", taak: "Certificaten controleren (VCA/BHV/EHBO)", categorie: "Veiligheid", deadlineDagen: 7 },
  { id: "cao_info", taak: "CAO-informatie aanreiken", categorie: "HR", deadlineDagen: 0 },
  { id: "evaluatie_3m", taak: "3-maands evaluatiegesprek inplannen", categorie: "HR", deadlineDagen: 90 },
];

function WizardStapIndicator({ huidigStap, stappen }: { huidigStap: number; stappen: readonly string[] }) {
  const totaal = stappen.length;
  return (
    <div className="space-y-2">
      {/* Genummerde stappen */}
      <div className="flex items-center">
        {stappen.map((naam, i) => {
          const nr = i + 1;
          const voltooid = nr < huidigStap;
          const huidig = nr === huidigStap;
          const isLaatste = i === totaal - 1;
          return (
            <div
              key={nr}
              className={`flex items-center${isLaatste ? "" : " flex-1"}`}
              title={naam}
            >
              <div
                className={`h-5 w-5 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 transition-colors${
                  voltooid
                    ? " bg-primary text-primary-foreground"
                    : huidig
                    ? " bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-1"
                    : " bg-muted text-muted-foreground"
                }`}
              >
                {voltooid ? <Check className="h-2.5 w-2.5" /> : nr}
              </div>
              {!isLaatste && (
                <div
                  className={`flex-1 h-px mx-0.5 min-w-[3px] transition-colors${
                    nr < huidigStap ? " bg-primary" : " bg-border"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      {/* Huidige stap naam + teller */}
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-foreground">{stappen[huidigStap - 1]}</span>
        <span className="text-muted-foreground">Stap {huidigStap} van {totaal}</span>
      </div>
    </div>
  );
}

// ─── Generieke wizard (stagiair / oproep / payroll / detachering / directie) ──

interface GeneriekeStapConfig {
  extra1Label: string;
  extra1Placeholder: string;
  extra2Label: string | null;
  extra2Placeholder: string | null;
  certificatenToepasselijk: boolean;
  dienstverband: string;
  titel: string;
  subtitel: string;
}

const GENERIEKE_CONFIGS: Record<GenerieveStroom, GeneriekeStapConfig> = {
  stagiair: {
    extra1Label: "Stageverlenende instelling",
    extra1Placeholder: "bijv. ROC Mondriaan, TU Delft",
    extra2Label: "Praktijkbegeleider",
    extra2Placeholder: "Naam begeleider bij de instelling",
    certificatenToepasselijk: true,
    dienstverband: "stage",
    titel: "Stagiair / BBL-leerling",
    subtitel: "Stage of beroepsopleiding — stageovereenkomst verplicht",
  },
  oproep: {
    extra1Label: "Contractvorm",
    extra1Placeholder: "bijv. 0-uren contract, min-max 8–32 uur",
    extra2Label: null,
    extra2Placeholder: null,
    certificatenToepasselijk: false,
    dienstverband: "oproep",
    titel: "Oproepkracht / 0-uren",
    subtitel: "Flexibele inzet op afroep — CAO van toepassing",
  },
  payroll: {
    extra1Label: "Payrollbedrijf",
    extra1Placeholder: "bijv. Tentoo, HR Group, Loon Snel",
    extra2Label: "Contactpersoon payrollbedrijf",
    extra2Placeholder: "Naam + telefoonnummer contactpersoon",
    certificatenToepasselijk: true,
    dienstverband: "payroll",
    titel: "Payrolling",
    subtitel: "Loondienst via payrollbedrijf — inlenersbeloning van toepassing",
  },
  detachering: {
    extra1Label: "Detacheringsbedrijf",
    extra1Placeholder: "bijv. YACHT, Brunel, Sweco",
    extra2Label: "Contactpersoon detacheerder",
    extra2Placeholder: "Naam + telefoonnummer",
    certificatenToepasselijk: true,
    dienstverband: "detachering",
    titel: "Gedetacheerde",
    subtitel: "Ingeleend van ander bedrijf — detacheringsovereenkomst verplicht",
  },
  directie: {
    extra1Label: "Arbeidsrelatie",
    extra1Placeholder: "bijv. DGA, statutair bestuurder, management BV",
    extra2Label: null,
    extra2Placeholder: null,
    certificatenToepasselijk: false,
    dienstverband: "directie",
    titel: "Directeur / bestuurder",
    subtitel: "Bijzondere arbeidsrelatie — afwijkend regime WW / WIA",
  },
};

const GENERIEKE_STAPPEN = [
  "Persoonsgegevens",
  "Contactgegevens",
  "Functie & organisatie",
  "Periode & details",
  "Certificaten",
  "Bevestiging",
] as const;

interface GeneriekeForm {
  naam: string;
  geboortedatum: string;
  email: string;
  telefoon: string;
  functie_id: number | null;
  werkmaatschappij: string;
  start_datum: string;
  eind_datum: string;
  extra_1: string;
  extra_2: string;
  opmerkingen: string;
  vca_vervaldatum: string;
  bhv_vervaldatum: string;
  ehbo_vervaldatum: string;
  rijbewijs: string;
}

const LEEG_GENERIEK: GeneriekeForm = {
  naam: "", geboortedatum: "", email: "", telefoon: "",
  functie_id: null, werkmaatschappij: WERKMAATSCHAPPIJ_STD,
  start_datum: new Date().toISOString().slice(0, 10), eind_datum: "",
  extra_1: "", extra_2: "", opmerkingen: "",
  vca_vervaldatum: "", bhv_vervaldatum: "", ehbo_vervaldatum: "", rijbewijs: "",
};

function GeneriekeWizard({
  soort,
  onTerug,
  onGereed,
  context,
}: {
  soort: GenerieveStroom;
  onTerug: () => void;
  onGereed: (id: number) => void;
  context: OnboardingContext;
}) {
  const config = GENERIEKE_CONFIGS[soort];
  const [form, setForm] = useState<GeneriekeForm>(() => ({
    ...LEEG_GENERIEK,
    naam: context.naam,
    email: context.email ?? "",
    telefoon: context.telefoon ?? "",
  }));
  const [huidigStap, setHuidigStap] = useState(1);
  const TOTAAL = GENERIEKE_STAPPEN.length;
  const { data: functies } = useListFuncties();
  const maak = useCreateMedewerker();
  const slaVoortgangOp = usePatchWizardVoortgang();
  const bijwerk = useUpdateMedewerker();
  const { toast } = useToast();
  const [medewerkerDraftId, setMedewerkerDraftId] = useState<number | null>(null);
  const [draftBijgewerktOp, setDraftBijgewerktOp] = useState<string | null>(null);

  async function gaVolgende() {
    if (huidigStap === 1 && !form.naam.trim()) {
      toast({ title: "Naam is verplicht voor de volgende stap", variant: "destructive" });
      return;
    }
    if (huidigStap === 1 && !medewerkerDraftId) {
      try {
        const concept = await maak.mutateAsync({ data: { naam: form.naam.trim(), gebruiker_id: context.gebruiker_id } });
        setMedewerkerDraftId(concept.id);
        const r = await slaVoortgangOp.mutateAsync({ id: concept.id, data: { stap: 2, medewerker_status: "concept" } });
        if (r.bijgewerkt_op) setDraftBijgewerktOp(r.bijgewerkt_op);
      } catch (err: unknown) {
        if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 409) {
          toast({
            title: "Al gekoppeld",
            description: "Dit gebruikersaccount heeft al een medewerkerprofiel. Ga terug naar de medewerkerslijst.",
            variant: "destructive",
          });
          return;
        }
        // Andere fouten zijn niet fataal: wizard loopt door zonder server-side persistentie
      }
    } else if (medewerkerDraftId) {
      const volgende = Math.min(huidigStap + 1, TOTAAL);
      try {
        const r = await slaVoortgangOp.mutateAsync({
          id: medewerkerDraftId,
          data: {
            stap: volgende,
            voortgang_data: form as unknown as Record<string, unknown>,
            ...(draftBijgewerktOp ? { bijgewerkt_op: draftBijgewerktOp } : {}),
          },
        });
        if (r.bijgewerkt_op) setDraftBijgewerktOp(r.bijgewerkt_op);
      } catch (err: unknown) {
        if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 409) {
          toast({ title: "Voortgang conflict", description: "De wizard is elders bijgewerkt. Ververs de pagina.", variant: "destructive" });
          return;
        }
        // Andere fouten zijn niet fataal — wizard loopt door
      }
    }
    setHuidigStap((s) => Math.min(s + 1, TOTAAL));
  }

  function gaVorige() {
    if (huidigStap === 1) { onTerug(); return; }
    setHuidigStap((s) => Math.max(s - 1, 1));
  }

  async function opslaan() {
    if (!form.naam.trim()) { toast({ title: "Naam is verplicht", variant: "destructive" }); return; }
    try {
      const input: MedewerkerInput = {
        naam: form.naam.trim(),
        gebruiker_id: context.gebruiker_id,
        email: form.email.trim() || undefined,
        geboortedatum: form.geboortedatum || undefined,
        telefoon: form.telefoon || undefined,
        functie_id: form.functie_id ?? undefined,
        werkmaatschappij: form.werkmaatschappij,
        dienstverband: config.dienstverband,
        in_dienst_sinds: form.start_datum || undefined,
        uit_dienst_per: form.eind_datum || undefined,
        bedrijf_uitzendbureau: form.extra_1.trim() || undefined,
        cv_tekst: [
          form.extra_2 && config.extra2Label ? `${config.extra2Label}: ${form.extra_2}` : null,
          form.opmerkingen ? `Opmerkingen: ${form.opmerkingen}` : null,
        ].filter(Boolean).join("\n") || undefined,
        vca_vervaldatum: form.vca_vervaldatum || undefined,
        bhv_vervaldatum: form.bhv_vervaldatum || undefined,
        ehbo_vervaldatum: form.ehbo_vervaldatum || undefined,
        rijbewijs: form.rijbewijs || undefined,
        jaar: new Date().getFullYear(),
      };
      if (medewerkerDraftId) {
        await bijwerk.mutateAsync({ id: medewerkerDraftId, data: input });
        await slaVoortgangOp.mutateAsync({
          id: medewerkerDraftId,
          data: {
            stap: TOTAAL,
            medewerker_status: "actief",
            ...(draftBijgewerktOp ? { bijgewerkt_op: draftBijgewerktOp } : {}),
          },
        });
        onGereed(medewerkerDraftId);
      } else {
        const nieuw = await maak.mutateAsync({ data: input });
        onGereed(nieuw.id);
      }
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 409) {
        toast({
          title: "Al gekoppeld",
          description: "Dit gebruikersaccount heeft al een medewerkerprofiel.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Aanmaken mislukt", variant: "destructive" });
    }
  }

  const isPending = maak.isPending || bijwerk.isPending || slaVoortgangOp.isPending;

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={gaVorige}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{config.titel}</h1>
          <p className="text-sm text-muted-foreground">{config.subtitel}</p>
        </div>
      </div>

      <WizardStapIndicator huidigStap={huidigStap} stappen={GENERIEKE_STAPPEN} />

      {huidigStap === 1 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Naam *</Label>
            <Input value={form.naam} disabled readOnly />
            <p className="text-xs text-muted-foreground">Overgenomen van het gebruikersaccount — niet aanpasbaar tijdens onboarding.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Geboortedatum</Label>
            <Input type="date" value={form.geboortedatum} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setForm({ ...form, geboortedatum: e.target.value })} />
          </div>
        </div>
      )}

      {huidigStap === 2 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>E-mailadres</Label>
            <Input type="email" value={form.email} disabled readOnly />
          </div>
          <div className="space-y-1.5">
            <Label>Telefoonnummer</Label>
            <Input value={form.telefoon} disabled readOnly />
          </div>
          <p className="text-xs text-muted-foreground">Contactgegevens komen uit het gebruikersaccount en zijn hier niet aanpasbaar.</p>
        </div>
      )}

      {huidigStap === 3 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Functie</Label>
            <FunctieSelect functieId={form.functie_id} functies={functies ?? []} onChange={(id) => setForm({ ...form, functie_id: id })} />
          </div>
          <div className="space-y-1.5">
            <Label>Werkmaatschappij</Label>
            <Select value={form.werkmaatschappij} onValueChange={(v) => setForm({ ...form, werkmaatschappij: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{WERKMAATSCHAPPIJEN.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      )}

      {huidigStap === 4 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Startdatum</Label>
              <Input type="date" value={form.start_datum} onChange={(e) => setForm({ ...form, start_datum: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Einddatum</Label>
              <Input type="date" value={form.eind_datum} onChange={(e) => setForm({ ...form, eind_datum: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{config.extra1Label}</Label>
            <Input placeholder={config.extra1Placeholder} value={form.extra_1} onChange={(e) => setForm({ ...form, extra_1: e.target.value })} />
          </div>
          {config.extra2Label && (
            <div className="space-y-1.5">
              <Label>{config.extra2Label}</Label>
              <Input placeholder={config.extra2Placeholder ?? ""} value={form.extra_2} onChange={(e) => setForm({ ...form, extra_2: e.target.value })} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Opmerkingen</Label>
            <Input placeholder="Optionele toelichting" value={form.opmerkingen} onChange={(e) => setForm({ ...form, opmerkingen: e.target.value })} />
          </div>
        </div>
      )}

      {huidigStap === 5 && (
        <div className="space-y-4">
          {config.certificatenToepasselijk ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>VCA geldig tot</Label>
                  <Input type="date" value={form.vca_vervaldatum} onChange={(e) => setForm({ ...form, vca_vervaldatum: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>BHV geldig tot</Label>
                  <Input type="date" value={form.bhv_vervaldatum} onChange={(e) => setForm({ ...form, bhv_vervaldatum: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>EHBO geldig tot</Label>
                  <Input type="date" value={form.ehbo_vervaldatum} onChange={(e) => setForm({ ...form, ehbo_vervaldatum: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Rijbewijs categorie(s)</Label>
                  <Input placeholder="bijv. B, BE, C" value={form.rijbewijs} onChange={(e) => setForm({ ...form, rijbewijs: e.target.value })} />
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
              Certificaten zijn niet van toepassing voor {config.titel}. U kunt ze later toevoegen via het medewerkerprofiel.
            </div>
          )}
        </div>
      )}

      {huidigStap === 6 && (
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-semibold">Samenvatting — controleer voordat u aanmaakt</p>
          <div className="space-y-0 text-sm divide-y">
            {(
              [
                ["Naam", form.naam || "—"],
                ["E-mail", form.email || "—"],
                ["Geboortedatum", form.geboortedatum || "—"],
                ["Telefoon", form.telefoon || "—"],
                ["Functie", (functies ?? []).find((f) => f.id === form.functie_id)?.naam ?? "—"],
                ["Werkmaatschappij", form.werkmaatschappij],
                ["Startdatum", form.start_datum || "—"],
                ["Einddatum", form.eind_datum || "—"],
                [config.extra1Label, form.extra_1 || "—"],
                ...(config.extra2Label ? [[config.extra2Label, form.extra_2 || "—"] as [string, string]] : []),
              ] as [string, string][]
            ).map(([label, waarde]) => (
              <div key={label} className="flex justify-between py-1.5">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium text-right">{waarde}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        {huidigStap < TOTAAL ? (
          <Button onClick={gaVolgende} disabled={huidigStap === 1 && (maak.isPending || slaVoortgangOp.isPending)}>
            {huidigStap === 1 && (maak.isPending || slaVoortgangOp.isPending) ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Opslaan...</>
            ) : (
              <>Volgende <ArrowRight className="h-4 w-4 ml-1.5" /></>
            )}
          </Button>
        ) : (
          <Button onClick={opslaan} disabled={isPending}>
            {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aanmaken...</> : "Medewerker registreren"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={gaVorige}>
          {huidigStap === 1 ? "Annuleren" : "Vorige"}
        </Button>
      </div>
    </div>
  );
}

// ─── Stap 2a: Vast / tijdelijk ────────────────────────────────────────────────

function VastFormulier({
  onTerug,
  onGereed,
  cvStash,
  onWisCv,
  resumeId,
  context,
}: {
  onTerug: () => void;
  onGereed: (id: number) => void;
  cvStash?: CvOnboardingStash | null;
  onWisCv?: () => void;
  resumeId?: number | null;
  context: OnboardingContext;
}) {
  const voorstel = cvStash?.voorstel ?? null;
  const [form, setForm] = useState<VastForm>(() => ({
    ...LEEG_VAST,
    naam: context.naam,
    email: context.email ?? "",
    geboortedatum: geldigeDatum(voorstel?.geboortedatum),
  }));
  const [cvExtra, setCvExtra] = useState<CvExtraVelden>(() => {
    const extra = bouwCvExtra(voorstel);
    // Telefoon is identiteit: altijd uit het gebruikersaccount, nooit uit het CV.
    if (context.telefoon) extra.telefoon = context.telefoon;
    else delete extra.telefoon;
    return extra;
  });
  const { data: functies } = useListFuncties();
  const { data: verlofsoorten } = useListVerlofsoorten();
  const { data: caoOpties } = useListCaoOpties();
  const { data: profielen } = useListProfielen();
  const { data: bestaandeMedewerkers } = useListMedewerkers();
  const maak = useCreateMedewerker();
  const bijwerk = useUpdateMedewerker();
  const slaVoortgangOp = usePatchWizardVoortgang();
  const beoordeelVoorstel = usePatchAiVoorstel();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // AI-onboarding uit geplakte tekst: de AI stelt onboarding-velden voor
  // (naam, functie, werkmaatschappij, uren, startdatum), de mens bevestigt in
  // het formulier. Er worden nooit rechten of bevoegdheden voorgesteld — die
  // volgen uit de gekozen functie (rechten-preview + CAO-voorselectie hieronder).
  const onboardingAi = useAiOnboardingVoorstel();
  const [bronTekst, setBronTekst] = useState("");
  const [aiToegepast, setAiToegepast] = useState<string[]>([]);
  const [aiOnbekendeFunctie, setAiOnbekendeFunctie] = useState<string | null>(null);
  const [huidigStap, setHuidigStap] = useState(1);
  const [medewerkerDraftId, setMedewerkerDraftId] = useState<number | null>(null);
  const [draftBijgewerktOp, setDraftBijgewerktOp] = useState<string | null>(null);
  const [geselecteerdeMiddelen, setGeselecteerdeMiddelen] = useState<string[]>([]);
  const [onboardingTaken, setOnboardingTaken] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(STANDAARD_ONBOARDING_TAKEN.map((t) => [t.id, true])),
  );
  const [onboardingDeadlines, setOnboardingDeadlines] = useState<Record<string, string>>({});
  const [bestandUploadActief, setBestandUploadActief] = useState(false);
  const [bestandAnalyseLoading, setBestandAnalyseLoading] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const TOTAAL_STAPPEN = WIZARD_STAPPEN.length;
  const duplicateCheck = useDuplicateCheckMedewerker();
  const [duplicaatMelding, setDuplicaatMelding] = useState<string | null>(null);
  const [duplicaatCheckUitgevoerd, setDuplicaatCheckUitgevoerd] = useState(false);
  const { data: wizardStatus } = useGetWizardStatus(resumeId ?? 0, {
    query: { enabled: !!resumeId, queryKey: getGetWizardStatusQueryKey(resumeId ?? 0) },
  });
  const { data: alleVoorstellen = [] } = useListAiVoorstellen(medewerkerDraftId ?? 0);
  const openVoorstellen = alleVoorstellen.filter((v) => v.status === "open");

  useEffect(() => {
    if (!wizardStatus || !resumeId || medewerkerDraftId) return;
    setMedewerkerDraftId(resumeId);
    setHuidigStap((wizardStatus as WizardStatus).huidig_stap ?? 1);
    const data = ((wizardStatus as WizardStatus).wizard_voortgang as Record<string, unknown> | null) ?? {};
    const vd = (data.voortgang_data as Partial<VastForm> | null) ?? {};
    if (Object.keys(vd).length > 0) {
      setForm((f) => ({ ...f, ...vd }));
    }
    const restoredTaken = data.onboardingTaken as Record<string, boolean> | null;
    if (restoredTaken) setOnboardingTaken(restoredTaken);
    const restoredDeadlines = data.onboardingDeadlines as Record<string, string> | null;
    if (restoredDeadlines) setOnboardingDeadlines(restoredDeadlines);
    const restoredMiddelen = data.geselecteerdeMiddelen as string[] | null;
    if (restoredMiddelen) setGeselecteerdeMiddelen(restoredMiddelen);
  }, [wizardStatus, resumeId, medewerkerDraftId]);

  async function voorstelBeoordelen(voorstelId: number, status: string) {
    try {
      await beoordeelVoorstel.mutateAsync({ voorstelId, data: { status } });
      await queryClient.invalidateQueries({ queryKey: getListAiVoorstellenQueryKey(medewerkerDraftId ?? 0) });
    } catch {
      toast({ title: "Beoordelen mislukt", variant: "destructive" });
    }
  }


  async function analyseerBestandUpload(bestand: File) {
    setBestandAnalyseLoading(true);
    try {
      const formData = new FormData();
      formData.append("bestand", bestand);
      const resp = await fetch(`${import.meta.env.BASE_URL}api/hrm/analyseer-bestand`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json() as { ok: boolean; velden?: Record<string, string>; foutmelding?: string | null };
      if (data.ok && data.velden) {
        const v = data.velden;
        // Identiteit (naam, e-mail, telefoon) komt uit het gebruikersaccount en
        // wordt nooit overschreven vanuit een document.
        if (v.geboortedatum) setForm((f) => ({ ...f, geboortedatum: v.geboortedatum ?? f.geboortedatum }));
        const extraUpdate: Partial<CvExtraVelden> = {};
        if (v.mobiel) extraUpdate.mobiel = v.mobiel;
        if (v.adres) extraUpdate.adres = v.adres;
        if (v.postcode) extraUpdate.postcode = v.postcode;
        if (v.woonplaats) extraUpdate.woonplaats = v.woonplaats;
        if (v.rijbewijs) extraUpdate.rijbewijs = v.rijbewijs;
        if (v.vca_vervaldatum) extraUpdate.vca_vervaldatum = v.vca_vervaldatum;
        if (v.bhv_vervaldatum) extraUpdate.bhv_vervaldatum = v.bhv_vervaldatum;
        if (v.ehbo_vervaldatum) extraUpdate.ehbo_vervaldatum = v.ehbo_vervaldatum;
        if (Object.keys(extraUpdate).length > 0) setCvExtra((e) => ({ ...e, ...extraUpdate }));
        toast({ title: "Document geanalyseerd", description: "Velden zijn ingevuld vanuit uw document. Controleer en pas aan." });
      } else {
        // data.ok=false: analyse niet beschikbaar (Onbekend type, pixelgebaseerd PDF, e.d.)
        // Toon de servermelding als die er is, anders een generieke Dutch fallback.
        const melding = data.foutmelding ??
          "Documentanalyse is niet beschikbaar voor dit bestand. Voer de gegevens handmatig in.";
        toast({ title: "Documentanalyse niet beschikbaar", description: melding, variant: "default" });
      }
    } catch {
      toast({ title: "Analyse mislukt", description: "Probeer het opnieuw of voer gegevens handmatig in.", variant: "destructive" });
    } finally {
      setBestandAnalyseLoading(false);
    }
  }

  async function gaVolgende() {
    if (huidigStap === 2 && !form.naam.trim()) {
      toast({ title: "Naam is verplicht voor de volgende stap", variant: "destructive" });
      return;
    }
    // Stap 2→3: server-side duplicate check, daarna concept-medewerker aanmaken
    if (huidigStap === 2 && !medewerkerDraftId) {
      if (!duplicaatCheckUitgevoerd) {
        setDuplicaatCheckUitgevoerd(true);
        try {
          const dc = await duplicateCheck.mutateAsync({
            data: { naam: form.naam.trim(), email: form.email.trim() },
          });
          const dupes =
            (dc as { mogelijke_duplicaten?: Array<{ naam: string }> }).mogelijke_duplicaten ?? [];
          if (dupes.length > 0) {
            setDuplicaatMelding(dupes.map((d) => d.naam).join(", "));
            return;
          }
        } catch {
          // Non-fataal: doorgaan zonder duplicate check
        }
      }
      try {
        const concept = await maak.mutateAsync({ data: { naam: form.naam.trim(), gebruiker_id: context.gebruiker_id } });
        setMedewerkerDraftId(concept.id);
        const r = await slaVoortgangOp.mutateAsync({ id: concept.id, data: { stap: 3, medewerker_status: "concept" } });
        if (r.bijgewerkt_op) setDraftBijgewerktOp(r.bijgewerkt_op);
      } catch (err: unknown) {
        if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 409) {
          toast({
            title: "Al gekoppeld",
            description: "Dit gebruikersaccount heeft al een medewerkerprofiel. Ga terug naar de medewerkerslijst.",
            variant: "destructive",
          });
          return;
        }
        // Andere fouten zijn niet fataal: wizard loopt door zonder server-side persistentie
      }
    } else if (medewerkerDraftId && huidigStap > 2) {
      const volgende = Math.min(huidigStap + 1, TOTAAL_STAPPEN);
      try {
        const r = await slaVoortgangOp.mutateAsync({
          id: medewerkerDraftId,
          data: {
            stap: volgende,
            voortgang_data: { voortgang_data: { ...form }, cvExtra, geselecteerdeMiddelen, onboardingTaken, onboardingDeadlines } as unknown as Record<string, unknown>,
            ...(draftBijgewerktOp ? { bijgewerkt_op: draftBijgewerktOp } : {}),
          },
        });
        if (r.bijgewerkt_op) setDraftBijgewerktOp(r.bijgewerkt_op);
      } catch (err: unknown) {
        if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 409) {
          toast({ title: "Voortgang conflict", description: "De wizard is elders bijgewerkt. Ververs de pagina.", variant: "destructive" });
          return;
        }
      }
    }
    setHuidigStap((s) => Math.min(s + 1, TOTAAL_STAPPEN));
  }

  function gaVorige() {
    if (huidigStap === 1) { onTerug(); return; }
    setHuidigStap((s) => Math.max(s - 1, 1));
  }

  function pasOnboardingVoorstelToe(v: CvAnalyseResultaat) {
    // Functie-match vooraf berekenen (geen side effects in de setForm-updater).
    let gematchteFunctieId: number | null = null;
    let onbekendeFunctie: string | null = null;
    if (v.functie_suggestie) {
      const zoek = v.functie_suggestie.trim().toLowerCase();
      const lijst = functies ?? [];
      // Exacte match heeft voorrang; pas daarna substring (voorkomt dat bij
      // meerdere "monteur"-functies de verkeerde wordt voorgeselecteerd).
      const match =
        lijst.find((fn) => fn.naam.trim().toLowerCase() === zoek) ??
        lijst.find((fn) => {
          const naam = fn.naam.trim().toLowerCase();
          return naam.includes(zoek) || zoek.includes(naam);
        });
      if (match) gematchteFunctieId = match.id;
      else onbekendeFunctie = v.functie_suggestie;
    }
    const geldigeWm = v.werkmaatschappij && (WERKMAATSCHAPPIJEN as readonly string[]).includes(v.werkmaatschappij);
    const geldigDv = v.dienstverband && ["vast", "tijdelijk", "oproep", "stage"].includes(v.dienstverband);
    const uren = v.contracturen_per_week ? Number(v.contracturen_per_week) : NaN;
    const geldigeUren = Number.isFinite(uren) && uren > 0 && uren <= 48;
    const startdatum = geldigeDatum(v.startdatum);
    const geboortedatum = geldigeDatum(v.geboortedatum);

    setForm((f) => {
      const next = { ...f };
      // Naam en e-mail zijn identiteit uit het gebruikersaccount — nooit
      // overschrijven vanuit een AI-voorstel.
      if (geboortedatum) next.geboortedatum = geboortedatum;
      if (gematchteFunctieId != null) next.functie_id = gematchteFunctieId;
      if (geldigeWm && v.werkmaatschappij) {
        next.werkmaatschappij = v.werkmaatschappij;
        next.cao = caoVoorWerkmaatschappij(v.werkmaatschappij) ?? next.cao;
      }
      if (geldigDv && v.dienstverband) next.dienstverband = v.dienstverband;
      if (geldigeUren) next.contracturen_per_week = String(uren);
      if (startdatum) next.in_dienst_sinds = startdatum;
      return next;
    });

    const extra = bouwCvExtra(v);
    // Telefoon is identiteit uit het gebruikersaccount — niet overnemen uit het voorstel.
    delete extra.telefoon;
    if (Object.keys(extra).length > 0) setCvExtra((prev) => ({ ...prev, ...extra }));

    const toegepast: string[] = [];
    if (geboortedatum) toegepast.push("Geboortedatum");
    if (gematchteFunctieId != null) toegepast.push("Functie");
    if (geldigeWm) toegepast.push("Werkmaatschappij");
    if (geldigDv) toegepast.push("Dienstverband");
    if (geldigeUren) toegepast.push("Contracturen");
    if (startdatum) toegepast.push("Startdatum");
    if (Object.keys(extra).length > 0) toegepast.push("Contactgegevens");

    setAiToegepast(toegepast);
    setAiOnbekendeFunctie(onbekendeFunctie);
  }

  async function vraagOnboardingVoorstel() {
    const tekst = bronTekst.trim();
    if (tekst.length < 30) {
      toast({
        title: "Plak eerst wat tekst",
        description: "Bijvoorbeeld een e-mail of arbeidsovereenkomst.",
        variant: "destructive",
      });
      return;
    }
    try {
      const v = await onboardingAi.mutateAsync({ data: { tekst } });
      pasOnboardingVoorstelToe(v);
      toast({ title: "AI-voorstel ingevuld", description: "Controleer alle velden voordat u opslaat." });
    } catch {
      toast({
        title: "AI-voorstel niet beschikbaar",
        description: "Vul de velden handmatig in.",
        variant: "destructive",
      });
    }
  }

  // Toegangsrechten-preview: de gekozen functie kan een standaard toegangsprofiel
  // dragen (functies.profiel_id). We tonen wat dat profiel inhoudt zodat de
  // invoerder in één oogopslag ziet welke rechten bij deze functie horen.
  const gekozenFunctie = useMemo(
    () => (functies ?? []).find((f) => f.id === form.functie_id),
    [functies, form.functie_id],
  );
  const functieProfiel = useMemo(() => {
    const pid = gekozenFunctie?.profiel_id;
    if (pid == null) return null;
    return (profielen ?? []).find((p) => p.id === pid) ?? null;
  }, [gekozenFunctie, profielen]);
  const rechtenLijst = useMemo(() => {
    const bev = functieProfiel?.bevoegdheden as Record<string, number> | null | undefined;
    if (!bev) return [];
    return MODULES.filter((m) => (bev[m.id] ?? 0) > 0).map((m) => ({
      id: m.id,
      label: m.label,
      niveau: bev[m.id],
    }));
  }, [functieProfiel]);

  // Duplicaatwaarschuwing: zelfde naam of e-mailadres als bestaande medewerker
  const duplicaatNaam = useMemo(() => {
    if (!bestaandeMedewerkers) return null;
    const naam = form.naam.trim().toLowerCase();
    const email = form.email.trim().toLowerCase();
    const lijst = bestaandeMedewerkers as Array<{ naam?: string | null; email?: string | null }>;
    const match = lijst.find(
      (m) =>
        (naam && m.naam?.trim().toLowerCase() === naam) ||
        (email && m.email?.trim().toLowerCase() === email),
    );
    return match?.naam ?? null;
  }, [bestaandeMedewerkers, form.naam, form.email]);

  function wisCvGegevens() {
    // Identiteit (naam, e-mail, telefoon) blijft altijd uit het gebruikersaccount.
    setForm((f) => ({ ...f, geboortedatum: "" }));
    setCvExtra(context.telefoon ? { telefoon: context.telefoon } : {});
    onWisCv?.();
  }

  // Bepaal welke verlofsoorten automatisch van toepassing zijn op basis van CAO en dienstverband.
  // Oproep/stage krijgen alleen vakantieverlof; vast/tijdelijk krijgen alles wat bij de CAO past.
  const autoSelecteerIds = useMemo(() => {
    if (!verlofsoorten) return [];
    const alleenVakantie = form.dienstverband === "oproep" || form.dienstverband === "stage";
    return verlofsoorten
      .filter((v) => {
        if (!v.actief) return false;
        if (alleenVakantie && v.hoofdcategorie !== "vakantie") return false;
        if (v.cao && form.cao && v.cao !== form.cao) return false;
        return true;
      })
      .map((v) => v.id);
  }, [verlofsoorten, form.cao, form.dienstverband]);

  // Zet automatische selectie zodra verlofsoorten beschikbaar zijn (initieel of na CAO/dienstverband-wijziging).
  useEffect(() => {
    if (autoSelecteerIds.length > 0) {
      setForm((f) => ({ ...f, verlofsoort_ids: autoSelecteerIds }));
    }
  }, [autoSelecteerIds]);

  // Huidige CAO-optie voor de uren-preview.
  const huidigeCaoOptie = useMemo(
    () => (caoOpties ?? []).find((c) => c.naam === form.cao),
    [caoOpties, form.cao],
  );

  // Berekende verlofuren per geselecteerde verlofsoort (pro-rata).
  const urenPreview = useMemo(() => {
    if (!huidigeCaoOptie || !form.contracturen_per_week) return {};
    const standaard = huidigeCaoOptie.standaard_uren_per_week ?? 40;
    const uren = Number(form.contracturen_per_week);
    if (!Number.isFinite(uren) || uren <= 0) return {};
    const factor = Math.min(uren / standaard, 1);
    const preview: Record<number, number> = {};
    for (const v of verlofsoorten ?? []) {
      if (v.opbouw_uren_per_jaar != null) {
        preview[v.id] = Math.round(v.opbouw_uren_per_jaar * factor * 10) / 10;
      }
    }
    return preview;
  }, [huidigeCaoOptie, form.contracturen_per_week, verlofsoorten]);

  const leeftijd = berekenLeeftijd(form.geboortedatum);

  function toggleVerlof(id: number) {
    setForm((f) => ({
      ...f,
      verlofsoort_ids: f.verlofsoort_ids.includes(id)
        ? f.verlofsoort_ids.filter((x) => x !== id)
        : [...f.verlofsoort_ids, id],
    }));
  }

  function selecteerAlle() {
    const alleIds = (verlofsoorten ?? []).filter((v) => v.actief).map((v) => v.id);
    setForm((f) => ({ ...f, verlofsoort_ids: alleIds }));
  }

  function deselecteerAlle() {
    setForm((f) => ({ ...f, verlofsoort_ids: [] }));
  }

  async function opslaan() {
    if (!form.naam.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    try {
      const input: MedewerkerInput = {
        naam: form.naam.trim(),
        gebruiker_id: context.gebruiker_id,
        email: form.email.trim() || undefined,
        geboortedatum: form.geboortedatum || undefined,
        functie_id: form.functie_id ?? undefined,
        werkmaatschappij: form.werkmaatschappij,
        cao: form.cao || undefined,
        dienstverband: form.dienstverband,
        contracturen_per_week: form.contracturen_per_week ? Number(form.contracturen_per_week) : undefined,
        in_dienst_sinds: form.in_dienst_sinds || undefined,
        verlofsoort_ids: form.verlofsoort_ids.length > 0 ? form.verlofsoort_ids : undefined,
        jaar: new Date().getFullYear(),
        telefoon: cvExtra.telefoon || undefined,
        mobiel: cvExtra.mobiel || undefined,
        adres: cvExtra.adres || undefined,
        postcode: cvExtra.postcode || undefined,
        woonplaats: cvExtra.woonplaats || undefined,
        rijbewijs: cvExtra.rijbewijs || undefined,
        vca_vervaldatum: cvExtra.vca_vervaldatum || undefined,
        bhv_vervaldatum: cvExtra.bhv_vervaldatum || undefined,
        ehbo_vervaldatum: cvExtra.ehbo_vervaldatum || undefined,
        cv_tekst: cvExtra.cv_tekst || undefined,
      };
      async function maakGeselecteerdeMiddelenAan(mwId: number) {
        for (const middelId of geselecteerdeMiddelen) {
          const m = STANDAARD_MIDDELEN.find((x) => x.id === middelId);
          if (!m) continue;
          try {
            await fetch(`${import.meta.env.BASE_URL}api/medewerkers/${mwId}/middelen`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ naam: m.naam, categorie: m.categorie, status: "aangevraagd" }),
            });
          } catch { /* Niet fataal — middelen zijn altijd later toe te voegen */ }
        }
      }

      async function maakOnboardingTakenAan(mwId: number) {
        const startdatumStr = form.in_dienst_sinds || new Date().toISOString().slice(0, 10);
        const startdatum = new Date(startdatumStr);
        for (let idx = 0; idx < STANDAARD_ONBOARDING_TAKEN.length; idx++) {
          const t = STANDAARD_ONBOARDING_TAKEN[idx];
          if (!onboardingTaken[t.id]) continue;
          const standaard = new Date(startdatum);
          standaard.setDate(standaard.getDate() + t.deadlineDagen);
          const deadline = onboardingDeadlines[t.id] ?? standaard.toISOString().slice(0, 10);
          try {
            await fetch(`${import.meta.env.BASE_URL}api/medewerkers/${mwId}/onboarding-taken`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                naam: t.taak,
                categorie: t.categorie,
                deadline,
                status: "open",
                volgorde: idx,
              }),
            });
          } catch { /* Niet fataal — taken zijn later toe te voegen via het medewerkerdossier */ }
        }
      }

      if (medewerkerDraftId) {
        // Concept bestaat al — bijwerken met definitieve gegevens en afsluiten
        await bijwerk.mutateAsync({ id: medewerkerDraftId, data: input });
        await slaVoortgangOp.mutateAsync({
          id: medewerkerDraftId,
          data: {
            stap: TOTAAL_STAPPEN,
            medewerker_status: "actief",
            ...(draftBijgewerktOp ? { bijgewerkt_op: draftBijgewerktOp } : {}),
          },
        });
        await maakGeselecteerdeMiddelenAan(medewerkerDraftId);
        await maakOnboardingTakenAan(medewerkerDraftId);
        onGereed(medewerkerDraftId);
      } else {
        const nieuw = await maak.mutateAsync({ data: input });
        await maakGeselecteerdeMiddelenAan(nieuw.id);
        await maakOnboardingTakenAan(nieuw.id);
        onGereed(nieuw.id);
      }
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 409) {
        toast({
          title: "Al gekoppeld",
          description: "Dit gebruikersaccount heeft al een medewerkerprofiel.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Aanmaken mislukt", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={gaVorige}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Vaste / tijdelijke medewerker</h1>
          <p className="text-sm text-muted-foreground">In loondienst via FPS — CAO en verlofopbouw van toepassing</p>
        </div>
      </div>

      {/* Voortgangsindicator */}
      <WizardStapIndicator huidigStap={huidigStap} stappen={WIZARD_STAPPEN} />

      {/* ── STAP 1: AI-voorbereiding ── */}
      {huidigStap === 1 && (
        <div className="space-y-4">
          {cvStash && voorstel && (
            <CvVoorstelBanner
              bestandsnaam={cvStash.bestandsnaam}
              voorstel={voorstel}
              extra={cvExtra}
              duplicaatNaam={null}
              onWissen={wisCvGegevens}
            />
          )}
          <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Sneller invullen met AI (optioneel)</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Plak een e-mail of arbeidsovereenkomst. De AI stelt naam, functie, werkmaatschappij,
                  uren en startdatum voor. Er wordt niets aangemaakt en er worden geen rechten voorgesteld —
                  u controleert en bevestigt alles in de volgende stappen.
                </p>
              </div>
            </div>
            <Textarea
              rows={4}
              placeholder="Plak hier de e-mail of arbeidsovereenkomst..."
              value={bronTekst}
              onChange={(e) => setBronTekst(e.target.value)}
              className="bg-white"
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={onboardingAi.isPending || bronTekst.trim().length < 30}
                onClick={vraagOnboardingVoorstel}
              >
                {onboardingAi.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                AI-voorstel invullen
              </Button>
              {bronTekst && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 text-amber-800 hover:bg-amber-100"
                  onClick={() => { setBronTekst(""); setAiToegepast([]); setAiOnbekendeFunctie(null); }}
                >
                  <X className="h-3.5 w-3.5" /> Wissen
                </Button>
              )}
            </div>
            {aiToegepast.length > 0 && (
              <p className="text-xs text-amber-900">
                Voorgesteld en ingevuld: {aiToegepast.join(", ")}. Controleer de velden in de volgende stappen.
              </p>
            )}
            {aiOnbekendeFunctie && (
              <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-100/60 px-2.5 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  De AI stelde functie &quot;{aiOnbekendeFunctie}&quot; voor, maar die bestaat nog niet.
                  Kies zelf een functie in stap 4 of voeg de functie eerst toe via het Functiehuis.
                </p>
              </div>
            )}
          </div>
          {/* Document uploaden als alternatief */}
          <div className="rounded-lg border border-dashed px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Of upload een document</span>
              <span className="text-xs text-muted-foreground">(PDF, Word)</span>
            </div>
            {!bestandUploadActief ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => setBestandUploadActief(true)}
              >
                Bestand kiezen
              </Button>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={uploadRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt"
                  className="text-xs"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) await analyseerBestandUpload(f);
                  }}
                />
                {bestandAnalyseLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { setBestandUploadActief(false); if (uploadRef.current) uploadRef.current.value = ""; }}
                >
                  <X className="h-3 w-3 mr-1" /> Annuleren
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Upload een CV, arbeidsovereenkomst of ID-document. De AI probeert velden automatisch in te vullen.
            </p>
          </div>
        </div>
      )}

      {/* ── STAP 2: Persoonsgegevens ── */}
      {huidigStap === 2 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Naam *</Label>
            <Input value={form.naam} disabled readOnly />
            <p className="text-xs text-muted-foreground">Overgenomen van het gebruikersaccount — niet aanpasbaar tijdens onboarding.</p>
          </div>
          <div className="space-y-1.5">
            <Label>
              Geboortedatum{" "}
              {leeftijd !== null && (
                <span className="text-muted-foreground text-xs font-normal">({leeftijd} jaar)</span>
              )}
            </Label>
            <Input
              type="date"
              value={form.geboortedatum}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setForm({ ...form, geboortedatum: e.target.value })}
            />
          </div>
          {duplicaatMelding && (
            <div className="flex items-start gap-2 rounded border border-orange-300 bg-orange-50 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-700 shrink-0 mt-0.5" />
              <div className="text-xs text-orange-800 space-y-2">
                <p>
                  Bestaande registratie gevonden: <strong>{duplicaatMelding}</strong>.
                  Controleer of dit geen dubbele inschrijving is.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-orange-400 text-orange-800"
                    onClick={() => { setDuplicaatMelding(null); void gaVolgende(); }}
                  >
                    Toch doorgaan
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => { setDuplicaatMelding(null); setDuplicaatCheckUitgevoerd(false); }}
                  >
                    Aanpassen
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STAP 3: Contactgegevens ── */}
      {huidigStap === 3 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>E-mailadres</Label>
            <Input type="email" value={form.email} disabled readOnly />
            <p className="text-xs text-muted-foreground">Overgenomen van het gebruikersaccount — niet aanpasbaar tijdens onboarding.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Telefoon</Label>
              <Input value={cvExtra.telefoon || ""} disabled readOnly />
            </div>
            <div className="space-y-1.5">
              <Label>Mobiel</Label>
              <Input placeholder="06-..." value={cvExtra.mobiel || ""} onChange={(e) => setCvExtra((p) => ({ ...p, mobiel: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Adres</Label>
            <Input placeholder="Straatnaam 1" value={cvExtra.adres || ""} onChange={(e) => setCvExtra((p) => ({ ...p, adres: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Postcode</Label>
              <Input placeholder="1234 AB" value={cvExtra.postcode || ""} onChange={(e) => setCvExtra((p) => ({ ...p, postcode: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Woonplaats</Label>
              <Input value={cvExtra.woonplaats || ""} onChange={(e) => setCvExtra((p) => ({ ...p, woonplaats: e.target.value }))} />
            </div>
          </div>
        </div>
      )}

      {/* ── STAP 4: Functie ── */}
      {huidigStap === 4 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Functie</Label>
            <FunctieSelect
              functieId={form.functie_id}
              functies={functies ?? []}
              onChange={(id) => setForm({ ...form, functie_id: id })}
            />
          </div>
          {form.functie_id != null && (
            <div className="rounded-md border bg-muted/30 px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Toegangsrechten bij deze functie</span>
              </div>
              {functieProfiel ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Standaard toegangsprofiel:{" "}
                    <span className="font-medium text-foreground">{functieProfiel.naam}</span>
                  </p>
                  {rechtenLijst.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {rechtenLijst.map((r) => (
                        <Badge key={r.id} variant="secondary" className="text-xs font-normal">
                          {r.label}
                          <span className="ml-1 text-muted-foreground">{niveauKort(r.niveau)}</span>
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Dit profiel bevat nog geen actieve modulerechten.</p>
                  )}
                  <p className="text-xs text-muted-foreground">Dit is richtinggevend. De definitieve rechten stelt u in bij het account (Gebruikers).</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Aan deze functie is nog geen standaard toegangsprofiel gekoppeld. Stel de rechten
                  handmatig in bij het account, of koppel een profiel via Beheer &rsaquo; Rollen &amp; rechten.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── STAP 5: Werkmaatschappij ── */}
      {huidigStap === 5 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Werkmaatschappij *</Label>
            <Select
              value={form.werkmaatschappij}
              onValueChange={(v) => setForm({ ...form, werkmaatschappij: v, cao: caoVoorWerkmaatschappij(v) ?? form.cao })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {WERKMAATSCHAPPIJEN.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>CAO</Label>
            <Select value={form.cao || undefined} onValueChange={(v) => setForm({ ...form, cao: v })}>
              <SelectTrigger><SelectValue placeholder="Kies CAO" /></SelectTrigger>
              <SelectContent>
                {(caoOpties ?? []).map((c) => <SelectItem key={c.naam} value={c.naam}>{c.naam}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* ── STAP 6: CAO / contract ── */}
      {huidigStap === 6 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Dienstverband</Label>
            <Select value={form.dienstverband} onValueChange={(v) => setForm({ ...form, dienstverband: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vast">Vaste medewerker</SelectItem>
                <SelectItem value="tijdelijk">Tijdelijk contract</SelectItem>
                <SelectItem value="oproep">Oproepkracht</SelectItem>
                <SelectItem value="stage">Stagiair</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* ── STAP 7: Uren ── */}
      {huidigStap === 7 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Contracturen per week</Label>
            <Input
              type="number"
              min="0"
              max="48"
              value={form.contracturen_per_week}
              onChange={(e) => setForm({ ...form, contracturen_per_week: e.target.value })}
            />
            {huidigeCaoOptie && (
              <p className="text-xs text-muted-foreground">
                Standaard {huidigeCaoOptie.standaard_uren_per_week ?? 40} uur/week conform {huidigeCaoOptie.naam}.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── STAP 8: Startdatum ── */}
      {huidigStap === 8 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>In dienst sinds</Label>
            <Input
              type="date"
              value={form.in_dienst_sinds}
              onChange={(e) => setForm({ ...form, in_dienst_sinds: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* ── STAP 9: VCA / BHV / EHBO ── */}
      {huidigStap === 9 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>VCA geldig tot</Label>
            <Input type="date" value={cvExtra.vca_vervaldatum || ""} onChange={(e) => setCvExtra((p) => ({ ...p, vca_vervaldatum: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>BHV geldig tot</Label>
            <Input type="date" value={cvExtra.bhv_vervaldatum || ""} onChange={(e) => setCvExtra((p) => ({ ...p, bhv_vervaldatum: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>EHBO geldig tot</Label>
            <Input type="date" value={cvExtra.ehbo_vervaldatum || ""} onChange={(e) => setCvExtra((p) => ({ ...p, ehbo_vervaldatum: e.target.value }))} />
          </div>
          <p className="text-xs text-muted-foreground">Vul in indien van toepassing. Laat leeg als niet relevant voor deze medewerker.</p>
        </div>
      )}

      {/* ── STAP 10: Rijbewijs ── */}
      {huidigStap === 10 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Rijbewijs categorie(en)</Label>
            <Input
              placeholder="bijv. B, BE, C"
              value={cvExtra.rijbewijs || ""}
              onChange={(e) => setCvExtra((p) => ({ ...p, rijbewijs: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">Meerdere categorieën kommagescheiden, bijv. B, BE, C. Laat leeg als niet van toepassing.</p>
          </div>
        </div>
      )}

      {/* ── STAP 11: Verlofsoorten ── */}
      {huidigStap === 11 && (
        <div className="space-y-4">
          {(verlofsoorten ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nog geen verlofsoorten geconfigureerd. Sla over of voeg ze toe via Personeel &rsaquo; Verlofsoorten.</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Label>
                  Verlofsoorten met beginsaldo{" "}
                  <span className="text-muted-foreground text-xs font-normal">({form.verlofsoort_ids.length} geselecteerd)</span>
                </Label>
                <div className="flex gap-2">
                  <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={selecteerAlle}>Alles</button>
                  <span className="text-muted-foreground text-xs">/</span>
                  <button type="button" className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={deselecteerAlle}>Geen</button>
                </div>
              </div>
              <div className="rounded-md border divide-y">
                {(verlofsoorten ?? []).map((v) => {
                  const uren = urenPreview[v.id];
                  return (
                    <label key={v.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30">
                      <Checkbox checked={form.verlofsoort_ids.includes(v.id)} onCheckedChange={() => toggleVerlof(v.id)} />
                      <span className="flex-1">{v.naam}</span>
                      {uren != null ? (
                        <span className="text-xs text-muted-foreground tabular-nums">{uren} uur/jaar</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">handmatig</span>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Voorgeselecteerd op basis van CAO en dienstverband. Uren zijn pro-rata bij {form.contracturen_per_week || "—"} contractuur/week.
              </p>
            </>
          )}
        </div>
      )}

      {/* ── STAP 12: Middelen ── */}
      {huidigStap === 12 && (
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold">Standaard uitrusting aanvragen</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Vink aan welke middelen aangevraagd moeten worden voor deze medewerker.
                De aanvragen worden automatisch aangemaakt na bevestiging.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {STANDAARD_MIDDELEN.map((m) => (
                <div key={m.id} className="flex items-center gap-2.5 rounded-md border px-3 py-2 hover:bg-muted/40 transition-colors">
                  <Checkbox
                    id={`middel-${m.id}`}
                    checked={geselecteerdeMiddelen.includes(m.id)}
                    onCheckedChange={(checked) => {
                      setGeselecteerdeMiddelen((prev) =>
                        checked ? [...prev, m.id] : prev.filter((x) => x !== m.id),
                      );
                    }}
                  />
                  <label htmlFor={`middel-${m.id}`} className="text-sm cursor-pointer flex-1">
                    {m.naam}
                  </label>
                </div>
              ))}
            </div>
            {geselecteerdeMiddelen.length > 0 ? (
              <p className="text-xs text-primary font-medium">
                {geselecteerdeMiddelen.length} middel{geselecteerdeMiddelen.length !== 1 ? "en" : ""} geselecteerd
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Geen middelen geselecteerd — u kunt dit later toevoegen via het medewerkerdossier.</p>
            )}
          </div>
          {/* ── Onboardingplan ── */}
          <div className="rounded-lg border p-4 space-y-3">
            <div>
              <p className="text-sm font-semibold">Onboardingplan</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Standaard onboarding-taken. Vink af welke taken aangemaakt moeten worden na bevestiging.
                Pas de streefdatum aan indien nodig.
              </p>
            </div>
            <div className="divide-y">
              {STANDAARD_ONBOARDING_TAKEN.map((t) => {
                const startdatum = form.in_dienst_sinds ? new Date(form.in_dienst_sinds) : new Date();
                const standaardDatum = new Date(startdatum);
                standaardDatum.setDate(standaardDatum.getDate() + t.deadlineDagen);
                const standaardDatumStr = standaardDatum.toISOString().slice(0, 10);
                const geselecteerd = onboardingTaken[t.id] ?? true;
                return (
                  <div key={t.id} className="flex items-center gap-3 py-2">
                    <Checkbox
                      id={`taak-${t.id}`}
                      checked={geselecteerd}
                      onCheckedChange={(checked) =>
                        setOnboardingTaken((prev) => ({ ...prev, [t.id]: !!checked }))
                      }
                    />
                    <label htmlFor={`taak-${t.id}`} className="text-sm cursor-pointer flex-1 leading-tight">
                      <span>{t.taak}</span>
                      <span className="text-xs text-muted-foreground ml-1.5">{t.categorie}</span>
                    </label>
                    {geselecteerd && (
                      <input
                        type="date"
                        className="text-xs border rounded px-1.5 py-1 bg-background"
                        value={onboardingDeadlines[t.id] ?? standaardDatumStr}
                        onChange={(e) =>
                          setOnboardingDeadlines((prev) => ({ ...prev, [t.id]: e.target.value }))
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
            {Object.values(onboardingTaken).filter(Boolean).length > 0 ? (
              <p className="text-xs text-primary font-medium">
                {Object.values(onboardingTaken).filter(Boolean).length}{" "}
                onboarding-tak{Object.values(onboardingTaken).filter(Boolean).length !== 1 ? "en" : ""} gepland
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Geen taken geselecteerd — u kunt ze later aanmaken via het medewerkerdossier.</p>
            )}
          </div>

          {duplicaatNaam && (
            <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Mogelijke duplicaat: al een medewerker met naam/e-mail <span className="font-medium">{duplicaatNaam}</span>. Controleer dit in de bevestigingsstap.
              </p>
            </div>
          )}
          {duplicaatMelding && (
            <div className="flex items-start gap-2 rounded border border-orange-300 bg-orange-50 px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-700 shrink-0 mt-0.5" />
              <div className="text-xs text-orange-800 space-y-2">
                <p>
                  Bestaande registratie gevonden: <strong>{duplicaatMelding}</strong>.
                  Controleer of dit geen dubbele inschrijving is.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-orange-400 text-orange-800"
                    onClick={() => { setDuplicaatMelding(null); void gaVolgende(); }}
                  >
                    Toch doorgaan
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground"
                    onClick={() => { setDuplicaatMelding(null); setDuplicaatCheckUitgevoerd(false); }}
                  >
                    Aanpassen
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STAP 13: Bevestiging ── */}
      {huidigStap === 13 && (
        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <p className="text-sm font-semibold">Samenvatting — controleer voordat u aanmaakt</p>
            <div className="space-y-0 text-sm divide-y">
              {(
                [
                  ["Naam", form.naam || "—"],
                  ["E-mail", form.email || "—"],
                  ["Geboortedatum", form.geboortedatum || "—"],
                  ["Functie", (functies ?? []).find((f) => f.id === form.functie_id)?.naam ?? "—"],
                  ["Werkmaatschappij", form.werkmaatschappij],
                  ["CAO", form.cao || "—"],
                  ["Dienstverband", form.dienstverband],
                  ["Contracturen/week", form.contracturen_per_week ? `${form.contracturen_per_week} uur` : "—"],
                  ["In dienst", form.in_dienst_sinds || "—"],
                  ["VCA geldig tot", cvExtra.vca_vervaldatum || "—"],
                  ["BHV geldig tot", cvExtra.bhv_vervaldatum || "—"],
                  ["EHBO geldig tot", cvExtra.ehbo_vervaldatum || "—"],
                  ["Rijbewijs", cvExtra.rijbewijs || "—"],
                  ["Verlofsoorten", form.verlofsoort_ids.length > 0 ? `${form.verlofsoort_ids.length} geselecteerd` : "Geen"],
                ] as [string, string][]
              ).map(([label, waarde]) => (
                <div key={label} className="flex justify-between py-1.5">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-right">{waarde}</span>
                </div>
              ))}
            </div>
          </div>
          {geselecteerdeMiddelen.length > 0 && (
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-sm font-semibold">Aan te vragen middelen</p>
              <div className="flex flex-wrap gap-1.5">
                {geselecteerdeMiddelen.map((id) => (
                  <Badge key={id} variant="secondary" className="text-xs font-normal">
                    {STANDAARD_MIDDELEN.find((m) => m.id === id)?.naam ?? id}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {Object.values(onboardingTaken).some(Boolean) && (
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-sm font-semibold">Onboardingplan</p>
              <div className="divide-y">
                {STANDAARD_ONBOARDING_TAKEN.filter((t) => onboardingTaken[t.id]).map((t) => {
                  const startdatum = form.in_dienst_sinds ? new Date(form.in_dienst_sinds) : new Date();
                  const standaardDatum = new Date(startdatum);
                  standaardDatum.setDate(standaardDatum.getDate() + t.deadlineDagen);
                  const deadline = onboardingDeadlines[t.id] ?? standaardDatum.toISOString().slice(0, 10);
                  return (
                    <div key={t.id} className="flex justify-between text-xs py-1.5">
                      <span>{t.taak}</span>
                      <span className="text-muted-foreground tabular-nums">{deadline}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {duplicaatNaam && (
            <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 px-2.5 py-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Mogelijke duplicaat: {duplicaatNaam}. Controleer of dit de juiste registratie is.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Document uploaden (alle stappen na stap 1) ── */}
      {huidigStap > 1 && medewerkerDraftId && (
        <div className="rounded-lg border border-dashed px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Document toevoegen</span>
            <span className="text-xs text-muted-foreground">(vult velden automatisch in)</span>
          </div>
          {!bestandUploadActief ? (
            <Button type="button" variant="outline" size="sm" className="text-xs h-7"
              onClick={() => setBestandUploadActief(true)}>
              Bestand kiezen
            </Button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <input ref={uploadRef} type="file" accept=".pdf,.doc,.docx,.txt" className="text-xs"
                onChange={async (e) => { const f = e.target.files?.[0]; if (f) await analyseerBestandUpload(f); }} />
              {bestandAnalyseLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs"
                onClick={() => { setBestandUploadActief(false); if (uploadRef.current) uploadRef.current.value = ""; }}>
                <X className="h-3 w-3 mr-1" /> Annuleren
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Inline AI-voorstellen (wizard) ── */}
      {openVoorstellen.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <span className="text-sm font-medium text-amber-800">{openVoorstellen.length} AI-voorstel{openVoorstellen.length > 1 ? "len" : ""} beschikbaar</span>
          </div>
          <div className="space-y-2">
            {openVoorstellen.slice(0, 3).map((v) => (
              <div key={v.id} className="rounded border border-amber-200 bg-amber-50/40 px-3 py-2 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className="text-xs font-mono">{v.veld}</Badge>
                    {v.vertrouwen_score != null && (
                      <span className="text-xs text-muted-foreground">{Math.round(v.vertrouwen_score * 100)}%</span>
                    )}
                  </div>
                  <div className="text-sm mt-0.5">{v.voorgestelde_waarde}</div>
                  {v.reden && <div className="text-xs text-muted-foreground">{v.reden}</div>}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" className="h-6 text-xs px-2 bg-green-600 hover:bg-green-700"
                    onClick={() => voorstelBeoordelen(v.id, "goedgekeurd")}
                    disabled={beoordeelVoorstel.isPending}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                    onClick={() => voorstelBeoordelen(v.id, "later")}
                    disabled={beoordeelVoorstel.isPending}>
                    Later
                  </Button>
                </div>
              </div>
            ))}
            {openVoorstellen.length > 3 && (
              <p className="text-xs text-muted-foreground">
                + {openVoorstellen.length - 3} meer voorstellen — bekijk ze na het opslaan in het medewerkerprofiel.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Navigatie ── */}
      <div className="flex items-center gap-3 pt-2">
        {huidigStap < TOTAAL_STAPPEN ? (
          <Button onClick={gaVolgende} disabled={huidigStap === 2 && (maak.isPending || slaVoortgangOp.isPending)}>
            {huidigStap === 2 && (maak.isPending || slaVoortgangOp.isPending) ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Opslaan...</>
            ) : (
              <>Volgende <ArrowRight className="h-4 w-4 ml-1.5" /></>
            )}
          </Button>
        ) : (
          <Button onClick={opslaan} disabled={maak.isPending || bijwerk.isPending || slaVoortgangOp.isPending}>
            {(maak.isPending || bijwerk.isPending || slaVoortgangOp.isPending) ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aanmaken...</>
            ) : (
              "Medewerker onboarden"
            )}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={gaVorige}>
          {huidigStap === 1 ? "Annuleren" : "Vorige"}
        </Button>
      </div>
    </div>
  );
}

// ─── Stap 2b: ZZP ─────────────────────────────────────────────────────────────

function ZzpFormulier({
  onTerug,
  onGereed,
  context,
}: {
  onTerug: () => void;
  onGereed: (id: number) => void;
  context: OnboardingContext;
}) {
  const [form, setForm] = useState<ZzpForm>(() => ({ ...LEEG_ZZP, naam: context.naam }));
  const { data: functies } = useListFuncties();
  const maak = useCreateMedewerker();
  const { toast } = useToast();

  async function opslaan() {
    if (!form.naam.trim()) { toast({ title: "Naam is verplicht", variant: "destructive" }); return; }
    if (!form.eind_datum) { toast({ title: "Einddatum is verplicht voor een ZZP-opdracht", variant: "destructive" }); return; }
    try {
      const input: MedewerkerInput = {
        naam: form.naam.trim(),
        gebruiker_id: context.gebruiker_id,
        functie_id: form.functie_id ?? undefined,
        werkmaatschappij: form.werkmaatschappij,
        dienstverband: "zzp",
        bedrijf_uitzendbureau: form.bedrijfsnaam.trim() || undefined,
        in_dienst_sinds: form.start_datum || undefined,
        uit_dienst_per: form.eind_datum || undefined,
      };
      const nieuw = await maak.mutateAsync({ data: input });
      onGereed(nieuw.id);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 409) {
        toast({
          title: "Al gekoppeld",
          description: "Dit gebruikersaccount heeft al een medewerkerprofiel.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Aanmaken mislukt", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onTerug}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">ZZP-er onboarden</h1>
          <p className="text-sm text-muted-foreground">Zelfstandige — na registratie direct een overeenkomst aanmaken</p>
        </div>
      </div>

      <div className="rounded-md border border-orange-200 bg-orange-50/50 px-4 py-3 text-sm text-orange-800 space-y-1">
        <p className="font-medium">ZZP — geen dienstbetrekking</p>
        <p className="text-xs text-orange-700">
          Na het registreren maakt u direct een overeenkomst van opdracht aan. Dit is verplicht conform de Wet DBA.
          Sla geen kosten in rekening vóór ondertekening van de overeenkomst.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Naam contactpersoon / ZZP-er *</Label>
          <Input value={form.naam} disabled readOnly />
          <p className="text-xs text-muted-foreground">Overgenomen van het gebruikersaccount — niet aanpasbaar tijdens onboarding.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Bedrijfsnaam *</Label>
          <Input placeholder="bijv. Jansen Installatietechniek" value={form.bedrijfsnaam} onChange={(e) => setForm({ ...form, bedrijfsnaam: e.target.value })} />
          <p className="text-xs text-muted-foreground">Handelsnaam zoals ingeschreven bij de Kamer van Koophandel.</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>KvK-nummer</Label>
            <Input placeholder="12345678" value={form.kvk} onChange={(e) => setForm({ ...form, kvk: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>BTW-nummer</Label>
            <Input placeholder="NL000000000B01" value={form.btw} onChange={(e) => setForm({ ...form, btw: e.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Vakgebied / functie</Label>
          <FunctieSelect
            functieId={form.functie_id}
            functies={functies ?? []}
            onChange={(id) => setForm({ ...form, functie_id: id })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Werkmaatschappij</Label>
          <Select value={form.werkmaatschappij} onValueChange={(v) => setForm({ ...form, werkmaatschappij: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WERKMAATSCHAPPIJEN.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Startdatum opdracht</Label>
            <Input type="date" value={form.start_datum} onChange={(e) => setForm({ ...form, start_datum: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Einddatum opdracht * <span className="text-muted-foreground text-xs">(verplicht)</span></Label>
            <Input type="date" value={form.eind_datum} onChange={(e) => setForm({ ...form, eind_datum: e.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Uurtarief (&euro;) <span className="text-muted-foreground text-xs">(optioneel — ook in overeenkomst vast te leggen)</span></Label>
          <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.uurtarief} onChange={(e) => setForm({ ...form, uurtarief: e.target.value })} />
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={opslaan} disabled={maak.isPending}>
          {maak.isPending ? "Aanmaken…" : "ZZP-er registreren"}
        </Button>
        <Button variant="outline" onClick={onTerug}>Terug</Button>
      </div>
    </div>
  );
}

// ─── Stap 2c: Uitzend / inhuur ────────────────────────────────────────────────

function UitzendFormulier({
  onTerug,
  onGereed,
  context,
}: {
  onTerug: () => void;
  onGereed: (id: number) => void;
  context: OnboardingContext;
}) {
  const [form, setForm] = useState<UitzendForm>(() => ({ ...LEEG_UITZEND, naam: context.naam }));
  const [soort, setSoort] = useState<"uitzend" | "inhuur">("uitzend");
  const [uitzendbureauId, setUitzendbureauId] = useState<number | null>(null);
  const { data: functies } = useListFuncties();
  const maak = useCreateMedewerker();
  const { toast } = useToast();

  async function opslaan() {
    if (!form.naam.trim()) { toast({ title: "Naam is verplicht", variant: "destructive" }); return; }
    if (!form.bureau_of_bedrijf.trim()) {
      toast({ title: soort === "uitzend" ? "Naam uitzendbureau is verplicht" : "Naam onderaannemer is verplicht", variant: "destructive" });
      return;
    }
    try {
      const input: MedewerkerInput = {
        naam: form.naam.trim(),
        gebruiker_id: context.gebruiker_id,
        functie_id: form.functie_id ?? undefined,
        werkmaatschappij: form.werkmaatschappij,
        dienstverband: soort,
        bedrijf_uitzendbureau: form.bureau_of_bedrijf.trim(),
        uitzendbureau_id: uitzendbureauId,
        in_dienst_sinds: form.start_datum || undefined,
        uit_dienst_per: form.eind_datum || undefined,
        opmerkingen: form.opmerkingen.trim() || undefined,
      };
      const nieuw = await maak.mutateAsync({ data: input });
      onGereed(nieuw.id);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 409) {
        toast({
          title: "Al gekoppeld",
          description: "Dit gebruikersaccount heeft al een medewerkerprofiel.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Aanmaken mislukt", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onTerug}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Uitzendkracht / Inhuur</h1>
          <p className="text-sm text-muted-foreground">Ingeleend via uitzendbureau of onderaannemer</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Type inhuur</Label>
          <div className="flex gap-3">
            {[
              { v: "uitzend" as const, label: "Uitzendkracht" },
              { v: "inhuur" as const, label: "Inhuur / onderaannemer" },
            ].map(({ v, label }) => (
              <button
                key={v}
                type="button"
                onClick={() => setSoort(v)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${soort === v ? "border-primary bg-primary/5 font-medium" : "border-input hover:bg-muted/40"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-1.5">
          <Label>Naam medewerker *</Label>
          <Input value={form.naam} disabled readOnly />
          <p className="text-xs text-muted-foreground">Overgenomen van het gebruikersaccount — niet aanpasbaar tijdens onboarding.</p>
        </div>

        <UitzendbureauSelect
          idPrefix="onb-uitzendbureau"
          label={soort === "uitzend" ? "Uitzendbureau *" : "Onderaannemer / bedrijf *"}
          uitzendbureauId={uitzendbureauId}
          tekst={form.bureau_of_bedrijf}
          onChange={({ uitzendbureau_id, tekst }) => {
            setUitzendbureauId(uitzendbureau_id);
            setForm({ ...form, bureau_of_bedrijf: tekst });
          }}
        />

        <div className="space-y-1.5">
          <Label>Vakgebied / functie</Label>
          <FunctieSelect
            functieId={form.functie_id}
            functies={functies ?? []}
            onChange={(id) => setForm({ ...form, functie_id: id })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Werkmaatschappij</Label>
          <Select value={form.werkmaatschappij} onValueChange={(v) => setForm({ ...form, werkmaatschappij: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {WERKMAATSCHAPPIJEN.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Startdatum</Label>
            <Input type="date" value={form.start_datum} onChange={(e) => setForm({ ...form, start_datum: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Einddatum <span className="text-muted-foreground text-xs">(aanbevolen)</span></Label>
            <Input type="date" value={form.eind_datum} onChange={(e) => setForm({ ...form, eind_datum: e.target.value })} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Opmerkingen <span className="text-muted-foreground text-xs">(bijv. contactpersoon bureau)</span></Label>
          <Input
            placeholder={soort === "uitzend" ? "bijv. Contactpersoon: Jan de Vries, 06-12345678" : "bijv. Onderdeel van project 2025-042"}
            value={form.opmerkingen}
            onChange={(e) => setForm({ ...form, opmerkingen: e.target.value })}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button onClick={opslaan} disabled={maak.isPending}>
          {maak.isPending ? "Aanmaken…" : `${soort === "uitzend" ? "Uitzendkracht" : "Inhuurkracht"} registreren`}
        </Button>
        <Button variant="outline" onClick={onTerug}>Terug</Button>
      </div>
    </div>
  );
}

// ─── Stap 3: Succes ───────────────────────────────────────────────────────────

function Succes({ stroom, medewerkerId, onNogEen }: { stroom: Stroom; medewerkerId: number; onNogEen: () => void }) {
  const [, navigate] = useLocation();

  const SUCCES_INHOUD: Record<Stroom, { titel: string; tekst: string; cta: string; ctaHref: string; ctaLabel: string }> = {
    vast: {
      titel: "Medewerker geregistreerd",
      tekst: "Het profiel is aangemaakt en gekoppeld aan het bestaande gebruikersaccount. App-toegang en rechten beheert u via Gebruikers.",
      cta: `/personeel/${medewerkerId}`,
      ctaLabel: "Profiel bekijken",
      ctaHref: `/personeel/${medewerkerId}`,
    },
    zzp: {
      titel: "ZZP-er geregistreerd",
      tekst: "De ZZP-er staat in het systeem. Maak nu direct een overeenkomst van opdracht aan — dit is verplicht conform de Wet DBA. Facturen worden alleen goedgekeurd met een ondertekende overeenkomst.",
      cta: "/personeel/externen",
      ctaLabel: "Overeenkomst aanmaken",
      ctaHref: "/personeel/externen",
    },
    uitzend: {
      titel: "Uitzendkracht geregistreerd",
      tekst: "De medewerker staat in het systeem en is zichtbaar onder Externen / ZZP. Voeg daar eventueel projectkoppelingen en bijlagen toe.",
      cta: `/personeel/${medewerkerId}`,
      ctaLabel: "Profiel bekijken",
      ctaHref: `/personeel/${medewerkerId}`,
    },
    stagiair: {
      titel: "Stagiair geregistreerd",
      tekst: "De stagiair staat in het systeem. Wijs een begeleider toe en bewaar de stageovereenkomst als document in het profiel.",
      cta: `/personeel/${medewerkerId}`,
      ctaLabel: "Profiel bekijken",
      ctaHref: `/personeel/${medewerkerId}`,
    },
    oproep: {
      titel: "Oproepkracht geregistreerd",
      tekst: "De oproepkracht staat in het systeem. Controleer het oproepcontract en sla het op als document.",
      cta: `/personeel/${medewerkerId}`,
      ctaLabel: "Profiel bekijken",
      ctaHref: `/personeel/${medewerkerId}`,
    },
    payroll: {
      titel: "Payroll-medewerker geregistreerd",
      tekst: "De medewerker staat in het systeem. Koppel de bevestiging van het payrollbedrijf als document.",
      cta: `/personeel/${medewerkerId}`,
      ctaLabel: "Profiel bekijken",
      ctaHref: `/personeel/${medewerkerId}`,
    },
    detachering: {
      titel: "Gedetacheerde geregistreerd",
      tekst: "De gedetacheerde staat in het systeem. Bewaar de detacheringsovereenkomst als document.",
      cta: `/personeel/${medewerkerId}`,
      ctaLabel: "Profiel bekijken",
      ctaHref: `/personeel/${medewerkerId}`,
    },
    directie: {
      titel: "Directeur / bestuurder geregistreerd",
      tekst: "Het profiel is aangemaakt. Leg de arbeidsovereenkomst of managementovereenkomst vast als document.",
      cta: `/personeel/${medewerkerId}`,
      ctaLabel: "Profiel bekijken",
      ctaHref: `/personeel/${medewerkerId}`,
    },
  };

  const inhoud = SUCCES_INHOUD[stroom];

  return (
    <div className="space-y-6 max-w-md">
      <div className="flex items-center gap-3 text-green-700">
        <CheckCircle2 className="h-8 w-8 shrink-0" />
        <h1 className="text-xl font-bold">{inhoud.titel}</h1>
      </div>

      <p className="text-muted-foreground">{inhoud.tekst}</p>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => navigate(inhoud.ctaHref)} className="gap-1.5">
          {inhoud.ctaLabel} <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" onClick={onNogEen} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" /> Nog iemand onboarden
        </Button>
      </div>

      {stroom === "vast" && (
        <div className="rounded-md border border-blue-200 bg-blue-50/50 px-4 py-3 text-xs text-blue-800 space-y-2">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 shrink-0" />
            <p className="font-medium">Salarismutatie klaargezet</p>
          </div>
          <p>Er is automatisch een concept-salarismutatie &ldquo;Verloning nieuwe medewerker&rdquo; aangemaakt voor de salarisverwerker. Controleer en bevestig deze vóór de eerstvolgende loonperiode.</p>
          <Button size="sm" variant="outline" onClick={() => navigate("/salaris-mutaties")} className="gap-1.5 mt-1">
            Naar Salarismutaties <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      )}

      {stroom === "zzp" && (
        <div className="rounded-md border border-amber-200 bg-amber-50/50 px-4 py-3 text-xs text-amber-800 space-y-1">
          <p className="font-medium">Herinnering — ZZP Wet DBA checklist</p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Overeenkomst van opdracht getekend vóór aanvang werkzaamheden</li>
            <li>KvK- en BTW-nummer vastgelegd</li>
            <li>Einddatum én specifieke werkzaamheden omschreven (geen gezagsverhouding)</li>
            <li>Facturen controleren op geldige BTW-vermelding</li>
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Hoofdcomponent ───────────────────────────────────────────────────────────

export default function OnboardenPagina() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const zoekString = useSearch();
  const [stroom, setStroom] = useState<Stroom | null>(null);
  const [resumeId, setResumeId] = useState<number | null>(null);
  const [afrondMedewerkerId, setAfrondMedewerkerId] = useState<number | null>(null);
  const [cvStash, setCvStash] = useState<CvOnboardingStash | null>(null);
  const stashGelezen = useRef(false);

  const userIdParam = new URLSearchParams(zoekString).get("userId");
  const userId = userIdParam !== null && /^\d+$/.test(userIdParam.trim()) ? Number(userIdParam.trim()) : null;
  const userIdOngeldig = userIdParam !== null && userId === null;

  // Zonder userId is onboarding niet bereikbaar: terug naar de medewerkerslijst.
  useEffect(() => {
    if (userIdParam === null) {
      navigate("/personeel?tab=medewerkers", { replace: true });
    }
  }, [userIdParam, navigate]);

  const contextQuery = useGetOnboardingContext(userId ?? 0, {
    query: {
      enabled: userId !== null,
      retry: false,
      queryKey: getGetOnboardingContextQueryKey(userId ?? 0),
    },
  });
  const context = contextQuery.data as OnboardingContext | undefined;

  // CV-voorstel eenmalig uit sessionStorage lezen (wist bij lezen).
  // Ref-guard voorkomt dubbel lezen bij React StrictMode remount.
  useEffect(() => {
    if (stashGelezen.current) return;
    stashGelezen.current = true;
    const stash = leesEnWisCvOnboarding();
    if (stash) setCvStash(stash);
  }, []);

  async function gereed(id: number) {
    setAfrondMedewerkerId(id);
    await queryClient.invalidateQueries({ queryKey: getListMedewerkersQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
  }

  if (userIdParam === null) {
    return null;
  }

  const foutStatus =
    contextQuery.error && typeof contextQuery.error === "object" && "status" in contextQuery.error
      ? (contextQuery.error as { status: number }).status
      : null;

  if (userIdOngeldig || foutStatus === 404) {
    return (
      <div className="space-y-4 max-w-md">
        <div className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="h-6 w-6 shrink-0" />
          <h1 className="text-xl font-bold">Gebruiker niet gevonden</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Er bestaat geen gebruikersaccount met dit ID. Onboarding start altijd vanuit een bestaand
          account via de medewerkerslijst.
        </p>
        <Button onClick={() => navigate("/personeel?tab=medewerkers")}>Naar medewerkerslijst</Button>
      </div>
    );
  }

  if (foutStatus === 409) {
    return (
      <div className="space-y-4 max-w-md">
        <div className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="h-6 w-6 shrink-0" />
          <h1 className="text-xl font-bold">Al gekoppeld</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Dit gebruikersaccount heeft al een medewerkerprofiel. Een tweede onboarding is niet mogelijk.
        </p>
        <Button onClick={() => navigate("/personeel?tab=medewerkers")}>Naar medewerkerslijst</Button>
      </div>
    );
  }

  if (contextQuery.isLoading || !context) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-12">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Gegevens laden…</span>
      </div>
    );
  }

  if (afrondMedewerkerId !== null && stroom !== null) {
    return (
      <Succes
        stroom={stroom}
        medewerkerId={afrondMedewerkerId}
        onNogEen={() => navigate("/personeel?tab=medewerkers")}
      />
    );
  }

  if (stroom === null) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border p-3 max-w-3xl">
          <p className="text-sm">
            Onboarding voor <span className="font-semibold">{context.naam}</span>
            {context.email ? <span className="text-muted-foreground"> — {context.email}</span> : null}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Naam, e-mail en telefoon worden overgenomen van het gebruikersaccount en zijn tijdens de
            onboarding niet aanpasbaar.
          </p>
        </div>
        {cvStash && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 max-w-3xl">
            <Sparkles className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              <span className="font-semibold">CV geladen:</span> {cvStash.bestandsnaam} — kies
              hieronder het type indiensttreding; het formulier wordt vooraf ingevuld met het
              AI-voorstel. U controleert en bevestigt alles zelf.
            </p>
          </div>
        )}
        {context.concept_medewerker_id != null && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-3 space-y-2 max-w-3xl">
            <p className="text-xs font-medium text-blue-800">Lopende onboarding</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm">
                Er staat nog een onvoltooide onboarding klaar voor {context.naam}.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs shrink-0"
                onClick={() => { setResumeId(context.concept_medewerker_id ?? null); setStroom("vast"); }}
              >
                Hervatten
              </Button>
            </div>
          </div>
        )}
        <TypeKiezer onKies={setStroom} />
      </div>
    );
  }

  if (stroom === "vast") {
    return (
      <VastFormulier
        onTerug={() => { setStroom(null); setResumeId(null); }}
        onGereed={gereed}
        cvStash={cvStash}
        onWisCv={() => setCvStash(null)}
        resumeId={resumeId}
        context={context}
      />
    );
  }
  if (stroom === "zzp") {
    return (
      <ZzpFormulier
        onTerug={() => setStroom(null)}
        onGereed={gereed}
        context={context}
      />
    );
  }
  if (stroom === "uitzend") {
    return (
      <UitzendFormulier
        onTerug={() => setStroom(null)}
        onGereed={gereed}
        context={context}
      />
    );
  }
  if (stroom === "stagiair" || stroom === "oproep" || stroom === "payroll" || stroom === "detachering" || stroom === "directie") {
    return (
      <GeneriekeWizard
        soort={stroom}
        onTerug={() => setStroom(null)}
        onGereed={gereed}
        context={context}
      />
    );
  }
  return null;
}
