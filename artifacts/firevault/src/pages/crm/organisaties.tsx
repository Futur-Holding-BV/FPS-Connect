import { useState } from "react";
import { Link } from "wouter";
import {
  useListCrmKlanten,
  useCreateCrmKlant,
  getListCrmKlantenQueryKey,
} from "@workspace/api-client-react";
import type { CrmOrganisatie } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
import { Building2, Plus, Search, Phone, Mail, MapPin, ChevronRight, ArrowLeft } from "lucide-react";

const ORG_TYPES = [
  { value: "woningcorporatie", label: "Woningcorporatie" },
  { value: "vve_beheerder", label: "VvE Beheerder" },
  { value: "aannemer", label: "Aannemer" },
  { value: "installateur", label: "Installateur" },
  { value: "vastgoedbeheerder", label: "Vastgoedbeheerder" },
  { value: "adviseur", label: "Adviseur" },
  { value: "gemeente", label: "Gemeente" },
  { value: "zorginstelling", label: "Zorginstelling" },
  { value: "onderwijsinstelling", label: "Onderwijsinstelling" },
  { value: "overig", label: "Overig" },
];

const RELATIE_STATUSSEN = [
  { value: "onbekend", label: "Onbekend" },
  { value: "koud", label: "Koud" },
  { value: "warm", label: "Warm" },
  { value: "actief", label: "Actief" },
  { value: "key_account", label: "Key Account" },
  { value: "verloren", label: "Verloren" },
];

const STATUS_KLEUR: Record<string, string> = {
  prospect: "bg-amber-100 text-amber-800 border-amber-200",
  actief: "bg-emerald-100 text-emerald-800 border-emerald-200",
  inactief: "bg-gray-100 text-gray-600 border-gray-200",
};

const RELATIE_KLEUR: Record<string, string> = {
  key_account: "bg-primary/10 text-primary border-primary/20",
  warm: "bg-orange-100 text-orange-700 border-orange-200",
  actief: "bg-emerald-100 text-emerald-700 border-emerald-200",
  koud: "bg-blue-100 text-blue-700 border-blue-200",
  verloren: "bg-gray-100 text-gray-500 border-gray-200",
  onbekend: "bg-muted text-muted-foreground border-border",
};

export default function OrganisatiesPagina() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [zoek, setZoek] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("alle");
  const [relatieFilter, setRelatieFilter] = useState<string>("alle");
  const [nieuwOpen, setNieuwOpen] = useState(false);

  const { data: orgs = [], isLoading } = useListCrmKlanten();
  const aanmaken = useCreateCrmKlant();

  const gefilterd = orgs.filter((o) => {
    const t = zoek.toLowerCase();
    const matchZoek = !zoek || o.naam.toLowerCase().includes(t) || (o.stad ?? "").toLowerCase().includes(t) || (o.branche ?? "").toLowerCase().includes(t);
    const matchType = typeFilter === "alle" || o.type === typeFilter;
    const matchRelatie = relatieFilter === "alle" || o.relatie_status === relatieFilter;
    return matchZoek && matchType && matchRelatie;
  });

  const [velden, setVelden] = useState({ naam: "", type: "overig", adres: "", postcode: "", stad: "", regio: "", telefoon: "", email: "", website: "", branche: "", status: "prospect", relatie_status: "onbekend", voorkeur_fps_bedrijf: "", opmerkingen: "" });

  async function handleAanmaken() {
    if (!velden.naam.trim()) { toast({ title: "Naam is verplicht", variant: "destructive" }); return; }
    try {
      await aanmaken.mutateAsync({ data: { naam: velden.naam, type: velden.type, adres: velden.adres || undefined, postcode: velden.postcode || undefined, stad: velden.stad || undefined, regio: velden.regio || undefined, telefoon: velden.telefoon || undefined, email: velden.email || undefined, website: velden.website || undefined, branche: velden.branche || undefined, status: velden.status, relatie_status: velden.relatie_status, voorkeur_fps_bedrijf: velden.voorkeur_fps_bedrijf || undefined, opmerkingen: velden.opmerkingen || undefined } });
      await qc.invalidateQueries({ queryKey: getListCrmKlantenQueryKey() });
      setNieuwOpen(false);
      setVelden({ naam: "", type: "overig", adres: "", postcode: "", stad: "", regio: "", telefoon: "", email: "", website: "", branche: "", status: "prospect", relatie_status: "onbekend", voorkeur_fps_bedrijf: "", opmerkingen: "" });
      toast({ title: "Organisatie aangemaakt" });
    } catch {
      toast({ title: "Fout bij aanmaken", variant: "destructive" });
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/crm">
          <Button variant="ghost" size="sm" className="gap-1 pl-1">
            <ArrowLeft className="w-4 h-4" /> CRM
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Organisaties</h1>
          <p className="text-xs text-muted-foreground">{gefilterd.length} van {orgs.length} organisaties</p>
        </div>
        <Button onClick={() => setNieuwOpen(true)} size="sm" className="gap-1">
          <Plus className="w-4 h-4" /> Organisatie toevoegen
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Zoek op naam, stad of branche..." className="pl-9 h-9 text-sm" value={zoek} onChange={(e) => setZoek(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Alle types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle types</SelectItem>
            {ORG_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={relatieFilter} onValueChange={setRelatieFilter}>
          <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Relatie status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle statussen</SelectItem>
            {RELATIE_STATUSSEN.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Lijst */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : gefilterd.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="w-10 h-10 mx-auto text-muted-foreground opacity-40 mb-3" />
          <p className="text-sm text-muted-foreground">{zoek || typeFilter !== "alle" || relatieFilter !== "alle" ? "Geen resultaten voor deze filters." : "Nog geen organisaties geregistreerd."}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {gefilterd.map((org) => (
            <Link key={org.id} href={`/crm/${org.id}`}>
              <Card className="cursor-pointer hover:shadow-sm hover:border-primary/30 transition-all">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{org.naam}</span>
                      {org.relatie_status && org.relatie_status !== "onbekend" && (
                        <Badge variant="outline" className={`text-xs border ${RELATIE_KLEUR[org.relatie_status] ?? ""}`}>
                          {RELATIE_STATUSSEN.find((s) => s.value === org.relatie_status)?.label ?? org.relatie_status}
                        </Badge>
                      )}
                      {org.type && org.type !== "overig" && (
                        <span className="text-xs text-muted-foreground">{ORG_TYPES.find((t) => t.value === org.type)?.label ?? org.type}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {(org.stad || org.regio) && <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{[org.stad, org.regio].filter(Boolean).join(", ")}</span>}
                      {org.telefoon && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{org.telefoon}</span>}
                      {org.email && <span className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{org.email}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className={`text-xs border ${STATUS_KLEUR[org.status] ?? ""}`}>
                      {org.status}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Nieuw dialog */}
      <Dialog open={nieuwOpen} onOpenChange={setNieuwOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Organisatie toevoegen</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Naam <span className="text-destructive">*</span></Label>
              <Input value={velden.naam} onChange={(e) => setVelden((v) => ({ ...v, naam: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={velden.type} onValueChange={(val) => setVelden((v) => ({ ...v, type: val }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{ORG_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Relatie status</Label>
              <Select value={velden.relatie_status} onValueChange={(val) => setVelden((v) => ({ ...v, relatie_status: val }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{RELATIE_STATUSSEN.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Adres</Label>
              <Input value={velden.adres} onChange={(e) => setVelden((v) => ({ ...v, adres: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Postcode</Label>
              <Input value={velden.postcode} onChange={(e) => setVelden((v) => ({ ...v, postcode: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Stad</Label>
              <Input value={velden.stad} onChange={(e) => setVelden((v) => ({ ...v, stad: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Regio</Label>
              <Input value={velden.regio} onChange={(e) => setVelden((v) => ({ ...v, regio: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Telefoon</Label>
              <Input value={velden.telefoon} onChange={(e) => setVelden((v) => ({ ...v, telefoon: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input value={velden.email} onChange={(e) => setVelden((v) => ({ ...v, email: e.target.value }))} className="mt-1" type="email" />
            </div>
            <div>
              <Label>Website</Label>
              <Input value={velden.website} onChange={(e) => setVelden((v) => ({ ...v, website: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Branche</Label>
              <Input value={velden.branche} onChange={(e) => setVelden((v) => ({ ...v, branche: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Voorkeur FPS bedrijf</Label>
              <Select value={velden.voorkeur_fps_bedrijf} onValueChange={(val) => setVelden((v) => ({ ...v, voorkeur_fps_bedrijf: val }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Selecteer..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Geen voorkeur</SelectItem>
                  <SelectItem value="FPS Brandpreventie">FPS Brandpreventie</SelectItem>
                  <SelectItem value="FPS Bouw">FPS Bouw</SelectItem>
                  <SelectItem value="FPS Onderhoud">FPS Onderhoud</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
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
