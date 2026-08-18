import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMedewerker,
  useUpdateMedewerker,
  useDeleteMedewerker,
  useListFuncties,
  useListCaoOpties,
  useListMedewerkers,
  useListToewijsbareGebruikers,
  useListOpleidingen,
  useListMedewerkerOpleidingen,
  useCreateMedewerkerOpleiding,
  useUpdateMedewerkerOpleiding,
  useDeleteMedewerkerOpleiding,
  useListBekwaamheden,
  useCreateBekwaamheid,
  useUpdateBekwaamheid,
  useDeleteBekwaamheid,
  useListVerlofsoorten,
  useListVerlofSaldi,
  useListVerlofAanvragen,
  useCreateVerlofAanvraag,
  useUpdateVerlofAanvraag,
  getGetMedewerkerQueryKey,
  getListMedewerkersQueryKey,
  getListMedewerkerOpleidingenQueryKey,
  getListBekwaamhedenQueryKey,
  getListAlleBekwaamhedenQueryKey,
  getListVerlofSaldiQueryKey,
  getListVerlofAanvragenQueryKey,
  getListAlleVerlofAanvragenQueryKey,
  getGetHrmStatsQueryKey,
  useGetMedewerkerAchievements,
  useGetSalarisarchiefDocumenten,
  useListMedewerkerDocumenten,
  getListMedewerkerDocumentenQueryKey,
  useListMedewerkerAanstellingen,
  useCreateMedewerkerAanstelling,
  useUpdateMedewerkerAanstelling,
  useDeleteMedewerkerAanstelling,
  useSetHoofdAanstelling,
  getListMedewerkerAanstellingenQueryKey,
  getGetGoedkeuringVoorObjectQueryKey,
  useListCaoKeuzes,
  useCreateCaoKeuze,
  useUpdateCaoKeuze,
  useDeleteCaoKeuze,
  getListCaoKeuzesQueryKey,
  useListAiVoorstellen,
  usePatchAiVoorstel,
  useAiVeldCorrectie,
  useHeranalyseerDossier,
  useListHrmMiddelen,
  useCreateHrmMiddel,
  usePatchHrmMiddel,
  useDeleteHrmMiddel,
  useListOnboardingTaken,
  useCreateOnboardingTaak,
  usePatchOnboardingTaak,
  useDeleteOnboardingTaak,
  getListAiVoorstellenQueryKey,
  getListHrmMiddelenQueryKey,
  getListOnboardingTakenQueryKey,
} from "@workspace/api-client-react";
import type {
  MedewerkerInput,
  Bekwaamheid,
  BekwaamheidInput,
  MedewerkerOpleiding,
  MedewerkerOpleidingInput,
  VerlofAanvraag,
  VerlofAanvraagInput,
  MedewerkerDocument,
  MedewerkerAanstelling,
  MedewerkerAanstellingInput,
  MedewerkerCaoKeuze,
  MedewerkerCaoKeuzeInput,
} from "@workspace/api-client-react";
import { useRol } from "@/context/rol-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { UitzendbureauSelect } from "@/components/uitzendbureau-select";
import { Badge } from "@/components/ui/badge";
import { ImportBadge } from "@/components/import-badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useWerkmaatschappijen } from "@/lib/werkmaatschappijen";
import { GoedkeuringWidget } from "@/components/goedkeuring/goedkeuring-widget";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { AiVoorstelKaart } from "@/components/hrm/ai-voorstel-kaart";
import { useToast } from "@/hooks/use-toast";
import { MedewerkerContractenTab } from "@/pages/personeel/medewerker-contracten";
import {
  ArrowLeft, Pencil, Trash2, Plus, GraduationCap, Award, CalendarClock,
  Mail, Phone, Briefcase, ShieldCheck, AlertTriangle, Check, X,
  MapPin, Car, FileText, Cake, Trophy, Upload, Download, FolderOpen,
  Building2, Star, Sparkles, CheckCircle2, Smartphone, Copy,
} from "lucide-react";

// ── Kritieke datums blok ──────────────────────────────────────────────────────
// Toont per medewerker alle kritieke tijdsdrukpunten uit de contract-bewaking:
// einddatum contract, uiterste aanzegdatum, proeftijd, ketenregel, ZZP/DBA,
// inleen-einddatum. Gegevens komen rechtstreeks uit het bestaande endpoint —
// geen nieuwe client-side berekeningen.

type KritiekeDatumsData = {
  contract_eind: { datum: string; dagen_tot: number; contracttype: string; ernst: string } | null;
  aanzeg_datum: { datum: string; dagen_tot: number; reden: string; ernst: string } | null;
  proeftijd_einde: { datum: string; dagen_tot: number } | null;
  ketenregel: string | null;
  zzp: {
    datum: string; dagen_tot: number; dba_risico: boolean;
    verband_maanden: number; label: string; reden: string; ernst: string;
  } | null;
  inleen: { datum: string; dagen_tot: number; dienstverband: string | null } | null;
};

function KritiekeDatumsBlok({ medewerkerId, tonen }: { medewerkerId: number; tonen: boolean }) {
  const [data, setData] = useState<KritiekeDatumsData | null>(null);

  useEffect(() => {
    if (!tonen) return;
    let annuleer = false;
    fetch(`/api/contract-bewaking/medewerkers/${medewerkerId}/kritieke-datums`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => { if (!annuleer) setData(d as KritiekeDatumsData | null); })
      .catch(() => {});
    return () => { annuleer = true; };
  }, [medewerkerId, tonen]);

  if (!tonen || !data) return null;

  const heeftItems =
    data.contract_eind || data.aanzeg_datum || data.proeftijd_einde ||
    data.ketenregel || data.zzp || data.inleen;
  if (!heeftItems) return null;

  function dagLabel(d: number): string {
    if (d < 0) return `${Math.abs(d)} dag${Math.abs(d) === 1 ? "" : "en"} geleden verlopen`;
    if (d === 0) return "vandaag";
    return `nog ${d} dag${d === 1 ? "" : "en"}`;
  }

  function fmtD(iso: string): string {
    return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
  }

  function ernstKlassen(ernst: string): string {
    if (ernst === "kritiek") return "border-red-300 bg-red-50 text-red-800";
    if (ernst === "waarschuwing") return "border-orange-200 bg-orange-50 text-orange-800";
    return "border-blue-200 bg-blue-50 text-blue-800";
  }

  function ErnstIcoon({ ernst }: { ernst: string }) {
    if (ernst === "kritiek") return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-600" />;
    if (ernst === "waarschuwing") return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-orange-500" />;
    return <CalendarClock className="h-3.5 w-3.5 shrink-0 text-blue-500" />;
  }

  const CT_LABELS: Record<string, string> = {
    bepaalde_tijd: "Bepaalde tijd", onbepaalde_tijd: "Onbepaalde tijd",
    oproep: "Oproepcontract", stage: "Stage", leer_werk: "Leer-werk",
  };

  function proeftijdErnst(d: number): string {
    return d < 0 ? "kritiek" : d <= 7 ? "waarschuwing" : "info";
  }
  function inleenErnst(d: number): string {
    return d < 0 ? "kritiek" : d <= 30 ? "kritiek" : d <= 60 ? "waarschuwing" : "info";
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-1.5 mb-3">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Kritieke datums</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data.contract_eind && (
            <div className={`rounded-md border p-2.5 text-xs ${ernstKlassen(data.contract_eind.ernst)}`}>
              <div className="flex items-start gap-1.5">
                <ErnstIcoon ernst={data.contract_eind.ernst} />
                <div className="min-w-0">
                  <div className="font-medium">{CT_LABELS[data.contract_eind.contracttype] ?? data.contract_eind.contracttype} eindigt</div>
                  <div>{fmtD(data.contract_eind.datum)}</div>
                  <div className="text-[11px] opacity-75">{dagLabel(data.contract_eind.dagen_tot)}</div>
                </div>
              </div>
            </div>
          )}
          {data.aanzeg_datum && (
            <div className={`rounded-md border p-2.5 text-xs ${ernstKlassen(data.aanzeg_datum.ernst)}`}>
              <div className="flex items-start gap-1.5">
                <ErnstIcoon ernst={data.aanzeg_datum.ernst} />
                <div className="min-w-0">
                  <div className="font-medium">Uiterste aanzegdatum</div>
                  <div>{fmtD(data.aanzeg_datum.datum)}</div>
                  <div className="text-[11px] opacity-75">{dagLabel(data.aanzeg_datum.dagen_tot)}</div>
                </div>
              </div>
            </div>
          )}
          {data.proeftijd_einde && (
            <div className={`rounded-md border p-2.5 text-xs ${ernstKlassen(proeftijdErnst(data.proeftijd_einde.dagen_tot))}`}>
              <div className="flex items-start gap-1.5">
                <ErnstIcoon ernst={proeftijdErnst(data.proeftijd_einde.dagen_tot)} />
                <div className="min-w-0">
                  <div className="font-medium">Proeftijd afloopt</div>
                  <div>{fmtD(data.proeftijd_einde.datum)}</div>
                  <div className="text-[11px] opacity-75">{dagLabel(data.proeftijd_einde.dagen_tot)}</div>
                </div>
              </div>
            </div>
          )}
          {data.ketenregel && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 sm:col-span-2 lg:col-span-3">
              <div className="flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <div className="font-medium">Ketenregeling</div>
                  <div className="text-[11px] opacity-90 mt-0.5">{data.ketenregel}</div>
                </div>
              </div>
            </div>
          )}
          {data.zzp && (
            <div className={`rounded-md border p-2.5 text-xs ${ernstKlassen(data.zzp.ernst)}`}>
              <div className="flex items-start gap-1.5">
                <ErnstIcoon ernst={data.zzp.ernst} />
                <div className="min-w-0">
                  <div className="font-medium">{data.zzp.label}</div>
                  <div>{fmtD(data.zzp.datum)}</div>
                  {data.zzp.dba_risico && (
                    <div className="text-[11px] opacity-75">{data.zzp.verband_maanden} mnd verband (grens 9 mnd)</div>
                  )}
                  <div className="text-[11px] opacity-75">{dagLabel(data.zzp.dagen_tot)}</div>
                </div>
              </div>
            </div>
          )}
          {data.inleen && (
            <div className={`rounded-md border p-2.5 text-xs ${ernstKlassen(inleenErnst(data.inleen.dagen_tot))}`}>
              <div className="flex items-start gap-1.5">
                <ErnstIcoon ernst={inleenErnst(data.inleen.dagen_tot)} />
                <div className="min-w-0">
                  <div className="font-medium">Inleen-/inhuurperiode eindigt</div>
                  <div>{fmtD(data.inleen.datum)}</div>
                  <div className="text-[11px] opacity-75">{dagLabel(data.inleen.dagen_tot)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Kopieerbare download-link voor de telefoonapp (publieke installatiepagina /app).
// Op elke medewerkerkaart zichtbaar zodat iedereen de link kan doorgeven.
function AppDownloadLink() {
  const { toast } = useToast();
  const basis = import.meta.env.BASE_URL.replace(/\/$/, "");
  const link = `${window.location.origin}${basis}/app`;
  async function kopieer() {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Download-link gekopieerd", description: link });
    } catch {
      // Fallback (bv. geen clipboard-permissie): selecteerbare prompt
      window.prompt("Kopieer de download-link:", link);
    }
  }
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Smartphone className="h-3.5 w-3.5" /> Telefoonapp
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <a href={link} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline truncate" title={link}>
          {link.replace(/^https?:\/\//, "")}
        </a>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs shrink-0"
          onClick={kopieer}
          title="Download-link kopiëren"
        >
          <Copy className="h-3 w-3 mr-1" />
          Kopieer
        </Button>
      </div>
    </div>
  );
}

const NIVEAUS = [
  { waarde: "niet_bevoegd", label: "Niet bevoegd" },
  { waarde: "onder_begeleiding", label: "Onder begeleiding" },
  { waarde: "zelfstandig", label: "Zelfstandig" },
  { waarde: "specialist", label: "Specialist" },
  { waarde: "trainer", label: "Trainer / instructeur" },
] as const;

const OPLEIDING_STATUSSEN = ["gepland", "behaald", "verlopen", "vrijgesteld"] as const;
const DIENSTVERBANDEN = ["vast", "tijdelijk", "oproep", "stage", "inhuur", "zzp", "uitzend"] as const;

// Gerichte AI-contractextractie: veldvorm zoals /ai-contract-analyse die teruggeeft.
interface ContractAiVeld {
  waarde: string | number | null;
  vindplaats: { pagina: number | null; citaat: string } | null;
}
const CONTRACT_AI_VELD_LABELS: Array<[string, string]> = [
  ["werkmaatschappij", "Werkmaatschappij"],
  ["werknemer_naam", "Naam werknemer"],
  ["functie", "Functie"],
  ["datum_in_dienst", "Datum in dienst"],
  ["contract_type", "Contracttype"],
  ["einddatum", "Einddatum"],
  ["proeftijd", "Proeftijd"],
  ["uren_per_week", "Uren per week"],
  ["uren_min_per_week", "Uren per week (min)"],
  ["uren_max_per_week", "Uren per week (max)"],
  ["salaris", "Salaris"],
  ["salaris_eenheid", "Salariseenheid"],
  ["cao", "CAO"],
  ["opzegtermijn", "Opzegtermijn"],
  ["aanzegtermijn", "Aanzegtermijn"],
  ["reiskostenvergoeding", "Reiskostenvergoeding"],
  ["concurrentiebeding", "Concurrentiebeding"],
  ["relatiebeding", "Relatiebeding"],
];
const DIENSTVERBAND_LABELS: Record<string, string> = {
  vast: "Vaste medewerker",
  tijdelijk: "Tijdelijk contract",
  oproep: "Oproepkracht",
  stage: "Stagiair",
  inhuur: "Inhuur / onderaannemer",
  zzp: "ZZP-er",
  uitzend: "Uitzendkracht",
};
const VERLOF_STATUS_LABEL: Record<string, string> = {
  aangevraagd: "Aangevraagd",
  goedgekeurd: "Goedgekeurd",
  afgewezen: "Afgewezen",
  ingetrokken: "Ingetrokken",
};

function niveauLabel(n: string) {
  return NIVEAUS.find((x) => x.waarde === n)?.label ?? n;
}

function niveauBadgeClass(n: string) {
  if (n === "niet_bevoegd" || n === "onder_begeleiding") return "border-amber-200 text-amber-700";
  return "";
}

function dagenTot(datum?: string | null): number | null {
  if (!datum) return null;
  const d = new Date(datum);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

function fmtDatum(datum?: string | null) {
  if (!datum) return "—";
  const d = new Date(datum);
  if (Number.isNaN(d.getTime())) return datum;
  return d.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
}

function certBadge(datum: string) {
  const nu = Date.now();
  const t = new Date(datum).getTime();
  const over60d = nu + 60 * 24 * 60 * 60 * 1000;
  const klasse = t < nu ? "text-red-600 font-medium" : t <= over60d ? "text-orange-600 font-medium" : "text-green-700";
  const label = t < nu ? "Verlopen" : t <= over60d ? "Verloopt binnenkort" : "Geldig";
  return (
    <span className={klasse}>
      {fmtDatum(datum)} <span className="text-xs font-normal opacity-80">({label})</span>
    </span>
  );
}

function uren(n?: number | null) {
  return `${(n ?? 0).toLocaleString("nl-NL", { maximumFractionDigits: 1 })} uur`;
}

function achievementKleurDetail(beloning: string | null | undefined): string {
  if (!beloning) return "#6b7280";
  if (beloning.includes("Legende")) return "#F23B0D";
  if (beloning.includes("Diamanten")) return "#4FC3F7";
  if (beloning.includes("Kristallen")) return "#00CED1";
  if (beloning.includes("Gouden")) return "#FFD700";
  if (beloning.includes("Zilveren")) return "#C0C0C0";
  if (beloning.includes("Bronzen")) return "#CD7F32";
  if (beloning.includes("Speciale")) return "#9B59B6";
  return "#6b7280";
}

function PrestatieSectie({ medewerkerId }: { medewerkerId: number }) {
  const { data, isLoading } = useGetMedewerkerAchievements(medewerkerId);

  if (isLoading) {
    return (
      <div className="space-y-3 pt-4">
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const prevMijlpaal =
    data.achievements.length > 0
      ? data.achievements[data.achievements.length - 1].spots_mijlpaal
      : 0;
  const progress = data.volgende_mijlpaal
    ? Math.min(
        100,
        ((data.totaal_spots - prevMijlpaal) /
          (data.volgende_mijlpaal - prevMijlpaal)) *
          100,
      )
    : 100;
  const kleur = achievementKleurDetail(data.huidige_beloning);

  return (
    <div className="space-y-4 pt-4">
      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: `${kleur}22`, border: `2px solid ${kleur}` }}
            >
              <Trophy className="h-6 w-6" style={{ color: kleur }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">Huidige rang</p>
              <p className="text-lg font-semibold" style={{ color: kleur }}>
                {data.huidige_rang ?? "Nog geen rang"}
              </p>
              {data.huidige_beloning && (
                <p className="text-xs text-muted-foreground">{data.huidige_beloning}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums">
                {data.totaal_spots.toLocaleString("nl-NL")}
              </p>
              <p className="text-xs text-muted-foreground">Spots geplaatst</p>
            </div>
          </div>

          {data.volgende_rang && data.volgende_mijlpaal && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Voortgang naar {data.volgende_rang}</span>
                <span>
                  {data.totaal_spots.toLocaleString("nl-NL")} /{" "}
                  {data.volgende_mijlpaal.toLocaleString("nl-NL")}
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${progress}%`, background: kleur }}
                />
              </div>
            </div>
          )}

          {!data.volgende_rang && data.achievements.length > 0 && (
            <p className="text-sm text-center font-medium" style={{ color: kleur }}>
              Maximale rang bereikt
            </p>
          )}
        </CardContent>
      </Card>

      {data.achievements.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          <Award className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nog geen prestaties behaald.</p>
          <p className="text-xs mt-1">De eerste rang wordt bereikt bij 50 Spots.</p>
        </div>
      )}

      {data.achievements.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-3">Behaalde rangen</p>
          <div className="grid grid-cols-2 gap-3">
            {data.achievements.map((a) => {
              const aKleur = achievementKleurDetail(a.beloning);
              return (
                <div
                  key={a.id}
                  className="rounded-lg p-3 border"
                  style={{ borderColor: `${aKleur}55`, background: `${aKleur}0d` }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Award className="h-4 w-4 flex-shrink-0" style={{ color: aKleur }} />
                    <span className="text-xs font-semibold" style={{ color: aKleur }}>
                      {a.rang}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.spots_mijlpaal.toLocaleString("nl-NL")} Spots
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(a.behaald_op).toLocaleDateString("nl-NL")}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  identiteitsbewijs: "Identiteitsbewijs",
  paspoort: "Paspoort",
  verblijfsvergunning: "Verblijfsvergunning",
  rijbewijs: "Rijbewijs",
  contract: "Arbeidscontract",
  functiebeschrijving: "Functiebeschrijving",
  aow_verklaring: "AOW-verklaring",
  vca_certificaat: "VCA-certificaat",
  bhv_certificaat: "BHV-certificaat",
  ehbo_certificaat: "EHBO-certificaat",
  diploma: "Diploma",
  loonstrook: "Loonstrook",
  cv: "CV",
  naw_formulier: "NAW-formulier",
  geheimhoudingsverklaring: "Geheimhoudingsverklaring",
  overig: "Overig",
};

const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_LABELS);

// Legacy/alias-typen uit de backend mappen op het canonieke dossiertype,
// zodat ze onder het juiste kopje vallen i.p.v. onder "Overig".
const DOCUMENT_TYPE_ALIASSEN: Record<string, string> = {
  arbeidscontract: "contract",
  id_bewijs: "identiteitsbewijs",
  rijbewijs_scan: "rijbewijs",
};
const normaliseerDocType = (t: string) => DOCUMENT_TYPE_ALIASSEN[t] ?? t;

// Types waarvoor een verloopdatum relevant is
const TYPES_MET_VERLOOPDATUM = new Set([
  "identiteitsbewijs", "paspoort", "verblijfsvergunning", "rijbewijs",
  "vca_certificaat", "bhv_certificaat", "ehbo_certificaat", "diploma",
]);

// Verplichte en aanbevolen documenten voor de volledigheidscheck
const VERPLICHTE_DOCS: { types: string[]; label: string }[] = [
  { types: ["identiteitsbewijs", "paspoort", "verblijfsvergunning"], label: "ID-bewijs / Paspoort" },
  { types: ["contract", "arbeidscontract"], label: "Arbeidscontract" },
];
const AANBEVOLEN_DOCS: { types: string[]; label: string }[] = [
  { types: ["cv"], label: "CV" },
  { types: ["vca_certificaat"], label: "VCA" },
  { types: ["bhv_certificaat"], label: "BHV" },
  { types: ["ehbo_certificaat"], label: "EHBO" },
  { types: ["rijbewijs"], label: "Rijbewijs" },
];

function DocumentenTab({
  medewerkerId,
  magBewerken,
  medewerkerNaw,
}: {
  medewerkerId: number;
  magBewerken: boolean;
  medewerkerNaw?: {
    naam: string;
    email?: string | null;
    telefoon?: string | null;
    mobiel?: string | null;
    adres?: string | null;
    woonplaats?: string | null;
  };
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadBezig, setUploadBezig] = useState(false);
  const [heranalyseBezig, setHeranalyseBezig] = useState(false);
  const [uploadType, setUploadType] = useState("overig");
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadVerloopdatum, setUploadVerloopdatum] = useState("");
  const [uploadDialoogOpen, setUploadDialoogOpen] = useState(false);
  const [geselecteerdBestand, setGeselecteerdBestand] = useState<File | null>(null);

  const { data: docs = [], isLoading } = useListMedewerkerDocumenten(medewerkerId, {
    query: { queryKey: getListMedewerkerDocumentenQueryKey(medewerkerId) },
  });

  async function heranalyseren() {
    setHeranalyseBezig(true);
    try {
      const resp = await fetch(`/api/medewerkers/${medewerkerId}/documenten/heranalyse`, { method: "POST" });
      if (!resp.ok) throw new Error(await resp.text());
      const r = (await resp.json()) as { geanalyseerd: number; hernoemd: number; mislukt: number };
      await queryClient.invalidateQueries({ queryKey: getListMedewerkerDocumentenQueryKey(medewerkerId) });
      toast({
        title: r.hernoemd > 0 ? `${r.hernoemd} document${r.hernoemd === 1 ? "" : "en"} benoemd` : "Geen documenten hernoemd",
        description: r.mislukt > 0
          ? `${r.mislukt} document${r.mislukt === 1 ? "" : "en"} kon${r.mislukt === 1 ? "" : "den"} niet geanalyseerd worden.`
          : r.hernoemd === 0
            ? "De AI herkende geen bekend documenttype; kies het type handmatig."
            : undefined,
      });
    } catch {
      toast({ title: "Automatisch benoemen mislukt", variant: "destructive" });
    } finally {
      setHeranalyseBezig(false);
    }
  }

  function bestandGekozen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setGeselecteerdBestand(f);
    setUploadDialoogOpen(true);
    e.target.value = "";
  }

  async function uploaden() {
    if (!geselecteerdBestand) return;
    setUploadBezig(true);
    try {
      const form = new FormData();
      form.append("bestand", geselecteerdBestand);
      form.append("type", uploadType);
      if (uploadLabel.trim()) form.append("label", uploadLabel.trim());
      if (uploadVerloopdatum) form.append("verloopdatum", uploadVerloopdatum);
      const resp = await fetch(`/api/medewerkers/${medewerkerId}/documenten`, { method: "POST", body: form });
      if (!resp.ok) throw new Error(await resp.text());
      await queryClient.invalidateQueries({ queryKey: getListMedewerkerDocumentenQueryKey(medewerkerId) });
      toast({ title: "Document geüpload" });
      setUploadDialoogOpen(false);
      setGeselecteerdBestand(null);
      setUploadLabel("");
      setUploadType("overig");
      setUploadVerloopdatum("");
    } catch {
      toast({ title: "Uploaden mislukt", variant: "destructive" });
    } finally {
      setUploadBezig(false);
    }
  }

  async function verwijderen(doc: MedewerkerDocument) {
    if (!confirm(`"${doc.bestandsnaam}" verwijderen?`)) return;
    try {
      const resp = await fetch(`/api/medewerkers/${medewerkerId}/documenten/${doc.id}`, { method: "DELETE" });
      if (!resp.ok) throw new Error();
      await queryClient.invalidateQueries({ queryKey: getListMedewerkerDocumentenQueryKey(medewerkerId) });
      toast({ title: "Document verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  const aanwezigTypes = new Set(docs.map((d) => normaliseerDocType(d.type)));

  const groepenPerType = DOCUMENT_TYPES
    .map((t) => ({ type: t, label: DOCUMENT_TYPE_LABELS[t], docs: docs.filter((d) => normaliseerDocType(d.type) === t) }))
    .filter((g) => g.docs.length > 0);

  const overige = docs.filter((d) => !DOCUMENT_TYPES.includes(normaliseerDocType(d.type)));

  return (
    <div className="space-y-4">

      {/* NAW-gegevens uit profiel (ter referentie) */}
      {medewerkerNaw && (medewerkerNaw.adres || medewerkerNaw.email || medewerkerNaw.telefoon || medewerkerNaw.mobiel) && (
        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">NAW-gegevens (profiel)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-sm">
              {(medewerkerNaw.adres || medewerkerNaw.woonplaats) && (
                <div className="flex items-start gap-1.5">
                  <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <span>{[medewerkerNaw.adres, medewerkerNaw.woonplaats].filter(Boolean).join(", ")}</span>
                </div>
              )}
              {(medewerkerNaw.telefoon || medewerkerNaw.mobiel) && (
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>{medewerkerNaw.telefoon ?? medewerkerNaw.mobiel}</span>
                </div>
              )}
              {medewerkerNaw.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="break-all">{medewerkerNaw.email}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Volledigheidscheck */}
      <Card className={VERPLICHTE_DOCS.some((v) => !v.types.some((t) => aanwezigTypes.has(t))) ? "border-amber-200 bg-amber-50/30" : "border-emerald-200 bg-emerald-50/20"}>
        <CardContent className="p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dossier volledigheid</p>
          <div className="flex flex-wrap gap-1.5">
            {VERPLICHTE_DOCS.map((v) => {
              const aanwezig = v.types.some((t) => aanwezigTypes.has(t));
              return (
                <span key={v.label} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${aanwezig ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-red-50 border-red-200 text-red-700"}`}>
                  {aanwezig ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {v.label}
                </span>
              );
            })}
            {AANBEVOLEN_DOCS.filter((v) => v.types.some((t) => aanwezigTypes.has(t))).map((v) => (
              <span key={v.label} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700 font-medium">
                <Check className="h-3 w-3" />
                {v.label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Upload knop */}
      {magBewerken && (
        <div className="flex justify-end gap-2">
          {docs.some((d) => normaliseerDocType(d.type) === "overig") && (
            <Button variant="outline" disabled={heranalyseBezig} onClick={heranalyseren}>
              <Sparkles className="h-4 w-4" />
              {heranalyseBezig ? "Bezig met benoemen…" : "Automatisch benoemen"}
            </Button>
          )}
          <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" onChange={bestandGekozen} />
          <Button onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Document uploaden
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nog geen persoonsdocumenten geüpload.</p>
            {magBewerken && <p className="text-xs mt-1">Klik op <span className="font-medium">Document uploaden</span> om te beginnen.</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groepenPerType.map(({ type, label, docs: groepDocs }) => (
            <div key={type}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{label}</p>
              <div className="space-y-2">
                {groepDocs.map((doc) => <DocumentRegel key={doc.id} doc={doc} magBewerken={magBewerken} onVerwijder={() => verwijderen(doc)} />)}
              </div>
            </div>
          ))}
          {overige.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Overig</p>
              <div className="space-y-2">
                {overige.map((doc) => <DocumentRegel key={doc.id} doc={doc} magBewerken={magBewerken} onVerwijder={() => verwijderen(doc)} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={uploadDialoogOpen} onOpenChange={(o) => { if (!uploadBezig) { setUploadDialoogOpen(o); if (!o) { setGeselecteerdBestand(null); setUploadVerloopdatum(""); } } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Document uploaden</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Bestandsnaam</Label>
              <p className="text-sm text-muted-foreground truncate">{geselecteerdBestand?.name}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Type document</Label>
              <Select value={uploadType} onValueChange={(v) => { setUploadType(v); if (!TYPES_MET_VERLOOPDATUM.has(v)) setUploadVerloopdatum(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Label (optioneel)</Label>
              <Input value={uploadLabel} onChange={(e) => setUploadLabel(e.target.value)} placeholder="bijv. Contract 2024" />
            </div>
            {TYPES_MET_VERLOOPDATUM.has(uploadType) && (
              <div className="space-y-1.5">
                <Label>Verloopdatum (optioneel)</Label>
                <DatePicker value={uploadVerloopdatum} onChange={(v) => setUploadVerloopdatum(v)} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setUploadDialoogOpen(false); setGeselecteerdBestand(null); setUploadVerloopdatum(""); }} disabled={uploadBezig}>Annuleren</Button>
            <Button onClick={uploaden} disabled={uploadBezig}>{uploadBezig ? "Uploaden…" : "Uploaden"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocumentRegel({ doc, magBewerken, onVerwijder }: { doc: MedewerkerDocument; magBewerken: boolean; onVerwijder: () => void }) {
  const datum = new Date(doc.aangemaakt_op).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });

  let verloopBadge: React.ReactNode = null;
  if (doc.verloopdatum) {
    const vandaag = new Date();
    const verloop = new Date(doc.verloopdatum);
    const dagenTot = Math.floor((verloop.getTime() - vandaag.getTime()) / (1000 * 60 * 60 * 24));
    const verloopLabel = verloop.toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" });
    if (dagenTot < 0) {
      verloopBadge = (
        <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded border bg-red-50 border-red-200 text-red-700 font-medium">
          <AlertTriangle className="h-2.5 w-2.5" /> Verlopen {verloopLabel}
        </span>
      );
    } else if (dagenTot <= 60) {
      verloopBadge = (
        <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded border bg-amber-50 border-amber-200 text-amber-700 font-medium">
          <AlertTriangle className="h-2.5 w-2.5" /> Verloopt {verloopLabel}
        </span>
      );
    } else {
      verloopBadge = (
        <span className="inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded border bg-muted border-border text-muted-foreground">
          Geldig t/m {verloopLabel}
        </span>
      );
    }
  }

  return (
    <Card>
      <CardContent className="p-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{doc.label || doc.bestandsnaam}</div>
          <div className="text-xs text-muted-foreground flex flex-wrap gap-1.5 mt-0.5 items-center">
            {doc.label && <span className="truncate opacity-70">{doc.bestandsnaam}</span>}
            <span>{datum}</span>
            {verloopBadge}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" title="Downloaden" onClick={() => window.open(doc.download_url ?? "#", "_blank")}>
            <Download className="h-3.5 w-3.5" />
          </Button>
          {magBewerken && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" title="Verwijderen" onClick={onVerwijder}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const MAANDEN = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];

function SalarisdocumentenTab({ medewerkerId, magBewerken }: { medewerkerId: number; magBewerken: boolean }) {
  const { data: docs = [], isLoading } = useGetSalarisarchiefDocumenten({ medewerker_id: medewerkerId });

  const statusLabel: Record<string, string> = {
    geupload: "Geüpload", controle_nodig: "Controle nodig", gekoppeld: "Gekoppeld",
    gepubliceerd: "Gepubliceerd", gearchiveerd: "Gearchiveerd",
  };
  const statusVariant: Record<string, "default"|"secondary"|"destructive"|"outline"> = {
    gepubliceerd: "default", controle_nodig: "destructive", gekoppeld: "secondary",
    geupload: "outline", gearchiveerd: "outline",
  };

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">Laden…</p>;
  if (!docs.length) return (
    <Card className="mt-2">
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        Geen salarisdocumenten gekoppeld aan deze medewerker.
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-2 mt-2">
      {docs.map((doc) => (
        <Card key={doc.id}>
          <CardContent className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{doc.bestandsnaam}</p>
              <p className="text-xs text-muted-foreground">
                {doc.type === "loonstrook" ? "Loonstrook" : doc.type === "jaaropgave" ? "Jaaropgave" : "Overig"}
                {doc.periode_jaar && doc.periode_maand
                  ? ` · ${MAANDEN[(doc.periode_maand ?? 1) - 1]} ${doc.periode_jaar}`
                  : doc.periode_jaar
                  ? ` · ${doc.periode_jaar}`
                  : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={statusVariant[doc.status] ?? "outline"}>{statusLabel[doc.status] ?? doc.status}</Badge>
              {magBewerken && (
                <a href={`/api/salarisarchief/documenten/${doc.id}/download`} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm">Download</Button>
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function MedewerkerDetailPagina() {
  // Werkmaatschappijen + CAO-voorselectie live uit de werkgevers-API.
  const { caoVoor: caoVoorWerkmaatschappij, opties: werkmaatschappijOpties } = useWerkmaatschappijen();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { echteRol, bevoegdheden } = useRol();
  const magSchrijven =
    echteRol === "hoofdbeheerder" || (bevoegdheden.personeel ?? 0) >= 2;

  const { data: medewerker, isLoading, isError } = useGetMedewerker(id);
  const { data: functies } = useListFuncties();
  const { data: caoOpties } = useListCaoOpties();
  const { data: alleMedewerkers } = useListMedewerkers();
  const { data: gebruikers } = useListToewijsbareGebruikers();
  const { data: opleidingCatalogus } = useListOpleidingen();
  const { data: medewerkerOpleidingen } = useListMedewerkerOpleidingen(id);
  const { data: bekwaamheden } = useListBekwaamheden(id);
  const { data: verlofsoorten } = useListVerlofsoorten();
  const { data: saldi } = useListVerlofSaldi(id);
  const { data: aanvragen } = useListVerlofAanvragen(id);

  const updMedewerker = useUpdateMedewerker();
  const delMedewerker = useDeleteMedewerker();
  const maakOpleiding = useCreateMedewerkerOpleiding();
  const updOpleiding = useUpdateMedewerkerOpleiding();
  const delOpleiding = useDeleteMedewerkerOpleiding();
  const maakBekwaamheid = useCreateBekwaamheid();
  const updBekwaamheid = useUpdateBekwaamheid();
  const delBekwaamheid = useDeleteBekwaamheid();
  const maakAanvraag = useCreateVerlofAanvraag();
  const updAanvraag = useUpdateVerlofAanvraag();
  const { data: caoKeuzes } = useListCaoKeuzes(id);
  const maakCaoKeuze = useCreateCaoKeuze();
  const updCaoKeuze = useUpdateCaoKeuze();
  const delCaoKeuze = useDeleteCaoKeuze();

  const { data: aanstellingen = [] } = useListMedewerkerAanstellingen(id);
  const maakAanstelling = useCreateMedewerkerAanstelling();
  const updAanstelling = useUpdateMedewerkerAanstelling();
  const delAanstelling = useDeleteMedewerkerAanstelling();
  const stelHoofdIn = useSetHoofdAanstelling();

  const [aanstellingOpen, setAanstellingOpen] = useState(false);
  const [aanstellingBewerkId, setAanstellingBewerkId] = useState<number | null>(null);
  const [aanstellingForm, setAanstellingForm] = useState<MedewerkerAanstellingInput>({
    werkmaatschappij: "", functie_id: null, cao: "", contracturen_per_week: null,
  });
  const [aanstellingAiBezig, setAanstellingAiBezig] = useState(false);
  const [aanstellingAiVoorstel, setAanstellingAiVoorstel] = useState(false);
  const [aanstellingAiToelichting, setAanstellingAiToelichting] = useState<string | null>(null);
  const [aanstellingAiVelden, setAanstellingAiVelden] = useState<Record<string, ContractAiVeld> | null>(null);
  // Snel toevoegen van een extra functie vanuit het Profiel-bewerken-dialoog.
  const [snelFunctieId, setSnelFunctieId] = useState<string>("");

  const [profielOpen, setProfielOpen] = useState(false);
  const [profielForm, setProfielForm] = useState<MedewerkerInput | null>(null);

  const [opleidingOpen, setOpleidingOpen] = useState(false);
  const [opleidingBewerkId, setOpleidingBewerkId] = useState<number | null>(null);
  const [opleidingForm, setOpleidingForm] = useState<MedewerkerOpleidingInput>({
    opleiding_id: 0, status: "behaald",
  });

  const [bekwaamOpen, setBekwaamOpen] = useState(false);
  const [bekwaamBewerkId, setBekwaamBewerkId] = useState<number | null>(null);
  const [bekwaamForm, setBekwaamForm] = useState<BekwaamheidInput>({
    onderwerp: "", categorie: "", niveau: "zelfstandig",
  });

  const [aanvraagOpen, setAanvraagOpen] = useState(false);
  const [aanvraagForm, setAanvraagForm] = useState<VerlofAanvraagInput>({
    verlofsoort_id: 0, start_datum: "", eind_datum: "", aantal_uren: 8,
  });

  const [caoKeuzeOpen, setCaoKeuzeOpen] = useState(false);
  const [caoKeuzeBewerkId, setCaoKeuzeBewerkId] = useState<number | null>(null);
  const [caoKeuzeForm, setCaoKeuzeForm] = useState<MedewerkerCaoKeuzeInput>({
    type: "vakantiegeld", keuze: "",
  });

  // ─── AI-voorstellen + heranalyseer ──────────────────────────────────────────
  const { data: aiVoorstellen = [] } = useListAiVoorstellen(id);
  const heranalyseer = useHeranalyseerDossier();
  const beoordeelVoorstel = usePatchAiVoorstel();
  const veldCorrectieMut = useAiVeldCorrectie();

  async function heranalyseerDossier() {
    try {
      await heranalyseer.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getListAiVoorstellenQueryKey(id) });
      toast({ title: "Dossier hergeanalyseerd", description: "AI-voorstellen zijn bijgewerkt." });
    } catch {
      toast({ title: "Heranalyse mislukt", variant: "destructive" });
    }
  }

  async function voorstelBeoordelen(voorstelId: number, status: string, correctie_tekst?: string) {
    const voorstel = aiVoorstellen.find((v) => v.id === voorstelId);
    try {
      await beoordeelVoorstel.mutateAsync({ voorstelId, data: { status, correctie_tekst } });
      await queryClient.invalidateQueries({ queryKey: getListAiVoorstellenQueryKey(id) });
      // Leerlus (AI_01): pas ná een geslaagde beoordeling vastleggen wat de AI
      // voorstelde en wat de gebruiker ervan maakte. Fire-and-forget.
      const aiVoorstel = voorstel?.voorgestelde_waarde ?? "";
      if (aiVoorstel) {
        // gekozen: overnemen ⇒ ai_voorstel; correctietekst ⇒ die tekst; afwijzen/later ⇒ leeg.
        const gekozen =
          status === "goedgekeurd"
            ? (correctie_tekst && correctie_tekst.trim() ? correctie_tekst : aiVoorstel)
            : "";
        const soort = voorstel?.veld && /^[a-z0-9_]+$/.test(voorstel.veld) ? voorstel.veld : "tekst";
        veldCorrectieMut.mutate(
          {
            data: {
              veld_naam: `hrm_voorstel.${soort}`,
              ai_voorstel: aiVoorstel,
              gekozen,
              tekst_fragment: medewerker?.naam ? medewerker.naam.slice(0, 200) : undefined,
            },
          },
          { onError: (err) => console.debug("hrm_voorstel veld-correctie loggen mislukt", err) },
        );
      }
    } catch {
      toast({ title: "Beoordeling mislukt", variant: "destructive" });
    }
  }

  // ─── Middelen ────────────────────────────────────────────────────────────────
  const { data: middelen = [] } = useListHrmMiddelen(id);
  const maakMiddel = useCreateHrmMiddel();
  const updMiddel = usePatchHrmMiddel();
  const delMiddel = useDeleteHrmMiddel();
  const [middelOpen, setMiddelOpen] = useState(false);
  const [middelBewerkId, setMiddelBewerkId] = useState<number | null>(null);
  const [middelForm, setMiddelForm] = useState({ categorie: "", naam: "", opmerking: "", uitgegeven_op: "" });

  async function opslaanMiddel() {
    const payload = {
      categorie: middelForm.categorie,
      naam: middelForm.naam,
      opmerking: middelForm.opmerking || undefined,
      uitgegeven_op: middelForm.uitgegeven_op || undefined,
    };
    try {
      if (middelBewerkId) {
        await updMiddel.mutateAsync({ id: middelBewerkId, data: payload });
      } else {
        await maakMiddel.mutateAsync({ id, data: payload });
      }
      await queryClient.invalidateQueries({ queryKey: getListHrmMiddelenQueryKey(id) });
      setMiddelOpen(false);
      toast({ title: middelBewerkId ? "Middel bijgewerkt" : "Middel toegevoegd" });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function verwijderMiddel(middelId: number) {
    if (!window.confirm("Middel verwijderen?")) return;
    try {
      await delMiddel.mutateAsync({ id: middelId });
      await queryClient.invalidateQueries({ queryKey: getListHrmMiddelenQueryKey(id) });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  // ─── Onboarding-taken ────────────────────────────────────────────────────────
  const { data: onboardingTaken = [] } = useListOnboardingTaken(id);
  const maakTaak = useCreateOnboardingTaak();
  const updTaak = usePatchOnboardingTaak();
  const delTaak = useDeleteOnboardingTaak();
  const [taakOpen, setTaakOpen] = useState(false);
  const [taakBewerkId, setTaakBewerkId] = useState<number | null>(null);
  const [taakForm, setTaakForm] = useState({ naam: "", categorie: "administratief", opmerking: "", deadline: "" });

  async function opslaanTaak() {
    const payload = {
      naam: taakForm.naam,
      categorie: taakForm.categorie || undefined,
      opmerking: taakForm.opmerking || undefined,
      deadline: taakForm.deadline || undefined,
    };
    try {
      if (taakBewerkId) {
        await updTaak.mutateAsync({ taakId: taakBewerkId, data: payload });
      } else {
        await maakTaak.mutateAsync({ id, data: payload });
      }
      await queryClient.invalidateQueries({ queryKey: getListOnboardingTakenQueryKey(id) });
      setTaakOpen(false);
      toast({ title: taakBewerkId ? "Taak bijgewerkt" : "Taak toegevoegd" });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function taakAfvinken(taakId: number, afgerond: boolean) {
    try {
      await updTaak.mutateAsync({ taakId, data: { naam: onboardingTaken.find(t => t.id === taakId)?.naam ?? "", status: afgerond ? "afgerond" : "openstaand" } });
      await queryClient.invalidateQueries({ queryKey: getListOnboardingTakenQueryKey(id) });
    } catch {
      toast({ title: "Bijwerken mislukt", variant: "destructive" });
    }
  }

  async function verwijderTaak(taakId: number) {
    try {
      await delTaak.mutateAsync({ taakId });
      await queryClient.invalidateQueries({ queryKey: getListOnboardingTakenQueryKey(id) });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  const cvFileInputRef = useRef<HTMLInputElement>(null);
  const [cvUploadBezig, setCvUploadBezig] = useState(false);
  const certFileInputRef = useRef<HTMLInputElement>(null);
  const [certUploadBezigId, setCertUploadBezigId] = useState<number | null>(null);

  async function cvUploaden(bestand: File) {
    setCvUploadBezig(true);
    try {
      const form = new FormData();
      form.append("bestand", bestand);
      form.append("type", "cv");
      form.append("label", "CV");
      const resp = await fetch(`/api/medewerkers/${id}/documenten`, { method: "POST", body: form });
      if (!resp.ok) throw new Error(await resp.text());
      await queryClient.invalidateQueries({ queryKey: getListMedewerkerDocumentenQueryKey(Number(id)) });
      toast({ title: "CV-bestand geüpload", description: "Te vinden op het tabblad Documenten." });
    } catch {
      toast({ title: "Uploaden mislukt", variant: "destructive" });
    } finally {
      setCvUploadBezig(false);
    }
  }

  async function certificaatUploaden(bestand: File, opleidingNaam: string) {
    setCertUploadBezigId(null);
    try {
      const form = new FormData();
      form.append("bestand", bestand);
      form.append("type", "diploma");
      form.append("label", opleidingNaam);
      const resp = await fetch(`/api/medewerkers/${id}/documenten`, { method: "POST", body: form });
      if (!resp.ok) throw new Error(await resp.text());
      await queryClient.invalidateQueries({ queryKey: getListMedewerkerDocumentenQueryKey(Number(id)) });
      toast({ title: "Certificaat geüpload", description: "Te vinden op het tabblad Documenten." });
    } catch {
      toast({ title: "Uploaden mislukt", variant: "destructive" });
    }
  }

  async function invalideerMedewerker() {
    await queryClient.invalidateQueries({ queryKey: getGetMedewerkerQueryKey(id) });
    await queryClient.invalidateQueries({ queryKey: getListMedewerkersQueryKey() });
  }

  function openProfiel() {
    if (!medewerker) return;
    setProfielForm({
      naam: medewerker.naam,
      gebruiker_id: medewerker.gebruiker_id ?? null,
      email: medewerker.email ?? undefined,
      telefoon: medewerker.telefoon ?? undefined,
      mobiel: medewerker.mobiel ?? undefined,
      werkmaatschappij: medewerker.werkmaatschappij,
      functie_id: medewerker.functie_id ?? null,
      leidinggevende_id: medewerker.leidinggevende_id ?? undefined,
      cao: medewerker.cao ?? undefined,
      dienstverband: medewerker.dienstverband,
      bedrijf_uitzendbureau: medewerker.bedrijf_uitzendbureau ?? undefined,
      uitzendbureau_id: medewerker.uitzendbureau_id ?? null,
      zzp_bedrijfsnaam: medewerker.zzp_bedrijfsnaam ?? undefined,
      inleen_einddatum: medewerker.inleen_einddatum ?? undefined,
      contracturen_per_week: medewerker.contracturen_per_week ?? null,
      in_dienst_sinds: medewerker.in_dienst_sinds ?? undefined,
      uit_dienst_per: medewerker.uit_dienst_per ?? undefined,
      noodcontact_naam: medewerker.noodcontact_naam ?? undefined,
      noodcontact_telefoon: medewerker.noodcontact_telefoon ?? undefined,
      geboortedatum: medewerker.geboortedatum ?? undefined,
      geboorteplaats: medewerker.geboorteplaats ?? undefined,
      adres: medewerker.adres ?? undefined,
      postcode: medewerker.postcode ?? undefined,
      woonplaats: medewerker.woonplaats ?? undefined,
      rijbewijs: medewerker.rijbewijs ?? undefined,
      rijbewijs_vervaldatum: medewerker.rijbewijs_vervaldatum ?? undefined,
      vca_vervaldatum: medewerker.vca_vervaldatum ?? undefined,
      ehbo_vervaldatum: medewerker.ehbo_vervaldatum ?? undefined,
      bhv_vervaldatum: medewerker.bhv_vervaldatum ?? undefined,
      cv_tekst: medewerker.cv_tekst ?? undefined,
      actief: medewerker.actief,
      opmerkingen: medewerker.opmerkingen ?? undefined,
    });
    setProfielOpen(true);
  }

  async function opslaanProfiel() {
    if (!profielForm) return;
    if (!profielForm.naam.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    try {
      await updMedewerker.mutateAsync({ id, data: { ...profielForm, naam: profielForm.naam.trim() } });
      await invalideerMedewerker();
      toast({ title: "Profiel bijgewerkt" });
      setProfielOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function verwijderMedewerker() {
    if (!medewerker) return;
    if (!window.confirm(`Medewerker "${medewerker.naam}" verwijderen?`)) return;
    try {
      await delMedewerker.mutateAsync({ id });
      await queryClient.invalidateQueries({ queryKey: getListMedewerkersQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
      toast({ title: "Medewerker verwijderd" });
      window.history.back();
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  function openAanstelling(a?: MedewerkerAanstelling) {
    if (a) {
      setAanstellingBewerkId(a.id);
      setAanstellingForm({
        werkmaatschappij: a.werkmaatschappij,
        functie_id: a.functie_id ?? null,
        cao: a.cao ?? "",
        contracturen_per_week: a.contracturen_per_week ?? null,
      });
    } else {
      setAanstellingBewerkId(null);
      setAanstellingForm({ werkmaatschappij: "", functie_id: null, cao: "", contracturen_per_week: null });
    }
    setAanstellingAiVoorstel(false);
    setAanstellingAiToelichting(null);
    setAanstellingOpen(true);
  }

  async function vulAanstellingInViaAI() {
    setAanstellingAiBezig(true);
    setAanstellingAiToelichting(null);
    try {
      const resp = await fetch(`/api/medewerkers/${id}/ai-contract-analyse`, { method: "POST" });
      const data = await resp.json() as Record<string, unknown>;
      if (!resp.ok) {
        toast({ title: (data.error as string) ?? "AI invullen mislukt", variant: "destructive" });
        return;
      }
      const matchFunctie = (functies ?? []).find(
        (f) => f.naam.toLowerCase() === String(data.functie_naam ?? "").toLowerCase()
      );
      setAanstellingForm((prev) => ({
        werkmaatschappij: typeof data.werkmaatschappij === "string" && data.werkmaatschappij ? data.werkmaatschappij : prev.werkmaatschappij,
        functie_id: matchFunctie ? matchFunctie.id : prev.functie_id,
        cao: typeof data.cao === "string" && data.cao ? data.cao : prev.cao,
        contracturen_per_week: typeof data.contracturen_per_week === "number" ? data.contracturen_per_week : prev.contracturen_per_week,
      }));
      setAanstellingAiVoorstel(true);
      setAanstellingAiToelichting(
        [
          typeof data.ai_toelichting === "string" ? data.ai_toelichting : null,
          matchFunctie == null && data.functie_naam ? `Functie "${data.functie_naam}" niet gevonden in het functiehuis — controleer handmatig.` : null,
        ].filter(Boolean).join(" ") || null
      );
      setAanstellingAiVelden(
        typeof data.velden === "object" && data.velden !== null
          ? (data.velden as Record<string, ContractAiVeld>)
          : null
      );
    } catch {
      toast({ title: "Verbinding mislukt bij AI invullen", variant: "destructive" });
    } finally {
      setAanstellingAiBezig(false);
    }
  }

  async function opslaanAanstelling() {
    if (!aanstellingForm.werkmaatschappij.trim()) {
      toast({ title: "Werkmaatschappij is verplicht", variant: "destructive" });
      return;
    }
    try {
      if (aanstellingBewerkId) {
        await updAanstelling.mutateAsync({ id, aanstellingId: aanstellingBewerkId, data: aanstellingForm });
      } else {
        await maakAanstelling.mutateAsync({ id, data: aanstellingForm });
      }
      await queryClient.invalidateQueries({ queryKey: getListMedewerkerAanstellingenQueryKey(id) });
      await invalideerMedewerker();
      toast({ title: aanstellingBewerkId ? "Aanstelling bijgewerkt" : "Aanstelling toegevoegd" });
      setAanstellingOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function verwijderAanstelling(aanstellingId: number) {
    if (!window.confirm("Deze aanstelling verwijderen?")) return;
    try {
      await delAanstelling.mutateAsync({ id, aanstellingId });
      await queryClient.invalidateQueries({ queryKey: getListMedewerkerAanstellingenQueryKey(id) });
      toast({ title: "Aanstelling verwijderd" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      toast({ title: msg.includes("409") ? "Kan hoofdaanstelling niet verwijderen" : "Verwijderen mislukt", variant: "destructive" });
    }
  }

  async function stelAlsHoofd(aanstellingId: number) {
    try {
      await stelHoofdIn.mutateAsync({ id, aanstellingId });
      await queryClient.invalidateQueries({ queryKey: getListMedewerkerAanstellingenQueryKey(id) });
      await invalideerMedewerker();
      toast({ title: "Hoofdaanstelling ingesteld" });
    } catch {
      toast({ title: "Instellen mislukt", variant: "destructive" });
    }
  }

  // Voegt vanuit het Profiel-bewerken-dialoog snel een extra functie toe als
  // aanstelling binnen de huidige werkmaatschappij van de medewerker.
  async function snelFunctieToevoegen() {
    if (!snelFunctieId || !profielForm) return;
    const wm = profielForm.werkmaatschappij || medewerker?.werkmaatschappij || "";
    if (!wm.trim()) {
      toast({ title: "Kies eerst een werkmaatschappij", variant: "destructive" });
      return;
    }
    try {
      await maakAanstelling.mutateAsync({
        id,
        data: {
          werkmaatschappij: wm,
          functie_id: Number(snelFunctieId),
          cao: profielForm.cao ?? "",
          contracturen_per_week: null,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListMedewerkerAanstellingenQueryKey(id) });
      setSnelFunctieId("");
      toast({ title: "Functie toegevoegd" });
    } catch {
      toast({ title: "Toevoegen mislukt", variant: "destructive" });
    }
  }

  function openOpleiding(o?: MedewerkerOpleiding) {
    if (o) {
      setOpleidingBewerkId(o.id);
      setOpleidingForm({
        opleiding_id: o.opleiding_id,
        status: o.status,
        behaald_op: o.behaald_op ?? null,
        verloopt_op: o.verloopt_op ?? null,
        opmerking: o.opmerking ?? "",
      });
    } else {
      setOpleidingBewerkId(null);
      setOpleidingForm({ opleiding_id: 0, status: "behaald" });
    }
    setOpleidingOpen(true);
  }

  async function opslaanOpleiding() {
    if (!opleidingForm.opleiding_id) {
      toast({ title: "Kies een opleiding", variant: "destructive" });
      return;
    }
    try {
      if (opleidingBewerkId) {
        await updOpleiding.mutateAsync({ id: opleidingBewerkId, data: opleidingForm });
      } else {
        await maakOpleiding.mutateAsync({ id, data: opleidingForm });
      }
      await queryClient.invalidateQueries({ queryKey: getListMedewerkerOpleidingenQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
      toast({ title: opleidingBewerkId ? "Certificaat bijgewerkt" : "Certificaat toegekend" });
      setOpleidingOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function verwijderOpleiding(opleidingId: number) {
    if (!window.confirm("Dit certificaat verwijderen?")) return;
    try {
      await delOpleiding.mutateAsync({ id: opleidingId });
      await queryClient.invalidateQueries({ queryKey: getListMedewerkerOpleidingenQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
      toast({ title: "Certificaat verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  function openBekwaamheid(b?: Bekwaamheid) {
    if (b) {
      setBekwaamBewerkId(b.id);
      setBekwaamForm({
        onderwerp: b.onderwerp,
        categorie: b.categorie ?? "",
        niveau: b.niveau,
        vastgesteld_door: b.vastgesteld_door ?? "",
        vastgesteld_op: b.vastgesteld_op ?? null,
        opmerking: b.opmerking ?? "",
      });
    } else {
      setBekwaamBewerkId(null);
      setBekwaamForm({ onderwerp: "", categorie: "", niveau: "zelfstandig" });
    }
    setBekwaamOpen(true);
  }

  async function opslaanBekwaamheid() {
    if (!bekwaamForm.onderwerp.trim()) {
      toast({ title: "Onderwerp is verplicht", variant: "destructive" });
      return;
    }
    try {
      if (bekwaamBewerkId) {
        await updBekwaamheid.mutateAsync({ id: bekwaamBewerkId, data: { ...bekwaamForm, onderwerp: bekwaamForm.onderwerp.trim() } });
      } else {
        await maakBekwaamheid.mutateAsync({ id, data: { ...bekwaamForm, onderwerp: bekwaamForm.onderwerp.trim() } });
      }
      await queryClient.invalidateQueries({ queryKey: getListBekwaamhedenQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: getListAlleBekwaamhedenQueryKey() });
      toast({ title: bekwaamBewerkId ? "Bekwaamheid bijgewerkt" : "Bekwaamheid toegevoegd" });
      setBekwaamOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function verwijderBekwaamheid(bId: number) {
    if (!window.confirm("Deze bekwaamheid verwijderen?")) return;
    try {
      await delBekwaamheid.mutateAsync({ id: bId });
      await queryClient.invalidateQueries({ queryKey: getListBekwaamhedenQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: getListAlleBekwaamhedenQueryKey() });
      toast({ title: "Bekwaamheid verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  function openCaoKeuze(k?: MedewerkerCaoKeuze) {
    if (k) {
      setCaoKeuzeBewerkId(k.id);
      setCaoKeuzeForm({
        type: k.type as MedewerkerCaoKeuzeInput["type"],
        jaar: k.jaar ?? undefined,
        keuze: k.keuze,
        fonds_naam: k.fonds_naam ?? "",
        bedrag_cents: k.bedrag_cents ?? undefined,
        toelichting: k.toelichting ?? "",
      });
    } else {
      setCaoKeuzeBewerkId(null);
      setCaoKeuzeForm({ type: "vakantiegeld", keuze: "" });
    }
    setCaoKeuzeOpen(true);
  }

  async function opslaanCaoKeuze() {
    if (!caoKeuzeForm.keuze.trim()) {
      toast({ title: "Keuze is verplicht", variant: "destructive" });
      return;
    }
    try {
      if (caoKeuzeBewerkId) {
        await updCaoKeuze.mutateAsync({ id: Number(id), keuzeId: caoKeuzeBewerkId, data: caoKeuzeForm });
      } else {
        await maakCaoKeuze.mutateAsync({ id: Number(id), data: caoKeuzeForm });
      }
      await queryClient.invalidateQueries({ queryKey: getListCaoKeuzesQueryKey(id) });
      toast({ title: caoKeuzeBewerkId ? "CAO-keuze bijgewerkt" : "CAO-keuze vastgelegd" });
      setCaoKeuzeOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function verwijderCaoKeuze(kId: number) {
    if (!window.confirm("Deze CAO-keuze verwijderen?")) return;
    try {
      await delCaoKeuze.mutateAsync({ id: Number(id), keuzeId: kId });
      await queryClient.invalidateQueries({ queryKey: getListCaoKeuzesQueryKey(id) });
      toast({ title: "CAO-keuze verwijderd" });
    } catch {
      toast({ title: "Verwijderen mislukt", variant: "destructive" });
    }
  }

  async function opslaanAanvraag() {
    if (!aanvraagForm.verlofsoort_id || !aanvraagForm.start_datum || !aanvraagForm.eind_datum) {
      toast({ title: "Soort, begin- en einddatum zijn verplicht", variant: "destructive" });
      return;
    }
    if (!aanvraagForm.aantal_uren || aanvraagForm.aantal_uren <= 0) {
      toast({ title: "Aantal uren moet groter dan 0 zijn", variant: "destructive" });
      return;
    }
    try {
      await maakAanvraag.mutateAsync({ id, data: aanvraagForm });
      await queryClient.invalidateQueries({ queryKey: getListVerlofAanvragenQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: getListAlleVerlofAanvragenQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
      toast({ title: "Verlofaanvraag ingediend" });
      setAanvraagOpen(false);
      setAanvraagForm({ verlofsoort_id: 0, start_datum: "", eind_datum: "", aantal_uren: 8 });
    } catch {
      toast({ title: "Indienen mislukt", variant: "destructive" });
    }
  }

  async function beoordeelAanvraag(a: VerlofAanvraag, status: "goedgekeurd" | "afgewezen") {
    try {
      await updAanvraag.mutateAsync({
        id: a.id,
        data: {
          verlofsoort_id: a.verlofsoort_id,
          start_datum: a.start_datum,
          eind_datum: a.eind_datum,
          aantal_uren: a.aantal_uren,
          status,
          reden: a.reden ?? undefined,
          opmerking: a.opmerking ?? undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListVerlofAanvragenQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: getListVerlofSaldiQueryKey(id) });
      await queryClient.invalidateQueries({ queryKey: getListAlleVerlofAanvragenQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
      toast({ title: status === "goedgekeurd" ? "Aanvraag goedgekeurd" : "Aanvraag afgewezen" });
    } catch (err: unknown) {
      const body = (err as { body?: { error?: string } })?.body;
      if (body?.error) {
        toast({ title: "Beoordelen geblokkeerd", description: body.error, variant: "destructive" });
      } else {
        toast({ title: "Beoordelen mislukt", variant: "destructive" });
      }
    }
  }

  async function onGoedkeuringWijziging(aanvraagId: number) {
    await queryClient.invalidateQueries({ queryKey: getListVerlofAanvragenQueryKey(id) });
    await queryClient.invalidateQueries({ queryKey: getListVerlofSaldiQueryKey(id) });
    await queryClient.invalidateQueries({ queryKey: getListAlleVerlofAanvragenQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getGetGoedkeuringVoorObjectQueryKey("verlofaanvraag", aanvraagId) });
  }

  const gekoppeldeGebruiker = useMemo(
    () => (gebruikers ?? []).find((g) => g.id === medewerker?.gebruiker_id),
    [gebruikers, medewerker?.gebruiker_id],
  );

  if (!Number.isFinite(id) || isError) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center space-y-4">
        <p className="text-muted-foreground">Medewerker niet gevonden.</p>
        <Link href="/personeel"><Button variant="outline"><ArrowLeft className="h-4 w-4" /> Terug</Button></Link>
      </div>
    );
  }

  if (isLoading || !medewerker) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/personeel">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 data-paginatitel className="text-2xl font-bold text-foreground truncate">{medewerker.naam}</h1>
              <ImportBadge bron={medewerker.bron} importId={medewerker.import_id} />
            </div>
            <p className="text-sm text-muted-foreground">
              {medewerker.functie_naam ?? "Geen functie"} — {medewerker.werkmaatschappij}
            </p>
            {medewerker.leidinggevende_naam && (
              <p className="text-xs text-muted-foreground">
                Leidinggevende: {medewerker.leidinggevende_naam}
              </p>
            )}
          </div>
        </div>
        {magSchrijven && (
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <Button variant="outline" onClick={openProfiel}><Pencil className="h-4 w-4" /> Bewerken</Button>
            <Button
              variant="outline"
              onClick={heranalyseerDossier}
              disabled={heranalyseer.isPending}
              className="text-amber-700 border-amber-300 hover:bg-amber-50"
            >
              <Sparkles className="h-4 w-4" />
              {heranalyseer.isPending ? "Analyseren…" : "Heranalyseer dossier"}
            </Button>
            <Button variant="outline" onClick={verwijderMedewerker} className="text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" /> Verwijderen
            </Button>
          </div>
        )}
      </div>

      {/* Profiel + account */}
      <Card>
        <CardContent className="p-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Account</div>
            {medewerker.gebruiker_id ? (
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{gekoppeldeGebruiker?.naam ?? "Gekoppeld"}</span>
                {medewerker.gebruiker_rol && <Badge variant="secondary">{medewerker.gebruiker_rol}</Badge>}
              </div>
            ) : (
              <Badge variant="outline" className="border-amber-200 text-amber-700">Geen account gekoppeld</Badge>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Status</div>
            <Badge variant={medewerker.actief ? "outline" : "secondary"} className={medewerker.actief ? "border-emerald-200 text-emerald-700" : ""}>
              {medewerker.actief ? "Actief" : "Inactief"}
            </Badge>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">Dienstverband</div>
            <div className="text-sm">
              {DIENSTVERBAND_LABELS[medewerker.dienstverband] ?? medewerker.dienstverband}
              {medewerker.contracturen_per_week != null ? ` — ${medewerker.contracturen_per_week} uur/week` : ""}
              {medewerker.deeltijd_percentage != null ? ` (${medewerker.deeltijd_percentage}%)` : ""}
              {medewerker.zzp_bedrijfsnaam ? ` — ${medewerker.zzp_bedrijfsnaam}` : ""}
              {medewerker.bedrijf_uitzendbureau ? (medewerker.dienstverband === "zzp" ? ` (ingehuurd door ${medewerker.bedrijf_uitzendbureau})` : ` (${medewerker.bedrijf_uitzendbureau})`) : ""}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> E-mail</div>
            <div className="text-sm break-all">{medewerker.email ?? "—"}</div>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Telefoon</div>
            <div className="text-sm">{medewerker.telefoon ?? medewerker.mobiel ?? "—"}</div>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" /> CAO</div>
            <div className="text-sm">{medewerker.cao ?? "—"}</div>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">In dienst sinds</div>
            <div className="text-sm">{fmtDatum(medewerker.in_dienst_sinds)}</div>
          </div>
          <AppDownloadLink />
          {medewerker.uit_dienst_per && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Uit dienst per</div>
              <div className="text-sm">{fmtDatum(medewerker.uit_dienst_per)}</div>
            </div>
          )}
          {(medewerker.dienstverband === "uitzend" || medewerker.dienstverband === "inhuur") && medewerker.inleen_einddatum && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Inleen-einddatum</div>
              <div className={`text-sm font-medium ${new Date(medewerker.inleen_einddatum) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) ? "text-red-600" : ""}`}>
                {fmtDatum(medewerker.inleen_einddatum)}
              </div>
            </div>
          )}
          {(medewerker.noodcontact_naam || medewerker.noodcontact_telefoon) && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Noodcontact</div>
              <div className="text-sm">{medewerker.noodcontact_naam ?? "—"}{medewerker.noodcontact_telefoon ? ` (${medewerker.noodcontact_telefoon})` : ""}</div>
            </div>
          )}
          {/* Functies / aanstellingen overzicht — altijd zichtbaar zodat "meerdere
              functies" direct vindbaar is, ook als er nog geen extra aanstellingen zijn */}
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-3 border-t pt-3 mt-1">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Functies
              </div>
              {magSchrijven && (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openAanstelling()}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Functie toevoegen
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Hoofdfunctie uit het profiel tonen zolang geen enkele aanstelling
                  als hoofd gemarkeerd is (dus ook bij 1+ niet-hoofd-aanstellingen) */}
              {!aanstellingen.some((a) => a.is_hoofd) && (
                <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-sm">
                  <span className="font-medium">{medewerker.functie_naam ?? "Geen functie"}</span>
                  <span className="text-muted-foreground text-xs">— {medewerker.werkmaatschappij}</span>
                  <span className="ml-1 text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Hoofd</span>
                </div>
              )}
              {aanstellingen.map((a) => (
                <div key={a.id} className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm ${a.is_hoofd ? "border-amber-200 bg-amber-50" : "bg-muted/40"}`}>
                  <span className="font-medium">{a.functie_naam ?? "Geen functie"}</span>
                  <span className="text-muted-foreground text-xs">— {a.werkmaatschappij}</span>
                  {a.is_hoofd && (
                    <span className="ml-1 text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Hoofd</span>
                  )}
                  {a.cao && <span className="text-muted-foreground text-xs">· {a.cao}</span>}
                  {a.contracturen_per_week != null && (
                    <span className="text-muted-foreground text-xs">· {a.contracturen_per_week}u</span>
                  )}
                </div>
              ))}
            </div>
            {aanstellingen.length === 0 && magSchrijven && (
              <p className="text-xs text-muted-foreground">
                Een medewerker kan meerdere functies vervullen. Gebruik "Functie toevoegen" of de kaart Aanstellingen hieronder.
              </p>
            )}
          </div>

          {medewerker.opmerkingen && (
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <div className="text-xs font-medium text-muted-foreground">Opmerkingen</div>
              <p className="text-sm whitespace-pre-wrap">{medewerker.opmerkingen}</p>
            </div>
          )}

          {/* Persoonsgegevens — toon alleen als er iets ingevuld is */}
          {(medewerker.geboortedatum || medewerker.adres || medewerker.woonplaats || medewerker.rijbewijs) && (
            <div className="sm:col-span-2 lg:col-span-3 border-t pt-3 mt-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Persoonsgegevens</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {medewerker.geboortedatum && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Cake className="h-3.5 w-3.5" /> Geboortedatum</div>
                    <div className="text-sm">{fmtDatum(medewerker.geboortedatum)}{medewerker.geboorteplaats ? ` — ${medewerker.geboorteplaats}` : ""}</div>
                  </div>
                )}
                {(medewerker.adres || medewerker.woonplaats) && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Woonadres</div>
                    <div className="text-sm">
                      {medewerker.adres && <div>{medewerker.adres}</div>}
                      {(medewerker.postcode || medewerker.woonplaats) && (
                        <div>{[medewerker.postcode, medewerker.woonplaats].filter(Boolean).join("  ")}</div>
                      )}
                    </div>
                  </div>
                )}
                {medewerker.rijbewijs && (
                  <div className="space-y-1.5">
                    <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Car className="h-3.5 w-3.5" /> Rijbewijs</div>
                    <div className="text-sm">
                      <div>{medewerker.rijbewijs}</div>
                      {medewerker.rijbewijs_vervaldatum && (
                        <div className="text-xs text-muted-foreground">Geldig t/m {fmtDatum(medewerker.rijbewijs_vervaldatum)}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Aanstellingen */}
      <Card>
        <CardHeader className="px-5 pt-4 pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Aanstellingen
          </CardTitle>
          {magSchrijven && (
            <Button variant="outline" size="sm" onClick={() => openAanstelling()}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Toevoegen
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-5 pb-4 space-y-2">
          {aanstellingen.length === 0 && (
            <p className="text-sm text-muted-foreground">Geen aanstellingen geregistreerd.</p>
          )}
          {aanstellingen.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{a.werkmaatschappij}</span>
                  {a.is_hoofd && (
                    <Badge variant="secondary" className="border-amber-200 bg-amber-50 text-amber-700 text-[11px]">
                      <Star className="h-3 w-3 mr-1" /> Hoofd
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                  {a.functie_naam && <span>{a.functie_naam}</span>}
                  {a.cao && <span>CAO: {a.cao}</span>}
                  {a.contracturen_per_week != null && <span>{a.contracturen_per_week} uur/week</span>}
                </div>
              </div>
              {magSchrijven && (
                <div className="flex items-center gap-1 shrink-0">
                  {!a.is_hoofd && (
                    <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => stelAlsHoofd(a.id)}>
                      Als hoofd instellen
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAanstelling(a)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => verwijderAanstelling(a.id)}
                    disabled={a.is_hoofd}
                    title={a.is_hoofd ? "Stel eerst een andere aanstelling als hoofd in" : "Verwijderen"}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Aanstelling toevoegen / bewerken */}
      <Dialog open={aanstellingOpen} onOpenChange={setAanstellingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2">
              <div>
                <DialogTitle>{aanstellingBewerkId ? "Aanstelling bewerken" : "Aanstelling toevoegen"}</DialogTitle>
                <DialogDescription>Koppel deze medewerker aan een werkmaatschappij met een functie en CAO.</DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 text-xs gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50"
                onClick={vulAanstellingInViaAI}
                disabled={aanstellingAiBezig}
                title="Leest het meest recente arbeidscontract en vult de velden automatisch in"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {aanstellingAiBezig ? "Bezig…" : "AI invullen"}
              </Button>
            </div>
            {aanstellingAiVoorstel && (
              <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-1.5">
                <Sparkles className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  AI-voorstel ingevuld vanuit het arbeidscontract. Controleer en pas aan waar nodig.
                  {aanstellingAiToelichting ? ` ${aanstellingAiToelichting}` : ""}
                </span>
              </div>
            )}
            {aanstellingAiVoorstel && aanstellingAiVelden && (
              <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 space-y-1 max-h-48 overflow-y-auto">
                <p className="text-[11px] font-semibold text-amber-800">Uit het contract gelezen (met vindplaats):</p>
                {CONTRACT_AI_VELD_LABELS.map(([sleutel, label]) => {
                  const veld = aanstellingAiVelden[sleutel];
                  if (!veld || veld.waarde == null || veld.waarde === "") return null;
                  return (
                    <div key={sleutel} className="text-[11px] text-amber-900 leading-snug">
                      <span className="font-medium">{label}:</span> {String(veld.waarde)}
                      {veld.vindplaats && (
                        <span className="text-amber-700/80">
                          {" "}({veld.vindplaats.pagina ? `p. ${veld.vindplaats.pagina} — ` : ""}&ldquo;{veld.vindplaats.citaat}&rdquo;)
                        </span>
                      )}
                      {!veld.vindplaats && <span className="text-amber-700/80"> (geen vindplaats — controleer zelf)</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Werkmaatschappij</Label>
              <Select
                value={aanstellingForm.werkmaatschappij}
                onValueChange={(v) => {
                  const cao = caoVoorWerkmaatschappij(v) ?? aanstellingForm.cao ?? "";
                  setAanstellingForm((f) => ({ ...f, werkmaatschappij: v, cao }));
                }}
              >
                <SelectTrigger><SelectValue placeholder="Kies werkmaatschappij" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {werkmaatschappijOpties(aanstellingForm.werkmaatschappij).map((w) => (
                      <SelectItem key={w} value={w}>{w}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Functie</Label>
              <Select
                value={aanstellingForm.functie_id != null ? String(aanstellingForm.functie_id) : "geen"}
                onValueChange={(v) => setAanstellingForm((f) => ({ ...f, functie_id: v === "geen" ? null : Number(v) }))}
              >
                <SelectTrigger><SelectValue placeholder="Geen functie" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="geen">Geen functie</SelectItem>
                  {(functies ?? []).map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>CAO</Label>
              <Select
                value={aanstellingForm.cao ?? ""}
                onValueChange={(v) => setAanstellingForm((f) => ({ ...f, cao: v === "_leeg" ? "" : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Geen CAO" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_leeg">Geen CAO</SelectItem>
                  {(caoOpties ?? []).map((c) => (
                    <SelectItem key={c.naam} value={c.naam}>{c.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Contracturen per week</Label>
              <Input
                type="number"
                min={0}
                max={60}
                step={0.5}
                placeholder="bijv. 40"
                value={aanstellingForm.contracturen_per_week ?? ""}
                onChange={(e) => setAanstellingForm((f) => ({
                  ...f,
                  contracturen_per_week: e.target.value ? Number(e.target.value) : null,
                }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAanstellingOpen(false)}>Annuleren</Button>
            <Button onClick={opslaanAanstelling}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <KritiekeDatumsBlok medewerkerId={Number(id)} tonen={(bevoegdheden.personeel ?? 0) >= 1} />

      <Tabs defaultValue="contracten">
        <TabsList>
          <TabsTrigger value="contracten">Contracten</TabsTrigger>
          <TabsTrigger value="opleidingen">Opleidingen & certificaten</TabsTrigger>
          <TabsTrigger value="bekwaamheden">Bekwaamheden</TabsTrigger>
          <TabsTrigger value="verlof">Verlof</TabsTrigger>
          <TabsTrigger value="cao-keuzes">CAO-keuzes</TabsTrigger>
          <TabsTrigger value="achtergrond"><FileText className="h-3.5 w-3.5 mr-1.5" />Achtergrond / CV</TabsTrigger>
          <TabsTrigger value="prestaties"><Trophy className="h-3.5 w-3.5 mr-1.5" />Prestaties</TabsTrigger>
          <TabsTrigger value="documenten"><FileText className="h-3.5 w-3.5 mr-1.5" />Documenten</TabsTrigger>
          {(bevoegdheden.salarisarchief ?? 0) >= 1 && (
            <TabsTrigger value="salarisdocumenten">Salarisdocumenten</TabsTrigger>
          )}
          <TabsTrigger value="middelen"><Briefcase className="h-3.5 w-3.5 mr-1.5" />Middelen</TabsTrigger>
          <TabsTrigger value="onboarding-taken"><Check className="h-3.5 w-3.5 mr-1.5" />Onboarding</TabsTrigger>
          {aiVoorstellen.length > 0 && (
            <TabsTrigger value="ai-voorstellen"><Sparkles className="h-3.5 w-3.5 mr-1.5" />AI-voorstellen <Badge className="ml-1 h-4 px-1 text-xs bg-amber-100 text-amber-700 border-amber-200">{aiVoorstellen.filter(v => v.status === "open").length}</Badge></TabsTrigger>
          )}
        </TabsList>

        {/* Opleidingen */}
        <TabsContent value="opleidingen" className="space-y-3">
          <input
            ref={certFileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                const naam = (medewerkerOpleidingen ?? []).find((o) => o.id === certUploadBezigId)?.opleiding_naam ?? "Certificaat";
                certificaatUploaden(f, naam);
              }
              e.target.value = "";
              setCertUploadBezigId(null);
            }}
          />
          {magSchrijven && (
            <div className="flex justify-end">
              <Button onClick={() => openOpleiding()}><Plus className="h-4 w-4" /> Certificaat toekennen</Button>
            </div>
          )}
          {(medewerkerOpleidingen ?? []).length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <GraduationCap className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nog geen opleidingen of certificaten toegekend.</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {(medewerkerOpleidingen ?? []).map((o) => {
                const dagen = dagenTot(o.verloopt_op);
                const verlopen = dagen != null && dagen < 0;
                const binnenkort = dagen != null && dagen >= 0 && dagen <= 60;
                return (
                  <Card key={o.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{o.opleiding_naam ?? `Opleiding #${o.opleiding_id}`}</div>
                          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                            <span>Status: {o.status}</span>
                            {o.behaald_op && <span>Behaald: {fmtDatum(o.behaald_op)}</span>}
                            {o.verloopt_op && <span>Verloopt: {fmtDatum(o.verloopt_op)}</span>}
                          </div>
                          {o.opmerking && <div className="text-xs text-muted-foreground mt-1">{o.opmerking}</div>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {verlopen && <Badge variant="outline" className="border-destructive/40 text-destructive"><AlertTriangle className="h-3 w-3" /> Verlopen</Badge>}
                          {binnenkort && <Badge variant="outline" className="border-amber-200 text-amber-700"><CalendarClock className="h-3 w-3" /> Nog {dagen} dagen</Badge>}
                          {magSchrijven && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Certificaat uploaden"
                                onClick={() => {
                                  setCertUploadBezigId(o.id);
                                  certFileInputRef.current?.click();
                                }}
                              >
                                <Upload className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => openOpleiding(o)}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => verwijderOpleiding(o.id)}><Trash2 className="h-4 w-4" /></Button>
                            </>
                          )}
                        </div>
                      </div>
                      <GoedkeuringWidget
                        objectType="medewerker_opleiding"
                        objectId={o.id}
                        documentType="medewerker_opleiding"
                        omschrijving={`Certificaat ${o.opleiding_naam ?? `opleiding #${o.opleiding_id}`}${o.behaald_op ? ` (behaald ${fmtDatum(o.behaald_op)})` : ""}`}
                        toonIndienKnop={o.status === "behaald"}
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Bekwaamheden */}
        <TabsContent value="bekwaamheden" className="space-y-3">
          {magSchrijven && (
            <div className="flex justify-end">
              <Button onClick={() => openBekwaamheid()}><Plus className="h-4 w-4" /> Bekwaamheid toevoegen</Button>
            </div>
          )}
          {(bekwaamheden ?? []).length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              <Award className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>Nog geen bekwaamheden vastgelegd.</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {(bekwaamheden ?? []).map((b) => (
                <Card key={b.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{b.onderwerp}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                        {b.categorie && <span>{b.categorie}</span>}
                        {b.vastgesteld_door && <span>Door: {b.vastgesteld_door}</span>}
                        {b.vastgesteld_op && <span>{fmtDatum(b.vastgesteld_op)}</span>}
                      </div>
                      {b.opmerking && <div className="text-xs text-muted-foreground mt-1">{b.opmerking}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className={niveauBadgeClass(b.niveau)}>{niveauLabel(b.niveau)}</Badge>
                      {magSchrijven && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openBekwaamheid(b)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => verwijderBekwaamheid(b.id)}><Trash2 className="h-4 w-4" /></Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Verlof */}
        <TabsContent value="verlof" className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold mb-2">Saldo</h2>
            {(saldi ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nog geen verlofsaldo opgebouwd.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {(saldi ?? []).map((s) => (
                  <Card key={s.id}>
                    <CardContent className="p-4 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold truncate">{s.verlofsoort_naam ?? `Soort #${s.verlofsoort_id}`}</div>
                        <Badge variant="outline">{s.jaar}</Badge>
                      </div>
                      <div className="text-2xl font-bold">{uren(s.saldo_uren)}</div>
                      <div className="text-xs text-muted-foreground">
                        Begin {uren(s.beginsaldo_uren)} · opgebouwd {uren(s.opgebouwd_uren)} · opgenomen {uren(s.opgenomen_uren)}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold">Aanvragen</h2>
              {magSchrijven && (
                <Button size="sm" onClick={() => setAanvraagOpen(true)}><Plus className="h-4 w-4" /> Aanvraag indienen</Button>
              )}
            </div>
            {(aanvragen ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen verlofaanvragen.</p>
            ) : (
              <div className="space-y-2">
                {(aanvragen ?? []).map((a) => (
                  <Card key={a.id}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{a.verlofsoort_naam ?? `Soort #${a.verlofsoort_id}`}</div>
                          <div className="text-xs text-muted-foreground">
                            {fmtDatum(a.start_datum)} – {fmtDatum(a.eind_datum)} · {uren(a.aantal_uren)}
                          </div>
                          {a.reden && <div className="text-xs text-muted-foreground mt-1">{a.reden}</div>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={a.status === "goedgekeurd" ? "secondary" : "outline"} className={a.status === "afgewezen" ? "border-destructive/40 text-destructive" : a.status === "aangevraagd" ? "border-amber-200 text-amber-700" : ""}>
                            {VERLOF_STATUS_LABEL[a.status] ?? a.status}
                          </Badge>
                          {magSchrijven && a.status === "aangevraagd" && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => beoordeelAanvraag(a, "goedgekeurd")}><Check className="h-4 w-4" /> Goedkeuren</Button>
                              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => beoordeelAanvraag(a, "afgewezen")}><X className="h-4 w-4" /> Afwijzen</Button>
                            </>
                          )}
                        </div>
                      </div>
                      {a.status === "aangevraagd" && (
                        <GoedkeuringWidget
                          objectType="verlofaanvraag"
                          objectId={a.id}
                          documentType="verlofaanvraag"
                          bedrag={Math.ceil((a.aantal_uren ?? 0) / 8)}
                          omschrijving={`Verlofaanvraag ${a.verlofsoort_naam ?? ""} (${fmtDatum(a.start_datum)} – ${fmtDatum(a.eind_datum)}, ${uren(a.aantal_uren)})`}
                          toonIndienKnop
                          onWijziging={() => onGoedkeuringWijziging(a.id)}
                        />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Achtergrond / CV */}
        <TabsContent value="achtergrond" className="space-y-4">
          <input
            ref={cvFileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) cvUploaden(f);
              e.target.value = "";
            }}
          />
          <Card>
            <CardContent className="p-5">
              {medewerker.cv_tekst ? (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" /> CV / Werkachtergrond
                    </div>
                    {magSchrijven && (
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => cvFileInputRef.current?.click()} disabled={cvUploadBezig}>
                          <Upload className="h-3.5 w-3.5" /> CV uploaden
                        </Button>
                        <Button variant="ghost" size="sm" onClick={openProfiel}>
                          <Pencil className="h-3.5 w-3.5" /> Bewerken
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{medewerker.cv_tekst}</p>
                </div>
              ) : (
                <div className="py-10 text-center text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Nog geen CV of werkachtergrond ingevuld.</p>
                  {magSchrijven && (
                    <div className="flex items-center justify-center gap-2 mt-3">
                      <Button variant="outline" size="sm" onClick={() => cvFileInputRef.current?.click()} disabled={cvUploadBezig}>
                        <Upload className="h-3.5 w-3.5" />{cvUploadBezig ? "Uploaden…" : "CV uploaden"}
                      </Button>
                      <Button variant="outline" size="sm" onClick={openProfiel}>
                        <Pencil className="h-3.5 w-3.5" /> Tekst invullen
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          {(medewerker.geboortedatum || medewerker.adres || medewerker.rijbewijs || medewerker.vca_vervaldatum || medewerker.ehbo_vervaldatum || medewerker.bhv_vervaldatum) && (
            <Card>
              <CardContent className="p-5">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Overige gegevens</div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {medewerker.geboortedatum && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Cake className="h-3.5 w-3.5" /> Geboortedatum</div>
                      <div className="text-sm">{fmtDatum(medewerker.geboortedatum)}{medewerker.geboorteplaats ? `, ${medewerker.geboorteplaats}` : ""}</div>
                    </div>
                  )}
                  {(medewerker.adres || medewerker.woonplaats) && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Woonadres</div>
                      <div className="text-sm">
                        {medewerker.adres && <div>{medewerker.adres}</div>}
                        {(medewerker.postcode || medewerker.woonplaats) && <div>{[medewerker.postcode, medewerker.woonplaats].filter(Boolean).join("  ")}</div>}
                      </div>
                    </div>
                  )}
                  {medewerker.rijbewijs && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Car className="h-3.5 w-3.5" /> Rijbewijs</div>
                      <div className="text-sm">
                        {medewerker.rijbewijs}
                        {medewerker.rijbewijs_vervaldatum && <div className="text-xs text-muted-foreground">Geldig t/m {fmtDatum(medewerker.rijbewijs_vervaldatum)}</div>}
                      </div>
                    </div>
                  )}
                  {medewerker.vca_vervaldatum && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">VCA</div>
                      <div className="text-sm">{certBadge(medewerker.vca_vervaldatum)}</div>
                    </div>
                  )}
                  {medewerker.ehbo_vervaldatum && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">EHBO</div>
                      <div className="text-sm">{certBadge(medewerker.ehbo_vervaldatum)}</div>
                    </div>
                  )}
                  {medewerker.bhv_vervaldatum && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">BHV</div>
                      <div className="text-sm">{certBadge(medewerker.bhv_vervaldatum)}</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Prestaties */}
        <TabsContent value="prestaties">
          <PrestatieSectie medewerkerId={Number(id)} />
        </TabsContent>

        {/* Persoonsdocumenten */}
        <TabsContent value="documenten" className="space-y-3">
          <DocumentenTab
            medewerkerId={Number(id)}
            magBewerken={magSchrijven}
            medewerkerNaw={medewerker ? {
              naam: medewerker.naam,
              email: medewerker.email,
              telefoon: medewerker.telefoon,
              mobiel: medewerker.mobiel,
              adres: medewerker.adres,
              woonplaats: medewerker.woonplaats,
            } : undefined}
          />
        </TabsContent>

        {/* Contracten */}
        <TabsContent value="contracten">
          <MedewerkerContractenTab medewerkerId={Number(id)} />
        </TabsContent>

        {/* Salarisdocumenten */}
        {(bevoegdheden.salarisarchief ?? 0) >= 1 && (
          <TabsContent value="salarisdocumenten">
            <SalarisdocumentenTab medewerkerId={Number(id)} magBewerken={(bevoegdheden.salarisarchief ?? 0) >= 2} />
          </TabsContent>
        )}
        {/* CAO-keuzes */}
        <TabsContent value="cao-keuzes" className="space-y-3">
          {magSchrijven && (
            <div className="flex justify-end">
              <Button onClick={() => openCaoKeuze()}><Plus className="h-4 w-4 mr-1" />CAO-keuze vastleggen</Button>
            </div>
          )}
          {(caoKeuzes ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                <p className="text-sm">Nog geen CAO-keuzes vastgelegd voor deze medewerker.</p>
                {medewerker?.cao === "Bouw & Infra" ? (
                  <p className="text-xs mt-1 text-muted-foreground">
                    CAO Bouw &amp; Infra vereist jaarlijkse keuzes voor vakantiegeld en gereedschapsgeld.
                  </p>
                ) : medewerker?.cao === "Metaal & Techniek" ? (
                  <p className="text-xs mt-1 text-muted-foreground">
                    CAO Metaal &amp; Techniek kent jaarlijkse keuzes voor vakantiegeld en het PLB-budget.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {(["vakantiegeld", "gereedschapsgeld", "spaarfonds"] as const).map((type) => {
                const items = (caoKeuzes ?? []).filter((k) => k.type === type);
                if (items.length === 0) return null;
                const isMetaal = medewerker?.cao === "Metaal & Techniek";
                const typeLabel: Record<string, string> = {
                  vakantiegeld:     "Vakantiegeld",
                  gereedschapsgeld: "Gereedschapsgeld",
                  spaarfonds:       isMetaal ? "PLB-budget" : "Spaarfonds",
                };
                const keuzeLabel: Record<string, string> = {
                  // CAO Bouw & Infra — vakantiegeld
                  "55_uitbetaald":  "55% direct uitbetaald + 45% naar spaarfonds",
                  "100_spaarfonds": "100% naar spaarfonds",
                  "100_uitbetaald": "100% direct uitbetaald",
                  // CAO Bouw & Infra — gereedschapsgeld
                  "geld":           "Geldbedrag ontvangen",
                  "natura":         "Natura (bon / gereedschapsset)",
                  // CAO Bouw & Infra — spaarfonds
                  "registratie":    "Spaarfondsregistratie",
                  // CAO Metaal & Techniek — vakantiegeld en PLB-budget
                  "uitbetalen":     "Uitbetalen",
                  "verlof_kopen":   "Omzetten in verlofuren",
                  "pensioen":       "Storting pensioen (PMT)",
                };
                return (
                  <Card key={type}>
                    <CardHeader className="py-3 px-4 border-b">
                      <CardTitle className="text-sm">{typeLabel[type] ?? type}</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      {items.map((item, idx) => (
                        <div key={item.id} className={`flex items-start justify-between gap-3 p-4 ${idx > 0 ? "border-t" : ""}`}>
                          <div className="min-w-0">
                            <div className="font-medium text-sm">{keuzeLabel[item.keuze] ?? item.keuze}</div>
                            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 mt-0.5">
                              {item.jaar != null && <span>Jaar: {item.jaar}</span>}
                              {item.fonds_naam && <span>Fonds: {item.fonds_naam}</span>}
                              {item.bedrag_cents != null && (
                                <span>Bedrag: {new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(item.bedrag_cents / 100)}</span>
                              )}
                            </div>
                            {item.toelichting && (
                              <div className="text-xs text-muted-foreground mt-1">{item.toelichting}</div>
                            )}
                          </div>
                          {magSchrijven && (
                            <div className="flex gap-1 shrink-0">
                              <Button variant="ghost" size="icon" onClick={() => openCaoKeuze(item)}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => verwijderCaoKeuze(item.id)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Middelen */}
        <TabsContent value="middelen" className="space-y-3">
          {magSchrijven && (
            <div className="flex justify-end">
              <Button onClick={() => { setMiddelBewerkId(null); setMiddelForm({ categorie: "", naam: "", opmerking: "", uitgegeven_op: "" }); setMiddelOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" />Middel toevoegen
              </Button>
            </div>
          )}
          {middelen.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">Geen middelen geregistreerd voor deze medewerker.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {middelen.map((m) => (
                <Card key={m.id}>
                  <CardContent className="p-4 flex items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-sm">{m.naam}</div>
                        <Badge variant="outline" className="text-xs">{m.categorie}</Badge>
                        {m.status && m.status !== "actief" && <Badge variant="secondary" className="text-xs">{m.status}</Badge>}
                      </div>
                      {m.opmerking && <div className="text-xs text-muted-foreground">{m.opmerking}</div>}
                      <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                        {m.uitgegeven_op && <span>Uitgegeven: {new Date(m.uitgegeven_op).toLocaleDateString("nl-NL")}</span>}
                        {m.aangevraagd_op && <span>Aangevraagd: {new Date(m.aangevraagd_op).toLocaleDateString("nl-NL")}</span>}
                      </div>
                    </div>
                    {magSchrijven && (
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setMiddelBewerkId(m.id); setMiddelForm({ categorie: m.categorie, naam: m.naam, opmerking: m.opmerking ?? "", uitgegeven_op: m.uitgegeven_op ?? "" }); setMiddelOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => verwijderMiddel(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <Dialog open={middelOpen} onOpenChange={setMiddelOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>{middelBewerkId ? "Middel bewerken" : "Middel toevoegen"}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5"><Label>Categorie <span className="text-destructive">*</span></Label><Input placeholder="bijv. Laptop, Voertuig, Sleutel, Kleding" value={middelForm.categorie} onChange={(e) => setMiddelForm({ ...middelForm, categorie: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Naam / omschrijving <span className="text-destructive">*</span></Label><Input placeholder="bijv. Dell Latitude 5520, grijs" value={middelForm.naam} onChange={(e) => setMiddelForm({ ...middelForm, naam: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Opmerking</Label><Input placeholder="bijv. serienummer, locatie…" value={middelForm.opmerking} onChange={(e) => setMiddelForm({ ...middelForm, opmerking: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Uitgegeven op</Label><Input type="date" value={middelForm.uitgegeven_op} onChange={(e) => setMiddelForm({ ...middelForm, uitgegeven_op: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setMiddelOpen(false)}>Annuleren</Button>
                <Button onClick={opslaanMiddel} disabled={!middelForm.categorie || !middelForm.naam || maakMiddel.isPending || updMiddel.isPending}>Opslaan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* Onboarding-taken */}
        <TabsContent value="onboarding-taken" className="space-y-3">
          {magSchrijven && (
            <div className="flex justify-end">
              <Button onClick={() => { setTaakBewerkId(null); setTaakForm({ naam: "", categorie: "administratief", opmerking: "", deadline: "" }); setTaakOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" />Taak toevoegen
              </Button>
            </div>
          )}
          {onboardingTaken.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">Nog geen onboarding-taken aangemaakt.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {onboardingTaken.map((t) => (
                <Card key={t.id} className={t.status === "afgerond" ? "opacity-60" : ""}>
                  <CardContent className="p-4 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Checkbox checked={t.status === "afgerond"} onCheckedChange={(v) => taakAfvinken(t.id, !!v)} className="mt-0.5" />
                      <div className="space-y-0.5">
                        <div className={`font-medium text-sm ${t.status === "afgerond" ? "line-through text-muted-foreground" : ""}`}>{t.naam}</div>
                        <div className="flex gap-2 text-xs text-muted-foreground">
                          {t.categorie && <Badge variant="outline" className="text-xs h-5">{t.categorie}</Badge>}
                          {t.verantwoordelijke_naam && <span>{t.verantwoordelijke_naam}</span>}
                          {t.opmerking && <span>{t.opmerking}</span>}
                          {t.deadline && <span>Deadline: {new Date(t.deadline).toLocaleDateString("nl-NL")}</span>}
                        </div>
                      </div>
                    </div>
                    {magSchrijven && (
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setTaakBewerkId(t.id); setTaakForm({ naam: t.naam, categorie: t.categorie ?? "administratief", opmerking: t.opmerking ?? "", deadline: t.deadline ?? "" }); setTaakOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => verwijderTaak(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <Dialog open={taakOpen} onOpenChange={setTaakOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>{taakBewerkId ? "Taak bewerken" : "Onboarding-taak toevoegen"}</DialogTitle></DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5"><Label>Naam / taak <span className="text-destructive">*</span></Label><Input placeholder="bijv. Laptop inrichten, toegangspas aanvragen" value={taakForm.naam} onChange={(e) => setTaakForm({ ...taakForm, naam: e.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label>Categorie</Label>
                  <Select value={taakForm.categorie} onValueChange={(v) => setTaakForm({ ...taakForm, categorie: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["administratief","it","veiligheid","introductie","overig"].map((c) => (
                        <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label>Opmerking / verantwoordelijke</Label><Input placeholder="bijv. IT-beheer, HR" value={taakForm.opmerking} onChange={(e) => setTaakForm({ ...taakForm, opmerking: e.target.value })} /></div>
                <div className="space-y-1.5"><Label>Deadline</Label><Input type="date" value={taakForm.deadline} onChange={(e) => setTaakForm({ ...taakForm, deadline: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTaakOpen(false)}>Annuleren</Button>
                <Button onClick={opslaanTaak} disabled={!taakForm.naam || maakTaak.isPending || updTaak.isPending}>Opslaan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* AI-voorstellen */}
        {aiVoorstellen.length > 0 && (
          <TabsContent value="ai-voorstellen" className="space-y-3">
            <AiVoorstelKaart
              voorstellen={aiVoorstellen}
              onBeoordeel={(id, status, correctieTekst) => voorstelBeoordelen(id, status, correctieTekst)}
              magSchrijven={magSchrijven}
              onBulkAccepteerAanvullingen={
                magSchrijven
                  ? async () => {
                      const aanvullingen = aiVoorstellen.filter(
                        (v) =>
                          v.status === "open" &&
                          !(v.reden?.startsWith("Afwijking") ?? false) &&
                          !!v.voorgestelde_waarde?.trim(),
                      );
                      for (const v of aanvullingen) {
                        await voorstelBeoordelen(v.id, "goedgekeurd");
                      }
                    }
                  : undefined
              }
            />
          </TabsContent>
        )}

      </Tabs>

      {/* Profiel bewerken */}
      <Dialog open={profielOpen} onOpenChange={setProfielOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Profiel bewerken</DialogTitle></DialogHeader>
          {profielForm && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Naam *</Label>
                <Input value={profielForm.naam} onChange={(e) => setProfielForm({ ...profielForm, naam: e.target.value })} />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Gekoppeld account</Label>
                <Select
                  value={profielForm.gebruiker_id ? String(profielForm.gebruiker_id) : "geen"}
                  onValueChange={(v) => setProfielForm({ ...profielForm, gebruiker_id: v === "geen" ? null : Number(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geen">Geen account</SelectItem>
                    {(gebruikers ?? []).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.naam} — {g.rol}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input value={profielForm.email ?? ""} onChange={(e) => setProfielForm({ ...profielForm, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefoon</Label>
                <Input value={profielForm.telefoon ?? ""} onChange={(e) => setProfielForm({ ...profielForm, telefoon: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Werkmaatschappij</Label>
                <Select
                  value={profielForm.werkmaatschappij || undefined}
                  onValueChange={(v) =>
                    setProfielForm({
                      ...profielForm,
                      werkmaatschappij: v,
                      cao: caoVoorWerkmaatschappij(v) ?? profielForm.cao,
                    })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Kies werkmaatschappij" /></SelectTrigger>
                  <SelectContent>
                    {werkmaatschappijOpties(profielForm.werkmaatschappij).map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Hoofdfunctie</Label>
                <Select
                  value={profielForm.functie_id ? String(profielForm.functie_id) : "geen"}
                  onValueChange={(v) => setProfielForm({ ...profielForm, functie_id: v === "geen" ? null : Number(v) })}
                >
                  <SelectTrigger><SelectValue placeholder="Kies functie" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geen">Geen functie</SelectItem>
                    {(functies ?? []).some((f) => f.uitvoerend) && (
                      <SelectGroup>
                        <SelectLabel className="text-xs font-semibold text-primary">Buitendienst — zichtbaar in planning</SelectLabel>
                        {(functies ?? []).filter((f) => f.uitvoerend).map((f) => (
                          <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                    {(functies ?? []).some((f) => !f.uitvoerend) && (
                      <SelectGroup>
                        <SelectLabel className="text-xs font-semibold text-muted-foreground">Kantoor / staf — niet in planning</SelectLabel>
                        {(functies ?? []).filter((f) => !f.uitvoerend).map((f) => (
                          <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
                {(functies ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nog geen functies.{" "}
                    <Link href="/personeel" className="font-medium text-primary hover:underline">Voeg ze toe</Link>{" "}
                    in het functiehuis.
                  </p>
                )}
              </div>
              {/* Extra functies — een medewerker kan meerdere functies vervullen (aanstellingen) */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> Extra functies</Label>
                <p className="text-xs text-muted-foreground">
                  Een medewerker kan meerdere functies vervullen. De hoofdfunctie hierboven is de standaard; voeg hier extra functies toe.
                </p>
                {aanstellingen.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {aanstellingen.map((a) => (
                      <div
                        key={a.id}
                        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm ${a.is_hoofd ? "border-amber-200 bg-amber-50" : "bg-muted/40"}`}
                      >
                        <span className="font-medium">{a.functie_naam ?? "Geen functie"}</span>
                        <span className="text-muted-foreground text-xs">— {a.werkmaatschappij}</span>
                        {a.is_hoofd ? (
                          <span className="ml-0.5 text-[10px] font-semibold text-amber-700 uppercase tracking-wide">Hoofd</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => stelAlsHoofd(a.id)}
                              className="ml-0.5 text-[10px] font-medium text-muted-foreground hover:text-amber-700 uppercase tracking-wide"
                            >
                              Als hoofd
                            </button>
                            <button
                              type="button"
                              onClick={() => verwijderAanstelling(a.id)}
                              className="text-muted-foreground hover:text-destructive"
                              title="Functie verwijderen"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {(functies ?? []).length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <Select value={snelFunctieId} onValueChange={setSnelFunctieId}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Kies een functie om toe te voegen" /></SelectTrigger>
                      <SelectContent>
                        {(functies ?? []).map((f) => (
                          <SelectItem key={f.id} value={String(f.id)}>{f.naam}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!snelFunctieId || maakAanstelling.isPending}
                      onClick={snelFunctieToevoegen}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Toevoegen
                    </Button>
                  </div>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Voor een andere werkmaatschappij, CAO of contracturen per functie: gebruik de kaart <span className="font-medium">Aanstellingen</span> op deze pagina.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Leidinggevende</Label>
                <Select
                  value={profielForm.leidinggevende_id ? String(profielForm.leidinggevende_id) : "geen"}
                  onValueChange={(v) => setProfielForm({ ...profielForm, leidinggevende_id: v === "geen" ? undefined : Number(v) })}
                >
                  <SelectTrigger><SelectValue placeholder="Geen leidinggevende" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geen">Geen</SelectItem>
                    {(alleMedewerkers ?? [])
                      .filter((m) => m.id !== Number(id) && m.actief !== false)
                      .map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Bepaalt de primaire beoordelaar voor verlofaanvragen van deze medewerker.</p>
              </div>
              <div className="space-y-1.5">
                <Label>Dienstverband</Label>
                <Select value={profielForm.dienstverband} onValueChange={(v) => setProfielForm({ ...profielForm, dienstverband: v, bedrijf_uitzendbureau: (v === "uitzend" || v === "inhuur" || v === "zzp") ? (profielForm.bedrijf_uitzendbureau ?? "") : undefined, uitzendbureau_id: (v === "uitzend" || v === "inhuur" || v === "zzp") ? profielForm.uitzendbureau_id : null, zzp_bedrijfsnaam: v === "zzp" ? (profielForm.zzp_bedrijfsnaam ?? "") : undefined })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DIENSTVERBANDEN.map((d) => <SelectItem key={d} value={d}>{DIENSTVERBAND_LABELS[d] ?? d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {profielForm.dienstverband === "zzp" && (
                <div className="space-y-1.5">
                  <Label>Eigen bedrijfsnaam (ZZP)</Label>
                  <Input
                    value={profielForm.zzp_bedrijfsnaam ?? ""}
                    onChange={(e) => setProfielForm({ ...profielForm, zzp_bedrijfsnaam: e.target.value || undefined })}
                    placeholder="bijv. Jansen Installatietechniek"
                  />
                  <p className="text-[11px] text-muted-foreground">Handelsnaam van de eigen onderneming van de ZZP'er (KvK).</p>
                </div>
              )}
              {(profielForm.dienstverband === "uitzend" || profielForm.dienstverband === "inhuur" || profielForm.dienstverband === "zzp") && (
                <UitzendbureauSelect
                  idPrefix="mdw-uitzendbureau"
                  label={profielForm.dienstverband === "uitzend" ? "Uitzendbureau" : profielForm.dienstverband === "zzp" ? "Ingehuurd door (organisatie)" : "Bedrijf / onderaannemer"}
                  uitzendbureauId={profielForm.uitzendbureau_id}
                  tekst={profielForm.bedrijf_uitzendbureau ?? ""}
                  onChange={({ uitzendbureau_id, tekst }) =>
                    setProfielForm({ ...profielForm, uitzendbureau_id, bedrijf_uitzendbureau: tekst || undefined })}
                />
              )}
              {(profielForm.dienstverband === "uitzend" || profielForm.dienstverband === "inhuur") && (
                <div className="space-y-1.5">
                  <Label>Inleen-einddatum</Label>
                  <DatePicker
                    value={profielForm.inleen_einddatum ?? ""}
                    onChange={(v) => setProfielForm({ ...profielForm, inleen_einddatum: v || undefined })}
                  />
                  <p className="text-[11px] text-muted-foreground">Datum waarop de inleen-/inhuurperiode formeel afloopt (rood op de kaart bij ≤ 30 dagen).</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>CAO</Label>
                <Select value={profielForm.cao || "geen"} onValueChange={(v) => setProfielForm({ ...profielForm, cao: v === "geen" ? undefined : v })}>
                  <SelectTrigger><SelectValue placeholder="Kies CAO" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geen">Geen</SelectItem>
                    {(caoOpties ?? []).map((c) => <SelectItem key={c.naam} value={c.naam}>{c.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Contracturen/week</Label>
                <Input type="number" value={profielForm.contracturen_per_week ?? ""} onChange={(e) => setProfielForm({ ...profielForm, contracturen_per_week: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="space-y-1.5">
                <Label>Deeltijdpercentage (%)</Label>
                <Input type="number" min={1} max={100} placeholder="bijv. 80 voor 80%" value={profielForm.deeltijd_percentage ?? ""} onChange={(e) => setProfielForm({ ...profielForm, deeltijd_percentage: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="space-y-1.5">
                <Label>In dienst sinds</Label>
                <DatePicker value={profielForm.in_dienst_sinds ?? ""} onChange={(v) => setProfielForm({ ...profielForm, in_dienst_sinds: v || undefined })} />
              </div>
              <div className="space-y-1.5">
                <Label>Uit dienst per</Label>
                <DatePicker value={profielForm.uit_dienst_per ?? ""} onChange={(v) => setProfielForm({ ...profielForm, uit_dienst_per: v || undefined })} />
              </div>
              <div className="space-y-1.5">
                <Label>Noodcontact naam</Label>
                <Input value={profielForm.noodcontact_naam ?? ""} onChange={(e) => setProfielForm({ ...profielForm, noodcontact_naam: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Noodcontact telefoon</Label>
                <Input value={profielForm.noodcontact_telefoon ?? ""} onChange={(e) => setProfielForm({ ...profielForm, noodcontact_telefoon: e.target.value })} />
              </div>

              {/* Persoonsgegevens */}
              <div className="sm:col-span-2 border-t pt-3 mt-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Persoonsgegevens</div>
              </div>
              <div className="space-y-1.5">
                <Label>Geboortedatum</Label>
                <DatePicker value={profielForm.geboortedatum ?? ""} onChange={(v) => setProfielForm({ ...profielForm, geboortedatum: v || undefined })} />
              </div>
              <div className="space-y-1.5">
                <Label>Geboorteplaats</Label>
                <Input value={profielForm.geboorteplaats ?? ""} onChange={(e) => setProfielForm({ ...profielForm, geboorteplaats: e.target.value || undefined })} placeholder="Geboorteplaats" />
              </div>

              {/* Woonadres */}
              <div className="sm:col-span-2 border-t pt-3 mt-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Woonadres</div>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Straat en huisnummer</Label>
                <Input value={profielForm.adres ?? ""} onChange={(e) => setProfielForm({ ...profielForm, adres: e.target.value || undefined })} placeholder="bijv. Brandstraat 12" />
              </div>
              <div className="space-y-1.5">
                <Label>Postcode</Label>
                <Input value={profielForm.postcode ?? ""} onChange={(e) => setProfielForm({ ...profielForm, postcode: e.target.value || undefined })} placeholder="1234 AB" />
              </div>
              <div className="space-y-1.5">
                <Label>Woonplaats</Label>
                <Input value={profielForm.woonplaats ?? ""} onChange={(e) => setProfielForm({ ...profielForm, woonplaats: e.target.value || undefined })} placeholder="Plaats" />
              </div>

              {/* Rijbewijs */}
              <div className="sm:col-span-2 border-t pt-3 mt-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Rijbewijs</div>
              </div>
              <div className="space-y-1.5">
                <Label>Categorieën <span className="font-normal text-muted-foreground">(bijv. B, BE, C)</span></Label>
                <Input value={profielForm.rijbewijs ?? ""} onChange={(e) => setProfielForm({ ...profielForm, rijbewijs: e.target.value || undefined })} placeholder="B, BE, C, CE" />
              </div>
              <div className="space-y-1.5">
                <Label>Geldig tot</Label>
                <DatePicker value={profielForm.rijbewijs_vervaldatum ?? ""} onChange={(v) => setProfielForm({ ...profielForm, rijbewijs_vervaldatum: v || undefined })} />
              </div>

              {/* Veiligheidscertificaten */}
              <div className="sm:col-span-2 border-t pt-3 mt-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Veiligheidscertificaten</div>
              </div>
              <div className="space-y-1.5">
                <Label>VCA vervaldatum</Label>
                <DatePicker value={profielForm.vca_vervaldatum ?? ""} onChange={(v) => setProfielForm({ ...profielForm, vca_vervaldatum: v || undefined })} />
              </div>
              <div className="space-y-1.5">
                <Label>EHBO vervaldatum</Label>
                <DatePicker value={profielForm.ehbo_vervaldatum ?? ""} onChange={(v) => setProfielForm({ ...profielForm, ehbo_vervaldatum: v || undefined })} />
              </div>
              <div className="space-y-1.5">
                <Label>BHV vervaldatum</Label>
                <DatePicker value={profielForm.bhv_vervaldatum ?? ""} onChange={(v) => setProfielForm({ ...profielForm, bhv_vervaldatum: v || undefined })} />
              </div>

              {/* Achtergrond / CV */}
              <div className="sm:col-span-2 border-t pt-3 mt-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Achtergrond / CV</div>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Werkachtergrond en relevante ervaring</Label>
                <Textarea
                  rows={4}
                  value={profielForm.cv_tekst ?? ""}
                  onChange={(e) => setProfielForm({ ...profielForm, cv_tekst: e.target.value || undefined })}
                  placeholder="Korte samenvatting van werkervaring, eerdere functies, relevante achtergrond..."
                />
              </div>

              <label className="sm:col-span-2 flex items-center gap-2 text-sm">
                <Checkbox checked={profielForm.actief ?? true} onCheckedChange={(c) => setProfielForm({ ...profielForm, actief: Boolean(c) })} />
                Actief in dienst
              </label>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Opmerkingen</Label>
                <Textarea value={profielForm.opmerkingen ?? ""} onChange={(e) => setProfielForm({ ...profielForm, opmerkingen: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfielOpen(false)}>Annuleren</Button>
            <Button onClick={opslaanProfiel} disabled={updMedewerker.isPending}>{updMedewerker.isPending ? "Bezig…" : "Opslaan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Certificaat */}
      <Dialog open={opleidingOpen} onOpenChange={setOpleidingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{opleidingBewerkId ? "Certificaat bewerken" : "Certificaat toekennen"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Opleiding *</Label>
              {(opleidingCatalogus ?? []).length === 0 && !opleidingBewerkId ? (
                <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
                  Nog geen opleidingen in de catalogus.{" "}
                  <Link href="/personeel" className="font-medium text-primary hover:underline">Voeg ze eerst toe</Link>{" "}
                  bij Personeel → Opleidingen.
                </p>
              ) : (
                <Select
                  value={opleidingForm.opleiding_id ? String(opleidingForm.opleiding_id) : undefined}
                  onValueChange={(v) => setOpleidingForm({ ...opleidingForm, opleiding_id: Number(v) })}
                  disabled={!!opleidingBewerkId}
                >
                  <SelectTrigger><SelectValue placeholder="Kies opleiding" /></SelectTrigger>
                  <SelectContent>
                    {(opleidingCatalogus ?? []).map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={opleidingForm.status ?? "behaald"} onValueChange={(v) => setOpleidingForm({ ...opleidingForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{OPLEIDING_STATUSSEN.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Behaald op</Label>
                <DatePicker value={opleidingForm.behaald_op ?? ""} onChange={(v) => setOpleidingForm({ ...opleidingForm, behaald_op: v || null })} />
              </div>
              <div className="space-y-1.5">
                <Label>Verloopt op</Label>
                <DatePicker value={opleidingForm.verloopt_op ?? ""} onChange={(v) => setOpleidingForm({ ...opleidingForm, verloopt_op: v || null })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Opmerking</Label>
              <Textarea value={opleidingForm.opmerking ?? ""} onChange={(e) => setOpleidingForm({ ...opleidingForm, opmerking: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpleidingOpen(false)}>Annuleren</Button>
            <Button onClick={opslaanOpleiding} disabled={maakOpleiding.isPending || updOpleiding.isPending}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bekwaamheid */}
      <Dialog open={bekwaamOpen} onOpenChange={setBekwaamOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{bekwaamBewerkId ? "Bekwaamheid bewerken" : "Bekwaamheid toevoegen"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Onderwerp *</Label>
              <Input value={bekwaamForm.onderwerp} onChange={(e) => setBekwaamForm({ ...bekwaamForm, onderwerp: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Categorie</Label>
              <Input value={bekwaamForm.categorie ?? ""} onChange={(e) => setBekwaamForm({ ...bekwaamForm, categorie: e.target.value })} placeholder="bv. Brandwerende doorvoeringen" />
            </div>
            <div className="space-y-1.5">
              <Label>Niveau</Label>
              <Select value={bekwaamForm.niveau ?? "zelfstandig"} onValueChange={(v) => setBekwaamForm({ ...bekwaamForm, niveau: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NIVEAUS.map((n) => <SelectItem key={n.waarde} value={n.waarde}>{n.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vastgesteld door</Label>
                <Input value={bekwaamForm.vastgesteld_door ?? ""} onChange={(e) => setBekwaamForm({ ...bekwaamForm, vastgesteld_door: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Vastgesteld op</Label>
                <DatePicker value={bekwaamForm.vastgesteld_op ?? ""} onChange={(v) => setBekwaamForm({ ...bekwaamForm, vastgesteld_op: v || null })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Opmerking</Label>
              <Textarea value={bekwaamForm.opmerking ?? ""} onChange={(e) => setBekwaamForm({ ...bekwaamForm, opmerking: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBekwaamOpen(false)}>Annuleren</Button>
            <Button onClick={opslaanBekwaamheid} disabled={maakBekwaamheid.isPending || updBekwaamheid.isPending}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verlofaanvraag */}
      <Dialog open={aanvraagOpen} onOpenChange={setAanvraagOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verlofaanvraag indienen</DialogTitle>
            <DialogDescription>De aanvraag komt op "aangevraagd" te staan en kan daarna worden goedgekeurd.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Verlofsoort *</Label>
              <Select
                value={aanvraagForm.verlofsoort_id ? String(aanvraagForm.verlofsoort_id) : undefined}
                onValueChange={(v) => setAanvraagForm({ ...aanvraagForm, verlofsoort_id: Number(v) })}
              >
                <SelectTrigger><SelectValue placeholder="Kies soort" /></SelectTrigger>
                <SelectContent>
                  {(verlofsoorten ?? []).map((v) => <SelectItem key={v.id} value={String(v.id)}>{v.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Begindatum *</Label>
                <DatePicker value={aanvraagForm.start_datum} onChange={(v) => setAanvraagForm({ ...aanvraagForm, start_datum: v })} />
              </div>
              <div className="space-y-1.5">
                <Label>Einddatum *</Label>
                <DatePicker value={aanvraagForm.eind_datum} onChange={(v) => setAanvraagForm({ ...aanvraagForm, eind_datum: v })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Aantal uren *</Label>
              <Input type="number" min={0} step={0.5} value={aanvraagForm.aantal_uren ?? ""} onChange={(e) => setAanvraagForm({ ...aanvraagForm, aantal_uren: e.target.value ? Number(e.target.value) : 0 })} />
            </div>
            <div className="space-y-1.5">
              <Label>Reden</Label>
              <Textarea value={aanvraagForm.reden ?? ""} onChange={(e) => setAanvraagForm({ ...aanvraagForm, reden: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAanvraagOpen(false)}>Annuleren</Button>
            <Button onClick={opslaanAanvraag} disabled={maakAanvraag.isPending}>{maakAanvraag.isPending ? "Bezig…" : "Indienen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CAO-keuze vastleggen / bewerken */}
      {caoKeuzeOpen && (
        <Dialog open onOpenChange={(o) => { if (!o) setCaoKeuzeOpen(false); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{caoKeuzeBewerkId ? "CAO-keuze bewerken" : "CAO-keuze vastleggen"}</DialogTitle>
              <DialogDescription>Registreer de arbeidsvoorwaardenkeuze voor deze medewerker.</DialogDescription>
            </DialogHeader>
            {(() => {
              const isMetaal = medewerker?.cao === "Metaal & Techniek";
              const isBouw   = medewerker?.cao === "Bouw & Infra";

              // Beschikbare types per CAO
              const typeOpties: { value: MedewerkerCaoKeuzeInput["type"]; label: string }[] = isMetaal
                ? [
                    { value: "vakantiegeld", label: "Vakantiegeld" },
                    { value: "spaarfonds",   label: "PLB-budget (Persoonlijk Leefstijlbudget)" },
                  ]
                : isBouw
                ? [
                    { value: "vakantiegeld",     label: "Vakantiegeld" },
                    { value: "gereedschapsgeld", label: "Gereedschapsgeld" },
                    { value: "spaarfonds",       label: "Spaarfonds" },
                  ]
                : [
                    { value: "vakantiegeld",     label: "Vakantiegeld" },
                    { value: "gereedschapsgeld", label: "Gereedschapsgeld" },
                    { value: "spaarfonds",       label: "Spaarfonds" },
                  ];

              // Keuze-opties per type per CAO
              const keuzeOpties: Partial<Record<MedewerkerCaoKeuzeInput["type"], { value: string; label: string }[]>> = isMetaal
                ? {
                    vakantiegeld: [
                      { value: "uitbetalen",   label: "Uitbetalen (standaard, in mei)" },
                      { value: "verlof_kopen", label: "Omzetten in verlofuren" },
                      { value: "pensioen",     label: "Storting aanvullend pensioen (PMT)" },
                    ],
                    spaarfonds: [
                      { value: "uitbetalen",   label: "Uitbetalen in december" },
                      { value: "verlof_kopen", label: "Extra verlofuren kopen" },
                      { value: "pensioen",     label: "Bijdrage pensioen (PMT)" },
                    ],
                  }
                : {
                    vakantiegeld: [
                      { value: "55_uitbetaald",  label: "55% direct uitbetaald + 45% naar spaarfonds" },
                      { value: "100_spaarfonds", label: "100% naar spaarfonds" },
                      { value: "100_uitbetaald", label: "100% direct uitbetaald" },
                    ],
                    gereedschapsgeld: [
                      { value: "geld",   label: "Geldbedrag ontvangen" },
                      { value: "natura", label: "Natura (bon / gereedschapsset)" },
                    ],
                  };

              const keuzeDropdown = keuzeOpties[caoKeuzeForm.type];

              const fondsNaamPlaceholder = isMetaal
                ? "bijv. PMT Pensioenfonds Metaal & Techniek"
                : "bijv. Bouw & Infra Spaarfonds";

              const toonFondsNaam =
                caoKeuzeForm.type === "spaarfonds" ||
                (caoKeuzeForm.type === "vakantiegeld" && !isMetaal);

              return (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Type *</Label>
                    <Select
                      value={caoKeuzeForm.type}
                      onValueChange={(v) => setCaoKeuzeForm({ ...caoKeuzeForm, type: v as MedewerkerCaoKeuzeInput["type"], keuze: "" })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {typeOpties.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Keuze *</Label>
                    {keuzeDropdown ? (
                      <Select value={caoKeuzeForm.keuze} onValueChange={(v) => setCaoKeuzeForm({ ...caoKeuzeForm, keuze: v })}>
                        <SelectTrigger><SelectValue placeholder="Kies variant" /></SelectTrigger>
                        <SelectContent>
                          {keuzeDropdown.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        placeholder="bijv. naam van het spaarfonds"
                        value={caoKeuzeForm.keuze}
                        onChange={(e) => setCaoKeuzeForm({ ...caoKeuzeForm, keuze: e.target.value })}
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Jaar <span className="text-muted-foreground text-xs">(leeg = structureel)</span></Label>
                    <Input
                      type="number"
                      placeholder={String(new Date().getFullYear())}
                      value={caoKeuzeForm.jaar ?? ""}
                      onChange={(e) => setCaoKeuzeForm({ ...caoKeuzeForm, jaar: e.target.value ? Number(e.target.value) : undefined })}
                    />
                  </div>
                  {toonFondsNaam && (
                    <div className="space-y-1.5">
                      <Label>Fondsnaam <span className="text-muted-foreground text-xs">(optioneel)</span></Label>
                      <Input
                        placeholder={fondsNaamPlaceholder}
                        value={caoKeuzeForm.fonds_naam ?? ""}
                        onChange={(e) => setCaoKeuzeForm({ ...caoKeuzeForm, fonds_naam: e.target.value })}
                      />
                    </div>
                  )}
                  {caoKeuzeForm.type === "gereedschapsgeld" && caoKeuzeForm.keuze === "geld" && (
                    <div className="space-y-1.5">
                      <Label>Bedrag (€) <span className="text-muted-foreground text-xs">(optioneel)</span></Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder="0,00"
                        value={caoKeuzeForm.bedrag_cents != null ? caoKeuzeForm.bedrag_cents / 100 : ""}
                        onChange={(e) => setCaoKeuzeForm({ ...caoKeuzeForm, bedrag_cents: e.target.value ? Math.round(Number(e.target.value) * 100) : undefined })}
                      />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label>Toelichting <span className="text-muted-foreground text-xs">(optioneel)</span></Label>
                    <Textarea
                      placeholder="Aanvullende informatie..."
                      value={caoKeuzeForm.toelichting ?? ""}
                      onChange={(e) => setCaoKeuzeForm({ ...caoKeuzeForm, toelichting: e.target.value })}
                    />
                  </div>
                </div>
              );
            })()}
            <DialogFooter>
              <Button variant="outline" onClick={() => setCaoKeuzeOpen(false)}>Annuleren</Button>
              <Button onClick={opslaanCaoKeuze} disabled={maakCaoKeuze.isPending || updCaoKeuze.isPending}>
                {maakCaoKeuze.isPending || updCaoKeuze.isPending ? "Bezig…" : "Opslaan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
