import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListDossiers,
  useCreateDossier,
  useDossierDefinitiefMaken,
  useDossierArchiveren,
  useListDossierDocumenten,
  useListGebouwen,
  getListDossiersQueryKey,
} from "@workspace/api-client-react";
import type { Dossier, DossierInput, DossierDocument } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  FolderOpen,
  Plus,
  Search,
  Lock,
  Archive,
  FileText,
  Download,
  AlertTriangle,
  Files,
} from "lucide-react";

const TYPES = ["algemeen", "project", "gebouw", "kwaliteit", "incident"] as const;

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-amber-100 text-amber-800 border-amber-200",
  definitief: "bg-emerald-100 text-emerald-800 border-emerald-200",
  gearchiveerd: "bg-muted text-muted-foreground border-border",
};

const LEEG: DossierInput = {
  naam: "",
  type: "algemeen",
  omschrijving: "",
};

export default function DossiersPagina() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: dossiers, isLoading } = useListDossiers();
  const { data: gebouwen } = useListGebouwen();
  const maakDossier = useCreateDossier();
  const definitiefMaken = useDossierDefinitiefMaken();
  const archiveren = useDossierArchiveren();

  const [zoek, setZoek] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<DossierInput>(LEEG);
  const [docDossier, setDocDossier] = useState<Dossier | null>(null);

  const gefilterd = (dossiers ?? []).filter((d) => {
    const t = zoek.trim().toLowerCase();
    if (!t) return true;
    return d.naam.toLowerCase().includes(t) || (d.gebouw_naam ?? "").toLowerCase().includes(t);
  });

  async function herlaad() {
    await queryClient.invalidateQueries({ queryKey: getListDossiersQueryKey() });
  }

  async function opslaan() {
    if (!form.naam.trim()) {
      toast({ title: "Naam is verplicht", variant: "destructive" });
      return;
    }
    try {
      const schoon: DossierInput = {
        naam: form.naam.trim(),
        type: form.type,
        omschrijving: form.omschrijving?.trim() || undefined,
        gebouw_id: form.gebouw_id ?? undefined,
      };
      await maakDossier.mutateAsync({ data: schoon });
      await herlaad();
      toast({ title: "Dossier aangemaakt" });
      setForm(LEEG);
      setOpen(false);
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  async function maakDefinitief(id: number) {
    try {
      await definitiefMaken.mutateAsync({ id });
      await herlaad();
      toast({ title: "Dossier is definitief gemaakt" });
    } catch {
      toast({ title: "Actie mislukt", variant: "destructive" });
    }
  }

  async function archiveer(id: number) {
    try {
      await archiveren.mutateAsync({ id });
      await herlaad();
      toast({ title: "Dossier gearchiveerd" });
    } catch {
      toast({ title: "Actie mislukt", variant: "destructive" });
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dossiers</h1>
          <p className="text-sm text-muted-foreground">
            Centrale dossiers met statussturing en documentbevriezing.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nieuw dossier
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Zoek op naam of gebouw…" value={zoek} onChange={(e) => setZoek(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : gefilterd.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <FolderOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>Geen dossiers gevonden.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {gefilterd.map((d) => (
            <Card key={d.id} className="h-full">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-primary/10 text-primary rounded p-2 flex-shrink-0">
                      <FolderOpen className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{d.naam}</div>
                      <div className="text-xs text-muted-foreground">{d.type}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className={STATUS_KLEUR[d.status] ?? ""}>{d.status}</Badge>
                </div>
                {d.gebouw_naam && <div className="text-xs text-muted-foreground">Gebouw: {d.gebouw_naam}</div>}
                {d.omschrijving && <p className="text-xs text-muted-foreground line-clamp-2">{d.omschrijving}</p>}
                {d.definitief_op && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Lock className="h-3 w-3" />
                    Definitief sinds {d.definitief_op.slice(0, 10)} — documenten bevroren
                  </div>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setDocDossier(d)}>
                    <Files className="h-3.5 w-3.5" /> Documenten
                  </Button>
                  {d.status === "concept" && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => maakDefinitief(d.id)} disabled={definitiefMaken.isPending}>
                        <Lock className="h-3.5 w-3.5" /> Definitief
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => archiveer(d.id)} disabled={archiveren.isPending}>
                        <Archive className="h-3.5 w-3.5" /> Archiveren
                      </Button>
                    </>
                  )}
                  {d.status === "definitief" && (
                    <Button size="sm" variant="ghost" onClick={() => archiveer(d.id)} disabled={archiveren.isPending}>
                      <Archive className="h-3.5 w-3.5" /> Archiveren
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nieuw dossier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Naam *</Label>
              <Input value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Gebouw (optioneel)</Label>
              <Select
                value={form.gebouw_id ? String(form.gebouw_id) : undefined}
                onValueChange={(v) => setForm({ ...form, gebouw_id: Number(v) })}
              >
                <SelectTrigger><SelectValue placeholder="Geen koppeling" /></SelectTrigger>
                <SelectContent>
                  {(gebouwen ?? []).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Omschrijving</Label>
              <Textarea value={form.omschrijving ?? ""} onChange={(e) => setForm({ ...form, omschrijving: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Annuleren</Button>
            <Button onClick={opslaan} disabled={maakDossier.isPending}>
              {maakDossier.isPending ? "Bezig…" : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {docDossier && (
        <DossierDocumentenDialog
          dossier={docDossier}
          onOpenChange={(o) => {
            if (!o) setDocDossier(null);
          }}
        />
      )}
    </div>
  );
}

// Toont de gekoppelde documenten van een dossier. Voor een definitief dossier wordt
// de bevroren snapshot getoond (bevroren revisie + datum) met een waarschuwing wanneer
// er inmiddels een nieuwere revisie in de bibliotheek bestaat.
function DossierDocumentenDialog({
  dossier,
  onOpenChange,
}: {
  dossier: Dossier;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: documenten = [], isLoading } = useListDossierDocumenten(dossier.id);
  const isDefinitief = dossier.status === "definitief";
  const lijst = documenten as DossierDocument[];

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Files className="h-4 w-4 text-primary" />
            Documenten — {dossier.naam}
          </DialogTitle>
        </DialogHeader>

        {isDefinitief ? (
          <div className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Lock className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Dit dossier is definitief. De bibliotheekdocumenten zijn bevroren op de
              revisie die gold bij het definitief maken; latere revisies wijzigen dit
              dossier niet meer.
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Dit dossier is nog concept. Documenten worden bevroren zodra het dossier
            definitief wordt gemaakt.
          </p>
        )}

        {isLoading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : lijst.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nog geen documenten aan dit dossier gekoppeld.
          </div>
        ) : (
          <div className="rounded-md border divide-y">
            {lijst.map((doc) => {
              const bevroren =
                isDefinitief && doc.bevroren_revisie_nummer != null;
              const nieuwere =
                bevroren &&
                doc.actuele_revisie_nummer != null &&
                doc.actuele_revisie_nummer > (doc.bevroren_revisie_nummer ?? 0);
              const pdf = bevroren ? doc.bevroren_pdf_url : doc.bestand_url;
              return (
                <div key={doc.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{doc.naam}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                      {doc.categorie && (
                        <Badge variant="outline" className="text-[10px]">
                          {doc.categorie}
                        </Badge>
                      )}
                      {bevroren ? (
                        <span>
                          Bevroren op revisie {doc.bevroren_revisie_nummer}
                          {doc.bevroren_op ? ` (${doc.bevroren_op.slice(0, 10)})` : ""}
                        </span>
                      ) : (
                        <span>Revisie {doc.versie}</span>
                      )}
                    </div>
                    {nieuwere && (
                      <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        Nieuwere revisie beschikbaar in bibliotheek (rev{" "}
                        {doc.actuele_revisie_nummer}). Dit dossier blijft op de
                        bevroren versie.
                      </div>
                    )}
                  </div>
                  {pdf && (
                    <a
                      href={`/api/storage${pdf}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary shrink-0"
                      title="PDF openen"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Sluiten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
