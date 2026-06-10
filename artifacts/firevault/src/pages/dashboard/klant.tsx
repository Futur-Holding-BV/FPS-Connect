import { useState } from "react";
import { Link } from "wouter";
import { useListGebouwen, useListInspecties, useCreateOnderhoud } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Building, Map, FileText, Plus, CheckCircle, AlertTriangle, ChevronRight, ClipboardList } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const INSPECTIE_STATUS: Record<string, { kleur: string; label: string }> = {
  gepland:     { kleur: "bg-blue-100 text-blue-800",   label: "Gepland" },
  goedgekeurd: { kleur: "bg-green-100 text-green-800", label: "Goedgekeurd" },
  afgekeurd:   { kleur: "bg-red-100 text-red-800",     label: "Afgekeurd" },
  in_progress: { kleur: "bg-orange-100 text-orange-800", label: "In uitvoering" },
};

export default function KlantDashboard() {
  const queryClient = useQueryClient();
  const { data: gebouwen } = useListGebouwen();
  const { data: inspecties } = useListInspecties();
  const maakOnderhoud = useCreateOnderhoud();

  const [ticketDialoog, setTicketDialoog] = useState(false);
  const [ticketGeslaagd, setTicketGeslaagd] = useState(false);
  const [ticket, setTicket] = useState({
    titel: "",
    omschrijving: "",
    gebouw_id: "",
    categorie: "melding",
    prioriteit: "middel",
  });

  const setT = (k: keyof typeof ticket) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setTicket((t) => ({ ...t, [k]: e.target.value }));

  async function verstuurTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!ticket.titel || !ticket.gebouw_id) return;
    await maakOnderhoud.mutateAsync({
      data: {
        titel: ticket.titel,
        omschrijving: ticket.omschrijving || undefined,
        prioriteit: ticket.prioriteit as any,
        gebouw_id: Number(ticket.gebouw_id),
      },
    });
    await queryClient.invalidateQueries({ queryKey: ["listOnderhoud"] });
    setTicketGeslaagd(true);
  }

  function sluitTicket() {
    setTicketDialoog(false);
    setTicketGeslaagd(false);
    setTicket({ titel: "", omschrijving: "", gebouw_id: "", categorie: "melding", prioriteit: "middel" });
  }

  const recenteInspecties = (inspecties ?? []).slice(0, 5);
  const goedgekeurd = (inspecties ?? []).filter((i: any) => i.status === "goedgekeurd").length;
  const afgekeurd = (inspecties ?? []).filter((i: any) => i.status === "afgekeurd").length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mijn portaal</h1>
          <p className="text-muted-foreground mt-1">Bekijk uw gebouwen, rapportages en dien meldingen in.</p>
        </div>
        <Button onClick={() => setTicketDialoog(true)}>
          <Plus className="h-4 w-4 mr-2" /> Melding indienen
        </Button>
      </div>

      {/* Status samenvatting */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-primary">{gebouwen?.length ?? 0}</div>
            <div className="text-xs text-primary/70 font-medium mt-0.5">Gebouwen</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-green-700">{goedgekeurd}</div>
            <div className="text-xs text-green-600 font-medium mt-0.5">Goedgekeurde inspecties</div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-red-700">{afgekeurd}</div>
            <div className="text-xs text-red-600 font-medium mt-0.5">Aandachtspunten</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mijn gebouwen */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building className="h-4 w-4" /> Mijn gebouwen
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {gebouwen?.map((g: any) => (
              <div key={g.id} className="flex items-center gap-3 p-3 rounded-lg border bg-white hover:bg-muted/30 transition-colors">
                <Building className="h-5 w-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{g.naam}</div>
                  <div className="text-xs text-muted-foreground">{g.adres}</div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <Button variant="outline" size="sm" asChild className="h-7 text-xs">
                    <Link href={`/gebouwen/${g.id}`}>
                      <Map className="h-3 w-3 mr-1" /> 3D
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild className="h-7 text-xs">
                    <Link href={`/klant/rapportages?gebouw=${g.id}`}>
                      <FileText className="h-3 w-3 mr-1" /> Rapport
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
            {!gebouwen?.length && (
              <p className="text-sm text-muted-foreground text-center py-4">Geen gebouwen gevonden.</p>
            )}
          </CardContent>
        </Card>

        {/* Recente inspectieresultaten */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Recente rapportages
            </CardTitle>
            <Button variant="outline" size="sm" asChild>
              <Link href="/klant/rapportages">Alle rapportages</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {recenteInspecties.map((i: any) => {
              const statusInfo = INSPECTIE_STATUS[i.status] ?? { kleur: "bg-gray-100 text-gray-600", label: i.status };
              return (
                <div key={i.id} className="flex items-center gap-3 p-3 rounded-lg border bg-white">
                  {i.status === "goedgekeurd"
                    ? <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    : <AlertTriangle className="h-4 w-4 text-orange-500 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{i.type} — {i.voorziening_nummer ?? `Spot ${i.voorziening_id}`}</div>
                    <div className="text-xs text-muted-foreground">
                      {i.gebouw_naam ?? "Onbekend"}
                      {i.datum && ` — ${new Date(i.datum).toLocaleDateString("nl-NL")}`}
                    </div>
                  </div>
                  <Badge variant="secondary" className={`text-xs flex-shrink-0 ${statusInfo.kleur}`}>
                    {statusInfo.label}
                  </Badge>
                </div>
              );
            })}
            {!recenteInspecties.length && (
              <p className="text-sm text-muted-foreground text-center py-4">Geen rapportages beschikbaar.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Uitleg blokken */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { icoon: Map, titel: "3D weergave", tekst: "Bekijk alle brandpreventieve objecten per verdieping van uw gebouwen.", href: "/gebouwen", kleur: "text-primary" },
          { icoon: FileText, titel: "Rapportages", tekst: "Inzicht in alle inspectie- en opleveringsrapporten van uw pand.", href: "/klant/rapportages", kleur: "text-blue-600" },
          { icoon: Plus, titel: "Melding indienen", tekst: "Meld een gebrek of vraag een nieuwe spot aan via een werkbon.", href: "#", kleur: "text-orange-500", onClick: () => setTicketDialoog(true) },
        ].map(({ icoon: Icoon, titel, tekst, href, kleur, onClick }) => (
          <div
            key={titel}
            className="bg-muted/30 rounded-lg p-4 flex flex-col gap-2 cursor-pointer hover:bg-muted/60 transition-colors border"
            onClick={onClick ?? undefined}
          >
            <Icoon className={`h-6 w-6 ${kleur}`} />
            <div className="font-semibold text-sm">{titel}</div>
            <p className="text-xs text-muted-foreground">{tekst}</p>
            {!onClick && (
              <Link href={href} className="text-xs text-primary font-medium flex items-center gap-1 mt-auto">
                Openen <ChevronRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        ))}
      </div>

      {/* Ticket dialoog */}
      <Dialog open={ticketDialoog} onOpenChange={(o) => { if (!o) sluitTicket(); }}>
        <DialogContent className="max-w-md" aria-describedby="ticket-beschrijving">
          <DialogHeader>
            <DialogTitle>{ticketGeslaagd ? "Melding ingediend" : "Melding / werkbon indienen"}</DialogTitle>
          </DialogHeader>

          {ticketGeslaagd ? (
            <div className="text-center py-6 space-y-3">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-sm text-muted-foreground">
                Uw melding is ontvangen. FPS Brandpreventie neemt contact op om de opdracht in te plannen.
              </p>
              <Button onClick={sluitTicket} className="mt-2">Sluiten</Button>
            </div>
          ) : (
            <form onSubmit={verstuurTicket} className="space-y-4 pt-1">
              <p id="ticket-beschrijving" className="text-sm text-muted-foreground -mt-1">
                Beschrijf het gebrek of de gewenste nieuwe spot. FPS Brandpreventie verwerkt uw melding.
              </p>
              <div className="space-y-3">
                <div>
                  <Label>Gebouw *</Label>
                  <Select value={ticket.gebouw_id} onValueChange={(v) => setTicket((t) => ({ ...t, gebouw_id: v }))}>
                    <SelectTrigger><SelectValue placeholder="Kies uw gebouw" /></SelectTrigger>
                    <SelectContent>
                      {gebouwen?.map((g: any) => (
                        <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Categorie</Label>
                  <Select value={ticket.categorie} onValueChange={(v) => setTicket((t) => ({ ...t, categorie: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="melding">Gebrek / melding</SelectItem>
                      <SelectItem value="nieuw">Nieuwe spot gewenst</SelectItem>
                      <SelectItem value="inspectie">Inspectie aanvragen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="tit">Onderwerp *</Label>
                  <Input id="tit" value={ticket.titel} onChange={setT("titel")} placeholder="Bijv. Branddeur sluit niet goed" required />
                </div>
                <div>
                  <Label>Omschrijving</Label>
                  <Textarea
                    value={ticket.omschrijving}
                    onChange={setT("omschrijving")}
                    placeholder="Geef een gedetailleerde beschrijving van het probleem of de gewenste situatie..."
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Urgentie</Label>
                  <Select value={ticket.prioriteit} onValueChange={(v) => setTicket((t) => ({ ...t, prioriteit: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="laag">Laag — geen direct gevaar</SelectItem>
                      <SelectItem value="middel">Middel — binnen 2 weken oppakken</SelectItem>
                      <SelectItem value="hoog">Hoog — direct gevaar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={sluitTicket}>Annuleren</Button>
                <Button type="submit" disabled={maakOnderhoud.isPending || !ticket.titel || !ticket.gebouw_id}>
                  {maakOnderhoud.isPending ? "Indienen..." : "Indienen"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
