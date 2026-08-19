// Camera-telling (VOORRAADTELLING fase 2) — foto uploaden, vakken tekenen,
// AI telt per vak, mens bevestigt/corrigeert/verwerpt elk voorstel (fail-closed).
import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListVoorraadTellingVakken,
  useCreateVoorraadTellingVakken,
  useGetVoorraadTellingFotoUploadUrl,
  useDeleteVoorraadTellingVak,
  useBeslisVoorraadTellingVoorstel,
  getListVoorraadTellingVakkenQueryKey,
  getGetVoorraadTellingQueryKey,
  getGetVoorraadTellingVerschillenQueryKey,
  type VoorraadTellingVak,
  type VoorraadTellingVakVoorstel,
  type VoorraadTellingBronVak,
  type Artikel,
  type MagazijnLocatie,
} from "@workspace/api-client-react";
import { normaliseerStorageUrl } from "@/lib/storage-url";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Loader2, Trash2, CheckCircle2, XCircle, AlertCircle, Sparkles } from "lucide-react";

type TekenVak = {
  key: number;
  aanduiding: string;
  locatieId: string; // "geen" of id
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
};

/** Foto met (één of meer) getekende kaders — fractiecoördinaten als percentages. */
export function FotoMetKader({ fotoPad, vakken, klasse }: {
  fotoPad: string;
  vakken: Array<{ x: number; y: number; breedte: number; hoogte: number; aanduiding?: string }>;
  klasse?: string;
}) {
  return (
    <div className={`relative inline-block max-w-full ${klasse ?? ""}`}>
      <img src={normaliseerStorageUrl(fotoPad)} alt="Tellingfoto" className="max-w-full rounded-md border" />
      {vakken.map((v, i) => (
        <div
          key={i}
          className="absolute border-2 border-primary bg-primary/10"
          style={{
            left: `${v.x * 100}%`,
            top: `${v.y * 100}%`,
            width: `${v.breedte * 100}%`,
            height: `${v.hoogte * 100}%`,
          }}
        >
          {v.aanduiding && (
            <span className="absolute -top-0.5 left-0 -translate-y-full bg-primary text-primary-foreground text-[10px] font-medium px-1 py-0.5 rounded-sm whitespace-nowrap">
              {v.aanduiding}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Dialoogloze weergave van de bron-vakken van een tellingregel (ook ná vaststellen). */
export function RegelBronVakken({ bronVakken }: { bronVakken: VoorraadTellingBronVak[] }) {
  // Groepeer per foto zodat meerdere vakken op dezelfde foto samen tonen
  const perFoto = new Map<string, VoorraadTellingBronVak[]>();
  for (const v of bronVakken) {
    const lijst = perFoto.get(v.foto_pad) ?? [];
    lijst.push(v);
    perFoto.set(v.foto_pad, lijst);
  }
  return (
    <div className="space-y-3">
      {[...perFoto.entries()].map(([pad, vakken]) => (
        <FotoMetKader key={pad} fotoPad={pad} vakken={vakken} />
      ))}
    </div>
  );
}

function zekerheidBadge(z: number) {
  const pct = Math.round(z * 100);
  if (z >= 0.8) return <Badge variant="secondary" className="text-muted-foreground">{pct}% zeker</Badge>;
  if (z >= 0.5) return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{pct}% zeker</Badge>;
  return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">{pct}% zeker</Badge>;
}

function VoorstelRij({ tellingId, vak, voorstel, artikelen, onBeslist }: {
  tellingId: number;
  vak: VoorraadTellingVak;
  voorstel: VoorraadTellingVakVoorstel;
  artikelen: Artikel[];
  onBeslist: () => void;
}) {
  const [artikelId, setArtikelId] = useState(voorstel.artikel_id != null ? String(voorstel.artikel_id) : "");
  const [aantal, setAantal] = useState(String(voorstel.aantal));
  const [fout, setFout] = useState<string | null>(null);
  const beslis = useBeslisVoorraadTellingVoorstel({
    mutation: {
      onSuccess: onBeslist,
      onError: (e: unknown) => {
        const err = e as { data?: { error?: string } };
        setFout(err?.data?.error ?? "Beslissen mislukt.");
      },
    },
  });

  const doe = (actie: "bevestig" | "verwerp") => {
    setFout(null);
    beslis.mutate({
      id: tellingId,
      vakId: vak.id,
      voorstelId: voorstel.id,
      data: actie === "verwerp"
        ? { actie }
        : {
            actie,
            artikel_id: artikelId ? Number(artikelId) : null,
            aantal: aantal === "" ? null : Number(aantal),
          },
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-3 px-3 py-2.5 border-t first:border-t-0">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-muted-foreground">{vak.aanduiding}</Badge>
          {zekerheidBadge(voorstel.zekerheid)}
          {voorstel.artikel_id == null && (
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
              <Sparkles className="h-3 w-3 mr-1" />Geen artikel herkend
            </Badge>
          )}
        </div>
        {voorstel.waargenomen && (
          <p className="text-xs text-muted-foreground">Waargenomen: {voorstel.waargenomen}</p>
        )}
        {fout && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{fout}</p>}
      </div>
      <div className="space-y-1 min-w-52">
        <Label className="text-xs">Artikel</Label>
        <Select value={artikelId} onValueChange={setArtikelId}>
          <SelectTrigger className="h-8"><SelectValue placeholder="Kies artikel" /></SelectTrigger>
          <SelectContent>
            {artikelen.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>{a.naam}{a.code ? ` (${a.code})` : ""}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Aantal</Label>
        <Input type="number" min={0} step="0.01" value={aantal} onChange={(e) => setAantal(e.target.value)} className="h-8 w-24" />
      </div>
      <div className="flex items-center gap-1.5">
        <Button size="sm" className="h-8" onClick={() => doe("bevestig")} disabled={beslis.isPending || !artikelId}>
          {beslis.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
          Bevestigen
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={() => doe("verwerp")} disabled={beslis.isPending}>
          <XCircle className="h-4 w-4 mr-1" />Verwerpen
        </Button>
      </div>
    </div>
  );
}

export function TellingCamera({ tellingId, artikelen, locaties }: {
  tellingId: number;
  artikelen: Artikel[];
  locaties: MagazijnLocatie[];
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const beeldRef = useRef<HTMLDivElement>(null);

  const [fotoPad, setFotoPad] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [vakken, setVakken] = useState<TekenVak[]>([]);
  const [tekenStart, setTekenStart] = useState<{ x: number; y: number } | null>(null);
  const [tekenNu, setTekenNu] = useState<{ x: number; y: number } | null>(null);

  const { data: opgeslagenVakken = [] } = useListVoorraadTellingVakken(tellingId);
  const uploadUrl = useGetVoorraadTellingFotoUploadUrl();
  const maakVakken = useCreateVoorraadTellingVakken();
  const verwijderVak = useDeleteVoorraadTellingVak();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListVoorraadTellingVakkenQueryKey(tellingId) });
    queryClient.invalidateQueries({ queryKey: getGetVoorraadTellingQueryKey(tellingId) });
    queryClient.invalidateQueries({ queryKey: getGetVoorraadTellingVerschillenQueryKey(tellingId) });
  };

  // Nakijklijst: vakken met openstaande voorstellen, laagste zekerheid bovenaan
  const nakijk = useMemo(() => {
    const open: Array<{ vak: VoorraadTellingVak; voorstel: VoorraadTellingVakVoorstel }> = [];
    for (const vak of opgeslagenVakken) {
      for (const v of vak.voorstellen) {
        if (v.status === "voorstel") open.push({ vak, voorstel: v });
      }
    }
    open.sort((a, b) => a.voorstel.zekerheid - b.voorstel.zekerheid);
    return open;
  }, [opgeslagenVakken]);

  const afgehandeld = useMemo(
    () => opgeslagenVakken.flatMap((vak) => vak.voorstellen.filter((v) => v.status !== "voorstel").map((voorstel) => ({ vak, voorstel }))),
    [opgeslagenVakken],
  );
  const legeVakken = useMemo(
    () => opgeslagenVakken.filter((v) => v.status !== "analyseren" && v.voorstellen.length === 0),
    [opgeslagenVakken],
  );

  async function handleFotoSelectie(e: React.ChangeEvent<HTMLInputElement>) {
    const bestand = e.target.files?.[0];
    if (!bestand) return;
    setFout(null);
    setBezig(true);
    try {
      const urlData = await uploadUrl.mutateAsync({ id: tellingId });
      const resp = await fetch(urlData.upload_url, {
        method: "PUT",
        headers: { "Content-Type": bestand.type || "image/jpeg" },
        body: bestand,
      });
      if (!resp.ok) throw new Error("Foto uploaden mislukt");
      setFotoPad(urlData.object_path);
      setPreviewUrl(URL.createObjectURL(bestand));
      setVakken([]);
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Er is een fout opgetreden");
    } finally {
      setBezig(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function relPos(e: React.PointerEvent): { x: number; y: number } | null {
    const el = beeldRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  function pointerDown(e: React.PointerEvent) {
    const p = relPos(e);
    if (!p) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setTekenStart(p);
    setTekenNu(p);
  }
  function pointerMove(e: React.PointerEvent) {
    if (!tekenStart) return;
    setTekenNu(relPos(e));
  }
  function pointerUp() {
    if (tekenStart && tekenNu) {
      const x = Math.min(tekenStart.x, tekenNu.x);
      const y = Math.min(tekenStart.y, tekenNu.y);
      const breedte = Math.abs(tekenNu.x - tekenStart.x);
      const hoogte = Math.abs(tekenNu.y - tekenStart.y);
      if (breedte > 0.02 && hoogte > 0.02) {
        setVakken((prev) => [...prev, {
          key: Date.now(),
          aanduiding: `Vak ${prev.length + 1}`,
          locatieId: "geen",
          x, y, breedte, hoogte,
        }]);
      }
    }
    setTekenStart(null);
    setTekenNu(null);
  }

  async function analyseer() {
    if (!fotoPad || vakken.length === 0) return;
    setFout(null);
    try {
      await maakVakken.mutateAsync({
        id: tellingId,
        data: {
          foto_pad: fotoPad,
          vakken: vakken.map((v) => ({
            aanduiding: v.aanduiding.trim() || "Vak",
            locatie_id: v.locatieId !== "geen" ? Number(v.locatieId) : null,
            x: Number(v.x.toFixed(4)),
            y: Number(v.y.toFixed(4)),
            breedte: Number(v.breedte.toFixed(4)),
            hoogte: Number(v.hoogte.toFixed(4)),
          })),
        },
      });
      setFotoPad(null);
      setPreviewUrl(null);
      setVakken([]);
      invalidate();
    } catch (e: unknown) {
      const err = e as { data?: { error?: string } };
      setFout(err?.data?.error ?? "Analyseren mislukt.");
    }
  }

  const voorbeeldRect = tekenStart && tekenNu ? {
    x: Math.min(tekenStart.x, tekenNu.x),
    y: Math.min(tekenStart.y, tekenNu.y),
    breedte: Math.abs(tekenNu.x - tekenStart.x),
    hoogte: Math.abs(tekenNu.y - tekenStart.y),
  } : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary" />
            Camera-telling
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Maak of upload een foto van een stelling, teken vakken om de planken en laat de AI per vak tellen.
            Elk voorstel bevestig, corrigeer of verwerp je zelf — pas dan telt het mee.
            Werkt het best voor nette planken; rommelige plekken tel je handmatig.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {fout && <p className="text-sm text-destructive flex items-center gap-1"><AlertCircle className="h-4 w-4" />{fout}</p>}

          {!fotoPad ? (
            <>
              <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFotoSelectie} />
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={bezig}>
                {bezig ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
                Foto maken of uploaden
              </Button>
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Teken met muis of vinger één of meer rechthoeken op de foto (bijv. per plank).
              </p>
              <div
                ref={beeldRef}
                className="relative inline-block max-w-full select-none touch-none cursor-crosshair"
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
              >
                <img src={previewUrl ?? normaliseerStorageUrl(fotoPad)} alt="Stellingfoto" className="max-w-full rounded-md border pointer-events-none" draggable={false} />
                {vakken.map((v, i) => (
                  <div key={v.key} className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
                    style={{ left: `${v.x * 100}%`, top: `${v.y * 100}%`, width: `${v.breedte * 100}%`, height: `${v.hoogte * 100}%` }}>
                    <span className="absolute -top-0.5 left-0 -translate-y-full bg-primary text-primary-foreground text-[10px] font-medium px-1 py-0.5 rounded-sm whitespace-nowrap">
                      {v.aanduiding || `Vak ${i + 1}`}
                    </span>
                  </div>
                ))}
                {voorbeeldRect && (
                  <div className="absolute border-2 border-dashed border-primary/70 bg-primary/5 pointer-events-none"
                    style={{ left: `${voorbeeldRect.x * 100}%`, top: `${voorbeeldRect.y * 100}%`, width: `${voorbeeldRect.breedte * 100}%`, height: `${voorbeeldRect.hoogte * 100}%` }} />
                )}
              </div>

              {vakken.length > 0 && (
                <div className="space-y-2">
                  {vakken.map((v, i) => (
                    <div key={v.key} className="flex items-end gap-3 flex-wrap">
                      <div className="space-y-1">
                        <Label className="text-xs">Aanduiding vak {i + 1}</Label>
                        <Input value={v.aanduiding} onChange={(e) => setVakken((prev) => prev.map((p) => p.key === v.key ? { ...p, aanduiding: e.target.value } : p))} className="h-8 w-44" placeholder="bijv. plank 1 / A-03" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Locatie (optioneel)</Label>
                        <Select value={v.locatieId} onValueChange={(val) => setVakken((prev) => prev.map((p) => p.key === v.key ? { ...p, locatieId: val } : p))}>
                          <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="geen">Geen locatie</SelectItem>
                            {locaties.map((l) => (
                              <SelectItem key={l.id} value={String(l.id)}>{l.naam}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => setVakken((prev) => prev.filter((p) => p.key !== v.key))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button onClick={analyseer} disabled={vakken.length === 0 || maakVakken.isPending}>
                  {maakVakken.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                  {maakVakken.isPending ? "AI telt per vak..." : `${vakken.length} vak(ken) laten tellen`}
                </Button>
                <Button variant="ghost" onClick={() => { setFotoPad(null); setPreviewUrl(null); setVakken([]); }} disabled={maakVakken.isPending}>
                  Annuleren
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {(nakijk.length > 0 || legeVakken.length > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Nakijklijst ({nakijk.length})</CardTitle>
            <p className="text-sm text-muted-foreground">Laagste zekerheid bovenaan. Een voorstel telt pas mee nadat jij het bevestigt.</p>
          </CardHeader>
          <CardContent className="p-0">
            {nakijk.map(({ vak, voorstel }) => (
              <VoorstelRij key={`${vak.id}-${voorstel.id}`} tellingId={tellingId} vak={vak} voorstel={voorstel} artikelen={artikelen} onBeslist={invalidate} />
            ))}
            {legeVakken.map((vak) => (
              <div key={vak.id} className="flex items-center justify-between gap-3 px-3 py-2.5 border-t first:border-t-0">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Badge variant="outline" className="text-muted-foreground">{vak.aanduiding}</Badge>
                  {vak.status === "analysefout"
                    ? "AI-telling mislukt voor dit vak — tel het handmatig of probeer opnieuw."
                    : "Geen artikelen herkend in dit vak."}
                </p>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground"
                  onClick={() => verwijderVak.mutate({ id: tellingId, vakId: vak.id }, { onSuccess: invalidate })}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {afgehandeld.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Beoordeelde voorstellen</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {afgehandeld.map(({ vak, voorstel }) => (
              <div key={`${vak.id}-${voorstel.id}`} className="flex items-center gap-2 px-3 py-2 border-t first:border-t-0 text-sm">
                <Badge variant="outline" className="text-muted-foreground shrink-0">{vak.aanduiding}</Badge>
                <span className="flex-1 min-w-0 truncate">
                  {voorstel.artikel_naam ?? voorstel.waargenomen} — {voorstel.aantal} {voorstel.eenheid ?? "st"}
                </span>
                {voorstel.status === "bevestigd" ? (
                  <Badge variant="secondary" className="text-muted-foreground"><CheckCircle2 className="h-3 w-3 mr-1" />Bevestigd</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground"><XCircle className="h-3 w-3 mr-1" />Verworpen</Badge>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
