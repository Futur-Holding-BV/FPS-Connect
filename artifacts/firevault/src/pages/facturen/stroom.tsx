// FACTUUR_02 §6 — Bewakingsdashboard van de factuurstroom (Jacqueline).
// Toont gebeurtenissen (signalen), geen facturenlijst: twijfel wordt actief
// getoond en nooit stilzwijgend afgehandeld.
import { useState } from "react";
import { Link } from "wouter";
import {
  useListFactuurSignalen,
  getListFactuurSignalenQueryKey,
  useHandelFactuurSignaalAf,
} from "@workspace/api-client-react";
import type { FactuurSignaal } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PaginaHulp } from "@/components/pagina-hulp";
import {
  AlertTriangle, Clock, Copy, CalendarClock, Banknote, ShieldAlert,
  HelpCircle, UserX, Scale, CheckCircle2, Loader2, ArrowUpRight, Inbox, Mail,
} from "lucide-react";

const SIGNAAL_META: Record<string, { label: string; icoon: typeof AlertTriangle; kleur: string }> = {
  ai_onzeker: { label: "Systeem kwam er niet uit", icoon: HelpCircle, kleur: "bg-amber-100 text-amber-700" },
  hangt_te_lang: { label: "Hangt te lang", icoon: Clock, kleur: "bg-orange-100 text-orange-700" },
  bedrag_wijkt_af: { label: "Bedrag wijkt af", icoon: Scale, kleur: "bg-amber-100 text-amber-700" },
  mogelijk_dubbel: { label: "Mogelijk dubbel", icoon: Copy, kleur: "bg-slate-100 text-slate-700" },
  termijn_loopt_af: { label: "Betaaltermijn loopt af", icoon: CalendarClock, kleur: "bg-orange-100 text-orange-700" },
  uitgaand_onbetaald: { label: "Uitgaande factuur onbetaald", icoon: Banknote, kleur: "bg-red-100 text-red-700" },
  rekeningnummer_gewijzigd: { label: "Rekeningnummer gewijzigd", icoon: ShieldAlert, kleur: "bg-red-100 text-red-700" },
  loondeel_onzeker: { label: "Loondeel ontbreekt of onwaarschijnlijk", icoon: AlertTriangle, kleur: "bg-red-100 text-red-700" },
  onbekende_leverancier: { label: "Onbekende leverancier", icoon: UserX, kleur: "bg-amber-100 text-amber-700" },
};

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Fout ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface Mailbox {
  id: number;
  emailAdres: string;
  label: string | null;
  actief: boolean;
  isFactuurmailbox: boolean;
}

function FactuurmailboxInstelling() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: mailboxen, isLoading } = useQuery({
    queryKey: ["werk-inbox", "mailboxen"],
    queryFn: () => apiFetch<Mailbox[]>("/api/werk-inbox/mailboxen"),
  });
  const wijzig = useMutation({
    mutationFn: ({ id, isFactuurmailbox }: { id: number; isFactuurmailbox: boolean }) =>
      apiFetch(`/api/werk-inbox/mailboxen/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFactuurmailbox }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["werk-inbox", "mailboxen"] });
      toast({ title: "Instelling opgeslagen" });
    },
    onError: () => toast({ title: "Opslaan mislukt", variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" /> Factuurmailbox</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Facturen komen uitsluitend binnen via de mailstroom. Markeer hieronder welke werk-inbox-mailbox de
          factuurmailbox is; mails daarin worden automatisch gelezen en de factuurstroom in gebracht.
        </p>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : !mailboxen || mailboxen.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Er zijn nog geen extra mailboxen gekoppeld in de werk-inbox. Voeg daar eerst een mailbox toe.
          </p>
        ) : (
          <div className="space-y-2">
            {mailboxen.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-md border px-3 py-2" data-testid={`mailbox-rij-${m.id}`}>
                <div>
                  <p className="text-sm font-medium">{m.label ?? m.emailAdres}</p>
                  <p className="text-xs text-muted-foreground">{m.emailAdres}{m.actief ? "" : " (inactief)"}</p>
                </div>
                <div className="flex items-center gap-2">
                  {m.isFactuurmailbox && <Badge variant="secondary">Factuurmailbox</Badge>}
                  <Switch
                    checked={m.isFactuurmailbox}
                    disabled={wijzig.isPending}
                    onCheckedChange={(aan) => wijzig.mutate({ id: m.id, isFactuurmailbox: aan })}
                    data-testid={`switch-factuurmailbox-${m.id}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function FactuurstroomBewakingPagina() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"open" | "afgehandeld">("open");
  const [afTeHandelen, setAfTeHandelen] = useState<FactuurSignaal | null>(null);
  const [notitie, setNotitie] = useState("");

  const { data: signalen, isLoading } = useListFactuurSignalen({ status: tab });

  const afhandelen = useHandelFactuurSignaalAf({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListFactuurSignalenQueryKey({ status: "open" }) });
        void queryClient.invalidateQueries({ queryKey: getListFactuurSignalenQueryKey({ status: "afgehandeld" }) });
        setAfTeHandelen(null);
        setNotitie("");
        toast({ title: "Signaal afgehandeld" });
      },
      onError: (err: unknown) => {
        const msg = err instanceof Error ? err.message : "Afhandelen mislukt";
        toast({ title: "Afhandelen mislukt", description: msg, variant: "destructive" });
      },
    },
  });

  const notitieVerplicht = afTeHandelen?.type === "rekeningnummer_gewijzigd";

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Inbox className="h-6 w-6" /> Factuurbewaking
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Alles wat in de factuurstroom aandacht van een mens nodig heeft. Het systeem bereidt voor en
            signaleert; goedkeuren doet het nooit zelf.
          </p>
        </div>
        <PaginaHulp
          pagina="facturen-stroom"
          aanvulling="Dit dashboard toont gebeurtenissen uit de factuurstroom: facturen waar het systeem niet uitkwam, die te lang blijven hangen, mogelijke dubbelen, aflopende betaaltermijnen, onbetaalde uitgaande facturen en gewijzigde rekeningnummers. Bij een gewijzigd rekeningnummer is een toelichting verplicht."
        />
      </div>

      <FactuurmailboxInstelling />

      <div className="flex gap-2">
        <Button variant={tab === "open" ? "default" : "outline"} size="sm" onClick={() => setTab("open")} data-testid="tab-open">
          Openstaand
        </Button>
        <Button variant={tab === "afgehandeld" ? "default" : "outline"} size="sm" onClick={() => setTab("afgehandeld")} data-testid="tab-afgehandeld">
          Afgehandeld
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Laden…</div>
      ) : !signalen || signalen.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
            {tab === "open" ? "Geen openstaande signalen — de factuurstroom loopt schoon." : "Nog geen afgehandelde signalen."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {signalen.map((s) => {
            const meta = SIGNAAL_META[s.type] ?? { label: s.type, icoon: AlertTriangle, kleur: "bg-slate-100 text-slate-700" };
            const Icoon = meta.icoon;
            return (
              <Card key={s.id} data-testid={`signaal-${s.id}`}>
                <CardContent className="py-4 flex items-start gap-3">
                  <span className={`rounded-md p-2 ${meta.kleur}`}><Icoon className="h-4 w-4" /></span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{meta.label}</span>
                      {s.factuurnummer && <Badge variant="outline">Factuur {s.factuurnummer}</Badge>}
                      {s.relatienaam && <Badge variant="outline">{s.relatienaam}</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {new Date(s.aangemaakt_op).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{s.omschrijving}</p>
                    {s.status === "afgehandeld" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Afgehandeld door {s.afgehandeld_door_naam ?? "onbekend"}
                        {s.afhandel_notitie ? ` — ${s.afhandel_notitie}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 items-end shrink-0">
                    {s.factuur_id != null && (
                      <Link href={`/facturen/${s.factuur_id}`}>
                        <Button variant="outline" size="sm" data-testid={`knop-naar-factuur-${s.id}`}>
                          <ArrowUpRight className="h-4 w-4 mr-1" /> Factuur
                        </Button>
                      </Link>
                    )}
                    {s.status === "open" && (
                      <Button size="sm" onClick={() => { setAfTeHandelen(s); setNotitie(""); }} data-testid={`knop-afhandelen-${s.id}`}>
                        Afhandelen
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={afTeHandelen !== null} onOpenChange={(open) => { if (!open) setAfTeHandelen(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signaal afhandelen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{afTeHandelen?.omschrijving}</p>
          {notitieVerplicht && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <ShieldAlert className="h-4 w-4" /> Gewijzigd rekeningnummer: leg verplicht vast hoe je de wijziging hebt geverifieerd (bijv. telefonisch bij een bekend nummer van de leverancier).
            </p>
          )}
          <Textarea
            value={notitie}
            onChange={(e) => setNotitie(e.target.value)}
            placeholder={notitieVerplicht ? "Hoe is dit geverifieerd? (verplicht)" : "Toelichting (optioneel)"}
            data-testid="input-afhandel-notitie"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAfTeHandelen(null)}>Annuleren</Button>
            <Button
              disabled={afhandelen.isPending || (notitieVerplicht && notitie.trim().length < 5)}
              onClick={() => { if (afTeHandelen) afhandelen.mutate({ id: afTeHandelen.id, data: { notitie: notitie.trim() || null } }); }}
              data-testid="knop-bevestig-afhandelen"
            >
              {afhandelen.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Afhandelen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
