import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOffertePortaalTokens,
  useCreateOffertePortaalToken,
  useCreateOfferteAiEmail,
  useVerzendOfferte,
  useListOfferteTracking,
  useListOfferteVragen,
  getListOffertePortaalTokensQueryKey,
  getListOfferteTrackingQueryKey,
} from "@workspace/api-client-react";
import type {
  OffertePortaalToken,
  OfferteTrackingEvent,
  OfferteVraag,
  OfferteEmailVoorstel,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Link2, Copy, Plus, Send, Sparkles, Clock, MessageSquare, CheckCircle, Eye, AlertCircle,
} from "lucide-react";

function datumLabel(iso: string) {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const EVENT_LABEL: Record<string, string> = {
  geopend: "Geopend",
  getekend: "Ondertekend",
  afgewezen: "Afgewezen",
  vraag_gesteld: "Vraag gesteld",
  gelezen: "Gelezen",
};

function eventBadge(event: string) {
  if (event === "getekend") return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">{EVENT_LABEL[event] ?? event}</Badge>;
  if (event === "afgewezen") return <Badge className="bg-rose-100 text-rose-800 border-rose-200">{EVENT_LABEL[event] ?? event}</Badge>;
  if (event === "vraag_gesteld") return <Badge className="bg-blue-100 text-blue-800 border-blue-200">{EVENT_LABEL[event] ?? event}</Badge>;
  return <Badge variant="outline">{EVENT_LABEL[event] ?? event}</Badge>;
}

interface VerzendTabProps {
  offerteId: number;
  opdrachtgever?: string | null;
  titel: string;
}

export function VerzendTab({ offerteId, opdrachtgever, titel }: VerzendTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: tokens, isLoading: tokensLaden } = useListOffertePortaalTokens(offerteId);
  const { data: tracking, isLoading: trackingLaden } = useListOfferteTracking(offerteId);
  const { data: vragen, isLoading: vragenLaden } = useListOfferteVragen(offerteId);

  const maakToken = useCreateOffertePortaalToken();
  const aiEmail = useCreateOfferteAiEmail();
  const verzend = useVerzendOfferte();

  const [emailVoorstel, setEmailVoorstel] = useState<OfferteEmailVoorstel | null>(null);
  const [emailForm, setEmailForm] = useState({
    naar_email: "",
    naar_naam: opdrachtgever ?? "",
    onderwerp: "",
    tekst: "",
  });

  const baseUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}`;

  async function nieuwPortaalLink() {
    try {
      await maakToken.mutateAsync({ id: offerteId });
      await qc.invalidateQueries({ queryKey: getListOffertePortaalTokensQueryKey(offerteId) });
      toast({ title: "Portaallink aangemaakt" });
    } catch {
      toast({ title: "Aanmaken mislukt", variant: "destructive" });
    }
  }

  async function kopieerLink(token: string) {
    const url = `${baseUrl}/portaal/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link gekopieerd" });
    } catch {
      toast({ title: "Kopiëren mislukt", variant: "destructive" });
    }
  }

  async function genereerAiVoorstel() {
    try {
      const voorstel = await aiEmail.mutateAsync({ id: offerteId });
      setEmailVoorstel(voorstel);
      setEmailForm((f) => ({
        ...f,
        onderwerp: voorstel.onderwerp,
        tekst: [voorstel.begroeting, "", voorstel.samenvatting, "", voorstel.call_to_action, "", voorstel.afsluiting].join("\n"),
      }));
      toast({ title: "AI-voorstel gegenereerd" });
    } catch {
      toast({ title: "Genereren mislukt", variant: "destructive" });
    }
  }

  async function verstuurEmail() {
    if (!emailForm.naar_email.trim() || !emailForm.onderwerp.trim() || !emailForm.tekst.trim()) {
      toast({ title: "E-mail, onderwerp en tekst zijn verplicht", variant: "destructive" });
      return;
    }
    const activToken = (tokens ?? [])[0];
    const portaalLink = activToken ? `${baseUrl}/portaal/${activToken.token}` : undefined;
    try {
      await verzend.mutateAsync({
        id: offerteId,
        data: {
          naar_email: emailForm.naar_email.trim(),
          naar_naam: emailForm.naar_naam.trim() || undefined,
          onderwerp: emailForm.onderwerp.trim(),
          tekst: emailForm.tekst.trim(),
          portaal_link: portaalLink,
        },
      });
      await qc.invalidateQueries({ queryKey: getListOfferteTrackingQueryKey(offerteId) });
      toast({ title: "Offerte verzonden" });
      setEmailForm({ naar_email: "", naar_naam: opdrachtgever ?? "", onderwerp: "", tekst: "" });
      setEmailVoorstel(null);
    } catch {
      toast({ title: "Verzenden mislukt", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Portaallinks
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Genereer een beveiligde link waarmee de klant de offerte kan bekijken en digitaal ondertekenen. Elke link is 30 dagen geldig.
          </p>
          {tokensLaden ? (
            <Skeleton className="h-10 w-full" />
          ) : (tokens ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nog geen portaallinks aangemaakt.</p>
          ) : (
            <div className="space-y-2">
              {(tokens ?? []).map((t: OffertePortaalToken) => {
                const url = `${baseUrl}/portaal/${t.token}`;
                const verlopen = new Date(t.verloopt_op) < new Date();
                return (
                  <div key={t.id} className="flex items-center gap-2 rounded-md border bg-muted/30 p-2.5">
                    <span className="text-xs font-mono text-muted-foreground truncate flex-1">{url}</span>
                    {verlopen ? (
                      <Badge variant="outline" className="text-muted-foreground shrink-0">Verlopen</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 shrink-0">Actief</Badge>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => kopieerLink(t.token)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={nieuwPortaalLink}
            disabled={maakToken.isPending}
          >
            <Plus className="h-3.5 w-3.5" />
            {maakToken.isPending ? "Bezig…" : "Nieuwe link genereren"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            E-mail verzenden
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between items-start gap-3">
            <p className="text-sm text-muted-foreground">
              Verstuur de offerte per e-mail. De portaallink wordt automatisch meegestuurd als er een actieve link beschikbaar is.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={genereerAiVoorstel}
              disabled={aiEmail.isPending}
              className="shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {aiEmail.isPending ? "Genereren…" : "AI-voorstel"}
            </Button>
          </div>

          {emailVoorstel && (
            <div className="rounded-md border bg-amber-50 border-amber-200 p-3 text-xs text-amber-800 space-y-1">
              <div className="flex items-center gap-1.5 font-medium">
                <Sparkles className="h-3 w-3" />
                AI-voorstel gegenereerd — controleer en pas aan voor verzending
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>E-mailadres klant *</Label>
              <Input
                type="email"
                value={emailForm.naar_email}
                onChange={(e) => setEmailForm((f) => ({ ...f, naar_email: e.target.value }))}
                placeholder="klant@bedrijf.nl"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Naam (optioneel)</Label>
              <Input
                value={emailForm.naar_naam}
                onChange={(e) => setEmailForm((f) => ({ ...f, naar_naam: e.target.value }))}
                placeholder={opdrachtgever ?? ""}
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Onderwerp *</Label>
              <Input
                value={emailForm.onderwerp}
                onChange={(e) => setEmailForm((f) => ({ ...f, onderwerp: e.target.value }))}
                placeholder={`Offerte ${titel}`}
              />
            </div>
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Berichttekst *</Label>
              <Textarea
                value={emailForm.tekst}
                onChange={(e) => setEmailForm((f) => ({ ...f, tekst: e.target.value }))}
                rows={8}
                placeholder="Geachte heer/mevrouw…"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={verstuurEmail} disabled={verzend.isPending}>
              <Send className="h-3.5 w-3.5" />
              {verzend.isPending ? "Verzenden…" : "Versturen"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" />
            Activiteit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {trackingLaden ? (
            <Skeleton className="h-20 w-full" />
          ) : (tracking ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Nog geen activiteit vastgelegd.</p>
          ) : (
            <div className="space-y-1.5">
              {(tracking ?? []).map((t: OfferteTrackingEvent) => (
                <div key={t.id} className="flex items-center gap-3 text-sm">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground text-xs">{datumLabel(t.aangemaakt_op)}</span>
                  {eventBadge(t.event)}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Klantvragen
          </CardTitle>
        </CardHeader>
        <CardContent>
          {vragenLaden ? (
            <Skeleton className="h-16 w-full" />
          ) : (vragen ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground italic">Geen klantvragen ontvangen.</p>
          ) : (
            <div className="space-y-3">
              {(vragen ?? []).map((v: OfferteVraag) => (
                <div key={v.id} className="rounded-md border p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    {v.antwoord ? (
                      <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    )}
                    <span className="text-xs text-muted-foreground">{v.bezoeker_naam ?? "Klant"} — {datumLabel(v.aangemaakt_op)}</span>
                  </div>
                  <p className="text-sm font-medium">{v.vraag}</p>
                  {v.antwoord && (
                    <p className="text-sm text-muted-foreground pl-3 border-l-2 border-primary/30">{v.antwoord}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
