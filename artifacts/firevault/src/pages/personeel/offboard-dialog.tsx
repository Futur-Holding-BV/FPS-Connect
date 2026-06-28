import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOffboardSamenvatting,
  useGenereerArbeidsgetuigenisAi,
  useOffboardMedewerker,
  getListMedewerkersQueryKey,
  getGetHrmStatsQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, LogOut, Sparkles, FileText, Shield,
  CheckCircle2, Clock, AlertCircle, Loader2, ChevronRight, Check,
} from "lucide-react";

type Stap = 1 | 2 | 3;

interface OffboardDialogProps {
  medewerkerId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function OffboardDialog({
  medewerkerId,
  open,
  onOpenChange,
  onSuccess,
}: OffboardDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [stap, setStap] = useState<Stap>(1);
  const [positiefGetuigschrift, setPositiefGetuigschrift] = useState(true);
  const [redenUitdienst, setRedenUitdienst] = useState("");
  const [extraToelichting, setExtraToelichting] = useState("");
  const [briefTekst, setBriefTekst] = useState("");
  const [briefBewerkt, setBriefBewerkt] = useState(false);
  const [offboardDatum, setOffboardDatum] = useState("");
  const [deactiveerAccount, setDeactiveerAccount] = useState(true);

  const ACTIES = [
    { id: "toegangspas",       label: "Toegangspas, sleutels en badges inleveren" },
    { id: "bedrijfsmiddelen",  label: "Bedrijfsmiddelen retourneren (laptop, telefoon, bedrijfsauto)" },
    { id: "email",             label: "E-mail doorsturen / out-of-office instellen" },
    { id: "handover",          label: "Handover en kennisoverdracht afgerond" },
    { id: "declaraties",       label: "Openstaande declaraties en onkostennota's afgehandeld" },
    { id: "contacten",         label: "Klanten en collega's geïnformeerd over vertrek" },
    { id: "loon",              label: "Eindafrekening verlof/vakantietoeslag berekend en doorgegeven" },
  ] as const;

  type ActieId = typeof ACTIES[number]["id"];
  const [acties, setActies] = useState<Record<ActieId, boolean>>({
    toegangspas: false, bedrijfsmiddelen: false, email: false,
    handover: false, declaraties: false, contacten: false, loon: false,
  });

  function toggleActie(id: ActieId) {
    setActies((a) => ({ ...a, [id]: !a[id] }));
  }

  useEffect(() => {
    if (open) {
      setStap(1);
      setPositiefGetuigschrift(true);
      setRedenUitdienst("");
      setExtraToelichting("");
      setBriefTekst("");
      setBriefBewerkt(false);
      setOffboardDatum("");
      setDeactiveerAccount(true);
      setActies({ toegangspas: false, bedrijfsmiddelen: false, email: false,
                  handover: false, declaraties: false, contacten: false, loon: false });
    }
  }, [open]);

  const { data: samenvatting, isLoading: ladenSamenvatting } =
    useGetOffboardSamenvatting(medewerkerId ?? 0);

  const genBrief = useGenereerArbeidsgetuigenisAi();
  const doOffboard = useOffboardMedewerker();

  function startGenereerBrief() {
    if (!medewerkerId) return;
    genBrief.mutate(
      {
        id: medewerkerId,
        data: {
          reden_uitdienst: redenUitdienst || undefined,
          positief_getuigschrift: positiefGetuigschrift,
          extra_toelichting: extraToelichting || undefined,
        },
      },
      {
        onSuccess: (data) => {
          setBriefTekst(data.brief_tekst);
          setBriefBewerkt(false);
        },
        onError: () => {
          toast({ title: "Brief genereren mislukt", variant: "destructive" });
        },
      }
    );
  }

  function uitvoerenOffboard() {
    if (!medewerkerId || !offboardDatum) return;
    doOffboard.mutate(
      {
        id: medewerkerId,
        data: {
          uit_dienst_per: offboardDatum,
          deactiveer_account: deactiveerAccount,
          reden: redenUitdienst || undefined,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          qc.invalidateQueries({ queryKey: getListMedewerkersQueryKey() });
          qc.invalidateQueries({ queryKey: getGetHrmStatsQueryKey() });
          toast({
            title: "Offboard geslaagd",
            description: `Medewerker is per ${offboardDatum} uit dienst gezet.`,
          });
          onSuccess?.();
        },
        onError: () => {
          toast({ title: "Offboard mislukt", variant: "destructive" });
        },
      }
    );
  }

  function drukBriefAf() {
    const w = window.open("", "_blank");
    if (!w) return;
    const tekst = briefTekst
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    w.document.write(
      `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8">` +
      `<title>Arbeidsgetuigenis — ${samenvatting?.medewerker_naam ?? ""}</title>` +
      `<style>body{font-family:Arial,sans-serif;margin:60px auto;max-width:700px;` +
      `font-size:14px;line-height:1.7;color:#000}pre{white-space:pre-wrap;` +
      `font-family:Arial,sans-serif}</style></head><body>` +
      `<pre>${tekst}</pre>` +
      `<script>window.print();<\/script></body></html>`
    );
    w.document.close();
  }

  const naam = samenvatting?.medewerker_naam ?? "medewerker";
  const certVerloopt = samenvatting?.certificaten_bijna_verlopen ?? [];
  const avgPunten = samenvatting?.avg_aandachtspunten ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-destructive" />
            Offboarden — {naam}
          </DialogTitle>
          <DialogDescription>
            Stap {stap} van 3 —{" "}
            {stap === 1
              ? "Overzicht & AVG-check"
              : stap === 2
              ? "Arbeidsgetuigenis"
              : "Bevestiging & uitvoering"}
          </DialogDescription>
        </DialogHeader>

        {/* Stap-indicator */}
        <div className="flex items-center gap-2 text-xs">
          {([1, 2, 3] as Stap[]).map((s) => (
            <div key={s} className="flex items-center gap-1">
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                  stap > s
                    ? "bg-primary text-primary-foreground"
                    : stap === s
                    ? "bg-primary/20 text-primary border border-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {stap > s ? <Check className="h-3 w-3" /> : s}
              </div>
              <span className={stap === s ? "font-medium" : "text-muted-foreground"}>
                {s === 1 ? "Overzicht" : s === 2 ? "Getuigschrift" : "Uitvoering"}
              </span>
              {s < 3 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* ── STAP 1: OVERZICHT ── */}
        {stap === 1 && (
          <div className="space-y-4">
            {ladenSamenvatting ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : samenvatting ? (
              <>
                <div className="rounded-lg border p-3 space-y-1">
                  <div className="font-semibold text-sm">{samenvatting.medewerker_naam}</div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                    {samenvatting.functie_naam && <span>{samenvatting.functie_naam}</span>}
                    {samenvatting.werkmaatschappij && <span>{samenvatting.werkmaatschappij}</span>}
                    {samenvatting.in_dienst_sinds && (
                      <span>In dienst: {samenvatting.in_dienst_sinds}</span>
                    )}
                    {samenvatting.dienstverband && <span>{samenvatting.dienstverband}</span>}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Aandachtspunten voor offboarding</h3>

                  {/* Verlof */}
                  <div
                    className={`rounded-md border p-3 flex items-start gap-2 text-sm ${
                      samenvatting.verlof_totaal_uren > 0
                        ? "border-amber-200 bg-amber-50"
                        : "border-emerald-200 bg-emerald-50/50"
                    }`}
                  >
                    <Clock
                      className={`h-4 w-4 mt-0.5 shrink-0 ${
                        samenvatting.verlof_totaal_uren > 0
                          ? "text-amber-600"
                          : "text-emerald-600"
                      }`}
                    />
                    <div>
                      <div
                        className={`font-medium ${
                          samenvatting.verlof_totaal_uren > 0
                            ? "text-amber-800"
                            : "text-emerald-800"
                        }`}
                      >
                        Verlof:{" "}
                        {samenvatting.verlof_totaal_uren > 0
                          ? `${samenvatting.verlof_totaal_uren} uur openstaand`
                          : "Geen openstaand verlof"}
                      </div>
                      {samenvatting.verlof_totaal_uren > 0 && (
                        <div className="text-xs text-amber-700 mt-0.5">
                          Uitbetalen of laten opnemen vóór de laatste werkdag.
                          CAO Bouw & Infra art. 24 van toepassing.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Openstaande aanvragen */}
                  {samenvatting.openstaande_aanvragen > 0 && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 flex items-start gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                      <div>
                        <div className="font-medium text-amber-800">
                          {samenvatting.openstaande_aanvragen} openstaande
                          verlofaanvra
                          {samenvatting.openstaande_aanvragen === 1 ? "ag" : "gen"}
                        </div>
                        <div className="text-xs text-amber-700 mt-0.5">
                          Beslis op openstaande aanvragen vóór de offboarding.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Certificaten */}
                  {certVerloopt.length > 0 && (
                    <div className="rounded-md border p-3 space-y-1 text-sm">
                      <div className="font-medium flex items-center gap-1.5">
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                        Certificaten die komend jaar verlopen
                      </div>
                      <ul className="pl-5 space-y-0.5 text-xs text-muted-foreground list-disc">
                        {certVerloopt.map((c, i) => (
                          <li key={i}>
                            {c.naam} — vervalt {c.verloopt_op}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Systeemaccount */}
                  <div
                    className={`rounded-md border p-3 flex items-start gap-2 text-sm ${
                      samenvatting.gebruiker_actief
                        ? "border-amber-200 bg-amber-50"
                        : "border-slate-200"
                    }`}
                  >
                    {samenvatting.gebruiker_actief ? (
                      <>
                        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                        <div>
                          <div className="font-medium text-amber-800">
                            Systeemaccount is actief
                          </div>
                          <div className="text-xs text-amber-700 mt-0.5">
                            Deactiveer het account bij offboarding (stap 3).
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600" />
                        <div className="text-emerald-800 font-medium">
                          Geen actief systeemaccount
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* AVG */}
                <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-violet-900">
                    <Shield className="h-4 w-4" />
                    AVG-bewaarplicht (automatisch berekend)
                  </div>
                  <div className="text-xs text-violet-800">
                    Persoonsgegevens bewaren tot:{" "}
                    <strong>{samenvatting.avg_bewaar_tot}</strong>
                    <span className="ml-2 text-violet-600">(uitdiensttreding + 7 jaar)</span>
                  </div>
                  {avgPunten.length > 0 && (
                    <ul className="pl-4 space-y-0.5 text-xs text-violet-700 list-disc">
                      {avgPunten.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ── STAP 2: ARBEIDSGETUIGENIS ── */}
        {stap === 2 && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Reden uitdiensttreding</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  value={redenUitdienst}
                  onChange={(e) => setRedenUitdienst(e.target.value)}
                >
                  <option value="">Niet opgegeven</option>
                  <option value="eigen verzoek">Eigen verzoek medewerker</option>
                  <option value="afloop tijdelijk contract">
                    Afloop tijdelijk contract
                  </option>
                  <option value="reorganisatie">Reorganisatie</option>
                  <option value="pensioen">Pensioen</option>
                  <option value="wederzijds goedvinden">
                    Wederzijds goedvinden
                  </option>
                  <option value="ontslag op staande voet">
                    Ontslag op staande voet
                  </option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Type getuigschrift</Label>
                <div className="flex items-center gap-2 h-9">
                  <Checkbox
                    id="positief-cb"
                    checked={positiefGetuigschrift}
                    onCheckedChange={(v) =>
                      setPositiefGetuigschrift(v === true)
                    }
                  />
                  <label htmlFor="positief-cb" className="text-sm cursor-pointer">
                    Positieve aanbeveling opnemen
                  </label>
                </div>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Extra toelichting voor AI (optioneel)</Label>
                <Textarea
                  placeholder="Bijv. behaalde projecten, bijzondere prestaties of te vermijden onderwerpen..."
                  value={extraToelichting}
                  onChange={(e) => setExtraToelichting(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <Button
              onClick={startGenereerBrief}
              disabled={genBrief.isPending}
              className="w-full"
              variant={briefTekst ? "outline" : "default"}
            >
              {genBrief.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Brief genereren...
                </>
              ) : briefTekst ? (
                <>
                  <Sparkles className="h-4 w-4" /> Opnieuw genereren met AI
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Arbeidsgetuigenis genereren met AI
                </>
              )}
            </Button>

            {briefTekst && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4" />
                    Arbeidsgetuigenis
                    {genBrief.data?.ai_gebruikt && (
                      <Badge variant="secondary" className="text-[10px]">
                        AI
                      </Badge>
                    )}
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={drukBriefAf}
                    className="text-xs h-7"
                  >
                    Afdrukken / PDF
                  </Button>
                </div>
                <Textarea
                  value={briefTekst}
                  onChange={(e) => {
                    setBriefTekst(e.target.value);
                    setBriefBewerkt(true);
                  }}
                  rows={18}
                  className="font-mono text-xs resize-y"
                />
                {briefBewerkt && (
                  <p className="text-xs text-amber-600">
                    De brieftekst is handmatig bewerkt.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── STAP 3: BEVESTIGING ── */}
        {stap === 3 && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Datum uit dienst *</Label>
              <DatePicker
                value={offboardDatum}
                onChange={(v) => setOffboardDatum(v ?? "")}
              />
            </div>

            {/* Praktische actielijst */}
            <div className="rounded-lg border p-3 space-y-2">
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                Praktische acties vóór de laatste werkdag
              </div>
              <p className="text-xs text-muted-foreground">
                Vink af wat geregeld is. Dit wordt niet opgeslagen — het dient als reminder.
              </p>
              <div className="space-y-2 pt-1">
                {ACTIES.map(({ id, label }) => (
                  <div key={id} className="flex items-center gap-2">
                    <Checkbox
                      id={`actie-${id}`}
                      checked={acties[id]}
                      onCheckedChange={() => toggleActie(id)}
                    />
                    <label
                      htmlFor={`actie-${id}`}
                      className={`text-sm cursor-pointer ${acties[id] ? "line-through text-muted-foreground" : ""}`}
                    >
                      {label}
                    </label>
                  </div>
                ))}
              </div>
              {Object.values(acties).every(Boolean) && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium pt-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Alle praktische acties afgevinkt
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="deactiveer-cb"
                checked={deactiveerAccount}
                onCheckedChange={(v) => setDeactiveerAccount(v === true)}
              />
              <label htmlFor="deactiveer-cb" className="text-sm cursor-pointer">
                Systeemaccount (FPS Connect) deactiveren
                {samenvatting && !samenvatting.gebruiker_actief && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (geen actief account gevonden)
                  </span>
                )}
              </label>
            </div>

            {samenvatting && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3 text-xs text-violet-800 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  AVG-herinnering
                </div>
                <div>
                  Persoonsgegevens bewaren tot:{" "}
                  <strong>{samenvatting.avg_bewaar_tot}</strong>
                </div>
                <div className="text-violet-600">
                  Loongegevens, arbeidscontract en correspondentie vallen onder
                  fiscale bewaarplicht (7 jaar).
                </div>
              </div>
            )}

            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <div className="font-semibold text-destructive flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4" />
                Let op — dit is onomkeerbaar
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                <li>
                  Medewerker wordt als inactief gemarkeerd per de gekozen datum
                </li>
                {deactiveerAccount && samenvatting?.gebruiker_actief && (
                  <li>Systeemaccount wordt direct gedeactiveerd</li>
                )}
                <li>Verlofopbouw stopt per uitdienstdatum</li>
              </ul>
            </div>
          </div>
        )}

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
          {stap > 1 && (
            <Button
              variant="outline"
              onClick={() => setStap((s) => (s - 1) as Stap)}
            >
              Vorige stap
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="sm:mr-auto"
          >
            Annuleren
          </Button>
          {stap < 3 ? (
            <Button onClick={() => setStap((s) => (s + 1) as Stap)}>
              Volgende stap
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={uitvoerenOffboard}
              disabled={!offboardDatum || doOffboard.isPending}
            >
              {doOffboard.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Bezig...
                </>
              ) : (
                <>
                  <LogOut className="h-4 w-4" /> Offboard uitvoeren
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
