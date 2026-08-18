import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetVeiligheidLmras,
  usePostVeiligheidLmras,
  usePatchVeiligheidLmrasId,
  useDeleteVeiligheidLmrasId,
  useGetMijnLmraOpenstaand,
  getGetVeiligheidLmrasQueryKey,
  type VeiligheidLmra,
  type VeiligheidLmraInput,
  type LmraOpenstaandItem,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { PaginaHulp } from "@/components/pagina-hulp";
import {
  ClipboardCheck, Plus, Trash2, CheckCircle2, XCircle, MapPin,
  ChevronDown, ChevronUp, Loader2, Eye, Pencil, AlertTriangle, Briefcase,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Sentinel-waarde: Radix Select crasht bij value="" (zelfde bug als profielen-bewerken)
const GEEN_OPDRACHT = "__geen_opdracht__";

const STANDAARD_RISICOS = [
  "Val van hoogte",
  "Beknelling",
  "Blootstelling aan gevaarlijke stoffen",
  "Elektrisch gevaar",
  "Brand- of explosiegevaar",
  "Geluidsoverlast",
  "Slechte verlichting",
];

const STANDAARD_MAATREGELEN = [
  "Persoonlijke beschermingsmiddelen dragen",
  "Werkgebied afzetten",
  "Gereedschap keuren voor gebruik",
  "Communiceer met collega's",
  "EHBO-kit aanwezig",
  "Vluchtweg vrijhouden",
];

type LmraFormState = {
  locatie_omschrijving: string;
  werkzaamheden: string;
  project_naam: string;
  opdracht_id: number | null;
  risicos: string[];
  maatregelen: string[];
  veilig_voor_aanvang: boolean;
  gps_lat: string;
  gps_lng: string;
  bevestigd: boolean;
};

const leegFormulier = (): LmraFormState => ({
  locatie_omschrijving: "",
  werkzaamheden: "",
  project_naam: "",
  opdracht_id: null,
  risicos: [],
  maatregelen: [],
  veilig_voor_aanvang: true,
  gps_lat: "",
  gps_lng: "",
  bevestigd: false,
});

function RisicoLijstEditor({
  items, onChange, placeholder, suggesties,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  suggesties: string[];
}) {
  const [input, setInput] = useState("");

  const voegToe = (tekst: string) => {
    const t = tekst.trim();
    if (!t || items.includes(t)) return;
    onChange([...items, t]);
    setInput("");
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), voegToe(input))}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => voegToe(input)}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li key={i} className="flex items-center justify-between text-sm bg-muted rounded px-2 py-1">
              <span>{item}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-1 pt-1">
        {suggesties
          .filter((s) => !items.includes(s))
          .slice(0, 5)
          .map((s) => (
            <Badge
              key={s}
              variant="outline"
              className="cursor-pointer text-xs hover:bg-muted"
              onClick={() => voegToe(s)}
            >
              + {s}
            </Badge>
          ))}
      </div>
    </div>
  );
}

export default function VeiligheidLmraPagina() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven = heeftNiveau("toolbox", 3);
  const magVerwijderen = heeftNiveau("toolbox", 4);

  const [zoekterm, setZoekterm] = useState("");
  const [dialoogOpen, setDialoogOpen] = useState(false);
  const [bewerkId, setBewerkId] = useState<number | null>(null);
  const [formulier, setFormulier] = useState<LmraFormState>(leegFormulier());
  const [verwijderDialoogId, setVerwijderDialoogId] = useState<number | null>(null);
  const [detailLmra, setDetailLmra] = useState<VeiligheidLmra | null>(null);

  const { data: lmras, isLoading } = useGetVeiligheidLmras();
  const { data: opdrachtOpties = [] } = useGetMijnLmraOpenstaand();

  const aanmakenMutatie = usePostVeiligheidLmras({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetVeiligheidLmrasQueryKey() });
        setDialoogOpen(false);
        toast({ title: "LMRA geregistreerd" });
      },
      onError: () => toast({ title: "Fout bij opslaan", variant: "destructive" }),
    },
  });

  const bijwerkenMutatie = usePatchVeiligheidLmrasId({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetVeiligheidLmrasQueryKey() });
        setDialoogOpen(false);
        toast({ title: "LMRA bijgewerkt" });
      },
      onError: () => toast({ title: "Fout bij opslaan", variant: "destructive" }),
    },
  });

  const verwijderenMutatie = useDeleteVeiligheidLmrasId({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getGetVeiligheidLmrasQueryKey() });
        setVerwijderDialoogId(null);
        toast({ title: "LMRA verwijderd" });
      },
      onError: () => toast({ title: "Fout bij verwijderen", variant: "destructive" }),
    },
  });

  const openNieuw = () => {
    setBewerkId(null);
    setFormulier(leegFormulier());
    setDialoogOpen(true);
  };

  const openBewerken = (lmra: VeiligheidLmra) => {
    setBewerkId(lmra.id);
    setFormulier({
      locatie_omschrijving: lmra.locatie_omschrijving,
      werkzaamheden: lmra.werkzaamheden,
      project_naam: lmra.project_naam ?? "",
      opdracht_id: lmra.opdracht_id ?? null,
      risicos: lmra.risicos ?? [],
      maatregelen: lmra.maatregelen ?? [],
      veilig_voor_aanvang: lmra.veilig_voor_aanvang,
      gps_lat: lmra.gps_lat ?? "",
      gps_lng: lmra.gps_lng ?? "",
      bevestigd: true,
    });
    setDialoogOpen(true);
  };

  const opslaan = () => {
    if (!formulier.locatie_omschrijving.trim() || !formulier.werkzaamheden.trim()) {
      toast({ title: "Locatie en werkzaamheden zijn verplicht", variant: "destructive" });
      return;
    }
    if (!formulier.bevestigd) {
      toast({ title: "Bevestig de LMRA voor opslaan", variant: "destructive" });
      return;
    }
    const invoer: VeiligheidLmraInput = {
      locatie_omschrijving: formulier.locatie_omschrijving,
      werkzaamheden: formulier.werkzaamheden,
      project_naam: formulier.project_naam || null,
      opdracht_id: formulier.opdracht_id ?? undefined,
      risicos: formulier.risicos,
      maatregelen: formulier.maatregelen,
      veilig_voor_aanvang: formulier.veilig_voor_aanvang,
      gps_lat: formulier.gps_lat || null,
      gps_lng: formulier.gps_lng || null,
      foto_paden: [],
      handtekening: null,
    };
    if (bewerkId) {
      bijwerkenMutatie.mutate({ id: bewerkId, data: invoer });
    } else {
      aanmakenMutatie.mutate({ data: invoer });
    }
  };

  const gefilterd = (lmras ?? []).filter(
    (l) =>
      l.locatie_omschrijving.toLowerCase().includes(zoekterm.toLowerCase()) ||
      l.werkzaamheden.toLowerCase().includes(zoekterm.toLowerCase()) ||
      (l.medewerker_naam ?? "").toLowerCase().includes(zoekterm.toLowerCase()),
  );

  const isBezigOpslaan = aanmakenMutatie.isPending || bijwerkenMutatie.isPending;

  return (
    <div className="p-6 space-y-6">
      <PaginaHulp pagina="veiligheid-lmra" />
      <div className="flex items-center justify-between">
        <div>
          <h1 data-paginatitel className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-orange-600" />
            LMRA
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Laatste Minuut Risico Analyse — verplicht voor aanvang werkzaamheden
          </p>
        </div>
        {magSchrijven && (
          <Button onClick={openNieuw}>
            <Plus className="w-4 h-4 mr-2" />
            Nieuwe LMRA
          </Button>
        )}
      </div>

      <Input
        placeholder="Zoeken op locatie, werkzaamheden of medewerker..."
        value={zoekterm}
        onChange={(e) => setZoekterm(e.target.value)}
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : gefilterd.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground mb-3 opacity-40" />
            <p className="text-muted-foreground">
              {zoekterm ? "Geen LMRA's gevonden." : "Nog geen LMRA-registraties."}
            </p>
            {magSchrijven && !zoekterm && (
              <Button className="mt-4" onClick={openNieuw}>
                <Plus className="w-4 h-4 mr-2" />
                Eerste LMRA registreren
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {gefilterd.map((lmra) => (
            <Card
              key={lmra.id}
              className="cursor-pointer hover:shadow-sm transition-shadow"
              onClick={() => setDetailLmra(lmra)}
            >
              <CardContent className="py-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="mt-0.5">
                    {lmra.veilig_voor_aanvang ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{lmra.locatie_omschrijving}</p>
                    <p className="text-sm text-muted-foreground truncate">{lmra.werkzaamheden}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {lmra.medewerker_naam && (
                        <span className="text-xs text-muted-foreground">{lmra.medewerker_naam}</span>
                      )}
                      {lmra.opdracht_naam && (
                        <Badge variant="outline" className="text-xs flex items-center gap-1">
                          <Briefcase className="w-2.5 h-2.5" />
                          {lmra.opdracht_naam}
                        </Badge>
                      )}
                      {!lmra.opdracht_naam && lmra.project_naam && (
                        <Badge variant="outline" className="text-xs">{lmra.project_naam}</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(lmra.aangemaakt_op).toLocaleDateString("nl-NL", {
                          day: "2-digit", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                      {(lmra.risicos?.length ?? 0) > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {lmra.risicos!.length} risico{lmra.risicos!.length !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {magSchrijven && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); openBewerken(lmra); }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {magVerwijderen && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setVerwijderDialoogId(lmra.id); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Detail dialoog */}
      <Dialog open={!!detailLmra} onOpenChange={(o) => !o && setDetailLmra(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" />
              LMRA detail
            </DialogTitle>
          </DialogHeader>
          {detailLmra && (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                {detailLmra.veilig_voor_aanvang ? (
                  <Badge className="bg-green-100 text-green-800 border-green-300">Veilig voor aanvang</Badge>
                ) : (
                  <Badge variant="destructive">Niet veilig voor aanvang</Badge>
                )}
                {detailLmra.opdracht_naam && (
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Briefcase className="w-3 h-3" />
                    {detailLmra.opdracht_naam}
                  </Badge>
                )}
                {!detailLmra.opdracht_naam && detailLmra.project_naam && (
                  <Badge variant="outline">{detailLmra.project_naam}</Badge>
                )}
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Locatie</p>
                <p>{detailLmra.locatie_omschrijving}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Werkzaamheden</p>
                <p>{detailLmra.werkzaamheden}</p>
              </div>
              {(detailLmra.risicos?.length ?? 0) > 0 && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Gesignaleerde risico's</p>
                  <ul className="space-y-1">
                    {detailLmra.risicos!.map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-orange-500 mt-0.5 shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(detailLmra.maatregelen?.length ?? 0) > 0 && (
                <div>
                  <p className="font-medium text-muted-foreground mb-1">Beheersmaatregelen</p>
                  <ul className="space-y-1">
                    {detailLmra.maatregelen!.map((m, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 shrink-0" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-center gap-4 text-muted-foreground pt-2 border-t">
                {detailLmra.medewerker_naam && <span>{detailLmra.medewerker_naam}</span>}
                <span>{new Date(detailLmra.aangemaakt_op).toLocaleDateString("nl-NL", {
                  day: "2-digit", month: "long", year: "numeric",
                  hour: "2-digit", minute: "2-digit",
                })}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Aanmaken/Bewerken dialoog */}
      <Dialog open={dialoogOpen} onOpenChange={(o) => !o && setDialoogOpen(false)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" />
              {bewerkId ? "LMRA bewerken" : "Nieuwe LMRA registreren"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <div className="space-y-1">
              <Label>Locatie / werkplek <span className="text-destructive">*</span></Label>
              <Input
                value={formulier.locatie_omschrijving}
                onChange={(e) => setFormulier((f) => ({ ...f, locatie_omschrijving: e.target.value }))}
                placeholder="Beschrijf de locatie of het werkgebied"
              />
            </div>
            <div className="space-y-1">
              <Label>Werkzaamheden <span className="text-destructive">*</span></Label>
              <Textarea
                rows={3}
                value={formulier.werkzaamheden}
                onChange={(e) => setFormulier((f) => ({ ...f, werkzaamheden: e.target.value }))}
                placeholder="Wat ga je doen? Beschrijf de uit te voeren werkzaamheden"
              />
            </div>
            {opdrachtOpties.length > 0 ? (
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5" />
                  Opdracht / project (optioneel)
                </Label>
                <Select
                  value={formulier.opdracht_id !== null ? String(formulier.opdracht_id) : GEEN_OPDRACHT}
                  onValueChange={(v) => {
                    if (v === GEEN_OPDRACHT) {
                      setFormulier((f) => ({ ...f, opdracht_id: null, project_naam: "" }));
                      return;
                    }
                    const gevonden = opdrachtOpties.find((o: LmraOpenstaandItem) => o.opdracht_id === Number(v));
                    if (gevonden) {
                      setFormulier((f) => ({
                        ...f,
                        opdracht_id: gevonden.opdracht_id,
                        project_naam: gevonden.opdracht_naam,
                      }));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Geen opdracht geselecteerd" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GEEN_OPDRACHT}>Geen opdracht</SelectItem>
                    {opdrachtOpties.map((o: LmraOpenstaandItem) => (
                      <SelectItem key={o.opdracht_id} value={String(o.opdracht_id)}>
                        <span className="flex items-center gap-2">
                          {o.opdracht_naam}
                          {o.dwingend && (
                            <span className="text-[10px] bg-red-100 text-red-700 rounded px-1 py-0.5 font-medium">Vereist</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Project (optioneel)</Label>
                <Input
                  value={formulier.project_naam}
                  onChange={(e) => setFormulier((f) => ({ ...f, project_naam: e.target.value }))}
                  placeholder="Projectnaam of -nummer"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Gesignaleerde risico's</Label>
              <RisicoLijstEditor
                items={formulier.risicos}
                onChange={(v) => setFormulier((f) => ({ ...f, risicos: v }))}
                placeholder="Beschrijf een risico en druk Enter"
                suggesties={STANDAARD_RISICOS}
              />
            </div>

            <div className="space-y-2">
              <Label>Beheersmaatregelen</Label>
              <RisicoLijstEditor
                items={formulier.maatregelen}
                onChange={(v) => setFormulier((f) => ({ ...f, maatregelen: v }))}
                placeholder="Voeg een maatregel toe en druk Enter"
                suggesties={STANDAARD_MAATREGELEN}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="font-medium">Veilig om te beginnen?</p>
                <p className="text-sm text-muted-foreground">
                  Zijn alle risico's beheersbaar en kunnen werkzaamheden veilig starten?
                </p>
              </div>
              <Switch
                checked={formulier.veilig_voor_aanvang}
                onCheckedChange={(v) => setFormulier((f) => ({ ...f, veilig_voor_aanvang: v }))}
              />
            </div>

            {!formulier.veilig_voor_aanvang && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Werkzaamheden mogen niet starten. Raadpleeg de leidinggevende.</span>
              </div>
            )}

            <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
              <div className="flex items-start gap-2">
                <input
                  id="lmra-bevestig"
                  type="checkbox"
                  checked={formulier.bevestigd}
                  onChange={(e) => setFormulier((f) => ({ ...f, bevestigd: e.target.checked }))}
                  className="mt-1"
                />
                <label htmlFor="lmra-bevestig" className="text-sm cursor-pointer">
                  Ik bevestig dat ik de werkplek heb gecontroleerd, de risico's heb beoordeeld
                  en de beheersmaatregelen heb doorgevoerd of gecommuniceerd.
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialoogOpen(false)}>Annuleren</Button>
            <Button onClick={opslaan} disabled={isBezigOpslaan}>
              {isBezigOpslaan && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {bewerkId ? "Opslaan" : "LMRA registreren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verwijder bevestiging */}
      <AlertDialog open={verwijderDialoogId !== null} onOpenChange={(o) => !o && setVerwijderDialoogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>LMRA verwijderen?</AlertDialogTitle>
            <AlertDialogDescription>Deze actie kan niet ongedaan worden gemaakt.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => verwijderDialoogId && verwijderenMutatie.mutate({ id: verwijderDialoogId })}
            >
              Verwijderen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
