import { useState } from "react";
import { Link, useLocation } from "wouter";
import { getGetVolgendSpotnummerQueryKey, useCreateVoorziening, useGetVolgendSpotnummer, useListGebouwen, useListVerdiepingen } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, CheckCircle } from "lucide-react";

const TYPEN = [
  { value: "branddeur", label: "Branddeur" },
  { value: "doorvoering", label: "Doorvoering" },
  { value: "brandklep", label: "Brandklep" },
  { value: "kitvoeg", label: "Kitvoeg" },
  { value: "manchet", label: "Manchet" },
  { value: "brandwerend_glas", label: "Brandwerend Glas" },
  { value: "coating", label: "Coating/Bekleding" },
  { value: "luik", label: "Luik" },
  { value: "plaatconstructie", label: "Plaatconstructie" },
  { value: "schuifdeur", label: "Schuifdeur" },
  { value: "puiconstructie", label: "Puiconstructie" },
  { value: "dakdoorvoer", label: "Dakdoorvoer" },
];

export default function VoorzieningNieuw() {
  const [, navigate] = useLocation();
  const [geslaagd, setGeslaagd] = useState(false);
  const [gebouwId, setGebouwId] = useState("");

  const [form, setForm] = useState({
    objectnummer: "",
    type: "branddeur",
    classificatie: "60",
    ruimte: "",
    locatie_omschrijving: "",
    materialen: "",
    opmerkingen: "",
    verdieping_id: "",
    installatie_datum: "",
  });

  const { data: gebouwen } = useListGebouwen();
  const { data: verdiepingen } = useListVerdiepingen(Number(gebouwId), {
    query: { enabled: !!gebouwId },
  });
  const { data: volgendSpot } = useGetVolgendSpotnummer(Number(gebouwId), {
    query: {
      enabled: !!gebouwId,
      queryKey: getGetVolgendSpotnummerQueryKey(Number(gebouwId)),
    },
  });
  const maakVoorziening = useCreateVoorziening();

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    if (!form.type || !gebouwId) return;
    await maakVoorziening.mutateAsync({
      data: {
        objectnummer: volgendSpot?.spotnummer,
        type: form.type,
        status: "concept",
        classificatie: form.classificatie,
        ruimte: form.ruimte || undefined,
        locatie_omschrijving: form.locatie_omschrijving || undefined,
        materialen: form.materialen || undefined,
        opmerkingen: form.opmerkingen || undefined,
        gebouw_id: Number(gebouwId),
        verdieping_id: form.verdieping_id ? Number(form.verdieping_id) : undefined,
        installatie_datum: form.installatie_datum || undefined,
      },
    });
    setGeslaagd(true);
  }

  if (geslaagd) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <CheckCircle className="h-14 w-14 text-green-600 mx-auto" />
        <h2 className="text-2xl font-bold">Voorziening geregistreerd</h2>
        <p className="text-muted-foreground">{volgendSpot?.spotnummer ?? "De voorziening"} is succesvol aangemaakt in het systeem.</p>
        <div className="flex justify-center gap-3 pt-2">
          <Button variant="outline" asChild><Link href="/voorzieningen">Terug naar overzicht</Link></Button>
          <Button onClick={() => { setGeslaagd(false); setForm({ objectnummer: "", type: "branddeur", classificatie: "60", ruimte: "", locatie_omschrijving: "", materialen: "", opmerkingen: "", verdieping_id: "", installatie_datum: "" }); setGebouwId(""); }}>
            Nog een registreren
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/voorzieningen">
          <Button variant="outline" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Nieuwe Voorziening</h1>
          <p className="text-muted-foreground text-sm">Registreer een nieuw brandpreventief object.</p>
        </div>
      </div>

      <form onSubmit={verstuur} className="space-y-5">
        <Card>
          <CardHeader><CardTitle className="text-base">Identificatie</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="nr">Spotnummer</Label>
              <Input
                id="nr"
                value={volgendSpot?.spotnummer ?? ""}
                readOnly
                className="bg-muted"
                placeholder={gebouwId ? "Wordt automatisch toegekend" : "Kies eerst een gebouw"}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Automatisch toegekend op basis van het gebouw.
              </p>
            </div>
            <div>
              <Label>Type *</Label>
              <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPEN.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Classificatie (EI)</Label>
              <Select value={form.classificatie} onValueChange={(v) => setForm((f) => ({ ...f, classificatie: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["30", "60", "90", "120"].map((v) => <SelectItem key={v} value={v}>EI {v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Locatie</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label>Gebouw *</Label>
              <Select value={gebouwId} onValueChange={(v) => { setGebouwId(v); setForm((f) => ({ ...f, verdieping_id: "" })); }}>
                <SelectTrigger><SelectValue placeholder="Kies gebouw" /></SelectTrigger>
                <SelectContent>
                  {gebouwen?.map((g: any) => <SelectItem key={g.id} value={String(g.id)}>{g.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Verdieping</Label>
              <Select
                value={form.verdieping_id}
                onValueChange={(v) => setForm((f) => ({ ...f, verdieping_id: v }))}
                disabled={!gebouwId}
              >
                <SelectTrigger><SelectValue placeholder="Kies verdieping" /></SelectTrigger>
                <SelectContent>
                  {verdiepingen?.map((v: any) => <SelectItem key={v.id} value={String(v.id)}>{v.naam}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ruimte">Ruimte</Label>
              <Input id="ruimte" value={form.ruimte} onChange={set("ruimte")} placeholder="Bijv. Trappenhal A" />
            </div>
            <div>
              <Label htmlFor="locatie">Locatieomschrijving</Label>
              <Input id="locatie" value={form.locatie_omschrijving} onChange={set("locatie_omschrijving")} placeholder="Bijv. Noord-oost muur" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Technische details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="mat">Toegepaste materialen</Label>
              <Input id="mat" value={form.materialen} onChange={set("materialen")} placeholder="Bijv. Hilti CP 611A brandmortel" />
            </div>
            <div>
              <Label htmlFor="inst">Installatiedatum</Label>
              <Input id="inst" type="date" value={form.installatie_datum} onChange={set("installatie_datum")} />
            </div>
            <div>
              <Label htmlFor="opm">Opmerkingen</Label>
              <Textarea id="opm" value={form.opmerkingen} onChange={set("opmerkingen")} placeholder="Optionele opmerkingen..." rows={3} />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" asChild>
            <Link href="/voorzieningen">Annuleren</Link>
          </Button>
          <Button type="submit" disabled={maakVoorziening.isPending || !gebouwId}>
            {maakVoorziening.isPending ? "Opslaan..." : "Voorziening Registreren"}
          </Button>
        </div>
      </form>
    </div>
  );
}
