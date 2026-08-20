import { useState } from "react";
import {
  useListLoonJaarparameters,
  useGetLoonJaarparameters,
  useGetLoonJaarGereedheid,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle, Calendar, CheckCircle2, Clock, ExternalLink, Hash,
  Plus, XCircle,
} from "lucide-react";
import {
  HUIDIG_JAAR, DatumLabel, StatusBadge,
  STATUS_LABEL, GEREED_LABEL, BRONSOORT_LABELS,
} from "./helpers";
import { ImportmanifestForm } from "./importmanifest-form";

export function JaarparametersTab() {
  const { data: jaren = [] } = useListLoonJaarparameters();
  const [geselecteerdJaar, setGeselecteerdJaar] = useState<number>(HUIDIG_JAAR);
  const [toonImport, setToonImport] = useState(false);
  const beschikbareJaren = Array.from(
    new Set([HUIDIG_JAAR, ...jaren.map((jaarset) => jaarset.jaar)]),
  ).sort((a, b) => b - a);

  const { data: detail } = useGetLoonJaarparameters(geselecteerdJaar, {
    alle: false,
  });
  const { data: gereedheid } = useGetLoonJaarGereedheid(geselecteerdJaar);

  const nietBerekend =
    detail?.parameters.filter((p) => p.rekenstatus === "niet_berekend") ?? [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Select
            value={String(geselecteerdJaar)}
            onValueChange={(v) => setGeselecteerdJaar(Number(v))}
          >
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {beschikbareJaren.map((j) => (
                <SelectItem key={j} value={String(j)}>
                  {j}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {gereedheid && (
            <Badge
              className={
                gereedheid.gereed
                  ? "bg-green-100 text-green-800 border-green-200"
                  : "bg-amber-100 text-amber-800 border-amber-200"
              }
            >
              {gereedheid.gereed ? (
                <><CheckCircle2 className="w-3 h-3 mr-1" />Gereed</>
              ) : (
                <>
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {GEREED_LABEL[gereedheid.status] ?? gereedheid.status}
                </>
              )}
            </Badge>
          )}
        </div>

        <Button size="sm" onClick={() => setToonImport((v) => !v)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Importmanifest registreren
        </Button>
      </div>

      {/* Gereedheidsredenen */}
      {gereedheid && !gereedheid.gereed && gereedheid.redenen.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 space-y-1">
          <p className="font-medium">Redenen onvolledigheid:</p>
          {gereedheid.redenen.map((r, i) => (
            <p key={i}>• {r}</p>
          ))}
        </div>
      )}

      {/* Detail geselecteerd jaar */}
      {detail && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
              <Calendar className="w-4 h-4 text-primary" />
              Jaarset {detail.jaar} (versie {detail.versie})
              <StatusBadge volledig={detail.volledig} />
              <Badge variant="outline" className="text-[10px]">
                {STATUS_LABEL[detail.status] ?? detail.status}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-sm mb-4">
              <div>
                <dt className="text-muted-foreground text-xs">Parameters</dt>
                <dd>{detail.parameter_aantal}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Laadmoment</dt>
                <dd><DatumLabel iso={detail.geladen_op} /></dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Primaire bestandsnaam</dt>
                <dd
                  className="font-mono text-xs truncate max-w-[14rem]"
                  title={detail.bron_bestandsnaam ?? undefined}
                >
                  {detail.bron_bestandsnaam ?? "—"}
                </dd>
              </div>
            </dl>

            {detail.fouten.length > 0 && (
              <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800 space-y-0.5">
                {detail.fouten.map((f, i) => (
                  <div key={i}>
                    <XCircle className="inline w-3 h-3 mr-1" />
                    {f.sleutel ? `${f.sleutel}: ` : ""}
                    {f.reden}
                  </div>
                ))}
              </div>
            )}

            {/* Bronbestanden */}
            {detail.bronnen.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Bronbestanden ({detail.bronnen.length})
                </h4>
                <div className="space-y-2">
                  {detail.bronnen.map((b) => (
                    <div
                      key={b.id}
                      className="border rounded p-3 text-xs space-y-1 bg-muted/20"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {BRONSOORT_LABELS[b.bronsoort] ?? b.bronsoort}
                        </span>
                        <a
                          href={b.bron_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary flex items-center gap-0.5 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />URL
                        </a>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                        <div>
                          <span className="text-muted-foreground">Bestandsnaam:</span>{" "}
                          <span className="font-mono">{b.officiele_bestandsnaam}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Versie:</span>{" "}
                          {b.officiele_versie}
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-muted-foreground">SHA-256:</span>{" "}
                          <span className="font-mono break-all">{b.sha256}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Vindplaats:</span>{" "}
                          {b.vindplaats}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Geladen op:</span>{" "}
                          <DatumLabel iso={b.geladen_op} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Niet-berekende parameters */}
            {nietBerekend.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                  Niet-berekende parameters ({nietBerekend.length})
                </h4>
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  {nietBerekend.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-start gap-2 text-xs p-2 border rounded bg-amber-50/50"
                    >
                      <Hash className="w-3 h-3 shrink-0 mt-0.5 text-amber-500" />
                      <div className="min-w-0">
                        <span className="font-mono font-medium">{p.sleutel}</span>
                        {p.reden && (
                          <span className="text-muted-foreground ml-1">
                            — {p.reden}
                          </span>
                        )}
                        {p.vindplaats && (
                          <span className="text-muted-foreground ml-1">
                            (bron: {p.vindplaats})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Importhistorie */}
      {jaren.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Importhistorie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {jaren.map((set) => (
                <div
                  key={set.id}
                  className="flex items-center justify-between p-2 rounded border text-sm cursor-pointer hover:bg-muted/30"
                  onClick={() => setGeselecteerdJaar(set.jaar)}
                >
                  <span className="font-medium">
                    {set.jaar} (versie {set.versie})
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusBadge volledig={set.volledig} />
                    <Badge variant="outline" className="text-[10px]">
                      {STATUS_LABEL[set.status] ?? set.status}
                    </Badge>
                    {set.geladen_op && (
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        <DatumLabel iso={set.geladen_op} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Importmanifest formulier */}
      {toonImport && (
        <ImportmanifestForm onSluiten={() => setToonImport(false)} />
      )}
    </div>
  );
}
