import { useState } from "react";
import {
  useListCrmConcurrenten,
  useCreateCrmConcurrent,
  useUpdateCrmConcurrent,
  useAiProfielCrmConcurrent,
  getListCrmConcurrentenQueryKey,
} from "@workspace/api-client-react";
import type { CrmConcurrent } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Handshake, Plus, ArrowLeft, Globe, MapPin, Edit2, ThumbsUp, ThumbsDown, Sparkles, Loader2 } from "lucide-react";

export default function ConcurrentenPagina() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [bewerkOpen, setBewerkOpen] = useState(false);
  const [geselecteerd, setGeselecteerd] = useState<CrmConcurrent | null>(null);

  const { data: concurrenten = [], isLoading } = useListCrmConcurrenten();
  const aanmaken = useCreateCrmConcurrent();
  const bijwerken = useUpdateCrmConcurrent();
  const aiProfiel = useAiProfielCrmConcurrent();
  const [aiBezig, setAiBezig] = useState(false);
  const [aiVoorstel, setAiVoorstel] = useState<Record<string, string> | null>(null);

  async function aiConcurrentPrefill() {
    if (!velden.naam.trim()) return;
    setAiBezig(true);
    setAiVoorstel(null);
    try {
      const result = await aiProfiel.mutateAsync({ data: { naam: velden.naam.trim() } });
      const v = result?.velden;
      if (v) {
        const voorstel: Record<string, string> = {};
        const kandidaten = ["website", "regio", "bekende_klanten", "bekende_projecttypes", "sterke_punten", "zwakke_punten", "where_we_encounter"] as const;
        for (const k of kandidaten) {
          if (v[k]) voorstel[k] = String(v[k]);
        }
        if (Object.keys(voorstel).length > 0) setAiVoorstel(voorstel);
      }
    } catch { /* silent */ }
    finally { setAiBezig(false); }
  }

  const leegVelden = { naam: "", website: "", regio: "", bekende_klanten: "", bekende_projecttypes: "", sterke_punten: "", zwakke_punten: "", where_we_encounter: "", opmerkingen: "" };
  const [velden, setVelden] = useState(leegVelden);

  async function handleAanmaken() {
    if (!velden.naam.trim()) { toast({ title: "Naam is verplicht", variant: "destructive" }); return; }
    try {
      await aanmaken.mutateAsync({ data: { naam: velden.naam, website: velden.website || undefined, regio: velden.regio || undefined, bekende_klanten: velden.bekende_klanten || undefined, bekende_projecttypes: velden.bekende_projecttypes || undefined, sterke_punten: velden.sterke_punten || undefined, zwakke_punten: velden.zwakke_punten || undefined, where_we_encounter: velden.where_we_encounter || undefined, opmerkingen: velden.opmerkingen || undefined } });
      await qc.invalidateQueries({ queryKey: getListCrmConcurrentenQueryKey() });
      setNieuwOpen(false);
      setVelden(leegVelden);
      toast({ title: "Concurrent aangemaakt" });
    } catch {
      toast({ title: "Fout bij aanmaken", variant: "destructive" });
    }
  }

  function openBewerken(c: CrmConcurrent) {
    setGeselecteerd(c);
    setVelden({ naam: c.naam, website: c.website ?? "", regio: c.regio ?? "", bekende_klanten: c.bekende_klanten ?? "", bekende_projecttypes: c.bekende_projecttypes ?? "", sterke_punten: c.sterke_punten ?? "", zwakke_punten: c.zwakke_punten ?? "", where_we_encounter: c.where_we_encounter ?? "", opmerkingen: c.opmerkingen ?? "" });
    setBewerkOpen(true);
  }

  async function handleBijwerken() {
    if (!geselecteerd) return;
    try {
      await bijwerken.mutateAsync({ id: geselecteerd.id, data: { naam: velden.naam, website: velden.website || undefined, regio: velden.regio || undefined, bekende_klanten: velden.bekende_klanten || undefined, bekende_projecttypes: velden.bekende_projecttypes || undefined, sterke_punten: velden.sterke_punten || undefined, zwakke_punten: velden.zwakke_punten || undefined, where_we_encounter: velden.where_we_encounter || undefined, opmerkingen: velden.opmerkingen || undefined } });
      await qc.invalidateQueries({ queryKey: getListCrmConcurrentenQueryKey() });
      setBewerkOpen(false);
      toast({ title: "Concurrent bijgewerkt" });
    } catch {
      toast({ title: "Fout bij bijwerken", variant: "destructive" });
    }
  }

  const aiVeldLabels: Record<string, string> = {
    website: "Website", regio: "Regio", bekende_klanten: "Bekende klanten",
    bekende_projecttypes: "Projecttypes", sterke_punten: "Sterk", zwakke_punten: "Zwak",
    where_we_encounter: "Tegengekomen",
  };

  const Formulier = () => (
    <div className="space-y-3">
      <div>
        <Label>Naam <span className="text-destructive">*</span></Label>
        <div className="flex gap-2 mt-1">
          <Input value={velden.naam} onChange={(e) => setVelden((v) => ({ ...v, naam: e.target.value }))} className="flex-1" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void aiConcurrentPrefill()}
            disabled={aiBezig || !velden.naam.trim()}
            className="shrink-0 gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
          >
            {aiBezig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            AI
          </Button>
        </div>
        {aiVoorstel && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 text-sm mt-2">
            <p className="font-medium text-amber-800 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> AI-concurrentprofiel</p>
            <div className="space-y-0.5 text-amber-900">
              {Object.entries(aiVoorstel).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-amber-600 min-w-28 shrink-0">{aiVeldLabels[k] ?? k}:</span>
                  <span className="break-words">{v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-100" onClick={() => {
                setVelden((prev) => ({ ...prev, ...aiVoorstel }));
                setAiVoorstel(null);
              }}>Overnemen</Button>
              <Button size="sm" variant="ghost" className="text-amber-700" onClick={() => setAiVoorstel(null)}>Negeren</Button>
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Website</Label>
          <Input value={velden.website} onChange={(e) => setVelden((v) => ({ ...v, website: e.target.value }))} className="mt-1" placeholder="https://..." />
        </div>
        <div>
          <Label>Regio</Label>
          <Input value={velden.regio} onChange={(e) => setVelden((v) => ({ ...v, regio: e.target.value }))} className="mt-1" />
        </div>
      </div>
      <div>
        <Label>Bekende klanten</Label>
        <Input value={velden.bekende_klanten} onChange={(e) => setVelden((v) => ({ ...v, bekende_klanten: e.target.value }))} className="mt-1" placeholder="Bijv. Ymere, Rochdale..." />
      </div>
      <div>
        <Label>Bekende projecttypes</Label>
        <Input value={velden.bekende_projecttypes} onChange={(e) => setVelden((v) => ({ ...v, bekende_projecttypes: e.target.value }))} className="mt-1" placeholder="Bijv. branddeuren, doorvoeringen..." />
      </div>
      <div>
        <Label>Sterke punten</Label>
        <Textarea value={velden.sterke_punten} onChange={(e) => setVelden((v) => ({ ...v, sterke_punten: e.target.value }))} className="mt-1" rows={2} />
      </div>
      <div>
        <Label>Zwakke punten</Label>
        <Textarea value={velden.zwakke_punten} onChange={(e) => setVelden((v) => ({ ...v, zwakke_punten: e.target.value }))} className="mt-1" rows={2} />
      </div>
      <div>
        <Label>Waar we ze tegenkomen</Label>
        <Input value={velden.where_we_encounter} onChange={(e) => setVelden((v) => ({ ...v, where_we_encounter: e.target.value }))} className="mt-1" />
      </div>
      <div>
        <Label>Opmerkingen</Label>
        <Textarea value={velden.opmerkingen} onChange={(e) => setVelden((v) => ({ ...v, opmerkingen: e.target.value }))} className="mt-1" rows={2} />
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/crm">
          <Button variant="ghost" size="sm" className="gap-1 pl-1"><ArrowLeft className="w-4 h-4" /> CRM</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Concurrenten</h1>
          <p className="text-xs text-muted-foreground">{concurrenten.length} concurrenten getraceerd</p>
        </div>
        <Button onClick={() => { setVelden(leegVelden); setNieuwOpen(true); }} size="sm" className="gap-1">
          <Plus className="w-4 h-4" /> Concurrent toevoegen
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : concurrenten.length === 0 ? (
        <div className="text-center py-16">
          <Handshake className="w-10 h-10 mx-auto text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm text-muted-foreground">Nog geen concurrenten geregistreerd.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(concurrenten as CrmConcurrent[]).map((c) => (
            <Card key={c.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{c.naam}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {c.regio && <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{c.regio}</span>}
                      {c.website && <a href={c.website} target="_blank" rel="noopener noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline"><Globe className="w-3 h-3" />Website</a>}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => openBewerken(c)}>
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {c.bekende_klanten && (
                  <div><p className="text-xs text-muted-foreground font-medium">Bekende klanten</p><p className="text-xs mt-0.5">{c.bekende_klanten}</p></div>
                )}
                {c.bekende_projecttypes && (
                  <div><p className="text-xs text-muted-foreground font-medium">Projecttypes</p><p className="text-xs mt-0.5">{c.bekende_projecttypes}</p></div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  {c.sterke_punten && (
                    <div>
                      <p className="text-xs font-medium flex items-center gap-1 text-emerald-700"><ThumbsUp className="w-3 h-3" /> Sterk</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.sterke_punten}</p>
                    </div>
                  )}
                  {c.zwakke_punten && (
                    <div>
                      <p className="text-xs font-medium flex items-center gap-1 text-red-600"><ThumbsDown className="w-3 h-3" /> Zwak</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.zwakke_punten}</p>
                    </div>
                  )}
                </div>

                {c.where_we_encounter && (
                  <div><p className="text-xs text-muted-foreground font-medium">Waar tegengekomen</p><p className="text-xs mt-0.5">{c.where_we_encounter}</p></div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={nieuwOpen} onOpenChange={setNieuwOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Concurrent toevoegen</DialogTitle></DialogHeader>
          <Formulier />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNieuwOpen(false)}>Annuleren</Button>
            <Button onClick={handleAanmaken} disabled={aanmaken.isPending}>{aanmaken.isPending ? "Bezig..." : "Aanmaken"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bewerkOpen} onOpenChange={setBewerkOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Concurrent bewerken</DialogTitle></DialogHeader>
          <Formulier />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBewerkOpen(false)}>Annuleren</Button>
            <Button onClick={handleBijwerken} disabled={bijwerken.isPending}>{bijwerken.isPending ? "Bezig..." : "Opslaan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
