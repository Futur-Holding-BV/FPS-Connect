import { useState } from "react";
import {
  useGetScabMails, usePostScabMailsGenereer,
  usePatchScabMailsId, usePostScabMailsIdVerzend,
} from "@workspace/api-client-react";
import { useListWerkgevers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sparkles, Send, Mail, Pencil, Check, ArrowRight,
  ClipboardList, AlertTriangle, Info,
} from "lucide-react";
import { Link } from "wouter";
import type { ScabMail } from "@workspace/api-client-react";

const HUIDIG_JAAR = new Date().getFullYear();
const HUIDIG_MAAND = new Date().getMonth() + 1;

const MAAND_NAMEN = [
  "januari","februari","maart","april","mei","juni",
  "juli","augustus","september","oktober","november","december",
];

const STATUS_CONFIG: Record<string, { label: string; kleur: string }> = {
  concept: { label: "Concept", kleur: "bg-amber-100 text-amber-800 border-amber-200" },
  verzonden: { label: "Verzonden", kleur: "bg-green-100 text-green-800 border-green-200" },
};

// ── Workflow-indicator ────────────────────────────────────────────────────────

const STAPPEN = [
  { nr: 1, label: "Mutaties accorderen", href: "/salaris-mutaties" },
  { nr: 2, label: "AI-conceptmail genereren" },
  { nr: 3, label: "Controleren & aanpassen" },
  { nr: 4, label: "Verzenden naar SCAB" },
];

function WorkflowIndicator({ actief }: { actief: number }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-1">
      {STAPPEN.map((stap, i) => (
        <div key={stap.nr} className="flex items-center shrink-0">
          {"href" in stap && stap.href ? (
            <Link href={stap.href}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer
                ${actief > stap.nr
                  ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                  : "bg-muted text-muted-foreground border-transparent hover:bg-muted/80"}`}>
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 bg-green-200">✓</span>
              {stap.label}
            </Link>
          ) : (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
              ${actief === stap.nr
                ? "bg-primary text-primary-foreground border-primary"
                : actief > stap.nr
                  ? "bg-green-50 text-green-700 border-green-200"
                  : "bg-muted text-muted-foreground border-transparent"}`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0
                ${actief === stap.nr ? "bg-white/20" : actief > stap.nr ? "bg-green-200" : "bg-muted-foreground/20"}`}>
                {actief > stap.nr ? "✓" : stap.nr}
              </span>
              {stap.label}
            </div>
          )}
          {i < STAPPEN.length - 1 && (
            <ArrowRight size={14} className="text-muted-foreground mx-1 shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Hoofdpagina ────────────────────────────────────────────────────────────────

export default function ScabMailPage() {
  const [jaar, setJaar] = useState(HUIDIG_JAAR);
  const [maand, setMaand] = useState(HUIDIG_MAAND);
  const [werkmaatschappijFilter, setWerkmaatschappijFilter] = useState("FPS Bouw & Renovatie");
  const [genereerDialogOpen, setGenereerDialogOpen] = useState(false);
  const [bewerkenMail, setBewerkenMail] = useState<ScabMail | null>(null);
  const [verzendDialogOpen, setVerzendDialogOpen] = useState<ScabMail | null>(null);

  const [genereerWerkmaatschappij, setGenereerWerkmaatschappij] = useState("FPS Bouw & Renovatie");
  const [genereerWerkgeverId, setGenereerWerkgeverId] = useState<number | null>(null);

  const params: Record<string, unknown> = { jaar, maand };
  if (werkmaatschappijFilter !== "alle") params.werkmaatschappij = werkmaatschappijFilter;

  const { data: mails = [], refetch } = useGetScabMails(params, { query: { queryKey: ["scab-mails", jaar, maand, werkmaatschappijFilter] } });
  const { data: werkgevers = [] } = useListWerkgevers();
  const genereer = usePostScabMailsGenereer();
  const patchMail = usePatchScabMailsId();
  const verzendMutatie = usePostScabMailsIdVerzend();

  const [bewerkForm, setBewerkForm] = useState({ onderwerp: "", inhoud: "", scab_email_adres: "" });

  function openBewerken(mail: ScabMail) {
    setBewerkForm({
      onderwerp: mail.onderwerp,
      inhoud: mail.inhoud,
      scab_email_adres: mail.scab_email_adres ?? "",
    });
    setBewerkenMail(mail);
  }

  async function opslaan() {
    if (!bewerkenMail) return;
    await patchMail.mutateAsync({
      id: bewerkenMail.id,
      data: {
        onderwerp: bewerkForm.onderwerp,
        inhoud: bewerkForm.inhoud,
        scab_email_adres: bewerkForm.scab_email_adres || undefined,
      },
    });
    setBewerkenMail(null);
    refetch();
  }

  async function doGenereer() {
    if (!genereerWerkmaatschappij) return;
    await genereer.mutateAsync({
      data: {
        werkmaatschappij: genereerWerkmaatschappij,
        werkgever_id: genereerWerkgeverId ?? undefined,
        periode_jaar: jaar,
        periode_maand: maand,
      },
    });
    setGenereerDialogOpen(false);
    refetch();
  }

  async function doVerzend() {
    if (!verzendDialogOpen) return;
    await verzendMutatie.mutateAsync({ id: verzendDialogOpen.id });
    setVerzendDialogOpen(null);
    refetch();
  }

  const heeftConcept = mails.some((m) => m.status === "concept");
  const heeftVerzonden = mails.some((m) => m.status === "verzonden");
  const werkflowStap = heeftVerzonden ? 4 : heeftConcept ? 3 : 2;

  const jaren = [HUIDIG_JAAR, HUIDIG_JAAR - 1];

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Mail className="text-primary" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">SCAB Salarismails</h1>
            <p className="text-sm text-muted-foreground">
              AI genereert een conceptmail op basis van geaccordeerde mutaties — altijd eerst controleren vóór verzending
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild className="text-xs">
            <Link href="/salaris-mutaties">
              <ClipboardList size={14} className="mr-1.5" />
              Salarismutaties
            </Link>
          </Button>
          <Button onClick={() => {
            setGenereerWerkmaatschappij(werkmaatschappijFilter !== "alle" ? werkmaatschappijFilter : "FPS Bouw & Renovatie");
            const wg = werkgevers.find((w) => w.naam === (werkmaatschappijFilter !== "alle" ? werkmaatschappijFilter : "FPS Bouw & Renovatie"));
            setGenereerWerkgeverId(wg?.id ?? null);
            setGenereerDialogOpen(true);
          }} size="sm">
            <Sparkles size={14} className="mr-1.5" />
            Concept genereren
          </Button>
        </div>
      </div>

      {/* Workflow-indicator */}
      <WorkflowIndicator actief={werkflowStap} />

      {/* Uitleg hoe AI werkt */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm">
        <Sparkles size={18} className="text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-amber-900">Hoe werkt de AI-conceptmail?</p>
          <p className="text-amber-800 mt-1">
            De AI leest alle geaccordeerde salarismutaties voor de geselecteerde periode en stelt
            een complete, formele e-mail op gericht aan de contactpersoon bij SCAB. Per mutatie worden
            de medewerker, het type wijziging, de toelichting en de ingangsdatum verwerkt.
            U controleert de inhoud, past aan waar nodig, en verstuurt definitief.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={String(jaar)} onValueChange={(v) => setJaar(Number(v))}>
          <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {jaren.map((j) => <SelectItem key={j} value={String(j)}>{j}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={String(maand)} onValueChange={(v) => setMaand(Number(v))}>
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MAAND_NAMEN.map((nm, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{nm}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={werkmaatschappijFilter} onValueChange={setWerkmaatschappijFilter}>
          <SelectTrigger className="w-52 h-8 text-sm"><SelectValue placeholder="Alle werkmaatschappijen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle werkmaatschappijen</SelectItem>
            {werkgevers.map((wg) => <SelectItem key={wg.id} value={wg.naam}>{wg.naam}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Mails */}
      {mails.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Mail size={36} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium text-muted-foreground">Geen conceptmails voor {MAAND_NAMEN[maand - 1]} {jaar}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Zorg dat de salarismutaties geaccordeerd zijn en klik dan op "Concept genereren".
            </p>
            <div className="flex gap-2 justify-center mt-4">
              <Button variant="outline" size="sm" asChild>
                <Link href="/salaris-mutaties">
                  <ClipboardList size={14} className="mr-1.5" />
                  Naar salarismutaties
                </Link>
              </Button>
              <Button size="sm" onClick={() => setGenereerDialogOpen(true)}>
                <Sparkles size={14} className="mr-1.5" />
                Concept genereren
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {mails.map((mail) => {
            const sc = STATUS_CONFIG[mail.status] ?? { label: mail.status, kleur: "bg-gray-100 text-gray-700 border-gray-200" };
            return (
              <Card key={mail.id} className={mail.status === "verzonden" ? "opacity-90" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${sc.kleur}`}>{sc.label}</span>
                        <Badge variant="outline" className="text-xs">{mail.werkmaatschappij}</Badge>
                        {mail.aantal_mutaties > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {mail.aantal_mutaties} mutaties verwerkt
                          </Badge>
                        )}
                        {mail.verzond_op && (
                          <span className="text-xs text-muted-foreground">
                            Verzonden {new Date(mail.verzond_op).toLocaleDateString("nl-NL")}
                            {mail.verzond_door_naam && ` door ${mail.verzond_door_naam}`}
                          </span>
                        )}
                      </div>
                      <CardTitle className="text-base font-medium">{mail.onderwerp}</CardTitle>
                      {mail.scab_email_adres && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Aan: <span className="font-mono">{mail.scab_email_adres}</span>
                          {mail.contactpersoon && ` (${mail.contactpersoon})`}
                        </p>
                      )}
                      {!mail.scab_email_adres && mail.status === "concept" && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <AlertTriangle size={13} className="text-amber-500" />
                          <p className="text-xs text-amber-700">
                            Geen SCAB-e-mailadres ingesteld — stel in via Beheer &rsaquo; Werkgevers.
                          </p>
                        </div>
                      )}
                    </div>
                    {mail.status === "concept" && (
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="h-8 text-xs"
                          onClick={() => openBewerken(mail)}>
                          <Pencil size={12} className="mr-1" />
                          Bewerken
                        </Button>
                        <Button size="sm" className="h-8 text-xs"
                          onClick={() => setVerzendDialogOpen(mail)}>
                          <Send size={12} className="mr-1" />
                          Verzenden
                        </Button>
                      </div>
                    )}
                    {mail.status === "verzonden" && (
                      <Badge variant="secondary" className="text-xs shrink-0 bg-green-100 text-green-800 border-green-200">
                        <Check size={11} className="mr-1" />
                        Definitief verzonden
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {mail.status === "concept" && (
                    <div className="flex items-center gap-1.5 mb-2 text-xs text-amber-700">
                      <Info size={12} className="shrink-0" />
                      <span>Dit is een AI-concept. Controleer de inhoud zorgvuldig vóór verzending.</span>
                    </div>
                  )}
                  <pre className="text-sm whitespace-pre-wrap font-sans text-muted-foreground border rounded p-3 bg-muted/30 max-h-56 overflow-y-auto">
                    {mail.inhoud}
                  </pre>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Genereer dialog */}
      <Dialog open={genereerDialogOpen} onOpenChange={setGenereerDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={18} className="text-amber-500" />
              AI-conceptmail genereren
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">De AI doet het volgende:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Leest alle geaccordeerde mutaties voor de periode</li>
                <li>Stelt een formele e-mail op in het Nederlands</li>
                <li>Vermeldt per medewerker: type, toelichting, ingangsdatum</li>
                <li>Sluit af met een professionele ondertekening</li>
              </ul>
              <p className="mt-1.5 font-medium">U controleert altijd de inhoud vóór verzending.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Werkmaatschappij</Label>
              <Select value={genereerWerkmaatschappij} onValueChange={(v) => {
                setGenereerWerkmaatschappij(v);
                const wg = werkgevers.find((w) => w.naam === v);
                setGenereerWerkgeverId(wg?.id ?? null);
              }}>
                <SelectTrigger><SelectValue placeholder="Kies werkmaatschappij" /></SelectTrigger>
                <SelectContent>
                  {werkgevers.map((wg) => <SelectItem key={wg.id} value={wg.naam}>{wg.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Jaar</Label>
                <Select value={String(jaar)} onValueChange={(v) => setJaar(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {jaren.map((j) => <SelectItem key={j} value={String(j)}>{j}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Maand</Label>
                <Select value={String(maand)} onValueChange={(v) => setMaand(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MAAND_NAMEN.map((nm, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{nm}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenereerDialogOpen(false)}>Annuleren</Button>
            <Button onClick={doGenereer}
              disabled={!genereerWerkmaatschappij || genereer.isPending}>
              {genereer.isPending
                ? <><span className="animate-pulse">AI genereert...</span></>
                : <><Sparkles size={14} className="mr-1.5" />Genereren</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bewerken dialog */}
      {bewerkenMail && (
        <Dialog open={!!bewerkenMail} onOpenChange={() => setBewerkenMail(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Conceptmail bewerken</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground p-2 bg-muted/50 rounded">
                <Info size={12} className="shrink-0" />
                Pas de inhoud aan zodat alle informatie correct en volledig is vóór verzending.
              </div>
              <div className="space-y-1.5">
                <Label>SCAB e-mailadres</Label>
                <Input value={bewerkForm.scab_email_adres}
                  onChange={(e) => setBewerkForm((f) => ({ ...f, scab_email_adres: e.target.value }))}
                  placeholder="naam@scab.nl" />
              </div>
              <div className="space-y-1.5">
                <Label>Onderwerp</Label>
                <Input value={bewerkForm.onderwerp}
                  onChange={(e) => setBewerkForm((f) => ({ ...f, onderwerp: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Inhoud</Label>
                <Textarea rows={14} value={bewerkForm.inhoud}
                  onChange={(e) => setBewerkForm((f) => ({ ...f, inhoud: e.target.value }))}
                  className="font-mono text-sm" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBewerkenMail(null)}>Annuleren</Button>
              <Button onClick={opslaan} disabled={patchMail.isPending}>
                {patchMail.isPending ? "Opslaan..." : "Opslaan"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Verzenden bevestigen dialog */}
      {verzendDialogOpen && (
        <Dialog open={!!verzendDialogOpen} onOpenChange={() => setVerzendDialogOpen(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send size={18} />
                Mail definitief verzenden
              </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-3">
              <div className="p-3 rounded-lg bg-muted/50 border text-sm space-y-1">
                <p className="font-medium">{verzendDialogOpen.onderwerp}</p>
                <p className="text-muted-foreground">
                  Naar: <span className="font-mono">{verzendDialogOpen.scab_email_adres ?? "Geen e-mailadres ingesteld"}</span>
                </p>
                {verzendDialogOpen.contactpersoon && (
                  <p className="text-muted-foreground">Contactpersoon: {verzendDialogOpen.contactpersoon}</p>
                )}
              </div>
              {!verzendDialogOpen.scab_email_adres && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                  <AlertTriangle size={16} className="shrink-0" />
                  Stel eerst een SCAB-e-mailadres in via Beheer &rsaquo; Werkgevers.
                </div>
              )}
              <Separator />
              <p className="text-sm text-muted-foreground">
                Na verzending kan de mail niet meer worden aangepast. Zorg dat u de inhoud heeft gecontroleerd.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setVerzendDialogOpen(null)}>Annuleren</Button>
              <Button
                disabled={!verzendDialogOpen.scab_email_adres || verzendMutatie.isPending}
                onClick={doVerzend}>
                <Send size={14} className="mr-2" />
                {verzendMutatie.isPending ? "Verzenden..." : "Definitief verzenden"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
