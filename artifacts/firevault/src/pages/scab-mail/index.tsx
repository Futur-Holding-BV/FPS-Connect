import { useState } from "react";
import { useGetScabMails, usePostScabMailsGenereer, usePatchScabMailsId, usePostScabMailsIdVerzend } from "@workspace/api-client-react";
import { useListWerkgevers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Send, Mail, Pencil, Check } from "lucide-react";
import type { ScabMail } from "@workspace/api-client-react";

const HUIDIG_JAAR = new Date().getFullYear();
const HUIDIG_MAAND = new Date().getMonth() + 1;

const MAAND_NAMEN = [
  "januari","februari","maart","april","mei","juni",
  "juli","augustus","september","oktober","november","december",
];

const STATUS_CONFIG: Record<string, { label: string; kleur: string }> = {
  concept: { label: "Concept", kleur: "bg-amber-100 text-amber-800" },
  verzonden: { label: "Verzonden", kleur: "bg-green-100 text-green-800" },
};

export default function ScabMailPage() {
  const [jaar, setJaar] = useState(HUIDIG_JAAR);
  const [maand, setMaand] = useState(HUIDIG_MAAND);
  const [werkmaatschappijFilter, setWerkmaatschappijFilter] = useState("alle");
  const [genereerDialogOpen, setGenereerDialogOpen] = useState(false);
  const [bewerkenMail, setBewerkenMail] = useState<ScabMail | null>(null);
  const [verzendDialogOpen, setVerzendDialogOpen] = useState<ScabMail | null>(null);

  const [genereerWerkmaatschappij, setGenereerWerkmaatschappij] = useState("");
  const [genereerWerkgeverId, setGenereerWerkgeverId] = useState<number | null>(null);

  const params: Record<string, unknown> = { jaar, maand };
  if (werkmaatschappijFilter !== "alle") params.werkmaatschappij = werkmaatschappijFilter;

  const { data: mails = [], refetch } = useGetScabMails(params);
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

  const jaren = [HUIDIG_JAAR, HUIDIG_JAAR - 1];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Mail className="text-primary" size={24} />
          <div>
            <h1 className="text-2xl font-semibold">SCAB Salarismails</h1>
            <p className="text-sm text-muted-foreground">AI-conceptmails voor SCAB salarisverwerking — altijd eerst controleren</p>
          </div>
        </div>
        <Button onClick={() => setGenereerDialogOpen(true)}>
          <Sparkles size={16} className="mr-2" />
          Concept genereren
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={String(jaar)} onValueChange={(v) => setJaar(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {jaren.map((j) => <SelectItem key={j} value={String(j)}>{j}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={String(maand)} onValueChange={(v) => setMaand(Number(v))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MAAND_NAMEN.map((nm, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{nm}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={werkmaatschappijFilter} onValueChange={setWerkmaatschappijFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Alle werkmaatschappijen" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="alle">Alle werkmaatschappijen</SelectItem>
            {werkgevers.map((wg) => <SelectItem key={wg.id} value={wg.naam}>{wg.naam}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {mails.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground mb-4">Geen conceptmails voor {MAAND_NAMEN[maand - 1]} {jaar}.</p>
            <Button variant="outline" onClick={() => setGenereerDialogOpen(true)}>
              <Sparkles size={16} className="mr-2" />
              Eerste concept genereren
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {mails.map((mail) => {
            const sc = STATUS_CONFIG[mail.status] ?? { label: mail.status, kleur: "bg-gray-100 text-gray-700" };
            return (
              <Card key={mail.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.kleur}`}>{sc.label}</span>
                        <Badge variant="outline" className="text-xs">{mail.werkmaatschappij}</Badge>
                        {mail.aantal_mutaties > 0 && (
                          <Badge variant="secondary" className="text-xs">{mail.aantal_mutaties} mutaties</Badge>
                        )}
                      </div>
                      <CardTitle className="text-base font-medium">{mail.onderwerp}</CardTitle>
                      {mail.scab_email_adres && (
                        <p className="text-xs text-muted-foreground mt-0.5">Aan: {mail.scab_email_adres}</p>
                      )}
                    </div>
                    {mail.status === "concept" && (
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => openBewerken(mail)}>
                          <Pencil size={12} className="mr-1" />
                          Bewerken
                        </Button>
                        <Button size="sm" className="h-7 text-xs"
                          onClick={() => setVerzendDialogOpen(mail)}>
                          <Send size={12} className="mr-1" />
                          Verzenden
                        </Button>
                      </div>
                    )}
                    {mail.status === "verzonden" && (
                      <Badge variant="secondary" className="text-xs">
                        <Check size={10} className="mr-1" />
                        Verzonden {mail.verzond_op ? new Date(mail.verzond_op).toLocaleDateString("nl-NL") : ""}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="text-sm whitespace-pre-wrap font-sans text-muted-foreground border rounded p-3 bg-muted/30 max-h-48 overflow-y-auto">
                    {mail.inhoud}
                  </pre>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={genereerDialogOpen} onOpenChange={setGenereerDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles size={18} className="text-amber-500" />
              Conceptmail genereren
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              De AI stelt een conceptmail op op basis van de geaccordeerde mutaties voor de gekozen periode.
              Controleer altijd de inhoud vóór verzending.
            </p>
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
              {genereer.isPending ? "Genereren..." : "Genereren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {bewerkenMail && (
        <Dialog open={!!bewerkenMail} onOpenChange={() => setBewerkenMail(null)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Conceptmail bewerken</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
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
                <Textarea rows={12} value={bewerkForm.inhoud}
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

      {verzendDialogOpen && (
        <Dialog open={!!verzendDialogOpen} onOpenChange={() => setVerzendDialogOpen(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Mail verzenden bevestigen</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-2">
              <p className="text-sm">U staat op het punt de conceptmail te verzenden naar:</p>
              <p className="font-medium text-sm">{verzendDialogOpen.scab_email_adres ?? "Geen e-mailadres ingesteld"}</p>
              {!verzendDialogOpen.scab_email_adres && (
                <p className="text-sm text-destructive">Stel eerst een SCAB-e-mailadres in via Beheer &rsaquo; Werkgevers.</p>
              )}
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
