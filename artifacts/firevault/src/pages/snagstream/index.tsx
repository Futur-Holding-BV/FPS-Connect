import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  annuleerSnagstreamUpload,
  useAiUitlezenSnagstreamRapport,
  useControleerSnagstreamUpload,
  useCreateSnagstreamRapport,
  useDeleteSnagstreamRapport,
  useGetSnagstreamGebouwenOverzicht,
  useListDubbeleSnagstreamRapporten,
  useListGebouwen,
  useListSnagstreamRapporten,
  useRequestSnagstreamUploadUrl,
  useUpdateSnagstreamRapport,
  useVulSnagstreamVingerafdrukkenAan,
  ApiError,
} from "@workspace/api-client-react";
import type {
  SnagstreamDubbelgroep,
  SnagstreamGebouwSamenvatting,
  SnagstreamRapport,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CircleMinus,
  Eye,
  FileArchive,
  FileText,
  Filter,
  FolderOpen,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

const GEEN_GEBOUW = "__geen_gebouw__";
const ALLES = "__alles__";

type UploadStatus =
  | "klaar"
  | "controleren"
  | "uploaden"
  | "annuleren"
  | "opgeslagen"
  | "bestaand"
  | "naamconflict"
  | "overgeslagen"
  | "mislukt";

type UploadItem = {
  sleutel: string;
  bestand: File;
  status: UploadStatus;
  vingerafdruk?: string;
  uploadToken?: string;
  rapport?: SnagstreamRapport;
  naamconflicten: SnagstreamRapport[];
  fout?: string;
};

const STATUS_LABEL: Record<string, string> = {
  nieuw: "Nieuw",
  ai_uitgelezen: "AI uitgelezen",
  concept_herkend: "Concept herkend",
  gekoppeld: "Gekoppeld",
  deels_geimporteerd: "Deels geïmporteerd",
  volledig_geimporteerd: "Volledig geïmporteerd",
  fout: "Fout",
};

const STATUS_KLEUR: Record<string, string> = {
  nieuw: "bg-slate-100 text-slate-700",
  ai_uitgelezen: "bg-blue-100 text-blue-700",
  concept_herkend: "bg-amber-100 text-amber-700",
  gekoppeld: "bg-violet-100 text-violet-700",
  deels_geimporteerd: "bg-orange-100 text-orange-700",
  volledig_geimporteerd: "bg-green-100 text-green-700",
  fout: "bg-red-100 text-red-700",
};

async function sha256(bestand: File): Promise<string> {
  const buffer = await bestand.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((deel) => deel.toString(16).padStart(2, "0")).join("");
}

function uploadFouttekst(fout: unknown): string {
  if (fout instanceof ApiError) {
    const data = fout.data as { error?: string } | undefined;
    if (data?.error) return data.error;
  }
  return fout instanceof Error ? fout.message : "Onbekende uploadfout";
}

function bestandsgrootteLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function uploadStatusLabel(item: UploadItem): string {
  switch (item.status) {
    case "klaar": return "Klaar voor controle";
    case "controleren": return "Inhoud controleren";
    case "uploaden": return "Uploaden";
    case "annuleren": return "Tijdelijke upload opruimen";
    case "opgeslagen": return "Opgeslagen";
    case "bestaand": return "Al aanwezig";
    case "naamconflict": return "Keuze nodig";
    case "overgeslagen": return "Overgeslagen";
    case "mislukt": return "Mislukt";
  }
}

function UploadStatusIcoon({ status }: { status: UploadStatus }) {
  if (status === "controleren" || status === "uploaden" || status === "annuleren") {
    return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />;
  }
  if (status === "opgeslagen") {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />;
  }
  if (status === "bestaand") {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />;
  }
  if (status === "naamconflict") {
    return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />;
  }
  if (status === "overgeslagen") {
    return <CircleMinus className="h-4 w-4 shrink-0 text-slate-500" />;
  }
  if (status === "mislukt") {
    return <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />;
  }
  return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function datumLabel(waarde?: string | null): string {
  if (!waarde) return "—";
  const datum = new Date(waarde);
  return Number.isNaN(datum.getTime()) ? waarde : datum.toLocaleDateString("nl-NL");
}

export default function SnagstreamArchiefPagina() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const backfillGestart = useRef(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [gebouwId, setGebouwId] = useState("");
  const [uploadBezig, setUploadBezig] = useState(false);
  const [batchGestart, setBatchGestart] = useState(false);
  const [aiBezig, setAiBezig] = useState<number | null>(null);
  const [zoek, setZoek] = useState("");
  const uitgesteldeZoekterm = useDeferredValue(zoek.trim());
  const [filterGebouw, setFilterGebouw] = useState("");
  const [filterJaar, setFilterJaar] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [alleenOngekoppeld, setAlleenOngekoppeld] = useState(false);
  const [koppelKeuzes, setKoppelKeuzes] = useState<Record<number, string>>({});

  const lijstParams = {
    zoek: uitgesteldeZoekterm || undefined,
    gebouw_id: filterGebouw ? Number(filterGebouw) : undefined,
    jaar: filterJaar ? Number(filterJaar) : undefined,
    status: filterStatus || undefined,
  };
  const { data: rapporten = [], isLoading } = useListSnagstreamRapporten(
    lijstParams,
    { query: { queryKey: ["snagstream-rapporten", lijstParams] } },
  );
  const { data: gebouwen = [] } = useListGebouwen(
    {},
    { query: { queryKey: ["gebouwen-snagstream"] } },
  );
  const { data: gebouwenOverzicht = [] } = useGetSnagstreamGebouwenOverzicht({
    query: { queryKey: ["snagstream-gebouwen-overzicht"] },
  });
  const { data: dubbeleGroepen = [] } = useListDubbeleSnagstreamRapporten({
    query: { queryKey: ["snagstream-dubbelen"] },
  });

  function verversArchief() {
    void queryClient.invalidateQueries({ queryKey: ["snagstream-rapporten"] });
    void queryClient.invalidateQueries({ queryKey: ["snagstream-gebouwen-overzicht"] });
    void queryClient.invalidateQueries({ queryKey: ["snagstream-dubbelen"] });
  }

  const createMut = useCreateSnagstreamRapport();
  const requestUploadMut = useRequestSnagstreamUploadUrl();
  const controleMut = useControleerSnagstreamUpload();
  const deleteMut = useDeleteSnagstreamRapport({
    mutation: { onSuccess: verversArchief },
  });
  const updateMut = useUpdateSnagstreamRapport({
    mutation: { onSuccess: verversArchief },
  });
  const aiMut = useAiUitlezenSnagstreamRapport({
    mutation: { onSuccess: verversArchief },
  });
  const backfillMut = useVulSnagstreamVingerafdrukkenAan({
    mutation: {
      onSuccess: (resultaat) => {
        if (resultaat.aangevuld > 0 || resultaat.mislukt > 0) verversArchief();
        if (resultaat.mislukt > 0) {
          toast({
            title: "Niet alle oude rapporten konden worden gecontroleerd",
            description: `${resultaat.mislukt} bestand(en) ontbreken of zijn niet leesbaar.`,
            variant: "destructive",
          });
        }
      },
    },
  });
  useEffect(() => {
    if (backfillGestart.current) return;
    backfillGestart.current = true;
    backfillMut.mutate();
  }, [backfillMut]);

  const rapportenLijst = useMemo(() => {
    const lijst = rapporten as SnagstreamRapport[];
    return alleenOngekoppeld ? lijst.filter((rapport) => rapport.gebouw_id == null) : lijst;
  }, [alleenOngekoppeld, rapporten]);
  const gebouwLijst = gebouwen as Array<{ id: number; naam: string }>;
  const jaarOpties = useMemo(
    () => Array.from({ length: 12 }, (_, index) => new Date().getFullYear() - index),
    [],
  );
  const uploadTellingen = useMemo(() => {
    const tel = (status: UploadStatus) => uploadItems.filter((item) => item.status === status).length;
    return {
      opgeslagen: tel("opgeslagen"),
      bestaand: tel("bestaand"),
      naamconflict: tel("naamconflict"),
      overgeslagen: tel("overgeslagen"),
      mislukt: tel("mislukt"),
      bezig: tel("controleren") + tel("uploaden") + tel("annuleren"),
      klaar: tel("klaar"),
    };
  }, [uploadItems]);

  async function resetUpload() {
    if (uploadBezig) return;
    const tokens = Array.from(new Set(
      uploadItems
        .map((item) => item.uploadToken)
        .filter((token): token is string => Boolean(token)),
    ));
    if (tokens.length > 0) {
      setUploadBezig(true);
      try {
        const resultaten = await Promise.allSettled(
          tokens.map((token) => annuleerSnagstreamUpload(token)),
        );
        const mislukt = resultaten.filter((resultaat) => resultaat.status === "rejected").length;
        if (mislukt > 0) {
          toast({
            title: "Tijdelijke upload nog niet opgeruimd",
            description: "Probeer de dialoog opnieuw te sluiten. De rapporten zijn niet aan het archief toegevoegd.",
            variant: "destructive",
          });
          return;
        }
      } finally {
        setUploadBezig(false);
      }
    }
    setUploadOpen(false);
    setUploadItems([]);
    setGebouwId("");
    setBatchGestart(false);
  }

  function wijzigUploadItem(sleutel: string, wijziging: Partial<UploadItem>) {
    setUploadItems((huidig) => huidig.map((item) => (
      item.sleutel === sleutel ? { ...item, ...wijziging } : item
    )));
  }

  async function uploadRapportBestand(
    item: UploadItem,
    vingerafdruk: string,
    naamconflictBevestigd: boolean,
  ): Promise<UploadStatus> {
    wijzigUploadItem(item.sleutel, {
      status: "uploaden",
      vingerafdruk,
      fout: undefined,
    });
    let uploadToken = item.uploadToken;
    try {
      if (!uploadToken) {
        const upload = await requestUploadMut.mutateAsync({
          data: {
            bestandsnaam: item.bestand.name,
            bestandsgrootte: item.bestand.size,
            vingerafdruk,
          },
        });
        uploadToken = upload.upload_token;
        wijzigUploadItem(item.sleutel, { uploadToken });
        const opslagRespons = await fetch(upload.upload_url, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: item.bestand,
        });
        if (!opslagRespons.ok) throw new Error(`Objectupload mislukt (${opslagRespons.status})`);
      }
      let rapport: SnagstreamRapport;
      try {
        rapport = await createMut.mutateAsync({
          data: {
            bestandsnaam: item.bestand.name,
            upload_token: uploadToken,
            vingerafdruk,
            naamconflict_bevestigd: naamconflictBevestigd,
            gebouw_id: gebouwId ? Number(gebouwId) : undefined,
          },
        });
      } catch (fout) {
        const data = fout instanceof ApiError ? fout.data as { code?: string } | undefined : undefined;
        if (fout instanceof ApiError && fout.status === 409 && data?.code === "naamconflict") {
          const controle = await controleMut.mutateAsync({
            data: { bestandsnaam: item.bestand.name, vingerafdruk },
          });
          wijzigUploadItem(item.sleutel, {
            status: "naamconflict",
            uploadToken,
            vingerafdruk,
            naamconflicten: controle.naamconflicten,
          });
          return "naamconflict";
        }
        throw fout;
      }
      const status = rapport.upload_dubbel ? "bestaand" : "opgeslagen";
      wijzigUploadItem(item.sleutel, {
        status,
        rapport,
        uploadToken: undefined,
        naamconflicten: [],
      });
      return status;
    } catch (fout) {
      wijzigUploadItem(item.sleutel, {
        status: "mislukt",
        uploadToken,
        fout: uploadFouttekst(fout),
      });
      return "mislukt";
    }
  }

  async function verwerkUploadItem(item: UploadItem): Promise<UploadStatus> {
    wijzigUploadItem(item.sleutel, {
      status: "controleren",
      fout: undefined,
      naamconflicten: [],
    });
    try {
      const vingerafdruk = await sha256(item.bestand);
      wijzigUploadItem(item.sleutel, { vingerafdruk });
      const controle = await controleMut.mutateAsync({
        data: { bestandsnaam: item.bestand.name, vingerafdruk },
      });
      if (controle.uitkomst === "exact_dubbel" && controle.bestaand_rapport) {
        wijzigUploadItem(item.sleutel, {
          status: "bestaand",
          rapport: controle.bestaand_rapport,
          naamconflicten: [],
        });
        return "bestaand";
      }
      if (controle.uitkomst === "naamconflict") {
        wijzigUploadItem(item.sleutel, {
          status: "naamconflict",
          vingerafdruk,
          naamconflicten: controle.naamconflicten,
        });
        return "naamconflict";
      }
      return uploadRapportBestand(item, vingerafdruk, false);
    } catch (fout) {
      wijzigUploadItem(item.sleutel, {
        status: "mislukt",
        fout: uploadFouttekst(fout),
      });
      return "mislukt";
    }
  }

  async function handleUploadBatch() {
    const teVerwerken = uploadItems.filter((item) => item.status === "klaar");
    if (teVerwerken.length === 0) return;
    setBatchGestart(true);
    setUploadBezig(true);
    const resultaten: UploadStatus[] = [];
    try {
      for (const item of teVerwerken) {
        resultaten.push(await verwerkUploadItem(item));
      }
      if (resultaten.some((status) => status === "opgeslagen")) verversArchief();
      const opgeslagen = resultaten.filter((status) => status === "opgeslagen").length;
      const bestaand = resultaten.filter((status) => status === "bestaand").length;
      const naamconflict = resultaten.filter((status) => status === "naamconflict").length;
      const mislukt = resultaten.filter((status) => status === "mislukt").length +
        uploadItems.filter((item) => item.status === "mislukt").length;
      const samenvatting = [
        opgeslagen > 0 ? `${opgeslagen} opgeslagen` : "",
        bestaand > 0 ? `${bestaand} al aanwezig` : "",
        naamconflict > 0 ? `${naamconflict} wacht op een keuze` : "",
        mislukt > 0 ? `${mislukt} mislukt` : "",
      ].filter(Boolean).join(" · ");
      toast({
        title: naamconflict > 0 ? "Batch gecontroleerd" : "Batch verwerkt",
        description: samenvatting || "Geen bestanden verwerkt.",
        variant: mislukt > 0 && opgeslagen === 0 ? "destructive" : "default",
      });
    } finally {
      setUploadBezig(false);
    }
  }

  async function bevestigNaamconflict(item: UploadItem) {
    if (!item.vingerafdruk) return;
    setUploadBezig(true);
    try {
      const status = await uploadRapportBestand(item, item.vingerafdruk, true);
      if (status === "opgeslagen") {
        verversArchief();
        toast({ title: "Rapport opgeslagen", description: item.bestand.name });
      } else if (status === "bestaand") {
        toast({ title: "Rapport bestond al", description: item.bestand.name });
      } else if (status === "mislukt") {
        toast({
          title: "Upload mislukt",
          description: `${item.bestand.name} is niet aan het archief toegevoegd.`,
          variant: "destructive",
        });
      }
    } finally {
      setUploadBezig(false);
    }
  }

  async function slaNaamconflictOver(item: UploadItem) {
    if (!item.uploadToken) {
      wijzigUploadItem(item.sleutel, {
        status: "overgeslagen",
        naamconflicten: [],
        fout: undefined,
      });
      return;
    }

    setUploadBezig(true);
    wijzigUploadItem(item.sleutel, { status: "annuleren", fout: undefined });
    try {
      await annuleerSnagstreamUpload(item.uploadToken);
      wijzigUploadItem(item.sleutel, {
        status: "overgeslagen",
        uploadToken: undefined,
        naamconflicten: [],
        fout: undefined,
      });
    } catch (fout) {
      wijzigUploadItem(item.sleutel, {
        status: "naamconflict",
        fout: uploadFouttekst(fout),
      });
      toast({
        title: "Overslaan nog niet gelukt",
        description: `${item.bestand.name}: de tijdelijke upload kon niet worden opgeruimd. Probeer het opnieuw.`,
        variant: "destructive",
      });
    } finally {
      setUploadBezig(false);
    }
  }

  async function handleAiUitlezen(id: number) {
    setAiBezig(id);
    try {
      await aiMut.mutateAsync({ id });
    } finally {
      setAiBezig(null);
    }
  }

  async function koppelOngekoppeldRapport(rapportId: number) {
    const keuze = koppelKeuzes[rapportId];
    if (!keuze) return;
    await updateMut.mutateAsync({ id: rapportId, data: { gebouw_id: Number(keuze) } });
    setKoppelKeuzes((huidig) => ({ ...huidig, [rapportId]: "" }));
    toast({ title: "Rapport gekoppeld aan gebouw" });
  }

  function kiesGebouwgroep(groep: SnagstreamGebouwSamenvatting) {
    if (groep.gebouw_id == null) {
      setAlleenOngekoppeld(true);
      setFilterGebouw("");
    } else {
      setAlleenOngekoppeld(false);
      setFilterGebouw(String(groep.gebouw_id));
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 data-paginatitel className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <FileArchive className="h-6 w-6 text-primary" />
            Snagstream archief
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Eenmalige Snagstream-rapporten terugvinden, koppelen en gecontroleerd overnemen.
          </p>
        </div>
        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          PDF&apos;s uploaden
        </Button>
      </div>

      {(gebouwenOverzicht as SnagstreamGebouwSamenvatting[]).length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-slate-900">Gebouwen in het archief</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(gebouwenOverzicht as SnagstreamGebouwSamenvatting[]).map((groep) => (
              <button
                key={groep.gebouw_id ?? "ongekoppeld"}
                type="button"
                onClick={() => kiesGebouwgroep(groep)}
                className={`text-left rounded-lg border p-4 transition-colors hover:border-primary/50 hover:bg-slate-50 ${
                  groep.gebouw_id == null ? "border-amber-300 bg-amber-50/50 sm:col-span-2 lg:col-span-3" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{groep.gebouw_naam}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Recentste rapport: {datumLabel(groep.recentste_rapportdatum)}
                    </p>
                  </div>
                  <FolderOpen className={`h-5 w-5 ${groep.gebouw_id == null ? "text-amber-600" : "text-slate-400"}`} />
                </div>
                <div className="flex gap-4 mt-3 text-sm">
                  <span><strong>{groep.rapport_count}</strong> rapporten</span>
                  <span><strong>{groep.snag_count}</strong> snags</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {(dubbeleGroepen as SnagstreamDubbelgroep[]).length > 0 && (
        <Card className="border-amber-300 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              Dubbele bestaande uploads opruimen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(dubbeleGroepen as SnagstreamDubbelgroep[]).map((groep) => (
              <div key={groep.vingerafdruk} className="rounded-md border bg-white divide-y">
                {groep.rapporten.map((rapport, index) => (
                  <div key={rapport.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <Link href={`/snagstream/${rapport.id}`} className="font-medium hover:underline truncate block">
                        {rapport.bestandsnaam}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {datumLabel(rapport.aangemaakt_op)} · {rapport.uploader_naam ?? "Onbekende uploader"}
                        {index === groep.rapporten.length - 1 ? " · oudste exemplaar" : ""}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={deleteMut.isPending}
                      onClick={() => {
                        if (confirm(`Dubbel rapport "${rapport.bestandsnaam}" verwijderen?`)) {
                          deleteMut.mutate({ id: rapport.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                      Verwijderen
                    </Button>
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_220px_140px_190px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={zoek}
                onChange={(event) => setZoek(event.target.value)}
                placeholder="Zoek in rapporten en snags..."
                className="pl-9"
              />
            </div>
            <Select
              value={alleenOngekoppeld ? GEEN_GEBOUW : (filterGebouw || ALLES)}
              onValueChange={(waarde) => {
                setAlleenOngekoppeld(waarde === GEEN_GEBOUW);
                setFilterGebouw(waarde === ALLES || waarde === GEEN_GEBOUW ? "" : waarde);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Alle gebouwen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALLES}>Alle gebouwen</SelectItem>
                <SelectItem value={GEEN_GEBOUW}>Nog niet gekoppeld</SelectItem>
                {gebouwLijst.map((gebouw) => (
                  <SelectItem key={gebouw.id} value={String(gebouw.id)}>{gebouw.naam}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterJaar || ALLES} onValueChange={(waarde) => setFilterJaar(waarde === ALLES ? "" : waarde)}>
              <SelectTrigger><SelectValue placeholder="Alle jaren" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALLES}>Alle jaren</SelectItem>
                {jaarOpties.map((jaar) => <SelectItem key={jaar} value={String(jaar)}>{jaar}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus || ALLES} onValueChange={(waarde) => setFilterStatus(waarde === ALLES ? "" : waarde)}>
              <SelectTrigger><SelectValue placeholder="Alle statussen" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALLES}>Alle statussen</SelectItem>
                {Object.entries(STATUS_LABEL).map(([waarde, label]) => (
                  <SelectItem key={waarde} value={waarde}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              disabled={!zoek && !filterGebouw && !filterJaar && !filterStatus && !alleenOngekoppeld}
              onClick={() => {
                setZoek("");
                setFilterGebouw("");
                setFilterJaar("");
                setFilterStatus("");
                setAlleenOngekoppeld(false);
              }}
            >
              <Filter className="h-3.5 w-3.5 mr-1" />
              Wissen
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Laden...
        </div>
      ) : rapportenLijst.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileArchive className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">
              {zoek || filterGebouw || filterJaar || filterStatus || alleenOngekoppeld
                ? "Geen rapporten gevonden met deze zoekopdracht en filters."
                : "Nog geen Snagstream rapporten geüpload."}
            </p>
            {!zoek && !filterGebouw && !filterJaar && !filterStatus && !alleenOngekoppeld && (
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setUploadOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Eerste rapport uploaden
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Bestandsnaam / treffers</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Opdrachtgever</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Gebouw</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Datum</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Snags</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-600">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rapportenLijst.map((rapport) => (
                <tr key={rapport.id} className="hover:bg-slate-50/50 align-top">
                  <td className="px-4 py-3 font-medium max-w-sm">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="truncate">{rapport.bestandsnaam}</span>
                    </div>
                    {(rapport.zoek_treffers ?? []).map((treffer) => (
                      <Link
                        key={treffer.snag_id}
                        href={`/snagstream/${rapport.id}#snag-${treffer.snag_id}`}
                        className="mt-2 block rounded border bg-primary/5 px-2 py-1.5 text-xs font-normal hover:border-primary/40"
                      >
                        <span className="font-medium">
                          Snag {treffer.snagnummer ?? `#${treffer.snag_id}`}
                          {treffer.pdf_pagina ? ` · pagina ${treffer.pdf_pagina}` : ""}
                        </span>
                        <span className="block text-muted-foreground truncate">
                          {[treffer.verdieping, treffer.ruimte, treffer.omschrijving].filter(Boolean).join(" · ")}
                        </span>
                      </Link>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{rapport.opdrachtgever ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {rapport.gebouw_naam ?? (
                      <div className="min-w-48 space-y-2">
                        <span className="text-amber-700 font-medium">Nog niet gekoppeld</span>
                        <div className="flex gap-1">
                          <Select
                            value={koppelKeuzes[rapport.id] || ""}
                            onValueChange={(waarde) => setKoppelKeuzes((huidig) => ({ ...huidig, [rapport.id]: waarde }))}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Kies gebouw" /></SelectTrigger>
                            <SelectContent>
                              {gebouwLijst.map((gebouw) => (
                                <SelectItem key={gebouw.id} value={String(gebouw.id)}>{gebouw.naam}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            size="sm"
                            className="h-7"
                            disabled={!koppelKeuzes[rapport.id] || updateMut.isPending}
                            onClick={() => void koppelOngekoppeldRapport(rapport.id)}
                          >
                            Koppel
                          </Button>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{rapport.rapportdatum ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_KLEUR[rapport.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {STATUS_LABEL[rapport.status] ?? rapport.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {(rapport.snag_count ?? 0) > 0 ? `${rapport.snag_count} snags` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {rapport.status === "nieuw" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={aiBezig === rapport.id}
                          onClick={() => void handleAiUitlezen(rapport.id)}
                        >
                          {aiBezig === rapport.id
                            ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            : <Sparkles className="h-3 w-3 mr-1" />}
                          AI uitlezen
                        </Button>
                      )}
                      <Link href={`/snagstream/${rapport.id}`}>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label="Rapport openen">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        aria-label="Rapport verwijderen"
                        onClick={() => {
                          if (confirm("Rapport verwijderen?")) deleteMut.mutate({ id: rapport.id });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={(open) => {
        if (!open && uploadBezig) return;
        if (open) setUploadOpen(true);
        else void resetUpload();
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Snagstream PDF&apos;s uploaden</DialogTitle>
            <DialogDescription>
              Kies één of meerdere rapporten. Connect controleert ieder bestand afzonderlijk voordat het wordt opgeslagen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="snagstream-pdf-bestanden">PDF-bestanden</Label>
              <Input
                id="snagstream-pdf-bestanden"
                data-testid="snagstream-pdf-bestanden"
                type="file"
                accept="application/pdf,.pdf"
                multiple
                disabled={uploadBezig || batchGestart}
                className="mt-1"
                onChange={(event) => {
                  const bestanden = Array.from(event.target.files ?? []);
                  setBatchGestart(false);
                  setUploadItems(bestanden.map((bestand, index) => {
                    const geldigePdf = bestand.name.toLowerCase().endsWith(".pdf") &&
                      (!bestand.type || bestand.type === "application/pdf");
                    return {
                      sleutel: `${bestand.name}-${bestand.size}-${bestand.lastModified}-${index}`,
                      bestand,
                      status: geldigePdf ? "klaar" : "mislukt",
                      naamconflicten: [],
                      fout: geldigePdf ? undefined : "Alleen PDF-bestanden zijn toegestaan.",
                    };
                  }));
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                De inhoud wordt per bestand gecontroleerd. Eenzelfde PDF wordt nooit opnieuw aan het archief toegevoegd.
              </p>
            </div>
            <div>
              <Label>Hele selectie koppelen aan gebouw (optioneel)</Label>
              <Select
                value={gebouwId || GEEN_GEBOUW}
                onValueChange={(waarde) => setGebouwId(waarde === GEEN_GEBOUW ? "" : waarde)}
                disabled={batchGestart || uploadBezig}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Kies een gebouw..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={GEEN_GEBOUW}>Nog niet koppelen</SelectItem>
                  {gebouwLijst.map((gebouw) => (
                    <SelectItem key={gebouw.id} value={String(gebouw.id)}>{gebouw.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {uploadItems.length > 0 && (
              <div className="rounded-lg border divide-y" data-testid="snagstream-upload-lijst">
                {uploadItems.map((item) => (
                  <div
                    key={item.sleutel}
                    className="p-3 space-y-2"
                    data-testid="snagstream-upload-item"
                  >
                    <div className="flex items-start gap-3">
                      <UploadStatusIcoon status={item.status} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate" title={item.bestand.name}>
                          {item.bestand.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {bestandsgrootteLabel(item.bestand.size)} · {uploadStatusLabel(item)}
                        </p>
                      </div>
                      {item.rapport && (
                        <Link
                          href={`/snagstream/${item.rapport.id}`}
                          className="shrink-0 text-xs font-medium text-primary hover:underline"
                        >
                          Rapport openen
                        </Link>
                      )}
                    </div>

                    {item.fout && (
                      <p className="pl-7 text-xs text-destructive">{item.fout}</p>
                    )}

                    {item.status === "naamconflict" && (
                      <div className="ml-7 rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                        <p className="font-medium text-sm text-amber-900">Deze bestandsnaam bestaat al</p>
                        <p className="text-xs text-amber-800">
                          De inhoud is anders. Vergelijk de bestaande rapporten en kies bewust wat er met dit bestand moet gebeuren.
                        </p>
                        {item.naamconflicten.map((rapport) => (
                          <div key={rapport.id} className="rounded border bg-white px-2.5 py-2 text-xs">
                            <Link href={`/snagstream/${rapport.id}`} className="font-medium hover:underline">
                              {rapport.bestandsnaam}
                            </Link>
                            <span className="block text-muted-foreground">
                              {datumLabel(rapport.aangemaakt_op)} · {rapport.uploader_naam ?? "Onbekende uploader"} · {rapport.gebouw_naam ?? "niet gekoppeld"}
                            </span>
                          </div>
                        ))}
                        <div className="flex flex-wrap justify-end gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={uploadBezig}
                            onClick={() => void slaNaamconflictOver(item)}
                          >
                            Overslaan
                          </Button>
                          <Button
                            size="sm"
                            disabled={uploadBezig}
                            onClick={() => void bevestigNaamconflict(item)}
                          >
                            Toch uploaden
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {batchGestart && uploadItems.length > 0 && (
              <div
                className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-muted px-3 py-2 text-xs"
                data-testid="snagstream-upload-samenvatting"
              >
                <span>{uploadTellingen.opgeslagen} opgeslagen</span>
                <span>{uploadTellingen.bestaand} al aanwezig</span>
                <span>{uploadTellingen.naamconflict} wacht op keuze</span>
                <span>{uploadTellingen.overgeslagen} overgeslagen</span>
                <span>{uploadTellingen.mislukt} mislukt</span>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            {uploadBezig ? (
              <Button disabled>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Bestanden verwerken
              </Button>
            ) : uploadTellingen.klaar > 0 ? (
              <>
                <Button variant="outline" onClick={() => void resetUpload()}>Annuleren</Button>
                <Button onClick={() => void handleUploadBatch()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Controleren en {uploadTellingen.klaar} uploaden
                </Button>
              </>
            ) : batchGestart ? (
              <Button onClick={() => void resetUpload()}>Sluiten</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => void resetUpload()}>Annuleren</Button>
                <Button disabled>
                  <Upload className="h-4 w-4 mr-2" />
                  Selecteer PDF-bestanden
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}