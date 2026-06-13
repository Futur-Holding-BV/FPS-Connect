import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateLabel,
  useSetLabelDocumenten,
  useListDocumenten,
  useListFabrikanten,
  getListDocumentenQueryKey,
  getListLabelsQueryKey,
} from "@workspace/api-client-react";
import type { Label, VoorzieningType, Document, Fabrikant } from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label as UiLabel } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExternalLink, FileText, Plus, X, Sparkles, Check, Trash2, Upload } from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";
import { TYPE_LABELS, foutmelding, statusBadge } from "./documenten-tab";

// Gedeeld detail-/beheerscherm voor een toepassing (label). Toont en bewerkt de
// basisvelden, de gekoppelde applicatie-types en de gekoppelde documenten. Wordt
// gebruikt vanuit zowel de bibliotheek-tab als de losse toepassingen-pagina.
export function ToepassingDetailDialog({
  toepassing,
  open,
  onOpenChange,
  typen,
}: {
  toepassing: Label | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  typen: VoorzieningType[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        {open && toepassing ? (
          <ToepassingDetailInhoud
            key={toepassing.id}
            toepassing={toepassing}
            typen={typen}
            onSluit={() => onOpenChange(false)}
          />
        ) : (
          <DialogHeader>
            <DialogTitle>Toepassing</DialogTitle>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ToepassingDetailInhoud({
  toepassing,
  typen,
  onSluit,
}: {
  toepassing: Label;
  typen: VoorzieningType[];
  onSluit: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { heeftNiveau } = useBevoegdheid();
  const magBewerken = heeftNiveau("bibliotheek", 2);

  const wijzigLabel = useUpdateLabel();
  const zetDocumenten = useSetLabelDocumenten();

  // De VOLLEDIGE huidige documentset van deze toepassing, inclusief gearchiveerde
  // en vervangen revisies. Cruciaal: zo verdwijnt bij opslaan niet stilzwijgend
  // een gekoppeld testrapport of een oudere revisie die nog rechtsgeldig is.
  const {
    data: gekoppeld = [],
    isLoading: gekoppeldLaadt,
    isError: gekoppeldFout,
    isSuccess: gekoppeldGeladen,
  } = useListDocumenten({
    label_id: toepassing.id,
    inclusief_gearchiveerd: true,
  });
  // Selecteerbare documenten om toe te voegen: alleen actuele, niet-gearchiveerde
  // revisies (geen vervangen of ingetrokken documenten).
  const { data: actueleDocs = [] } = useListDocumenten({ alleen_actueel: true });

  const { data: fabrikanten = [] } = useListFabrikanten();

  const [naam, setNaam] = useState(toepassing.naam);
  const [fabrikantId, setFabrikantId] = useState<number | null>(toepassing.fabrikant_id ?? null);
  const [testnorm, setTestnorm] = useState(toepassing.testnorm ?? "");
  const [applCodes, setApplCodes] = useState<string[]>(toepassing.applicatie_codes ?? []);

  // De te bewaren documentset. Geïnitialiseerd uit de volledige gekoppelde set
  // zodra die is geladen; daarna alleen door bewuste acties van de gebruiker
  // aangepast (toevoegen/verwijderen).
  // docIdsKlaar = de gekoppelde set is daadwerkelijk geladen EN geïnitialiseerd.
  // Pas dan mag opgeslagen worden: anders zou een nog-ladende of mislukte query
  // (data valt terug op []) bij opslaan stilzwijgend alle koppelingen wissen.
  const [docIds, setDocIds] = useState<number[]>([]);
  const [docIdsKlaar, setDocIdsKlaar] = useState(false);
  const geinitialiseerd = useRef(false);
  useEffect(() => {
    if (!geinitialiseerd.current && gekoppeldGeladen) {
      setDocIds((gekoppeld as Document[]).map((d) => d.id));
      geinitialiseerd.current = true;
      setDocIdsKlaar(true);
    }
  }, [gekoppeldGeladen, gekoppeld]);

  const [fout, setFout] = useState("");

  // Productfoto: lokale spiegel van de serverwaarden zodat upload/bevestigen/verwijderen
  // direct zichtbaar zijn (eigen mutaties, los van de Opslaan-knop voor de basisvelden).
  const fotoInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useUpload();
  const [fotoUrl, setFotoUrl] = useState<string | null>(toepassing.product_foto_url ?? null);
  const [fotoBron, setFotoBron] = useState<string | null>(toepassing.product_foto_bron ?? null);
  const [fotoGeverifieerd, setFotoGeverifieerd] = useState<boolean>(
    toepassing.product_foto_geverifieerd,
  );
  const [fotoZekerheid, setFotoZekerheid] = useState<string | null>(
    toepassing.product_foto_zekerheid ?? null,
  );
  const [fotoUitleg, setFotoUitleg] = useState<string | null>(
    toepassing.product_foto_uitleg ?? null,
  );
  const fotoBezig = wijzigLabel.isPending || isUploading;

  function pasFotoToe(l: Label) {
    setFotoUrl(l.product_foto_url ?? null);
    setFotoBron(l.product_foto_bron ?? null);
    setFotoGeverifieerd(l.product_foto_geverifieerd);
    setFotoZekerheid(l.product_foto_zekerheid ?? null);
    setFotoUitleg(l.product_foto_uitleg ?? null);
  }

  async function vernieuwLijst() {
    await queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
  }

  // Handmatige upload door een beheerder telt als bevestigd (mens kiest de foto zelf).
  async function uploadFoto(file: File) {
    setFout("");
    try {
      const res = await uploadFile(file);
      if (!res) throw new Error("Upload mislukt");
      const l = await wijzigLabel.mutateAsync({
        id: toepassing.id,
        data: {
          product_foto_url: res.objectPath,
          product_foto_bron: "handmatig",
          product_foto_geverifieerd: true,
        },
      });
      pasFotoToe(l);
      await vernieuwLijst();
      toast({ title: "Productfoto bijgewerkt" });
    } catch (err) {
      const m = foutmelding(err, "Uploaden van de productfoto is mislukt.");
      setFout(m);
      toast({ title: "Upload mislukt", description: m, variant: "destructive" });
    }
  }

  async function bevestigFoto() {
    setFout("");
    try {
      const l = await wijzigLabel.mutateAsync({
        id: toepassing.id,
        data: { product_foto_geverifieerd: true },
      });
      pasFotoToe(l);
      await vernieuwLijst();
      toast({ title: "Productfoto bevestigd" });
    } catch (err) {
      const m = foutmelding(err, "Bevestigen van de productfoto is mislukt.");
      setFout(m);
      toast({ title: "Bevestigen mislukt", description: m, variant: "destructive" });
    }
  }

  async function verwijderFoto() {
    setFout("");
    try {
      const l = await wijzigLabel.mutateAsync({
        id: toepassing.id,
        data: { product_foto_url: null },
      });
      pasFotoToe(l);
      await vernieuwLijst();
      toast({ title: "Productfoto verwijderd" });
    } catch (err) {
      const m = foutmelding(err, "Verwijderen van de productfoto is mislukt.");
      setFout(m);
      toast({ title: "Verwijderen mislukt", description: m, variant: "destructive" });
    }
  }

  // Opzoektabel met metadata voor elk document-id in de set. De gekoppelde set
  // (incl. gearchiveerd) is leidend, aangevuld met de actuele documenten zodat
  // net-toegevoegde documenten ook hun gegevens tonen.
  const docMap = useMemo(() => {
    const m = new Map<number, Document>();
    for (const d of actueleDocs as Document[]) m.set(d.id, d);
    for (const d of gekoppeld as Document[]) m.set(d.id, d);
    return m;
  }, [actueleDocs, gekoppeld]);

  const gekoppeldeDocs = docIds
    .map((id) => docMap.get(id))
    .filter((d): d is Document => Boolean(d));
  const koppelbaar = (actueleDocs as Document[]).filter((d) => !docIds.includes(d.id));

  // Applicatie-opties: actieve types plus eventueel een al gekoppeld inactief type
  // (zodat een bestaande koppeling niet onzichtbaar wordt).
  const applOpties = useMemo(() => {
    const actief = typen.filter((t) => t.actief);
    const extra = typen.filter((t) => !t.actief && applCodes.includes(t.code));
    return [...actief, ...extra];
  }, [typen, applCodes]);

  const geldig = naam.trim() !== "";
  const bezig = wijzigLabel.isPending || zetDocumenten.isPending;

  async function bewaar() {
    if (!geldig || !docIdsKlaar) return;
    setFout("");
    try {
      await wijzigLabel.mutateAsync({
        id: toepassing.id,
        data: {
          naam: naam.trim(),
          fabrikant_id: fabrikantId,
          testnorm: testnorm.trim() || null,
          applicatie_codes: applCodes,
        },
      });
      await zetDocumenten.mutateAsync({
        id: toepassing.id,
        data: { document_ids: docIds },
      });
      await queryClient.invalidateQueries({ queryKey: getListLabelsQueryKey() });
      await queryClient.invalidateQueries({ queryKey: getListDocumentenQueryKey() });
      toast({
        title: "Toepassing opgeslagen",
        description: `De gegevens en koppelingen van "${naam.trim()}" zijn bijgewerkt.`,
      });
      onSluit();
    } catch (err) {
      const melding = foutmelding(err, "Opslaan is mislukt. Probeer het opnieuw.");
      setFout(melding);
      toast({
        title: "Opslaan mislukt",
        description: melding,
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{toepassing.naam}</DialogTitle>
        <DialogDescription>
          {magBewerken
            ? "Beheer de basisgegevens, applicatie-types en gekoppelde documenten."
            : "Bekijk de basisgegevens, applicatie-types en gekoppelde documenten."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid gap-3">
          <div>
            <UiLabel htmlFor="toep-naam">Naam *</UiLabel>
            <Input
              id="toep-naam"
              value={naam}
              disabled={!magBewerken}
              onChange={(e) => setNaam(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <UiLabel>Fabrikant</UiLabel>
              <Select
                value={fabrikantId == null ? "__geen__" : String(fabrikantId)}
                disabled={!magBewerken}
                onValueChange={(v) => setFabrikantId(v === "__geen__" ? null : Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kies een fabrikant (optioneel)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__geen__">Geen fabrikant</SelectItem>
                  {(fabrikanten as Fabrikant[]).map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.naam}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <UiLabel htmlFor="toep-testnorm">Brand- of rookwerendheid</UiLabel>
              <Input
                id="toep-testnorm"
                placeholder="Bijv. EN 1366-2"
                value={testnorm}
                disabled={!magBewerken}
                onChange={(e) => setTestnorm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <UiLabel>Productfoto</UiLabel>
          <p className="text-xs text-muted-foreground">
            Een echte foto van het product helpt een monteur het materiaal te herkennen.
          </p>
          {fotoUrl ? (
            <div className="rounded-md border p-3 space-y-3">
              <div className="flex gap-3">
                <img
                  src={`/api/storage${fotoUrl}`}
                  alt={`Productfoto van ${toepassing.naam}`}
                  className="h-24 w-24 shrink-0 rounded border object-cover bg-muted"
                />
                <div className="min-w-0 flex-1 space-y-1.5">
                  {fotoBron === "ai" && !fotoGeverifieerd ? (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI-voorstel — controleer
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-muted-foreground">
                      {fotoBron === "handmatig" ? "Handmatig toegevoegd" : "Bevestigd"}
                    </Badge>
                  )}
                  {fotoBron === "ai" && fotoZekerheid && (
                    <p className="text-xs text-muted-foreground">
                      AI-zekerheid: {fotoZekerheid}
                    </p>
                  )}
                  {fotoBron === "ai" && !fotoGeverifieerd && fotoUitleg && (
                    <p className="text-xs text-muted-foreground">{fotoUitleg}</p>
                  )}
                </div>
              </div>
              {magBewerken && (
                <div className="flex flex-wrap gap-2">
                  {fotoBron === "ai" && !fotoGeverifieerd && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={bevestigFoto}
                      disabled={fotoBezig}
                    >
                      <Check className="h-4 w-4 mr-1.5" />
                      Bevestigen
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => fotoInputRef.current?.click()}
                    disabled={fotoBezig}
                  >
                    <Upload className="h-4 w-4 mr-1.5" />
                    {fotoBezig ? "Bezig…" : "Vervangen"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={verwijderFoto}
                    disabled={fotoBezig}
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Verwijderen
                  </Button>
                </div>
              )}
            </div>
          ) : magBewerken ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => fotoInputRef.current?.click()}
              disabled={fotoBezig}
            >
              <Upload className="h-4 w-4 mr-1.5" />
              {fotoBezig ? "Uploaden…" : "Productfoto uploaden"}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3 text-center">
              Nog geen productfoto.
            </p>
          )}
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFoto(f);
              e.target.value = "";
            }}
          />
        </div>

        <div className="space-y-2">
          <UiLabel>Applicatie-types</UiLabel>
          <ScrollArea className="h-36 rounded-md border">
            <div className="p-2 space-y-1">
              {applOpties.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2">
                  Geen applicatie-types beschikbaar.
                </p>
              ) : (
                applOpties.map((t) => (
                  <label
                    key={t.code}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50 ${
                      magBewerken ? "cursor-pointer" : ""
                    }`}
                  >
                    <Checkbox
                      checked={applCodes.includes(t.code)}
                      disabled={!magBewerken}
                      onCheckedChange={(checked) =>
                        setApplCodes((cs) =>
                          checked ? [...cs, t.code] : cs.filter((c) => c !== t.code),
                        )
                      }
                    />
                    <span className="text-sm flex-1">
                      <span className="font-mono text-xs text-muted-foreground mr-2">
                        {t.code}
                      </span>
                      {t.naam}
                      {!t.actief && (
                        <span className="text-xs text-muted-foreground ml-2">(inactief)</span>
                      )}
                    </span>
                  </label>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <UiLabel>Gekoppelde documenten</UiLabel>
            <span className="text-xs text-muted-foreground">{docIds.length} gekoppeld</span>
          </div>

          {gekoppeldLaadt ? (
            <p className="text-xs text-muted-foreground p-2">Documenten laden…</p>
          ) : gekoppeldFout ? (
            <p className="text-xs text-destructive rounded-md border border-destructive/40 p-3 text-center">
              De gekoppelde documenten konden niet worden geladen. Sluit dit venster
              en probeer het opnieuw; opslaan is uitgeschakeld om te voorkomen dat
              koppelingen verloren gaan.
            </p>
          ) : gekoppeldeDocs.length === 0 ? (
            <p className="text-xs text-muted-foreground rounded-md border border-dashed p-3 text-center">
              Nog geen documenten gekoppeld.
            </p>
          ) : (
            <div className="rounded-md border divide-y">
              {gekoppeldeDocs.map((d) => (
                <div key={d.id} className="flex items-center gap-2 p-2">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate flex items-center gap-1.5">
                      {d.naam}
                      {d.pdf_url && (
                        <a
                          href={d.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className="text-xs font-normal">
                        {TYPE_LABELS[d.documenttype] ?? d.documenttype}
                      </Badge>
                      {statusBadge(d.status)}
                      {d.gearchiveerd && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Gearchiveerd
                        </Badge>
                      )}
                      {d.fabrikant && (
                        <span className="text-xs text-muted-foreground">{d.fabrikant}</span>
                      )}
                    </div>
                  </div>
                  {magBewerken && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      title="Koppeling verwijderen"
                      onClick={() => setDocIds((ids) => ids.filter((x) => x !== d.id))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {magBewerken && (
            <DocumentKoppelen
              koppelbaar={koppelbaar}
              onKoppel={(id) =>
                setDocIds((ids) => (ids.includes(id) ? ids : [...ids, id]))
              }
            />
          )}
        </div>

        {fout && <p className="text-sm text-destructive">{fout}</p>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onSluit}>
          {magBewerken ? "Annuleren" : "Sluiten"}
        </Button>
        {magBewerken && (
          <Button onClick={bewaar} disabled={!geldig || bezig || !docIdsKlaar}>
            {bezig ? "Opslaan…" : "Opslaan"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

// Inklapbare picker om een bestaand (actueel) document aan de toepassing te koppelen.
function DocumentKoppelen({
  koppelbaar,
  onKoppel,
}: {
  koppelbaar: Document[];
  onKoppel: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState("");

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-4 w-4 mr-1.5" />
        Document koppelen
      </Button>
    );
  }

  const gefilterd = koppelbaar.filter(
    (d) =>
      d.naam.toLowerCase().includes(zoek.toLowerCase()) ||
      (d.fabrikant ?? "").toLowerCase().includes(zoek.toLowerCase()),
  );

  return (
    <div className="rounded-md border p-2 space-y-2">
      <Input
        placeholder="Zoek een document…"
        value={zoek}
        onChange={(e) => setZoek(e.target.value)}
        className="h-8 text-sm"
        autoFocus
      />
      <ScrollArea className="h-40">
        <div className="space-y-1">
          {gefilterd.length === 0 ? (
            <p className="text-xs text-muted-foreground p-2">
              Geen koppelbare documenten. Upload eerst een document in de tab Documenten.
            </p>
          ) : (
            gefilterd.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onKoppel(d.id)}
                className="w-full flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40 text-left"
              >
                <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm flex-1 truncate">{d.naam}</span>
                <Badge variant="outline" className="text-xs font-normal shrink-0">
                  {TYPE_LABELS[d.documenttype] ?? d.documenttype}
                </Badge>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
