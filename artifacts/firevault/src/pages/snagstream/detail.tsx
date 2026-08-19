import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import {
  useGetSnagstreamRapport,
  useListSnagstreamSnags,
  useUpdateSnagstreamRapport,
  useAiUitlezenSnagstreamRapport,
  useOvernemenSnagstreamSnag,
  useListGebouwen,
  useListVerdiepingen,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { SnagstreamRapport, SnagstreamSnag } from "@workspace/api-client-react";
import {
  FileArchive, ArrowLeft, Sparkles, Building2, CheckCircle2, AlertTriangle,
  Loader2, Copy, ChevronRight, MapPin, Tag, Info,
} from "lucide-react";

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

function ConfidenceBadge({ score }: { score?: number | null }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  const kleur = score >= 0.8 ? "text-green-600" : score >= 0.6 ? "text-amber-600" : "text-red-600";
  return <span className={`text-xs font-mono ${kleur}`}>{pct}%</span>;
}

export default function SnagstreamDetailPagina() {
  const [, params] = useRoute("/snagstream/:id");
  const id = parseInt(params?.id ?? "0", 10);
  const queryClient = useQueryClient();

  const [koppelenOpen, setKoppelenOpen] = useState(false);
  const [selectedGebouwId, setSelectedGebouwId] = useState<string>("");
  const [overnemenOpen, setOvernemenOpen] = useState(false);
  const [selectedSnag, setSelectedSnag] = useState<SnagstreamSnag | null>(null);
  const [selectedVerdiepingId, setSelectedVerdiepingId] = useState<string>("");
  const [aiBezig, setAiBezig] = useState(false);
  const [overnemenBezig, setOvernemenBezig] = useState(false);

  const { data: rapport, isLoading } = useGetSnagstreamRapport(
    id,
    { query: { queryKey: ["snagstream-rapport", id], enabled: id > 0 } },
  );
  const { data: snags = [] } = useListSnagstreamSnags(
    id,
    { query: { queryKey: ["snagstream-snags", id], enabled: id > 0 } },
  );
  const { data: gebouwen = [] } = useListGebouwen(
    {},
    { query: { queryKey: ["gebouwen-snagstream"] } },
  );

  const verdiepingGebouwId = selectedGebouwId
    ? parseInt(selectedGebouwId, 10)
    : (rapport as SnagstreamRapport | undefined)?.gebouw_id ?? 0;

  const { data: verdiepingen = [] } = useListVerdiepingen(
    verdiepingGebouwId,
    { query: { queryKey: ["verdiepingen-snagstream", verdiepingGebouwId], enabled: verdiepingGebouwId > 0 } },
  );

  const updateMut = useUpdateSnagstreamRapport({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["snagstream-rapport", id] });
        queryClient.invalidateQueries({ queryKey: ["snagstream-rapporten"] });
      },
    },
  });
  const aiMut = useAiUitlezenSnagstreamRapport({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["snagstream-rapport", id] });
        queryClient.invalidateQueries({ queryKey: ["snagstream-snags", id] });
        queryClient.invalidateQueries({ queryKey: ["snagstream-rapporten"] });
      },
    },
  });
  const overnemenMut = useOvernemenSnagstreamSnag({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["snagstream-snags", id] });
        queryClient.invalidateQueries({ queryKey: ["snagstream-rapport", id] });
        queryClient.invalidateQueries({ queryKey: ["snagstream-rapporten"] });
      },
    },
  });

  async function handleKoppelen() {
    if (!selectedGebouwId) return;
    await updateMut.mutateAsync({ id, data: { gebouw_id: parseInt(selectedGebouwId, 10), status: "gekoppeld" } });
    setKoppelenOpen(false);
    setSelectedGebouwId("");
  }

  async function handleAiUitlezen() {
    setAiBezig(true);
    try {
      await aiMut.mutateAsync({ id });
    } finally {
      setAiBezig(false);
    }
  }

  async function handleOvernemen() {
    if (!selectedSnag || !verdiepingGebouwId || !selectedVerdiepingId) return;
    setOvernemenBezig(true);
    try {
      await overnemenMut.mutateAsync({
        id: selectedSnag.id,
        data: {
          gebouw_id: verdiepingGebouwId,
          verdieping_id: parseInt(selectedVerdiepingId, 10),
          type_naam: selectedSnag.type_naam ?? undefined,
          ruimte: selectedSnag.ruimte ?? undefined,
          omschrijving: selectedSnag.omschrijving ?? undefined,
        },
      });
      setOvernemenOpen(false);
      setSelectedSnag(null);
      setSelectedVerdiepingId("");
    } finally {
      setOvernemenBezig(false);
    }
  }

  const snagLijst = snags as SnagstreamSnag[];

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash || snagLijst.length === 0) return;
    requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [snagLijst.length]);

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Laden...
      </div>
    );
  }

  const r = rapport as SnagstreamRapport | undefined;
  if (!r) return <div className="p-6 text-muted-foreground">Rapport niet gevonden.</div>;

  const gebouwLijst = gebouwen as Array<{ id: number; naam: string }>;
  const verdiepingLijst = verdiepingen as Array<{ id: number; naam: string }>;
  const status = r.status;
  const kanAiStarten = status === "nieuw" || status === "fout";
  const kanKoppelen = !r.gebouw_id;
  const overgenomenCount = snagLijst.filter((s) => s.overgenomen).length;

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Navigatie */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/snagstream">
          <button className="flex items-center gap-1 hover:text-foreground transition-colors">
            <ArrowLeft className="h-3.5 w-3.5" />
            Snagstream archief
          </button>
        </Link>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground truncate max-w-xs">{r.bestandsnaam}</span>
      </div>

      {/* Header kaart */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <FileArchive className="h-8 w-8 text-primary mt-0.5 shrink-0" />
              <div>
                <h1 data-paginatitel className="text-xl font-semibold text-slate-900">{r.bestandsnaam}</h1>
                <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                  {r.opdrachtgever && <span>{r.opdrachtgever}</span>}
                  {r.project_naam && <span>· {r.project_naam}</span>}
                  {r.rapportdatum && <span>· {r.rapportdatum}</span>}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${STATUS_KLEUR[status] ?? "bg-slate-100 text-slate-600"}`}>
                    {STATUS_LABEL[status] ?? status}
                  </span>
                  {snagLijst.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {overgenomenCount}/{snagLijst.length} snags overgenomen
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Geüpload op {new Date(r.aangemaakt_op).toLocaleString("nl-NL")}
                  {" door "}
                  {r.uploader_naam ?? "onbekend"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {kanAiStarten && (
                <Button size="sm" onClick={handleAiUitlezen} disabled={aiBezig}>
                  {aiBezig
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />AI bezig...</>
                    : <><Sparkles className="h-3.5 w-3.5 mr-1.5" />AI uitlezen</>}
                </Button>
              )}
              {kanKoppelen && (
                <Button size="sm" variant="outline" onClick={() => setKoppelenOpen(true)}>
                  <Building2 className="h-3.5 w-3.5 mr-1.5" />
                  Koppel aan gebouw
                </Button>
              )}
              {!kanKoppelen && (
                <div className="flex items-center gap-1.5 text-sm">
                  <Building2 className="h-4 w-4 text-violet-600" />
                  <span className="font-medium text-slate-700">{r.gebouw_naam}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Waarschuwing geen koppeling */}
      {kanKoppelen && snagLijst.length > 0 && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Koppel dit rapport eerst aan een gebouw voordat u snags overneemt als Connect-spots.</span>
        </div>
      )}

      {/* AI metadata */}
      {r.ai_metadata && Object.keys(r.ai_metadata).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              AI-herkende rapportinformatie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {Object.entries(r.ai_metadata as Record<string, unknown>)
                .filter(([k]) => k !== "confidence")
                .map(([k, v]) => (
                  <div key={k}>
                    <span className="text-muted-foreground text-xs uppercase tracking-wide">{k.replace(/_/g, " ")}</span>
                    <p className="font-medium text-slate-700 mt-0.5">{String(v ?? "—")}</p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Snags lijst */}
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          Herkende snags
          {snagLijst.length > 0 && (
            <span className="text-muted-foreground font-normal text-sm ml-2">({snagLijst.length})</span>
          )}
        </h2>

        {snagLijst.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              {kanAiStarten
                ? "Start de AI-uitlezing om snags te herkennen uit de PDF."
                : "Geen snags gevonden in dit rapport."}
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 w-16">Nr.</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600">Type / Applicatie</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600">Locatie</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600">Omschrijving</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600">Status orig.</th>
                  <th className="px-3 py-2.5 text-left font-medium text-slate-600 w-14">Conf.</th>
                  <th className="px-3 py-2.5 text-right font-medium text-slate-600 w-32">Actie</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {snagLijst.map((s) => {
                  const conf = s.confidence_scores as Record<string, number> | null;
                  const waarden = conf ? Object.values(conf) : [];
                  const gemConf = waarden.length > 0
                    ? waarden.reduce((a, b) => a + b, 0) / waarden.length
                    : null;
                  return (
                    <tr
                      key={s.id}
                      id={`snag-${s.id}`}
                      className={s.overgenomen ? "bg-green-50/40" : "hover:bg-slate-50/50"}
                    >
                      <td className="px-3 py-3 text-muted-foreground font-mono text-xs">
                        {s.snagnummer ?? `#${s.id}`}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <Tag className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-700">{s.type_naam ?? "—"}</span>
                        </div>
                        {s.applicatie_naam && (
                          <span className="text-xs text-muted-foreground block mt-0.5 pl-4">
                            {s.applicatie_naam}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground text-xs">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span>{[s.verdieping, s.ruimte].filter(Boolean).join(" · ") || "—"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600 max-w-xs">
                        <p className="line-clamp-2">{s.omschrijving ?? "—"}</p>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {s.status_origineel ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <ConfidenceBadge score={gemConf} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        {s.overgenomen ? (
                          <div className="flex items-center gap-1 justify-end text-green-600 text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Overgenomen
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={kanKoppelen}
                            onClick={() => {
                              setSelectedSnag(s);
                              setSelectedVerdiepingId("");
                              setOvernemenOpen(true);
                            }}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Overnemen
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Koppelen dialog */}
      <Dialog open={koppelenOpen} onOpenChange={setKoppelenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rapport koppelen aan gebouw</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Gebouw</Label>
            <Select value={selectedGebouwId} onValueChange={setSelectedGebouwId}>
              <SelectTrigger>
                <SelectValue placeholder="Kies een gebouw..." />
              </SelectTrigger>
              <SelectContent>
                {gebouwLijst.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKoppelenOpen(false)}>Annuleren</Button>
            <Button disabled={!selectedGebouwId || updateMut.isPending} onClick={handleKoppelen}>
              {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Koppelen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overnemen dialog */}
      <Dialog open={overnemenOpen} onOpenChange={setOvernemenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Snag overnemen als Connect-spot</DialogTitle>
          </DialogHeader>
          {selectedSnag && (
            <div className="space-y-4">
              <div className="rounded-lg bg-slate-50 border px-3 py-2 text-sm text-slate-700 space-y-1">
                <p><span className="text-muted-foreground">Type:</span> {selectedSnag.type_naam ?? "—"}</p>
                <p>
                  <span className="text-muted-foreground">Locatie:</span>{" "}
                  {[selectedSnag.verdieping, selectedSnag.ruimte].filter(Boolean).join(" · ") || "—"}
                </p>
                {selectedSnag.omschrijving && (
                  <p className="text-xs text-muted-foreground">{selectedSnag.omschrijving}</p>
                )}
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                De snag wordt overgenomen als concept-spot. U kunt alle gegevens daarna verder aanvullen.
              </div>
              <div>
                <Label className="text-sm">Verdieping</Label>
                <Select value={selectedVerdiepingId} onValueChange={setSelectedVerdiepingId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Kies een verdieping..." />
                  </SelectTrigger>
                  <SelectContent>
                    {verdiepingLijst.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>{v.naam}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOvernemenOpen(false); setSelectedSnag(null); }}>
              Annuleren
            </Button>
            <Button
              disabled={!selectedVerdiepingId || overnemenBezig}
              onClick={handleOvernemen}
            >
              {overnemenBezig ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Overnemen als spot
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
