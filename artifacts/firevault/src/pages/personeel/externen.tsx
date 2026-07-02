import { useState } from "react";
import { useListMedewerkers, useListZzpOvereenkomsten, useCreateZzpOvereenkomst, useUpdateZzpOvereenkomst, useAiVulZzpOvereenkomst } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Users, FileText, Plus, Sparkles, CheckCircle2, Clock, AlertCircle,
  Search, ExternalLink, Building2, Calendar, Euro,
} from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getListZzpOvereenkomstenQueryKey } from "@workspace/api-client-react";

const DIENSTVERBAND_EXTERN = ["zzp", "uitzend", "inhuur"];

const STATUS_LABELS: Record<string, string> = {
  concept: "Concept",
  te_ondertekenen: "Ter ondertekening",
  ondertekend: "Ondertekend",
  verlopen: "Verlopen",
  opgezegd: "Opgezegd",
};

const STATUS_KLEUR: Record<string, string> = {
  concept: "bg-gray-100 text-gray-700 border-gray-200",
  te_ondertekenen: "bg-amber-50 text-amber-700 border-amber-200",
  ondertekend: "bg-green-50 text-green-700 border-green-200",
  verlopen: "bg-red-50 text-red-700 border-red-200",
  opgezegd: "bg-red-50 text-red-700 border-red-200",
};

const DIENSTVERBAND_LABEL: Record<string, string> = {
  zzp: "ZZP",
  uitzend: "Uitzendkracht",
  inhuur: "Inhuur / Onderaannemer",
};

function initialen(naam: string) {
  return naam.split(" ").filter(Boolean).slice(0, 2).map((d) => d[0]?.toUpperCase() ?? "").join("");
}

function formatDatum(s: string | null | undefined) {
  if (!s) return "";
  try { return new Date(s).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }); }
  catch { return s; }
}

interface NieuwOvereenkomstForm {
  medewerker_id: number | null;
  opdracht_omschrijving: string;
  specifieke_taken: string;
  projectnummer: string;
  start_datum: string;
  eind_datum: string;
  uurtarief: string;
  vaste_prijs: string;
  betalingswijze: string;
  zzp_bedrijfsnaam: string;
  zzp_kvk: string;
  zzp_btw: string;
}

const LEEG_FORM: NieuwOvereenkomstForm = {
  medewerker_id: null,
  opdracht_omschrijving: "",
  specifieke_taken: "",
  projectnummer: "",
  start_datum: "",
  eind_datum: "",
  uurtarief: "",
  vaste_prijs: "",
  betalingswijze: "factuur_achteraf",
  zzp_bedrijfsnaam: "",
  zzp_kvk: "",
  zzp_btw: "",
};

export default function ExternenPagina() {
  const { data: alleMedewerkers, isLoading: laadMedewerkers } = useListMedewerkers();
  const { data: overeenkomsten, isLoading: laadOvereenkomsten } = useListZzpOvereenkomsten();
  const maakOvereenkomst = useCreateZzpOvereenkomst();
  const aiVul = useAiVulZzpOvereenkomst();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [zoek, setZoek] = useState("");
  const [nieuweOpen, setNieuweOpen] = useState(false);
  const [form, setForm] = useState<NieuwOvereenkomstForm>(LEEG_FORM);
  const [tabActief, setTabActief] = useState("medewerkers");

  const externen = (alleMedewerkers ?? []).filter(
    (m) => m.actief && DIENSTVERBAND_EXTERN.includes(m.dienstverband ?? ""),
  );

  const gefilterd = externen.filter((m) => {
    if (!zoek.trim()) return true;
    const q = zoek.toLowerCase();
    return (
      m.naam.toLowerCase().includes(q) ||
      (m.bedrijf_uitzendbureau ?? "").toLowerCase().includes(q) ||
      (m.werkmaatschappij ?? "").toLowerCase().includes(q)
    );
  });

  async function handleAiVullen() {
    if (!form.medewerker_id) {
      toast({ title: "Selecteer eerst een medewerker", variant: "destructive" });
      return;
    }
    const medewerker = externen.find((m) => m.id === form.medewerker_id);
    try {
      const resultaat = await aiVul.mutateAsync({
        data: {
          medewerker_id: form.medewerker_id,
          functie_naam: medewerker?.functie_naam ?? undefined,
          bedrijfsnaam: medewerker?.bedrijf_uitzendbureau ?? undefined,
          projectnummer: form.projectnummer || undefined,
        },
      });
      setForm((f) => ({
        ...f,
        opdracht_omschrijving: resultaat.opdracht_omschrijving ?? f.opdracht_omschrijving,
        specifieke_taken: resultaat.specifieke_taken ?? f.specifieke_taken,
        zzp_bedrijfsnaam: resultaat.zzp_bedrijfsnaam ?? f.zzp_bedrijfsnaam,
      }));
      toast({ title: "AI heeft de overeenkomst ingevuld" });
    } catch {
      toast({ title: "AI-invullen mislukt", variant: "destructive" });
    }
  }

  async function handleOpslaan() {
    if (!form.medewerker_id || !form.opdracht_omschrijving.trim() || !form.start_datum || !form.eind_datum) {
      toast({ title: "Vul medewerker, omschrijving en start- en einddatum in", variant: "destructive" });
      return;
    }
    try {
      await maakOvereenkomst.mutateAsync({
        data: {
          medewerker_id: form.medewerker_id,
          opdracht_omschrijving: form.opdracht_omschrijving,
          specifieke_taken: form.specifieke_taken,
          projectnummer: form.projectnummer || undefined,
          start_datum: form.start_datum,
          eind_datum: form.eind_datum,
          uurtarief: form.uurtarief ? parseFloat(form.uurtarief) : undefined,
          vaste_prijs: form.vaste_prijs ? parseFloat(form.vaste_prijs) : undefined,
          betalingswijze: form.betalingswijze,
          zzp_bedrijfsnaam: form.zzp_bedrijfsnaam || undefined,
          zzp_kvk: form.zzp_kvk || undefined,
          zzp_btw: form.zzp_btw || undefined,
          ai_ingevuld: aiVul.isSuccess,
        },
      });
      await queryClient.invalidateQueries({ queryKey: getListZzpOvereenkomstenQueryKey() });
      toast({ title: "Overeenkomst aangemaakt" });
      setNieuweOpen(false);
      setForm(LEEG_FORM);
      setTabActief("overeenkomsten");
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  const isLoading = laadMedewerkers || laadOvereenkomsten;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Externen</h1>
          <p className="text-muted-foreground mt-1">
            ZZP-ers, uitzendkrachten en ingehuurd personeel. Beheer overeenkomsten en projectkoppelingen.
          </p>
        </div>
        <Button onClick={() => setNieuweOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Nieuwe overeenkomst
        </Button>
      </div>

      <Tabs value={tabActief} onValueChange={setTabActief}>
        <TabsList>
          <TabsTrigger value="medewerkers">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            Externen ({externen.length})
          </TabsTrigger>
          <TabsTrigger value="overeenkomsten">
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Overeenkomsten ({(overeenkomsten ?? []).length})
          </TabsTrigger>
        </TabsList>

        {/* Tab: medewerkers */}
        <TabsContent value="medewerkers" className="space-y-4 mt-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Zoek op naam of bedrijf..."
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
            />
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : gefilterd.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>{externen.length === 0 ? "Nog geen externe medewerkers geregistreerd." : "Geen resultaten."}</p>
                {externen.length === 0 && (
                  <p className="text-xs mt-1">Voeg medewerkers toe met dienstverband ZZP, Uitzend of Inhuur.</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {gefilterd.map((m) => {
                const overeenk = (overeenkomsten ?? []).filter((o) => o.medewerker_id === m.id);
                const actief = overeenk.filter((o) => o.status === "ondertekend");
                return (
                  <Card key={m.id} className="hover:bg-muted/30 transition-colors">
                    <CardContent className="py-3 px-4 flex items-center gap-3">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="text-xs">{initialen(m.naam)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{m.naam}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {m.bedrijf_uitzendbureau ?? m.werkmaatschappij}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">
                          {DIENSTVERBAND_LABEL[m.dienstverband ?? ""] ?? m.dienstverband}
                        </Badge>
                        {actief.length > 0 ? (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                            <CheckCircle2 className="h-3 w-3 mr-1" />{actief.length} actief
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                            <AlertCircle className="h-3 w-3 mr-1" />Geen overeenkomst
                          </Badge>
                        )}
                        <Link href={`/personeel/${m.id}`}>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Profiel">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab: overeenkomsten */}
        <TabsContent value="overeenkomsten" className="space-y-4 mt-4">
          {laadOvereenkomsten ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : (overeenkomsten ?? []).length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>Nog geen overeenkomsten.</p>
                <p className="text-xs mt-1">Klik op "Nieuwe overeenkomst" om een ZZP-opdracht vast te leggen.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {(overeenkomsten ?? []).map((o) => (
                <Card key={o.id}>
                  <CardContent className="py-4 px-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="font-semibold text-sm">{o.opdracht_omschrijving}</div>
                        <div className="text-xs text-muted-foreground">{o.medewerker_naam ?? `Medewerker #${o.medewerker_id}`}</div>
                      </div>
                      <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_KLEUR[o.status] ?? ""}`}>
                        {STATUS_LABELS[o.status] ?? o.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      {o.projectnummer && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />{o.projectnummer}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDatum(o.start_datum)} – {formatDatum(o.eind_datum)}
                      </span>
                      {o.uurtarief && (
                        <span className="flex items-center gap-1">
                          <Euro className="h-3 w-3" />&euro;{o.uurtarief}/uur
                        </span>
                      )}
                      {o.vaste_prijs && (
                        <span className="flex items-center gap-1">
                          <Euro className="h-3 w-3" />&euro;{o.vaste_prijs} (vaste prijs)
                        </span>
                      )}
                    </div>
                    {o.ai_ingevuld && (
                      <div className="flex items-center gap-1 text-xs text-amber-600">
                        <Sparkles className="h-3 w-3" /> AI-voorstel gebruikt
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialoog: nieuwe overeenkomst */}
      <Dialog open={nieuweOpen} onOpenChange={setNieuweOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nieuwe ZZP-overeenkomst</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Medewerker */}
            <div className="space-y-1.5">
              <Label>Medewerker (ZZP / extern) *</Label>
              <Select
                value={form.medewerker_id ? String(form.medewerker_id) : undefined}
                onValueChange={(v) => setForm((f) => ({ ...f, medewerker_id: Number(v) }))}
              >
                <SelectTrigger><SelectValue placeholder="Kies externe medewerker" /></SelectTrigger>
                <SelectContent>
                  {externen.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.naam} — {DIENSTVERBAND_LABEL[m.dienstverband ?? ""] ?? m.dienstverband}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {externen.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Voeg eerst een medewerker toe met dienstverband ZZP, Uitzend of Inhuur.
                </p>
              )}
            </div>

            {/* Projectnummer */}
            <div className="space-y-1.5">
              <Label>Projectnummer / opdracht</Label>
              <Input
                placeholder="Bijv. 2025-042 of Gebouw X"
                value={form.projectnummer}
                onChange={(e) => setForm((f) => ({ ...f, projectnummer: e.target.value }))}
              />
            </div>

            {/* AI-invullen */}
            <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-amber-800">AI-invullen</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  AI stelt een opdrachtomschrijving en specifieke taken voor op basis van functie en project.
                  U controleert en past aan vóór opslaan.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0"
                onClick={handleAiVullen}
                disabled={!form.medewerker_id || aiVul.isPending}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {aiVul.isPending ? "Bezig..." : "Invullen"}
              </Button>
            </div>

            {/* Opdrachtomschrijving */}
            <div className="space-y-1.5">
              <Label>Opdrachtomschrijving *</Label>
              <Input
                placeholder="Bijv. Aanbrengen brandwerende voorzieningen"
                value={form.opdracht_omschrijving}
                onChange={(e) => setForm((f) => ({ ...f, opdracht_omschrijving: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Korte titel van de opdracht.</p>
            </div>

            {/* Specifieke taken */}
            <div className="space-y-1.5">
              <Label>Specifieke werkzaamheden en eigen verantwoordelijkheid</Label>
              <Textarea
                rows={6}
                placeholder="Omschrijf de specifieke werkzaamheden zo dat de ZZP-er duidelijk eigen verantwoordelijkheid draagt. Vermeld: wat wordt uitgevoerd, welke resultaten worden verwacht, dat de opdrachtnemer zelf bepaalt hoe en wanneer, en dat hij/zij vrij is een vervanger in te zetten."
                value={form.specifieke_taken}
                onChange={(e) => setForm((f) => ({ ...f, specifieke_taken: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Belastingdienst-vereiste: beschrijf werkzaamheden zo dat geen schijnzelfstandigheid ontstaat.
                Noem eigen verantwoordelijkheid, geen gezagsverhouding en mogelijkheid tot vervanging.
              </p>
            </div>

            <Separator />

            {/* Data */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Startdatum *</Label>
                <Input
                  type="date"
                  value={form.start_datum}
                  onChange={(e) => setForm((f) => ({ ...f, start_datum: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Einddatum * <span className="text-xs text-muted-foreground">(verplicht voor ZZP)</span></Label>
                <Input
                  type="date"
                  value={form.eind_datum}
                  onChange={(e) => setForm((f) => ({ ...f, eind_datum: e.target.value }))}
                />
              </div>
            </div>

            {/* Financieel */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Uurtarief (&euro;)</Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={form.uurtarief}
                  onChange={(e) => setForm((f) => ({ ...f, uurtarief: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Vaste prijs (&euro;) <span className="text-xs text-muted-foreground">(alternatief)</span></Label>
                <Input
                  type="number"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={form.vaste_prijs}
                  onChange={(e) => setForm((f) => ({ ...f, vaste_prijs: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Betalingswijze</Label>
              <Select value={form.betalingswijze} onValueChange={(v) => setForm((f) => ({ ...f, betalingswijze: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="factuur_achteraf">Factuur achteraf</SelectItem>
                  <SelectItem value="factuur_vooraf">Factuur vooraf</SelectItem>
                  <SelectItem value="maandelijks">Maandelijks</SelectItem>
                  <SelectItem value="bij_oplevering">Bij oplevering</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* ZZP bedrijfsgegevens */}
            <div>
              <p className="text-sm font-semibold mb-3">Gegevens opdrachtnemer</p>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label>Bedrijfsnaam</Label>
                  <Input
                    placeholder="Bedrijfsnaam ZZP-er"
                    value={form.zzp_bedrijfsnaam}
                    onChange={(e) => setForm((f) => ({ ...f, zzp_bedrijfsnaam: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>KvK-nummer</Label>
                    <Input
                      placeholder="12345678"
                      value={form.zzp_kvk}
                      onChange={(e) => setForm((f) => ({ ...f, zzp_kvk: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>BTW-nummer</Label>
                    <Input
                      placeholder="NL000000000B01"
                      value={form.zzp_btw}
                      onChange={(e) => setForm((f) => ({ ...f, zzp_btw: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 text-xs text-blue-800 space-y-1">
              <p className="font-medium">Belastingdienst — vereisten overeenkomst van opdracht</p>
              <ul className="space-y-0.5 list-disc pl-4">
                <li>Specifieke werkzaamheden met eigen verantwoordelijkheid voor het resultaat</li>
                <li>Geen gezagsverhouding: opdrachtnemer bepaalt zelf hoe en wanneer</li>
                <li>Mogelijkheid tot vrije vervanging door een andere ZZP-er</li>
                <li>Vaste einddatum (dit veld is verplicht)</li>
                <li>KvK- en BTW-nummer opdrachtnemer verplicht op de overeenkomst</li>
                <li>Beide partijen ondertekenen vóór aanvang werkzaamheden</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setNieuweOpen(false); setForm(LEEG_FORM); }}>
              Annuleren
            </Button>
            <Button onClick={handleOpslaan} disabled={maakOvereenkomst.isPending}>
              {maakOvereenkomst.isPending ? "Opslaan..." : "Overeenkomst aanmaken"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
