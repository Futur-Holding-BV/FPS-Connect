import { useState } from "react";
import { useListHeatmapPaginas, useListMuisGebeurtenissen, getListMuisGebeurtenissenQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Loader2, MousePointerClick } from "lucide-react";

export default function Heatmaps() {
  const { data: paginas, isLoading: paginasBezig } = useListHeatmapPaginas();
  const [gekozen, setGekozen] = useState<string>("");
  const [type, setType] = useState<string>("alle");

  const pagina = gekozen || paginas?.[0] || "";
  const muisParams = { pagina: pagina || undefined };
  const { data: gebeurtenissen, isLoading } = useListMuisGebeurtenissen(
    muisParams,
    { query: { enabled: !!pagina, queryKey: getListMuisGebeurtenissenQueryKey(muisParams) } },
  );

  const punten = (gebeurtenissen ?? []).filter((g) => type === "alle" || g.type === type);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="bg-primary/10 text-primary p-2 rounded-lg">
          <Activity className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Heatmaps</h1>
          <p className="text-sm text-muted-foreground">
            Visualisatie van klik- en muisgedrag van gebruikers per pagina
          </p>
        </div>
      </div>

      {paginasBezig ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !paginas || paginas.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Nog geen gebruikersgedrag geregistreerd
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <Select value={pagina} onValueChange={setGekozen}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Kies een pagina" />
              </SelectTrigger>
              <SelectContent>
                {paginas.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle gebeurtenissen</SelectItem>
                <SelectItem value="klik">Alleen klikken</SelectItem>
                <SelectItem value="beweging">Alleen bewegingen</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MousePointerClick className="h-4 w-4" />
              {punten.length} gebeurtenissen
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div
                  className="relative w-full overflow-hidden rounded-lg bg-slate-50"
                  style={{ aspectRatio: "16 / 9" }}
                >
                  {punten.map((p, i) => (
                    <span
                      key={i}
                      className="absolute rounded-full"
                      style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        width: p.type === "klik" ? 18 : 12,
                        height: p.type === "klik" ? 18 : 12,
                        transform: "translate(-50%, -50%)",
                        backgroundColor:
                          p.type === "klik" ? "rgba(220, 38, 38, 0.45)" : "rgba(245, 158, 11, 0.3)",
                        filter: "blur(3px)",
                      }}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            Rood = klikken, oranje = muisbewegingen. Posities zijn relatief aan het schermformaat van de gebruiker.
          </p>
        </>
      )}
    </div>
  );
}
