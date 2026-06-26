import { useState } from "react";
import {
  useListCrmProjectkansen,
  useListCrmKlanten,
  useCreateCrmProjectkans,
  useUpdateCrmProjectkans,
  getListCrmProjectkansenQueryKey,
} from "@workspace/api-client-react";
import type { CrmProjectkans, CrmOrganisatie } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Target, Plus, ArrowLeft, TrendingUp, Calendar, User } from "lucide-react";

const FASEN = [
  { value: "signaal", label: "Signaal", kleur: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "eerste_contact", label: "Eerste contact", kleur: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "afspraak", label: "Afspraak", kleur: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "calculatie", label: "Calculatie", kleur: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "offerte", label: "Offerte", kleur: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "onderhandeling", label: "Onderhandeling", kleur: "bg-red-100 text-red-700 border-red-200" },
  { value: "gewonnen", label: "Gewonnen", kleur: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "verloren", label: "Verloren", kleur: "bg-gray-100 text-gray-500 border-gray-200" },
];

const KANS_TYPES = [
  { value: "opname", label: "Opname" },
  { value: "calculatie", label: "Calculatie" },
  { value: "offerte", label: "Offerte" },
  { value: "onderhoudscontract", label: "Onderhoudscontract" },
  { value: "brandpreventie", label: "Brandpreventie" },
  { value: "bouwkundig_herstel", label: "Bouwkundig herstel" },
  { value: "rga", label: "RGA" },
  { value: "droge_blusleiding", label: "Droge blusleiding" },
];

function euro(v: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
}

export default function ProjectkansenPagina() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [faseFilter, setFaseFilter] = useState<string>("actief");
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [geselecteerd, setGeselecteerd] = useState<CrmProjectkans | null>(null);

  const { data: kansen = [], isLoading } = useListCrmProjectkansen(faseFilter && faseFilter !== "alle" && faseFilter !== "actief" ? { fase: faseFilter } : {});
  const { data: orgs = [] } = useListCrmKlanten();
  const aanmaken = useCreateCrmProjectkans();
  const bijwerken = useUpdateCrmProjectkans();

  const orgMap = new Map((orgs as CrmOrganisatie[]).map((o) => [o.id, o.naam]));

  const openKansen = ["signaal", "eerste_contact", "afspraak", "calculatie", "offerte", "onderhandeling"];
  const gefilterd = faseFilter === "actief"
    ? kansen.filter((k) => openKansen.includes(k.fase ?? ""))
    : faseFilter === "alle" ? kansen : kansen.filter((k) => k.fase === faseFilter);

  const totaalGewogen = gefilterd.reduce((s, k) => s + (k.waarde ?? 0) * ((k.kans ?? 50) / 100), 0);

  const [velden, setVelden] = useState({ klant_id: "", titel: "", kans_type: "offerte", fase: "signaal", waarde: "", kans: "50", verwachte_datum: "", concurrenten_betrokken: "", volgende_actie: "", opmerkingen: "" });

  async function handleAanmaken() {
    if (!velden.klant_id || !velden.titel) { toast({ title: "Organisatie en titel zijn verplicht", variant: "destructive" }); return; }
    try {
      await aanmaken.mutateAsync({ data: { klant_id: parseInt(velden.klant_id), titel: velden.titel, kans_type: velden.kans_type, fase: velden.fase, waarde: velden.waarde ? parseFloat(velden.waarde) : undefined, kans: velden.kans ? parseInt(velden.kans) : 50, verwachte_datum: velden.verwachte_datum || undefined, concurrenten_betrokken: velden.concurrenten_betrokken || undefined, volgende_actie: velden.volgende_actie || undefined, opmerkingen: velden.opmerkingen || undefined } });
      await qc.invalidateQueries({ queryKey: getListCrmProjectkansenQueryKey() });
      setNieuwOpen(false);
      setVelden({ klant_id: "", titel: "", kans_type: "offerte", fase: "signaal", waarde: "", kans: "50", verwachte_datum: "", concurrenten_betrokken: "", volgende_actie: "", opmerkingen: "" });
      toast({ title: "Projectkans aangemaakt" });
    } catch {
      toast({ title: "Fout bij aanmaken", variant: "destructive" });
    }
  }

  async function handleFaseWijziging(kans: CrmProjectkans, nieuweFase: string) {
    try {
      await bijwerken.mutateAsync({ id: kans.id, data: { klant_id: kans.klant_id!, titel: kans.titel, fase: nieuweFase } });
      await qc.invalidateQueries({ queryKey: getListCrmProjectkansenQueryKey() });
      toast({ title: "Fase bijgewerkt" });
    } catch {
      toast({ title: "Fout bij bijwerken", variant: "destructive" });
    }
  }

  const faseKleur = (fase: string) => FASEN.find((f) => f.value === fase)?.kleur ?? "";
  const faseLabel = (fase: string) => FASEN.find((f) => f.value === fase)?.label ?? fase;

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/crm">
          <Button variant="ghost" size="sm" className="gap-1 pl-1">
            <ArrowLeft className="w-4 h-4" /> CRM
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Projectkansen</h1>
          <p className="text-xs text-muted-foreground">{gefilterd.length} kansen &bull; Gewogen pijplijn: {euro(totaalGewogen)}</p>
        </div>
        <Button onClick={() => setNieuwOpen(true)} size="sm" className="gap-1">
          <Plus className="w-4 h-4" /> Projectkans toevoegen
        </Button>
      </div>

      {/* Fase filters */}
      <div className="flex gap-2 flex-wrap">
        {[{ value: "actief", label: "Actief" }, { value: "alle", label: "Alles" }, ...FASEN].map((f) => (
          <Button key={f.value} variant={faseFilter === f.value ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setFaseFilter(f.value)}>
            {f.label}
          </Button>
        ))}
      </div>

      {/* Kansen tabel */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : gefilterd.length === 0 ? (
        <div className="text-center py-16">
          <Target className="w-10 h-10 mx-auto text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm text-muted-foreground">Geen projectkansen gevonden.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {gefilterd.map((kans) => (
            <Card key={kans.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{kans.titel}</span>
                      <Badge variant="outline" className={`text-xs border ${faseKleur(kans.fase ?? "")}`}>
                        {faseLabel(kans.fase ?? "")}
                      </Badge>
                      {kans.kans_type && (
                        <span className="text-xs text-muted-foreground">{KANS_TYPES.find((t) => t.value === kans.kans_type)?.label ?? kans.kans_type}</span>
                      )}
                    </div>
                    {kans.organisatie_naam && (
                      <Link href={`/crm/${kans.klant_id}`}>
                        <p className="text-xs text-muted-foreground mt-0.5 hover:text-primary cursor-pointer">{kans.organisatie_naam}</p>
                      </Link>
                    )}
                    <div className="flex items-center gap-4 mt-2 flex-wrap">
                      {kans.waarde && (
                        <span className="text-xs flex items-center gap-1 text-muted-foreground">
                          <TrendingUp className="w-3 h-3" /> {euro(kans.waarde)} ({kans.kans ?? 50}% kans)
                        </span>
                      )}
                      {kans.verwachte_datum && (
                        <span className="text-xs flex items-center gap-1 text-muted-foreground">
                          <Calendar className="w-3 h-3" /> {kans.verwachte_datum}
                        </span>
                      )}
                      {kans.volgende_actie && (
                        <span className="text-xs text-amber-600 font-medium">{kans.volgende_actie}</span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0">
                    <Select value={kans.fase ?? "signaal"} onValueChange={(val) => handleFaseWijziging(kans, val)}>
                      <SelectTrigger className="h-8 text-xs w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FASEN.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Nieuw dialog */}
      <Dialog open={nieuwOpen} onOpenChange={setNieuwOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Projectkans toevoegen</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Organisatie <span className="text-destructive">*</span></Label>
              <Select value={velden.klant_id} onValueChange={(val) => setVelden((v) => ({ ...v, klant_id: val }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecteer organisatie..." /></SelectTrigger>
                <SelectContent>
                  {(orgs as CrmOrganisatie[]).map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Titel <span className="text-destructive">*</span></Label>
              <Input value={velden.titel} onChange={(e) => setVelden((v) => ({ ...v, titel: e.target.value }))} className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={velden.kans_type} onValueChange={(val) => setVelden((v) => ({ ...v, kans_type: val }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{KANS_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fase</Label>
                <Select value={velden.fase} onValueChange={(val) => setVelden((v) => ({ ...v, fase: val }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{FASEN.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Waarde (EUR)</Label>
                <Input value={velden.waarde} onChange={(e) => setVelden((v) => ({ ...v, waarde: e.target.value }))} className="mt-1" type="number" />
              </div>
              <div>
                <Label>Kans (%)</Label>
                <Input value={velden.kans} onChange={(e) => setVelden((v) => ({ ...v, kans: e.target.value }))} className="mt-1" type="number" min="0" max="100" />
              </div>
            </div>
            <div>
              <Label>Verwachte datum</Label>
              <DatePicker value={velden.verwachte_datum} onChange={(v) => setVelden((vv) => ({ ...vv, verwachte_datum: v }))} className="mt-1" />
            </div>
            <div>
              <Label>Concurrenten betrokken</Label>
              <Input value={velden.concurrenten_betrokken} onChange={(e) => setVelden((v) => ({ ...v, concurrenten_betrokken: e.target.value }))} className="mt-1" placeholder="Namen van concurrenten..." />
            </div>
            <div>
              <Label>Volgende actie</Label>
              <Input value={velden.volgende_actie} onChange={(e) => setVelden((v) => ({ ...v, volgende_actie: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Opmerkingen</Label>
              <Textarea value={velden.opmerkingen} onChange={(e) => setVelden((v) => ({ ...v, opmerkingen: e.target.value }))} className="mt-1" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNieuwOpen(false)}>Annuleren</Button>
            <Button onClick={handleAanmaken} disabled={aanmaken.isPending}>{aanmaken.isPending ? "Bezig..." : "Aanmaken"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
