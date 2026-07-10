import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListVoorzieningen,
  useListClusters,
  useCreateCluster,
  useUpdateCluster,
  useDeleteCluster,
  useUpdateVoorziening,
  useAssignClusterMonteur,
  useListToewijsbareGebruikers,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, AlertCircle, Boxes, Pencil, Trash2, Calendar, X, Filter, UserCheck } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useVoorkeur } from "@/hooks/use-voorkeur";
import { PaginaHulp } from "@/components/pagina-hulp";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";

const STATUSLABEL: Record<string, string> = {
  concept: "Concept",
  voorbereid: "Voorbereid",
  in_uitvoering: "In uitvoering",
  wacht_op_akkoord: "Niet gereed - wachten op akkoord",
  meerwerk_financieel: "Meerwerk - financieel afronden",
  opgeleverd: "Opgeleverd",
  goedgekeurd: "Gereed",
  afgekeurd: "Afgekeurd",
  in_onderhoud: "In onderhoud",
  vervallen: "Vervallen",
};

const CLUSTER_TYPEN: Record<string, string> = {
  schacht: "Schacht",
  strook: "Strook",
  zone: "Zone",
  overig: "Overig",
};
const CLUSTER_KLEUREN = ["#6366f1", "#0ea5e9", "#f59e0b", "#10b981", "#ec4899", "#8b5cf6", "#ef4444", "#14b8a6"];
const STANDAARD_CLUSTERKLEUR = "#6366f1";

type SpotVoorBeheer = {
  id: number;
  objectnummer: string;
  gebouw_id: number;
  gebouw_naam: string | null;
  cluster_id: number | null;
};

const GEEN_FILTER = "__alle__";
const ZONDER_CLUSTER = "__zonder_cluster__";

export default function Voorzieningen() {
  const { t } = useTranslation();
  const { heeftNiveau } = useBevoegdheid();
  const magClustersBeheren = heeftNiveau("voorzieningen", 2);
  const [beheerSpot, setBeheerSpot] = useState<SpotVoorBeheer | null>(null);

  const [zoek, setZoek, wisZoek] = useVoorkeur("voorzieningen_zoek", "");
  const [typeFilter, setTypeFilter, wisType] = useVoorkeur("voorzieningen_type", GEEN_FILTER);
  const [statusFilter, setStatusFilter, wisStatus] = useVoorkeur("voorzieningen_status", GEEN_FILTER);
  const [gebouwFilter, setGebouwFilter, wisGebouw] = useVoorkeur("voorzieningen_gebouw", GEEN_FILTER);
  const [clusterFilter, setClusterFilter, wisCluster] = useVoorkeur("voorzieningen_cluster", GEEN_FILTER);
  const [alleenTeControleren, setAlleenTeControleren, wisTeControleren] = useVoorkeur(
    "voorzieningen_alleen_te_controleren",
    false,
  );
  const [alleenVoorbereid, setAlleenVoorbereid, wisVoorbereid] = useVoorkeur(
    "voorzieningen_alleen_voorbereid",
    false,
  );
  const [toonGearchiveerd, setToonGearchiveerd, wisGearchiveerd] = useVoorkeur(
    "voorzieningen_toon_gearchiveerd",
    false,
  );
  const [aanmaakVan, setAanmaakVan, wisVan] = useVoorkeur("voorzieningen_aanmaak_van", "");
  const [aanmaakTot, setAanmaakTot, wisTot] = useVoorkeur("voorzieningen_aanmaak_tot", "");

  const { data: voorzieningenLijst, isLoading, refetch } = useListVoorzieningen({
    gearchiveerd: toonGearchiveerd ? true : false,
  });

  const teControlerenAantal = useMemo(
    () => (voorzieningenLijst?.items ?? []).filter((v) => (v as any).ai_te_controleren).length,
    [voorzieningenLijst],
  );

  const voorbereidAantal = useMemo(
    () => (voorzieningenLijst?.items ?? []).filter((v) => v.status === "voorbereid").length,
    [voorzieningenLijst],
  );

  const alleTypes = useMemo(() => {
    const set = new Set<string>();
    (voorzieningenLijst?.items ?? []).forEach((v) => { if (v.type) set.add(v.type); });
    return Array.from(set).sort();
  }, [voorzieningenLijst]);

  const alleGebouwen = useMemo(() => {
    const map = new Map<string, string>();
    (voorzieningenLijst?.items ?? []).forEach((v) => {
      if (v.gebouw_naam) map.set(v.gebouw_naam, v.gebouw_naam);
    });
    return Array.from(map.keys()).sort();
  }, [voorzieningenLijst]);

  const alleClusters = useMemo(() => {
    const map = new Map<number, string>();
    (voorzieningenLijst?.items ?? []).forEach((v) => {
      const clusterId = (v as any).cluster_id as number | null | undefined;
      const clusterNaam = (v as any).cluster_naam as string | null | undefined;
      if (clusterId != null && clusterNaam) map.set(clusterId, clusterNaam);
    });
    return Array.from(map.entries())
      .map(([id, naam]) => ({ id, naam }))
      .sort((a, b) => a.naam.localeCompare(b.naam));
  }, [voorzieningenLijst]);

  const datumFilterActief = aanmaakVan !== "" || aanmaakTot !== "";

  const actieveFilterAantal = [
    zoek.trim() !== "",
    typeFilter !== GEEN_FILTER,
    statusFilter !== GEEN_FILTER,
    gebouwFilter !== GEEN_FILTER,
    clusterFilter !== GEEN_FILTER,
    alleenTeControleren,
    alleenVoorbereid,
    toonGearchiveerd,
    datumFilterActief,
  ].filter(Boolean).length;

  function wisAllesWissen() {
    wisZoek();
    wisType();
    wisStatus();
    wisGebouw();
    wisCluster();
    wisTeControleren();
    wisVoorbereid();
    wisGearchiveerd();
    wisVan();
    wisTot();
  }

  const gefilterd = useMemo(() => {
    const term = zoek.trim().toLowerCase();
    let items = voorzieningenLijst?.items ?? [];
    if (alleenTeControleren) items = items.filter((v) => (v as any).ai_te_controleren);
    if (alleenVoorbereid) items = items.filter((v) => v.status === "voorbereid");
    if (typeFilter !== GEEN_FILTER) items = items.filter((v) => v.type === typeFilter);
    if (statusFilter !== GEEN_FILTER) items = items.filter((v) => (v.status ?? "concept") === statusFilter);
    if (gebouwFilter !== GEEN_FILTER) items = items.filter((v) => v.gebouw_naam === gebouwFilter);
    if (clusterFilter === ZONDER_CLUSTER) {
      items = items.filter((v) => (v as any).cluster_id == null);
    } else if (clusterFilter !== GEEN_FILTER) {
      items = items.filter((v) => String((v as any).cluster_id ?? "") === clusterFilter);
    }
    if (aanmaakVan) {
      const van = new Date(`${aanmaakVan}T00:00:00`);
      items = items.filter((v) => {
        const d = (v as any).aangemaakt_op ? new Date((v as any).aangemaakt_op) : null;
        return d != null && d >= van;
      });
    }
    if (aanmaakTot) {
      const tot = new Date(`${aanmaakTot}T23:59:59.999`);
      items = items.filter((v) => {
        const d = (v as any).aangemaakt_op ? new Date((v as any).aangemaakt_op) : null;
        return d != null && d <= tot;
      });
    }
    if (!term) return items;
    return items.filter((v) =>
      [v.objectnummer, v.type, v.gebouw_naam, v.status]
        .some((veld) => (veld ?? "").toLowerCase().includes(term)),
    );
  }, [voorzieningenLijst, zoek, typeFilter, statusFilter, gebouwFilter, clusterFilter, alleenTeControleren, alleenVoorbereid, aanmaakVan, aanmaakTot]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PaginaHulp pagina="voorzieningen" />
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("voorzieningen.titel")}</h1>
          <p className="text-muted-foreground mt-1">{t("voorzieningen.ondertitel")}</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder={t("voorzieningen.zoek")}
              className="pl-8"
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
            />
          </div>
          {voorbereidAantal > 0 && (
            <Button
              variant={alleenVoorbereid ? "default" : "outline"}
              onClick={() => setAlleenVoorbereid((v) => !v)}
              className={alleenVoorbereid ? "" : "border-slate-300 text-slate-700 hover:text-slate-800"}
            >
              Voorbereid ({voorbereidAantal})
            </Button>
          )}
          {teControlerenAantal > 0 && (
            <Button
              variant={alleenTeControleren ? "default" : "outline"}
              onClick={() => setAlleenTeControleren((v) => !v)}
              className={alleenTeControleren ? "" : "border-red-300 text-red-700 hover:text-red-800"}
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              Te controleren ({teControlerenAantal})
            </Button>
          )}
          <Link href="/voorzieningen/nieuw">
            <Button variant="outline">
              <Plus className="h-4 w-4 mr-2" />Toepassing toevoegen
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter-balk: type, status, gebouw, datums */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
          <Filter className="h-4 w-4" />
          <span className="font-medium text-foreground">Filters</span>
        </div>

        {/* Type-filter */}
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Alle types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GEEN_FILTER}>Alle types</SelectItem>
            {alleTypes.map((type) => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status-filter */}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-52 text-xs">
            <SelectValue placeholder="Alle statussen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GEEN_FILTER}>Alle statussen</SelectItem>
            {Object.entries(STATUSLABEL).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Gebouw-filter */}
        <Select value={gebouwFilter} onValueChange={setGebouwFilter}>
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue placeholder="Alle gebouwen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GEEN_FILTER}>Alle gebouwen</SelectItem>
            {alleGebouwen.map((naam) => (
              <SelectItem key={naam} value={naam}>{naam}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Cluster-filter */}
        <Select value={clusterFilter} onValueChange={setClusterFilter}>
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue placeholder="Alle clusters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={GEEN_FILTER}>Alle clusters</SelectItem>
            <SelectItem value={ZONDER_CLUSTER}>Zonder cluster</SelectItem>
            {alleClusters.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.naam}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {heeftNiveau("voorzieningen", 2) && (
          <div className="flex items-center space-x-2 border rounded-md px-2 h-8 bg-background">
            <Label htmlFor="toon-gearchiveerd" className="text-xs cursor-pointer">Gearchiveerd</Label>
            <Switch
              id="toon-gearchiveerd"
              checked={toonGearchiveerd}
              onCheckedChange={setToonGearchiveerd}
              className="scale-75"
            />
          </div>
        )}

        {/* Datum-filter */}
        <div className="flex items-center gap-1.5">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">van</span>
          <DatePicker
            value={aanmaakVan}
            onChange={setAanmaakVan}
            className="h-8 w-36 text-xs"
            max={aanmaakTot || undefined}
            placeholder="Van"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">tot</span>
          <DatePicker
            value={aanmaakTot}
            onChange={setAanmaakTot}
            className="h-8 w-36 text-xs"
            min={aanmaakVan || undefined}
            placeholder="Tot"
          />
        </div>

        {actieveFilterAantal > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={wisAllesWissen}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Alles wissen
            <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">{actieveFilterAantal}</Badge>
          </Button>
        )}

        <span className="text-xs text-muted-foreground">
          {gefilterd.length} spot{gefilterd.length !== 1 ? "s" : ""}
        </span>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase">
                <tr>
                  <th className="px-6 py-3">{t("voorzieningen.nummer")}</th>
                  <th className="px-6 py-3">{t("voorzieningen.type")}</th>
                  <th className="px-6 py-3">{t("voorzieningen.gebouw")}</th>
                  <th className="px-6 py-3">Cluster</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Aangemaakt</th>
                  <th className="px-6 py-3 text-right">Acties</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="px-6 py-4 text-center">Laden...</td></tr>
                ) : (
                  gefilterd.map(v => (
                    <tr key={v.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-6 py-4 font-medium">
                        <span className="inline-flex items-center gap-2">
                          {(v as any).ai_te_controleren && (
                            <span title="AI-controle vereist" className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full bg-red-600" />
                          )}
                          {v.objectnummer}
                        </span>
                      </td>
                      <td className="px-6 py-4">{v.type}</td>
                      <td className="px-6 py-4">{v.gebouw_naam}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {(v as any).cluster_naam ? (
                            <Badge variant="secondary">{(v as any).cluster_naam}</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {magClustersBeheren && v.gebouw_id != null && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground"
                              title="Clusters beheren"
                              onClick={() =>
                                setBeheerSpot({
                                  id: v.id,
                                  objectnummer: v.objectnummer,
                                  gebouw_id: v.gebouw_id as number,
                                  gebouw_naam: v.gebouw_naam ?? null,
                                  cluster_id: (v as any).cluster_id ?? null,
                                })
                              }
                            >
                              <Boxes className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant="outline"
                          className={v.status === "voorbereid" ? "border-dashed border-slate-300 text-slate-700" : undefined}
                        >
                          {STATUSLABEL[v.status ?? "concept"] ?? v.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                        {(v as any).aangemaakt_op
                          ? new Date((v as any).aangemaakt_op).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" })
                          : "—"}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link href={`/voorzieningen/${v.id}`}>
                          <Button variant="ghost" size="sm" data-testid="spot-details-knop">Details</Button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
                {!isLoading && !gefilterd.length && (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">Geen spots gevonden.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {beheerSpot && (
        <SpotClusterDialog
          spot={beheerSpot}
          open={!!beheerSpot}
          onOpenChange={(open) => { if (!open) setBeheerSpot(null); }}
          onWijziging={() => refetch()}
        />
      )}
    </div>
  );
}

function SpotClusterDialog({
  spot,
  open,
  onOpenChange,
  onWijziging,
}: {
  spot: SpotVoorBeheer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onWijziging: () => void;
}) {
  const { data: clusters, refetch: refetchClusters } = useListClusters(spot.gebouw_id);
  const maakCluster = useCreateCluster();
  const wijzigCluster = useUpdateCluster();
  const verwijderCluster = useDeleteCluster();
  const updateVoorziening = useUpdateVoorziening();
  const wijsClusterMonteurToe = useAssignClusterMonteur();
  const { data: gebruikers } = useListToewijsbareGebruikers();
  const monteurs = ((gebruikers ?? []) as any[]).filter((g) => g.rol !== "hoofdbeheerder");

  const [nieuwNaam, setNieuwNaam] = useState("");
  const [nieuwType, setNieuwType] = useState("schacht");
  const [nieuwKleur, setNieuwKleur] = useState(STANDAARD_CLUSTERKLEUR);
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [bewerkNaam, setBewerkNaam] = useState("");
  const [huidigClusterId, setHuidigClusterId] = useState<number | null>(spot.cluster_id);
  const [bezigKoppelen, setBezigKoppelen] = useState(false);
  const [bezigMonteurClusterId, setBezigMonteurClusterId] = useState<number | null>(null);

  async function wijsMonteurToe(clusterId: number, waarde: string) {
    setBezigMonteurClusterId(clusterId);
    try {
      await wijsClusterMonteurToe.mutateAsync({
        clusterId,
        data: { monteur_id: waarde === "geen" ? null : Number(waarde) },
      });
      await refetchClusters();
      onWijziging();
    } finally {
      setBezigMonteurClusterId(null);
    }
  }

  const GEEN_CLUSTER = "__geen__";
  const lijst = (clusters ?? []) as any[];

  async function koppelSpot(waarde: string) {
    const cluster_id = waarde === GEEN_CLUSTER ? null : Number(waarde);
    setBezigKoppelen(true);
    try {
      await updateVoorziening.mutateAsync({ id: spot.id, data: { cluster_id } });
      setHuidigClusterId(cluster_id);
      await refetchClusters();
      onWijziging();
    } finally {
      setBezigKoppelen(false);
    }
  }

  async function voegToe() {
    if (!nieuwNaam.trim()) return;
    await maakCluster.mutateAsync({
      id: spot.gebouw_id,
      data: { naam: nieuwNaam.trim(), type: nieuwType, kleur: nieuwKleur },
    });
    setNieuwNaam("");
    setNieuwType("schacht");
    setNieuwKleur(STANDAARD_CLUSTERKLEUR);
    await refetchClusters();
    onWijziging();
  }

  async function bewaarNaam(clusterId: number) {
    if (!bewerkNaam.trim()) { setBewerkId(null); return; }
    await wijzigCluster.mutateAsync({ clusterId, data: { naam: bewerkNaam.trim() } });
    setBewerkId(null);
    await refetchClusters();
    onWijziging();
  }

  async function wijzigKleur(clusterId: number, kleur: string) {
    await wijzigCluster.mutateAsync({ clusterId, data: { kleur } });
    await refetchClusters();
    onWijziging();
  }

  async function verwijder(clusterId: number) {
    await verwijderCluster.mutateAsync({ clusterId });
    if (huidigClusterId === clusterId) setHuidigClusterId(null);
    await refetchClusters();
    onWijziging();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Clusters beheren — {spot.gebouw_naam ?? "Gebouw"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Cluster van spot {spot.objectnummer}
            </Label>
            <Select
              value={huidigClusterId != null ? String(huidigClusterId) : GEEN_CLUSTER}
              onValueChange={koppelSpot}
              disabled={bezigKoppelen}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Geen cluster" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GEEN_CLUSTER}>Geen cluster</SelectItem>
                {lijst.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.naam}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Een cluster groepeert bij elkaar horende spots (bijv. een schacht of strook).
            </p>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {lijst.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Nog geen clusters in dit gebouw.</p>
            )}
            {lijst.map((c) => (
              <div key={c.id} className="flex items-center gap-2 border rounded-md p-2">
                <input
                  type="color"
                  value={c.kleur || STANDAARD_CLUSTERKLEUR}
                  onChange={(e) => wijzigKleur(c.id, e.target.value)}
                  className="h-6 w-6 rounded cursor-pointer border-0 bg-transparent p-0"
                  title="Kleur"
                />
                {bewerkId === c.id ? (
                  <Input
                    autoFocus
                    value={bewerkNaam}
                    onChange={(e) => setBewerkNaam(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") bewaarNaam(c.id); }}
                    onBlur={() => bewaarNaam(c.id)}
                    className="h-8 flex-1"
                  />
                ) : (
                  <span className="flex-1 text-sm font-medium truncate">{c.naam}</span>
                )}
                <Badge variant="secondary" className="text-xs">{c.voorziening_aantal} spots</Badge>
                {c.type && <Badge variant="outline" className="text-xs">{CLUSTER_TYPEN[c.type] ?? c.type}</Badge>}
                <Select
                  value={c.monteur_id != null ? String(c.monteur_id) : "geen"}
                  onValueChange={(v) => wijsMonteurToe(c.id, v)}
                  disabled={bezigMonteurClusterId === c.id}
                >
                  <SelectTrigger className="h-7 w-36 text-xs" title="Cluster aan monteur toewijzen">
                    <UserCheck className="h-3.5 w-3.5 mr-1 shrink-0" />
                    <SelectValue placeholder="Toewijzen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geen">Niet toegewezen</SelectItem>
                    {monteurs.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>{m.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  onClick={() => { setBewerkId(c.id); setBewerkNaam(c.naam); }}
                  title="Hernoemen"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                  onClick={() => verwijder(c.id)}
                  disabled={verwijderCluster.isPending}
                  title="Verwijderen (spots blijven bestaan)"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="border-t pt-3 space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Nieuw cluster</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={nieuwKleur}
                onChange={(e) => setNieuwKleur(e.target.value)}
                className="h-9 w-9 rounded cursor-pointer border-0 bg-transparent p-0"
                title="Kleur"
              />
              <Input
                placeholder="Naam (bijv. Schacht A)"
                value={nieuwNaam}
                onChange={(e) => setNieuwNaam(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") voegToe(); }}
                className="h-9 flex-1"
              />
              <Select value={nieuwType} onValueChange={setNieuwType}>
                <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CLUSTER_TYPEN).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-1">
              {CLUSTER_KLEUREN.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setNieuwKleur(k)}
                  className="h-5 w-5 rounded-full border-2"
                  style={{ backgroundColor: k, borderColor: nieuwKleur === k ? "#1e293b" : "transparent" }}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Sluiten</Button>
          <Button onClick={voegToe} disabled={!nieuwNaam.trim() || maakCluster.isPending}>
            {maakCluster.isPending ? "Toevoegen..." : "Cluster toevoegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
