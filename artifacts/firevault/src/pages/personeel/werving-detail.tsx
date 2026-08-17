// WERVING_01 — Kandidaat-detail: AI-toetsing per functie-eis (zonder oordeel
// of score), bewerkbare gespreksvragenlijst, aantekeningen en uitkomst door
// de mens.
import { useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetWervingKandidaat,
  getGetWervingKandidaatQueryKey,
  getListWervingKandidatenQueryKey,
  useUpdateWervingKandidaat,
  useDeleteWervingKandidaat,
  useBereidWervingKandidaatVoor,
  useCreateWervingVraag,
  useUpdateWervingVraag,
  useDeleteWervingVraag,
  type WervingToetsingItem,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useBevoegdheid } from "@/hooks/use-bevoegdheid";
import { useLocation } from "wouter";
import { ArrowLeft, Sparkles, FileText, Trash2, Plus } from "lucide-react";

const STATUS_OPTIES = [
  { value: "ontvangen", label: "Ontvangen" },
  { value: "uitgenodigd", label: "Uitgenodigd" },
  { value: "gesproken", label: "Gesproken" },
  { value: "afgewezen", label: "Afgewezen" },
  { value: "aangenomen", label: "Aangenomen" },
];

const CATEGORIE_LABELS: Record<string, string> = {
  taken: "Taken",
  verantwoordelijkheden: "Verantwoordelijkheden",
  competenties: "Competenties",
  opleidingsvereisten: "Opleidingsvereisten",
};

function StandBadge({ stand }: { stand: string }) {
  if (stand === "aantoonbaar_aanwezig") {
    return <Badge variant="secondary" className="text-muted-foreground">Aantoonbaar aanwezig</Badge>;
  }
  if (stand === "onduidelijk") {
    return <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-700">Onduidelijk</Badge>;
  }
  return <Badge variant="outline">Niet genoemd</Badge>;
}

const BRON_LABELS: Record<string, string> = { kern: "Kernvraag", cv: "Uit cv-toetsing", handmatig: "Handmatig" };

export default function WervingDetailPagina() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [, navigeer] = useLocation();
  const { heeftNiveau } = useBevoegdheid();
  const magSchrijven = heeftNiveau("personeel", 2);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: kandidaat, isLoading } = useGetWervingKandidaat(id, {
    query: { enabled: Number.isFinite(id), queryKey: getGetWervingKandidaatQueryKey(id) },
  });

  const bijwerk = useUpdateWervingKandidaat();
  const verwijder = useDeleteWervingKandidaat();
  const voorbereid = useBereidWervingKandidaatVoor();
  const maakVraag = useCreateWervingVraag();
  const bewerkVraag = useUpdateWervingVraag();
  const wisVraag = useDeleteWervingVraag();

  const [eindconclusie, setEindconclusie] = useState<string | null>(null);
  const [nieuweVraag, setNieuweVraag] = useState("");
  const [aantekeningen, setAantekeningen] = useState<Record<number, string>>({});

  async function ververs() {
    await queryClient.invalidateQueries({ queryKey: getGetWervingKandidaatQueryKey(id) });
    await queryClient.invalidateQueries({ queryKey: getListWervingKandidatenQueryKey() });
  }

  async function patchKandidaat(data: Record<string, unknown>, melding: string) {
    try {
      await bijwerk.mutateAsync({ id, data });
      await ververs();
      toast({ title: melding });
    } catch {
      toast({ title: "Bijwerken mislukt", variant: "destructive" });
    }
  }

  async function bereidVoor() {
    try {
      await voorbereid.mutateAsync({ id });
      await ververs();
      toast({ title: "Voorbereiding gereed", description: "Controleer de toetsing en pas de vragenlijst aan voordat u het gesprek in gaat." });
    } catch (err) {
      toast({ title: "Voorbereiden mislukt", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  if (isLoading || !kandidaat) {
    return <div className="space-y-4 p-6"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /></div>;
  }

  const toetsing = (kandidaat.toetsing ?? []) as WervingToetsingItem[];
  const perCategorie = new Map<string, WervingToetsingItem[]>();
  for (const item of toetsing) {
    const lijst = perCategorie.get(item.categorie) ?? [];
    lijst.push(item);
    perCategorie.set(item.categorie, lijst);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/personeel/werving">
            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
          <div>
            <h1 data-paginatitel className="text-2xl font-semibold">{kandidaat.naam}</h1>
            <p className="text-sm text-muted-foreground">
              {kandidaat.functie_naam ?? "Onbekende functie"} · via {kandidaat.kanaal}
              {kandidaat.email ? ` · ${kandidaat.email}` : ""}{kandidaat.telefoon ? ` · ${kandidaat.telefoon}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {kandidaat.heeft_cv && (
            <a href={`/api/werving/kandidaten/${id}/cv`} target="_blank" rel="noreferrer">
              <Button variant="outline"><FileText className="mr-2 h-4 w-4" /> Cv bekijken</Button>
            </a>
          )}
          {magSchrijven && (
            <Select value={kandidaat.status} onValueChange={(v) => patchKandidaat({ status: v }, "Status bijgewerkt")}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_OPTIES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {magSchrijven && (
            <Button variant="ghost" size="icon" onClick={async () => {
              if (!window.confirm("Kandidaat en cv-bestand definitief verwijderen?")) return;
              await verwijder.mutateAsync({ id });
              await queryClient.invalidateQueries({ queryKey: getListWervingKandidatenQueryKey() });
              navigeer("/personeel/werving");
            }}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
        <div className="flex items-center gap-2">
          <Checkbox
            id="toestemming"
            checked={kandidaat.toestemming_bewaring}
            disabled={!magSchrijven}
            onCheckedChange={(v) => patchKandidaat({ toestemming_bewaring: v === true }, "Toestemming bijgewerkt")}
          />
          <label htmlFor="toestemming">Uitdrukkelijke toestemming voor bewaring van één jaar</label>
        </div>
        <span className="text-muted-foreground">
          {kandidaat.procedure_afgerond_op
            ? `Procedure afgerond op ${new Date(kandidaat.procedure_afgerond_op).toLocaleDateString("nl-NL")} — gegevens en cv worden na ${kandidaat.toestemming_bewaring ? "één jaar" : "vier weken"} automatisch verwijderd.`
            : `Na afronding (afgewezen/aangenomen) worden gegevens en cv automatisch verwijderd: ${kandidaat.toestemming_bewaring ? "na één jaar" : "na vier weken"}.`}
        </span>
      </div>

      {/* ── AI-toetsing ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              Toetsing aan de functie
              {kandidaat.toetsing_op && (
                <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-700">
                  <Sparkles className="mr-1 h-3 w-3" /> AI-voorbereiding
                </Badge>
              )}
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Per functie-eis: aantoonbaar aanwezig (met vindplaats in het cv), niet genoemd of onduidelijk.
              De AI geeft geen oordeel of score — het gesprek en het oordeel zijn aan u.
            </p>
          </div>
          {magSchrijven && (
            <Button onClick={bereidVoor} disabled={voorbereid.isPending || !kandidaat.heeft_cv}>
              <Sparkles className="mr-2 h-4 w-4" />
              {voorbereid.isPending ? "AI leest het cv..." : kandidaat.toetsing_op ? "Opnieuw voorbereiden" : "Gesprek voorbereiden"}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!kandidaat.heeft_cv ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Geen cv aanwezig — upload een cv bij het toevoegen van de kandidaat.</p>
          ) : toetsing.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nog niet voorbereid. Klik op "Gesprek voorbereiden" om het cv aan de functie-eisen te toetsen.</p>
          ) : (
            <div className="space-y-5">
              {Array.from(perCategorie.entries()).map(([categorie, items]) => (
                <div key={categorie}>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {CATEGORIE_LABELS[categorie] ?? categorie}
                  </h3>
                  <div className="space-y-2">
                    {items.map((item, i) => (
                      <div key={i} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <span className="font-medium">{item.eis}</span>
                          <StandBadge stand={item.stand} />
                        </div>
                        {item.vindplaats && (
                          <p className="mt-1 text-sm text-muted-foreground">Vindplaats in cv: {item.vindplaats}</p>
                        )}
                        {item.toelichting && <p className="mt-1 text-sm">{item.toelichting}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Vragenlijst ── */}
      <Card>
        <CardHeader>
          <CardTitle>Gespreksvragenlijst</CardTitle>
          <p className="text-sm text-muted-foreground">
            Kernvragen zijn voor elke kandidaat op deze functie identiek. Schrap en voeg toe voordat u het gesprek in gaat; noteer per vraag een aantekening tijdens of na het gesprek.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {(kandidaat.vragen ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nog geen vragen. Bereid het gesprek voor of voeg zelf vragen toe.</p>
          ) : (
            kandidaat.vragen.map((v, idx) => (
              <div key={v.id} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="mr-2 text-sm text-muted-foreground">{idx + 1}.</span>
                    <span>{v.vraag}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {v.bron === "cv" ? (
                      <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-700">
                        <Sparkles className="mr-1 h-3 w-3" /> {BRON_LABELS[v.bron]}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-muted-foreground">{BRON_LABELS[v.bron] ?? v.bron}</Badge>
                    )}
                    {magSchrijven && (
                      <Button variant="ghost" size="icon" onClick={async () => {
                        await wisVraag.mutateAsync({ id: v.id });
                        await ververs();
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                {magSchrijven && (
                  <div className="mt-2 flex items-start gap-2">
                    <Textarea
                      placeholder="Aantekening bij deze vraag (na het gesprek)"
                      value={aantekeningen[v.id] ?? v.aantekening ?? ""}
                      onChange={(e) => setAantekeningen((s) => ({ ...s, [v.id]: e.target.value }))}
                      rows={1}
                    />
                    {(aantekeningen[v.id] ?? v.aantekening ?? "") !== (v.aantekening ?? "") && (
                      <Button size="sm" onClick={async () => {
                        await bewerkVraag.mutateAsync({ id: v.id, data: { aantekening: aantekeningen[v.id] || null } });
                        await ververs();
                        toast({ title: "Aantekening bewaard" });
                      }}>Bewaar</Button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          {magSchrijven && (
            <div className="flex items-start gap-2 pt-2">
              <Input placeholder="Eigen vraag toevoegen" value={nieuweVraag} onChange={(e) => setNieuweVraag(e.target.value)} />
              <Button variant="outline" disabled={!nieuweVraag.trim() || maakVraag.isPending} onClick={async () => {
                await maakVraag.mutateAsync({ id, data: { vraag: nieuweVraag.trim() } });
                setNieuweVraag("");
                await ververs();
              }}>
                <Plus className="mr-1 h-4 w-4" /> Toevoegen
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Uitkomst ── */}
      <Card>
        <CardHeader>
          <CardTitle>Eindconclusie</CardTitle>
          <p className="text-sm text-muted-foreground">In eigen woorden, door u vastgelegd — de AI stelt hier niets voor.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={4}
            disabled={!magSchrijven}
            placeholder="Uw conclusie na het gesprek"
            value={eindconclusie ?? kandidaat.eindconclusie ?? ""}
            onChange={(e) => setEindconclusie(e.target.value)}
          />
          {magSchrijven && (eindconclusie ?? kandidaat.eindconclusie ?? "") !== (kandidaat.eindconclusie ?? "") && (
            <Button onClick={async () => {
              await patchKandidaat({ eindconclusie: eindconclusie || null }, "Eindconclusie bewaard");
              setEindconclusie(null);
            }}>Bewaar eindconclusie</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
