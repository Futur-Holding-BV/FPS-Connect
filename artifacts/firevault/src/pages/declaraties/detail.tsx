import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { ArrowLeft, Receipt, CheckCircle, XCircle, Banknote, Edit, Trash2, Send, Forward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDeclaratie,
  getGetDeclaratieQueryKey,
  getListDeclaratiesQueryKey,
  useUpdateDeclaratie,
  useDeleteDeclaratie,
  useIndieningDeclaratie,
  useGoedkeurenDeclaratie,
  useAfwijzenDeclaratie,
  useVerwerkenDeclaratie,
  useDoorzettenDeclaratie,
  useListDeclaratieBeoordelaars,
  getListDeclaratieBeoordelaarsQueryKey,
  type DeclaratieInputCategorie,
} from "@workspace/api-client-react";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { PaginaHulp } from "@/components/pagina-hulp";

const CATEGORIEEN = [
  { value: "reiskosten",    label: "Reiskosten" },
  { value: "maaltijden",   label: "Maaltijden" },
  { value: "overnachting", label: "Overnachting" },
  { value: "representatie",label: "Representatie" },
  { value: "gereedschap",  label: "Gereedschap" },
  { value: "overig",       label: "Overig" },
];

function statusBadge(status: string) {
  switch (status) {
    case "concept":     return <Badge variant="outline">Concept</Badge>;
    case "ingediend":   return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Ingediend — ter beoordeling</Badge>;
    case "goedgekeurd": return <Badge className="bg-green-100 text-green-800 border-green-200">Goedgekeurd</Badge>;
    case "afgekeurd":   return <Badge className="bg-red-100 text-red-800 border-red-200">Afgekeurd</Badge>;
    case "verwerkt":    return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Verwerkt / Uitbetaald</Badge>;
    default:            return <Badge variant="outline">{status}</Badge>;
  }
}

function bedragTekst(cents: number) {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function categorieTekst(cat: string) {
  return CATEGORIEEN.find(c => c.value === cat)?.label ?? cat;
}

export default function DeclaratieDetailPagina() {
  const [, params] = useRoute("/declaraties/:id");
  const [, navigeer] = useLocation();
  const id = Number(params?.id);
  const queryClient = useQueryClient();
  const { heeftNiveau } = useBevoegdheid();

  const magIndienen    = heeftNiveau("declaraties", 2);
  const magBeoordelen  = heeftNiveau("declaraties", 3);
  const magVerwerken   = heeftNiveau("declaraties", 4);

  const { data: declaratie, isLoading } = useGetDeclaratie(id, {
    query: { queryKey: getGetDeclaratieQueryKey(id), enabled: !!id },
  });

  const { mutateAsync: bewerk, isPending: isBezig } = useUpdateDeclaratie();
  const { mutateAsync: verwijder, isPending: verwijdert } = useDeleteDeclaratie();
  const { mutateAsync: dien_in, isPending: diendIn } = useIndieningDeclaratie();
  const { mutateAsync: keur_goed, isPending: keurGoedBezig } = useGoedkeurenDeclaratie();
  const { mutateAsync: wijs_af, isPending: wijstAf } = useAfwijzenDeclaratie();
  const { mutateAsync: verwerk, isPending: verwerktBezig } = useVerwerkenDeclaratie();
  const { mutateAsync: zet_door, isPending: zetDoorBezig } = useDoorzettenDeclaratie();

  const [bewerkOpen, setBewerkOpen] = useState(false);
  const [afwijsOpen, setAfwijsOpen] = useState(false);
  const [doorzetOpen, setDoorzetOpen] = useState(false);
  const [doorzetNaar, setDoorzetNaar] = useState("");
  const [doorzetToelichting, setDoorzetToelichting] = useState("");

  // Beoordelaars alleen ophalen wanneer de doorzet-dialoog open is
  const { data: beoordelaars } = useListDeclaratieBeoordelaars({
    query: { queryKey: getListDeclaratieBeoordelaarsQueryKey(), enabled: doorzetOpen && magBeoordelen },
  });
  const [verwijderOpen, setVerwijderOpen] = useState(false);
  const [afwijzingsreden, setAfwijzingsreden] = useState("");

  const [editCategorie, setEditCategorie] = useState<DeclaratieInputCategorie>("reiskosten");
  const [editOmschrijving, setEditOmschrijving] = useState("");
  const [editBedrag, setEditBedrag] = useState("");
  const [editDatum, setEditDatum] = useState("");

  function openBewerk() {
    if (!declaratie) return;
    setEditCategorie(declaratie.categorie as DeclaratieInputCategorie);
    setEditOmschrijving(declaratie.omschrijving);
    setEditBedrag((declaratie.bedrag_totaal_cents / 100).toFixed(2).replace(".", ","));
    setEditDatum(declaratie.datum);
    setBewerkOpen(true);
  }

  async function opslaanBewerking() {
    const bedragCents = Math.round(parseFloat(editBedrag.replace(",", ".")) * 100);
    await bewerk({ id, data: { categorie: editCategorie, omschrijving: editOmschrijving, bedrag_totaal_cents: bedragCents, datum: editDatum } });
    await queryClient.invalidateQueries({ queryKey: getGetDeclaratieQueryKey(id) });
    await queryClient.invalidateQueries({ queryKey: getListDeclaratiesQueryKey() });
    setBewerkOpen(false);
  }

  async function indienen() {
    await dien_in({ id });
    await queryClient.invalidateQueries({ queryKey: getGetDeclaratieQueryKey(id) });
    await queryClient.invalidateQueries({ queryKey: getListDeclaratiesQueryKey() });
  }

  async function goedkeuren() {
    await keur_goed({ id });
    await queryClient.invalidateQueries({ queryKey: getGetDeclaratieQueryKey(id) });
    await queryClient.invalidateQueries({ queryKey: getListDeclaratiesQueryKey() });
  }

  async function afwijzen() {
    if (!afwijzingsreden.trim()) return;
    await wijs_af({ id, data: { afwijzingsreden: afwijzingsreden.trim() } });
    await queryClient.invalidateQueries({ queryKey: getGetDeclaratieQueryKey(id) });
    await queryClient.invalidateQueries({ queryKey: getListDeclaratiesQueryKey() });
    setAfwijsOpen(false);
  }

  async function verwerken() {
    await verwerk({ id });
    await queryClient.invalidateQueries({ queryKey: getGetDeclaratieQueryKey(id) });
    await queryClient.invalidateQueries({ queryKey: getListDeclaratiesQueryKey() });
  }

  async function doorzetten() {
    const naarId = Number(doorzetNaar);
    if (!naarId) return;
    try {
      await zet_door({
        id,
        data: {
          gebruiker_id: naarId,
          verwacht_doorgezet_naar: declaratie?.doorgezet_naar ?? null,
          ...(doorzetToelichting.trim() ? { toelichting: doorzetToelichting.trim() } : {}),
        },
      });
    } catch {
      // 409: collega was net eerder — verse gegevens tonen zodat de banner de actuele toewijzing laat zien
      await queryClient.invalidateQueries({ queryKey: getGetDeclaratieQueryKey(id) });
      setDoorzetOpen(false);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: getGetDeclaratieQueryKey(id) });
    await queryClient.invalidateQueries({ queryKey: getListDeclaratiesQueryKey() });
    setDoorzetOpen(false);
    setDoorzetNaar("");
    setDoorzetToelichting("");
  }

  async function verwijderen() {
    await verwijder({ id });
    await queryClient.invalidateQueries({ queryKey: getListDeclaratiesQueryKey() });
    navigeer("/declaraties");
  }

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Laden...</div>;
  }

  if (!declaratie) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Declaratie niet gevonden.</p>
        <Button variant="ghost" className="mt-4 gap-2" onClick={() => navigeer("/declaraties")}>
          <ArrowLeft className="h-4 w-4" />
          Terug naar overzicht
        </Button>
      </div>
    );
  }

  const isConcept     = declaratie.status === "concept";
  const isIngediend   = declaratie.status === "ingediend";
  const isGoedgekeurd = declaratie.status === "goedgekeurd";
  const isAfgekeurd   = declaratie.status === "afgekeurd";

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <PaginaHulp pagina="declaratie-detail" />
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-2" onClick={() => navigeer("/declaraties")}>
          <ArrowLeft className="h-4 w-4" />
          Overzicht
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Declaratie #{declaratie.id}
          </h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {statusBadge(declaratie.status)}
            <Badge variant="secondary">{categorieTekst(declaratie.categorie)}</Badge>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{bedragTekst(declaratie.bedrag_totaal_cents)}</p>
          <p className="text-xs text-muted-foreground">{declaratie.datum}</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">Gegevens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Medewerker</p>
              <p className="font-medium">{declaratie.medewerker_naam}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Categorie</p>
              <p className="font-medium">{categorieTekst(declaratie.categorie)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Datum kosten</p>
              <p className="font-medium">{declaratie.datum}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Ingediend op</p>
              <p className="font-medium">
                {declaratie.ingediend_op
                  ? new Date(declaratie.ingediend_op).toLocaleDateString("nl-NL")
                  : "—"}
              </p>
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Omschrijving</p>
            <p className="mt-1 text-sm whitespace-pre-line">{declaratie.omschrijving}</p>
          </div>
        </CardContent>
      </Card>

      {(declaratie.beoordeeld_op || declaratie.afwijzingsreden) && (
        <Card className={isAfgekeurd ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
          <CardHeader className="pb-2 pt-4">
            <CardTitle className={`text-sm font-medium ${isAfgekeurd ? "text-red-800" : "text-green-800"}`}>
              {isAfgekeurd ? "Afwijzing" : "Beoordeling"}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4 space-y-2 text-sm">
            {declaratie.beoordeeld_door_naam && (
              <p className={isAfgekeurd ? "text-red-700" : "text-green-700"}>
                Door: <strong>{declaratie.beoordeeld_door_naam}</strong> op{" "}
                {declaratie.beoordeeld_op
                  ? new Date(declaratie.beoordeeld_op).toLocaleDateString("nl-NL")
                  : "—"}
              </p>
            )}
            {declaratie.afwijzingsreden && (
              <div>
                <p className="text-xs text-muted-foreground">Reden</p>
                <p className="text-red-800 mt-0.5">{declaratie.afwijzingsreden}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {declaratie.doorgezet_naar && declaratie.status === "ingediend" && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-800">
            <strong>{declaratie.doorgezet_door_naam ?? "Een beoordelaar"}</strong> heeft deze declaratie doorgezet naar{" "}
            <strong>{declaratie.doorgezet_naar_naam ?? "een collega"}</strong>
            {declaratie.doorgezet_op ? ` op ${new Date(declaratie.doorgezet_op).toLocaleDateString("nl-NL")}` : ""}.
            {declaratie.doorzet_toelichting && (
              <div className="mt-1">Toelichting: {declaratie.doorzet_toelichting}</div>
            )}
          </CardContent>
        </Card>
      )}

      {declaratie.verwerking_op && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="py-3 text-sm text-blue-800">
            Verwerkt / uitbetaald op{" "}
            <strong>{new Date(declaratie.verwerking_op).toLocaleDateString("nl-NL")}</strong>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        {isConcept && magIndienen && (
          <>
            <Button variant="outline" className="gap-2" onClick={openBewerk}>
              <Edit className="h-4 w-4" />
              Bewerken
            </Button>
            <Button className="gap-2" onClick={indienen} disabled={diendIn}>
              <Send className="h-4 w-4" />
              {diendIn ? "Indienen..." : "Indienen ter beoordeling"}
            </Button>
            <Button variant="destructive" size="sm" className="gap-2 ml-auto" onClick={() => setVerwijderOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Verwijderen
            </Button>
          </>
        )}

        {isIngediend && magBeoordelen && (
          <>
            <Button className="gap-2 bg-green-600 hover:bg-green-700" onClick={goedkeuren} disabled={keurGoedBezig}>
              <CheckCircle className="h-4 w-4" />
              {keurGoedBezig ? "Goedkeuren..." : "Goedkeuren"}
            </Button>
            <Button variant="destructive" className="gap-2" onClick={() => setAfwijsOpen(true)}>
              <XCircle className="h-4 w-4" />
              Afwijzen
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setDoorzetOpen(true)}>
              <Forward className="h-4 w-4" />
              Doorzetten naar collega
            </Button>
          </>
        )}

        {isGoedgekeurd && magBeoordelen && !magVerwerken && (
          <Button variant="destructive" className="gap-2" onClick={() => setAfwijsOpen(true)}>
            <XCircle className="h-4 w-4" />
            Alsnog afwijzen
          </Button>
        )}

        {isGoedgekeurd && magVerwerken && (
          <>
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={verwerken} disabled={verwerktBezig}>
              <Banknote className="h-4 w-4" />
              {verwerktBezig ? "Verwerken..." : "Markeer als verwerkt / uitbetaald"}
            </Button>
            <Button variant="destructive" className="gap-2" onClick={() => setAfwijsOpen(true)}>
              <XCircle className="h-4 w-4" />
              Alsnog afwijzen
            </Button>
          </>
        )}
      </div>

      {isGoedgekeurd && magVerwerken && (
        <p className="text-xs text-muted-foreground">
          Deze declaratie staat al automatisch klaar als salarismutatie voor de loonverwerking.
          Zodra de loonaanlevering (SCAB-mail) van deze periode wordt verzonden, springt de status
          vanzelf op verwerkt. Handmatig markeren is alleen nodig als u buiten de loonrun om uitbetaalt.
        </p>
      )}

      {/* Bewerkdialoog */}
      <Dialog open={bewerkOpen} onOpenChange={o => { if (!o) setBewerkOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Declaratie bewerken</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Categorie</Label>
              <Select value={editCategorie} onValueChange={v => setEditCategorie(v as DeclaratieInputCategorie)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIEEN.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Omschrijving</Label>
              <Textarea className="mt-1" value={editOmschrijving} onChange={e => setEditOmschrijving(e.target.value)} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Bedrag (euro)</Label>
                <Input className="mt-1" value={editBedrag} onChange={e => setEditBedrag(e.target.value)} />
              </div>
              <div>
                <Label>Datum</Label>
                <Input className="mt-1" type="date" value={editDatum} onChange={e => setEditDatum(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBewerkOpen(false)} disabled={isBezig}>Annuleren</Button>
            <Button onClick={opslaanBewerking} disabled={isBezig}>
              {isBezig ? "Opslaan..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Doorzetdialoog */}
      <Dialog open={doorzetOpen} onOpenChange={o => { if (!o) setDoorzetOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Declaratie doorzetten naar collega</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Zet deze declaratie bij twijfel door naar een andere beoordelaar.
              Die ontvangt een e-mail en ziet de declaratie gemarkeerd staan; goedkeuren of afwijzen blijft daarna gewoon mogelijk.
            </p>
            <div>
              <Label>Doorzetten naar</Label>
              <Select value={doorzetNaar} onValueChange={setDoorzetNaar}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Kies een beoordelaar..." />
                </SelectTrigger>
                <SelectContent>
                  {(beoordelaars ?? []).map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.naam}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {beoordelaars && beoordelaars.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">Er zijn geen andere beoordelaars beschikbaar.</p>
              )}
            </div>
            <div>
              <Label>Toelichting (optioneel)</Label>
              <Textarea
                className="mt-1"
                value={doorzetToelichting}
                onChange={e => setDoorzetToelichting(e.target.value)}
                rows={3}
                placeholder="Bijv. graag jouw oordeel: bedrag valt buiten het beleid..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDoorzetOpen(false)} disabled={zetDoorBezig}>Annuleren</Button>
            <Button onClick={doorzetten} disabled={zetDoorBezig || !doorzetNaar}>
              {zetDoorBezig ? "Doorzetten..." : "Doorzetten"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Afwijsdialoog */}
      <Dialog open={afwijsOpen} onOpenChange={o => { if (!o) setAfwijsOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Declaratie afwijzen</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              De medewerker ontvangt een e-mail met de reden van afwijzing.
            </p>
            <div>
              <Label>Reden van afwijzing</Label>
              <Textarea
                className="mt-1"
                value={afwijzingsreden}
                onChange={e => setAfwijzingsreden(e.target.value)}
                rows={4}
                placeholder="Geef een duidelijke toelichting..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAfwijsOpen(false)} disabled={wijstAf}>Annuleren</Button>
            <Button variant="destructive" onClick={afwijzen} disabled={wijstAf || !afwijzingsreden.trim()}>
              {wijstAf ? "Afwijzen..." : "Afwijzen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verwijderdialoog */}
      <Dialog open={verwijderOpen} onOpenChange={o => { if (!o) setVerwijderOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Declaratie verwijderen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Weet u zeker dat u deze declaratie wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVerwijderOpen(false)} disabled={verwijdert}>Annuleren</Button>
            <Button variant="destructive" onClick={verwijderen} disabled={verwijdert}>
              {verwijdert ? "Verwijderen..." : "Verwijderen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
