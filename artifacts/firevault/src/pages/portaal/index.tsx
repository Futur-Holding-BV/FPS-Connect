import { useState, useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetPortaal,
  usePatchPortaalTracking,
  useCreatePortaalVraag,
  useOndertekenenPortaal,
  useAfwijzenPortaal,
  useSavePortaalOptioneelWerk,
  useGetPortaalAiUitleg,
  getGetPortaalQueryKey,
} from "@workspace/api-client-react";
import type { PortaalOfferte } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, CheckCircle, XCircle, MessageSquare, PenLine, AlertTriangle,
  Printer, Paperclip, ChevronDown, ChevronUp, Sparkles, Phone, Mail,
  ArrowRight, ClipboardList, Wrench, FileCheck, User, Edit3,
} from "lucide-react";

function euro(n: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n ?? 0);
}

function datumNL(d: string) {
  return new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}

const STATUS_CONFIG: Record<string, { label: string; kleur: string }> = {
  concept:    { label: "Concept",      kleur: "bg-gray-100 text-gray-700 border-gray-200" },
  verzonden:  { label: "Verzonden",    kleur: "bg-blue-100 text-blue-700 border-blue-200" },
  bekeken:    { label: "Bekeken",      kleur: "bg-amber-100 text-amber-700 border-amber-200" },
  ondertekend:{ label: "Geaccepteerd", kleur: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  afgewezen:  { label: "Afgewezen",    kleur: "bg-rose-100 text-rose-700 border-rose-200" },
};

type ActieFase =
  | "keuze"
  | "tekenen"
  | "naam"
  | "voltooid"
  | "afgewezen_voltooid"
  | "vraag_open"
  | "wijziging_open"
  | "afwijzen_open";

interface PortaalPaginaProps {
  token: string;
}

export default function PortaalPagina({ token }: PortaalPaginaProps) {
  const qc = useQueryClient();
  const { data: offerte, isLoading, isError, error } = useGetPortaal(token);

  const trackEvent     = usePatchPortaalTracking();
  const stelVraag      = useCreatePortaalVraag();
  const onderteken     = useOndertekenenPortaal();
  const afwijs         = useAfwijzenPortaal();
  const slaOpOptioneel = useSavePortaalOptioneelWerk();
  const haalAiUitlegMut = useGetPortaalAiUitleg();

  // Canvas handtekening
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tekenRef  = useRef(false);
  const [heeftHandtekening, setHeeftHandtekening] = useState(false);

  // Actiefase — één "wizard"-toestand voor alle actieformulieren
  const [actieFase, setActieFase] = useState<ActieFase>("keuze");
  const [bezig, setBezig] = useState(false);

  // Ondertekening-velden
  const [sigNaam,    setSigNaam]    = useState("");
  const [sigBedrijf, setSigBedrijf] = useState("");
  const [sigFunctie, setSigFunctie] = useState("");

  // Vraag
  const [vraagNaam,    setVraagNaam]    = useState("");
  const [vraagEmail,   setVraagEmail]   = useState("");
  const [vraagTekst,   setVraagTekst]   = useState("");
  const [vraagVerstuurd, setVraagVerstuurd] = useState(false);

  // Wijziging aanvragen
  const [wijzigingNaam,  setWijzigingNaam]  = useState("");
  const [wijzigingEmail, setWijzigingEmail] = useState("");
  const [wijzigingTekst, setWijzigingTekst] = useState("");
  const [wijzigingVerstuurd, setWijzigingVerstuurd] = useState(false);

  // Afwijzen
  const [afwijsReden, setAfwijsReden] = useState("");

  // Ondertekening foutmelding (bijv. al ondertekend — 409)
  const [ondertekenfout, setOndertekenfout] = useState<string | null>(null);

  // Optioneel werk
  const [optioneelSelectie, setOptioneelSelectie] = useState<Record<number, boolean>>({});
  const [optioneelBewaard,  setOptioneelBewaard]  = useState(false);
  const [optioneelBezig,    setOptioneelBezig]    = useState(false);

  // AI uitleg per regel
  const [aiUitleg, setAiUitleg] = useState<Record<number, string>>({});
  const [aiBezig,  setAiBezig]  = useState<Record<number, boolean>>({});

  // Ingeklapte regelgroepen (categorie-naam → boolean)
  const [ingeklapt, setIngeklapt] = useState<Record<string, boolean>>({});

  const gespoord = useRef(false);

  useEffect(() => {
    if (offerte && !gespoord.current) {
      gespoord.current = true;
    }
    if (offerte) {
      const init: Record<number, boolean> = {};
      for (const r of offerte.optionele_regels ?? []) {
        init[r.id] = r.optioneel_geselecteerd ?? true;
      }
      setOptioneelSelectie(init);
    }
  }, [offerte]);

  // ── Handtekening ─────────────────────────────────────────────────────────────
  const tekenStart = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    tekenRef.current = true;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top  : (e as React.MouseEvent).clientY - rect.top;
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, []);

  const tekenBeweeg = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!tekenRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : (e as React.MouseEvent).clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top  : (e as React.MouseEvent).clientY - rect.top;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHeeftHandtekening(true);
  }, []);

  const tekenEinde = useCallback(() => { tekenRef.current = false; }, []);

  function wisHandtekening() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHeeftHandtekening(false);
  }

  async function bevestigHandtekening() {
    if (!heeftHandtekening || !sigNaam.trim()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    setBezig(true);
    setOndertekenfout(null);
    try {
      await onderteken.mutateAsync({
        token,
        data: {
          naam: sigNaam.trim(),
          bedrijf: sigBedrijf.trim() || undefined,
          functie: sigFunctie.trim() || undefined,
          handtekening_data_url: dataUrl,
        },
      });
      await qc.invalidateQueries({ queryKey: getGetPortaalQueryKey(token) });
      setActieFase("voltooid");
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setOndertekenfout("Deze offerte is al ondertekend. Vernieuw de pagina om de actuele status te zien.");
      } else {
        setActieFase("tekenen");
      }
    } finally {
      setBezig(false);
    }
  }

  async function bevestigAfwijzen() {
    setBezig(true);
    try {
      await afwijs.mutateAsync({ token, data: { reden: afwijsReden.trim() || undefined } });
      await qc.invalidateQueries({ queryKey: getGetPortaalQueryKey(token) });
      setActieFase("afgewezen_voltooid");
    } catch {
      // noop
    } finally {
      setBezig(false);
    }
  }

  async function verstuurVraag() {
    if (!vraagTekst.trim()) return;
    setBezig(true);
    try {
      await stelVraag.mutateAsync({ token, data: { naam: vraagNaam.trim() || undefined, email: vraagEmail.trim() || undefined, vraag: vraagTekst.trim(), type: "vraag" } });
      setVraagVerstuurd(true);
      setActieFase("keuze");
      setVraagTekst("");
    } catch {
      // noop
    } finally {
      setBezig(false);
    }
  }

  async function verstuurWijziging() {
    if (!wijzigingTekst.trim()) return;
    setBezig(true);
    try {
      await stelVraag.mutateAsync({ token, data: { naam: wijzigingNaam.trim() || undefined, email: wijzigingEmail.trim() || undefined, vraag: wijzigingTekst.trim(), type: "wijziging" } });
      setWijzigingVerstuurd(true);
      setActieFase("keuze");
      setWijzigingTekst("");
    } catch {
      // noop
    } finally {
      setBezig(false);
    }
  }

  async function slaOptioneelWerkOp() {
    setOptioneelBezig(true);
    try {
      await slaOpOptioneel.mutateAsync({ token, data: { geselecteerd: optioneelSelectie } });
      setOptioneelBewaard(true);
    } catch {
      // noop
    } finally {
      setOptioneelBezig(false);
    }
  }

  async function haalAiUitleg(regelId: number) {
    if (aiUitleg[regelId] || aiBezig[regelId]) return;
    setAiBezig((prev) => ({ ...prev, [regelId]: true }));
    try {
      const result = await haalAiUitlegMut.mutateAsync({ token, data: { regel_id: regelId } });
      setAiUitleg((prev) => ({ ...prev, [regelId]: result.uitleg }));
    } catch {
      setAiUitleg((prev) => ({ ...prev, [regelId]: "Uitleg is momenteel niet beschikbaar." }));
    } finally {
      setAiBezig((prev) => ({ ...prev, [regelId]: false }));
    }
  }

  // ── Laden ─────────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="bg-white border-b h-14" />
        <div className="max-w-3xl mx-auto w-full px-4 py-8 space-y-5">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (isError || !offerte) {
    const isVerlopen = isError && error && "status" in error && (error as { status: number }).status === 410;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-sm w-full mx-4">
          <CardContent className="py-12 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-7 w-7 text-amber-500" />
            </div>
            {isVerlopen ? (
              <>
                <div>
                  <p className="font-semibold text-lg">Uitnodiging verlopen</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Vraag een nieuwe link aan bij de afzender.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="font-semibold text-lg">Link niet gevonden</p>
                  <p className="text-sm text-muted-foreground mt-1">Neem contact op met de afzender voor een nieuwe uitnodiging.</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const o = offerte as PortaalOfferte;
  const statusCfg = STATUS_CONFIG[o.portaal_status] ?? STATUS_CONFIG.verzonden;
  const isGesloten =
    o.portaal_status === "ondertekend" ||
    o.portaal_status === "afgewezen" ||
    actieFase === "voltooid" ||
    actieFase === "afgewezen_voltooid";

  // Groepeer begrotingsregels per categorie
  const regelGroepen: Record<string, typeof o.regels> = {};
  for (const r of o.regels ?? []) {
    const cat = r.categorie === "algemene_kosten" ? "Algemene kosten" : "Werkzaamheden";
    if (!regelGroepen[cat]) regelGroepen[cat] = [];
    regelGroepen[cat].push(r);
  }

  const heeftRegels = (o.regels ?? []).length > 0;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Sticky header ──────────────────────────────────────────────────────── */}
      <header className="bg-white border-b sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="h-8 w-8 rounded-md flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
              style={{ backgroundColor: "#F23B0D" }}
            >
              F
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm leading-tight text-foreground truncate">FPS Brandpreventie</p>
              <p className="text-xs text-muted-foreground truncate hidden sm:block">Uw partner in brandveiligheid</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {
                trackEvent.mutate({ token, data: { event: "pdf_gedownload" } });
                window.print();
              }}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-gray-100"
            >
              <Printer className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Afdrukken</span>
            </button>
            <Badge variant="outline" className={`text-xs font-medium ${statusCfg.kleur}`}>
              {actieFase === "voltooid" ? "Geaccepteerd" : actieFase === "afgewezen_voltooid" ? "Afgewezen" : statusCfg.label}
            </Badge>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6 pb-16">

        {/* ── Offerte-header ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              {o.offertenummer && (
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Offerte {o.offertenummer}
                </p>
              )}
              <h1 className="text-2xl font-bold text-foreground leading-tight">{o.titel}</h1>
              {o.opdrachtgever && (
                <p className="text-sm text-muted-foreground mt-1">{o.opdrachtgever}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <p className="text-2xl font-bold text-foreground">{euro(o.bedrag_incl_btw)}</p>
              <p className="text-xs text-muted-foreground">incl. {o.btw_percentage}% btw</p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {o.datum && (
              <div>
                <p className="text-xs text-muted-foreground">Offertedatum</p>
                <p className="text-sm font-medium mt-0.5">{datumNL(o.datum)}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Geldig tot</p>
              <p className="text-sm font-medium mt-0.5">
                {o.datum
                  ? datumNL(new Date(new Date(o.datum).getTime() + o.geldigheid_dagen * 86400000).toISOString())
                  : `${o.geldigheid_dagen} dagen`}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Excl. btw</p>
              <p className="text-sm font-medium mt-0.5">{euro(o.bedrag_excl_btw)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="text-sm font-medium mt-0.5">
                {actieFase === "voltooid" ? "Geaccepteerd" : actieFase === "afgewezen_voltooid" ? "Afgewezen" : statusCfg.label}
              </p>
            </div>
          </div>
        </div>

        {/* ── Contactpersoon ──────────────────────────────────────────────────── */}
        {o.contactpersoon && (
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#FEE8E3" }}>
                  <User className="h-5 w-5" style={{ color: "#F23B0D" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Uw contactpersoon</p>
                  <p className="font-semibold text-foreground">{o.contactpersoon.naam}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    {o.contactpersoon.email && (
                      <a href={`mailto:${o.contactpersoon.email}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
                        <Mail className="h-3.5 w-3.5" />
                        {o.contactpersoon.email}
                      </a>
                    )}
                    {o.contactpersoon.telefoon && (
                      <a href={`tel:${o.contactpersoon.telefoon}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors">
                        <Phone className="h-3.5 w-3.5" />
                        {o.contactpersoon.telefoon}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Tekstsecties ────────────────────────────────────────────────────── */}
        {(o.secties ?? []).filter((s) => s.actief !== false && s.inhoud).length > 0 && (
          <Card>
            <CardContent className="p-6 space-y-5">
              {o.secties
                .filter((s) => s.actief !== false)
                .sort((a, b) => a.volgorde - b.volgorde)
                .map((s) => (
                  <div key={s.id}>
                    {s.titel && (
                      <h2 className="text-base font-semibold mb-2 pb-1.5 border-b" style={{ borderColor: "#F23B0D", color: "#F23B0D" }}>
                        {s.titel}
                      </h2>
                    )}
                    {s.inhoud && (
                      <div className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                        {s.inhoud}
                      </div>
                    )}
                  </div>
                ))}
            </CardContent>
          </Card>
        )}

        {/* ── Begrotingsregels ────────────────────────────────────────────────── */}
        {heeftRegels && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-sm text-foreground uppercase tracking-wider">Werkspecificatie</h2>
            </div>

            {Object.entries(regelGroepen).map(([categorie, regels]) => (
              <Card key={categorie}>
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors rounded-t-xl"
                  onClick={() => setIngeklapt((prev) => ({ ...prev, [categorie]: !prev[categorie] }))}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{categorie}</span>
                    <span className="text-xs text-muted-foreground">({regels.length} posten)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold">
                      {euro(regels.reduce((s, r) => s + r.kosten, 0))}
                    </span>
                    {ingeklapt[categorie]
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>

                {!ingeklapt[categorie] && (
                  <div className="border-t">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/30">
                          <th className="text-left text-xs font-medium text-muted-foreground px-5 py-2">Omschrijving</th>
                          <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2 hidden sm:table-cell">Aantal</th>
                          <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2 hidden sm:table-cell">Eenheid</th>
                          <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2 hidden md:table-cell">Prijs/e</th>
                          <th className="text-right text-xs font-medium text-muted-foreground px-5 py-2">Bedrag</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {regels.map((r) => (
                          <>
                            <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                              <td className="px-5 py-3 align-top">
                                <div className="flex items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-foreground leading-snug">{r.maatregel}</div>
                                    {r.ruimte && (
                                      <div className="text-xs text-muted-foreground mt-0.5">{r.ruimte}</div>
                                    )}
                                    {r.snag_referentie && (
                                      <div className="text-xs text-muted-foreground">Ref. {r.snag_referentie}</div>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    title="AI uitleg opvragen"
                                    onClick={() => haalAiUitleg(r.id)}
                                    disabled={aiBezig[r.id]}
                                    className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-amber-600 transition-colors px-1.5 py-0.5 rounded hover:bg-amber-50 disabled:opacity-50"
                                  >
                                    {aiBezig[r.id]
                                      ? <Loader2 className="h-3 w-3 animate-spin" />
                                      : <Sparkles className="h-3 w-3" />}
                                    <span className="hidden sm:inline">{aiUitleg[r.id] ? "Uitleg" : "Uitleg"}</span>
                                  </button>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right text-muted-foreground align-top hidden sm:table-cell">{r.aantal}</td>
                              <td className="px-3 py-3 text-right text-muted-foreground align-top hidden sm:table-cell">{r.eenheid}</td>
                              <td className="px-3 py-3 text-right text-muted-foreground align-top hidden md:table-cell">{euro(r.prijs_per_eenheid)}</td>
                              <td className="px-5 py-3 text-right font-medium align-top">{euro(r.kosten)}</td>
                            </tr>
                            {aiUitleg[r.id] && (
                              <tr key={`uitleg-${r.id}`} className="bg-amber-50/50">
                                <td colSpan={5} className="px-5 py-3">
                                  <div className="flex items-start gap-2">
                                    <Sparkles className="h-3.5 w-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                                    <p className="text-xs text-amber-800 leading-relaxed">{aiUitleg[r.id]}</p>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-muted/20">
                          <td colSpan={4} className="px-5 py-3 text-sm font-semibold text-right hidden sm:table-cell">Subtotaal {categorie}</td>
                          <td colSpan={2} className="px-5 py-3 text-sm font-semibold text-right sm:hidden">Subtotaal</td>
                          <td className="px-5 py-3 text-sm font-semibold text-right">{euro(regels.reduce((s, r) => s + r.kosten, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </Card>
            ))}

            <Card>
              <CardContent className="p-5">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotaal excl. btw</span>
                    <span>{euro(o.bedrag_excl_btw)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Btw {o.btw_percentage}%</span>
                    <span>{euro(o.bedrag_incl_btw - o.bedrag_excl_btw)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-base">
                    <span>Totaal incl. btw</span>
                    <span style={{ color: "#F23B0D" }}>{euro(o.bedrag_incl_btw)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Totaalprijs (wanneer geen regels) ──────────────────────────────── */}
        {!heeftRegels && (
          <Card>
            <CardContent className="p-5">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotaal excl. btw</span>
                  <span>{euro(o.bedrag_excl_btw)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Btw {o.btw_percentage}%</span>
                  <span>{euro(o.bedrag_incl_btw - o.bedrag_excl_btw)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-base">
                  <span>Totaal incl. btw</span>
                  <span style={{ color: "#F23B0D" }}>{euro(o.bedrag_incl_btw)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Optioneel werk ──────────────────────────────────────────────────── */}
        {(o.optionele_regels ?? []).length > 0 && !isGesloten && (
          <Card>
            <CardContent className="p-5 space-y-4">
              <div>
                <h2 className="font-semibold">Optioneel werk</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Geef aan welke optionele werkzaamheden u wilt meenemen.
                </p>
              </div>
              <div className="space-y-2">
                {o.optionele_regels.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-start gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-primary"
                      checked={optioneelSelectie[r.id] ?? (r.optioneel_geselecteerd ?? true)}
                      onChange={(e) =>
                        setOptioneelSelectie((prev) => ({ ...prev, [r.id]: e.target.checked }))
                      }
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{r.maatregel}</div>
                      {r.ruimte && <div className="text-xs text-muted-foreground mt-0.5">{r.ruimte}</div>}
                    </div>
                    <div className="text-sm font-medium flex-shrink-0">{euro(r.kosten)}</div>
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" onClick={slaOptioneelWerkOp} disabled={optioneelBezig}>
                  {optioneelBezig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                  {optioneelBezig ? "Bezig…" : "Selectie bevestigen"}
                </Button>
                {optioneelBewaard && <span className="text-sm text-emerald-700">Opgeslagen</span>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Bijlagen ────────────────────────────────────────────────────────── */}
        {(o.bijlagen ?? []).length > 0 && (
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-primary" />
                <h2 className="font-semibold">Bijlagen</h2>
              </div>
              <div className="space-y-2">
                {o.bijlagen.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/20 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{b.naam}</div>
                      {b.beschrijving && <div className="text-xs text-muted-foreground mt-0.5">{b.beschrijving}</div>}
                    </div>
                    <Badge variant="outline" className="text-xs flex-shrink-0">{b.bijlage_type}</Badge>
                    {b.url && (
                      <a
                        href={b.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => trackEvent.mutate({ token, data: { event: "bijlage_gedownload" } })}
                        className="text-xs text-primary hover:underline flex-shrink-0 font-medium"
                      >
                        Openen
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Wat gebeurt er na akkoord? ──────────────────────────────────────── */}
        {!isGesloten && (
          <Card className="border-none" style={{ background: "linear-gradient(135deg, #fff5f2 0%, #fff 100%)" }}>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2">
                <FileCheck className="h-4 w-4" style={{ color: "#F23B0D" }} />
                <h2 className="font-semibold">Wat gebeurt er na uw akkoord?</h2>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  {
                    stap: "1",
                    icon: FileCheck,
                    titel: "Bevestiging",
                    tekst: "U ontvangt direct een bevestiging per e-mail met een kopie van de ondertekende offerte.",
                  },
                  {
                    stap: "2",
                    icon: Phone,
                    titel: "Contact & planning",
                    tekst: "Wij nemen binnen 2 werkdagen contact met u op om de werkzaamheden in te plannen.",
                  },
                  {
                    stap: "3",
                    icon: Wrench,
                    titel: "Uitvoering",
                    tekst: "Onze gecertificeerde monteurs voeren de werkzaamheden vakkundig en conform de NEN-normen uit.",
                  },
                ].map(({ stap, icon: Icon, titel, tekst }) => (
                  <div key={stap} className="flex gap-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: "#F23B0D" }}
                    >
                      {stap}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{titel}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{tekst}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Actiepaneel ─────────────────────────────────────────────────────── */}

        {/* Voltooid: akkoord */}
        {(actieFase === "voltooid" || o.portaal_status === "ondertekend") && (
          <Card>
            <CardContent className="py-10 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                <CheckCircle className="h-9 w-9 text-emerald-600" />
              </div>
              <div>
                <p className="font-bold text-xl text-emerald-700">Offerte geaccepteerd</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Bedankt voor uw akkoord. U ontvangt een bevestiging per e-mail.
                  <br />Wij nemen spoedig contact met u op voor de planning.
                </p>
              </div>
              <button
                onClick={() => { trackEvent.mutate({ token, data: { event: "pdf_gedownload" } }); window.print(); }}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Printer className="h-4 w-4" />
                Getekende offerte afdrukken
              </button>
            </CardContent>
          </Card>
        )}

        {/* Voltooid: afgewezen */}
        {(actieFase === "afgewezen_voltooid" || o.portaal_status === "afgewezen") && (
          <Card>
            <CardContent className="py-10 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center mx-auto">
                <XCircle className="h-9 w-9 text-rose-500" />
              </div>
              <div>
                <p className="font-bold text-xl text-rose-700">Offerte afgewezen</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Bedankt voor uw reactie. Mocht u alsnog vragen hebben, neem dan gerust contact op.
                </p>
              </div>
              {o.contactpersoon?.email && (
                <a href={`mailto:${o.contactpersoon.email}`} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">
                  <Mail className="h-4 w-4" />
                  {o.contactpersoon.email}
                </a>
              )}
            </CardContent>
          </Card>
        )}

        {/* Open actiefase (nog geen beslissing) */}
        {!isGesloten && (
          <div className="space-y-4">

            {/* Actiebanner: keuze */}
            {actieFase === "keuze" && (
              <Card className="border-2" style={{ borderColor: "#F23B0D20" }}>
                <CardContent className="p-6 space-y-5">
                  <div>
                    <h2 className="font-bold text-lg">Uw beslissing</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Geef hieronder uw reactie op deze offerte.
                    </p>
                  </div>

                  {(vraagVerstuurd || wijzigingVerstuurd) && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 text-emerald-700 text-sm">
                      <CheckCircle className="h-4 w-4 flex-shrink-0" />
                      {vraagVerstuurd && !wijzigingVerstuurd && "Uw vraag is verstuurd. Wij nemen zo snel mogelijk contact op."}
                      {wijzigingVerstuurd && "Uw wijzigingsverzoek is verstuurd. Wij bekijken dit en komen bij u terug."}
                    </div>
                  )}

                  <div className="grid sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => setActieFase("tekenen")}
                      className="flex items-center gap-3 p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300 transition-all text-left group"
                    >
                      <div className="w-10 h-10 rounded-full bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center flex-shrink-0 transition-colors">
                        <PenLine className="h-5 w-5 text-emerald-700" />
                      </div>
                      <div>
                        <p className="font-semibold text-emerald-800 text-sm">Accepteren</p>
                        <p className="text-xs text-emerald-600 mt-0.5">Digitaal ondertekenen</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setActieFase("wijziging_open")}
                      className="flex items-center gap-3 p-4 rounded-xl border hover:border-amber-300 hover:bg-amber-50 transition-all text-left group"
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-amber-100 flex items-center justify-center flex-shrink-0 transition-colors">
                        <Edit3 className="h-5 w-5 text-gray-600 group-hover:text-amber-700 transition-colors" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Wijziging aanvragen</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Aanpassing doorgeven</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setActieFase("vraag_open")}
                      className="flex items-center gap-3 p-4 rounded-xl border hover:border-blue-300 hover:bg-blue-50 transition-all text-left group"
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center flex-shrink-0 transition-colors">
                        <MessageSquare className="h-5 w-5 text-gray-600 group-hover:text-blue-700 transition-colors" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Vraag stellen</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Meer informatie aanvragen</p>
                      </div>
                    </button>

                    <button
                      onClick={() => setActieFase("afwijzen_open")}
                      className="flex items-center gap-3 p-4 rounded-xl border hover:border-rose-300 hover:bg-rose-50 transition-all text-left group"
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-rose-100 flex items-center justify-center flex-shrink-0 transition-colors">
                        <XCircle className="h-5 w-5 text-gray-600 group-hover:text-rose-600 transition-colors" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">Afwijzen</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Offerte niet accepteren</p>
                      </div>
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Handtekening stap 1: canvas ──────────────────────────────────── */}
            {actieFase === "tekenen" && (
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-lg">Offerte ondertekenen</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">Stap 1 van 2 — Zet uw handtekening</p>
                    </div>
                    <button onClick={() => setActieFase("keuze")} className="text-sm text-muted-foreground hover:text-foreground">
                      Annuleren
                    </button>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Handtekening</Label>
                    <div className="border-2 rounded-xl bg-white overflow-hidden" style={{ borderStyle: "dashed", borderColor: "#e5e7eb" }}>
                      <canvas
                        ref={canvasRef}
                        width={700}
                        height={200}
                        className="w-full touch-none cursor-crosshair"
                        style={{ height: "200px" }}
                        onMouseDown={tekenStart}
                        onMouseMove={tekenBeweeg}
                        onMouseUp={tekenEinde}
                        onMouseLeave={tekenEinde}
                        onTouchStart={tekenStart}
                        onTouchMove={tekenBeweeg}
                        onTouchEnd={tekenEinde}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Teken met uw muis of vinger</p>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={wisHandtekening} disabled={!heeftHandtekening}>
                      Opnieuw
                    </Button>
                    <Button size="sm" onClick={() => setActieFase("naam")} disabled={!heeftHandtekening}>
                      Volgende
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Handtekening stap 2: naam + bevestiging ──────────────────────── */}
            {actieFase === "naam" && (
              <Card>
                <CardContent className="p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-lg">Akkoord bevestigen</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">Stap 2 van 2 — Vul uw gegevens in</p>
                    </div>
                    <button onClick={() => setActieFase("tekenen")} className="text-sm text-muted-foreground hover:text-foreground">
                      Terug
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Volledige naam *</Label>
                      <Input value={sigNaam} onChange={(e) => setSigNaam(e.target.value)} placeholder="Voor- en achternaam" />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Bedrijf (optioneel)</Label>
                        <Input value={sigBedrijf} onChange={(e) => setSigBedrijf(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Functie (optioneel)</Label>
                        <Input value={sigFunctie} onChange={(e) => setSigFunctie(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {sigNaam.trim() && (
                    <div className="rounded-xl border bg-slate-50 p-4 space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Samenvatting akkoord</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                        <span className="text-muted-foreground">Offerte</span>
                        <span className="font-medium truncate">{o.titel}</span>
                        <span className="text-muted-foreground">Bedrag</span>
                        <span className="font-medium">{euro(o.bedrag_incl_btw)} incl. btw</span>
                        {o.datum && (
                          <>
                            <span className="text-muted-foreground">Datum</span>
                            <span>{datumNL(o.datum)}</span>
                          </>
                        )}
                        <span className="text-muted-foreground">Ondertekenaar</span>
                        <span>{sigNaam.trim()}{sigFunctie ? `, ${sigFunctie.trim()}` : ""}{sigBedrijf ? ` (${sigBedrijf.trim()})` : ""}</span>
                        <span className="text-muted-foreground">Datum akkoord</span>
                        <span>{datumNL(new Date().toISOString())}</span>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Door te bevestigen gaat u akkoord met de offerte en geeft u FPS Brandpreventie opdracht de beschreven werkzaamheden uit te voeren.
                  </p>

                  {ondertekenfout && (
                    <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{ondertekenfout}</span>
                    </div>
                  )}

                  <Button
                    onClick={bevestigHandtekening}
                    disabled={!sigNaam.trim() || bezig || !!ondertekenfout}
                    className="w-full sm:w-auto"
                    style={{ backgroundColor: "#F23B0D" }}
                  >
                    {bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                    {bezig ? "Bezig met ondertekenen…" : "Definitief akkoord geven"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* ── Wijziging aanvragen ───────────────────────────────────────────── */}
            {actieFase === "wijziging_open" && (
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-lg">Wijziging aanvragen</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">Geef aan wat u anders wilt. Wij bekijken dit en sturen een herziene offerte indien nodig.</p>
                    </div>
                    <button onClick={() => setActieFase("keuze")} className="text-sm text-muted-foreground hover:text-foreground">
                      Annuleren
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Uw naam (optioneel)</Label>
                      <Input value={wijzigingNaam} onChange={(e) => setWijzigingNaam(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>E-mailadres (optioneel)</Label>
                      <Input type="email" value={wijzigingEmail} onChange={(e) => setWijzigingEmail(e.target.value)} placeholder="u@bedrijf.nl" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Omschrijving gewenste wijziging *</Label>
                    <Textarea
                      value={wijzigingTekst}
                      onChange={(e) => setWijzigingTekst(e.target.value)}
                      rows={4}
                      placeholder="Beschrijf welke aanpassing(en) u wilt doorvoeren en waarom…"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setActieFase("keuze")}>Annuleren</Button>
                    <Button size="sm" onClick={verstuurWijziging} disabled={!wijzigingTekst.trim() || bezig}>
                      {bezig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Edit3 className="h-3.5 w-3.5" />}
                      {bezig ? "Bezig…" : "Wijziging versturen"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Vraag stellen ────────────────────────────────────────────────── */}
            {actieFase === "vraag_open" && (
              <Card>
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-lg">Vraag stellen</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">Heeft u een vraag over de offerte? Wij beantwoorden hem zo snel mogelijk.</p>
                    </div>
                    <button onClick={() => setActieFase("keuze")} className="text-sm text-muted-foreground hover:text-foreground">
                      Annuleren
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Uw naam (optioneel)</Label>
                      <Input value={vraagNaam} onChange={(e) => setVraagNaam(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>E-mailadres (optioneel)</Label>
                      <Input type="email" value={vraagEmail} onChange={(e) => setVraagEmail(e.target.value)} placeholder="u@bedrijf.nl" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Uw vraag *</Label>
                    <Textarea value={vraagTekst} onChange={(e) => setVraagTekst(e.target.value)} rows={3} placeholder="Wat wilt u weten?" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setActieFase("keuze")}>Annuleren</Button>
                    <Button size="sm" onClick={verstuurVraag} disabled={!vraagTekst.trim() || bezig}>
                      {bezig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                      {bezig ? "Bezig…" : "Versturen"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Afwijzen ──────────────────────────────────────────────────────── */}
            {actieFase === "afwijzen_open" && (
              <Card className="border-rose-200">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-lg text-rose-700">Offerte afwijzen</h2>
                      <p className="text-sm text-muted-foreground mt-0.5">U staat op het punt om de offerte definitief af te wijzen.</p>
                    </div>
                    <button onClick={() => setActieFase("keuze")} className="text-sm text-muted-foreground hover:text-foreground">
                      Annuleren
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Reden (optioneel)</Label>
                    <Textarea
                      value={afwijsReden}
                      onChange={(e) => setAfwijsReden(e.target.value)}
                      placeholder="Waarom gaat u niet akkoord met deze offerte?"
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setActieFase("keuze")}>Annuleren</Button>
                    <Button size="sm" variant="destructive" onClick={bevestigAfwijzen} disabled={bezig}>
                      {bezig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                      {bezig ? "Bezig…" : "Definitief afwijzen"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        <div className="text-center space-y-1 pt-4">
          <p className="text-xs text-muted-foreground">
            Dit portaal is beveiligd door FPS Brandpreventie. Uw gegevens worden vertrouwelijk behandeld.
          </p>
          {o.offertenummer && (
            <p className="text-xs text-muted-foreground">Offerte {o.offertenummer}</p>
          )}
        </div>

      </main>
    </div>
  );
}
