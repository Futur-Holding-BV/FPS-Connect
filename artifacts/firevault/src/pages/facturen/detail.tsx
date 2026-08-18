import { KenmerkKop } from "@/components/kenmerk-kop";
import { useState, useRef, useEffect } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetFactuur,
  useUpdateFactuur,
  useAiUitlezenFactuur,
  useAccorderenFactuur,
  useBlokkerenFactuur,
  useExportAccountviewFactuur,
  useListFactuurExportLogs,
  useAfkeurenFactuur,
  useForceerHerexportFactuur,
  useDoorstuurenFactuurMedewerker,
  useBeoordelenFactuurMedewerker,
  useListFactuurOpmerkingen,
  useAddFactuurOpmerking,
  useAfhandelenFactuurOpmerking,
  useGetFactuurProceslog,
  useListToewijsbareGebruikers,
  useListFactuurHerinneringen,
  useAddFactuurHerinnering,
  useIncassoFactuur,
  useGetFactuurTijdlijn,
  useWijsFactuurAfStroom,
  useBevestigFactuurInkoop,
  useKeurFactuurGoedStroom,
  useKoppelFactuurLeverancier,
  useListLeveranciers,
  useGetFactuurPrijscontrole,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { NieuweLeverancierDialoog } from "@/components/nieuwe-leverancier-dialoog";
import type { FactuurHerinnering } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { normaliseerStorageUrl } from "@/lib/storage-url";
import { PaginaHulp } from "@/components/pagina-hulp";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImportBadge } from "@/components/import-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useListFactuurRegels } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft, Sparkles, CheckCircle2, AlertTriangle, XCircle,
  ArrowUpRight, Ban, Loader2, ChevronRight, Receipt, Shield,
  Info, Clock, RotateCcw, Eye, MessageSquare, History, UserCheck,
  Send, CornerDownRight, CheckCheck, ArrowLeftRight, Bell, Gavel,
  BellRing, FileWarning, Plus, Printer,
} from "lucide-react";
import type { Factuur, AccountviewExportLog, FactuurOpmerking, FactuurProceslogRegel } from "@workspace/api-client-react";
import { GoedkeuringWidget } from "@/components/goedkeuring/goedkeuring-widget";
import { GrootboekSelect } from "@/components/grootboek-select";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";

// FACTUUR_02 §4 — gesloten afwijsredenlijst (geen vrije tekst)
const STROOM_AFWIJSREDENEN: Record<string, string> = {
  geen_opdracht: "Geen bestelling of opdracht bekend",
  bedrag_wijkt_af: "Bedrag wijkt af van de afspraak",
  verkeerde_bv: "Gericht aan de verkeerde BV",
  dubbel: "Factuur is al eerder ontvangen",
  onvoldoende_specificatie: "Onvoldoende specificatie",
  niet_geleverd: "Niet (volledig) geleverd",
  uitzendbureau_zonder_g: "Uitzendbureau-factuur zonder G-rekeningdeel",
};

const STATUS_LABEL: Record<string, string> = {
  ontvangen: "Ontvangen",
  ai_gelezen: "AI gelezen",
  wacht_op_inkoper: "Wacht op bevestiging inkoper",
  wacht_op_goedkeuring: "Wacht op goedkeuring directie",
  klaar_voor_betaling: "Klaar voor betaling",
  controle_nodig: "Controle nodig",
  klaar_voor_boeking: "Klaar voor boeking",
  te_beoordelen_pl: "Ter accordering projectleider",
  ter_beoordeling_medewerker: "Ter beoordeling medewerker",
  te_beoordelen_wvb: "Ter beoordeling WVB",
  klaar_voor_accountview: "Klaar voor AccountView",
  verzonden_naar_accountview: "Verzonden naar AccountView",
  fout_bij_verzending: "Fout bij verzending",
  verwerkt: "Verwerkt",
  afgekeurd: "Afgekeurd",
};
const STATUS_KLEUR: Record<string, string> = {
  ontvangen: "bg-slate-100 text-slate-700",
  ai_gelezen: "bg-blue-100 text-blue-700",
  controle_nodig: "bg-amber-100 text-amber-700",
  klaar_voor_boeking: "bg-violet-100 text-violet-700",
  te_beoordelen_pl: "bg-orange-100 text-orange-700",
  ter_beoordeling_medewerker: "bg-purple-100 text-purple-700",
  te_beoordelen_wvb: "bg-cyan-100 text-cyan-700",
  klaar_voor_accountview: "bg-emerald-100 text-emerald-700",
  verzonden_naar_accountview: "bg-green-100 text-green-700",
  fout_bij_verzending: "bg-red-100 text-red-700",
  verwerkt: "bg-green-100 text-green-700",
  afgekeurd: "bg-red-100 text-red-700",
};

function euro(v?: string | null) {
  if (!v) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(parseFloat(v));
}

function Veld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <div className="text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}

export default function FactuurDetailPagina() {
  const [, params] = useRoute("/facturen/:id");
  const id = parseInt(params?.id ?? "0", 10);
  const queryClient = useQueryClient();
  const { heeftNiveau } = useBevoegdheid();
  const magMuteren = heeftNiveau("financieel", 2);

  const [bewerkOpen, setBewerkOpen] = useState(false);
  const [blokkerenOpen, setBlokkerenOpen] = useState(false);
  const [blokkeringReden, setBlokkeringReden] = useState("");
  const [afkeurenOpen, setAfkeurenOpen] = useState(false);
  const [afkeurReden, setAfkeurReden] = useState("");
  const [herexportOpen, setHerexportOpen] = useState(false);
  const [herexportReden, setHerexportReden] = useState("");
  const [herexportBezig, setHerexportBezig] = useState(false);
  const [exportResultaat, setExportResultaat] = useState<{ geslaagd: boolean; boekingId?: string | null; fout?: string | null; testmodus?: boolean } | null>(null);
  const [aiBezig, setAiBezig] = useState(false);
  const [exportBezig, setExportBezig] = useState(false);

  // Doorsturen naar medewerker
  const [doorstuurOpen, setDoorstuurOpen] = useState(false);
  const [doorstuurGebruikerId, setDoorstuurGebruikerId] = useState<string>("");
  const [doorstuurOpmerking, setDoorstuurOpmerking] = useState("");

  // Medewerker beoordeling
  const [medBeoordeelOpen, setMedBeoordeelOpen] = useState(false);
  const [medAfkeurReden, setMedAfkeurReden] = useState("");
  const [medActie, setMedActie] = useState<"goedkeuren" | "afkeuren">("goedkeuren");

  // Opmerkingen
  const [nieuweTekst, setNieuweTekst] = useState("");
  const [replyOpId, setReplyOpId] = useState<number | null>(null);
  const [actievTabblad, setActiefTabblad] = useState<"opmerkingen" | "proceslog">("opmerkingen");
  const opmerkingInputRef = useRef<HTMLTextAreaElement>(null);

  // Herinneringen / aanmaningsflow
  const [herinneringOpen, setHerinneringOpen] = useState(false);
  const [herinneringType, setHerinneringType] = useState("eerste_herinnering");
  const [herinneringEmail, setHerinneringEmail] = useState("");
  const [herinneringOpmerking, setHerinneringOpmerking] = useState("");

  // FACTUUR_02: factuurstroom
  const [stroomAfwijzenOpen, setStroomAfwijzenOpen] = useState(false);
  const [stroomRedenCode, setStroomRedenCode] = useState<string>("");

  // LEVERANCIER_01 — handmatig koppelen aan het leveranciersregister
  const [leverancierKeuze, setLeverancierKeuze] = useState<string>("");
  const [nieuweLeverancierOpen, setNieuweLeverancierOpen] = useState(false);

  // Incasso
  const [incassoOpen, setIncassoOpen] = useState(false);
  const [incassoRef, setIncassoRef] = useState("");
  const [incassoOpm, setIncassoOpm] = useState("");

  const invalideer = () => {
    queryClient.invalidateQueries({ queryKey: ["factuur", id] });
    queryClient.invalidateQueries({ queryKey: ["facturen"] });
  };
  const invalideerOpmerkingen = () => {
    queryClient.invalidateQueries({ queryKey: ["factuur-opmerkingen", id] });
    queryClient.invalidateQueries({ queryKey: ["factuur-proceslog", id] });
  };

  const { data: leveranciers = [] } = useListLeveranciers(undefined, { query: { queryKey: ["leveranciers"] } });
  const { mutate: koppelLeverancier, isPending: koppeltLeverancier } = useKoppelFactuurLeverancier({
    mutation: {
      onSuccess: (r) => {
        toast({ title: `Factuur gekoppeld aan ${r.leverancier_naam}` });
        setLeverancierKeuze("");
        invalideer();
      },
      onError: () => toast({ title: "Koppelen mislukt", variant: "destructive" }),
    },
  });

  const { data: factuur, isLoading } = useGetFactuur(
    id,
    { query: { queryKey: ["factuur", id], enabled: id > 0 } },
  );
  const { data: exportLogs = [] } = useListFactuurExportLogs(
    id,
    { query: { queryKey: ["factuur-logs", id], enabled: id > 0 } },
  );
  const { data: opmerkingen = [] } = useListFactuurOpmerkingen(
    id,
    { query: { queryKey: ["factuur-opmerkingen", id], enabled: id > 0 } },
  );
  const { data: proceslog = [] } = useGetFactuurProceslog(
    id,
    { query: { queryKey: ["factuur-proceslog", id], enabled: id > 0 } },
  );
  const { data: tijdlijn = [] } = useGetFactuurTijdlijn(
    id,
    { query: { queryKey: ["factuur-tijdlijn", id], enabled: id > 0 } },
  );
  const { data: toewijsbareGebruikers = [] } = useListToewijsbareGebruikers(
    { query: { queryKey: ["toewijsbare-gebruikers"], enabled: doorstuurOpen } },
  );
  const { data: herinneringen = [] } = useListFactuurHerinneringen(
    id,
    { query: { queryKey: ["factuur-herinneringen", id], enabled: id > 0 } },
  );

  const { toast } = useToast();
  const updateMut = useUpdateFactuur({ mutation: { onSuccess: invalideer } });
  const aiMut = useAiUitlezenFactuur({
    mutation: {
      onSuccess: invalideer,
      onError: () => toast({
        title: "AI-uitlezing mislukt",
        description: "OpenAI is niet bereikbaar of de analyse is mislukt. Probeer het later opnieuw.",
        variant: "destructive",
      }),
    },
  });
  const accorderenMut = useAccorderenFactuur({ mutation: { onSuccess: invalideer } });
  const doorstuurMut = useDoorstuurenFactuurMedewerker({
    mutation: {
      onSuccess: () => {
        invalideer(); invalideerOpmerkingen();
        setDoorstuurOpen(false); setDoorstuurGebruikerId(""); setDoorstuurOpmerking("");
      },
    },
  });
  const medBeoordeelMut = useBeoordelenFactuurMedewerker({
    mutation: {
      onSuccess: () => { invalideer(); invalideerOpmerkingen(); setMedBeoordeelOpen(false); setMedAfkeurReden(""); },
    },
  });
  const opmerkingToevoegenMut = useAddFactuurOpmerking({
    mutation: {
      onSuccess: () => { invalideerOpmerkingen(); setNieuweTekst(""); setReplyOpId(null); },
    },
  });
  const afhandelenMut = useAfhandelenFactuurOpmerking({
    mutation: { onSuccess: () => invalideerOpmerkingen() },
  });
  const herinneringMut = useAddFactuurHerinnering({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["factuur-herinneringen", id] });
        setHerinneringOpen(false);
        setHerinneringType("eerste_herinnering");
        setHerinneringEmail("");
        setHerinneringOpmerking("");
        toast({ title: "Herinnering geregistreerd" });
      },
    },
  });
  const incassoMut = useIncassoFactuur({
    mutation: {
      onSuccess: () => {
        invalideer();
        queryClient.invalidateQueries({ queryKey: ["factuur-herinneringen", id] });
        setIncassoOpen(false);
        setIncassoRef("");
        setIncassoOpm("");
        toast({ title: "Factuur naar incasso gezet" });
      },
    },
  });
  const blokkerenMut = useBlokkerenFactuur({ mutation: { onSuccess: () => { invalideer(); setBlokkerenOpen(false); } } });
  const afkeurenMut = useAfkeurenFactuur({
    mutation: {
      onSuccess: () => { invalideer(); queryClient.invalidateQueries({ queryKey: ["factuur-logs", id] }); setAfkeurenOpen(false); setAfkeurReden(""); },
    },
  });
  // FACTUUR_02 stroomacties
  const invalideerTijdlijn = () => { queryClient.invalidateQueries({ queryKey: ["factuur-tijdlijn", id] }); };
  const stroomAfwijzenMut = useWijsFactuurAfStroom({
    mutation: {
      onSuccess: () => {
        invalideer(); invalideerTijdlijn();
        setStroomAfwijzenOpen(false); setStroomRedenCode("");
        toast({ title: "Factuur afgewezen", description: "Er staat een conceptmail voor de leverancier klaar." });
      },
      onError: (err: unknown) => toast({ title: "Afwijzen mislukt", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
    },
  });
  const bevestigInkoopMut = useBevestigFactuurInkoop({
    mutation: {
      onSuccess: () => { invalideer(); invalideerTijdlijn(); toast({ title: "Bestelling bevestigd", description: "De factuur ligt nu ter goedkeuring bij de directie." }); },
      onError: (err: unknown) => toast({ title: "Bevestigen mislukt", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
    },
  });
  const goedkeurenStroomMut = useKeurFactuurGoedStroom({
    mutation: {
      onSuccess: () => { invalideer(); invalideerTijdlijn(); toast({ title: "Goedgekeurd", description: "De factuur staat klaar voor betaling." }); },
      onError: (err: unknown) => toast({ title: "Goedkeuren mislukt", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
    },
  });

  const herexportMut = useForceerHerexportFactuur({
    mutation: {
      onSuccess: (data) => {
        invalideer();
        queryClient.invalidateQueries({ queryKey: ["factuur-logs", id] });
        const r = data as { status: string; boeking_id?: string | null; foutmelding?: string | null; testmodus: boolean };
        setExportResultaat({ geslaagd: r.status === "geslaagd", boekingId: r.boeking_id, fout: r.foutmelding, testmodus: r.testmodus });
        setHerexportOpen(false);
      },
    },
  });
  const exportMut = useExportAccountviewFactuur({
    mutation: {
      onSuccess: (data) => {
        invalideer();
        queryClient.invalidateQueries({ queryKey: ["factuur-logs", id] });
        const r = data as { status: string; boeking_id?: string | null; foutmelding?: string | null; testmodus: boolean };
        setExportResultaat({ geslaagd: r.status === "geslaagd", boekingId: r.boeking_id, fout: r.foutmelding, testmodus: r.testmodus });
      },
    },
  });

  const [bewerkVelden, setBewerkVelden] = useState<Record<string, string>>({});
  function bewerkVeld(k: string, v: string) { setBewerkVelden((f) => ({ ...f, [k]: v })); }

  function openBewerk(f: Factuur) {
    setBewerkVelden({
      factuurnummer: f.factuurnummer ?? "",
      factuurdatum: f.factuurdatum ?? "",
      vervaldatum: f.vervaldatum ?? "",
      relatienaam: f.relatienaam ?? "",
      relatie_code: f.relatie_code ?? "",
      relatie_adres: f.relatie_adres ?? "",
      omschrijving: f.omschrijving ?? "",
      bedrag_excl_btw: f.bedrag_excl_btw ?? "",
      btw_bedrag: f.btw_bedrag ?? "",
      bedrag_incl_btw: f.bedrag_incl_btw ?? "",
      btw_code: f.btw_code ?? "",
      grootboekrekening: f.grootboekrekening ?? "",
      kostenplaats: f.kostenplaats ?? "",
      dagboek: f.dagboek ?? "",
      project_code: f.project_code ?? "",
    });
    setBewerkOpen(true);
  }

  async function opslaan() {
    const data: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(bewerkVelden)) {
      data[k] = v || null;
    }
    await updateMut.mutateAsync({ id, data: data as Parameters<typeof updateMut.mutateAsync>[0]["data"] });
    setBewerkOpen(false);
  }

  if (isLoading) {
    return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Laden...</div>;
  }

  const f = factuur as Factuur | undefined;
  if (!f) return <div className="p-6 text-muted-foreground">Factuur niet gevonden.</div>;

  const logs = exportLogs as AccountviewExportLog[];
  const fOpm = opmerkingen as FactuurOpmerking[];
  const fLog = proceslog as FactuurProceslogRegel[];
  const kanAi = (f.status === "ontvangen" || f.status === "controle_nodig") && !!f.pdf_url;
  const kanAccorderen = (f.status === "klaar_voor_boeking" || f.status === "ai_gelezen" || f.status === "controle_nodig") && !f.geblokkeerd && !f.geaccordeerd;
  const kanExporteren = f.status === "klaar_voor_accountview" && !f.geblokkeerd;
  const kanAfkeuren = f.status !== "verwerkt" && f.status !== "afgekeurd";
  const kanHerexport = f.status === "verwerkt" || f.status === "fout_bij_verzending";
  const isVerwerkt = f.status === "verwerkt";
  const heeftFout = f.status === "fout_bij_verzending";
  const isAfgekeurd = f.status === "afgekeurd";
  const kanDoorsturen = f.status === "te_beoordelen_pl" || f.status === "klaar_voor_boeking" || f.status === "ai_gelezen" || f.status === "controle_nodig";
  const isTerBeoordelingMedewerker = f.status === "ter_beoordeling_medewerker";

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <PaginaHulp pagina="factuur-detail" />
      {/* Navigatie */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/facturen">
          <button className="flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />Factuurverwerking
          </button>
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground truncate max-w-xs">{f.factuurnummer ?? f.bestandsnaam ?? `Factuur #${f.id}`}</span>
      </div>

      {/* Header */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <Receipt className="h-8 w-8 text-primary mt-0.5 shrink-0" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 data-paginatitel className="text-xl font-semibold text-slate-900">
                    {f.factuurnummer ?? f.bestandsnaam ?? `Factuur #${f.id}`}
                  </h1>
                  <KenmerkKop kenmerk={f.kenmerk} toelichting="Dit kenmerk staat op de uitgaande factuur. Automatisch berekend, niet bewerkbaar." />
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${f.type === "inkoop" ? "bg-slate-100 text-slate-600" : "bg-blue-50 text-blue-600"}`}>
                    {f.type === "inkoop" ? "Inkoopfactuur" : "Verkoopfactuur"}
                  </span>
                  <ImportBadge bron={f.bron} importId={f.import_id} />
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${STATUS_KLEUR[f.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {STATUS_LABEL[f.status] ?? f.status}
                  </span>
                  {f.geblokkeerd && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                      <Ban className="h-3 w-3" />Geblokkeerd{f.blokkering_reden ? `: ${f.blokkering_reden}` : ""}
                    </span>
                  )}
                  {f.geaccordeerd && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
                      <Shield className="h-3 w-3" />Geaccordeerd {f.geaccordeerd_door_naam ? `door ${f.geaccordeerd_door_naam}` : ""}
                    </span>
                  )}
                  {isVerwerkt && f.accountview_boeking_id && (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">
                      <CheckCircle2 className="h-3 w-3" />AccountView {f.accountview_boeking_id}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {magMuteren && kanAi && (
                <Button size="sm" variant="outline" disabled={aiBezig} onClick={async () => { setAiBezig(true); try { await aiMut.mutateAsync({ id }); } catch { /* onError toast */ } finally { setAiBezig(false); } }}>
                  {aiBezig ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />AI bezig...</> : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />AI uitlezen</>}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => window.open(`/facturen/${id}/print`, "_blank")}>
                <Printer className="h-3.5 w-3.5 mr-1.5" />Afdrukken
              </Button>
              {magMuteren && (
                <Button size="sm" variant="outline" onClick={() => openBewerk(f)}>Bewerken</Button>
              )}
              {magMuteren && kanAccorderen && (
                <Button size="sm" disabled={accorderenMut.isPending} onClick={() => accorderenMut.mutate({ id })}>
                  {accorderenMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                  Accorderen
                </Button>
              )}
              {magMuteren && kanExporteren && (
                <Button size="sm" disabled={exportBezig} onClick={async () => { setExportBezig(true); await exportMut.mutateAsync({ id }); setExportBezig(false); }}>
                  {exportBezig ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Verzenden...</> : <><ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />Verzenden naar AccountView</>}
                </Button>
              )}
              {magMuteren && heeftFout && (
                <Button size="sm" variant="outline" disabled={exportBezig} onClick={async () => { setExportBezig(true); await exportMut.mutateAsync({ id }); setExportBezig(false); }}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Opnieuw proberen
                </Button>
              )}
              {magMuteren && kanHerexport && (
                <Button size="sm" variant="outline" onClick={() => { setHerexportReden(""); setHerexportOpen(true); }}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Herexport
                </Button>
              )}
              {magMuteren && kanDoorsturen && (
                <Button size="sm" variant="outline" onClick={() => { setDoorstuurGebruikerId(""); setDoorstuurOpmerking(""); setDoorstuurOpen(true); }}>
                  <UserCheck className="h-3.5 w-3.5 mr-1.5" />Doorsturen naar medewerker
                </Button>
              )}
              {magMuteren && isTerBeoordelingMedewerker && (
                <Button size="sm" variant="outline" onClick={() => { setMedActie("goedkeuren"); setMedAfkeurReden(""); setMedBeoordeelOpen(true); }}>
                  <UserCheck className="h-3.5 w-3.5 mr-1.5" />Beoordelen
                </Button>
              )}
              {magMuteren && kanAfkeuren && (
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { setAfkeurReden(""); setAfkeurenOpen(true); }}>
                  <XCircle className="h-3.5 w-3.5 mr-1.5" />Afkeuren
                </Button>
              )}
              {magMuteren && (
                <Button
                  size="sm"
                  variant={f.geblokkeerd ? "outline" : "ghost"}
                  className={f.geblokkeerd ? "" : "text-muted-foreground"}
                  onClick={() => {
                    if (f.geblokkeerd) {
                      blokkerenMut.mutate({ id, data: { geblokkeerd: false } });
                    } else {
                      setBlokkeringReden("");
                      setBlokkerenOpen(true);
                    }
                  }}
                >
                  <Ban className="h-3.5 w-3.5 mr-1.5" />
                  {f.geblokkeerd ? "Deblokkeren" : "Blokkeren"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ter beoordeling medewerker banner */}
      {isTerBeoordelingMedewerker && (
        <div className="rounded-lg bg-purple-50 border border-purple-200 px-4 py-3 text-sm text-purple-800 flex items-start gap-2">
          <UserCheck className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Ter beoordeling bij medewerker</p>
            {!!(f as unknown as Record<string, unknown>)["beoordelaar_naam"] && (
              <p className="mt-0.5">Toegewezen aan: <span className="font-medium">{String((f as unknown as Record<string, unknown>)["beoordelaar_naam"])}</span></p>
            )}
            <p className="text-xs mt-1 text-purple-600">De medewerker kan de factuur goedkeuren of afkeuren. Na goedkeuring gaat de factuur terug naar de projectleider.</p>
          </div>
        </div>
      )}

      {/* Afgekeurd banner */}
      {isAfgekeurd && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Factuur afgekeurd</p>
            {!!(f as unknown as Record<string, unknown>)["afkeuring_reden"] && (
              <p className="mt-0.5">{String((f as unknown as Record<string, unknown>)["afkeuring_reden"])}</p>
            )}
            {!!(f as unknown as Record<string, unknown>)["afgekeurd_op"] && (
              <p className="text-xs mt-1 text-red-600">
                Afgekeurd op {new Date(String((f as unknown as Record<string, unknown>)["afgekeurd_op"])).toLocaleString("nl-NL")}
                {(f as unknown as Record<string, unknown>)["afgekeurd_door_naam"] ? ` door ${String((f as unknown as Record<string, unknown>)["afgekeurd_door_naam"])}` : ""}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Betaalstatus banner */}
      {(f as unknown as Record<string, unknown>)["betaalstatus"] === "betaald" && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <p>Betaald{(f as unknown as Record<string, unknown>)["betaaldatum"] ? ` op ${String((f as unknown as Record<string, unknown>)["betaaldatum"])}` : ""}</p>
        </div>
      )}
      {(f as unknown as Record<string, unknown>)["betaalstatus"] === "deels_betaald" && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <p>Gedeeltelijk betaald</p>
        </div>
      )}

      {/* Fout banner */}
      {heeftFout && f.accountview_fout && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Fout bij verzending naar AccountView</p>
            <p className="mt-0.5">{f.accountview_fout}</p>
            <p className="text-xs mt-1">Corrigeer de gegevens en klik op &ldquo;Opnieuw proberen&rdquo;.</p>
          </div>
        </div>
      )}

      {/* Goedkeuringsstatus (Governance & Approval Engine) */}
      {(() => {
        const docType = f.subtype === "creditnota" ? "creditnota"
          : f.subtype === "prijsafwijking" ? "prijsafwijking"
          : f.type === "inkoop" ? "inkoop_factuur" : "verkoop_factuur";
        const typeLabel = f.subtype === "creditnota" ? "Creditnota"
          : f.subtype === "prijsafwijking" ? "Prijsafwijking"
          : f.type === "inkoop" ? "Inkoopfactuur" : "Verkoopfactuur";
        return (
          <GoedkeuringWidget
            objectType={docType}
            objectId={id}
            documentType={docType}
            bedrag={f.bedrag_incl_btw ? parseFloat(f.bedrag_incl_btw) : null}
            omschrijving={`${typeLabel} ${f.factuurnummer ?? `#${id}`}${f.relatienaam ? ` — ${f.relatienaam}` : ""}`}
            toonIndienKnop={magMuteren && !f.geaccordeerd && !f.geblokkeerd}
            leesOnly={!magMuteren}
            onWijziging={() => invalideer()}
          />
        );
      })()}

      {/* FACTUUR_02 — Factuurstroom: acties + leesbare tijdlijn */}
      {(() => {
        const fx = f as unknown as Record<string, unknown>;
        const aiVoorstel = fx["ai_voorstel_stroom"] as Record<string, unknown> | null | undefined;
        const onzeker = (fx["onzekere_velden"] as string[] | null | undefined) ?? [];
        const afwijsCode = fx["afwijsreden_code"] as string | null | undefined;
        const heeftStroom = tijdlijn.length > 0 || ["wacht_op_inkoper", "wacht_op_goedkeuring", "klaar_voor_betaling"].includes(f.status) || !!aiVoorstel;
        if (!heeftStroom) return null;
        return (
          <Card data-testid="kaart-factuurstroom">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><History className="h-4 w-4" /> Factuurstroom</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Acties per stap */}
              <div className="flex flex-wrap gap-2">
                {magMuteren && f.status === "wacht_op_inkoper" && (
                  <Button size="sm" onClick={() => bevestigInkoopMut.mutate({ id })} disabled={bevestigInkoopMut.isPending} data-testid="knop-bevestig-inkoop">
                    {bevestigInkoopMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCheck className="h-4 w-4 mr-1" />}
                    Bestelling klopt — bevestigen
                  </Button>
                )}
                {magMuteren && f.status === "wacht_op_goedkeuring" && (
                  <Button size="sm" onClick={() => goedkeurenStroomMut.mutate({ id })} disabled={goedkeurenStroomMut.isPending} data-testid="knop-goedkeuren-stroom">
                    {goedkeurenStroomMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                    Goedkeuren — vrijgeven voor betaling
                  </Button>
                )}
                {magMuteren && !["afgekeurd", "klaar_voor_betaling", "verwerkt"].includes(f.status) && (
                  <Button size="sm" variant="destructive" onClick={() => setStroomAfwijzenOpen(true)} data-testid="knop-afwijzen-stroom">
                    <XCircle className="h-4 w-4 mr-1" /> Afwijzen…
                  </Button>
                )}
              </div>

              {f.status === "klaar_voor_betaling" && (
                <p className="text-sm text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Goedgekeurd en klaar voor betaling. Het betalen zelf gebeurt buiten dit systeem.
                </p>
              )}
              {isAfgekeurd && afwijsCode && (
                <p className="text-sm text-red-700 flex items-center gap-1.5">
                  <XCircle className="h-4 w-4" /> Afgewezen: {STROOM_AFWIJSREDENEN[afwijsCode] ?? afwijsCode}
                </p>
              )}

              {/* AI-voorstel vs uiteindelijke gegevens (§9) */}
              {aiVoorstel && (
                <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 text-sm" data-testid="blok-ai-voorstel">
                  <p className="font-medium flex items-center gap-1.5 text-amber-800"><Sparkles className="h-4 w-4" /> Wat het systeem las</p>
                  <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-amber-900">
                    {Object.entries(aiVoorstel)
                      .filter(([, w]) => w !== null && w !== undefined && w !== "" && !Array.isArray(w))
                      .map(([veld, waarde]) => (
                        <span key={veld}><span className="text-amber-700">{veld.replace(/_/g, " ")}:</span> {String(waarde)}</span>
                      ))}
                  </div>
                  {onzeker.length > 0 && (
                    <p className="mt-1.5 text-xs text-amber-800 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Onzeker gelezen: {onzeker.join(", ")} — gecontroleerd door een mens vóór verdere verwerking.
                    </p>
                  )}
                  <p className="mt-1 text-xs text-amber-700">De gegevens hierboven op deze pagina zijn de uiteindelijke, door mensen gecontroleerde waarden.</p>
                </div>
              )}

              {/* Tijdlijn (§7) */}
              {tijdlijn.length > 0 && (
                <ol className="relative border-l border-slate-200 ml-2 space-y-3" data-testid="lijst-tijdlijn">
                  {tijdlijn.map((r) => (
                    <li key={r.id} className="ml-4">
                      <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-300" />
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.gebeurd_op).toLocaleString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                      <p className="text-sm">{r.tekst}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Gegevens */}
      <div className="grid grid-cols-2 gap-4">
        {/* Partijen & basinfo */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Factuurgegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Veld label="Factuurnummer">{f.factuurnummer ?? "—"}</Veld>
              <Veld label="Type">{f.type === "inkoop" ? "Inkoopfactuur" : "Verkoopfactuur"}</Veld>
              <Veld label="Factuurdatum">{f.factuurdatum ?? "—"}</Veld>
              <Veld label="Vervaldatum">{f.vervaldatum ?? "—"}</Veld>
            </div>
            <Separator />
            <Veld label={f.type === "inkoop" ? "Crediteur" : "Debiteur"}>
              {f.relatienaam ?? "—"}
              {f.relatie_code && <span className="ml-2 font-mono text-xs text-muted-foreground">({f.relatie_code})</span>}
            </Veld>
            {f.type === "inkoop" && (
              f.leverancier_id ? (
                <Veld label="Leverancier (register)">
                  {leveranciers.find((l) => l.id === f.leverancier_id)?.naam ?? `#${f.leverancier_id}`}
                </Veld>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <p className="text-xs font-medium text-amber-800">
                    Nog niet gekoppeld aan een leverancier uit het leveranciersregister.
                  </p>
                  {magMuteren && (
                    <>
                      <div className="flex items-center gap-2">
                        <Select value={leverancierKeuze} onValueChange={setLeverancierKeuze}>
                          <SelectTrigger className="h-8 flex-1" data-testid="select-leverancier-koppelen">
                            <SelectValue placeholder="Kies een leverancier…" />
                          </SelectTrigger>
                          <SelectContent>
                            {leveranciers.filter((l) => l.actief).map((l) => (
                              <SelectItem key={l.id} value={String(l.id)}>{l.naam}{l.stad ? ` — ${l.stad}` : ""}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          disabled={!leverancierKeuze || koppeltLeverancier}
                          onClick={() => koppelLeverancier({ id, data: { leverancier_id: Number(leverancierKeuze) } })}
                          data-testid="button-leverancier-koppelen"
                        >
                          Koppelen
                        </Button>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setNieuweLeverancierOpen(true)} data-testid="button-nieuwe-leverancier">
                        Leverancier staat er niet bij? Nieuwe leverancier aanmaken
                      </Button>
                      <NieuweLeverancierDialoog
                        open={nieuweLeverancierOpen}
                        onOpenChange={setNieuweLeverancierOpen}
                        onAangemaakt={(lev) => koppelLeverancier({ id, data: { leverancier_id: lev.id } })}
                      />
                    </>
                  )}
                </div>
              )
            )}
            {f.relatie_adres && <Veld label="Adres">{f.relatie_adres}</Veld>}
            <Veld label="Omschrijving">{f.omschrijving ?? "—"}</Veld>
            {f.gebouw_naam && <Veld label="Gekoppeld gebouw">{f.gebouw_naam}</Veld>}
          </CardContent>
        </Card>

        {/* Bedragen & boekhoudkundige velden */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Financiële gegevens</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Veld label="Bedrag excl. BTW">
                <span className="font-mono">{euro(f.bedrag_excl_btw)}</span>
              </Veld>
              <Veld label="BTW-bedrag">
                <span className="font-mono">{euro(f.btw_bedrag)}</span>
              </Veld>
              <div className="col-span-2">
                <Veld label="Bedrag incl. BTW">
                  <span className="font-mono text-base font-semibold">{euro(f.bedrag_incl_btw)}</span>
                </Veld>
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-3">
              <Veld label="BTW-code">
                {f.btw_code
                  ? <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-xs">{f.btw_code}</span>
                  : <span className="text-amber-600 flex items-center gap-1 text-xs"><AlertTriangle className="h-3 w-3" />Niet ingesteld</span>}
              </Veld>
              <Veld label="Dagboek">
                <span className="font-mono">{f.dagboek ?? "—"}</span>
              </Veld>
              <Veld label="Grootboekrekening">
                <span className="font-mono">{f.grootboekrekening ?? "—"}</span>
              </Veld>
              <Veld label="Kostenplaats">
                <span className="font-mono">{f.kostenplaats ?? "—"}</span>
              </Veld>
              {f.project_code && <Veld label="Projectcode"><span className="font-mono">{f.project_code}</span></Veld>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* G-rekening verdeelsleutel */}
      {f.g_rekening_van_toepassing && f.g_rekening_bedrag && f.bedrag_incl_btw && (() => {
        const totaal = parseFloat(f.bedrag_incl_btw);
        const gBedrag = parseFloat(f.g_rekening_bedrag);
        const courant = f.normaal_bedrag ? parseFloat(f.normaal_bedrag) : totaal - gBedrag;
        const gPct = totaal > 0 ? Math.round((gBedrag / totaal) * 100) : 0;
        return (
          <Card className="border-orange-200 bg-orange-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-orange-800">
                <ArrowLeftRight className="h-4 w-4" />
                G-rekening verdeelsleutel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Visuele balk */}
              <div className="space-y-1.5">
                <div className="flex text-xs text-muted-foreground justify-between">
                  <span>Courante rekening ({100 - gPct}%)</span>
                  <span>G-rekening ({gPct}%)</span>
                </div>
                <div className="flex h-4 rounded-full overflow-hidden">
                  <div className="bg-blue-400" style={{ width: `${100 - gPct}%` }} />
                  <div className="bg-orange-400" style={{ width: `${gPct}%` }} />
                </div>
              </div>

              {/* Bedragen */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                  <div className="text-xs text-blue-700 font-medium mb-0.5">Courante rekening</div>
                  <div className="font-mono font-semibold text-blue-900">{euro(String(courant))}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Betalen op normaal IBAN</div>
                </div>
                <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                  <div className="text-xs text-orange-700 font-medium mb-0.5">G-rekening</div>
                  <div className="font-mono font-semibold text-orange-900">{euro(f.g_rekening_bedrag)}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Storten op G-rekening leverancier</div>
                </div>
              </div>

              <div className="rounded-md bg-orange-100/60 border border-orange-200 px-3 py-2 text-xs text-orange-800 flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  G-rekening is een geblokkeerde rekening voor loonheffingen. Betaal <strong>{euro(String(courant))}</strong> op het normale IBAN
                  en <strong>{euro(f.g_rekening_bedrag)}</strong> op de G-rekening van de leverancier. Totaal: <strong>{euro(f.bedrag_incl_btw)}</strong>.
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Factuurregels (AI-extractie) */}
      <FactuurRegelsKaart factuurId={id} />

      {/* AI metadata */}
      {f.ai_metadata && Object.keys(f.ai_metadata).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              AI-herkende gegevens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-sm">
              {Object.entries(f.ai_metadata as Record<string, unknown>)
                .filter(([k]) => !["controle_nodig", "controle_reden", "confidence", "type"].includes(k))
                .map(([k, v]) => (
                  <div key={k}>
                    <span className="text-xs text-muted-foreground uppercase tracking-wide">{k.replace(/_/g, " ")}</span>
                    <p className="font-medium text-slate-700 mt-0.5 text-sm">{String(v ?? "—")}</p>
                  </div>
                ))}
            </div>
            {!!(f.ai_metadata as Record<string, unknown>)["controle_reden"] && (
              <div className="mt-3 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {String((f.ai_metadata as Record<string, unknown>)["controle_reden"])}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* PDF preview link */}
      {f.pdf_url && (
        <div className="flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <a
            href={normaliseerStorageUrl(f.pdf_url)}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            PDF bekijken ({f.bestandsnaam ?? "factuur.pdf"})
          </a>
        </div>
      )}

      {/* Export logs */}
      {logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Exporthistorie ({logs.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {logs.map((l) => (
                <div key={l.id} className={`rounded-lg border px-3 py-2 text-xs ${l.status === "geslaagd" ? "border-green-200 bg-green-50" : l.status === "mislukt" ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {l.status === "geslaagd" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : l.status === "mislukt" ? <XCircle className="h-3.5 w-3.5 text-red-600" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span className="font-medium capitalize">{l.status}</span>
                      {l.testmodus && <span className="text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Testmodus</span>}
                      {l.accountview_boeking_id && <span className="font-mono text-green-700">Boeking: {l.accountview_boeking_id}</span>}
                    </div>
                    <span className="text-muted-foreground">
                      {new Date(l.export_op).toLocaleString("nl-NL")}
                    </span>
                  </div>
                  {l.foutmelding && <p className="mt-1 text-red-700">{l.foutmelding}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aanmaningsflow + Incasso */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <BellRing className="h-4 w-4" />
              Aanmaningsflow
              {herinneringen.length > 0 && (
                <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full">{herinneringen.length}</span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {magMuteren && f.betaalstatus !== "incasso" && f.betaalstatus !== "betaald" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setHerinneringOpen(true)}
                  >
                    <Bell className="h-3 w-3 mr-1" />
                    Herinnering sturen
                  </Button>
                  {herinneringen.length >= 2 && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={() => setIncassoOpen(true)}
                    >
                      <Gavel className="h-3 w-3 mr-1" />
                      Incasso
                    </Button>
                  )}
                </>
              )}
              {f.betaalstatus === "incasso" && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-medium">
                  <Gavel className="h-3 w-3" />
                  Incasso
                  {f.incasso_datum && <span className="ml-0.5 text-red-600">({new Date(f.incasso_datum).toLocaleDateString("nl-NL")})</span>}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {herinneringen.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3 text-center">
              Nog geen herinneringen of aanmaningen verstuurd.
            </p>
          ) : (
            <div className="relative">
              <div className="absolute left-3.5 top-0 bottom-0 w-px bg-slate-200" />
              <div className="space-y-3">
                {(herinneringen as FactuurHerinnering[]).map((h) => {
                  const TYPE_LABEL: Record<string, string> = {
                    eerste_herinnering: "Eerste herinnering",
                    tweede_herinnering: "Tweede herinnering",
                    aanmaning: "Aanmaning",
                    ingebrekestelling: "Ingebrekestelling",
                    incasso: "Naar incasso gezet",
                  };
                  const TYPE_KLEUR: Record<string, string> = {
                    eerste_herinnering: "bg-amber-100 text-amber-700 border-amber-200",
                    tweede_herinnering: "bg-orange-100 text-orange-700 border-orange-200",
                    aanmaning: "bg-red-100 text-red-700 border-red-200",
                    ingebrekestelling: "bg-red-200 text-red-900 border-red-300",
                    incasso: "bg-red-900 text-white border-red-900",
                  };
                  return (
                    <div key={h.id} className="relative pl-8">
                      <div className="absolute left-2 top-2 w-3 h-3 rounded-full bg-white border-2 border-slate-400" />
                      <div className="rounded-lg border px-3 py-2.5 bg-white shadow-sm text-sm">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${TYPE_KLEUR[h.type] ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>
                            <FileWarning className="h-3 w-3" />
                            {TYPE_LABEL[h.type] ?? h.type}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {h.verstuurd_op ? new Date(h.verstuurd_op).toLocaleString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : new Date(h.aangemaakt_op).toLocaleString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        </div>
                        {(h.verstuurd_door_naam || h.ontvanger_email) && (
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                            {h.verstuurd_door_naam && <span>Door: {h.verstuurd_door_naam}</span>}
                            {h.ontvanger_email && <span>Aan: {h.ontvanger_email}</span>}
                          </div>
                        )}
                        {h.opmerkingen && (
                          <p className="mt-1.5 text-xs text-slate-600 italic">{h.opmerkingen}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {f.incasso_referentie && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 flex items-start gap-1.5">
              <Gavel className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium">Incasso-referentie:</span> {f.incasso_referentie}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialoog: Herinnering registreren */}
      {herinneringOpen && (
        <Dialog open onOpenChange={setHerinneringOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Herinnering registreren
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Type</Label>
                <Select value={herinneringType} onValueChange={setHerinneringType}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="eerste_herinnering">Eerste herinnering</SelectItem>
                    <SelectItem value="tweede_herinnering">Tweede herinnering</SelectItem>
                    <SelectItem value="aanmaning">Aanmaning</SelectItem>
                    <SelectItem value="ingebrekestelling">Ingebrekestelling</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>E-mailadres ontvanger <span className="text-muted-foreground">(optioneel)</span></Label>
                <Input
                  className="mt-1"
                  type="email"
                  placeholder="debiteuren@bedrijf.nl"
                  value={herinneringEmail}
                  onChange={(e) => setHerinneringEmail(e.target.value)}
                />
              </div>
              <div>
                <Label>Opmerking <span className="text-muted-foreground">(optioneel)</span></Label>
                <Textarea
                  className="mt-1 resize-none"
                  rows={3}
                  placeholder="Aanvullende toelichting..."
                  value={herinneringOpmerking}
                  onChange={(e) => setHerinneringOpmerking(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setHerinneringOpen(false)}>Annuleren</Button>
              <Button
                onClick={() => herinneringMut.mutate({
                  id,
                  data: {
                    type: herinneringType,
                    ontvanger_email: herinneringEmail || undefined,
                    opmerkingen: herinneringOpmerking || undefined,
                  },
                })}
                disabled={herinneringMut.isPending}
              >
                {herinneringMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                <Send className="h-3.5 w-3.5 mr-1.5" />
                Registreren
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Dialoog: Naar incasso zetten */}
      {incassoOpen && (
        <Dialog open onOpenChange={setIncassoOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <Gavel className="h-4 w-4" />
                Factuur naar incasso zetten
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800 flex items-start gap-1.5">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Hiermee wordt de betaalstatus van deze factuur op <strong>Incasso</strong> gezet.
                  Dit is bedoeld voor facturen die na meerdere herinneringen en aanmaningen onbetaald zijn gebleven.
                </span>
              </div>
              <div>
                <Label>Incasso-referentie <span className="text-muted-foreground">(optioneel)</span></Label>
                <Input
                  className="mt-1"
                  placeholder="bijv. INC-2025-001 of naam deurwaarder"
                  value={incassoRef}
                  onChange={(e) => setIncassoRef(e.target.value)}
                />
              </div>
              <div>
                <Label>Opmerking <span className="text-muted-foreground">(optioneel)</span></Label>
                <Textarea
                  className="mt-1 resize-none"
                  rows={3}
                  placeholder="Toelichting voor de tijdlijn..."
                  value={incassoOpm}
                  onChange={(e) => setIncassoOpm(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIncassoOpen(false)}>Annuleren</Button>
              <Button
                variant="destructive"
                onClick={() => incassoMut.mutate({
                  id,
                  data: {
                    incasso_referentie: incassoRef || undefined,
                    opmerkingen: incassoOpm || undefined,
                  },
                })}
                disabled={incassoMut.isPending}
              >
                {incassoMut.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                <Gavel className="h-3.5 w-3.5 mr-1.5" />
                Naar incasso zetten
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Opmerkingen + Proceslog */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center gap-1 border-b">
            <button
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${actievTabblad === "opmerkingen" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiefTabblad("opmerkingen")}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Opmerkingen {fOpm.length > 0 && <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full ml-0.5">{fOpm.length}</span>}
            </button>
            <button
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${actievTabblad === "proceslog" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              onClick={() => setActiefTabblad("proceslog")}
            >
              <History className="h-3.5 w-3.5" />
              Proceslog {fLog.length > 0 && <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded-full ml-0.5">{fLog.length}</span>}
            </button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {actievTabblad === "opmerkingen" && (
            <div className="space-y-4">
              {/* Bestaande opmerkingen */}
              {fOpm.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nog geen opmerkingen bij deze factuur.</p>
              )}
              {fOpm.map((o) => (
                <div key={o.id} className={`rounded-lg border px-3 py-2.5 text-sm ${o.afgehandeld ? "bg-slate-50 border-slate-200 opacity-60" : "bg-white border-slate-200"}`}>
                  {o.reply_op_id && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
                      <CornerDownRight className="h-3 w-3" />
                      <span>Reactie</span>
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <p className={`flex-1 leading-relaxed ${o.afgehandeld ? "line-through text-muted-foreground" : ""}`}>{o.tekst}</p>
                    {magMuteren && (
                      <button
                        className={`shrink-0 mt-0.5 p-1 rounded hover:bg-slate-100 transition-colors ${o.afgehandeld ? "text-green-600" : "text-muted-foreground"}`}
                        title={o.afgehandeld ? "Heropenen" : "Markeer als afgehandeld"}
                        onClick={() => afhandelenMut.mutate({ id, oid: o.id, data: { afgehandeld: !o.afgehandeld } })}
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                    <span className="font-medium text-slate-600">{o.gebruiker_naam ?? "Onbekend"}</span>
                    <span>{new Date(o.aangemaakt_op).toLocaleString("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    {o.afgehandeld && o.afgehandeld_door_naam && (
                      <span className="text-green-600">Afgehandeld door {o.afgehandeld_door_naam}</span>
                    )}
                    {magMuteren && (
                      <button
                        className="ml-auto text-xs text-primary hover:underline"
                        onClick={() => { setReplyOpId(o.id); opmerkingInputRef.current?.focus(); }}
                      >
                        Reageren
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Nieuwe opmerking invoer — alleen voor gebruikers met schrijfrecht */}
              {magMuteren && (
                <div className="space-y-2 pt-1">
                  {replyOpId && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-slate-50 rounded px-2 py-1">
                      <CornerDownRight className="h-3 w-3" />
                      <span>Reactie op opmerking #{replyOpId}</span>
                      <button className="ml-auto text-xs hover:text-foreground" onClick={() => setReplyOpId(null)}>Annuleren</button>
                    </div>
                  )}
                  <Textarea
                    ref={opmerkingInputRef}
                    placeholder="Opmerking toevoegen…"
                    value={nieuweTekst}
                    onChange={(e) => setNieuweTekst(e.target.value)}
                    rows={2}
                    className="resize-none text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && nieuweTekst.trim()) {
                        opmerkingToevoegenMut.mutate({ id, data: { tekst: nieuweTekst.trim(), reply_op_id: replyOpId ?? undefined } });
                      }
                    }}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={!nieuweTekst.trim() || opmerkingToevoegenMut.isPending}
                      onClick={() => opmerkingToevoegenMut.mutate({ id, data: { tekst: nieuweTekst.trim(), reply_op_id: replyOpId ?? undefined } })}
                    >
                      {opmerkingToevoegenMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                      Plaatsen
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {actievTabblad === "proceslog" && (
            <div className="space-y-1">
              {fLog.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nog geen procesactiviteit voor deze factuur.</p>
              )}
              {fLog.map((r, idx) => {
                const isOpmerking = r.soort === "opmerking";
                const detail = r.detail as Record<string, unknown> | null | undefined;
                return (
                  <div key={r.id} className="relative flex gap-3">
                    {/* Tijdlijn lijn */}
                    {idx < fLog.length - 1 && (
                      <div className="absolute left-[11px] top-6 bottom-0 w-px bg-slate-200" />
                    )}
                    <div className={`shrink-0 mt-1 h-5 w-5 rounded-full flex items-center justify-center ${isOpmerking ? "bg-blue-100" : "bg-slate-100"}`}>
                      {isOpmerking
                        ? <MessageSquare className="h-3 w-3 text-blue-600" />
                        : <History className="h-3 w-3 text-slate-500" />}
                    </div>
                    <div className="pb-4 min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm leading-snug ${isOpmerking ? "text-slate-700 italic" : "text-slate-800"}`}>
                          {isOpmerking ? `"${r.omschrijving}"` : r.omschrijving}
                        </p>
                        <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(r.aangemaakt_op).toLocaleString("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                        {r.gebruiker_naam && <span className="font-medium text-slate-600">{r.gebruiker_naam}</span>}
                        {!isOpmerking && typeof detail?.["notitie"] === "string" && detail["notitie"] !== r.omschrijving && (
                          <span className="text-slate-500">{detail["notitie"] as string}</span>
                        )}
                        {isOpmerking && !!detail?.["afgehandeld"] && (
                          <span className="text-green-600 flex items-center gap-0.5"><CheckCheck className="h-3 w-3" />Afgehandeld</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Doorsturen naar medewerker dialog */}
      <Dialog open={doorstuurOpen} onOpenChange={setDoorstuurOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Doorsturen naar medewerker</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Selecteer een medewerker om de factuur te laten beoordelen. De medewerker kan de factuur goedkeuren of afkeuren. Na goedkeuring keert de factuur terug naar de projectleider.
            </p>
            <div>
              <Label>Medewerker</Label>
              <Select value={doorstuurGebruikerId} onValueChange={setDoorstuurGebruikerId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecteer medewerker..." />
                </SelectTrigger>
                <SelectContent>
                  {(toewijsbareGebruikers as Array<{ id: number; naam: string }>).map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Begeleidende opmerking (optioneel)</Label>
              <Textarea
                className="mt-1 resize-none text-sm"
                placeholder="Bijv. controleer of het BTW-tarief klopt..."
                rows={2}
                value={doorstuurOpmerking}
                onChange={(e) => setDoorstuurOpmerking(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDoorstuurOpen(false)}>Annuleren</Button>
            <Button
              disabled={!doorstuurGebruikerId || doorstuurMut.isPending}
              onClick={() => doorstuurMut.mutate({ id, data: { gebruiker_id: parseInt(doorstuurGebruikerId, 10), opmerking: doorstuurOpmerking || undefined } })}
            >
              {doorstuurMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <UserCheck className="h-3.5 w-3.5 mr-1.5" />}
              Doorsturen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Medewerker beoordeling dialog */}
      <Dialog open={medBeoordeelOpen} onOpenChange={setMedBeoordeelOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Factuur beoordelen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={medActie === "goedkeuren" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setMedActie("goedkeuren")}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Goedkeuren
              </Button>
              <Button
                size="sm"
                variant={medActie === "afkeuren" ? "destructive" : "outline"}
                className="flex-1"
                onClick={() => setMedActie("afkeuren")}
              >
                <XCircle className="h-3.5 w-3.5 mr-1.5" />Afkeuren
              </Button>
            </div>
            {medActie === "goedkeuren" && (
              <p className="text-sm text-muted-foreground">
                De factuur wordt goedgekeurd en teruggestuurd naar de projectleider voor definitieve accordering.
              </p>
            )}
            {medActie === "afkeuren" && (
              <div>
                <Label>Reden (verplicht)</Label>
                <Input
                  className="mt-1"
                  placeholder="Bijv. onjuist bedrag"
                  value={medAfkeurReden}
                  onChange={(e) => setMedAfkeurReden(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMedBeoordeelOpen(false)}>Annuleren</Button>
            <Button
              variant={medActie === "afkeuren" ? "destructive" : "default"}
              disabled={medBeoordeelMut.isPending || (medActie === "afkeuren" && !medAfkeurReden.trim())}
              onClick={() => medBeoordeelMut.mutate({ id, data: { actie: medActie, reden: medActie === "afkeuren" ? medAfkeurReden.trim() : undefined } })}
            >
              {medBeoordeelMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              {medActie === "goedkeuren" ? "Goedkeuren" : "Afkeuren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bewerken dialog */}
      <Dialog open={bewerkOpen} onOpenChange={setBewerkOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Factuurgegevens bewerken</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Factuurnummer</Label>
                <Input className="mt-1" value={bewerkVelden["factuurnummer"] ?? ""} onChange={(e) => bewerkVeld("factuurnummer", e.target.value)} />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={f.type} disabled><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inkoop">Inkoopfactuur</SelectItem><SelectItem value="verkoop">Verkoopfactuur</SelectItem></SelectContent></Select>
              </div>
              <div>
                <Label>Factuurdatum</Label>
                <Input className="mt-1" type="date" value={bewerkVelden["factuurdatum"] ?? ""} onChange={(e) => bewerkVeld("factuurdatum", e.target.value)} />
              </div>
              <div>
                <Label>Vervaldatum</Label>
                <Input className="mt-1" type="date" value={bewerkVelden["vervaldatum"] ?? ""} onChange={(e) => bewerkVeld("vervaldatum", e.target.value)} />
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{f.type === "inkoop" ? "Crediteur" : "Debiteur"}</Label>
                <Input className="mt-1" value={bewerkVelden["relatienaam"] ?? ""} onChange={(e) => bewerkVeld("relatienaam", e.target.value)} />
              </div>
              <div>
                <Label>Relatiecode (AccountView)</Label>
                <Input className="mt-1 font-mono" placeholder="bijv. LEV001" value={bewerkVelden["relatie_code"] ?? ""} onChange={(e) => bewerkVeld("relatie_code", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Omschrijving</Label>
                <Input className="mt-1" value={bewerkVelden["omschrijving"] ?? ""} onChange={(e) => bewerkVeld("omschrijving", e.target.value)} />
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Bedrag excl. BTW</Label>
                <Input className="mt-1 font-mono" placeholder="0.00" value={bewerkVelden["bedrag_excl_btw"] ?? ""} onChange={(e) => bewerkVeld("bedrag_excl_btw", e.target.value)} />
              </div>
              <div>
                <Label>BTW-bedrag</Label>
                <Input className="mt-1 font-mono" placeholder="0.00" value={bewerkVelden["btw_bedrag"] ?? ""} onChange={(e) => bewerkVeld("btw_bedrag", e.target.value)} />
              </div>
              <div>
                <Label>Bedrag incl. BTW</Label>
                <Input className="mt-1 font-mono" placeholder="0.00" value={bewerkVelden["bedrag_incl_btw"] ?? ""} onChange={(e) => bewerkVeld("bedrag_incl_btw", e.target.value)} />
              </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>BTW-code</Label>
                <Select value={bewerkVelden["btw_code"] ?? ""} onValueChange={(v) => bewerkVeld("btw_code", v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Selecteer BTW-code" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="H">H — 21% hoog tarief</SelectItem>
                    <SelectItem value="L">L — 9% laag tarief</SelectItem>
                    <SelectItem value="V">V — BTW verlegd (onderaannemer)</SelectItem>
                    <SelectItem value="0">0 — Vrijgesteld</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dagboek</Label>
                <Input className="mt-1 font-mono" placeholder="INK / VRK" value={bewerkVelden["dagboek"] ?? ""} onChange={(e) => bewerkVeld("dagboek", e.target.value)} />
              </div>
              <div>
                <Label>Grootboekrekening</Label>
                <GrootboekSelect
                  className="mt-1"
                  value={bewerkVelden["grootboekrekening"] ?? ""}
                  onChange={(v) => bewerkVeld("grootboekrekening", v ?? "")}
                />
              </div>
              <div>
                <Label>Kostenplaats</Label>
                <Input className="mt-1 font-mono" value={bewerkVelden["kostenplaats"] ?? ""} onChange={(e) => bewerkVeld("kostenplaats", e.target.value)} />
              </div>
              <div>
                <Label>Projectcode</Label>
                <Input className="mt-1 font-mono" value={bewerkVelden["project_code"] ?? ""} onChange={(e) => bewerkVeld("project_code", e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBewerkOpen(false)}>Annuleren</Button>
            <Button disabled={updateMut.isPending} onClick={opslaan}>
              {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Opslaan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Blokkeren dialog */}
      <Dialog open={blokkerenOpen} onOpenChange={setBlokkerenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Factuur blokkeren</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">De factuur wordt niet meer aangeboden voor export. U kunt de blokkering later opheffen.</p>
            <div>
              <Label>Reden (optioneel)</Label>
              <Input className="mt-1" placeholder="Bijv. in behandeling bij accountant" value={blokkeringReden} onChange={(e) => setBlokkeringReden(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlokkerenOpen(false)}>Annuleren</Button>
            <Button variant="destructive" disabled={blokkerenMut.isPending} onClick={() => blokkerenMut.mutate({ id, data: { geblokkeerd: true, reden: blokkeringReden || null } })}>
              Blokkeren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Afkeuren dialog */}
      {/* FACTUUR_02 — afwijzen met gesloten redenlijst */}
      <Dialog open={stroomAfwijzenOpen} onOpenChange={setStroomAfwijzenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Factuur afwijzen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Kies een reden uit de vaste lijst. Het systeem stelt daarna een conceptmail voor de leverancier op;
            die wordt pas verstuurd nadat een mens hem heeft gecontroleerd.
          </p>
          <div className="space-y-2">
            {Object.entries(STROOM_AFWIJSREDENEN).map(([code, label]) => (
              <label key={code} className="flex items-center gap-2 text-sm cursor-pointer rounded-md border px-3 py-2 has-[:checked]:border-primary">
                <input
                  type="radio"
                  name="stroom-afwijsreden"
                  value={code}
                  checked={stroomRedenCode === code}
                  onChange={() => setStroomRedenCode(code)}
                  data-testid={`radio-afwijsreden-${code}`}
                />
                {label}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStroomAfwijzenOpen(false)}>Annuleren</Button>
            <Button
              variant="destructive"
              disabled={!stroomRedenCode || stroomAfwijzenMut.isPending}
              onClick={() => stroomAfwijzenMut.mutate({ id, data: { reden_code: stroomRedenCode as never } })}
              data-testid="knop-bevestig-afwijzen-stroom"
            >
              {stroomAfwijzenMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Afwijzen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={afkeurenOpen} onOpenChange={setAfkeurenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Factuur afkeuren</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              De factuur wordt teruggezet naar afgekeurd en kan niet meer worden geexporteerd totdat de status wordt gecorrigeerd.
            </p>
            <div>
              <Label>Reden (verplicht)</Label>
              <Input
                className="mt-1"
                placeholder="Bijv. onjuist BTW-tarief"
                value={afkeurReden}
                onChange={(e) => setAfkeurReden(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAfkeurenOpen(false)}>Annuleren</Button>
            <Button
              variant="destructive"
              disabled={afkeurenMut.isPending || !afkeurReden.trim()}
              onClick={() => afkeurenMut.mutate({ id, data: { reden: afkeurReden.trim() } })}
            >
              {afkeurenMut.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Afkeuren...</> : "Afkeuren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Herexport dialog */}
      <Dialog open={herexportOpen} onOpenChange={setHerexportOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Herexport naar AccountView</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              De factuur wordt opnieuw verzonden naar AccountView, ook als deze al eerder is verwerkt.
            </p>
            <div>
              <Label>Reden (optioneel)</Label>
              <Input
                className="mt-1"
                placeholder="Bijv. gecorrigeerd na terugmelding"
                value={herexportReden}
                onChange={(e) => setHerexportReden(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHerexportOpen(false)}>Annuleren</Button>
            <Button
              disabled={herexportMut.isPending || herexportBezig}
              onClick={async () => {
                setHerexportBezig(true);
                await herexportMut.mutateAsync({ id, data: { reden: herexportReden || undefined } });
                setHerexportBezig(false);
              }}
            >
              {herexportMut.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Verzenden...</> : <><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Herexport starten</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export resultaat dialog */}
      {exportResultaat && (
        <Dialog open onOpenChange={() => setExportResultaat(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>AccountView export</DialogTitle></DialogHeader>
            {exportResultaat.geslaagd ? (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 flex items-start gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-green-800">Succesvol verzonden naar AccountView</p>
                  {exportResultaat.boekingId && <p className="text-sm text-green-700 mt-0.5">Boekingsnummer: <span className="font-mono">{exportResultaat.boekingId}</span></p>}
                  {exportResultaat.testmodus && <p className="text-xs text-amber-700 mt-1">(Testmodus — niet daadwerkelijk geboekt)</p>}
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 flex items-start gap-2">
                <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-red-800">Export mislukt</p>
                  <p className="text-sm text-red-700 mt-0.5">{exportResultaat.fout}</p>
                </div>
              </div>
            )}
            <DialogFooter><Button onClick={() => setExportResultaat(null)}>Sluiten</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function FactuurRegelsKaart({ factuurId }: { factuurId: number }) {
  const { data: regels, isLoading } = useListFactuurRegels(factuurId, {
    query: { queryKey: ["factuur-regels", factuurId] },
  });
  // PRIJS_01 §6 — stille prijscontrole tegen de jaarprijzen. Toont per regel
  // rustig een afwijking; niets bij 'klopt'/'geen afspraak'. Blokkeert niets.
  const { data: prijscontrole } = useGetFactuurPrijscontrole(factuurId, undefined, {
    query: { queryKey: ["factuur-prijscontrole", factuurId] },
  });
  const controlePerRegel = new Map<number, NonNullable<typeof prijscontrole>["regels"][number]>();
  for (const r of prijscontrole?.regels ?? []) controlePerRegel.set(r.regel_id, r);
  const nf = (n: number | null | undefined) => (n == null ? "" : `€ ${n.toFixed(2)}`);
  if (isLoading) return null;
  if (!regels || regels.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          Factuurregels
          <span className="ml-auto text-xs text-muted-foreground font-normal">
            {regels.length} regel{regels.length !== 1 ? "s" : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-xs text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium w-8">#</th>
                <th className="px-3 py-2 text-left font-medium">Omschrijving</th>
                <th className="px-3 py-2 text-right font-medium">Aantal</th>
                <th className="px-3 py-2 text-right font-medium">Stukprijs</th>
                <th className="px-3 py-2 text-right font-medium">Bedrag excl.</th>
                <th className="px-3 py-2 text-center font-medium">BTW</th>
                <th className="px-3 py-2 text-left font-medium">Grootboek</th>
              </tr>
            </thead>
            <tbody>
              {regels.map((r) => {
                const c = controlePerRegel.get(r.id);
                return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 text-muted-foreground">{r.regelnummer}</td>
                  <td className="px-3 py-2">
                    {r.omschrijving ?? "—"}
                    {c?.uitkomst === "afwijking" && (
                      <span
                        className="ml-2 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200"
                        title={`Jaarprijs${c.afspraak_leverancier ? ` ${c.afspraak_leverancier}` : ""}: ${nf(c.afgesproken_prijs)} — factuur ${nf(c.factuur_stukprijs)} (+${nf(c.verschil_per_stuk)}/stuk${c.verschil_totaal != null ? `, +${nf(c.verschil_totaal)} totaal` : ""})`}
                      >
                        boven jaarprijs {c.verschil_per_stuk != null ? `+${nf(c.verschil_per_stuk)}` : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {r.hoeveelheid != null ? `${r.hoeveelheid}${r.eenheid ? ` ${r.eenheid}` : ""}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">
                    {r.stukprijs != null ? `€ ${r.stukprijs}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.bedrag_excl_btw != null ? `€ ${r.bedrag_excl_btw}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.btw_code
                      ? <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-xs">{r.btw_code}</span>
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.grootboekrekening ?? "—"}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {prijscontrole && prijscontrole.aantal_afwijkingen > 0 && (
          <div className="px-3 py-2 border-t bg-amber-50/50 text-xs text-amber-800 flex items-center gap-2">
            <FileWarning className="h-3.5 w-3.5 shrink-0" />
            <span>
              {prijscontrole.aantal_afwijkingen} regel{prijscontrole.aantal_afwijkingen !== 1 ? "s" : ""} boven de afgesproken jaarprijs
              {prijscontrole.totaal_meer_betaald > 0 ? ` — samen € ${prijscontrole.totaal_meer_betaald.toFixed(2)} meer dan afgesproken` : ""}.
              {" "}Dit is een signaal, geen fout; de directie beoordeelt de afwijking.
            </span>
          </div>
        )}
        {prijscontrole && prijscontrole.aantal_niet_te_toetsen > 0 && (
          <div className="px-3 py-1.5 border-t text-[11px] text-muted-foreground">
            {prijscontrole.aantal_niet_te_toetsen} regel{prijscontrole.aantal_niet_te_toetsen !== 1 ? "s" : ""} kon niet tegen een jaarprijs worden getoetst.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
