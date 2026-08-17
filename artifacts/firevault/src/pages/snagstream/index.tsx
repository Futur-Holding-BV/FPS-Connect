import { useState } from "react";
import { Link } from "wouter";
import {
  useListSnagstreamRapporten,
  useCreateSnagstreamRapport,
  useDeleteSnagstreamRapport,
  useAiUitlezenSnagstreamRapport,
  useListGebouwen,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  FileText, Upload, Sparkles, Eye, Trash2, Loader2, FileArchive, Plus,
} from "lucide-react";
import type { SnagstreamRapport } from "@workspace/api-client-react";

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

export default function SnagstreamArchiefPagina() {
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bestand, setBestand] = useState<File | null>(null);
  const [gebouwId, setGebouwId] = useState<string>("");
  const [uploadBezig, setUploadBezig] = useState(false);
  const [aiBezig, setAiBezig] = useState<number | null>(null);

  const { data: rapporten = [], isLoading } = useListSnagstreamRapporten(
    {},
    { query: { queryKey: ["snagstream-rapporten"] } },
  );
  const { data: gebouwen = [] } = useListGebouwen(
    {},
    { query: { queryKey: ["gebouwen-snagstream"] } },
  );
  const createMut = useCreateSnagstreamRapport({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["snagstream-rapporten"] }) },
  });
  const deleteMut = useDeleteSnagstreamRapport({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["snagstream-rapporten"] }) },
  });
  const aiMut = useAiUitlezenSnagstreamRapport({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ["snagstream-rapporten"] }) },
  });

  const { uploadFile, isUploading } = useUpload({ bestand_type: "rapport" });

  async function handleUpload() {
    if (!bestand) return;
    setUploadBezig(true);
    try {
      const result = await uploadFile(bestand);
      if (!result) return;
      await createMut.mutateAsync({
        data: {
          bestandsnaam: bestand.name,
          pdf_url: result.objectPath,
          gebouw_id: gebouwId ? parseInt(gebouwId, 10) : undefined,
        },
      });
      setUploadOpen(false);
      setBestand(null);
      setGebouwId("");
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

  const rapportenLijst = rapporten as SnagstreamRapport[];

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Koptekst */}
      <div className="flex items-center justify-between">
        <div>
          <h1 data-paginatitel className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <FileArchive className="h-6 w-6 text-primary" />
            Snagstream archief
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Historische Snagstream PDF-rapporten — read-only archief, overname naar Connect-spots via het rapport.
          </p>
        </div>
        <Button size="sm" onClick={() => setUploadOpen(true)}>
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          PDF uploaden
        </Button>
      </div>

      {/* Archieflijn */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laden...
        </div>
      ) : rapportenLijst.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileArchive className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Nog geen Snagstream rapporten geüpload.</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={() => setUploadOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Eerste rapport uploaden
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Bestandsnaam</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Opdrachtgever</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Gebouw</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Datum</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Snags</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-600">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rapportenLijst.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium truncate max-w-xs">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="truncate">{r.bestandsnaam}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.opdrachtgever ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.gebouw_naam ?? (
                      <span className="text-slate-400 italic">Niet gekoppeld</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {r.rapportdatum ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_KLEUR[r.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {(r.snag_count ?? 0) > 0 ? `${r.snag_count} snags` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {r.status === "nieuw" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={aiBezig === r.id}
                          onClick={() => handleAiUitlezen(r.id)}
                        >
                          {aiBezig === r.id
                            ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            : <Sparkles className="h-3 w-3 mr-1" />}
                          AI uitlezen
                        </Button>
                      )}
                      <Link href={`/snagstream/${r.id}`}>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("Rapport verwijderen?")) {
                            deleteMut.mutate({ id: r.id });
                          }
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

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Snagstream PDF uploaden</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>PDF-bestand</Label>
              <Input
                type="file"
                accept=".pdf"
                className="mt-1"
                onChange={(e) => setBestand(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Alleen PDF-bestanden. Het rapport wordt na upload als read-only archief bewaard.
              </p>
            </div>
            <div>
              <Label>Koppelen aan gebouw (optioneel)</Label>
              <Select value={gebouwId} onValueChange={setGebouwId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Kies een gebouw..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nog niet koppelen</SelectItem>
                  {(gebouwen as Array<{ id: number; naam: string }>).map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              Snagstream-data wordt nooit automatisch overgenomen. U kunt na upload de AI-uitlezing starten en daarna individuele snags handmatig overnemen als Connect-spots.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Annuleren</Button>
            <Button
              disabled={!bestand || uploadBezig || isUploading}
              onClick={handleUpload}
            >
              {(uploadBezig || isUploading) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Uploaden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
