import { useState } from "react";
import {
  useListCrmRelatievoorstellen,
  useGenereerCrmRelatievoorstellen,
  useAccepteerCrmRelatievoorstel,
  useAfwijsCrmRelatievoorstel,
  useDeleteCrmRelatievoorstel,
  useListCrmKlanten,
  getListCrmRelatievoorstellenQueryKey,
  type CrmRelatievoorstel,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Check, X, Trash2, ExternalLink, Building2, UserPlus } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  open: "Ter beoordeling",
  geaccepteerd: "Geaccepteerd",
  afgewezen: "Afgewezen",
};

const STATUS_KLEUR: Record<string, string> = {
  open: "bg-amber-100 text-amber-700 border-amber-200",
  geaccepteerd: "bg-emerald-100 text-emerald-700 border-emerald-200",
  afgewezen: "bg-gray-100 text-gray-500 border-gray-200",
};

export default function CrmRelatievoorstellenPagina() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [gekozenOrg, setGekozenOrg] = useState<string>("");

  const { data: voorstellen = [], isLoading } = useListCrmRelatievoorstellen();
  const { data: organisaties = [] } = useListCrmKlanten();

  const invalideer = () => qc.invalidateQueries({ queryKey: getListCrmRelatievoorstellenQueryKey() });

  const genereer = useGenereerCrmRelatievoorstellen({
    mutation: {
      onSuccess: (data) => {
        invalideer();
        setDialoogOpen(false);
        setGekozenOrg("");
        toast({ title: data.length > 0 ? `${data.length} voorstel(len) gevonden` : "Geen nieuwe voorstellen gevonden" });
      },
      onError: () => toast({ title: "AI niet beschikbaar", description: "Kon geen voorstellen genereren.", variant: "destructive" }),
    },
  });
  const accepteer = useAccepteerCrmRelatievoorstel({ mutation: { onSuccess: () => { invalideer(); toast({ title: "Contactpersoon toegevoegd" }); } } });
  const afwijs = useAfwijsCrmRelatievoorstel({ mutation: { onSuccess: () => { invalideer(); toast({ title: "Voorstel afgewezen" }); } } });
  const verwijder = useDeleteCrmRelatievoorstel({ mutation: { onSuccess: () => { invalideer(); toast({ title: "Voorstel verwijderd" }); } } });

  const gefilterd = voorstellen.filter((v) => statusFilter === "alle" || v.status === statusFilter);

  const linkedinUrl = (v: CrmRelatievoorstel): string | null => {
    try { return (JSON.parse(v.voorgestelde_data ?? "{}").linkedin_url as string) ?? null; } catch { return null; }
  };

  const start = () => {
    if (!gekozenOrg) { toast({ title: "Kies een organisatie", variant: "destructive" }); return; }
    genereer.mutate({ data: { organisatie_id: Number(gekozenOrg) } });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-500" /> AI-relatievoorstellen
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI zoekt op openbare bronnen naar contactpersonen. Een voorstel wordt pas een echte contactpersoon nadat u het goedkeurt.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Ter beoordeling</SelectItem>
              <SelectItem value="geaccepteerd">Geaccepteerd</SelectItem>
              <SelectItem value="afgewezen">Afgewezen</SelectItem>
              <SelectItem value="alle">Alle</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={dialoogOpen} onOpenChange={setDialoogOpen}>
            <DialogTrigger asChild>
              <Button><Sparkles className="w-4 h-4 mr-1" /> Voorstellen genereren</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>AI-relatievoorstellen genereren</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Kies een organisatie. De AI zoekt op openbare zakelijke bronnen naar mogelijke contactpersonen. U beoordeelt elk voorstel daarna handmatig.
                </p>
                <div>
                  <Label>Organisatie</Label>
                  <Select value={gekozenOrg} onValueChange={setGekozenOrg}>
                    <SelectTrigger><SelectValue placeholder="Kies een organisatie" /></SelectTrigger>
                    <SelectContent>
                      {organisaties.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.naam}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialoogOpen(false)}>Annuleren</Button>
                <Button onClick={start} disabled={genereer.isPending}>
                  {genereer.isPending ? "Bezig met zoeken…" : "Genereren"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : gefilterd.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Geen voorstellen in deze weergave. Genereer voorstellen voor een organisatie om te beginnen.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {gefilterd.map((v) => (
            <Card key={v.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <UserPlus className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{v.naam ?? "Onbekende naam"}</p>
                      {v.functie && <span className="text-sm text-muted-foreground">· {v.functie}</span>}
                      <Badge variant="outline" className={`text-xs border ${STATUS_KLEUR[v.status] ?? ""}`}>{STATUS_LABEL[v.status] ?? v.status}</Badge>
                    </div>
                    {v.organisatie_naam && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> {v.organisatie_naam}
                      </p>
                    )}
                    {v.ai_toelichting && <p className="text-sm text-muted-foreground mt-1.5">{v.ai_toelichting}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs">
                      {v.bron_url ? (
                        <a href={v.bron_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> {v.bron ?? "Bron"}
                        </a>
                      ) : v.bron ? (
                        <span className="text-muted-foreground">Bron: {v.bron}</span>
                      ) : null}
                      {linkedinUrl(v) && (
                        <a href={linkedinUrl(v)!} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> LinkedIn
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {v.status === "open" ? (
                      <>
                        <Button size="sm" className="h-8" onClick={() => accepteer.mutate({ id: v.id })} disabled={accepteer.isPending}>
                          <Check className="w-4 h-4 mr-1" /> Goedkeuren
                        </Button>
                        <Button size="sm" variant="outline" className="h-8" onClick={() => afwijs.mutate({ id: v.id })} disabled={afwijs.isPending}>
                          <X className="w-4 h-4 mr-1" /> Afwijzen
                        </Button>
                      </>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-red-600"><Trash2 className="w-4 h-4" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Voorstel verwijderen?</AlertDialogTitle>
                            <AlertDialogDescription>Dit voorstel wordt definitief verwijderd uit de wachtrij.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuleren</AlertDialogCancel>
                            <AlertDialogAction onClick={() => verwijder.mutate({ id: v.id })}>Verwijderen</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
