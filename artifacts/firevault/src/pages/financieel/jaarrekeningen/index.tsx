import { useState } from "react";
import { Link } from "wouter";
import {
  useListFinancieleDocumenten,
  useGetFinancieelDocument,
  useUpdateFinancieelKerncijfer,
  useExtraheerFinancieleKerncijfers,
  useUpdateFinancieelDocument,
} from "@workspace/api-client-react";
import type {
  FinancieelDocument,
  FinancieelKerncijfer,
  FinancieelDatasetStatus,
  FinancieelSubtype,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, ShieldCheck, FileText, Download, Sparkles, CheckCircle2, XCircle,
  RotateCcw, Ban, Lock, TrendingUp, Search, Pencil, CalendarDays,
} from "lucide-react";
import { PaginaHulp } from "@/components/pagina-hulp";

// ── Helpers ───────────────────────────────────────────────────────────────────

const eur = (n: number | null | undefined, eenheid = "EUR") => {
  if (n == null) return "—";
  if (eenheid === "EUR") {
    return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
  }
  if (eenheid === "%") return `${new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(n)}%`;
  return `${new Intl.NumberFormat("nl-NL").format(n)} ${eenheid}`.trim();
};

const DATASET_LABEL: Record<string, string> = {
  proposed: "Voorgesteld",
  reviewed: "Beoordeeld",
  approved: "Goedgekeurd",
  rejected: "Afgewezen",
  superseded: "Vervangen",
};

const DATASET_KLEUR: Record<string, string> = {
  proposed: "bg-amber-50 text-amber-700 border-amber-200",
  reviewed: "bg-sky-50 text-sky-700 border-sky-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  superseded: "bg-slate-100 text-slate-500 border-slate-200",
};

const CIJFER_LABEL: Record<string, string> = {
  proposed: "Voorgesteld",
  reviewed: "Beoordeeld",
  approved: "Goedgekeurd",
  rejected: "Afgewezen",
  superseded: "Vervangen",
};

const CIJFER_KLEUR: Record<string, string> = {
  proposed: "bg-amber-50 text-amber-700 border-amber-200",
  reviewed: "bg-sky-50 text-sky-700 border-sky-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  superseded: "bg-slate-100 text-slate-500 border-slate-200",
};

const SUBTYPE_LABEL: Record<string, string> = {
  geconsolideerd: "Geconsolideerd",
  enkelvoudig: "Enkelvoudig",
};

// Groepeer documenten per boekjaar: recentste jaar bovenaan, "Boekjaar onbekend" onderaan.
function groepeerPerBoekjaar(documenten: FinancieelDocument[]): { jaar: number | null; docs: FinancieelDocument[] }[] {
  const perJaar = new Map<number | null, FinancieelDocument[]>();
  for (const doc of documenten) {
    const jaar = doc.boekjaar ?? null;
    const lijst = perJaar.get(jaar);
    if (lijst) lijst.push(doc);
    else perJaar.set(jaar, [doc]);
  }
  const jaren = [...perJaar.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  });
  return jaren.map((jaar) => ({ jaar, docs: perJaar.get(jaar)! }));
}

// ── Kerncijfer-rij ──────────────────────────────────────────────────────────────

function KerncijferRij({
  cijfer,
  magSchrijven,
  onStatus,
  onWaarde,
  onUitgesloten,
  bezig,
}: {
  cijfer: FinancieelKerncijfer;
  magSchrijven: boolean;
  onStatus: (status: FinancieelDatasetStatus) => void;
  onWaarde: (waarde: number | null) => void;
  onUitgesloten: (val: boolean) => void;
  bezig: boolean;
}) {
  const [bewerkt, setBewerkt] = useState(false);
  const [invoer, setInvoer] = useState(cijfer.waarde != null ? String(cijfer.waarde) : "");

  function bewaarWaarde() {
    const genormaliseerd = invoer.trim().replace(/\./g, "").replace(",", ".");
    const num = genormaliseerd === "" ? null : Number(genormaliseerd);
    if (genormaliseerd !== "" && Number.isNaN(num)) return;
    onWaarde(num);
    setBewerkt(false);
  }

  return (
    <TableRow className={cn(cijfer.uitgesloten && "opacity-50")}>
      <TableCell className="align-top">
        <div className="font-medium text-sm">{cijfer.label}</div>
        <div className="text-[11px] text-muted-foreground">{cijfer.sleutel}</div>
        {cijfer.is_berekend && (
          <Badge variant="secondary" className="mt-1 text-[10px]">Berekend</Badge>
        )}
      </TableCell>
      <TableCell className="align-top">
        {bewerkt ? (
          <div className="flex items-center gap-1">
            <Input
              value={invoer}
              onChange={(e) => setInvoer(e.target.value)}
              className="h-8 w-32 text-sm"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") bewaarWaarde(); if (e.key === "Escape") setBewerkt(false); }}
            />
            <Button size="sm" className="h-8" onClick={bewaarWaarde}>Ok</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="font-medium tabular-nums">{eur(cijfer.waarde, cijfer.eenheid)}</span>
            {magSchrijven && (
              <button
                onClick={() => { setInvoer(cijfer.waarde != null ? String(cijfer.waarde) : ""); setBewerkt(true); }}
                className="text-muted-foreground hover:text-foreground"
                title="Waarde handmatig aanpassen"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
        {cijfer.handmatig_aangepast && cijfer.oorspronkelijke_waarde != null && (
          <div className="text-[10px] text-amber-600 mt-0.5">
            AI-voorstel: {eur(cijfer.oorspronkelijke_waarde, cijfer.eenheid)}
          </div>
        )}
      </TableCell>
      <TableCell className="align-top text-xs text-muted-foreground max-w-[280px]">
        <div className="space-y-0.5">
          {cijfer.bron_pagina != null && <div>Pagina {cijfer.bron_pagina}{cijfer.bron_tabel ? ` · ${cijfer.bron_tabel}` : ""}</div>}
          {cijfer.bron_tekst && <div className="italic line-clamp-2" title={cijfer.bron_tekst}>&ldquo;{cijfer.bron_tekst}&rdquo;</div>}
          <div className="flex items-center gap-2">
            <span>{cijfer.extractie_methode}</span>
            {cijfer.confidence != null && (
              <span className="text-[10px]">· zekerheid {Math.round(cijfer.confidence * 100)}%</span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="align-top">
        <Badge variant="outline" className={cn("text-[11px]", CIJFER_KLEUR[cijfer.status])}>
          {CIJFER_LABEL[cijfer.status] ?? cijfer.status}
        </Badge>
      </TableCell>
      <TableCell className="align-top">
        {magSchrijven && (
          <div className="flex flex-wrap gap-1 justify-end">
            <Button
              size="sm" variant="outline"
              className="h-7 px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
              disabled={bezig || cijfer.status === "approved"}
              onClick={() => onStatus("approved")}
              title="Goedkeuren"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm" variant="outline"
              className="h-7 px-2 text-red-700 border-red-200 hover:bg-red-50"
              disabled={bezig || cijfer.status === "rejected"}
              onClick={() => onStatus("rejected")}
              title="Afwijzen"
            >
              <XCircle className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm" variant="ghost" className="h-7 px-2"
              disabled={bezig}
              onClick={() => onUitgesloten(!cijfer.uitgesloten)}
              title={cijfer.uitgesloten ? "Weer meenemen" : "Uitsluiten van overzicht"}
            >
              <Ban className={cn("h-3.5 w-3.5", cijfer.uitgesloten && "text-amber-600")} />
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

// ── Detailpaneel ────────────────────────────────────────────────────────────────

function DocumentDetail({ documentId, magSchrijven }: { documentId: number; magSchrijven: boolean }) {
  const { toast } = useToast();
  const { data: detail, isLoading, refetch } = useGetFinancieelDocument(documentId);
  const patchCijfer = useUpdateFinancieelKerncijfer();
  const extraheer = useExtraheerFinancieleKerncijfers();
  const patchDoc = useUpdateFinancieelDocument();

  const [bewerkMetadata, setBewerkMetadata] = useState(false);
  const [invoerBoekjaar, setInvoerBoekjaar] = useState("");
  const [invoerEntiteit, setInvoerEntiteit] = useState("");
  const [invoerSubtype, setInvoerSubtype] = useState<FinancieelSubtype>("enkelvoudig");

  const bezig = patchCijfer.isPending || extraheer.isPending || patchDoc.isPending;

  if (isLoading || !detail) {
    return <div className="p-6 text-sm text-muted-foreground">Laden…</div>;
  }

  const kerncijfers = detail.kerncijfers ?? [];
  const goedgekeurd = kerncijfers.filter((k) => k.status === "approved" && !k.uitgesloten).length;

  async function cijferStatus(id: number, status: FinancieelDatasetStatus) {
    try {
      await patchCijfer.mutateAsync({ id, data: { status } });
      await refetch();
    } catch {
      toast({ title: "Bijwerken mislukt", variant: "destructive" });
    }
  }
  async function cijferWaarde(id: number, waarde: number | null) {
    try {
      await patchCijfer.mutateAsync({ id, data: { waarde } });
      await refetch();
    } catch {
      toast({ title: "Waarde opslaan mislukt", variant: "destructive" });
    }
  }
  async function cijferUitgesloten(id: number, val: boolean) {
    try {
      await patchCijfer.mutateAsync({ id, data: { uitgesloten: val } });
      await refetch();
    } catch {
      toast({ title: "Bijwerken mislukt", variant: "destructive" });
    }
  }
  async function opnieuwExtraheren() {
    try {
      await extraheer.mutateAsync({ id: documentId });
      await refetch();
      toast({ title: "Kerncijfers opnieuw voorgesteld" });
    } catch {
      toast({ title: "Extractie mislukt", variant: "destructive" });
    }
  }
  async function datasetStatus(status: FinancieelDatasetStatus) {
    try {
      await patchDoc.mutateAsync({ id: documentId, data: { dataset_status: status } });
      await refetch();
      toast({ title: `Dataset gemarkeerd als ${DATASET_LABEL[status].toLowerCase()}` });
    } catch {
      toast({ title: "Bijwerken mislukt", variant: "destructive" });
    }
  }
  function openMetadataBewerken() {
    if (!detail) return;
    setInvoerBoekjaar(detail.boekjaar ? String(detail.boekjaar) : "");
    setInvoerEntiteit(detail.entiteit ?? "");
    setInvoerSubtype(detail.subtype);
    setBewerkMetadata(true);
  }
  async function metadataOpslaan() {
    const boekjaarGetal = invoerBoekjaar.trim() === "" ? null : Number(invoerBoekjaar.trim());
    if (boekjaarGetal !== null && (!Number.isInteger(boekjaarGetal) || boekjaarGetal < 1990 || boekjaarGetal > 2100)) {
      toast({ title: "Ongeldig boekjaar", description: "Vul een jaartal in tussen 1990 en 2100.", variant: "destructive" });
      return;
    }
    try {
      await patchDoc.mutateAsync({
        id: documentId,
        data: {
          boekjaar: boekjaarGetal,
          entiteit: invoerEntiteit.trim() === "" ? null : invoerEntiteit.trim(),
          subtype: invoerSubtype,
        },
      });
      await refetch();
      setBewerkMetadata(false);
      toast({ title: "Gegevens bijgewerkt", description: "De kerncijfers zijn meegetrokken naar het nieuwe boekjaar en de nieuwe entiteit." });
    } catch {
      toast({ title: "Opslaan mislukt", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
            <h2 className="text-lg font-semibold truncate" title={detail.titel}>{detail.titel}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
            <Badge variant="outline" className={cn(DATASET_KLEUR[detail.dataset_status])}>
              {DATASET_LABEL[detail.dataset_status] ?? detail.dataset_status}
            </Badge>
            <span>{SUBTYPE_LABEL[detail.subtype] ?? detail.subtype}</span>
            {detail.entiteit && <span>· {detail.entiteit}</span>}
            {detail.boekjaar && <span>· boekjaar {detail.boekjaar}</span>}
            <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" /> {detail.beveiligingsprofiel}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/financieel/jaarrekeningen/${detail.id}/download`} target="_blank" rel="noreferrer">
              <Download className="h-4 w-4 mr-1" /> Bestand
            </a>
          </Button>
          {magSchrijven && (
            <Button variant="outline" size="sm" onClick={openMetadataBewerken} disabled={bezig}>
              <Pencil className="h-4 w-4 mr-1" /> Gegevens corrigeren
            </Button>
          )}
          {magSchrijven && (
            <Button variant="outline" size="sm" onClick={opnieuwExtraheren} disabled={bezig}>
              <Sparkles className="h-4 w-4 mr-1" /> Opnieuw extraheren
            </Button>
          )}
        </div>
      </div>

      {bewerkMetadata && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Gegevens corrigeren</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="metadata-boekjaar">Boekjaar</Label>
                <Input
                  id="metadata-boekjaar"
                  inputMode="numeric"
                  placeholder="bijv. 2023"
                  value={invoerBoekjaar}
                  onChange={(e) => setInvoerBoekjaar(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="metadata-entiteit">Entiteit</Label>
                <Input
                  id="metadata-entiteit"
                  placeholder="bijv. FPS Brandpreventie"
                  value={invoerEntiteit}
                  onChange={(e) => setInvoerEntiteit(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Soort jaarrekening</Label>
                <Select value={invoerSubtype} onValueChange={(v) => setInvoerSubtype(v as FinancieelSubtype)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enkelvoudig">Enkelvoudig</SelectItem>
                    <SelectItem value="geconsolideerd">Geconsolideerd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              De kerncijfers van dit document bewegen automatisch mee, zodat het meerjarenoverzicht het juiste boekjaar en de juiste entiteit toont.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setBewerkMetadata(false)} disabled={bezig}>
                Annuleren
              </Button>
              <Button size="sm" onClick={() => void metadataOpslaan()} disabled={bezig}>
                Opslaan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {detail.extractie_status === "mislukt" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          Automatische extractie is mislukt. Voeg de kerncijfers handmatig toe of probeer opnieuw te extraheren.
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Kerncijfers ({goedgekeurd}/{kerncijfers.length} goedgekeurd)</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {kerncijfers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nog geen kerncijfers. {magSchrijven ? "Klik op 'Opnieuw extraheren' om ze voor te stellen." : ""}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kerncijfer</TableHead>
                  <TableHead>Waarde</TableHead>
                  <TableHead>Bewijs</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Beoordeling</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {kerncijfers.map((k) => (
                  <KerncijferRij
                    key={k.id}
                    cijfer={k}
                    magSchrijven={magSchrijven}
                    bezig={bezig}
                    onStatus={(s) => void cijferStatus(k.id, s)}
                    onWaarde={(w) => void cijferWaarde(k.id, w)}
                    onUitgesloten={(v) => void cijferUitgesloten(k.id, v)}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {magSchrijven && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => void datasetStatus("reviewed")} disabled={bezig}>
            <RotateCcw className="h-4 w-4 mr-1" /> Markeer als beoordeeld
          </Button>
          <Button variant="outline" size="sm" className="text-red-700 border-red-200 hover:bg-red-50" onClick={() => void datasetStatus("rejected")} disabled={bezig}>
            <XCircle className="h-4 w-4 mr-1" /> Dataset afwijzen
          </Button>
          <Button size="sm" onClick={() => void datasetStatus("approved")} disabled={bezig}>
            <ShieldCheck className="h-4 w-4 mr-1" /> Dataset goedkeuren
          </Button>
        </div>
      )}

      {detail.logboek && detail.logboek.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Audittrail</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-xs">
              {detail.logboek.map((l) => (
                <li key={l.id} className="flex gap-2">
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {new Date(l.aangemaakt_op).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                  <span className="font-medium">{l.actie}</span>
                  {l.gebruiker_naam && <span className="text-muted-foreground">· {l.gebruiker_naam}</span>}
                  {l.details && <span className="text-muted-foreground">— {l.details}</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Hoofdpagina ─────────────────────────────────────────────────────────────────

export default function JaarrekeningenValidatiePagina() {
  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven = heeftNiveau("financieel_vertrouwelijk", 2);

  const [zoek, setZoek] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [geselecteerd, setGeselecteerd] = useState<number | null>(null);

  const { data, isLoading } = useListFinancieleDocumenten({
    zoek: zoek.trim() || undefined,
    dataset_status: statusFilter === "alle" ? undefined : (statusFilter as FinancieelDatasetStatus),
  });

  const documenten: FinancieelDocument[] = data ?? [];
  const actief = geselecteerd ?? documenten[0]?.id ?? null;

  return (
    <div className="space-y-6 p-6">
      <PaginaHulp pagina="jaarrekeningen" />
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/financieel/bedrijfsresultaten"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              <h1 data-paginatitel className="text-2xl font-semibold">Jaarrekeningen</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Vertrouwelijke (geconsolideerde) jaarrekeningen — controleer en keur de geëxtraheerde kerncijfers goed.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/financieel/meerjarenoverzicht">
            <TrendingUp className="h-4 w-4 mr-1" /> Meerjarenoverzicht
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              placeholder="Zoek op titel, entiteit…"
              className="pl-8"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle statussen</SelectItem>
                <SelectItem value="proposed">Voorgesteld</SelectItem>
                <SelectItem value="reviewed">Beoordeeld</SelectItem>
                <SelectItem value="approved">Goedgekeurd</SelectItem>
                <SelectItem value="rejected">Afgewezen</SelectItem>
                <SelectItem value="superseded">Vervangen</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Laden…</p>
          ) : documenten.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nog geen jaarrekeningen. Gebruik &ldquo;Slim uploaden&rdquo; om een jaarrekening vertrouwelijk toe te voegen.
            </div>
          ) : (
            <div className="space-y-4">
              {groepeerPerBoekjaar(documenten).map((groep) => (
                <div key={groep.jaar ?? "onbekend"}>
                  <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {groep.jaar ?? "Boekjaar onbekend"}
                  </div>
                  <ul className="space-y-2">
                    {groep.docs.map((doc) => (
                      <li key={doc.id}>
                        <button
                          onClick={() => setGeselecteerd(doc.id)}
                          className={cn(
                            "w-full text-left rounded-md border p-3 transition-colors hover:bg-muted/50",
                            actief === doc.id ? "border-primary bg-primary/5" : "border-border",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium text-sm truncate" title={doc.titel}>{doc.titel}</span>
                            <Badge variant="outline" className={cn("text-[10px] shrink-0", DATASET_KLEUR[doc.dataset_status])}>
                              {DATASET_LABEL[doc.dataset_status] ?? doc.dataset_status}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                            <span>{SUBTYPE_LABEL[doc.subtype] ?? doc.subtype}</span>
                            {doc.entiteit && <span className="truncate">· {doc.entiteit}</span>}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {(doc.aantal_goedgekeurd ?? 0)}/{doc.aantal_kerncijfers ?? 0} kerncijfers goedgekeurd
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          {actief != null ? (
            <DocumentDetail documentId={actief} magSchrijven={magSchrijven} />
          ) : (
            <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
              Selecteer een jaarrekening om de kerncijfers te beoordelen.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
