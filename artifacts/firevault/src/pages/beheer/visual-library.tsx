import { useState } from "react";
import { useListVisualLibrary, getListVisualLibraryQueryKey } from "@workspace/api-client-react";
import type { FpsVisualItem } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScanSearch, Loader2, Search, TrendingUp, CheckCircle2, AlertTriangle, Circle } from "lucide-react";

function ScoreBadge({ pct }: { pct: number | null | undefined }) {
  if (pct == null) {
    return (
      <Badge variant="outline" className="text-muted-foreground gap-1">
        <Circle className="h-3 w-3" />
        Geen data
      </Badge>
    );
  }
  if (pct >= 80) {
    return (
      <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
        <CheckCircle2 className="h-3 w-3" />
        {pct}%
      </Badge>
    );
  }
  if (pct >= 50) {
    return (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1">
        <AlertTriangle className="h-3 w-3" />
        {pct}%
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-800 border-red-200 gap-1">
      <AlertTriangle className="h-3 w-3" />
      {pct}%
    </Badge>
  );
}

function VisualRij({ visual }: { visual: FpsVisualItem }) {
  return (
    <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
      <td className="py-3 px-4">
        <div className="font-medium text-sm">{visual.naam}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {VISUAL_TYPE_LABELS[visual.visual_type] ?? visual.visual_type}
        </div>
      </td>
      <td className="py-3 px-4 hidden sm:table-cell">
        <Badge variant="outline" className="text-xs">
          {visual.bron_type}
        </Badge>
      </td>
      <td className="py-3 px-4 hidden md:table-cell">
        <div className="flex flex-wrap gap-1">
          {visual.spot_type.length === 0 ? (
            <span className="text-xs text-muted-foreground">Alle types</span>
          ) : (
            visual.spot_type.slice(0, 3).map((st) => (
              <Badge key={st} variant="secondary" className="text-xs">
                {st}
              </Badge>
            ))
          )}
          {visual.spot_type.length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{visual.spot_type.length - 3}
            </Badge>
          )}
        </div>
      </td>
      <td className="py-3 px-4">
        <Badge
          variant={visual.actief ? "default" : "outline"}
          className={visual.actief ? "bg-primary/10 text-primary border-primary/20" : "text-muted-foreground"}
        >
          {visual.actief ? "Actief" : "Inactief"}
        </Badge>
      </td>
      <td className="py-3 px-4 text-center">
        <span className={`text-sm font-medium ${visual.n_getoond === 0 ? "text-muted-foreground" : ""}`}>
          {visual.n_getoond}
        </span>
      </td>
      <td className="py-3 px-4 text-center">
        <ScoreBadge pct={visual.pct_zonder_herstelwerk} />
      </td>
      <td className="py-3 px-4 text-center hidden lg:table-cell">
        {visual.gem_stap_duur != null ? (
          <span className="text-sm">{Math.round(visual.gem_stap_duur)}s</span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

const VISUAL_TYPE_LABELS: Record<string, string> = {
  detailtekening: "Detailtekening",
  projecttekening_uitsnede: "Projecttekening",
  referentiefoto: "Referentiefoto",
  exploded_view: "Exploded view",
  animatie: "Animatie",
  checklist: "Checklist",
  productblad: "Productblad",
  montagevoorschrift: "Montagevoorschrift",
  schema: "Schema",
  "3d_weergave": "3D-weergave",
};

export default function VisualLibraryBeheer() {
  const { data: visuals, isLoading } = useListVisualLibrary({
    query: { queryKey: getListVisualLibraryQueryKey() },
  });

  const [zoek, setZoek] = useState("");
  const [filterType, setFilterType] = useState("alle");
  const [filterActief, setFilterActief] = useState("alle");
  const [sortering, setSortering] = useState("naam");

  const gefilterd = (visuals ?? [])
    .filter((v) => {
      if (zoek && !v.naam.toLowerCase().includes(zoek.toLowerCase()) && !v.visual_type.toLowerCase().includes(zoek.toLowerCase())) return false;
      if (filterType !== "alle" && v.visual_type !== filterType) return false;
      if (filterActief === "actief" && !v.actief) return false;
      if (filterActief === "inactief" && v.actief) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortering === "naam") return a.naam.localeCompare(b.naam);
      if (sortering === "score_desc") {
        const sa = a.pct_zonder_herstelwerk ?? -1;
        const sb = b.pct_zonder_herstelwerk ?? -1;
        return sb - sa;
      }
      if (sortering === "score_asc") {
        const sa = a.pct_zonder_herstelwerk ?? 101;
        const sb = b.pct_zonder_herstelwerk ?? 101;
        return sa - sb;
      }
      if (sortering === "getoond_desc") return b.n_getoond - a.n_getoond;
      return 0;
    });

  const totaalGetoond = (visuals ?? []).reduce((s, v) => s + v.n_getoond, 0);
  const metData = (visuals ?? []).filter((v) => v.n_getoond > 0);
  const gemScore =
    metData.length > 0
      ? Math.round(metData.reduce((s, v) => s + (v.pct_zonder_herstelwerk ?? 0), 0) / metData.length)
      : null;

  const uniqueTypes = [...new Set((visuals ?? []).map((v) => v.visual_type))].sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary p-2 rounded-lg">
          <ScanSearch className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visual Library</h1>
          <p className="text-sm text-muted-foreground">
            Effectiviteit van visuele begeleiding (VGE) per visual
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !visuals || visuals.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Nog geen visuals in de library
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Totaal visuals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{visuals.length}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {(visuals ?? []).filter((v) => v.actief).length} actief
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Keer getoond</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totaalGetoond}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {metData.length} visuals met data
                </div>
              </CardContent>
            </Card>
            <Card className="col-span-2 sm:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Gem. score
                </CardTitle>
              </CardHeader>
              <CardContent>
                {gemScore != null ? (
                  <>
                    <div className="text-2xl font-bold">{gemScore}%</div>
                    <div className="text-xs text-muted-foreground mt-1">zonder herstelwerk</div>
                  </>
                ) : (
                  <div className="text-2xl font-bold text-muted-foreground">—</div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-5 pb-3">
              <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Zoek op naam of type..."
                    value={zoek}
                    onChange={(e) => setZoek(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Alle types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle types</SelectItem>
                    {uniqueTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {VISUAL_TYPE_LABELS[t] ?? t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterActief} onValueChange={setFilterActief}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alle">Alle statussen</SelectItem>
                    <SelectItem value="actief">Alleen actief</SelectItem>
                    <SelectItem value="inactief">Alleen inactief</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortering} onValueChange={setSortering}>
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="naam">Sorteren: naam</SelectItem>
                    <SelectItem value="score_desc">Score: hoog naar laag</SelectItem>
                    <SelectItem value="score_asc">Score: laag naar hoog</SelectItem>
                    <SelectItem value="getoond_desc">Meest getoond</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {gefilterd.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Geen visuals gevonden
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b">
                        <th className="py-2 px-4 text-left font-medium">Visual</th>
                        <th className="py-2 px-4 text-left font-medium hidden sm:table-cell">Bron</th>
                        <th className="py-2 px-4 text-left font-medium hidden md:table-cell">Spot-types</th>
                        <th className="py-2 px-4 text-left font-medium">Status</th>
                        <th className="py-2 px-4 text-center font-medium">Getoond</th>
                        <th className="py-2 px-4 text-center font-medium">Zonder herstelwerk</th>
                        <th className="py-2 px-4 text-center font-medium hidden lg:table-cell">Gem. stap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gefilterd.map((v) => (
                        <VisualRij key={v.id} visual={v} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-3 text-xs text-muted-foreground text-right">
                {gefilterd.length} van {visuals.length} visuals
              </div>
            </CardContent>
          </Card>

          <div className="text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">
            <strong>Toelichting scores:</strong> "Zonder herstelwerk" toont het percentage stappen waarbij de visual
            getoond was en géén herstelwerk nodig bleek. Groen = 80%+, oranje = 50–79%, rood = onder 50%.
            Data wordt bijgehouden bij elke stap-voltooiing waarbij VGE-begeleiding actief was.
          </div>
        </>
      )}
    </div>
  );
}
