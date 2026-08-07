import { useState } from "react";
import { Link } from "wouter";
import {
  useListAanvraagVoorstellen,
  useAccepteerAanvraagVoorstel,
  useWijsAanvraagVoorstelAf,
  useVerstuurAanvraagAntwoord,
  useGetAanvraagIntakeInstellingen,
  useUpdateAanvraagIntakeInstellingen,
  useListCrmKlanten,
  useListGebouwen,
  useListProjecten,
  getListAanvraagVoorstellenQueryKey,
  getGetAanvraagIntakeInstellingenQueryKey,
  type AanvraagVoorstel,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles, Check, X, Mail, Paperclip, Send, Building2, Target,
  ExternalLink, AlertTriangle, Inbox,
} from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  open: "Ter beoordeling",
  geaccepteerd: "Geaccepteerd",
  afgewezen: "Afgewezen",
};
const STATUS_KLEUR: Record<string, string> = {
  open: "bg-amber-100 text-amber-700 border-amber-200",
  geaccepteerd: "bg-emerald-100 text-emerald-700 border-emerald-200",
  afgewezen: "bg-gray-100 text-gray-500 border-gray-200",
};
const BV_OPTIES = ["FPS Bouw", "FPS Brandpreventie", "FPS Onderhoud"];

type AiVoorstel = {
  titel?: string | null;
  klant_id?: number | null;
  klant_naam?: string | null;
  klant_onbekend?: boolean;
  klant_kandidaten?: string[];
  gebouw_id?: number | null;
  gebouw_naam?: string | null;
  gebouw_adres?: string | null;
  gebouw_stad?: string | null;
  bv?: string | null;
  meerwerk_project_id?: number | null;
  meerwerk_project_naam?: string | null;
  overwogen_project_naam?: string | null;
  overwogen_reden?: string | null;
  ontbrekende_stukken?: string[];
  samenvatting?: string | null;
  onzekere_velden?: string[];
};

function ai(v: AanvraagVoorstel): AiVoorstel {
  return (v.ai_voorstel ?? {}) as AiVoorstel;
}

export default function CrmAanvragenPagina() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("open");
  const [accepteerVoor, setAccepteerVoor] = useState<AanvraagVoorstel | null>(null);
  const [antwoordVoor, setAntwoordVoor] = useState<AanvraagVoorstel | null>(null);

  const { data: voorstellen = [], isLoading } = useListAanvraagVoorstellen();
  const { data: intake } = useGetAanvraagIntakeInstellingen();

  const invalideer = () => {
    void qc.invalidateQueries({ queryKey: getListAanvraagVoorstellenQueryKey() });
  };

  const updateIntake = useUpdateAanvraagIntakeInstellingen({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetAanvraagIntakeInstellingenQueryKey() });
        toast({ title: "Instelling opgeslagen" });
      },
      onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
    },
  });

  const gefilterd = voorstellen.filter((v) => statusFilter === "alle" || v.status === statusFilter);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="w-6 h-6 text-primary" /> Aanvragen
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Prijsaanvragen uit de mail. De AI bereidt voor; pas na uw goedkeuring wordt een projectkans vastgelegd en gaat er een antwoord de deur uit.
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Ter beoordeling</SelectItem>
            <SelectItem value="geaccepteerd">Geaccepteerd</SelectItem>
            <SelectItem value="afgewezen">Afgewezen</SelectItem>
            <SelectItem value="alle">Alle</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Persoonlijke mailbox als aanvraag-ingang */}
      {intake?.mail_gekoppeld && (
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Persoonlijke mailbox als aanvraag-ingang</p>
                <p className="text-xs text-muted-foreground truncate">
                  Aanvragen die rechtstreeks op {intake.persoonlijk_adres ?? "uw eigen mailadres"} binnenkomen ook automatisch verwerken.
                  Gedeelde mailboxen stelt u in bij de Werk-inbox.
                </p>
              </div>
            </div>
            <Switch
              checked={intake.persoonlijke_intake}
              onCheckedChange={(aan) => updateIntake.mutate({ data: { persoonlijke_intake: aan } })}
              disabled={updateIntake.isPending}
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : gefilterd.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Geen aanvragen in deze weergave. Nieuwe prijsaanvragen uit de gekoppelde mailboxen verschijnen hier automatisch.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {gefilterd.map((v) => {
            const a = ai(v);
            return (
              <Card key={v.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{a.titel ?? v.onderwerp}</p>
                        <Badge variant="outline" className={`text-xs border ${STATUS_KLEUR[v.status] ?? ""}`}>{STATUS_LABEL[v.status] ?? v.status}</Badge>
                        {v.voorstel_type === "meerwerk" && (
                          <Badge variant="outline" className="text-xs border bg-blue-100 text-blue-700 border-blue-200">Meerwerk</Badge>
                        )}
                        {v.antwoord_verstuurd_op ? (
                          <Badge variant="secondary" className="text-xs text-muted-foreground">Beantwoord</Badge>
                        ) : v.status !== "afgewezen" ? (
                          <Badge variant="outline" className="text-xs border bg-red-50 text-red-700 border-red-200">Nog niet beantwoord</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {v.afzender_naam ? `${v.afzender_naam} · ` : ""}{v.afzender_email} · {new Date(v.binnengekomen_op).toLocaleString("nl-NL")}
                      </p>
                      {a.samenvatting && <p className="text-sm text-muted-foreground mt-1.5">{a.samenvatting}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
                        {a.klant_naam && (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Building2 className="w-3 h-3" /> {a.klant_naam}{a.klant_onbekend ? " (nog geen relatie)" : ""}
                          </span>
                        )}
                        {(a.gebouw_naam || a.gebouw_adres) && (
                          <span className="text-muted-foreground">{a.gebouw_naam ?? a.gebouw_adres}</span>
                        )}
                        {a.bv && <span className="text-muted-foreground">{a.bv}</span>}
                        {(v.bijlagen ?? []).map((b) => (
                          <a key={b.url} href={b.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                            <Paperclip className="w-3 h-3" /> {b.naam}
                          </a>
                        ))}
                        {v.projectkans_id != null && (
                          <Link href="/crm/projectkansen" className="text-primary hover:underline flex items-center gap-1">
                            <Target className="w-3 h-3" /> Projectkans #{v.projectkans_id}
                          </Link>
                        )}
                      </div>
                      {a.meerwerk_project_naam && (
                        <p className="text-xs mt-1.5 text-blue-700">Sterk bewijs voor meerwerk op: {a.meerwerk_project_naam}</p>
                      )}
                      {!a.meerwerk_project_naam && a.overwogen_project_naam && (
                        <p className="text-xs mt-1.5 text-muted-foreground flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          Overwogen als meerwerk op {a.overwogen_project_naam} ({a.overwogen_reden}), maar zonder werknummer als nieuwe aanvraag voorgesteld.
                        </p>
                      )}
                      {(a.ontbrekende_stukken ?? []).length > 0 && (
                        <p className="text-xs mt-1.5 text-amber-700">
                          Ontbreekt om te calculeren: {(a.ontbrekende_stukken ?? []).join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {v.status === "open" && (
                        <div className="flex items-center gap-1">
                          <Button size="sm" className="h-8" onClick={() => setAccepteerVoor(v)}>
                            <Check className="w-4 h-4 mr-1" /> Accorderen
                          </Button>
                          <AfwijsKnop voorstel={v} onKlaar={invalideer} />
                        </div>
                      )}
                      {!v.antwoord_verstuurd_op && v.status !== "afgewezen" && (
                        <Button size="sm" variant="outline" className="h-8" onClick={() => setAntwoordVoor(v)}>
                          <Send className="w-4 h-4 mr-1" /> Antwoord versturen
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {accepteerVoor && (
        <AccepteerDialog voorstel={accepteerVoor} onSluit={() => setAccepteerVoor(null)} onKlaar={() => { setAccepteerVoor(null); invalideer(); }} />
      )}
      {antwoordVoor && (
        <AntwoordDialog voorstel={antwoordVoor} onSluit={() => setAntwoordVoor(null)} onKlaar={() => { setAntwoordVoor(null); invalideer(); }} />
      )}
    </div>
  );
}

function AfwijsKnop({ voorstel, onKlaar }: { voorstel: AanvraagVoorstel; onKlaar: () => void }) {
  const { toast } = useToast();
  const afwijs = useWijsAanvraagVoorstelAf({
    mutation: {
      onSuccess: () => { onKlaar(); toast({ title: "Voorstel afgewezen" }); },
      onError: () => toast({ title: "Afwijzen mislukt", variant: "destructive" }),
    },
  });
  return (
    <Button size="sm" variant="outline" className="h-8" onClick={() => afwijs.mutate({ id: voorstel.id, data: {} })} disabled={afwijs.isPending}>
      <X className="w-4 h-4 mr-1" /> Afwijzen
    </Button>
  );
}

function AccepteerDialog({ voorstel, onSluit, onKlaar }: { voorstel: AanvraagVoorstel; onSluit: () => void; onKlaar: () => void }) {
  const { toast } = useToast();
  const a = ai(voorstel);
  const { data: klanten = [] } = useListCrmKlanten();
  const { data: gebouwen = [] } = useListGebouwen();
  const { data: projecten = [] } = useListProjecten();

  const [titel, setTitel] = useState(a.titel ?? voorstel.onderwerp);
  const [klantKeuze, setKlantKeuze] = useState<string>(a.klant_id ? String(a.klant_id) : "nieuw");
  const [nieuweKlantNaam, setNieuweKlantNaam] = useState(a.klant_naam ?? "");
  const [gebouwKeuze, setGebouwKeuze] = useState<string>(a.gebouw_id ? String(a.gebouw_id) : (a.gebouw_adres ? "nieuw" : "geen"));
  const [nieuwGebouwNaam, setNieuwGebouwNaam] = useState(a.gebouw_naam ?? a.gebouw_adres ?? "");
  const [nieuwGebouwAdres, setNieuwGebouwAdres] = useState(a.gebouw_adres ?? "");
  const [nieuwGebouwStad, setNieuwGebouwStad] = useState(a.gebouw_stad ?? "");
  const [bv, setBv] = useState<string>(a.bv ?? "geen");
  const [type, setType] = useState<string>(voorstel.voorstel_type);
  const [projectId, setProjectId] = useState<string>(a.meerwerk_project_id ? String(a.meerwerk_project_id) : "");

  const accepteer = useAccepteerAanvraagVoorstel({
    mutation: {
      onSuccess: () => { onKlaar(); toast({ title: "Aanvraag vastgelegd als projectkans" }); },
      onError: (err) => {
        const fout = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: "Accorderen mislukt", description: fout ?? "Onbekende fout", variant: "destructive" });
      },
    },
  });

  const opslaan = () => {
    if (!titel.trim()) { toast({ title: "Titel is verplicht", variant: "destructive" }); return; }
    if (klantKeuze === "nieuw" && !nieuweKlantNaam.trim()) {
      toast({ title: "Bevestig de klant", description: "Kies een bestaande relatie of vul de naam van de nieuwe relatie in.", variant: "destructive" });
      return;
    }
    if (type === "meerwerk" && !projectId) {
      toast({ title: "Kies de lopende opdracht", description: "Meerwerk vereist een expliciet gekozen opdracht.", variant: "destructive" });
      return;
    }
    accepteer.mutate({
      id: voorstel.id,
      data: {
        titel: titel.trim(),
        ...(klantKeuze !== "nieuw" ? { klant_id: Number(klantKeuze) } : { nieuwe_klant: { naam: nieuweKlantNaam.trim(), email: voorstel.afzender_email } }),
        ...(gebouwKeuze !== "geen" && gebouwKeuze !== "nieuw" ? { gebouw_id: Number(gebouwKeuze) } : {}),
        ...(gebouwKeuze === "nieuw" && nieuwGebouwNaam.trim() && nieuwGebouwAdres.trim()
          ? { nieuw_gebouw: { naam: nieuwGebouwNaam.trim(), adres: nieuwGebouwAdres.trim(), ...(nieuwGebouwStad.trim() ? { stad: nieuwGebouwStad.trim() } : {}) } }
          : {}),
        ...(bv !== "geen" ? { bv } : {}),
        voorstel_type: type,
        ...(type === "meerwerk" ? { gerelateerd_project_id: Number(projectId) } : {}),
      },
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onSluit(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Aanvraag accorderen</DialogTitle>
          <DialogDescription>
            Controleer het AI-voorstel. Pas na uw bevestiging wordt de projectkans (en eventueel een nieuwe relatie of gebouw) vastgelegd.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Titel</Label>
            <Input value={titel} onChange={(e) => setTitel(e.target.value)} />
          </div>
          <div>
            <Label>Klant</Label>
            <Select value={klantKeuze} onValueChange={setKlantKeuze}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nieuw">Nieuwe relatie aanmaken…</SelectItem>
                {klanten.map((k) => <SelectItem key={k.id} value={String(k.id)}>{k.naam}</SelectItem>)}
              </SelectContent>
            </Select>
            {klantKeuze === "nieuw" && (
              <div className="mt-2">
                <Input placeholder="Naam nieuwe relatie" value={nieuweKlantNaam} onChange={(e) => setNieuweKlantNaam(e.target.value)} />
                {(a.klant_kandidaten ?? []).length > 0 && (
                  <p className="text-xs text-amber-700 mt-1">Mogelijk bestaand: {(a.klant_kandidaten ?? []).join(", ")} — controleer dit eerst.</p>
                )}
              </div>
            )}
          </div>
          <div>
            <Label>Gebouw</Label>
            <Select value={gebouwKeuze} onValueChange={setGebouwKeuze}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="geen">Geen gebouw koppelen</SelectItem>
                <SelectItem value="nieuw">Nieuw gebouw aanmaken…</SelectItem>
                {gebouwen.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>)}
              </SelectContent>
            </Select>
            {gebouwKeuze === "nieuw" && (
              <div className="mt-2 space-y-2">
                <Input placeholder="Naam" value={nieuwGebouwNaam} onChange={(e) => setNieuwGebouwNaam(e.target.value)} />
                <Input placeholder="Adres" value={nieuwGebouwAdres} onChange={(e) => setNieuwGebouwAdres(e.target.value)} />
                <Input placeholder="Plaats" value={nieuwGebouwStad} onChange={(e) => setNieuwGebouwStad(e.target.value)} />
              </div>
            )}
          </div>
          <div>
            <Label>BV</Label>
            <Select value={bv} onValueChange={setBv}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="geen">Nog niet bekend</SelectItem>
                {BV_OPTIES.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Soort</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nieuwe_aanvraag">Nieuwe aanvraag</SelectItem>
                <SelectItem value="meerwerk">Meerwerk op lopende opdracht</SelectItem>
              </SelectContent>
            </Select>
            {type === "meerwerk" && (
              <div className="mt-2">
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger><SelectValue placeholder="Kies de lopende opdracht" /></SelectTrigger>
                  <SelectContent>
                    {projecten.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.naam}{p.werknummer ? ` (${p.werknummer})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onSluit}>Annuleren</Button>
          <Button onClick={opslaan} disabled={accepteer.isPending}>
            {accepteer.isPending ? "Bezig…" : "Accorderen & vastleggen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AntwoordDialog({ voorstel, onSluit, onKlaar }: { voorstel: AanvraagVoorstel; onSluit: () => void; onKlaar: () => void }) {
  const { toast } = useToast();
  const [tekst, setTekst] = useState(voorstel.concept_antwoord ?? "");
  const verstuur = useVerstuurAanvraagAntwoord({
    mutation: {
      onSuccess: () => { onKlaar(); toast({ title: "Antwoord verstuurd", description: `Reply verstuurd naar ${voorstel.afzender_email}.` }); },
      onError: (err) => {
        const fout = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: "Versturen mislukt", description: fout ?? "Onbekende fout", variant: "destructive" });
      },
    },
  });
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onSluit(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Antwoord versturen</DialogTitle>
          <DialogDescription>
            Dit concept is door de AI voorbereid{voorstel.concept_vorm === "bevestiging_met_vraag" ? " en vraagt om aantoonbaar ontbrekende stukken" : ""}.
            Pas het gerust aan; er wordt pas iets verstuurd als u op Versturen klikt. Het antwoord gaat als reply naar {voorstel.afzender_email}.
          </DialogDescription>
        </DialogHeader>
        <Textarea rows={12} value={tekst} onChange={(e) => setTekst(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={onSluit}>Annuleren</Button>
          <Button onClick={() => verstuur.mutate({ id: voorstel.id, data: { tekst } })} disabled={verstuur.isPending || tekst.trim().length < 10}>
            <Send className="w-4 h-4 mr-1" /> {verstuur.isPending ? "Bezig…" : "Versturen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
