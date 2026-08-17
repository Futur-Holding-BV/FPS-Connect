import { useRef, useState } from "react";
import {
  useGetScabMails, usePostScabMailsGenereer,
  usePatchScabMailsId, usePostScabMailsIdVerzend,
  useAiVeldCorrectie, useGetScabMailsIdMutaties,
  useListWerkgevers,
} from "@workspace/api-client-react";
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
  ClipboardList, AlertTriangle, Info, ListChecks,
} from "lucide-react";
import { Link } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";
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
  { nr: 4, label: "Verzenden naar loonverwerker" },
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
  // Generieke leerlus (AI_01): log wat de AI voor onderwerp/inhoud voorstelde
  // tegenover de daadwerkelijk verzonden tekst. Fire-and-forget.
  const aiVeldCorrectie = useAiVeldCorrectie();
  // Oorspronkelijk gegenereerde AI-tekst per mail-id (vóór handmatige bewerking),
  // vastgelegd bij generatie zodat we bij verzenden kunnen vergelijken.
  const aiOorspronkelijkRef = useRef<Record<number, { onderwerp: string; inhoud: string }>>({});

  // ── Bewerken-state ─────────────────────────────────────────────────────────
  const [bewerkForm, setBewerkForm] = useState({ onderwerp: "", inhoud: "", scab_email_adres: "" });
  // Geselecteerde mutatie-ids (beheert de snapshot)
  const [geselecteerdeMutatieIds, setGeselecteerdeMutatieIds] = useState<Set<number>>(new Set());
  // Bijhouden of de selectie handmatig is gewijzigd (bepaalt welk pad opslaan neemt)
  const [selectieGewijzigd, setSelectieGewijzigd] = useState(false);

  function openBewerken(mail: ScabMail) {
    setBewerkForm({
      onderwerp: mail.onderwerp,
      inhoud: mail.inhoud,
      scab_email_adres: mail.scab_email_adres ?? "",
    });
    // Initialiseer geselecteerde ids vanuit de snapshot van de mail
    const initIds = Array.isArray(mail.mutatie_ids)
      ? new Set<number>(mail.mutatie_ids.filter((v): v is number => typeof v === "number"))
      : new Set<number>();
    setGeselecteerdeMutatieIds(initIds);
    setSelectieGewijzigd(false);
    setBewerkenMail(mail);
  }

  // Wanneer de selectie verandert: bijhouden dat er iets gewijzigd is.
  // De body-tekst wordt NIET client-side overschreven — de server regenereert
  // bij opslaan de volledige inhoud (inclusief aanhef en ondertekening met
  // echte werkgeverdata). Zo blijft de opgeslagen tekst altijd volledig.
  function handleSelectieWijziging(nieuweIds: Set<number>) {
    setGeselecteerdeMutatieIds(nieuweIds);
    setSelectieGewijzigd(true);
  }

  async function opslaan() {
    if (!bewerkenMail) return;

    if (selectieGewijzigd) {
      // Mutatieselectie is gewijzigd: stuur alleen mutatie_ids mee.
      // De server valideert de IDs, deduplicoert ze, en regenereert de
      // volledige mailtekst inclusief ondertekening op basis van werkgeverdata.
      await patchMail.mutateAsync({
        id: bewerkenMail.id,
        data: {
          onderwerp: bewerkForm.onderwerp,
          scab_email_adres: bewerkForm.scab_email_adres || undefined,
          mutatie_ids: Array.from(geselecteerdeMutatieIds),
        },
      });
    } else {
      // Alleen tekst of metagegevens bewerkt: stuur de aangepaste body mee.
      await patchMail.mutateAsync({
        id: bewerkenMail.id,
        data: {
          onderwerp: bewerkForm.onderwerp,
          inhoud: bewerkForm.inhoud,
          scab_email_adres: bewerkForm.scab_email_adres || undefined,
        },
      });
    }
    setBewerkenMail(null);
    refetch();
  }

  async function doGenereer() {
    if (!genereerWerkmaatschappij) return;
    const nieuweMail = await genereer.mutateAsync({
      data: {
        werkmaatschappij: genereerWerkmaatschappij,
        werkgever_id: genereerWerkgeverId ?? undefined,
        periode_jaar: jaar,
        periode_maand: maand,
      },
    });
    // Leg de door de AI gegenereerde tekst vast als startpunt voor de leerlus.
    if (nieuweMail?.id != null) {
      aiOorspronkelijkRef.current[nieuweMail.id] = {
        onderwerp: nieuweMail.onderwerp ?? "",
        inhoud: nieuweMail.inhoud ?? "",
      };
    }
    setGenereerDialogOpen(false);
    refetch();
  }

  async function doVerzend() {
    if (!verzendDialogOpen) return;
    const mail = verzendDialogOpen;
    await verzendMutatie.mutateAsync({ id: mail.id });
    // Generieke leerlus (AI_01): log wat de AI voor onderwerp/inhoud voorstelde
    // tegenover de verzonden tekst. Alleen loggen als het AI-origineel bekend is
    // (mail in deze sessie gegenereerd). Fire-and-forget.
    const aiOrig = aiOorspronkelijkRef.current[mail.id];
    if (aiOrig) {
      const fragment = (mail.werkmaatschappij || "").slice(0, 200);
      if (aiOrig.onderwerp) {
        aiVeldCorrectie.mutate({
          data: {
            veld_naam: "scab_mail.onderwerp",
            ai_voorstel: aiOrig.onderwerp,
            gekozen: mail.onderwerp ?? "",
            tekst_fragment: fragment || undefined,
          },
        });
      }
      if (aiOrig.inhoud) {
        aiVeldCorrectie.mutate({
          data: {
            veld_naam: "scab_mail.tekst",
            ai_voorstel: aiOrig.inhoud,
            gekozen: mail.inhoud ?? "",
            tekst_fragment: fragment || undefined,
          },
        });
      }
    }
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
            <h1 data-paginatitel className="text-2xl font-semibold">Loonaanlevering salarismails</h1>
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
            een complete, formele e-mail op gericht aan de loonverwerker van de werkmaatschappij. Per mutatie worden
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
                            Geen aanleveradres loonverwerking ingesteld — stel in via Beheer &rsaquo; Werkgevers.
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
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Conceptmail bewerken</DialogTitle>
            </DialogHeader>
            <div className="space-y-5 py-2">

              {/* Info */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground p-2 bg-muted/50 rounded">
                <Info size={12} className="shrink-0" />
                Pas de inhoud aan zodat alle informatie correct en volledig is vóór verzending.
              </div>

              {/* Mutatieselectie */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <ListChecks size={14} className="text-muted-foreground" />
                  Meegenomen mutaties
                </Label>
                <p className="text-xs text-muted-foreground">
                  Vink aan welke mutaties in deze mail en de boekhoudkundige snapshot worden opgenomen.
                  Bij een gewijzigde selectie wordt de mailtekst inclusief ondertekening opnieuw
                  samengesteld door de server.
                </p>
                <MutatieKeuzePanel
                  mailId={bewerkenMail.id}
                  geselecteerd={geselecteerdeMutatieIds}
                  onChange={handleSelectieWijziging}
                />
              </div>

              <Separator />

              {/* Velden */}
              <div className="space-y-1.5">
                <Label>Aanleveradres loonverwerking</Label>
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
                {selectieGewijzigd ? (
                  <div className="rounded-md border bg-muted/30 p-4 space-y-2">
                    <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2.5">
                      <Sparkles size={13} className="shrink-0 mt-0.5 text-amber-500" />
                      <span>
                        De mutatieselectie is gewijzigd. Bij het opslaan genereert de server de volledige
                        mailtekst opnieuw — inclusief aanhef en ondertekening met werkgevergegevens.
                        Wilt u de tekst zelf aanpassen, sla dan eerst de selectie op en open daarna
                        opnieuw het bewerkscherm.
                      </span>
                    </div>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans max-h-32 overflow-y-auto opacity-60">
                      {bewerkForm.inhoud}
                    </pre>
                  </div>
                ) : (
                  <>
                    <Textarea rows={12} value={bewerkForm.inhoud}
                      onChange={(e) => setBewerkForm((f) => ({ ...f, inhoud: e.target.value }))}
                      className="font-mono text-sm" />
                    <p className="text-xs text-muted-foreground">
                      U kunt de tekst vrij aanpassen. Wijzig de mutatieselectie hierboven om de volledige
                      inhoud opnieuw te laten genereren.
                    </p>
                  </>
                )}
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
                {(verzendDialogOpen.mutatie_ids?.length ?? verzendDialogOpen.aantal_mutaties) > 0 && (
                  <p className="text-muted-foreground">
                    Snapshot: <span className="font-medium text-foreground">
                      {verzendDialogOpen.mutatie_ids?.length ?? verzendDialogOpen.aantal_mutaties} mutaties
                    </span> worden na verzending op "verwerkt" gezet.
                  </p>
                )}
              </div>
              {!verzendDialogOpen.scab_email_adres && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                  <AlertTriangle size={16} className="shrink-0" />
                  Stel eerst een aanleveradres loonverwerking in via Beheer &rsaquo; Werkgevers.
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

function MutatieKeuzePanel({
  mailId,
  geselecteerd,
  onChange,
}: {
  mailId: number;
  geselecteerd: Set<number>;
  onChange: (nieuw: Set<number>) => void;
}) {
  const { data: mutaties = [], isLoading } = useGetScabMailsIdMutaties(mailId, {
    query: { queryKey: ["scab-mail-mutaties", mailId] },
  });

  function toggleMutatie(id: number) {
    const nieuw = new Set(geselecteerd);
    if (nieuw.has(id)) {
      nieuw.delete(id);
    } else {
      nieuw.add(id);
    }
    onChange(nieuw);
  }

  function allesAan() {
    onChange(new Set(mutaties.map((m) => m.id)));
  }

  function allesUit() {
    onChange(new Set());
  }

  if (isLoading) {
    return <p className="text-xs text-muted-foreground py-2">Mutaties laden…</p>;
  }

  if (mutaties.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">
        Geen salarismutaties gevonden voor deze periode.
      </p>
    );
  }

  const aantalGeselecteerd = mutaties.filter((m) => geselecteerd.has(m.id)).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {aantalGeselecteerd} van {mutaties.length} mutaties meegenomen
        </span>
        <div className="flex gap-2">
          <button type="button" onClick={allesAan}
            className="text-xs text-primary underline-offset-2 hover:underline">
            Alle aan
          </button>
          <span className="text-muted-foreground text-xs">·</span>
          <button type="button" onClick={allesUit}
            className="text-xs text-primary underline-offset-2 hover:underline">
            Alle uit
          </button>
        </div>
      </div>

      <div className="rounded-md border divide-y max-h-52 overflow-y-auto">
        {mutaties.map((m) => {
          const isAan = geselecteerd.has(m.id);
          return (
            <label key={m.id}
              className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors
                ${isAan ? "" : "opacity-60"}`}>
              <Checkbox
                checked={isAan}
                onCheckedChange={() => toggleMutatie(m.id)}
                className="mt-0.5 shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight">
                  {m.medewerker_naam ?? `Medewerker ${m.id}`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {m.type}
                  {m.omschrijving ? ` — ${m.omschrijving}` : ""}
                  {m.ingangsdatum ? ` · per ${m.ingangsdatum}` : ""}
                </p>
              </div>
              {!m.in_snapshot && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                  nieuw
                </span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
