// Uitvoering — alles rond één opdracht tijdens de uitvoering, op één scherm.
// Hergebruikt de bestaande opdracht-componenten (stappen, oplevering,
// planning, uren, materiaal, akkoord) en voegt materiaalaanvragen,
// werkbaksignalen, documenten en regie-verwijzing toe.
// Bevoegdheden volgen het bestaande rechtenmodel: tabs verschijnen alleen
// als het onderliggende recht er is (menu verbergt, nooit grijs).
import { useMemo, useState, useRef } from "react";
import { Link, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetOpdracht,
  getGetOpdrachtQueryKey,
  useListWerkbakItems,
  getListWerkbakItemsQueryKey,
  useHandelWerkbakItemAf,
  useListGekoppeldeDocumenten,
  getListGekoppeldeDocumentenQueryKey,
  getGetUitvoeringOverzichtQueryKey,
  useAddDocumentKoppeling,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, HardHat, ShieldCheck, CalendarCheck, Clock, Package,
  Inbox, FileText, ClipboardList, ExternalLink, AlertTriangle, Check, Upload, Euro,
} from "lucide-react";
import {
  VoorwaardenTab,
  BegrotingTab,
  UrenTab,
  MateriaalTab as RegieMateriaalTab,
} from "@/pages/regie/detail";
import PimUitvoeringTab from "@/pages/opdrachten/pim-uitvoering-tab";
import PimOpleveringTab from "@/pages/opdrachten/pim-oplevering-tab";
import UitvoeringsplanningTab from "@/pages/opdrachten/uitvoeringsplanning-tab";
import { UrenPerUurcodeSectie } from "@/pages/opdrachten/uren-per-uurcode-sectie";
import MateriaaltabTab from "@/pages/opdrachten/materiaal-tab";
import { AkkoordKaart } from "@/pages/opdrachten/akkoord-kaart";
import { useRol } from "@/context/rol-context";

// ── Materiaalaanvragen van deze opdracht (status + gekoppelde inkoopbon) ─────
interface MateriaalAanvraag {
  id: number;
  reden: string;
  omschrijving: string | null;
  status: string;
  ai_artikel_naam: string | null;
  inkoopbon_id: number | null;
  aangemaakt_op: string;
}

const AANVRAAG_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  nieuw: { label: "Wacht op behandeling", variant: "default" },
  goedgekeurd: { label: "Goedgekeurd", variant: "secondary" },
  afgewezen: { label: "Afgewezen", variant: "destructive" },
  afgehandeld: { label: "Afgehandeld", variant: "secondary" },
};

function MateriaalAanvragenLijst({ opdrachtId }: { opdrachtId: number }) {
  const { data: aanvragen = [], isLoading } = useQuery<MateriaalAanvraag[]>({
    queryKey: ["materiaal-aanvragen", "opdracht", opdrachtId],
    queryFn: async () => {
      const resp = await fetch(`/api/materiaal-aanvragen?opdracht_id=${opdrachtId}`, { credentials: "include" });
      if (!resp.ok) throw new Error("Materiaalaanvragen konden niet worden geladen");
      return resp.json();
    },
  });
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (aanvragen.length === 0) {
    return <p className="text-sm text-muted-foreground">Geen materiaalaanvragen voor deze opdracht.</p>;
  }
  return (
    <div className="space-y-2">
      {aanvragen.map((a) => {
        const st = AANVRAAG_STATUS[a.status] ?? { label: a.status, variant: "outline" as const };
        return (
          <div key={a.id} className="flex items-start justify-between gap-3 rounded-md border p-3" data-testid={`materiaal-aanvraag-${a.id}`}>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{a.ai_artikel_naam ?? a.omschrijving ?? "Materiaalaanvraag"}</p>
              <p className="text-xs text-muted-foreground">
                {a.reden}{a.inkoopbon_id ? " · concept-inkoopbon aangemaakt" : ""}
              </p>
            </div>
            <Badge variant={st.variant} className="shrink-0">{st.label}</Badge>
          </div>
        );
      })}
    </div>
  );
}

// ── Werkbaksignalen die rechtstreeks aan deze opdracht hangen ────────────────
function WerkbakSignalen({ opdrachtId }: { opdrachtId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: items = [], isLoading } = useListWerkbakItems({
    query: { queryKey: getListWerkbakItemsQueryKey() },
  });
  const afhandelMut = useHandelWerkbakItemAf({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListWerkbakItemsQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetUitvoeringOverzichtQueryKey() });
        toast({ title: "Signaal afgehandeld" });
      },
      onError: () => toast({ title: "Afhandelen mislukt", variant: "destructive" }),
    },
  });
  const relevant = useMemo(
    () => items.filter((i) => i.herkomst_type === "opdracht" && i.herkomst_id === opdrachtId && i.status === "open"),
    [items, opdrachtId],
  );
  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (relevant.length === 0) {
    return <p className="text-sm text-muted-foreground">Geen openstaande werkbaksignalen voor deze opdracht.</p>;
  }
  return (
    <div className="space-y-2">
      {relevant.map((item) => (
        <div key={item.id} className="flex items-start justify-between gap-3 rounded-md border p-3" data-testid={`werkbak-signaal-${item.id}`}>
          <div className="min-w-0">
            <p className="text-sm font-medium">{item.titel}</p>
            {item.omschrijving && <p className="text-xs text-muted-foreground">{item.omschrijving}</p>}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={afhandelMut.isPending}
            onClick={() => afhandelMut.mutate({ id: item.id })}
            data-testid={`werkbak-afhandelen-${item.id}`}
          >
            <Check className="h-4 w-4 mr-1" /> Afhandelen
          </Button>
        </div>
      ))}
    </div>
  );
}

// ── Upload-dialog: bestand uploaden en direct aan de opdracht koppelen ────────
function UploadOpdrachtDocumentDialog({
  opdrachtId,
  open,
  onClose,
  onGekoppeld,
}: {
  opdrachtId: number;
  open: boolean;
  onClose: () => void;
  onGekoppeld: () => void;
}) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [bezig, setBezig] = useState(false);
  const koppelMut = useAddDocumentKoppeling({
    mutation: {
      onError: () => toast({ title: "Koppelen mislukt", variant: "destructive" }),
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const bestand = fileRef.current?.files?.[0];
    if (!bestand) return;
    setBezig(true);
    try {
      const form = new FormData();
      form.append("bestand", bestand);
      form.append("categorie", "bibliotheek");
      const resp = await fetch("/api/documenten/aanleveren", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!resp.ok) {
        const fout = (await resp.json().catch(() => ({}) as { error?: string })) as { error?: string };
        toast({ title: fout.error ?? "Upload mislukt", variant: "destructive" });
        return;
      }
      const doc = (await resp.json()) as { id: number };
      await koppelMut.mutateAsync({
        id: doc.id,
        data: { doel_type: "opdracht", doel_id: opdrachtId },
      });
      toast({ title: "Document gekoppeld aan de opdracht" });
      onGekoppeld();
      onClose();
    } catch {
      toast({ title: "Upload of koppelen mislukt", variant: "destructive" });
    } finally {
      setBezig(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !bezig) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Document toevoegen aan opdracht</DialogTitle>
        </DialogHeader>
        <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="upload-bestand">Bestand</Label>
            <Input
              id="upload-bestand"
              type="file"
              ref={fileRef}
              accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx"
              required
              disabled={bezig}
            />
            <p className="text-xs text-muted-foreground">
              Het document komt als "ter goedkeuring" in de bibliotheek en is direct aan deze opdracht gekoppeld.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={bezig} onClick={onClose}>
              Annuleren
            </Button>
            <Button type="submit" disabled={bezig}>
              {bezig ? "Uploaden…" : "Uploaden en koppelen"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Documenten bij deze opdracht ─────────────────────────────────────────────
// Toont documenten die direct aan de opdracht zijn gekoppeld (doel_type=opdracht),
// aangevuld met documenten van het gebouw en de offerte. De upload-knop koppelt
// een nieuw document meteen aan de opdracht — vereist bibliotheek:2.
function OpdrachtDocumenten({
  opdrachtId,
  gebouwId,
  offerteId,
  magToevoegen,
}: {
  opdrachtId: number;
  gebouwId: number | null;
  offerteId: number | null;
  magToevoegen: boolean;
}) {
  const qc = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);

  const opdrachtParams = { doel_type: "opdracht" as const, doel_id: opdrachtId };
  const gebouwParams = { doel_type: "gebouw" as const, doel_id: gebouwId ?? 0 };
  const offerteParams = { doel_type: "offerte" as const, doel_id: offerteId ?? 0 };

  const { data: opdrachtDocs = [], isLoading: l0 } = useListGekoppeldeDocumenten(opdrachtParams, {
    query: { queryKey: getListGekoppeldeDocumentenQueryKey(opdrachtParams), enabled: opdrachtId > 0 },
  });
  const { data: gebouwDocs = [], isLoading: l1 } = useListGekoppeldeDocumenten(gebouwParams, {
    query: { queryKey: getListGekoppeldeDocumentenQueryKey(gebouwParams), enabled: (gebouwId ?? 0) > 0 },
  });
  const { data: offerteDocs = [], isLoading: l2 } = useListGekoppeldeDocumenten(offerteParams, {
    query: { queryKey: getListGekoppeldeDocumentenQueryKey(offerteParams), enabled: (offerteId ?? 0) > 0 },
  });

  const isLoading = l0 || l1 || l2;

  const directDocs = useMemo(
    () => opdrachtDocs as { id: number; titel?: string | null; naam?: string | null }[],
    [opdrachtDocs],
  );

  const overigeDocs = useMemo(() => {
    const directIds = new Set(opdrachtDocs.map((d) => d.id));
    const alles = [...offerteDocs, ...gebouwDocs] as { id: number; titel?: string | null; naam?: string | null }[];
    return alles.filter((d, i) => !directIds.has(d.id) && alles.findIndex((x) => x.id === d.id) === i);
  }, [opdrachtDocs, gebouwDocs, offerteDocs]);

  function DocRij({ d }: { d: { id: number; titel?: string | null; naam?: string | null } }) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border p-3">
        <span className="text-sm font-medium truncate flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          {d.titel ?? d.naam ?? `Document ${d.id}`}
        </span>
        <Link href={`/documenten?document=${d.id}`}>
          <Button size="sm" variant="ghost" aria-label="Bekijk document">
            <ExternalLink className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  if (isLoading) return <Skeleton className="h-16 w-full" />;

  return (
    <div className="space-y-4">
      {/* Opdracht-specifieke documenten */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Direct gekoppeld aan deze opdracht
          </p>
          {magToevoegen && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setUploadOpen(true)}
              data-testid="upload-opdracht-document"
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" /> Document toevoegen
            </Button>
          )}
        </div>
        {directDocs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nog geen documenten direct aan deze opdracht gekoppeld.
          </p>
        ) : (
          directDocs.map((d) => <DocRij key={d.id} d={d} />)
        )}
      </div>

      {/* Documenten van gebouw en offerte */}
      {overigeDocs.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Via gebouw en offerte
          </p>
          {overigeDocs.map((d) => <DocRij key={d.id} d={d} />)}
        </div>
      )}

      {uploadOpen && (
        <UploadOpdrachtDocumentDialog
          opdrachtId={opdrachtId}
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onGekoppeld={() => {
            void qc.invalidateQueries({ queryKey: getListGekoppeldeDocumentenQueryKey(opdrachtParams) });
          }}
        />
      )}
    </div>
  );
}

// ── Pagina ───────────────────────────────────────────────────────────────────
export default function UitvoeringDetailPagina() {
  const [, routeParams] = useRoute("/uitvoering/:id");
  const opdrachtId = Number(routeParams?.id ?? 0);
  const { heeftNiveau } = useBevoegdheid();
  const { rol } = useRol();

  const { data: opdracht, isLoading } = useGetOpdracht(opdrachtId, {
    query: { queryKey: getGetOpdrachtQueryKey(opdrachtId), enabled: opdrachtId > 0 },
  });

  const magStappen = heeftNiveau("offertes", 1);
  const magProjecten = heeftNiveau("projecten", 1);
  const magMateriaal = heeftNiveau("projecten", 2);
  const magDocumenten = heeftNiveau("bibliotheek", 1);
  const magDocumentenToevoegen = heeftNiveau("bibliotheek", 2);
  const isRegie = (opdracht as { type?: string } | undefined)?.type === "regie";

  // Eerste toegestane tab als startpunt — iemand met alleen projectenrecht
  // (zonder offertes:1) moet niet op een lege Stappen-tab landen.
  const eersteTab = magStappen ? "stappen" : magProjecten ? "planning" : "signalen";
  const [gekozenTab, setGekozenTab] = useState<string | null>(null);
  const activeTab = gekozenTab ?? eersteTab;
  const setActiveTab = setGekozenTab;

  if (opdrachtId <= 0) {
    return (
      <div className="p-6">
        <Alert variant="destructive"><AlertDescription>Ongeldige opdracht.</AlertDescription></Alert>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <Link href="/uitvoering">
            <Button variant="ghost" size="icon" className="shrink-0" data-testid="terug-naar-uitvoering">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="min-w-0">
            {isLoading ? (
              <Skeleton className="h-7 w-64" />
            ) : (
              <>
                <h1 data-paginatitel className="text-lg md:text-2xl font-semibold truncate">
                  {opdracht?.werknummer ? `${opdracht.werknummer} — ` : ""}{opdracht?.titel ?? "Opdracht"}
                </h1>
                <p className="text-sm text-muted-foreground truncate">
                  {opdracht?.opdrachtgever ?? "Opdrachtgever onbekend"}
                  {isRegie ? " · regieopdracht" : ""}
                </p>
              </>
            )}
          </div>
        </div>
        {magProjecten && (
          <Link href={`/opdrachten/${opdrachtId}`}>
            <Button variant="outline" size="sm">
              Volledige opdracht <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </Link>
        )}
      </div>

      {/* Akkoordgrond + voorwaarden — zichtbaar voor iedereen op de bouw met leesrecht */}
      {magProjecten && (
        <AkkoordKaart
          opdrachtId={opdrachtId}
          kanSchrijven={heeftNiveau("projecten", 3)}
          isHoofdbeheerder={rol === "hoofdbeheerder"}
        />
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1 w-full justify-start">
          {magStappen && (
            <TabsTrigger value="stappen" data-testid="tab-stappen">
              <HardHat className="h-3.5 w-3.5 mr-1.5" /> Stappen
            </TabsTrigger>
          )}
          {magStappen && (
            <TabsTrigger value="oplevering" data-testid="tab-oplevering">
              <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Oplevering
            </TabsTrigger>
          )}
          {magProjecten && (
            <TabsTrigger value="planning" data-testid="tab-planning">
              <CalendarCheck className="h-3.5 w-3.5 mr-1.5" /> Planning
            </TabsTrigger>
          )}
          {magProjecten && (
            <TabsTrigger value="uren" data-testid="tab-uren">
              <Clock className="h-3.5 w-3.5 mr-1.5" /> Uren
            </TabsTrigger>
          )}
          {magMateriaal && (
            <TabsTrigger value="materiaal" data-testid="tab-materiaal">
              <Package className="h-3.5 w-3.5 mr-1.5" /> Materiaal
            </TabsTrigger>
          )}
          <TabsTrigger value="signalen" data-testid="tab-signalen">
            <Inbox className="h-3.5 w-3.5 mr-1.5" /> Signalen
          </TabsTrigger>
          {magDocumenten && (
            <TabsTrigger value="documenten" data-testid="tab-documenten">
              <FileText className="h-3.5 w-3.5 mr-1.5" /> Documenten
            </TabsTrigger>
          )}
          {isRegie && magProjecten && (
            <TabsTrigger value="regie" data-testid="tab-regie">
              <ClipboardList className="h-3.5 w-3.5 mr-1.5" /> Regie
            </TabsTrigger>
          )}
        </TabsList>

        {magStappen && (
          <TabsContent value="stappen" className="mt-4">
            <PimUitvoeringTab opdrachtId={opdrachtId} />
          </TabsContent>
        )}
        {magStappen && (
          <TabsContent value="oplevering" className="mt-4">
            <PimOpleveringTab opdrachtId={opdrachtId} />
          </TabsContent>
        )}
        {magProjecten && activeTab === "planning" && (
          <TabsContent value="planning" className="mt-4">
            <UitvoeringsplanningTab opdrachtId={opdrachtId} />
          </TabsContent>
        )}
        {magProjecten && (
          <TabsContent value="uren" className="mt-4">
            <UrenPerUurcodeSectie opdrachtId={opdrachtId} />
          </TabsContent>
        )}
        {magMateriaal && (
          <TabsContent value="materiaal" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" /> Materiaalaanvragen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MateriaalAanvragenLijst opdrachtId={opdrachtId} />
              </CardContent>
            </Card>
            <MateriaaltabTab opdrachtId={opdrachtId} />
          </TabsContent>
        )}
        <TabsContent value="signalen" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Openstaande signalen
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WerkbakSignalen opdrachtId={opdrachtId} />
            </CardContent>
          </Card>
        </TabsContent>
        {magDocumenten && (
          <TabsContent value="documenten" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Documenten bij deze opdracht
                </CardTitle>
              </CardHeader>
              <CardContent>
                <OpdrachtDocumenten
                  opdrachtId={opdrachtId}
                  gebouwId={(opdracht as { gebouw_id?: number | null } | undefined)?.gebouw_id ?? null}
                  offerteId={(opdracht as { offerte_id?: number | null } | undefined)?.offerte_id ?? null}
                  magToevoegen={magDocumentenToevoegen}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}
        {isRegie && magProjecten && (
          <TabsContent value="regie" className="mt-4">
            <Tabs defaultValue="voorwaarden">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                <TabsList className="flex-wrap h-auto gap-1">
                  <TabsTrigger value="voorwaarden">
                    <FileText className="h-3.5 w-3.5 mr-1.5" /> Voorwaarden
                  </TabsTrigger>
                  <TabsTrigger value="begroting">
                    <Euro className="h-3.5 w-3.5 mr-1.5" /> Begroting
                  </TabsTrigger>
                  <TabsTrigger value="uren">
                    <Clock className="h-3.5 w-3.5 mr-1.5" /> Uren
                  </TabsTrigger>
                  <TabsTrigger value="materiaal">
                    <Package className="h-3.5 w-3.5 mr-1.5" /> Materiaal
                  </TabsTrigger>
                </TabsList>
                <Link href={`/regie/${opdrachtId}`}>
                  <Button size="sm" variant="ghost" className="text-xs text-muted-foreground">
                    Volledige regiemodule <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </Link>
              </div>
              <TabsContent value="voorwaarden" className="mt-0">
                <Card>
                  <CardContent className="pt-6">
                    <VoorwaardenTab opdrachtId={opdrachtId} kanSchrijven={heeftNiveau("offertes", 2)} />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="begroting" className="mt-0">
                <Card>
                  <CardContent className="pt-6">
                    <BegrotingTab opdrachtId={opdrachtId} kanSchrijven={heeftNiveau("offertes", 2)} />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="uren" className="mt-0">
                <Card>
                  <CardContent className="pt-6">
                    <UrenTab opdrachtId={opdrachtId} />
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="materiaal" className="mt-0">
                <Card>
                  <CardContent className="pt-6">
                    <RegieMateriaalTab opdrachtId={opdrachtId} kanSchrijven={heeftNiveau("offertes", 2)} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
