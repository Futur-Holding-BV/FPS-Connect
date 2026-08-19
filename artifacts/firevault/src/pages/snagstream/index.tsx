import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
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

function datumLabel(waarde?: string | null): string {
  if (!waarde) return "—";
  const datum = new Date(waarde);
  return Number.isNaN(datum.getTime()) ? waarde : datum.toLocaleDateString("nl-NL");
}

export default function SnagstreamArchiefPagina() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigeer] = useLocation();
  const backfillGestart = useRef(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [bestand, setBestand] = useState<File | null>(null);
  const [bestandHash, setBestandHash] = useState("");
  const [pendingUploadToken, setPendingUploadToken] = useState("");
  const [gebouwId, setGebouwId] = useState("");
  const [uploadBezig, setUploadBezig] = useState(false);
  const [aiBezig, setAiBezig] = useState<number | null>(null);
  const [naamconflicten, setNaamconflicten] = useState<SnagstreamRapport[]>([]);
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

  function resetUpload() {
    setUploadOpen(false);
    setBestand(null);
    setBestandHash("");
    setPendingUploadToken("");
    setGebouwId("");
    setNaamconflicten([]);
  }

  async function uploadNieuwRapport(naamconflictBevestigd: boolean, berekendeHash?: string) {
    const vingerafdruk = berekendeHash ?? bestandHash;
    if (!bestand || !vingerafdruk) return;
    setUploadBezig(true);
    try {
      let uploadToken = pendingUploadToken;
      if (!uploadToken) {
        const upload = await requestUploadMut.mutateAsync({
          data: {
            bestandsnaam: bestand.name,
            bestandsgrootte: bestand.size,
            vingerafdruk,
          },
        });
        const opslagRespons = await fetch(upload.upload_url, {
          method: "PUT",
          headers: { "Content-Type": "application/pdf" },
          body: bestand,
        });
        if (!opslagRespons.ok) throw new Error(`Objectupload mislukt (${opslagRespons.status})`);
        uploadToken = upload.upload_token;
        setPendingUploadToken(uploadToken);
      }
      let rapport: SnagstreamRapport;
      try {
        rapport = await createMut.mutateAsync({
          data: {
            bestandsnaam: bestand.name,
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
            data: { bestandsnaam: bestand.name, vingerafdruk },
          });
          setNaamconflicten(controle.naamconflicten);
          toast({
            title: "Bestandsnaam is intussen al gebruikt",
            description: "Vergelijk de rapporten en bevestig bewust of dit een ander rapport is.",
          });
          return;
        }
        throw fout;
      }
      verversArchief();
      resetUpload();
      toast({
        title: rapport.upload_dubbel ? "Rapport bestond al" : "Rapport opgeslagen",
        description: rapport.upload_dubbel
          ? `Geüpload door ${rapport.uploader_naam ?? "onbekend"} op ${datumLabel(rapport.aangemaakt_op)}.`
          : bestand.name,
      });
      navigeer(`/snagstream/${rapport.id}`);
    } catch {
      toast({ title: "Upload mislukt", description: "Het rapport is niet aan het archief toegevoegd.", variant: "destructive" });
    } finally {
      setUploadBezig(false);
    }
  }

  async function handleUpload() {
    if (!bestand) return;
    setUploadBezig(true);
    try {
      const vingerafdruk = await sha256(bestand);
      setBestandHash(vingerafdruk);
      const controle = await controleMut.mutateAsync({
        data: { bestandsnaam: bestand.name, vingerafdruk },
      });
      if (controle.uitkomst === "exact_dubbel" && controle.bestaand_rapport) {
        const bestaand = controle.bestaand_rapport;
        resetUpload();
        toast({
          title: "Dit rapport staat al in het archief",
          description: `Geüpload door ${bestaand.uploader_naam ?? "onbekend"} op ${datumLabel(bestaand.aangemaakt_op)}.`,
        });
        navigeer(`/snagstream/${bestaand.id}`);
        return;
      }
      if (controle.uitkomst === "naamconflict") {
        setNaamconflicten(controle.naamconflicten);
        return;
      }
      await uploadNieuwRapport(false, vingerafdruk);
    } catch {
      toast({ title: "Uploadcontrole mislukt", description: "Het bestand is niet opgeslagen.", variant: "destructive" });
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
          PDF uploaden
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
        setUploadOpen(open);
        if (!open) resetUpload();
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Snagstream PDF uploaden</DialogTitle>
            <DialogDescription>
              Kies een eenmalig rapport. Connect controleert de inhoud voordat het bestand wordt opgeslagen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>PDF-bestand</Label>
              <Input
                type="file"
                accept="application/pdf,.pdf"
                className="mt-1"
                onChange={(event) => {
                  setBestand(event.target.files?.[0] ?? null);
                  setBestandHash("");
                  setNaamconflicten([]);
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                De inhoud wordt vóór upload gecontroleerd. Eenzelfde PDF wordt nooit opnieuw aan het archief toegevoegd.
              </p>
            </div>
            <div>
              <Label>Koppelen aan gebouw (optioneel)</Label>
              <Select value={gebouwId || GEEN_GEBOUW} onValueChange={(waarde) => setGebouwId(waarde === GEEN_GEBOUW ? "" : waarde)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Kies een gebouw..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={GEEN_GEBOUW}>Nog niet koppelen</SelectItem>
                  {gebouwLijst.map((gebouw) => (
                    <SelectItem key={gebouw.id} value={String(gebouw.id)}>{gebouw.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {naamconflicten.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                <p className="font-medium text-sm text-amber-900">Deze bestandsnaam bestaat al</p>
                <p className="text-xs text-amber-800">
                  De inhoud is anders. Vergelijk de bestaande rapporten en kies bewust of dit een ander rapport is.
                </p>
                {naamconflicten.map((rapport) => (
                  <div key={rapport.id} className="rounded border bg-white px-2.5 py-2 text-xs">
                    <Link href={`/snagstream/${rapport.id}`} className="font-medium hover:underline">{rapport.bestandsnaam}</Link>
                    <span className="block text-muted-foreground">
                      {datumLabel(rapport.aangemaakt_op)} · {rapport.uploader_naam ?? "Onbekende uploader"} · {rapport.gebouw_naam ?? "niet gekoppeld"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            {naamconflicten.length > 0 ? (
              <>
                <Button variant="outline" onClick={resetUpload}>Dit is een vergissing</Button>
                <Button disabled={uploadBezig || requestUploadMut.isPending} onClick={() => void uploadNieuwRapport(true)}>
                  {(uploadBezig || requestUploadMut.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Ander rapport uploaden
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={resetUpload}>Annuleren</Button>
                <Button disabled={!bestand || uploadBezig || requestUploadMut.isPending} onClick={() => void handleUpload()}>
                  {(uploadBezig || requestUploadMut.isPending) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                  Controleren en uploaden
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}