import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useListVoorzieningen,
  useListClusters,
  useCreateCluster,
  useUpdateCluster,
  useDeleteCluster,
  useUpdateVoorziening,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Plus, Search, AlertCircle, Boxes, Pencil, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useVoorkeur } from "@/hooks/use-voorkeur";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";

const STATUSLABEL: Record<string, string> = {
  concept: "Concept",
  voorbereid: "Voorbereid",
  in_uitvoering: "In uitvoering",
  opgeleverd: "Opgeleverd",
  goedgekeurd: "Gereed",
  afgekeurd: "Afgekeurd",
  in_onderhoud: "In onderhoud",
  vervallen: "Vervallen",
};

// Standaard palet voor clusters; identiek aan de plattegrond-editor zodat de
// kleuren consistent zijn tussen lijst en plattegrond.
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

export default function Voorzieningen() {
  const { t } = useTranslation();
  const { data: voorzieningenLijst, isLoading, refetch } = useListVoorzieningen({});
  const { heeftNiveau } = useBevoegdheid();
  const magClustersBeheren = heeftNiveau("voorzieningen", 2);
  const [zoek, setZoek] = useVoorkeur("voorzieningen_zoek", "");
  const [beheerSpot, setBeheerSpot] = useState<SpotVoorBeheer | null>(null);
  const [alleenTeControleren, setAlleenTeControleren] = useVoorkeur(
    "voorzieningen_alleen_te_controleren",
    false,
  );
  const [alleenVoorbereid, setAlleenVoorbereid] = useVoorkeur(
    "voorzieningen_alleen_voorbereid",
    false,
  );

  const teControlerenAantal = useMemo(
    () => (voorzieningenLijst?.items ?? []).filter((v) => (v as any).ai_te_controleren).length,
    [voorzieningenLijst],
  );

  const voorbereidAantal = useMemo(
    () => (voorzieningenLijst?.items ?? []).filter((v) => v.status === "voorbereid").length,
    [voorzieningenLijst],
  );

  const gefilterd = useMemo(() => {
    const term = zoek.trim().toLowerCase();
    let items = voorzieningenLijst?.items ?? [];
    if (alleenTeControleren) items = items.filter((v) => (v as any).ai_te_controleren);
    if (alleenVoorbereid) items = items.filter((v) => v.status === "voorbereid");
    if (!term) return items;
    return items.filter((v) =>
      [v.objectnummer, v.type, v.gebouw_naam, v.status]
        .some((veld) => (veld ?? "").toLowerCase().includes(term)),
    );
  }, [voorzieningenLijst, zoek, alleenTeControleren, alleenVoorbereid]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("voorzieningen.titel")}</h1>
          <p className="text-muted-foreground mt-1">{t("voorzieningen.ondertitel")}</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
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
                  <th className="px-6 py-3 text-right">Acties</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="px-6 py-4 text-center">Laden...</td></tr>
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
                      <td className="px-6 py-4 text-right">
                        <Link href={`/voorzieningen/${v.id}`}>
                          <Button variant="ghost" size="sm">Details</Button>
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
                {!isLoading && !gefilterd.length && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Geen spots gevonden.</td></tr>
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

// Clusters van het gebouw van een spot beheren (aanmaken, hernoemen, herkleuren,
// verwijderen) en deze spot in/uit een cluster zetten. Vereist voorzieningen
// niveau 2; de server dwingt dit ook af.
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

  const [nieuwNaam, setNieuwNaam] = useState("");
  const [nieuwType, setNieuwType] = useState("schacht");
  const [nieuwKleur, setNieuwKleur] = useState(STANDAARD_CLUSTERKLEUR);
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [bewerkNaam, setBewerkNaam] = useState("");
  const [huidigClusterId, setHuidigClusterId] = useState<number | null>(spot.cluster_id);
  const [bezigKoppelen, setBezigKoppelen] = useState(false);

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
          {/* Cluster van deze spot */}
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

          {/* Bestaande clusters */}
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

          {/* Nieuw cluster */}
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
