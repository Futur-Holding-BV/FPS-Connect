import React, { useState, useCallback, useRef, useMemo } from "react";
import {
  usePlakAnalyseCalculatie,
  useCalcPlakVeldCorrectie,
  useCreateModCalcRegel,
  useListModCalcNormtijden,
  type CalcPlakAnalyse,
  type CalcPlakProduct,
  type CalcPlakNormtijd,
  type ModCalcNormtijd,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sparkles, Clipboard, X, Upload, CheckCircle2, AlertTriangle, Plus,
  Loader2, Search, PackagePlus, RefreshCw, ImageIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Hulpjes ─────────────────────────────────────────────────────────────────

function fmtBedrag(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
}

function fmtGetal(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 3 }).format(n);
}

// AI-geel voor voorgestelde velden
const AI_VELD =
  "border-amber-200 bg-amber-50 focus-visible:ring-amber-400 focus-visible:border-amber-400";

// Draft per product (bewerkbare voorgestelde velden vóór overnemen)
type ProductDraft = {
  omschrijving: string;
  hoeveelheid: string;
  eenheid: string;
  tarief: string;
  // Gekozen normtijd (alleen_artikel): id + uren, waarde komt UIT de normtijdrij
  gekozenNormtijdId: number | null;
};

// ─── Component ───────────────────────────────────────────────────────────────

export function PlakInvoer({
  calculatieId,
  onOvergenomen,
}: {
  calculatieId: number;
  onOvergenomen: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Invoervelden
  const [tekst, setTekst] = useState("");
  const [bestand, setBestand] = useState<File | null>(null);
  const [bestandUrl, setBestandUrl] = useState<string | null>(null);
  const [lengte, setLengte] = useState("");
  const [hoogte, setHoogte] = useState("");
  const [bijzonderheden, setBijzonderheden] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resultaat
  const [analyse, setAnalyse] = useState<CalcPlakAnalyse | null>(null);
  const [drafts, setDrafts] = useState<Record<number, ProductDraft>>({});
  // Bijgehouden: welke producten al zijn overgenomen / artikel aangelegd
  const [overgenomen, setOvergenomen] = useState<Record<number, boolean>>({});
  const [artikelAangelegd, setArtikelAangelegd] = useState<Record<number, boolean>>({});
  // Mini-formulier "nieuw artikel" open per productindex
  const [nieuwArtikelOpen, setNieuwArtikelOpen] = useState<number | null>(null);

  // Hooks
  const analyseMut = usePlakAnalyseCalculatie();
  const createRegelMut = useCreateModCalcRegel();
  const veldCorrectieMut = useCalcPlakVeldCorrectie();
  const { data: alleNormtijden = [] } = useListModCalcNormtijden({
    query: { queryKey: ["mod-calc-normtijden"] },
  });

  const bezig = analyseMut.isPending;

  // ── Invoer resetten ──
  const resetInvoer = useCallback(() => {
    setTekst("");
    setBestand(null);
    if (bestandUrl) URL.revokeObjectURL(bestandUrl);
    setBestandUrl(null);
    setLengte("");
    setHoogte("");
    setBijzonderheden("");
    setAnalyse(null);
    setDrafts({});
    setOvergenomen({});
    setArtikelAangelegd({});
    setNieuwArtikelOpen(null);
  }, [bestandUrl]);

  const kiesBestand = useCallback((f: File | null) => {
    if (bestandUrl) URL.revokeObjectURL(bestandUrl);
    setBestand(f);
    if (f && f.type.startsWith("image/")) {
      setBestandUrl(URL.createObjectURL(f));
    } else {
      setBestandUrl(null);
    }
  }, [bestandUrl]);

  // ── Plakken van afbeelding in de Textarea ──
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) {
          e.preventDefault();
          kiesBestand(f);
          return;
        }
      }
    }
  }, [kiesBestand]);

  // ── Analyse starten ──
  const startAnalyse = useCallback(() => {
    if (!tekst.trim() && !bestand) {
      toast({ title: "Plak eerst tekst of een afbeelding", variant: "destructive" });
      return;
    }
    analyseMut.mutate(
      {
        id: calculatieId,
        data: {
          bestand: bestand ?? undefined,
          tekst: tekst.trim() || undefined,
          lengte: lengte ? parseFloat(lengte) : undefined,
          hoogte: hoogte ? parseFloat(hoogte) : undefined,
          bijzonderheden: bijzonderheden.trim() || undefined,
        },
      },
      {
        onSuccess: (res) => {
          setAnalyse(res);
          // Initialiseer drafts per product uit de conceptregel/herkend
          const nieuweDrafts: Record<number, ProductDraft> = {};
          res.producten.forEach((p, i) => {
            const cr = p.conceptregel;
            nieuweDrafts[i] = {
              omschrijving: cr?.omschrijving ?? p.herkend.aanduiding ?? "",
              hoeveelheid: cr?.hoeveelheid != null
                ? String(cr.hoeveelheid)
                : p.herkend.hoeveelheid != null ? String(p.herkend.hoeveelheid) : "1",
              eenheid: cr?.eenheid ?? p.herkend.eenheid ?? "st",
              tarief: cr?.tarief != null ? String(cr.tarief) : "",
              gekozenNormtijdId: cr?.normtijd_id ?? null,
            };
          });
          setDrafts(nieuweDrafts);
          setOvergenomen({});
          setArtikelAangelegd({});
        },
        onError: () => {
          toast({ title: "Herkennen mislukt", description: "Probeer het opnieuw.", variant: "destructive" });
        },
      },
    );
  }, [tekst, bestand, lengte, hoogte, bijzonderheden, calculatieId, analyseMut, toast]);

  // ── Correctie-registratie (fire-and-forget, §3.4/§8.8) ──
  const logCorrectie = useCallback(
    (veld: string, aiVoorstel: string, gekozen: string, fragment: string | null | undefined) => {
      if (aiVoorstel === gekozen) return;
      veldCorrectieMut.mutate(
        {
          data: {
            veld_naam: `calc_plak.${veld}`,
            ai_voorstel: aiVoorstel,
            gekozen,
            tekst_fragment: fragment ?? undefined,
          },
        },
        {
          onError: (err) => {
            // Niet blokkerend
            console.warn("veld-correctie loggen mislukt", err);
          },
        },
      );
    },
    [veldCorrectieMut],
  );

  const setDraft = useCallback((i: number, patch: Partial<ProductDraft>) => {
    setDrafts((d) => ({ ...d, [i]: { ...d[i], ...patch } }));
  }, []);

  // ── Nieuw artikel aanleggen in de calculatie-catalogus (mod_calc_artikelen).
  //    Endpoint zit niet in de gegenereerde client → directe fetch (schrijvenCalc).
  //    ZONDER prijs (§3.5). Werpt bij fout zodat de aanroeper kan afhandelen. ──
  const aanleggenArtikel = useCallback(
    async (body: {
      artikelcode?: string;
      omschrijving: string;
      eenheid?: string;
      categorie?: string;
    }) => {
      const res = await fetch("/api/modules/calculaties/artikelen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Artikel aanleggen mislukt (${res.status})`);
      // Zodat het bij heranalyse vindbaar is in de catalogus.
      queryClient.invalidateQueries({ queryKey: ["mod-calc-artikelen"] });
    },
    [queryClient],
  );

  // ── Overnemen (§3.4) ──
  const overnemen = useCallback(
    (i: number, p: CalcPlakProduct) => {
      const d = drafts[i];
      if (!d) return;
      const cr = p.conceptregel;
      const fragment = p.herkend.aanduiding ?? null;

      // Correctie-registratie: vergelijk draft met oorspronkelijk AI-voorstel
      const origOmschrijving = cr?.omschrijving ?? p.herkend.aanduiding ?? "";
      const origHoeveelheid = cr?.hoeveelheid != null ? String(cr.hoeveelheid)
        : p.herkend.hoeveelheid != null ? String(p.herkend.hoeveelheid) : "1";
      const origEenheid = cr?.eenheid ?? p.herkend.eenheid ?? "st";
      const origTarief = cr?.tarief != null ? String(cr.tarief) : "";
      const origNormtijdId = cr?.normtijd_id ?? null;

      logCorrectie("omschrijving", origOmschrijving, d.omschrijving, fragment);
      logCorrectie("hoeveelheid", origHoeveelheid, d.hoeveelheid, fragment);
      logCorrectie("eenheid", origEenheid, d.eenheid, fragment);
      logCorrectie("tarief", origTarief, d.tarief, fragment);
      if (p.uitkomst === "alleen_artikel" && d.gekozenNormtijdId !== origNormtijdId) {
        logCorrectie(
          "normtijd",
          origNormtijdId != null ? String(origNormtijdId) : "",
          d.gekozenNormtijdId != null ? String(d.gekozenNormtijdId) : "",
          fragment,
        );
      }

      // ── mu_per_eenheid: UITSLUITEND uit een gekoppelde/gekozen normtijd. Nooit een stille 0. ──
      let muPerEenheid: number | null = null;
      let normtijdIdUit: number | null = cr?.normtijd_id ?? null;
      if (p.uitkomst === "alleen_artikel") {
        // Arbeid ontbrak: alleen na een geldige normtijd-keuze mag mu meegestuurd worden.
        const nt =
          (p.normtijd_kandidaten ?? []).find((n) => n.id === d.gekozenNormtijdId) ??
          alleNormtijden.find((n) => n.id === d.gekozenNormtijdId);
        if (d.gekozenNormtijdId == null || !nt) {
          // Knop is dan disabled; hier extra vangnet — nooit 0 verzinnen.
          toast({ title: "Kies eerst een normtijd", variant: "destructive" });
          return;
        }
        muPerEenheid = nt.uren_per_eenheid;
        normtijdIdUit = nt.id;
      } else if (cr?.mu_per_eenheid != null) {
        muPerEenheid = cr.mu_per_eenheid;
      }

      // ── Tarief: nooit automatisch 0. Bij ontbrekende materiaalprijs moet de calculator
      //    zelf bewust een waarde hebben getypt (leeg = niet toegestaan). ──
      let tariefWaarde: number | null = null;
      if (cr?.tarief != null) {
        tariefWaarde = cr.tarief;
      }
      if (d.tarief.trim() !== "") {
        const parsed = parseFloat(d.tarief);
        if (!Number.isNaN(parsed)) tariefWaarde = parsed;
      }
      if (tariefWaarde == null) {
        // alleen_normtijd zonder ingevuld tarief — knop is disabled; vangnet.
        toast({ title: "Vul eerst een materiaaltarief in", variant: "destructive" });
        return;
      }

      // arbeids_tarief: alleen meesturen als de server hem gaf; anders weglaten.
      const regelData: Record<string, unknown> = {
        categorie: cr?.categorie ?? "materiaal",
        omschrijving: d.omschrijving,
        eenheid: d.eenheid,
        hoeveelheid: parseFloat(d.hoeveelheid) || 0,
        tarief: tariefWaarde,
        hoofdstuk: cr?.hoofdstuk ?? "Overige werkzaamheden",
        normtijd_id: normtijdIdUit,
      };
      if (muPerEenheid != null) regelData.mu_per_eenheid = muPerEenheid;
      if (!cr?.arbeids_tarief_ontbreekt && cr?.arbeids_tarief != null) {
        regelData.arbeids_tarief = cr.arbeids_tarief;
      }

      createRegelMut.mutate(
        {
          id: calculatieId,
          data: regelData as any,
        },
        {
          onSuccess: () => {
            setOvergenomen((o) => ({ ...o, [i]: true }));
            onOvergenomen();
            toast({ title: "Regel toegevoegd" });
          },
          onError: () => toast({ title: "Overnemen mislukt", variant: "destructive" }),
        },
      );
    },
    [drafts, calculatieId, alleNormtijden, createRegelMut, logCorrectie, onOvergenomen, toast],
  );

  return (
    <>
      {/* Knop naast de bestaande AI-voorstel-knop */}
      <Button
        variant="outline"
        className="w-full mt-2"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <Clipboard className="h-3.5 w-3.5 mr-1.5" />
        Plakken van leverancier
      </Button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) resetInvoer();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clipboard className="h-5 w-5 text-amber-500" />
              Plakken van leverancier
            </DialogTitle>
            <DialogDescription>
              Plak een productbeschrijving, schermafdruk of productblad. De AI herkent het product
              en stelt calculatieregels voor. Niets wordt automatisch opgeslagen — u kiest wat u overneemt.
            </DialogDescription>
          </DialogHeader>

          {/* ── Invoer ── */}
          {!analyse && (
            <div className="space-y-4">
              <div>
                <Label className="text-xs mb-1 block">Plak hier de productbeschrijving of een schermafdruk</Label>
                <Textarea
                  value={tekst}
                  onChange={(e) => setTekst(e.target.value)}
                  onPaste={handlePaste}
                  rows={6}
                  placeholder="Plak tekst van de leverancierssite, of plak (Ctrl+V) een schermafdruk…"
                  disabled={bezig}
                />
              </div>

              {/* Thumbnail van geplakte/gekozen afbeelding */}
              {bestand && (
                <div className="flex items-center gap-3 rounded-md border bg-muted/30 p-2">
                  {bestandUrl ? (
                    <img
                      src={bestandUrl}
                      alt="Geplakte afbeelding"
                      className="h-16 w-16 rounded object-cover border"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded border bg-background flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{bestand.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(bestand.size / 1024).toFixed(0)} kB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => kiesBestand(null)}
                    disabled={bezig}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => kiesBestand(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={bezig}
                  >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Bestand kiezen (pdf/afbeelding)
                  </Button>
                </div>
                <div className="w-28">
                  <Label className="text-xs mb-1 block">Lengte (m)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={lengte}
                    onChange={(e) => setLengte(e.target.value)}
                    placeholder="optioneel"
                    disabled={bezig}
                  />
                </div>
                <div className="w-28">
                  <Label className="text-xs mb-1 block">Hoogte (m)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={hoogte}
                    onChange={(e) => setHoogte(e.target.value)}
                    placeholder="optioneel"
                    disabled={bezig}
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs mb-1 block">Bijzonderheden</Label>
                <Textarea
                  value={bijzonderheden}
                  onChange={(e) => setBijzonderheden(e.target.value)}
                  rows={2}
                  placeholder="Vrije notities (bijv. brandwerendheid, montagesituatie)…"
                  disabled={bezig}
                />
              </div>

              <div className="flex items-center justify-between">
                {bezig ? (
                  <p className="text-xs text-amber-700 flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Bezig met herkennen en koppelen — dit kan 10 tot 30 seconden duren…
                  </p>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Ten minste tekst of een bestand is nodig.
                  </span>
                )}
                <Button onClick={startAnalyse} disabled={bezig}>
                  {bezig ? (
                    <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Bezig…</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-1.5" /> Herken en koppel</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* ── Resultaat: voorstel ── */}
          {analyse && (
            <div className="space-y-4">
              <TellingBalk analyse={analyse} />

              <div className="space-y-3">
                {analyse.producten.map((p, i) => (
                  <ProductKaart
                    key={i}
                    index={i}
                    product={p}
                    draft={drafts[i]}
                    setDraft={(patch) => setDraft(i, patch)}
                    alleNormtijden={alleNormtijden}
                    overgenomen={!!overgenomen[i]}
                    artikelAangelegd={!!artikelAangelegd[i]}
                    nieuwArtikelOpen={nieuwArtikelOpen === i}
                    setNieuwArtikelOpen={(v) => setNieuwArtikelOpen(v ? i : null)}
                    onOvernemen={() => overnemen(i, p)}
                    overnemenBezig={createRegelMut.isPending}
                    onArtikelAangelegd={() => setArtikelAangelegd((a) => ({ ...a, [i]: true }))}
                    aanleggenArtikel={aanleggenArtikel}
                    onOpnieuwKoppelen={startAnalyse}
                  />
                ))}
              </div>

              <div className="flex items-center justify-between border-t pt-3">
                <Button variant="outline" size="sm" onClick={resetInvoer}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Opnieuw plakken
                </Button>
                <Button variant="secondary" size="sm" onClick={() => { setOpen(false); resetInvoer(); }}>
                  Sluiten
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Telling ────────────────────────────────────────────────────────────────

function TellingBalk({ analyse }: { analyse: CalcPlakAnalyse }) {
  const t = analyse.telling;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 border p-2 text-xs">
      <Badge variant="outline">Herkend: {t.herkend}</Badge>
      <Badge className="bg-green-100 text-green-800 border-green-200">Volledig: {t.gekoppeld_beide}</Badge>
      <Badge className="bg-amber-100 text-amber-800 border-amber-200">Alleen artikel: {t.alleen_artikel}</Badge>
      <Badge className="bg-amber-100 text-amber-800 border-amber-200">Alleen normtijd: {t.alleen_normtijd}</Badge>
      <Badge className="bg-muted text-muted-foreground">Ongekoppeld: {t.ongekoppeld}</Badge>
    </div>
  );
}

// ─── AMBER-markering ──────────────────────────────────────────────────────────

function AmberMelding({ tekst }: { tekst: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-xs text-amber-800">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
      <span>{tekst}</span>
    </div>
  );
}

// ─── Productkaart ─────────────────────────────────────────────────────────────

function ProductKaart({
  index,
  product,
  draft,
  setDraft,
  alleNormtijden,
  overgenomen,
  artikelAangelegd,
  nieuwArtikelOpen,
  setNieuwArtikelOpen,
  onOvernemen,
  overnemenBezig,
  onArtikelAangelegd,
  aanleggenArtikel,
  onOpnieuwKoppelen,
}: {
  index: number;
  product: CalcPlakProduct;
  draft: ProductDraft | undefined;
  setDraft: (patch: Partial<ProductDraft>) => void;
  alleNormtijden: ModCalcNormtijd[];
  overgenomen: boolean;
  artikelAangelegd: boolean;
  nieuwArtikelOpen: boolean;
  setNieuwArtikelOpen: (v: boolean) => void;
  onOvernemen: () => void;
  overnemenBezig: boolean;
  onArtikelAangelegd: () => void;
  aanleggenArtikel: (body: { artikelcode?: string; omschrijving: string; eenheid?: string; categorie?: string }) => Promise<void>;
  onOpnieuwKoppelen: () => void;
}) {
  const { toast } = useToast();
  const h = product.herkend;
  const cr = product.conceptregel;

  const titel = [h.fabrikant, h.aanduiding].filter(Boolean).join(" ") || h.soort || "Onbekend product";

  // Mag deze regel overgenomen worden? Nooit stille nullen toestaan (§3.3).
  const gekozenNormtijdGeldig =
    draft?.gekozenNormtijdId != null &&
    ((product.normtijd_kandidaten ?? []).some((n) => n.id === draft.gekozenNormtijdId) ||
      alleNormtijden.some((n) => n.id === draft.gekozenNormtijdId));
  const tariefIngevuld = !!draft && draft.tarief.trim() !== "" && !Number.isNaN(parseFloat(draft.tarief));
  const kanOvernemen =
    !!draft &&
    (product.uitkomst === "alleen_artikel"
      ? gekozenNormtijdGeldig // arbeid ontbreekt → verplicht normtijd; mu komt uit die rij
      : product.uitkomst === "alleen_normtijd"
        ? tariefIngevuld // materiaalprijs ontbreekt → calculator moet bewust een tarief typen
        : true); // volledig

  const uitkomstBadge = {
    volledig: <Badge className="bg-green-100 text-green-800 border-green-200">Volledig gekoppeld</Badge>,
    alleen_artikel: <Badge className="bg-amber-100 text-amber-800 border-amber-200">Alleen artikel</Badge>,
    alleen_normtijd: <Badge className="bg-amber-100 text-amber-800 border-amber-200">Alleen normtijd</Badge>,
    ongekoppeld: <Badge className="bg-muted text-muted-foreground">Ongekoppeld</Badge>,
  }[product.uitkomst];

  if (overgenomen) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <span className="text-sm text-green-800">
          <span className="font-medium">{titel}</span> — regel toegevoegd aan de calculatie.
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-3 space-y-3">
      {/* Kop */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Sparkles className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="font-semibold text-sm">{titel}</span>
            {uitkomstBadge}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {[h.soort, h.eigenschappen].filter(Boolean).join(" · ")}
          </p>
          <p className="text-xs text-muted-foreground">
            Hoeveelheid: <span className="tabular-nums">{fmtGetal(h.hoeveelheid)}</span> {h.eenheid}
            {h.hoeveelheid_toelichting ? ` — ${h.hoeveelheid_toelichting}` : ""}
          </p>
        </div>
      </div>

      {/* Per uitkomst */}
      {product.uitkomst === "ongekoppeld" ? (
        <OngekoppeldBlok
          product={product}
          nieuwArtikelOpen={nieuwArtikelOpen}
          setNieuwArtikelOpen={setNieuwArtikelOpen}
          artikelAangelegd={artikelAangelegd}
          onArtikelAangelegd={onArtikelAangelegd}
          aanleggenArtikel={aanleggenArtikel}
          onOpnieuwKoppelen={onOpnieuwKoppelen}
        />
      ) : (
        draft && (
          <>
            {/* Preview + bewerkbare velden */}
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Label className="text-[11px] text-muted-foreground mb-0.5 block">Omschrijving</Label>
                <Input
                  value={draft.omschrijving}
                  onChange={(e) => setDraft({ omschrijving: e.target.value })}
                  className={cn("h-8 text-sm", AI_VELD)}
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground mb-0.5 block">Hoeveelheid</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={draft.hoeveelheid}
                  onChange={(e) => setDraft({ hoeveelheid: e.target.value })}
                  className={cn("h-8 text-sm", AI_VELD)}
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground mb-0.5 block">Eenheid</Label>
                <Input
                  value={draft.eenheid}
                  onChange={(e) => setDraft({ eenheid: e.target.value })}
                  className={cn("h-8 text-sm", AI_VELD)}
                />
              </div>

              {/* Materiaaltarief */}
              <div>
                <Label className="text-[11px] text-muted-foreground mb-0.5 block">
                  Materiaaltarief {product.uitkomst === "alleen_normtijd" && "(ontbreekt)"}
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={draft.tarief}
                  onChange={(e) => setDraft({ tarief: e.target.value })}
                  placeholder={product.uitkomst === "alleen_normtijd" ? "leeg — vul zelf in" : "0,00"}
                  className={cn(
                    "h-8 text-sm",
                    product.uitkomst === "alleen_normtijd" ? "border-amber-300 bg-amber-50" : AI_VELD,
                  )}
                />
              </div>

              {/* Normtijd (mu) — read-only weergave; komt uit normtijdrij */}
              <div>
                <Label className="text-[11px] text-muted-foreground mb-0.5 block">Normtijd (u/eenheid)</Label>
                <div className="h-8 flex items-center px-2 text-sm rounded-md border bg-muted/40 tabular-nums">
                  {product.uitkomst === "alleen_artikel"
                    ? (draft.gekozenNormtijdId != null
                        ? fmtGetal(
                            (product.normtijd_kandidaten ?? []).find((n) => n.id === draft.gekozenNormtijdId)?.uren_per_eenheid ??
                            alleNormtijden.find((n) => n.id === draft.gekozenNormtijdId)?.uren_per_eenheid,
                          )
                        : "— kies normtijd —")
                    : fmtGetal(cr?.mu_per_eenheid)}
                </div>
              </div>

              {/* Arbeidstarief preview */}
              <div>
                <Label className="text-[11px] text-muted-foreground mb-0.5 block">Arbeidstarief (€/u)</Label>
                <div className="h-8 flex items-center px-2 text-sm rounded-md border bg-muted/40 tabular-nums">
                  {cr?.arbeids_tarief_ontbreekt || cr?.arbeids_tarief == null
                    ? <span className="text-amber-700">ontbreekt</span>
                    : fmtBedrag(cr?.arbeids_tarief)}
                </div>
              </div>
            </div>

            {/* AMBER-markeringen per stand */}
            {product.uitkomst === "alleen_artikel" && (
              <AmberMelding tekst="Arbeid ontbreekt — kies een normtijd voordat u overneemt." />
            )}
            {product.uitkomst === "alleen_normtijd" && (
              <AmberMelding tekst="Materiaalprijs ontbreekt — laat leeg of vul zelf een tarief in vóór overnemen." />
            )}

            {/* Normtijd-keuze (verplicht bij alleen_artikel) */}
            {product.uitkomst === "alleen_artikel" && (
              <NormtijdKiezer
                kandidaten={product.normtijd_kandidaten ?? []}
                alleNormtijden={alleNormtijden}
                gekozenId={draft.gekozenNormtijdId}
                onKies={(id) => setDraft({ gekozenNormtijdId: id })}
              />
            )}

            {/* Overnemen */}
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={onOvernemen}
                disabled={overnemenBezig || !kanOvernemen}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Overnemen
              </Button>
            </div>
          </>
        )
      )}
    </div>
  );
}

// ─── Normtijd-kiezer (met zoeken in alle normtijden) ──────────────────────────

function NormtijdKiezer({
  kandidaten,
  alleNormtijden,
  gekozenId,
  onKies,
}: {
  kandidaten: CalcPlakNormtijd[];
  alleNormtijden: ModCalcNormtijd[];
  gekozenId: number | null;
  onKies: (id: number) => void;
}) {
  const [zoek, setZoek] = useState("");

  const zoekResultaat = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    if (!q) return [];
    return alleNormtijden
      .filter(
        (n) =>
          n.omschrijving.toLowerCase().includes(q) ||
          n.code.toLowerCase().includes(q) ||
          n.categorie.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [zoek, alleNormtijden]);

  return (
    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-2">
      <Label className="text-[11px] font-medium text-amber-800 block">
        Welke normtijd hoort erbij? (verplicht)
      </Label>

      {/* Kandidaten */}
      {kandidaten.length > 0 && (
        <div className="space-y-1">
          {kandidaten.map((n) => (
            <NormtijdRij key={n.id} id={n.id} code={n.code} omschrijving={n.omschrijving}
              eenheid={n.eenheid} uren={n.uren_per_eenheid} gekozen={gekozenId === n.id} onKies={onKies} />
          ))}
        </div>
      )}

      {/* Zoeken in alle normtijden */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          placeholder="Zoek in alle normtijden…"
          className="h-8 text-sm pl-7"
        />
      </div>
      {zoekResultaat.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {zoekResultaat.map((n) => (
            <NormtijdRij key={n.id} id={n.id} code={n.code} omschrijving={n.omschrijving}
              eenheid={n.eenheid} uren={n.uren_per_eenheid} gekozen={gekozenId === n.id} onKies={onKies} />
          ))}
        </div>
      )}
    </div>
  );
}

function NormtijdRij({
  id, code, omschrijving, eenheid, uren, gekozen, onKies,
}: {
  id: number; code: string; omschrijving: string; eenheid: string; uren: number;
  gekozen: boolean; onKies: (id: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onKies(id)}
      className={cn(
        "w-full text-left rounded border px-2 py-1.5 text-xs transition-colors flex items-center justify-between gap-2",
        gekozen ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/50",
      )}
    >
      <span className="min-w-0">
        <span className="font-medium">{code}</span>{" "}
        <span className="text-muted-foreground">{omschrijving}</span>
      </span>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {fmtGetal(uren)} u/{eenheid}
        {gekozen && <CheckCircle2 className="inline h-3.5 w-3.5 ml-1 text-primary" />}
      </span>
    </button>
  );
}

// ─── Ongekoppeld: nieuw artikel aanleggen ─────────────────────────────────────

function OngekoppeldBlok({
  product,
  nieuwArtikelOpen,
  setNieuwArtikelOpen,
  artikelAangelegd,
  onArtikelAangelegd,
  aanleggenArtikel,
  onOpnieuwKoppelen,
}: {
  product: CalcPlakProduct;
  nieuwArtikelOpen: boolean;
  setNieuwArtikelOpen: (v: boolean) => void;
  artikelAangelegd: boolean;
  onArtikelAangelegd: () => void;
  aanleggenArtikel: (body: { artikelcode?: string; omschrijving: string; eenheid?: string; categorie?: string }) => Promise<void>;
  onOpnieuwKoppelen: () => void;
}) {
  const { toast } = useToast();
  const v = product.artikel_voorstel;
  const h = product.herkend;

  // Leverancier tonen we als context — de calc-catalogus koppelt op leverancier_id,
  // niet op een vrije naam, dus we sturen hem niet mee (voorkomt stille dataverlies-illusie).
  const leverancier = v?.leverancier ?? h.fabrikant ?? "";
  const [artikelcode, setArtikelcode] = useState(v?.artikelcode ?? "");
  const [omschrijving, setOmschrijving] = useState(v?.omschrijving ?? h.aanduiding ?? "");
  const [eenheid, setEenheid] = useState(v?.eenheid ?? h.eenheid ?? "st");
  const [categorie, setCategorie] = useState(v?.categorie ?? "materiaal");
  const [bezig, setBezig] = useState(false);

  const aanleggen = async () => {
    if (bezig) return; // dubbele submit voorkomen
    setBezig(true);
    try {
      await aanleggenArtikel({
        artikelcode: artikelcode || undefined,
        omschrijving: omschrijving || (h.aanduiding ?? "Nieuw artikel"),
        eenheid: eenheid || undefined,
        categorie: categorie || undefined,
        // GEEN prijsvelden — §3.5
      });
      onArtikelAangelegd();
      setNieuwArtikelOpen(false);
      toast({ title: "Artikel aangelegd", description: "Prijs blijft leeg tot een factuur of handmatige invoer." });
    } catch {
      toast({ title: "Artikel aanleggen mislukt", variant: "destructive" });
    } finally {
      setBezig(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="rounded bg-muted/40 border p-2 text-xs text-muted-foreground">
        Geen eigen artikel of normtijd gevonden — er wordt <span className="font-medium">geen regel</span> voorgesteld.
        Herkend: {[h.fabrikant, h.aanduiding, h.soort].filter(Boolean).join(" · ") || "—"}.
      </div>

      {artikelAangelegd ? (
        <div className="flex items-center justify-between gap-2 rounded border border-green-200 bg-green-50 p-2">
          <span className="text-xs text-green-800 flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Artikel aangelegd (zonder prijs).
          </span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onOpnieuwKoppelen}>
            <RefreshCw className="h-3 w-3 mr-1" />
            Opnieuw koppelen
          </Button>
        </div>
      ) : !nieuwArtikelOpen ? (
        <Button variant="outline" size="sm" onClick={() => setNieuwArtikelOpen(true)}>
          <PackagePlus className="h-3.5 w-3.5 mr-1.5" />
          Als nieuw artikel aanleggen
        </Button>
      ) : (
        <div className="space-y-2 rounded-md border p-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px] text-muted-foreground mb-0.5 block">Leverancier (herkend)</Label>
              <div className="h-8 flex items-center px-2 text-sm rounded-md border bg-muted/40 text-muted-foreground truncate">
                {leverancier || "—"}
              </div>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground mb-0.5 block">Artikelcode</Label>
              <Input value={artikelcode} onChange={(e) => setArtikelcode(e.target.value)} className={cn("h-8 text-sm", AI_VELD)} />
            </div>
            <div className="col-span-2">
              <Label className="text-[11px] text-muted-foreground mb-0.5 block">Omschrijving</Label>
              <Input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} className={cn("h-8 text-sm", AI_VELD)} />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground mb-0.5 block">Eenheid</Label>
              <Input value={eenheid} onChange={(e) => setEenheid(e.target.value)} className={cn("h-8 text-sm", AI_VELD)} />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground mb-0.5 block">Categorie</Label>
              <Input value={categorie} onChange={(e) => setCategorie(e.target.value)} className={cn("h-8 text-sm", AI_VELD)} />
            </div>
          </div>
          <p className="text-[11px] text-amber-700">
            Prijs blijft leeg tot een inkoopfactuur of handmatige invoer volgt.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setNieuwArtikelOpen(false)} disabled={bezig}>Annuleren</Button>
            <Button size="sm" onClick={aanleggen} disabled={bezig}>
              {bezig ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5 mr-1.5" />}
              Artikel aanleggen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PlakInvoer;
