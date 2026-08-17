// MERK_01 deel B — Beeldbank: één zoekingang over spotfoto's (per fase),
// opnamefoto's, inspectiefoto's en handmatige uploads. crm niveau 3.
// Gebouw-ACL wordt server-side afgedwongen (lijst én per bestand).
// Opdracht is alleen gevuld waar hij echt vastligt (handmatige uploads).
import { useMemo, useState } from "react";
import {
  useListBeeldbankFotos,
  useCreateBeeldbankUpload,
  useListGebouwen,
  useListOpdrachten,
  getListBeeldbankFotosQueryKey,
  type BeeldbankFoto,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, Search, ImageIcon, Loader2 } from "lucide-react";

const BRONNEN = [
  { waarde: "", label: "Alle bronnen" },
  { waarde: "spot", label: "Spotfoto's" },
  { waarde: "opname", label: "Opnamefoto's" },
  { waarde: "inspectie", label: "Inspectiefoto's" },
  { waarde: "upload", label: "Handmatige uploads" },
] as const;

const FASEN = [
  { waarde: "", label: "Alle fasen" },
  { waarde: "opname", label: "Opname" },
  { waarde: "uitvoering", label: "Uitvoering" },
  { waarde: "oplevering", label: "Oplevering" },
] as const;

const fotoSleutel = (f: BeeldbankFoto) => `${f.bron}:${f.bron_id}:${f.volgnummer}`;

function UploadDialoog({ open, onClose, onKlaar }: { open: boolean; onClose: () => void; onKlaar: () => void }) {
  const { toast } = useToast();
  const { uploadFile, isUploading } = useUpload({ bestand_type: "algemeen" });
  const registreer = useCreateBeeldbankUpload();
  const { data: gebouwen } = useListGebouwen();
  const { data: opdrachten } = useListOpdrachten();
  const [pad, setPad] = useState<string | null>(null);
  const [bijschrift, setBijschrift] = useState("");
  const [gebouwId, setGebouwId] = useState<string>("");
  const [opdrachtId, setOpdrachtId] = useState<string>("");
  const [werksoort, setWerksoort] = useState("");
  const [bezig, setBezig] = useState(false);

  const reset = () => { setPad(null); setBijschrift(""); setGebouwId(""); setOpdrachtId(""); setWerksoort(""); };

  const onBestand = async (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast({ variant: "destructive", title: "Alleen afbeeldingen" }); return; }
    try {
      const resp = await uploadFile(f);
      if (resp?.objectPath) setPad(resp.objectPath);
    } catch { toast({ variant: "destructive", title: "Upload mislukt" }); }
  };

  const opslaan = async () => {
    if (!pad) return;
    setBezig(true);
    try {
      await registreer.mutateAsync({ data: {
        object_path: pad,
        bijschrift: bijschrift.trim() || null,
        gebouw_id: gebouwId ? Number(gebouwId) : null,
        opdracht_id: opdrachtId ? Number(opdrachtId) : null,
        werksoort: werksoort.trim() || null,
      } });
      toast({ title: "Foto toegevoegd aan de beeldbank" });
      reset(); onKlaar(); onClose();
    } catch { toast({ variant: "destructive", title: "Opslaan mislukt" }); }
    finally { setBezig(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Foto uploaden</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Afbeelding</Label>
            <Input type="file" accept="image/*" disabled={isUploading} data-testid="beeldbank-upload-bestand"
              onChange={(e) => onBestand(e.target.files?.[0])} />
            {isUploading ? <p className="mt-1 text-xs text-muted-foreground">Bezig met uploaden…</p> : null}
            {pad ? <p className="mt-1 text-xs text-muted-foreground">Geüpload ✓</p> : null}
          </div>
          <div>
            <Label>Bijschrift</Label>
            <Input value={bijschrift} onChange={(e) => setBijschrift(e.target.value)} placeholder="Korte omschrijving" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Gebouw</Label>
              <Select value={gebouwId} onValueChange={setGebouwId}>
                <SelectTrigger data-testid="beeldbank-upload-gebouw"><SelectValue placeholder="(geen)" /></SelectTrigger>
                <SelectContent>
                  {(gebouwen ?? []).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Opdracht</Label>
              <Select value={opdrachtId} onValueChange={setOpdrachtId}>
                <SelectTrigger><SelectValue placeholder="(geen)" /></SelectTrigger>
                <SelectContent>
                  {(opdrachten ?? []).map((o) => <SelectItem key={o.id} value={String(o.id)}>{o.titel}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Werksoort</Label>
            <Input value={werksoort} onChange={(e) => setWerksoort(e.target.value)} placeholder="bv. branddeuren, doorvoeringen" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Annuleren</Button>
          <Button onClick={opslaan} disabled={!pad || bezig} data-testid="beeldbank-upload-opslaan">
            {bezig ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Toevoegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CrmBeeldbank() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [bron, setBron] = useState("");
  const [fase, setFase] = useState("");
  const [gebouwId, setGebouwId] = useState("");
  const [zoek, setZoek] = useState("");
  const [limit, setLimit] = useState(60);
  const [selectie, setSelectie] = useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = useState(false);
  const [zipBezig, setZipBezig] = useState(false);

  const params = useMemo(() => ({
    ...(bron ? { bron: bron as "spot" | "opname" | "inspectie" | "upload" } : {}),
    ...(fase ? { fase } : {}),
    ...(gebouwId ? { gebouw_id: Number(gebouwId) } : {}),
    ...(zoek.trim() ? { zoek: zoek.trim() } : {}),
    limit,
  }), [bron, fase, gebouwId, zoek, limit]);

  const { data, isLoading } = useListBeeldbankFotos(params);
  const { data: gebouwen } = useListGebouwen();
  const fotos = data?.fotos ?? [];

  const wissel = (f: BeeldbankFoto) => {
    const sleutel = fotoSleutel(f);
    setSelectie((huidig) => {
      const nieuw = new Set(huidig);
      if (nieuw.has(sleutel)) nieuw.delete(sleutel); else nieuw.add(sleutel);
      return nieuw;
    });
  };

  const downloadZip = async () => {
    const items = fotos.filter((f) => selectie.has(fotoSleutel(f)))
      .map((f) => ({ bron: f.bron, bron_id: f.bron_id, volgnummer: f.volgnummer }));
    if (items.length === 0) return;
    setZipBezig(true);
    try {
      const resp = await fetch("/api/beeldbank/download", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!resp.ok) throw new Error(String(resp.status));
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "beeldbank.zip"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ variant: "destructive", title: "Download mislukt" });
    } finally { setZipBezig(false); }
  };

  return (
    <div className="space-y-4 p-4 md:p-6" data-testid="pagina-beeldbank">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 data-paginatitel className="text-xl font-semibold">Beeldbank</h1>
          <p className="text-sm text-muted-foreground">
            Echt beeld van eigen werk: spot-, opname- en inspectiefoto's plus handmatige uploads.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setUploadOpen(true)} data-testid="beeldbank-upload-knop">
            <Upload className="mr-1 h-4 w-4" />Uploaden
          </Button>
          <Button onClick={downloadZip} disabled={selectie.size === 0 || zipBezig} data-testid="beeldbank-download-knop">
            {zipBezig ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
            Download ({selectie.size})
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="w-56 pl-8" placeholder="Zoeken…" value={zoek} onChange={(e) => setZoek(e.target.value)}
            data-testid="beeldbank-zoek" />
        </div>
        <Select value={bron || "alle"} onValueChange={(v) => setBron(v === "alle" ? "" : v)}>
          <SelectTrigger className="w-44" data-testid="beeldbank-filter-bron"><SelectValue /></SelectTrigger>
          <SelectContent>{BRONNEN.map((b) => <SelectItem key={b.waarde || "alle"} value={b.waarde || "alle"}>{b.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={fase || "alle"} onValueChange={(v) => setFase(v === "alle" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{FASEN.map((f) => <SelectItem key={f.waarde || "alle"} value={f.waarde || "alle"}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={gebouwId || "alle"} onValueChange={(v) => setGebouwId(v === "alle" ? "" : v)}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Alle gebouwen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle gebouwen</SelectItem>
            {(gebouwen ?? []).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>)}
          </SelectContent>
        </Select>
        {data ? <span className="text-sm text-muted-foreground">{data.totaal} foto's</span> : null}
      </div>

      {/* Raster */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, n) => <Skeleton key={n} className="aspect-square" />)}
        </div>
      ) : fotos.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-sm text-muted-foreground">
          <ImageIcon className="h-8 w-8" />Geen foto's gevonden binnen je toegang en filters.
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {fotos.map((f) => {
              const sleutel = fotoSleutel(f);
              const geselecteerd = selectie.has(sleutel);
              return (
                <div key={sleutel} className={`group relative overflow-hidden rounded-md border ${geselecteerd ? "ring-2 ring-primary" : ""}`}
                  data-testid={`beeldbank-foto-${sleutel.replace(/:/g, "-")}`}>
                  <a href={f.url} target="_blank" rel="noreferrer">
                    <img src={f.url} alt={f.bijschrift ?? f.gebouw_naam ?? "Foto"} loading="lazy"
                      className="aspect-square w-full object-cover" />
                  </a>
                  <div className="absolute left-2 top-2">
                    <Checkbox checked={geselecteerd} onCheckedChange={() => wissel(f)} className="bg-background" />
                  </div>
                  <div className="space-y-0.5 p-2 text-xs">
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="px-1 py-0 text-[10px]">{f.bron}</Badge>
                      {f.fase ? <Badge variant="outline" className="px-1 py-0 text-[10px]">{f.fase}</Badge> : null}
                    </div>
                    <p className="truncate font-medium">{f.gebouw_naam ?? f.bijschrift ?? "—"}</p>
                    <p className="truncate text-muted-foreground">
                      {[f.werksoort, f.opdracht_titel, f.gemaakt_op?.slice(0, 10), f.gemaakt_door].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          {data && fotos.length < data.totaal ? (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setLimit((l) => l + 60)}>Meer laden</Button>
            </div>
          ) : null}
        </>
      )}

      <UploadDialoog open={uploadOpen} onClose={() => setUploadOpen(false)}
        onKlaar={() => queryClient.invalidateQueries({ queryKey: getListBeeldbankFotosQueryKey() })} />
    </div>
  );
}
