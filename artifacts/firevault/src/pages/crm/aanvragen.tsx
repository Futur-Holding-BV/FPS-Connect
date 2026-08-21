import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  useListAanvraagVoorstellen,
  useAccepteerAanvraagVoorstel,
  useWijsAanvraagVoorstelAf,
  useVerstuurAanvraagAntwoord,
  useGetAanvraagIntakeInstellingen,
  useUpdateAanvraagIntakeInstellingen,
  useListAanvraagSignalen,
  useHandelAanvraagSignaalAf,
  getListAanvraagSignalenQueryKey,
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
  Sparkles, Check, X, CheckCircle2, Mail, Paperclip, Send, FileText, Building2, Target,
  ExternalLink, AlertTriangle, Inbox, Clock, User, Quote, Phone,
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


type AiKlantKandidaat = { id: number, naam: string, redenen: string[], sterkte: string };

type AiBronBewijsSlot = { waarde?: string | null, bron_zin?: string | null };

type AiVoorstel = {
  titel?: string | null;
  werkzaamheden?: string | null;
  contact_naam?: string | null;
  contact_email?: string | null;
  contact_telefoon?: string | null;
  klant_id?: number | null;
  klant_naam?: string | null;
  klant_adres?: string | null;
  klant_postcode?: string | null;
  klant_stad?: string | null;
  klant_onbekend?: boolean;
  klant_kandidaten?: AiKlantKandidaat[];
  gebouw_id?: number | null;
  gebouw_naam?: string | null;
  gebouw_adres?: string | null;
  gebouw_stad?: string | null;
  gebouw_postcode?: string | null;
  bv?: string | null;
  meerwerk_project_id?: number | null;
  meerwerk_project_naam?: string | null;
  overwogen_project_naam?: string | null;
  overwogen_reden?: string | null;
  ontbrekende_stukken?: string[];
  samenvatting?: string | null;
  onzekere_velden?: string[];
  bron_bewijs?: {
    organisatienaam?: AiBronBewijsSlot;
    opdrachtgever_adres?: AiBronBewijsSlot;
    opdrachtgever_postcode?: AiBronBewijsSlot;
    opdrachtgever_stad?: AiBronBewijsSlot;
    contactpersoon?: AiBronBewijsSlot;
    email?: AiBronBewijsSlot;
    telefoon?: AiBronBewijsSlot;
    gebouwnaam?: AiBronBewijsSlot;
    adres?: AiBronBewijsSlot;
    stad?: AiBronBewijsSlot;
    postcode?: AiBronBewijsSlot;
    titel?: AiBronBewijsSlot;
    werkzaamheden?: AiBronBewijsSlot;
    bv?: AiBronBewijsSlot;
    werknummer?: AiBronBewijsSlot;
    ontbrekende_stukken?: AiBronBewijsSlot;
    samenvatting?: AiBronBewijsSlot;
  };
};

function ai(v: AanvraagVoorstel): AiVoorstel {
  return (v.ai_voorstel ?? {}) as AiVoorstel;
}

export default function CrmAanvragenPagina() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const zoekString = useSearch();
  const [statusFilter, setStatusFilter] = useState("open");
  const [accepteerVoor, setAccepteerVoor] = useState<AanvraagVoorstel | null>(null);
  const [antwoordVoor, setAntwoordVoor] = useState<AanvraagVoorstel | null>(null);

  const { data: voorstellen = [], isLoading } = useListAanvraagVoorstellen();
  const { data: intake } = useGetAanvraagIntakeInstellingen();

  useEffect(() => {
    const voorstelId = Number(new URLSearchParams(zoekString).get("voorstel"));
    if (!Number.isInteger(voorstelId) || voorstelId <= 0 || voorstellen.length === 0) return;
    const voorstel = voorstellen.find((item) => item.id === voorstelId);
    if (!voorstel) return;
    setStatusFilter(voorstel.status === "open" ? "open" : "alle");
    setAccepteerVoor(voorstel);
    window.history.replaceState(null, "", window.location.pathname);
  }, [voorstellen, zoekString]);

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

  const { data: signalen = [] } = useListAanvraagSignalen({ status: "open" });
  const handelAf = useHandelAanvraagSignaalAf({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListAanvraagSignalenQueryKey({ status: "open" }) });
        toast({ title: "Signaal afgehandeld" });
      },
      onError: () => toast({ title: "Afhandelen mislukt", variant: "destructive" }),
    },
  });

  const gefilterd = voorstellen.filter((v) => statusFilter === "alle" || v.status === statusFilter);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 data-paginatitel className="text-2xl font-bold flex items-center gap-2">
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

      {/* Bewakingssignalen: reactietermijn of oppaktermijn verstreken */}
      {signalen.length > 0 && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-destructive" /> Bewakingssignalen ({signalen.length})
            </p>
            {signalen.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-3 flex-wrap border-t pt-3 first:border-t-0 first:pt-0">
                <div className="min-w-0 text-sm">
                  <p>{s.omschrijving}</p>
                  {s.projectkans_id != null && (
                    <Link href="/crm/projectkansen" className="text-xs text-primary underline">
                      Naar projectkans{s.kans_titel ? `: ${s.kans_titel}` : ""}
                    </Link>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handelAf.mutate({ id: s.id, data: {} })}
                  disabled={handelAf.isPending}
                >
                  Afhandelen
                </Button>
              </div>
            ))}
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
                        {v.inbox_item_id != null ? (
                          <a href={`/api/aanvragen/voorstellen/${v.id}/bronbestand`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                            <FileText className="w-3 h-3" /> Primair bronbestand
                          </a>
                        ) : (
                          <Link href="/werk-inbox" className="text-primary hover:underline flex items-center gap-1">
                            <Mail className="w-3 h-3" /> Bronmail in Werk-inbox
                          </Link>
                        )}
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
                          Calculatiestap — nog nodig: {(a.ontbrekende_stukken ?? []).join(", ")}
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
        <AccepteerDialog
          voorstel={accepteerVoor}
          onSluit={() => setAccepteerVoor(null)}
          onKlaar={() => {
            setAccepteerVoor(null);
            invalideer();
          }}
        />
      )}
      {antwoordVoor && (
        <AntwoordDialog voorstel={antwoordVoor} onSluit={() => setAntwoordVoor(null)} onKlaar={() => { setAntwoordVoor(null); invalideer(); }} />
      )}
    </div>
  );
}

function FieldWithEvidence({ label, value, bronZin, unconfirmed, children }: { label: string; value?: string | null; bronZin?: string | null; unconfirmed?: boolean; children: React.ReactNode }) {
  const hasEvidence = !!bronZin;
  return (
    <div className="space-y-1">
      <Label className="flex items-center justify-between">
        <span>{label}</span>
      </Label>
      <div className="flex flex-col gap-1.5">
        <div className={`relative rounded-md border transition-colors focus-within:ring-1 focus-within:ring-ring ${unconfirmed ? 'bg-amber-50 border-amber-200 focus-within:border-amber-400' : 'bg-background'}`}>
          {children}
        </div>
        {hasEvidence && (
          <div className="flex gap-2 p-2 bg-muted/50 rounded-md border text-xs text-muted-foreground mt-0.5" data-testid={`bewijs-${label.toLowerCase().replace(/\s+/g, '-')}`}>
            <Quote className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-50" />
            <p className="italic leading-snug">"{bronZin}"</p>
          </div>
        )}
      </div>
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


function isZwak(s: string) {
  if (!s) return false;
  s = s.toLowerCase();
  return s.includes("zwak") || s.includes("laag") || s.includes("ambigu") || s.includes("low");
}

function AccepteerDialog({ voorstel, onSluit, onKlaar }: { voorstel: AanvraagVoorstel; onSluit: () => void; onKlaar: () => void }) {
  const { toast } = useToast();
  const a = ai(voorstel);
  const { data: klanten = [] } = useListCrmKlanten();
  const { data: gebouwen = [] } = useListGebouwen();
  const { data: projecten = [] } = useListProjecten();

  const kandidaatMatch = a.klant_id ? a.klant_kandidaten?.find(k => k.id === a.klant_id) : null;
  const isKandidaatZwak = kandidaatMatch && isZwak(kandidaatMatch.sterkte);

  const initKlantId = (!isKandidaatZwak && (voorstel.klant_id ?? a.klant_id)) || null;
  const initGebouwId = voorstel.gebouw_id ?? a.gebouw_id;

  const [titel, setTitel] = useState(
    a.gebouw_naam ?? (a.titel as string) ?? voorstel.onderwerp ?? "",
  );
  const [werkzaamheden, setWerkzaamheden] = useState(a.werkzaamheden ?? "");

  const [klantKeuze, setKlantKeuze] = useState<string>(initKlantId ? String(initKlantId) : "nieuw");
  const [nieuweKlantNaam, setNieuweKlantNaam] = useState(voorstel.klant_naam ?? a.klant_naam ?? "");
  const [nieuweKlantAdres, setNieuweKlantAdres] = useState(a.klant_adres ?? "");
  const [nieuweKlantPostcode, setNieuweKlantPostcode] = useState(a.klant_postcode ?? "");
  const [nieuweKlantStad, setNieuweKlantStad] = useState(a.klant_stad ?? "");
  const [gebouwKeuze, setGebouwKeuze] = useState<string>(initGebouwId ? String(initGebouwId) : (a.gebouw_adres ? "nieuw" : "geen"));
  const [nieuwGebouwAdres, setNieuwGebouwAdres] = useState(a.gebouw_adres ?? "");
  const [nieuwGebouwPostcode, setNieuwGebouwPostcode] = useState(a.gebouw_postcode ?? "");
  const [nieuwGebouwStad, setNieuwGebouwStad] = useState(a.gebouw_stad ?? "");
  const gekozenKlant =
    klantKeuze !== "nieuw"
      ? klanten.find((klant) => klant.id === Number(klantKeuze))
      : null;
  const gekozenKlantMistNaw =
    gekozenKlant != null &&
    (!gekozenKlant.naam?.trim() ||
      !gekozenKlant.adres?.trim() ||
      !gekozenKlant.postcode?.trim() ||
      !gekozenKlant.stad?.trim());

  const [type, setType] = useState<string>(voorstel.voorstel_type || "nieuwe_aanvraag");
  const [projectId, setProjectId] = useState<string>(a.meerwerk_project_id ? String(a.meerwerk_project_id) : "");

  const [succesCalculatieId, setSuccesCalculatieId] = useState<number | null>(null);

  const accepteer = useAccepteerAanvraagVoorstel({
    mutation: {
      onSuccess: (data: any) => {
        toast({ title: "Aanvraag succesvol verwerkt" });
        setSuccesCalculatieId(data?.calculatie_id ?? null);
      },
      onError: (err) => {
        const fout = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast({ title: "Accorderen mislukt", description: fout ?? "Onbekende fout", variant: "destructive" });
      },
    },
  });

  const opslaan = () => {
    if (!titel.trim()) { toast({ title: "Titel is verplicht", variant: "destructive" }); return; }
    if (!werkzaamheden.trim()) {
      toast({ title: "Opdrachtomschrijving is verplicht", variant: "destructive" });
      return;
    }
    if (
      klantKeuze === "nieuw" &&
      (!nieuweKlantNaam.trim() ||
        !nieuweKlantAdres.trim() ||
        !nieuweKlantPostcode.trim() ||
        !nieuweKlantStad.trim())
    ) {
      toast({
        title: "Opdrachtgever is onvolledig",
        description: "Vul naam, adres, postcode en plaats van de nieuwe opdrachtgever in.",
        variant: "destructive",
      });
      return;
    }
    if (gekozenKlantMistNaw) {
      toast({
        title: "Opdrachtgever is onvolledig",
        description:
          "Vul de NAW-gegevens van deze relatie eerst aan in CRM of maak een volledige nieuwe opdrachtgever aan.",
        variant: "destructive",
      });
      return;
    }
    if (gebouwKeuze === "geen") {
      toast({ title: "Gebouw is verplicht", description: "Kies een bestaand gebouw of maak een nieuwe aan.", variant: "destructive" });
      return;
    }
    if (
      gebouwKeuze === "nieuw" &&
      (!nieuwGebouwAdres.trim() || !nieuwGebouwPostcode.trim() || !nieuwGebouwStad.trim())
    ) {
      toast({
        title: "Gebouwadres is onvolledig",
        description: "Vul adres, postcode en plaats van het nieuwe gebouw in.",
        variant: "destructive",
      });
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
        werkzaamheden: werkzaamheden.trim(),
        ...(klantKeuze !== "nieuw"
          ? { klant_id: Number(klantKeuze) }
          : {
              nieuwe_klant: {
                naam: nieuweKlantNaam.trim(),
                adres: nieuweKlantAdres.trim(),
                postcode: nieuweKlantPostcode.trim(),
                stad: nieuweKlantStad.trim(),
              },
            }),
        ...(gebouwKeuze !== "geen" && gebouwKeuze !== "nieuw" ? { gebouw_id: Number(gebouwKeuze) } : {}),
        ...(gebouwKeuze === "nieuw" && titel.trim() && nieuwGebouwAdres.trim()
          ? { nieuw_gebouw: { naam: titel.trim(), adres: nieuwGebouwAdres.trim(), postcode: nieuwGebouwPostcode.trim(), stad: nieuwGebouwStad.trim() } }
          : {}),
        voorstel_type: type,
        ...(type === "meerwerk" ? { gerelateerd_project_id: Number(projectId) } : {}),
      },
    });
  };

  if (succesCalculatieId) {
    return (
      <Dialog open onOpenChange={() => { onKlaar(); onSluit(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="w-5 h-5" /> Aanvraag Geaccepteerd
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm">De aanvraag is succesvol omgezet naar een calculatiedossier. U kunt nu direct door naar de calculatie of deze dialoog sluiten.</p>
            <Link href={`/modules/calculatie/${succesCalculatieId}`}>
              <Button className="w-full justify-start gap-2" variant="outline" data-testid="voorstel-bevestigd-calculatie-link" onClick={() => { onKlaar(); onSluit(); }}>
                <ExternalLink className="w-4 h-4" /> Open Calculatiedossier #{succesCalculatieId}
              </Button>
            </Link>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { onKlaar(); onSluit(); }}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onSluit(); }}>
      <DialogContent className="sm:max-w-xl md:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Intake & Voorstel Accorderen</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="rounded-md border bg-muted/30 p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Oorspronkelijke bron</p>
              <p className="text-xs text-muted-foreground">
                Controleer het ongewijzigde bronbestand naast de gele AI-voorstellen.
              </p>
            </div>
            {voorstel.inbox_item_id != null ? (
              <a href={`/api/aanvragen/voorstellen/${voorstel.id}/bronbestand`} target="_blank" rel="noopener noreferrer">
                <Button type="button" variant="outline" size="sm" data-testid="open-primair-bronbestand">
                  <FileText className="w-4 h-4 mr-1" /> Open bronbestand
                </Button>
              </a>
            ) : (
              <Link href="/werk-inbox">
                <Button type="button" variant="outline" size="sm">
                  <Mail className="w-4 h-4 mr-1" /> Open bronmail
                </Button>
              </Link>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div className="md:col-span-2">
              <FieldWithEvidence
                label="Project-/gebouwnaam"
                bronZin={
                  a.bron_bewijs?.gebouwnaam?.bron_zin ??
                  a.bron_bewijs?.titel?.bron_zin
                }
              >
                <Input className="border-0 shadow-none focus-visible:ring-0" value={titel} onChange={(e) => setTitel(e.target.value)} data-testid="input-titel" />
              </FieldWithEvidence>
            </div>

            <FieldWithEvidence label="Gevraagde werkzaamheden" bronZin={a.bron_bewijs?.werkzaamheden?.bron_zin}>
              <Textarea className="border-0 shadow-none focus-visible:ring-0 min-h-[80px] resize-none" value={werkzaamheden} onChange={(e) => setWerkzaamheden(e.target.value)} data-testid="input-werkzaamheden" />
            </FieldWithEvidence>

            <div className="md:col-span-2">
              <FieldWithEvidence label="Opdrachtgever (Relatie)" bronZin={a.bron_bewijs?.organisatienaam?.bron_zin} unconfirmed={!initKlantId}>
                <Select value={klantKeuze} onValueChange={setKlantKeuze}>
                  <SelectTrigger className="border-0 shadow-none focus-visible:ring-0" data-testid="select-klant">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nieuw">Nieuwe relatie aanmaken…</SelectItem>
                    {klanten.map((k) => <SelectItem key={k.id} value={String(k.id)}>{k.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldWithEvidence>

              {(a.klant_kandidaten ?? []).length > 0 && (
                <div className="pl-4 mt-2 mb-2 bg-amber-50 p-2 rounded text-xs border border-amber-200">
                  <p className="font-semibold text-amber-800 flex items-center gap-1 mb-1">
                    <AlertTriangle className="w-3 h-3" /> Mogelijke CRM matches ({a.klant_kandidaten!.length}):
                  </p>
                  <ul className="space-y-2 text-amber-700">
                    {(a.klant_kandidaten ?? []).map((kandidaat) => (
                      <li key={kandidaat.id} className="flex items-start justify-between gap-2 bg-white/50 p-1.5 rounded">
                        <div>
                          <strong>{kandidaat.naam}</strong> (sterkte: {kandidaat.sterkte})<br/>
                          <span className="opacity-80 leading-snug block">{kandidaat.redenen.join(", ")}</span>
                        </div>
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2 shrink-0" onClick={() => setKlantKeuze(String(kandidaat.id))}>
                          Kies
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {klantKeuze === "nieuw" && (
                <div className="pl-4 border-l-2 border-primary/20 mt-2 grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <FieldWithEvidence label="Naam opdrachtgever" bronZin={a.bron_bewijs?.organisatienaam?.bron_zin}>
                      <Input className="border-0 shadow-none focus-visible:ring-0" placeholder="Naam nieuwe relatie" value={nieuweKlantNaam} onChange={(e) => setNieuweKlantNaam(e.target.value)} data-testid="input-nieuwe-klant" />
                    </FieldWithEvidence>
                  </div>
                  <div className="col-span-2">
                    <FieldWithEvidence label="Adres opdrachtgever" bronZin={a.bron_bewijs?.opdrachtgever_adres?.bron_zin}>
                      <Input className="border-0 shadow-none focus-visible:ring-0" placeholder="Adres" value={nieuweKlantAdres} onChange={(e) => setNieuweKlantAdres(e.target.value)} data-testid="input-nieuwe-klant-adres" />
                    </FieldWithEvidence>
                  </div>
                  <FieldWithEvidence label="Postcode opdrachtgever" bronZin={a.bron_bewijs?.opdrachtgever_postcode?.bron_zin}>
                    <Input className="border-0 shadow-none focus-visible:ring-0" placeholder="Postcode" value={nieuweKlantPostcode} onChange={(e) => setNieuweKlantPostcode(e.target.value)} data-testid="input-nieuwe-klant-postcode" />
                  </FieldWithEvidence>
                  <FieldWithEvidence label="Plaats opdrachtgever" bronZin={a.bron_bewijs?.opdrachtgever_stad?.bron_zin}>
                    <Input className="border-0 shadow-none focus-visible:ring-0" placeholder="Plaats" value={nieuweKlantStad} onChange={(e) => setNieuweKlantStad(e.target.value)} data-testid="input-nieuwe-klant-stad" />
                  </FieldWithEvidence>
                </div>
              )}
              {gekozenKlantMistNaw && (
                <p className="mt-2 text-xs font-medium text-destructive">
                  Deze CRM-relatie mist naam, adres, postcode of plaats en kan nog niet
                  als opdrachtgever worden gebruikt.
                </p>
              )}
            </div>

            <div className="md:col-span-2">
              <FieldWithEvidence label="Gebouw / Uitvoeringslocatie" bronZin={a.bron_bewijs?.adres?.bron_zin} unconfirmed={!initGebouwId && !!a.gebouw_adres}>
                <Select value={gebouwKeuze} onValueChange={setGebouwKeuze}>
                  <SelectTrigger className="border-0 shadow-none focus-visible:ring-0" data-testid="select-gebouw">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="geen">Selecteer een gebouw…</SelectItem>
                    <SelectItem value="nieuw">Nieuw gebouw aanmaken…</SelectItem>
                    {gebouwen.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldWithEvidence>

              {gebouwKeuze === "nieuw" && (
                <div className="pl-4 border-l-2 border-primary/20 space-y-2 mt-2 grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <FieldWithEvidence label="Adres" bronZin={a.bron_bewijs?.adres?.bron_zin}>
                      <Input className="border-0 shadow-none focus-visible:ring-0" placeholder="Adres" value={nieuwGebouwAdres} onChange={(e) => setNieuwGebouwAdres(e.target.value)} data-testid="input-nieuw-gebouw-adres" />
                    </FieldWithEvidence>
                  </div>
                  <FieldWithEvidence label="Postcode" bronZin={a.bron_bewijs?.postcode?.bron_zin}>
                    <Input className="border-0 shadow-none focus-visible:ring-0" placeholder="Postcode" value={nieuwGebouwPostcode} onChange={(e) => setNieuwGebouwPostcode(e.target.value)} data-testid="input-nieuw-gebouw-postcode" />
                  </FieldWithEvidence>
                  <FieldWithEvidence label="Stad" bronZin={a.bron_bewijs?.stad?.bron_zin}>
                    <Input className="border-0 shadow-none focus-visible:ring-0" placeholder="Stad" value={nieuwGebouwStad} onChange={(e) => setNieuwGebouwStad(e.target.value)} data-testid="input-nieuw-gebouw-stad" />
                  </FieldWithEvidence>
                </div>
              )}
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aanvraag Type</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={type === "nieuwe_aanvraag"} onChange={() => setType("nieuwe_aanvraag")} /> Nieuwe Opdracht
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={type === "meerwerk"} onChange={() => setType("meerwerk")} /> Meerwerk op bestaande
                </label>
              </div>
              {type === "meerwerk" && (
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="mt-2"><SelectValue placeholder="Kies het gerelateerde project..." /></SelectTrigger>
                  <SelectContent>
                    {projecten.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.naam}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onSluit}>Annuleren</Button>
          <Button onClick={opslaan} disabled={accepteer.isPending} data-testid="button-opslaan-intake">
            {accepteer.isPending ? "Bezig..." : "Accorderen & Start Intake"}
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
