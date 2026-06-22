import { useState } from "react";
import {
  useListCrmMarktintelligentie,
  useListCrmKlanten,
  useListCrmConcurrenten,
  useCreateCrmMarktintelligentie,
  getListCrmMarktintelligentieQueryKey,
} from "@workspace/api-client-react";
import type { CrmMarktintelligentie, CrmOrganisatie, CrmConcurrent } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Newspaper, Plus, ArrowLeft, Calendar, Globe, Building2, Handshake } from "lucide-react";

const TYPES = [
  { value: "nieuws", label: "Nieuws", kleur: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "aanbesteding", label: "Aanbesteding", kleur: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "concurrentie", label: "Concurrentie", kleur: "bg-red-100 text-red-700 border-red-200" },
  { value: "kans", label: "Kans", kleur: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "risico", label: "Risico", kleur: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "overig", label: "Overig", kleur: "bg-muted text-muted-foreground border-border" },
];

export default function MarktintelligentiePagina() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [typeFilter, setTypeFilter] = useState<string>("alle");
  const [nieuwOpen, setNieuwOpen] = useState(false);

  const { data: items = [], isLoading } = useListCrmMarktintelligentie();
  const { data: orgs = [] } = useListCrmKlanten();
  const { data: concurrenten = [] } = useListCrmConcurrenten();
  const aanmaken = useCreateCrmMarktintelligentie();

  const gefilterd = typeFilter === "alle" ? (items as CrmMarktintelligentie[]) : (items as CrmMarktintelligentie[]).filter((i) => i.type === typeFilter);
  const orgMap = new Map((orgs as CrmOrganisatie[]).map((o) => [o.id, o.naam]));
  const concMap = new Map((concurrenten as CrmConcurrent[]).map((c) => [c.id, c.naam]));

  const typeInfo = (type: string) => TYPES.find((t) => t.value === type) ?? TYPES[TYPES.length - 1];

  const [velden, setVelden] = useState({ type: "nieuws", organisatie_id: "", concurrent_id: "", titel: "", inhoud: "", bron: "", regio: "", datum: new Date().toISOString().slice(0, 10) });

  async function handleAanmaken() {
    if (!velden.titel.trim()) { toast({ title: "Titel is verplicht", variant: "destructive" }); return; }
    try {
      await aanmaken.mutateAsync({ data: { type: velden.type, organisatie_id: velden.organisatie_id ? parseInt(velden.organisatie_id) : undefined, concurrent_id: velden.concurrent_id ? parseInt(velden.concurrent_id) : undefined, titel: velden.titel, inhoud: velden.inhoud || undefined, bron: velden.bron || undefined, regio: velden.regio || undefined, datum: velden.datum || undefined } });
      await qc.invalidateQueries({ queryKey: getListCrmMarktintelligentieQueryKey() });
      setNieuwOpen(false);
      setVelden({ type: "nieuws", organisatie_id: "", concurrent_id: "", titel: "", inhoud: "", bron: "", regio: "", datum: new Date().toISOString().slice(0, 10) });
      toast({ title: "Marktinformatie toegevoegd" });
    } catch {
      toast({ title: "Fout bij aanmaken", variant: "destructive" });
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/crm">
          <Button variant="ghost" size="sm" className="gap-1 pl-1"><ArrowLeft className="w-4 h-4" /> CRM</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Marktinzicht</h1>
          <p className="text-xs text-muted-foreground">{gefilterd.length} signalen & berichten</p>
        </div>
        <Button onClick={() => setNieuwOpen(true)} size="sm" className="gap-1">
          <Plus className="w-4 h-4" /> Toevoegen
        </Button>
      </div>

      {/* Type filters */}
      <div className="flex gap-2 flex-wrap">
        <Button variant={typeFilter === "alle" ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setTypeFilter("alle")}>Alles</Button>
        {TYPES.map((t) => (
          <Button key={t.value} variant={typeFilter === t.value ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setTypeFilter(t.value)}>{t.label}</Button>
        ))}
      </div>

      {/* Items */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : gefilterd.length === 0 ? (
        <div className="text-center py-16">
          <Newspaper className="w-10 h-10 mx-auto text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm text-muted-foreground">Geen marktinformatie beschikbaar.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {gefilterd.map((item) => {
            const tInfo = typeInfo(item.type);
            const orgNaam = item.organisatie_id ? orgMap.get(item.organisatie_id) : null;
            const concNaam = item.concurrent_id ? concMap.get(item.concurrent_id) : null;
            return (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className={`text-xs border shrink-0 mt-0.5 ${tInfo.kleur}`}>{tInfo.label}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{item.titel}</p>
                      {item.inhoud && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.inhoud}</p>}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {orgNaam && <span className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="w-3 h-3" />{orgNaam}</span>}
                        {concNaam && <span className="text-xs text-muted-foreground flex items-center gap-1"><Handshake className="w-3 h-3" />{concNaam}</span>}
                        {item.regio && <span className="text-xs text-muted-foreground">{item.regio}</span>}
                        {item.bron && <span className="text-xs text-muted-foreground flex items-center gap-1"><Globe className="w-3 h-3" />{item.bron}</span>}
                        {item.datum && <span className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />{item.datum}</span>}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={nieuwOpen} onOpenChange={setNieuwOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Marktinformatie toevoegen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Type</Label>
              <Select value={velden.type} onValueChange={(val) => setVelden((v) => ({ ...v, type: val }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Titel <span className="text-destructive">*</span></Label>
              <Input value={velden.titel} onChange={(e) => setVelden((v) => ({ ...v, titel: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Inhoud</Label>
              <Textarea value={velden.inhoud} onChange={(e) => setVelden((v) => ({ ...v, inhoud: e.target.value }))} className="mt-1" rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Gerelateerde organisatie</Label>
                <Select value={velden.organisatie_id} onValueChange={(val) => setVelden((v) => ({ ...v, organisatie_id: val }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Geen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Geen</SelectItem>
                    {(orgs as CrmOrganisatie[]).map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Gerelateerde concurrent</Label>
                <Select value={velden.concurrent_id} onValueChange={(val) => setVelden((v) => ({ ...v, concurrent_id: val }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Geen" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Geen</SelectItem>
                    {(concurrenten as CrmConcurrent[]).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Bron</Label>
                <Input value={velden.bron} onChange={(e) => setVelden((v) => ({ ...v, bron: e.target.value }))} className="mt-1" placeholder="Bijv. LinkedIn, TenderNed..." />
              </div>
              <div>
                <Label>Regio</Label>
                <Input value={velden.regio} onChange={(e) => setVelden((v) => ({ ...v, regio: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label>Datum</Label>
              <Input value={velden.datum} onChange={(e) => setVelden((v) => ({ ...v, datum: e.target.value }))} className="mt-1" type="date" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNieuwOpen(false)}>Annuleren</Button>
            <Button onClick={handleAanmaken} disabled={aanmaken.isPending}>{aanmaken.isPending ? "Bezig..." : "Toevoegen"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
