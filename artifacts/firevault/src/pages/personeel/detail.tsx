import { useMemo, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMedewerker,
  useUpdateMedewerker,
  useDeleteMedewerker,
  useListFuncties,
  useListCaoOpties,
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
} from "@workspace/api-client-react";
import { useRol } from "@/context/rol-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { caoVoorWerkmaatschappij, werkmaatschappijOpties } from "@/lib/werkmaatschappijen";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Pencil, Trash2, Plus, GraduationCap, Award, CalendarClock,
  Mail, Phone, Briefcase, ShieldCheck, AlertTriangle, Check, X,
  MapPin, Car, FileText, Cake, Trophy, Upload, Download, FolderOpen,
} from "lucide-react";

const NIVEAUS = [
  { waarde: "niet_bevoegd", label: "Niet bevoegd" },
  { waarde: "onder_begeleiding", label: "Onder begeleiding" },
  { waarde: "zelfstandig", label: "Zelfstandig" },
  { waarde: "specialist", label: "Specialist" },
  { waarde: "trainer", label: "Trainer / instructeur" },
] as const;

const OPLEIDING_STATUSSEN = ["gepland", "behaald", "verlopen", "vrijgesteld"] as const;
const DIENSTVERBANDEN = ["vast", "tijdelijk", "oproep", "stage", "inhuur", "zzp", "uitzend"] as const;
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
  const [uploadType, setUploadType] = useState("overig");
  const [uploadLabel, setUploadLabel] = useState("");
  const [uploadVerloopdatum, setUploadVerloopdatum] = useState("");
  const [uploadDialoogOpen, setUploadDialoogOpen] = useState(false);
  const [geselecteerdBestand, setGeselecteerdBestand] = useState<File | null>(null);

  const { data: docs = [], isLoading } = useListMedewerkerDocumenten(medewerkerId, {
    query: { queryKey: getListMedewerkerDocumentenQueryKey(medewerkerId) },
  });

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

  const aanwezigTypes = new Set(docs.map((d) => d.type));

  const groepenPerType = DOCUMENT_TYPES
    .map((t) => ({ type: t, label: DOCUMENT_TYPE_LABELS[t], docs: docs.filter((d) => d.type === t) }))
    .filter((g) => g.docs.length > 0);

  const overige = docs.filter((d) => !DOCUMENT_TYPES.includes(d.type));

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
        <div className="flex justify-end">
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
      cao: medewerker.cao ?? undefined,
      dienstverband: medewerker.dienstverband,
      bedrijf_uitzendbureau: medewerker.bedrijf_uitzendbureau ?? undefined,
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
    } catch {
      toast({ title: "Beoordelen mislukt", variant: "destructive" });
    }
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
            <h1 className="text-2xl font-bold text-foreground truncate">{medewerker.naam}</h1>
            <p className="text-sm text-muted-foreground">
              {medewerker.functie_naam ?? "Geen functie"} — {medewerker.werkmaatschappij}
            </p>
          </div>
        </div>
        {magSchrijven && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={openProfiel}><Pencil className="h-4 w-4" /> Bewerken</Button>
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
              {medewerker.bedrijf_uitzendbureau ? ` (${medewerker.bedrijf_uitzendbureau})` : ""}
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
          {medewerker.uit_dienst_per && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Uit dienst per</div>
              <div className="text-sm">{fmtDatum(medewerker.uit_dienst_per)}</div>
            </div>
          )}
          {(medewerker.noodcontact_naam || medewerker.noodcontact_telefoon) && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Noodcontact</div>
              <div className="text-sm">{medewerker.noodcontact_naam ?? "—"}{medewerker.noodcontact_telefoon ? ` (${medewerker.noodcontact_telefoon})` : ""}</div>
            </div>
          )}
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

      <Tabs defaultValue="opleidingen">
        <TabsList>
          <TabsTrigger value="opleidingen">Opleidingen & certificaten</TabsTrigger>
          <TabsTrigger value="bekwaamheden">Bekwaamheden</TabsTrigger>
          <TabsTrigger value="verlof">Verlof</TabsTrigger>
          <TabsTrigger value="achtergrond"><FileText className="h-3.5 w-3.5 mr-1.5" />Achtergrond / CV</TabsTrigger>
          <TabsTrigger value="prestaties"><Trophy className="h-3.5 w-3.5 mr-1.5" />Prestaties</TabsTrigger>
          <TabsTrigger value="documenten"><FileText className="h-3.5 w-3.5 mr-1.5" />Documenten</TabsTrigger>
          {(bevoegdheden.salarisarchief ?? 0) >= 1 && (
            <TabsTrigger value="salarisdocumenten">Salarisdocumenten</TabsTrigger>
          )}
        </TabsList>

        {/* Opleidingen */}
        <TabsContent value="opleidingen" className="space-y-3">
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
                    <CardContent className="p-4 flex items-center justify-between gap-3">
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
                            <Button variant="ghost" size="icon" onClick={() => openOpleiding(o)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => verwijderOpleiding(o.id)}><Trash2 className="h-4 w-4" /></Button>
                          </>
                        )}
                      </div>
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
                    <CardContent className="p-4 flex items-center justify-between gap-3">
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
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Achtergrond / CV */}
        <TabsContent value="achtergrond" className="space-y-4">
          <Card>
            <CardContent className="p-5">
              {medewerker.cv_tekst ? (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" /> CV / Werkachtergrond
                  </div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{medewerker.cv_tekst}</p>
                </div>
              ) : (
                <div className="py-10 text-center text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Nog geen CV of werkachtergrond ingevuld.</p>
                  {magSchrijven && (
                    <p className="text-xs mt-1">Klik op <span className="font-medium">Bewerken</span> om dit aan te vullen.</p>
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

        {/* Salarisdocumenten */}
        {(bevoegdheden.salarisarchief ?? 0) >= 1 && (
          <TabsContent value="salarisdocumenten">
            <SalarisdocumentenTab medewerkerId={Number(id)} magBewerken={(bevoegdheden.salarisarchief ?? 0) >= 2} />
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
                <Label>Functie</Label>
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
              <div className="space-y-1.5">
                <Label>Dienstverband</Label>
                <Select value={profielForm.dienstverband} onValueChange={(v) => setProfielForm({ ...profielForm, dienstverband: v, bedrijf_uitzendbureau: (v === "uitzend" || v === "inhuur") ? (profielForm.bedrijf_uitzendbureau ?? "") : undefined })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DIENSTVERBANDEN.map((d) => <SelectItem key={d} value={d}>{DIENSTVERBAND_LABELS[d] ?? d}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {(profielForm.dienstverband === "uitzend" || profielForm.dienstverband === "inhuur") && (
                <div className="space-y-1.5">
                  <Label>{profielForm.dienstverband === "uitzend" ? "Naam uitzendbureau" : "Naam bedrijf / onderaannemer"}</Label>
                  <Input
                    value={profielForm.bedrijf_uitzendbureau ?? ""}
                    onChange={(e) => setProfielForm({ ...profielForm, bedrijf_uitzendbureau: e.target.value || undefined })}
                    placeholder={profielForm.dienstverband === "uitzend" ? "bijv. Randstad" : "Naam van het bedrijf"}
                  />
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
    </div>
  );
}
