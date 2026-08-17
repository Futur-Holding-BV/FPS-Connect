import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, Save, Plus, Trash2, AlertTriangle, Clock,
  Euro, Package, FileText, User, Settings, ClipboardList,
} from "lucide-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tarief {
  id: number;
  functiegroep: string;
  tariefsoort?: string;
  uurtarief: number;
}

interface Voorwaarden {
  id: number;
  opdrachtId: number;
  contactpersoonOpdrachtgever: string | null;
  akkoordgeverOpdrachtgever: string | null;
  projectleiderFps: string | null;
  materiaalopslag: number;
  materieelopslag: number;
  transportkosten: number;
  voorrijkosten: number;
  toeslagAvond: number;
  toeslagWeekend: number;
  toeslagSpoed: number;
  betaaltermijn: number;
  facturatiefrequentie: string;
  handtekeningVereist: boolean;
  weekstaatVereist: boolean;
  fotosVereist: boolean;
  bewijsvereisten: string | null;
  notities: string | null;
  tarieven: Tarief[];
}

interface Begroting {
  id: number;
  verwachtUren: number | null;
  verwachtMateriaal: number | null;
  verwachtMaterieel: number | null;
  verwachtDoorlooptijdDagen: number | null;
  maximaalBudget: number | null;
  meldgrensOpdrachtgever: number | null;
  aiSignaleringActief: boolean;
}

interface UrenRegel {
  id: number;
  datum: string;
  medewerkerNaam: string | null;
  werkzaamheden: string | null;
  beginTijd: string;
  eindTijd: string;
  nettoUren: number;
  tariefgroep: string | null;
  reisUren: number | null;
  wachtTijd: number | null;
  akkoordVereist: boolean;
  akkoordGegeven: boolean | null;
  akkoordDoorNaam: string | null;
  status: string;
  opmerkingen: string | null;
}

interface Materiaalregel {
  id: number;
  datum: string;
  artikel: string;
  omschrijving: string | null;
  hoeveelheid: number;
  eenheid: string;
  inkoopprijs: number | null;
  verkoopprijs: number | null;
  bron: string;
  leverancier: string | null;
  bonnummer: string | null;
  status: string;
  opmerking: string | null;
}

const FUNCTIEGROEPEN = ["monteur", "timmerman", "voorman", "projectleider", "werkvoorbereider", "onderaannemer"];
const BRONNEN = ["magazijn", "busvoorraad", "projectinkoop", "losse_bon", "leverancier", "onderaannemer"];

function euroFormat(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

function urenFormat(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} uur`;
}

// ── Sub: Voorwaarden-tab ──────────────────────────────────────────────────────

export function VoorwaardenTab({ opdrachtId, kanSchrijven }: { opdrachtId: number; kanSchrijven: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [tarieven, setTarieven] = useState<{ functiegroep: string; tariefsoort: string; uurtarief: string }[]>([]);
  const [form, setForm] = useState<Partial<Omit<Voorwaarden, "id" | "opdrachtId" | "tarieven">>>({});
  const [initieel, setInitieel] = useState(true);

  const { data: vw, isLoading } = useQuery<Voorwaarden>({
    queryKey: ["regie-voorwaarden", opdrachtId],
    queryFn: async () => {
      const r = await fetch(`/api/regie/voorwaarden/${opdrachtId}`);
      if (r.status === 404) return null as unknown as Voorwaarden;
      if (!r.ok) throw new Error("Kan voorwaarden niet laden.");
      return r.json();
    },
    // Vul form in zodra data beschikbaar is
  });

  // Vul form bij laden
  if (vw && initieel) {
    setForm({
      contactpersoonOpdrachtgever: vw.contactpersoonOpdrachtgever ?? "",
      akkoordgeverOpdrachtgever: vw.akkoordgeverOpdrachtgever ?? "",
      projectleiderFps: vw.projectleiderFps ?? "",
      materiaalopslag: vw.materiaalopslag,
      materieelopslag: vw.materieelopslag,
      transportkosten: vw.transportkosten,
      voorrijkosten: vw.voorrijkosten,
      toeslagAvond: vw.toeslagAvond,
      toeslagWeekend: vw.toeslagWeekend,
      toeslagSpoed: vw.toeslagSpoed,
      betaaltermijn: vw.betaaltermijn,
      facturatiefrequentie: vw.facturatiefrequentie,
      handtekeningVereist: vw.handtekeningVereist,
      weekstaatVereist: vw.weekstaatVereist,
      fotosVereist: vw.fotosVereist,
      bewijsvereisten: vw.bewijsvereisten ?? "",
      notities: vw.notities ?? "",
    });
    setTarieven(vw.tarieven.map(t => ({ functiegroep: t.functiegroep, tariefsoort: t.tariefsoort === "dagdeel" ? "dagdeel" : "uur", uurtarief: String(t.uurtarief) })));
    setInitieel(false);
  }

  const opslaan = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/regie/voorwaarden/${opdrachtId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tarieven: tarieven
            .filter(t => t.functiegroep && t.uurtarief)
            .map(t => ({ functiegroep: t.functiegroep, tariefsoort: t.tariefsoort, uurtarief: parseFloat(t.uurtarief) })),
        }),
      });
      if (!r.ok) throw new Error("Opslaan mislukt.");
      return r.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["regie-voorwaarden", opdrachtId] });
      toast({ title: "Regievoorwaarden opgeslagen." });
      setInitieel(true);
    },
    onError: () => toast({ title: "Opslaan mislukt.", variant: "destructive" }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Laden...</p>;

  const set = (key: keyof typeof form, val: unknown) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="space-y-6">
      {/* Contactpersonen */}
      <div>
        <h3 className="font-medium mb-3 flex items-center gap-2"><User className="h-4 w-4" /> Partijen</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Contactpersoon opdrachtgever</Label>
            <Input value={(form.contactpersoonOpdrachtgever ?? "") as string} disabled={!kanSchrijven}
              onChange={e => set("contactpersoonOpdrachtgever", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Akkoordgever opdrachtgever</Label>
            <Input value={(form.akkoordgeverOpdrachtgever ?? "") as string} disabled={!kanSchrijven}
              onChange={e => set("akkoordgeverOpdrachtgever", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Projectleider FPS</Label>
            <Input value={(form.projectleiderFps ?? "") as string} disabled={!kanSchrijven}
              onChange={e => set("projectleiderFps", e.target.value)} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Uurtarieven */}
      <div>
        <h3 className="font-medium mb-3 flex items-center gap-2"><Euro className="h-4 w-4" /> Tarieven per functiegroep</h3>
        <div className="space-y-2">
          {tarieven.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select value={t.functiegroep} disabled={!kanSchrijven}
                onValueChange={v => setTarieven(ts => ts.map((x, j) => j === i ? { ...x, functiegroep: v } : x))}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Functiegroep" />
                </SelectTrigger>
                <SelectContent>
                  {FUNCTIEGROEPEN.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={t.tariefsoort} disabled={!kanSchrijven}
                onValueChange={v => setTarieven(ts => ts.map((x, j) => j === i ? { ...x, tariefsoort: v } : x))}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Soort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uur">Per uur</SelectItem>
                  <SelectItem value="dagdeel">Per dagdeel</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-foreground">€</span>
                <Input type="number" min={0} step={0.01} className="w-28" value={t.uurtarief} disabled={!kanSchrijven}
                  onChange={e => setTarieven(ts => ts.map((x, j) => j === i ? { ...x, uurtarief: e.target.value } : x))} />
                <span className="text-sm text-muted-foreground">{t.tariefsoort === "dagdeel" ? "/dagdeel" : "/uur"}</span>
              </div>
              {kanSchrijven && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                  onClick={() => setTarieven(ts => ts.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
          {kanSchrijven && (
            <Button variant="outline" size="sm" onClick={() => setTarieven(ts => [...ts, { functiegroep: "monteur", tariefsoort: "uur", uurtarief: "" }])}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              Tarief toevoegen
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* Opslagen */}
      <div>
        <h3 className="font-medium mb-3 flex items-center gap-2"><Settings className="h-4 w-4" /> Opslagen & Kosten</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Materiaalopslag (%)", key: "materiaalopslag" as const },
            { label: "Materieelopslag (%)", key: "materieelopslag" as const },
            { label: "Transportkosten (€/rit)", key: "transportkosten" as const },
            { label: "Voorrijkosten (€)", key: "voorrijkosten" as const },
            { label: "Toeslag avond (%)", key: "toeslagAvond" as const },
            { label: "Toeslag weekend (%)", key: "toeslagWeekend" as const },
            { label: "Toeslag spoed (%)", key: "toeslagSpoed" as const },
          ].map(({ label, key }) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs">{label}</Label>
              <Input type="number" min={0} step={0.01} disabled={!kanSchrijven}
                value={form[key] ?? 0}
                onChange={e => set(key, parseFloat(e.target.value) || 0)} />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label className="text-xs">Betaaltermijn (dagen)</Label>
            <Input type="number" min={1} disabled={!kanSchrijven}
              value={form.betaaltermijn ?? 30}
              onChange={e => set("betaaltermijn", parseInt(e.target.value) || 30)} />
          </div>
        </div>
      </div>

      <Separator />

      {/* Betalingsafspraken */}
      <div>
        <h3 className="font-medium mb-3">Facturatie & Bewijsvereisten</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Facturatiefrequentie</Label>
            <Select value={form.facturatiefrequentie ?? "maandelijks"} disabled={!kanSchrijven}
              onValueChange={v => set("facturatiefrequentie", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="maandelijks">Maandelijks</SelectItem>
                <SelectItem value="tweewekelijks">Tweewekelijks</SelectItem>
                <SelectItem value="wekelijks">Wekelijks</SelectItem>
                <SelectItem value="projectafronding">Bij projectafronding</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            {[
              { label: "Handtekening vereist", key: "handtekeningVereist" as const },
              { label: "Weekstaat vereist", key: "weekstaatVereist" as const },
              { label: "Foto's vereist", key: "fotosVereist" as const },
            ].map(({ label, key }) => (
              <div key={key} className="flex items-center justify-between">
                <Label className="font-normal">{label}</Label>
                <Switch checked={!!(form[key])} disabled={!kanSchrijven}
                  onCheckedChange={v => set(key, v)} />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4 space-y-1.5">
          <Label>Bewijsvereisten (toelichting)</Label>
          <Textarea rows={2} disabled={!kanSchrijven}
            value={(form.bewijsvereisten ?? "") as string}
            onChange={e => set("bewijsvereisten", e.target.value)}
            placeholder="Beschrijf welke bewijsstukken aangeleverd moeten worden..." />
        </div>
        <div className="mt-3 space-y-1.5">
          <Label>Notities</Label>
          <Textarea rows={2} disabled={!kanSchrijven}
            value={(form.notities ?? "") as string}
            onChange={e => set("notities", e.target.value)} />
        </div>
      </div>

      {kanSchrijven && (
        <div className="flex justify-end">
          <Button onClick={() => opslaan.mutate()} disabled={opslaan.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {opslaan.isPending ? "Opslaan..." : "Opslaan"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Sub: Begroting-tab ────────────────────────────────────────────────────────

export function BegrotingTab({ opdrachtId, kanSchrijven }: { opdrachtId: number; kanSchrijven: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<Partial<Begroting>>({});
  const [initieel, setInitieel] = useState(true);

  const { data: begroting, isLoading } = useQuery<Begroting | null>({
    queryKey: ["regie-begroting", opdrachtId],
    queryFn: async () => {
      const r = await fetch(`/api/regie/begroting/${opdrachtId}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("Kan begroting niet laden.");
      return r.json();
    },
  });

  if (begroting && initieel) {
    setForm({
      verwachtUren: begroting.verwachtUren ?? undefined,
      verwachtMateriaal: begroting.verwachtMateriaal ?? undefined,
      verwachtMaterieel: begroting.verwachtMaterieel ?? undefined,
      verwachtDoorlooptijdDagen: begroting.verwachtDoorlooptijdDagen ?? undefined,
      maximaalBudget: begroting.maximaalBudget ?? undefined,
      meldgrensOpdrachtgever: begroting.meldgrensOpdrachtgever ?? undefined,
      aiSignaleringActief: begroting.aiSignaleringActief,
    });
    setInitieel(false);
  }

  const opslaan = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/regie/begroting/${opdrachtId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error("Opslaan mislukt.");
      return r.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["regie-begroting", opdrachtId] });
      void qc.invalidateQueries({ queryKey: ["regie-dashboard"] });
      toast({ title: "Begroting opgeslagen." });
      setInitieel(true);
    },
    onError: () => toast({ title: "Opslaan mislukt.", variant: "destructive" }),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Laden...</p>;

  const set = (key: keyof typeof form, val: unknown) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="space-y-6">
      <Alert className="border-blue-200 bg-blue-50">
        <AlertDescription className="text-blue-800 text-sm">
          Dit is een indicatief bewakingsbudget — geen vaste aanneemsom. Regiewerk wordt afgerekend op werkelijke kosten. AI signaleert wanneer drempelwaarden worden bereikt.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="font-medium flex items-center gap-2"><Clock className="h-4 w-4" /> Verwacht</h3>
          <div className="space-y-1.5">
            <Label>Verwacht aantal uren</Label>
            <Input type="number" min={0} step={0.5} disabled={!kanSchrijven}
              value={form.verwachtUren ?? ""}
              onChange={e => set("verwachtUren", e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="bijv. 120" />
          </div>
          <div className="space-y-1.5">
            <Label>Verwacht materiaal (€)</Label>
            <Input type="number" min={0} disabled={!kanSchrijven}
              value={form.verwachtMateriaal ?? ""}
              onChange={e => set("verwachtMateriaal", e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="bijv. 5000" />
          </div>
          <div className="space-y-1.5">
            <Label>Verwacht materieel (€)</Label>
            <Input type="number" min={0} disabled={!kanSchrijven}
              value={form.verwachtMaterieel ?? ""}
              onChange={e => set("verwachtMaterieel", e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="bijv. 2000" />
          </div>
          <div className="space-y-1.5">
            <Label>Verwachte doorlooptijd (werkdagen)</Label>
            <Input type="number" min={1} disabled={!kanSchrijven}
              value={form.verwachtDoorlooptijdDagen ?? ""}
              onChange={e => set("verwachtDoorlooptijdDagen", e.target.value ? parseInt(e.target.value) : undefined)}
              placeholder="bijv. 10" />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Budgetbewaking</h3>
          <div className="space-y-1.5">
            <Label>Maximaal voorlopig budget (€)</Label>
            <Input type="number" min={0} disabled={!kanSchrijven}
              value={form.maximaalBudget ?? ""}
              onChange={e => set("maximaalBudget", e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="bijv. 25000" />
            <p className="text-xs text-muted-foreground">AI signaleert bij 80% en 95%</p>
          </div>
          <div className="space-y-1.5">
            <Label>Meldgrens opdrachtgever (€)</Label>
            <Input type="number" min={0} disabled={!kanSchrijven}
              value={form.meldgrensOpdrachtgever ?? ""}
              onChange={e => set("meldgrensOpdrachtgever", e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="bijv. 20000" />
            <p className="text-xs text-muted-foreground">AI signaleert bij 90% en bij overschrijding</p>
          </div>
          <div className="flex items-center justify-between pt-2">
            <div>
              <Label className="font-medium">AI-signalering actief</Label>
              <p className="text-xs text-muted-foreground">Automatisch signaleren bij drempelwaarden</p>
            </div>
            <Switch checked={form.aiSignaleringActief ?? true} disabled={!kanSchrijven}
              onCheckedChange={v => set("aiSignaleringActief", v)} />
          </div>
        </div>
      </div>

      {kanSchrijven && (
        <div className="flex justify-end">
          <Button onClick={() => opslaan.mutate()} disabled={opslaan.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {opslaan.isPending ? "Opslaan..." : "Opslaan"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Sub: Uren-tab ─────────────────────────────────────────────────────────────

export function UrenTab({ opdrachtId }: { opdrachtId: number }) {
  const { data: uren = [], isLoading } = useQuery<UrenRegel[]>({
    queryKey: ["regie-uren", opdrachtId],
    queryFn: async () => {
      const r = await fetch(`/api/regie/uren?opdrachtId=${opdrachtId}`);
      if (!r.ok) throw new Error("Kan uren niet laden.");
      return r.json();
    },
  });

  const totaalUren = uren.reduce((s, u) => s + u.nettoUren + (u.reisUren ?? 0), 0);

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Laden...</p>;

  return (
    <div className="space-y-4">
      {/* Samenvatting */}
      <div className="flex items-center gap-4 p-4 bg-muted/40 rounded-lg">
        <div>
          <p className="text-sm text-muted-foreground">Totaal geboekte uren</p>
          <p className="text-2xl font-bold">{totaalUren.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} uur</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Aantal boekingen</p>
          <p className="text-2xl font-bold">{uren.length}</p>
        </div>
      </div>

      <Alert className="border-blue-200 bg-blue-50">
        <AlertDescription className="text-blue-800 text-sm">
          Uren worden geboekt via de werkdag-module of via de uren-registratie van de medewerker, gekoppeld aan dit regieproject.
        </AlertDescription>
      </Alert>

      {uren.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>Nog geen uren geboekt op dit project.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 pr-3">Datum</th>
                <th className="text-left py-2 pr-3">Medewerker</th>
                <th className="text-left py-2 pr-3">Werkzaamheden</th>
                <th className="text-left py-2 pr-3">Functiegroep</th>
                <th className="text-right py-2 pr-3">Werk</th>
                <th className="text-right py-2 pr-3">Reis</th>
                <th className="text-right py-2 pr-3">Wacht</th>
                <th className="text-left py-2">Akkoord</th>
              </tr>
            </thead>
            <tbody>
              {uren.map(u => (
                <tr key={u.id} className="border-b hover:bg-muted/20">
                  <td className="py-2 pr-3 whitespace-nowrap">{u.datum}</td>
                  <td className="py-2 pr-3">{u.medewerkerNaam ?? "—"}</td>
                  <td className="py-2 pr-3 max-w-48 truncate">{u.werkzaamheden ?? "—"}</td>
                  <td className="py-2 pr-3">{u.tariefgroep ?? "—"}</td>
                  <td className="py-2 pr-3 text-right">{u.nettoUren}u</td>
                  <td className="py-2 pr-3 text-right">{u.reisUren ? `${u.reisUren}u` : "—"}</td>
                  <td className="py-2 pr-3 text-right">{u.wachtTijd ? `${u.wachtTijd}u` : "—"}</td>
                  <td className="py-2">
                    {!u.akkoordVereist ? (
                      <span className="text-muted-foreground text-xs">n.v.t.</span>
                    ) : u.akkoordGegeven ? (
                      <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full">
                        {u.akkoordDoorNaam ?? "Ja"}
                      </span>
                    ) : (
                      <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">Vereist</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sub: Materiaal-tab ────────────────────────────────────────────────────────

export function MateriaalTab({ opdrachtId, kanSchrijven }: { opdrachtId: number; kanSchrijven: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [nieuwForm, setNieuwForm] = useState({
    datum: new Date().toISOString().slice(0, 10),
    artikel: "",
    omschrijving: "",
    hoeveelheid: "1",
    eenheid: "st",
    inkoopprijs: "",
    verkoopprijs: "",
    bron: "magazijn",
    leverancier: "",
    bonnummer: "",
    opmerking: "",
  });

  const { data: materiaal = [], isLoading } = useQuery<Materiaalregel[]>({
    queryKey: ["regie-materiaal", opdrachtId],
    queryFn: async () => {
      const r = await fetch(`/api/regie/materiaal?opdrachtId=${opdrachtId}`);
      if (!r.ok) throw new Error("Kan materiaal niet laden.");
      return r.json();
    },
  });

  const toevoegen = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/regie/materiaal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opdrachtId,
          datum: nieuwForm.datum,
          artikel: nieuwForm.artikel,
          omschrijving: nieuwForm.omschrijving || undefined,
          hoeveelheid: parseFloat(nieuwForm.hoeveelheid) || 1,
          eenheid: nieuwForm.eenheid,
          inkoopprijs: nieuwForm.inkoopprijs ? parseFloat(nieuwForm.inkoopprijs) : undefined,
          verkoopprijs: nieuwForm.verkoopprijs ? parseFloat(nieuwForm.verkoopprijs) : undefined,
          bron: nieuwForm.bron,
          leverancier: nieuwForm.leverancier || undefined,
          bonnummer: nieuwForm.bonnummer || undefined,
          opmerking: nieuwForm.opmerking || undefined,
        }),
      });
      if (!r.ok) throw new Error("Toevoegen mislukt.");
      return r.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["regie-materiaal", opdrachtId] });
      void qc.invalidateQueries({ queryKey: ["regie-dashboard"] });
      toast({ title: "Materiaalregel toegevoegd." });
      setNieuwOpen(false);
      setNieuwForm(f => ({ ...f, artikel: "", omschrijving: "", hoeveelheid: "1", inkoopprijs: "", verkoopprijs: "", leverancier: "", bonnummer: "", opmerking: "" }));
    },
    onError: () => toast({ title: "Toevoegen mislukt.", variant: "destructive" }),
  });

  const verwijderen = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/regie/materiaal/${id}`, { method: "DELETE" });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["regie-materiaal", opdrachtId] }),
  });

  const totaalVerkoopprijs = materiaal.reduce((s, m) => s + m.hoeveelheid * (m.verkoopprijs ?? m.inkoopprijs ?? 0), 0);

  if (isLoading) return <p className="text-sm text-muted-foreground p-4">Laden...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 p-3 bg-muted/40 rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Totaal materiaalwaarde</p>
            <p className="text-xl font-bold">{euroFormat(totaalVerkoopprijs)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Regels</p>
            <p className="text-xl font-bold">{materiaal.length}</p>
          </div>
        </div>
        {kanSchrijven && (
          <Button size="sm" onClick={() => setNieuwOpen(v => !v)}>
            <Plus className="h-4 w-4 mr-1" />
            Materiaal boeken
          </Button>
        )}
      </div>

      {/* Nieuw formulier */}
      {nieuwOpen && (
        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
          <h4 className="font-medium text-sm">Nieuwe materiaalregel</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Datum</Label>
              <Input type="date" value={nieuwForm.datum} onChange={e => setNieuwForm(f => ({ ...f, datum: e.target.value }))} />
            </div>
            <div className="col-span-1 sm:col-span-2 space-y-1">
              <Label className="text-xs">Artikel *</Label>
              <Input value={nieuwForm.artikel} onChange={e => setNieuwForm(f => ({ ...f, artikel: e.target.value }))} placeholder="Artikelnaam of -nummer" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bron</Label>
              <Select value={nieuwForm.bron} onValueChange={v => setNieuwForm(f => ({ ...f, bron: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BRONNEN.map(b => <SelectItem key={b} value={b}>{b.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Omschrijving</Label>
              <Input value={nieuwForm.omschrijving} onChange={e => setNieuwForm(f => ({ ...f, omschrijving: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Hoeveelheid</Label>
              <Input type="number" min={0.01} step={0.01} value={nieuwForm.hoeveelheid} onChange={e => setNieuwForm(f => ({ ...f, hoeveelheid: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Eenheid</Label>
              <Input value={nieuwForm.eenheid} onChange={e => setNieuwForm(f => ({ ...f, eenheid: e.target.value }))} placeholder="st, m, m², ..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Inkoopprijs (€)</Label>
              <Input type="number" min={0} step={0.01} value={nieuwForm.inkoopprijs} onChange={e => setNieuwForm(f => ({ ...f, inkoopprijs: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Verkoopprijs (€)</Label>
              <Input type="number" min={0} step={0.01} value={nieuwForm.verkoopprijs} onChange={e => setNieuwForm(f => ({ ...f, verkoopprijs: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Leverancier</Label>
              <Input value={nieuwForm.leverancier} onChange={e => setNieuwForm(f => ({ ...f, leverancier: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bonnummer</Label>
              <Input value={nieuwForm.bonnummer} onChange={e => setNieuwForm(f => ({ ...f, bonnummer: e.target.value }))} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setNieuwOpen(false)}>Annuleren</Button>
            <Button size="sm" disabled={!nieuwForm.artikel || toevoegen.isPending} onClick={() => toevoegen.mutate()}>
              {toevoegen.isPending ? "Toevoegen..." : "Toevoegen"}
            </Button>
          </div>
        </div>
      )}

      {materiaal.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>Nog geen materiaal geboekt op dit project.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 pr-3">Datum</th>
                <th className="text-left py-2 pr-3">Artikel</th>
                <th className="text-left py-2 pr-3">Bron</th>
                <th className="text-right py-2 pr-3">Hoeveelheid</th>
                <th className="text-right py-2 pr-3">Inkoop</th>
                <th className="text-right py-2 pr-3">Verkoop</th>
                <th className="text-right py-2 pr-3">Totaal</th>
                <th className="text-left py-2">Status</th>
                {kanSchrijven && <th className="py-2" />}
              </tr>
            </thead>
            <tbody>
              {materiaal.map(m => (
                <tr key={m.id} className="border-b hover:bg-muted/20">
                  <td className="py-2 pr-3 whitespace-nowrap">{m.datum}</td>
                  <td className="py-2 pr-3">
                    <div>{m.artikel}</div>
                    {m.omschrijving && <div className="text-xs text-muted-foreground">{m.omschrijving}</div>}
                  </td>
                  <td className="py-2 pr-3 capitalize">{m.bron.replace("_", " ")}</td>
                  <td className="py-2 pr-3 text-right">{m.hoeveelheid} {m.eenheid}</td>
                  <td className="py-2 pr-3 text-right">{m.inkoopprijs ? euroFormat(m.inkoopprijs) : "—"}</td>
                  <td className="py-2 pr-3 text-right">{m.verkoopprijs ? euroFormat(m.verkoopprijs) : "—"}</td>
                  <td className="py-2 pr-3 text-right font-medium">
                    {euroFormat(m.hoeveelheid * (m.verkoopprijs ?? m.inkoopprijs ?? 0))}
                  </td>
                  <td className="py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      m.status === "goedgekeurd" ? "bg-green-100 text-green-800" :
                      m.status === "gefactureerd" ? "bg-blue-100 text-blue-800" :
                      "bg-slate-100 text-slate-600"
                    }`}>{m.status}</span>
                  </td>
                  {kanSchrijven && (
                    <td className="py-2">
                      {m.status === "concept" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                          onClick={() => verwijderen.mutate(m.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Hoofd-component ───────────────────────────────────────────────────────────

export default function RegieDetailPagina() {
  const [, params] = useRoute("/regie/:id");
  const opdrachtId = parseInt(params?.id ?? "0");
  const { heeftNiveau } = useBevoegdheid();
  const kanSchrijven = heeftNiveau("offertes", 2);

  const { data: opdracht, isLoading } = useQuery({
    queryKey: ["opdracht", opdrachtId],
    queryFn: async () => {
      const r = await fetch(`/api/opdrachten/${opdrachtId}`);
      if (!r.ok) throw new Error("Opdracht niet gevonden.");
      return r.json() as Promise<{ id: number; titel: string; werknummer: string | null; opdrachtgever: string | null; status: string; type: string }>;
    },
    enabled: opdrachtId > 0,
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Laden...</div>;
  if (!opdracht) return <div className="p-6 text-sm text-muted-foreground">Project niet gevonden.</div>;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" className="mt-0.5 shrink-0" asChild>
          <Link href="/regie"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 data-paginatitel className="text-xl font-semibold">{opdracht.titel}</h1>
            <Badge className="bg-primary/10 text-primary border-primary/20 font-semibold text-xs">REGIE</Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
            {opdracht.werknummer && <span>{opdracht.werknummer}</span>}
            {opdracht.opdrachtgever && <span>{opdracht.opdrachtgever}</span>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="voorwaarden">
        <TabsList>
          <TabsTrigger value="voorwaarden">
            <FileText className="h-4 w-4 mr-1.5" />
            Voorwaarden
          </TabsTrigger>
          <TabsTrigger value="begroting">
            <Euro className="h-4 w-4 mr-1.5" />
            Begroting
          </TabsTrigger>
          <TabsTrigger value="uren">
            <Clock className="h-4 w-4 mr-1.5" />
            Uren
          </TabsTrigger>
          <TabsTrigger value="materiaal">
            <Package className="h-4 w-4 mr-1.5" />
            Materiaal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="voorwaarden" className="mt-6">
          <VoorwaardenTab opdrachtId={opdrachtId} kanSchrijven={kanSchrijven} />
        </TabsContent>
        <TabsContent value="begroting" className="mt-6">
          <BegrotingTab opdrachtId={opdrachtId} kanSchrijven={kanSchrijven} />
        </TabsContent>
        <TabsContent value="uren" className="mt-6">
          <UrenTab opdrachtId={opdrachtId} />
        </TabsContent>
        <TabsContent value="materiaal" className="mt-6">
          <MateriaalTab opdrachtId={opdrachtId} kanSchrijven={kanSchrijven} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
