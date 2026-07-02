// Werkvoorbereiding — overzicht actieve opdrachten + openstaande materiaal aanvragen
import { Link } from "wouter";
import { useListOpdrachten } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  ShoppingCart,
  CalendarCheck,
  Hammer,
  Package,
  AlertTriangle,
  Camera,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  User,
} from "lucide-react";
import { useState } from "react";

function euro(n: number | null | undefined) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n ?? 0);
}

const OPDRACHT_STATUS: Record<string, { label: string; kleur: string }> = {
  actief: { label: "Actief", kleur: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  gepauzeerd: { label: "Gepauzeerd", kleur: "bg-amber-100 text-amber-800 border-amber-200" },
  afgerond: { label: "Afgerond", kleur: "bg-slate-100 text-slate-700 border-slate-200" },
  geannuleerd: { label: "Geannuleerd", kleur: "bg-rose-100 text-rose-800 border-rose-200" },
};

const WB_STATUS: Record<string, { label: string; kleur: string }> = {
  concept: { label: "Concept", kleur: "bg-amber-50 text-amber-800 border-amber-200" },
  vastgesteld: { label: "Vastgesteld", kleur: "bg-emerald-50 text-emerald-800 border-emerald-200" },
};

const SCOPE_CONFIG: Record<string, { label: string; kleur: string }> = {
  binnen_scope: { label: "Binnen scope", kleur: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  buiten_scope: { label: "Buiten scope", kleur: "bg-rose-100 text-rose-800 border-rose-200" },
  onduidelijk: { label: "Scope onduidelijk", kleur: "bg-amber-100 text-amber-800 border-amber-200" },
};

const REDEN_LABEL: Record<string, string> = {
  op: "Op / verbruikt",
  beschadigd: "Beschadigd",
  nodig: "Nodig voor werk",
};

interface MateriaalAanvraag {
  id: number;
  opdracht_id: number;
  opdracht_titel: string | null;
  opdracht_werknummer: string | null;
  ingediend_door_naam: string | null;
  reden: string;
  omschrijving: string | null;
  foto_pad: string | null;
  status: string;
  ai_artikel_naam: string | null;
  ai_leverancier: string | null;
  ai_prijs_indicatie: string | null;
  ai_scope_check: string | null;
  ai_scope_toelichting: string | null;
  ai_advies: string | null;
  behandel_notitie: string | null;
  aangemaakt_op: string | null;
}

interface UitvoerderBericht {
  id: number;
  rol: "monteur" | "ai";
  tekst: string | null;
  foto_pad: string | null;
  aangemaakt_op: string | null;
}

interface UitvoerderSessie {
  id: number;
  status: "actief" | "bevestigd";
  opdracht_id: number | null;
  opdracht_titel?: string | null;
  opdracht_werknummer?: string | null;
  monteur_id: number;
  monteur_naam?: string | null;
  bevestigde_aanpak: string | null;
  aangemaakt_op: string | null;
  bijgewerkt_op: string | null;
  berichten: UitvoerderBericht[];
}

function tijdGeleden(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} min geleden`;
  const uur = Math.floor(min / 60);
  if (uur < 24) return `${uur} uur geleden`;
  return `${Math.floor(uur / 24)} dag${Math.floor(uur / 24) > 1 ? "en" : ""} geleden`;
}

function MateriaalAanvraagKaart({ aanvraag, onBehandeld }: { aanvraag: MateriaalAanvraag; onBehandeld: () => void }) {
  const qc = useQueryClient();
  const [notitie, setNotitie] = useState(aanvraag.behandel_notitie ?? "");
  const [uitgevouwen, setUitgevouwen] = useState(false);
  const [heranalyseer, setHeranalyseer] = useState(false);

  const patchStatus = useMutation({
    mutationFn: async (status: string) => {
      const resp = await fetch(`/api/materiaal-aanvragen/${aanvraag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, behandel_notitie: notitie || null }),
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Status bijwerken mislukt");
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["materiaal-aanvragen"] });
      onBehandeld();
    },
  });

  async function doHeranalyseer() {
    setHeranalyseer(true);
    try {
      await fetch(`/api/materiaal-aanvragen/${aanvraag.id}/heranalyseer`, {
        method: "POST",
        credentials: "include",
      });
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["materiaal-aanvragen"] });
        setHeranalyseer(false);
      }, 4000);
    } catch {
      setHeranalyseer(false);
    }
  }

  const heeftAi = !!(aanvraag.ai_artikel_naam ?? aanvraag.ai_advies);
  const scopeCfg = aanvraag.ai_scope_check ? SCOPE_CONFIG[aanvraag.ai_scope_check] : null;

  return (
    <Card className={`border ${aanvraag.ai_scope_check === "buiten_scope" ? "border-rose-200" : "border-border"}`}>
      <CardContent className="p-4 space-y-3">
        {/* Kop */}
        <div className="flex items-start gap-3">
          {aanvraag.foto_pad ? (
            <a href={`/api/storage${aanvraag.foto_pad}`} target="_blank" rel="noreferrer">
              <img
                src={`/api/storage${aanvraag.foto_pad}`}
                alt="Artikel foto"
                className="w-20 h-20 object-cover rounded-lg border shrink-0 hover:opacity-90 transition-opacity"
              />
            </a>
          ) : (
            <div className="w-20 h-20 rounded-lg border bg-muted flex items-center justify-center shrink-0">
              <Camera className="h-6 w-6 text-muted-foreground" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className={
                aanvraag.reden === "beschadigd"
                  ? "bg-amber-100 text-amber-800 border-amber-200"
                  : aanvraag.reden === "op"
                    ? "bg-rose-100 text-rose-800 border-rose-200"
                    : "bg-blue-100 text-blue-800 border-blue-200"
              }>
                {REDEN_LABEL[aanvraag.reden] ?? aanvraag.reden}
              </Badge>
              {scopeCfg && (
                <Badge variant="outline" className={scopeCfg.kleur}>
                  {scopeCfg.label}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground ml-auto">{tijdGeleden(aanvraag.aangemaakt_op)}</span>
            </div>

            {heeftAi ? (
              <p className="font-semibold text-sm leading-snug">
                {aanvraag.ai_artikel_naam ?? "(artikel niet herkend)"}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">AI analyse wordt uitgevoerd...</p>
            )}

            <p className="text-xs text-muted-foreground mt-0.5">
              {[aanvraag.opdracht_werknummer, aanvraag.opdracht_titel].filter(Boolean).join(" — ")}
              {aanvraag.ingediend_door_naam && (
                <span className="ml-2 opacity-70">door {aanvraag.ingediend_door_naam}</span>
              )}
            </p>

            {aanvraag.omschrijving && (
              <p className="text-xs text-muted-foreground mt-1 italic">"{aanvraag.omschrijving}"</p>
            )}
          </div>
        </div>

        {/* AI analyse */}
        {heeftAi && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-amber-800 text-xs font-semibold">
              <Sparkles className="h-3.5 w-3.5" />
              AI Analyse
            </div>
            {aanvraag.ai_leverancier && (
              <p className="text-xs text-amber-900">
                <span className="font-medium">Leverancier:</span> {aanvraag.ai_leverancier}
              </p>
            )}
            {aanvraag.ai_prijs_indicatie && (
              <p className="text-xs text-amber-900">
                <span className="font-medium">Prijs:</span> {aanvraag.ai_prijs_indicatie}
              </p>
            )}
            {aanvraag.ai_scope_toelichting && (
              <p className="text-xs text-amber-900">
                <span className="font-medium">Scope:</span> {aanvraag.ai_scope_toelichting}
              </p>
            )}
            {aanvraag.ai_advies && (
              <div className="pt-1 border-t border-amber-200">
                <p className="text-xs font-medium text-amber-800 mb-0.5">Advies aan werkvoorbereider:</p>
                <p className="text-xs text-amber-900 leading-relaxed">{aanvraag.ai_advies}</p>
              </div>
            )}
          </div>
        )}

        {/* Details uitvouwen */}
        <button
          onClick={() => setUitgevouwen(!uitgevouwen)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          {uitgevouwen ? "Minder tonen" : "Notitie + behandelen"}
          <ArrowRight className={`h-3 w-3 transition-transform ${uitgevouwen ? "rotate-90" : ""}`} />
        </button>

        {uitgevouwen && (
          <div className="space-y-3 pt-1">
            <textarea
              value={notitie}
              onChange={(e) => setNotitie(e.target.value)}
              placeholder="Notitie voor de aanvrager (optioneel)..."
              rows={2}
              className="w-full text-xs border border-border rounded-md px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring bg-background"
            />
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-slate-300 text-slate-600"
                onClick={() => patchStatus.mutate("in_behandeling")}
                disabled={patchStatus.isPending || aanvraag.status === "in_behandeling"}
              >
                <Clock className="h-3.5 w-3.5 mr-1" />
                In behandeling
              </Button>
              <Button
                size="sm"
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => patchStatus.mutate("goedgekeurd")}
                disabled={patchStatus.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                Goedkeuren
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-rose-300 text-rose-700 hover:bg-rose-50"
                onClick={() => patchStatus.mutate("afgewezen")}
                disabled={patchStatus.isPending}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Afwijzen
              </Button>
              {!heeftAi && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => void doHeranalyseer()}
                  disabled={heranalyseer}
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${heranalyseer ? "animate-spin" : ""}`} />
                  Heranalyseer
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function WerkvoorbereidingOverzicht() {
  const { data: opdrachten, isLoading } = useListOpdrachten({ status: "actief" });
  const qc = useQueryClient();

  const { data: aanvragen, isLoading: aanvragenLaden } = useQuery<MateriaalAanvraag[]>({
    queryKey: ["materiaal-aanvragen", "nieuw-in-behandeling"],
    queryFn: async () => {
      const resp = await fetch("/api/materiaal-aanvragen?status=nieuw", { credentials: "include" });
      if (!resp.ok) return [];
      const nieuw = await resp.json() as MateriaalAanvraag[];
      const resp2 = await fetch("/api/materiaal-aanvragen?status=in_behandeling", { credentials: "include" });
      const inBeh = resp2.ok ? await resp2.json() as MateriaalAanvraag[] : [];
      return [...nieuw, ...inBeh].sort(
        (a, b) => new Date(b.aangemaakt_op ?? 0).getTime() - new Date(a.aangemaakt_op ?? 0).getTime(),
      );
    },
    refetchInterval: 15000,
  });

  const openAanvragen = aanvragen ?? [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Werkvoorbereiding</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Materiaal meldingen, inkoopplanning en uitvoeringsplanning
        </p>
      </div>

      {/* ── Materiaal meldingen ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold">Materiaal meldingen</h2>
          {openAanvragen.length > 0 && (
            <Badge className="bg-amber-500 text-white border-0 text-xs px-1.5 py-0">
              {openAanvragen.length}
            </Badge>
          )}
          {aanvragenLaden && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        {aanvragenLaden ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}
          </div>
        ) : openAanvragen.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm text-muted-foreground">Geen openstaande materiaal meldingen</p>
              <p className="text-xs text-muted-foreground mt-0.5 opacity-70">
                Monteurs melden via de FPS Monteur-app artikelen die op, beschadigd of nodig zijn.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {openAanvragen.map((a) => (
              <MateriaalAanvraagKaart
                key={a.id}
                aanvraag={a}
                onBehandeld={() => void qc.invalidateQueries({ queryKey: ["materiaal-aanvragen"] })}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Actieve opdrachten ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Actieve opdrachten</h2>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : !opdrachten || opdrachten.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Hammer className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-muted-foreground">Geen actieve opdrachten gevonden.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Maak een opdracht aan via een offerte.
              </p>
              <Link href="/offertes">
                <Button variant="outline" size="sm" className="mt-4">Naar offertes</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {opdrachten.map(o => {
              const opStatus = OPDRACHT_STATUS[o.status] ?? { label: o.status, kleur: "" };
              const wbStatus = o.begroting_status ? WB_STATUS[o.begroting_status] : null;

              return (
                <Card key={o.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{o.titel}</span>
                          <Badge variant="outline" className={`text-xs ${opStatus.kleur}`}>
                            {opStatus.label}
                          </Badge>
                          {wbStatus && (
                            <Badge variant="outline" className={`text-xs ${wbStatus.kleur}`}>
                              Begroting: {wbStatus.label}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {o.werknummer && <span>{o.werknummer}</span>}
                          {o.opdrachtgever && <span>{o.opdrachtgever}</span>}
                          {o.begroting_totaal_arbeid_uren != null && (
                            <span className="flex items-center gap-1">
                              <Package className="h-3 w-3" />
                              {o.begroting_totaal_arbeid_uren.toFixed(1)} u begroot
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-blue-600">
                            <ShoppingCart className="h-3 w-3" />
                            Inkoop
                          </span>
                          <span className="flex items-center gap-1 text-blue-600">
                            <CalendarCheck className="h-3 w-3" />
                            Uitvoering
                          </span>
                        </div>
                      </div>
                      <Link href={`/opdrachten/${o.id}`}>
                        <Button variant="outline" size="sm" className="shrink-0">
                          Openen <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
